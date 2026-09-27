'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';
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
import { addChildAction } from '@/data/user/families';
import { insertPersonAction } from '@/data/user/persons';
import { insertPlaceholderMotherAction } from '@/data/user/persons';
import type { Person } from '@/types/database';

import { PersonSelect } from './PersonSelect';
import { FieldHint } from './FieldHint';

function makeAddChildFormSchema(t: (ar: string, en: string) => string) {
  return z
    .object({
      treeId: z.string().uuid(),
      fatherId: z.string().uuid(),
      motherId: z.string().uuid().nullable(),
      arGivenName: z.string().trim().min(1, t('الاسم الأول مطلوب', 'First name is required')),
      arSurname: z.string().optional(),
      gender: z.enum(['M', 'F']),
      birthYear: z
        .preprocess(
          (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
          z.number().int().gte(1000).lte(new Date().getUTCFullYear()).optional()
        ),
    })
    // FRS rule 11: every child must have a mother. If the user hasn't
    // picked one we auto-create a placeholder during submit instead of
    // blocking the form — but we expose that as an explicit "use placeholder"
    // checkbox so it's never accidental.
    .extend({
      useMotherPlaceholder: z.boolean().default(false),
    })
    .refine(
      (v) => v.motherId !== null || v.useMotherPlaceholder === true,
      {
        message: t(
          'يجب ربط كل ابن بأم. إذا لم تعرف الأم، فعّل "أم مؤقتة".',
          'Every child must be linked to a mother. If unknown, enable "placeholder mother".',
        ),
        path: ['motherId'],
      }
    );
}

type FormValues = z.infer<ReturnType<typeof makeAddChildFormSchema>>;

interface Props {
  readonly treeId: string;
  readonly fatherId: string;
  readonly persons: readonly Person[];
  readonly onSuccess?: () => void;
}

/**
 * Inline "Add Child" form launched from a father's person page.
 *
 * Enforces FRS rule 11 at the schema level (motherId required OR the
 * user explicitly opts into "Female N" placeholder). For multi-spouse
 * fathers, the mother combobox is filtered to existing F persons in
 * the tree so the user picks the correct wife.
 */
export function AddChildForm({
  treeId,
  fatherId,
  persons,
  onSuccess,
}: Props) {
  const { t, dir } = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const addChildFormSchema = useMemo(() => makeAddChildFormSchema(t), [t]);

  const form = useForm<FormValues>({
    // Cast: preprocess/default fields give the schema a wider input type
    // than its output; runtime validation is exactly FormValues-shaped.
    resolver: zodResolver(addChildFormSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      treeId,
      fatherId,
      motherId: null,
      useMotherPlaceholder: false,
      gender: 'M',
      arGivenName: '',
      arSurname: '',
    },
  });

  const useMotherPlaceholder = form.watch('useMotherPlaceholder');

  function handleSubmit(values: FormValues) {
    startTransition(async () => {
      // Step 1: resolve motherId — create placeholder if needed.
      let motherId = values.motherId;
      if (motherId === null && values.useMotherPlaceholder) {
        const placeholder = await insertPlaceholderMotherAction({
          treeId: values.treeId,
          fatherId: values.fatherId,
        });
        if (placeholder?.serverError || !placeholder?.data?.placeholderId) {
          toast.error(
            placeholder?.serverError ?? t('فشل إنشاء الأم المؤقتة', 'Failed to create the placeholder mother')
          );
          return;
        }
        motherId = placeholder.data.placeholderId;
      }
      if (!motherId) {
        toast.error(t('يجب تحديد الأم', 'The mother must be selected'));
        return;
      }

      // Step 2: create the child person.
      const personResult = await insertPersonAction({
        treeId: values.treeId,
        gender: values.gender,
        arGivenName: values.arGivenName,
        arSurname: values.arSurname || undefined,
        birthYear: values.birthYear,
      });
      if (personResult?.serverError || !personResult?.data?.personId) {
        toast.error(personResult?.serverError ?? t('فشل إضافة الابن', 'Failed to add the child'));
        return;
      }

      // Step 3: link the child to the father+mother family.
      const link = await addChildAction({
        treeId: values.treeId,
        childId: personResult.data.personId,
        fatherId: values.fatherId,
        motherId,
        pedigree: 'birth',
      });
      if (link?.serverError) {
        toast.error(link.serverError);
        return;
      }

      toast.success(t('تم إضافة الابن/الابنة بنجاح', 'The child was added successfully'));
      form.reset();
      onSuccess?.();
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid gap-4 rounded-lg border p-4"
        dir={dir}
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
                  <Input dir="rtl" placeholder="سامي" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="motherId"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormLabel>{t('الأم', 'Mother')}</FormLabel>
                  <FieldHint fieldKey="gender" />
                </div>
                <FormControl>
                  <PersonSelect
                    value={field.value}
                    onChange={(id) => {
                      field.onChange(id);
                      if (id) {
                        form.setValue('useMotherPlaceholder', false);
                      }
                    }}
                    persons={persons}
                    filterGender="F"
                    placeholder={t('اختر الأم', 'Select the mother')}
                  />
                </FormControl>
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
                    placeholder="1980"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="useMotherPlaceholder"
          render={({ field }) => (
            <label className="flex items-start gap-2 rounded border border-dashed border-amber-500/60 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20">
              <input
                type="checkbox"
                className="mt-1"
                checked={field.value}
                onChange={(e) => {
                  field.onChange(e.target.checked);
                  if (e.target.checked) {
                    form.setValue('motherId', null);
                  }
                }}
                disabled={form.watch('motherId') !== null}
              />
              <span>
                <strong>{t('أم مؤقتة', 'Placeholder mother')}</strong> —{' '}
                {t(
                  'لا أعرف الأم الآن. سيُنشئ النظام سجلًا مؤقتًا ("أنثى N") يمكن تحديثه لاحقًا.',
                  'I don\'t know the mother yet. The system will create a placeholder record ("Female N") that can be updated later.',
                )}
              </span>
            </label>
          )}
        />

        <div className="flex items-center justify-end gap-2">
          <Button
            type="submit"
            disabled={isPending}
          >
            {isPending
              ? t('جارٍ الحفظ…', 'Saving…')
              : useMotherPlaceholder
                ? t('حفظ مع أم مؤقتة', 'Save with placeholder mother')
                : t('حفظ', 'Save')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
