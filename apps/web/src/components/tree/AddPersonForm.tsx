'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from 'react';
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
import {
  getAttachmentUploadTarget,
  recordAttachment,
} from '@/data/user/attachments';
import { upsertPersonIdentifier } from '@/data/user/personIdentifiers';
import {
  getInheritanceDefaultsAction,
  getPersonPrimaryNamesAction,
  insertPersonAction,
} from '@/data/user/persons';
import { addRelativeAction } from '@/data/user/relatives';
import { personInputSchema } from '@/lib/tree/zodSchemas';
import type { FamilyView } from '@/lib/tree/types';
import type { Person } from '@/types/database';

import { toEnglishPhonetic } from '@/lib/search/phonetic';

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
  const [unrwaCardFile, setUnrwaCardFile] = useState<File | null>(null);
  /** Last EN values we auto-filled from Arabic — do not overwrite user-typed EN. */
  const autoFilledEnGivenRef = useRef<string | null>(null);
  const autoFilledEnSurnameRef = useRef<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(personInputSchema) as Resolver<FormValues>,
    defaultValues: {
      treeId,
      gender: 'M',
      arGivenName: '',
      arSurname: '',
      enGivenName: '',
      enSurname: '',
      fatherGivenAr: '',
      fatherSurnameAr: '',
      motherGivenAr: '',
      motherMaidenAr: '',
      fatherGivenEn: '',
      fatherSurnameEn: '',
      motherGivenEn: '',
      motherMaidenEn: '',
      unrwaRegistrationNumber: '',
      familyCard1948Number: '',
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

  // R4: when adding a child, pre-fill blank surname/origin from the father.
  const fatherIdForDefaults = useMemo(() => {
    if (relationship.kind !== 'child' || !anchor) return null;
    if (anchor.gender === 'M') return anchor.id;
    if (anchorSpouses.length === 1) return anchorSpouses[0].id;
    return null;
  }, [relationship.kind, anchor, anchorSpouses]);

  const appliedFatherRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fatherIdForDefaults) {
      appliedFatherRef.current = null;
      return;
    }
    if (appliedFatherRef.current === fatherIdForDefaults) return;
    let cancelled = false;
    void (async () => {
      const result = await getInheritanceDefaultsAction({
        fatherId: fatherIdForDefaults,
      });
      if (cancelled || result?.serverError || !result?.data) return;
      const defaults = result.data;
      appliedFatherRef.current = fatherIdForDefaults;
      const cur = form.getValues();
      if (!cur.arSurname?.trim() && defaults.arSurname) {
        form.setValue('arSurname', defaults.arSurname);
      }
      if (!cur.enSurname?.trim() && defaults.enSurname) {
        form.setValue('enSurname', defaults.enSurname);
      }
      if (!cur.placeOfOriginId && defaults.placeOfOriginId) {
        form.setValue('placeOfOriginId', defaults.placeOfOriginId);
      }
      if (!cur.fatherGivenAr?.trim() && defaults.arGivenName) {
        form.setValue('fatherGivenAr', defaults.arGivenName);
      }
      if (!cur.fatherSurnameAr?.trim() && defaults.arSurname) {
        form.setValue('fatherSurnameAr', defaults.arSurname);
      }
      if (!cur.fatherGivenEn?.trim() && defaults.enGivenName) {
        form.setValue('fatherGivenEn', defaults.enGivenName);
      }
      if (!cur.fatherSurnameEn?.trim() && defaults.enSurname) {
        form.setValue('fatherSurnameEn', defaults.enSurname);
      }
    })();
    return () => {
      cancelled = true;
    };
    // form methods are stable; omit form from deps to avoid re-fetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fatherIdForDefaults]);

  // Prefill mother R10 fields from the selected spouse / mother.
  const appliedMotherRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !effectiveMotherChoice ||
      effectiveMotherChoice === NEW_PLACEHOLDER_MOTHER
    ) {
      appliedMotherRef.current = null;
      return;
    }
    if (appliedMotherRef.current === effectiveMotherChoice) return;
    let cancelled = false;
    void (async () => {
      const result = await getPersonPrimaryNamesAction({
        personId: effectiveMotherChoice,
      });
      if (cancelled || result?.serverError || !result?.data) return;
      appliedMotherRef.current = effectiveMotherChoice;
      const names = result.data;
      const cur = form.getValues();
      if (!cur.motherGivenAr?.trim() && names.arGiven) {
        form.setValue('motherGivenAr', names.arGiven);
      }
      if (!cur.motherMaidenAr?.trim() && names.arSurname) {
        form.setValue('motherMaidenAr', names.arSurname);
      }
      if (!cur.motherGivenEn?.trim() && names.enGiven) {
        form.setValue('motherGivenEn', names.enGiven);
      }
      if (!cur.motherMaidenEn?.trim() && names.enSurname) {
        form.setValue('motherMaidenEn', names.enSurname);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMotherChoice]);

  function syncEnFromArabic(
    arValue: string,
    enField: 'enGivenName' | 'enSurname',
    autoRef: MutableRefObject<string | null>,
  ) {
    const currentEn = form.getValues(enField) ?? '';
    const lastAuto = autoRef.current;
    if (currentEn.trim() && currentEn !== lastAuto) return;
    const phonetic = toEnglishPhonetic(arValue);
    form.setValue(enField, phonetic, { shouldDirty: true });
    autoRef.current = phonetic;
  }

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
          : await insertPersonAction({
              ...values,
              linkAsSelf: mode === 'self',
            });

      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }

      const personId = result?.data?.personId;
      if (!personId) {
        toast.error(t('لم يتم إنشاء الشخص. يرجى المحاولة مرة أخرى.', 'The person wasn’t created. Please try again.'));
        return;
      }

      // Optional D8 identifiers (after create so attachments can target person_id).
      const unrwa = values.unrwaRegistrationNumber?.trim();
      const familyCard = values.familyCard1948Number?.trim();
      if (unrwa || familyCard) {
        try {
          if (unrwa) {
            if (!unrwaCardFile) {
              toast.error(
                t(
                  'رقم الأونروا يتطلب رفع صورة البطاقة.',
                  'UNRWA number requires an uploaded card file.',
                ),
              );
            } else {
              const evidenceId = await uploadIdentifierCard({
                treeId,
                personId,
                file: unrwaCardFile,
              });
              await upsertPersonIdentifier({
                personId,
                idType: 'unrwa_registration',
                idValue: unrwa,
                evidenceAttachmentId: evidenceId,
              });
            }
          }
          if (familyCard) {
            await upsertPersonIdentifier({
              personId,
              idType: 'family_card_1948',
              idValue: familyCard,
            });
          }
        } catch (e) {
          toast.error(
            e instanceof Error
              ? e.message
              : t('تعذّر حفظ المعرّفات', 'Could not save identifiers'),
          );
        }
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
                      onChange={(e) => {
                        field.onChange(e);
                        syncEnFromArabic(
                          e.target.value,
                          'enGivenName',
                          autoFilledEnGivenRef,
                        );
                      }}
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
                      onChange={(e) => {
                        field.onChange(e);
                        syncEnFromArabic(
                          e.target.value,
                          'enSurname',
                          autoFilledEnSurnameRef,
                        );
                      }}
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

          {/* R10 parent names */}
          <div className="mt-6 border-t border-[var(--jt-stone-200)] pt-5">
            <p className="mb-3 text-xs font-semibold text-[var(--jt-olive-700)]">
              {t('أسماء الوالدين (إلزامية — غير معروف إن تُركت فارغة)', 'Parent names (mandatory — Unknown if left blank)')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="fatherGivenAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('اسم الأب الأول (ع)', 'Father first (AR)')}</FormLabel>
                    <FormControl>
                      <Input dir="rtl" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fatherSurnameAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('عائلة الأب (ع)', 'Father family (AR)')}</FormLabel>
                    <FormControl>
                      <Input dir="rtl" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="motherGivenAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('اسم الأم الأول (ع)', 'Mother first (AR)')}</FormLabel>
                    <FormControl>
                      <Input dir="rtl" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="motherMaidenAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('اسم الأم قبل الزواج (ع)', 'Mother maiden (AR)')}</FormLabel>
                    <FormControl>
                      <Input dir="rtl" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fatherGivenEn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('اسم الأب الأول (En)', 'Father first (EN)')}</FormLabel>
                    <FormControl>
                      <Input dir="ltr" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fatherSurnameEn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('عائلة الأب (En)', 'Father family (EN)')}</FormLabel>
                    <FormControl>
                      <Input dir="ltr" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="motherGivenEn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('اسم الأم الأول (En)', 'Mother first (EN)')}</FormLabel>
                    <FormControl>
                      <Input dir="ltr" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="motherMaidenEn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('اسم الأم قبل الزواج (En)', 'Mother maiden (EN)')}</FormLabel>
                    <FormControl>
                      <Input dir="ltr" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </section>

        {/* Optional D8 identifiers */}
        <section className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 md:p-6 shadow-[var(--jt-shadow-sm)]">
          <header className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-olive-700)]">
              {t('اختياري', 'Optional')}
            </p>
            <h2
              className="text-xl font-bold text-[var(--jt-olive-900)]"
              style={{ fontFamily: 'var(--jt-font-display)' }}
            >
              {t('معرّفات المطابقة', 'Match identifiers')}
            </h2>
            <p className="mt-1 text-xs text-[var(--jt-stone-500)]">
              {t(
                'رقم الأونروا يتطلب رفع صورة البطاقة. بطاقة العائلة 1948 لا تحتاج مرفقًا.',
                'UNRWA number requires an uploaded card. 1948 family card does not.',
              )}
            </p>
          </header>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="unrwaRegistrationNumber"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('رقم تسجيل الأونروا', 'UNRWA registration #')}</FormLabel>
                    <FieldHint fieldKey="unrwaNumber" />
                  </div>
                  <FormControl>
                    <Input value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="familyCard1948Number"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>{t('رقم بطاقة العائلة 1948', '1948 family card #')}</FormLabel>
                    <FieldHint fieldKey="familyCard1948" />
                  </div>
                  <FormControl>
                    <Input value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="sm:col-span-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  {t('بطاقة الأونروا (ملف)', 'UNRWA card (file)')}
                </span>
                <Input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/*,application/pdf"
                  onChange={(e) => setUnrwaCardFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
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

async function uploadIdentifierCard(input: {
  treeId: string;
  personId: string;
  file: File;
}): Promise<string> {
  const ext = input.file.name.split('.').pop() ?? 'bin';
  const kind = /\.pdf$/i.test(input.file.name) ? 'document' : 'photo';
  const { path, token } = await getAttachmentUploadTarget({
    treeId: input.treeId,
    personId: input.personId,
    fileExtension: ext,
    kind,
  });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Storage is not configured');
  const browser = createClient(url, key);
  const { error } = await browser.storage
    .from('person-attachments')
    .uploadToSignedUrl(path, token, input.file);
  if (error) throw new Error(error.message);
  try {
    const recorded = await recordAttachment({
      personId: input.personId,
      treeId: input.treeId,
      kind,
      tag: 'id_card',
      storagePath: path,
      mimeType:
        input.file.type ||
        (kind === 'photo' ? 'image/jpeg' : 'application/pdf'),
      sizeBytes: input.file.size,
      title: 'UNRWA registration card',
      openMessageThread: false,
    });
    return recorded.id;
  } catch (insertErr) {
    await browser.storage.from('person-attachments').remove([path]).catch(() => undefined);
    throw insertErr;
  }
}
