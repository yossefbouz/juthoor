'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/contexts/LocaleContext';
import { insertPersonAction } from '@/data/user/persons';
import { addRelativeAction } from '@/data/user/relatives';
import { personInputSchema } from '@/lib/tree/zodSchemas';
import type { FamilyView } from '@/lib/tree/types';
import type { Person } from '@/types/database';

import { FieldHint } from './FieldHint';
import { PlaceCombobox } from './PlaceCombobox';
import {
  RelationshipPicker,
  type RelationshipKind,
  type RelationshipState,
} from './RelationshipPicker';

/** Sentinel for "the mother is a new unknown woman" in the mother select. */
const NEW_PLACEHOLDER_MOTHER = '__new_placeholder_mother__';

interface Props {
  readonly treeId: string;
  /**
   * 'self' is the onboarding first-person wizard; 'general' is the
   * regular Add Person flow from inside the tree.
   */
  readonly mode: 'self' | 'general';
  /** Existing persons in the tree — drives the relationship anchor picker. */
  readonly persons: readonly Person[];
  /**
   * Family rows of the tree — used to resolve the mother when adding a
   * child to a father with recorded spouses (FRS multi-spouse rule).
   * Optional: without it the server still auto-resolves 0/1-spouse cases.
   */
  readonly families?: readonly FamilyView[];
  /** Pre-fill from URL — e.g. when navigating from a 360° "Add child" CTA. */
  readonly initialAnchorPersonId?: string | null;
  readonly initialRelationshipKind?: RelationshipKind;
  /**
   * When set, the form skips its default `router.push(...)` after a
   * successful save and calls this callback instead. Lets a host (e.g.
   * the inline Sheet on the tree page) close itself and refresh in
   * place without navigating away from the chart.
   */
  readonly onSuccess?: (
    personId: string,
    relationshipKind: RelationshipKind,
  ) => void;
}

type FormValues = z.infer<typeof personInputSchema>;

