'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Sparkles, Users } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  upgradePlaceholderPersonAction,
  deletePersonAction,
} from '@/data/user/persons';
import { removeChildAction } from '@/data/user/families';
import type { Person } from '@/types/database';

import { FieldHint } from './FieldHint';
import { PlaceCombobox } from './PlaceCombobox';

function makeFormSchema(t: (ar: string, en: string) => string) {
  return z
    .object({
      arGivenName: z.string().trim().max(100).optional(),
      arSurname: z.string().trim().max(100).optional(),
      enGivenName: z.string().trim().max(100).optional(),
      enSurname: z.string().trim().max(100).optional(),
      gender: z.enum(['M', 'F']),
      birthYear: z.number().int().optional(),
      deathYear: z.number().int().optional(),
      placeOfOriginId: z.string().uuid().optional(),
    })
    .refine(
      (v) => Boolean(v.arGivenName) || Boolean(v.enGivenName),
      { path: ['arGivenName'], message: t('الاسم الأول مطلوب', 'First name is required') }
    );
}

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

interface Props {
  readonly treeId: string;
  readonly placeholder: Person;
  readonly allPersons: readonly Person[];
}

/**
 * Dialog that turns a placeholder person (e.g. "Female 1") into a
 * real one. On success, surfaces existing children linked through
 * the placeholder so the user can confirm — or unlink any that
 * shouldn't belong to her (multi-spouse cleanup).
 */
export function UpgradePlaceholderDialog({
  treeId,
  placeholder,
  allPersons,
}: Props) {
  const { t, dir, locale } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [affectedChildren, setAffectedChildren] = useState<
    readonly { id: string; familyId: string }[]
  >([]);
  const [phase, setPhase] = useState<'edit' | 'confirm'>('edit');

  const formSchema = useMemo(() => makeFormSchema(t), [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { gender: placeholder.gender === 'F' ? 'F' : 'M' },
  });

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await upgradePlaceholderPersonAction({
        placeholderId: placeholder.id,
        treeId,
        ...values,
      });
      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
      const children = result?.data?.affectedChildren ?? [];
      setAffectedChildren(children);
      toast.success(t('تمّ تحديث بيانات الشخص', 'The person\'s details were updated'));
      if (children.length > 0) {
        setPhase('confirm');
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  const handleUnlink = (childId: string, familyId: string) => {
    startTransition(async () => {
      const result = await removeChildAction({ childId, familyId });
      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
      setAffectedChildren((prev) =>
        prev.filter((c) => c.id !== childId)
      );
      toast.success(t('تمّ فك الرابطة', 'The link was removed'));
    });
  };

  const handleDone = () => {
    setOpen(false);
    setPhase('edit');
    router.refresh();
  };

  const childrenResolved = affectedChildren.map((c) => ({
    ...c,
    person: allPersons.find((p) => p.id === c.id),
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" /> {t('تحويل إلى شخص حقيقي', 'Convert to a real person')}
        </Button>
      </DialogTrigger>

      <DialogContent dir={dir} className="max-w-xl">
        {phase === 'edit' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('ترقية الشخص المؤقّت', 'Upgrade the placeholder person')}</DialogTitle>
              <DialogDescription>
                {t(
                  'أدخل بيانات هذا الشخص الحقيقية. سيتم تحديث الرابطات القائمة دون فقدان الأبناء.',
                  'Enter this person\'s real details. Existing links will be updated without losing any children.',
                )}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid gap-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="arGivenName"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel>{t('الاسم الأول', 'First name')}</FormLabel>
                          <FieldHint fieldKey="arGivenName" />
                        </div>
                        <FormControl>
                          <Input dir="rtl" {...field} value={field.value ?? ''} />
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
                          <FormLabel>{t('اسم العائلة (للمرأة: اسم الميلاد)', 'Surname (for women: maiden name)')}</FormLabel>
                          <FieldHint fieldKey="arSurname" />
                        </div>
                        <FormControl>
                          <Input dir="rtl" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('الجنس', 'Gender')}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
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
                        <FormLabel>{t('سنة الميلاد', 'Birth year')}</FormLabel>
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
                        <FormLabel>{t('سنة الوفاة', 'Death year')}</FormLabel>
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
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="placeOfOriginId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('القرية / المدينة الأصلية', 'Village / town of origin')}</FormLabel>
                      <FormControl>
                        <PlaceCombobox
                          value={field.value ?? null}
                          onChange={(v) => field.onChange(v ?? undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    disabled={isPending}
                  >
                    {t('إلغاء', 'Cancel')}
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الترقية', 'Save upgrade')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {t('راجع الأبناء المرتبطين', 'Review the linked children')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'هؤلاء الأبناء مرتبطون بهذه الأم. أبقِهم إن كانوا أبناءها فعلاً، أو افصل الرابطة عمّن لا ينتمي إليها.',
                  'These children are linked to this mother. Keep them if they really are hers, or unlink any that don\'t belong to her.',
                )}
              </DialogDescription>
            </DialogHeader>

            {childrenResolved.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('تمّت مراجعة جميع الأبناء.', 'All children have been reviewed.')}
              </p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {childrenResolved.map((c) => {
                  const childPrimaryName =
                    (locale === 'ar'
                      ? c.person?.display_name_ar ?? c.person?.display_name_en
                      : c.person?.display_name_en ?? c.person?.display_name_ar)
                    ?? '—';
                  const childSecondaryName =
                    locale === 'ar' ? c.person?.display_name_en : c.person?.display_name_ar;
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {childPrimaryName}
                        </div>
                        {c.person?.display_name_en &&
                        c.person?.display_name_ar ? (
                          <div
                            className="truncate text-xs text-muted-foreground"
                            dir={locale === 'ar' ? 'ltr' : 'rtl'}
                          >
                            {childSecondaryName}
                          </div>
                        ) : null}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleUnlink(c.id, c.familyId)}
                      >
                        {t('فكّ الرابطة', 'Unlink')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <DialogFooter>
              <Button onClick={handleDone} disabled={isPending}>
                {t('انتهيت', 'Done')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Keep deletePersonAction import side-effect-free (may be used later).
void deletePersonAction;