export function AddPersonForm({
  treeId,
  mode,
  persons,
  families,
  initialAnchorPersonId,
  initialRelationshipKind,
  onSuccess,
}: Props) {
  const { t, dir, locale } = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialKind: RelationshipKind =
    initialRelationshipKind ?? (mode === 'self' ? 'self' : 'unrelated');

  const [relationship, setRelationship] = useState<RelationshipState>({
    kind: initialKind,
    anchorPersonId: initialAnchorPersonId ?? null,
  });
  const [motherChoice, setMotherChoice] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(personInputSchema) as Resolver<FormValues>,
    defaultValues: {
      treeId,
      gender: 'M',
      arGivenName: '',
      arSurname: '',
      enGivenName: '',
      enSurname: '',
    },
  });

  // Watch the name fields so the relationship preview updates live.
  const watchedAr = form.watch('arGivenName');
  const watchedEn = form.watch('enGivenName');
  const draftDisplayName =
    [watchedAr, form.watch('arSurname')].filter(Boolean).join(' ').trim()
    || [watchedEn, form.watch('enSurname')].filter(Boolean).join(' ').trim();

  const anchor =
    persons.find((p) => p.id === relationship.anchorPersonId) ?? null;

  // Recorded spouses of a male anchor — drives the mother select when
  // adding a child (FRS: every child must be linked to a mother, and a
  // multi-spouse father's children must link to one of HIS partners).
  const anchorSpouses = useMemo(() => {
    if (
      relationship.kind !== 'child' ||
      !anchor ||
      anchor.gender !== 'M' ||
      !families
    ) {
      return [] as readonly Person[];
    }
    const spouseIds = families
      .filter(
        (f) => f.partner1Id === anchor.id || f.partner2Id === anchor.id
      )
      .map((f) => (f.partner1Id === anchor.id ? f.partner2Id : f.partner1Id))
      .filter((id): id is string => Boolean(id));
    return spouseIds
      .map((id) => persons.find((p) => p.id === id))
      .filter((p): p is Person => Boolean(p));
  }, [relationship.kind, anchor, families, persons]);

  const showMotherSelect = anchorSpouses.length > 0;
  const effectiveMotherChoice =
    motherChoice ?? (anchorSpouses.length === 1 ? anchorSpouses[0].id : null);

  function handleSubmit(values: FormValues) {
    // Block save when a relationship was picked but no anchor was chosen.
    const needsAnchor =
      relationship.kind === 'child' ||
      relationship.kind === 'parent' ||
      relationship.kind === 'spouse' ||
      relationship.kind === 'sibling';
    if (needsAnchor && !relationship.anchorPersonId) {
      toast.error(
        t('اختر الشخص المرتبط أولًا، أو اختر "لا رابط بعد".', 'Pick the related person first, or choose "No link yet".'),
      );
      return;
    }
    if (showMotherSelect && !effectiveMotherChoice) {
      toast.error(t('حدّد الأم من القائمة — لكل ابن/ابنة أم.', 'Select the mother from the list — every child needs one.'));
      return;
    }

    startTransition(async () => {
      // One round-trip: person + relationship link are created together
      // (server rolls the person back if the link fails). Self/unrelated
      // have no link, so plain insert is enough.
      const result =
        needsAnchor && relationship.anchorPersonId
          ? await addRelativeAction({
              ...values,
              anchorPersonId: relationship.anchorPersonId,
              kind: relationship.kind as
                | 'child'
                | 'parent'
                | 'spouse'
                | 'sibling',
              ...(showMotherSelect && effectiveMotherChoice
                ? effectiveMotherChoice === NEW_PLACEHOLDER_MOTHER
                  ? { newPlaceholderMother: true }
                  : { motherId: effectiveMotherChoice }
                : {}),
            })
          : await insertPersonAction(values);

      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }

      const personId = result?.data?.personId;
      if (!personId) {
        toast.error(t('لم يتم إنشاء الشخص. يرجى المحاولة مرة أخرى.', 'The person wasn’t created. Please try again.'));
        return;
      }

      toast.success(
        mode === 'self'
          ? t('تم إنشاء ملفك الشخصي في الشجرة!', 'Your profile was created in the tree!')
          : needsAnchor
            ? t('تمت إضافة الشخص وربطه بالشجرة', 'The person was added and linked to the tree')
            : t('تمت إضافة الشخص بنجاح', 'The person was added successfully')
      );

      // When the host (e.g. inline Sheet on the tree page) wants to
      // handle post-save itself — close, refresh, scroll, etc. — we
      // hand off and bail out of the default route push.
      if (onSuccess) {
        onSuccess(personId, relationship.kind);
        return;
      }

      // Land back on the chart with the new person selected, so the
      // user SEES the link that was just created.
      router.push(`/tree/${treeId}?selected=${personId}`);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid gap-6"
        dir={dir}
      >
        {/* === Relationship picker — visible by design === */}
        <RelationshipPicker
          persons={persons}
          value={relationship}
          onChange={setRelationship}
          draftDisplayName={draftDisplayName || undefined}
          locale={locale}
        />

        {/* === Mother resolution (FRS: every child links to a mother) === */}
        {showMotherSelect ? (
          <section className="rounded-2xl border border-[var(--jt-terra-200)]/70 bg-[var(--jt-terra-50)]/50 p-4">
            <label className="mb-2 block text-xs font-semibold text-[var(--jt-terra-700)]">
              {t('من هي الأم؟', 'Who is the mother?')}{' '}
              {anchorSpouses.length > 1 ? t('(الأب لديه أكثر من زوجة مسجّلة)', '(the father has more than one recorded spouse)') : ''}
            </label>
            <Select
              value={effectiveMotherChoice ?? undefined}
              onValueChange={(v) => setMotherChoice(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('اختر الأم', 'Select the mother')} />
              </SelectTrigger>
              <SelectContent>
                {anchorSpouses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {locale === 'ar'
                      ? s.display_name_ar ?? s.display_name_en ?? '—'
                      : s.display_name_en ?? s.display_name_ar ?? '—'}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_PLACEHOLDER_MOTHER}>
                  {t('أم أخرى غير معروفة — أنشئ أمًا مؤقتة', 'Another unknown mother — create a placeholder')}
                </SelectItem>
              </SelectContent>
            </Select>
          </section>
        ) : relationship.kind === 'child' && anchor?.gender === 'M' ? (
          <p className="rounded-2xl border border-[var(--jt-gold-400)]/40 bg-[var(--jt-gold-100)]/40 px-4 py-3 text-xs leading-relaxed text-[var(--jt-stone-700)]">
            {t(
              'لا توجد زوجة مسجّلة لهذا الأب — سيتم إنشاء أم مؤقتة («أنثى ١») تلقائيًا وربطها به، ويمكنك إكمال بياناتها لاحقًا.',
              'This father has no recorded spouse — a placeholder mother ("Female 1") will be created and linked automatically; you can fill in her details later.',
            )}
          </p>
        ) : null}

        {/* === Person details === */}
        <section className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 md:p-6 shadow-[var(--jt-shadow-sm)]">
          <header className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-olive-700)]">
              {t('بيانات الشخص', 'Person details')}
            </p>
            <h2
              className="text-xl font-bold text-[var(--jt-olive-900)]"
              style={{ fontFamily: 'var(--jt-font-display)' }}
            >
              {t('الاسم والمولد', 'Name and birth')}
            </h2>
          </header>

          {/* Arabic name row */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="arGivenName"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('الاسم الأول (بالعربية)', 'First name (Arabic)')}</FormLabel>
                    <FieldHint fieldKey="arGivenName" />
                  </div>
                  <FormControl>
                    <Input
                      dir="rtl"
                      placeholder="أحمد"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="arSurname"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('اسم العائلة (بالعربية)', 'Surname (Arabic)')}</FormLabel>
                    <FieldHint fieldKey="arSurname" />
                  </div>
                  <FormControl>
                    <Input
                      dir="rtl"
                      placeholder="البوز"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* English name row */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="enGivenName"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('الاسم الأول (بالإنجليزية)', 'First name (English)')}</FormLabel>
                    <FieldHint fieldKey="enGivenName" />
                  </div>
                  <FormControl>
                    <Input
                      dir="ltr"
                      placeholder="Ahmad"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enSurname"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('اسم العائلة (بالإنجليزية)', 'Surname (English)')}</FormLabel>
                    <FieldHint fieldKey="enSurname" />
                  </div>
                  <FormControl>
                    <Input
                      dir="ltr"
                      placeholder="Bouz"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Gender + years row */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('الجنس', 'Gender')}</FormLabel>
                    <FieldHint fieldKey="gender" />
                  </div>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('اختر', 'Select')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="M">{t('ذكر', 'Male')}</SelectItem>
                      <SelectItem value="F">{t('أنثى', 'Female')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="birthYear"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('سنة الميلاد', 'Birth year')}</FormLabel>
                    <FieldHint fieldKey="birthYear" />
                  </div>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="1950"
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === ''
                            ? undefined
                            : Number(e.target.value)
                        )
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="deathYear"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('سنة الوفاة', 'Death year')}</FormLabel>
                    <FieldHint fieldKey="deathYear" />
                  </div>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="—"
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === ''
                            ? undefined
                            : Number(e.target.value)
                        )
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Village */}
          <div className="mt-4">
            <FormField
              control={form.control}
              name="placeOfOriginId"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('القرية / المدينة الأصلية', 'Village / town of origin')}</FormLabel>
                    <FieldHint fieldKey="placeOfOrigin" />
                  </div>
                  <FormControl>
                    <PlaceCombobox
                      value={field.value ?? null}
                      onChange={(placeId) => field.onChange(placeId ?? undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={isPending}
          >
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ ومتابعة', 'Save and continue')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
