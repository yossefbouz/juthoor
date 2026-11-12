'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/contexts/LocaleContext';
import { addRelativeAction } from '@/data/user/relatives';
import { getInheritanceDefaultsAction } from '@/data/user/persons';
import type { Person } from '@/types/database';

import { FieldHint } from './FieldHint';
import { PersonSelect } from './PersonSelect';
import { PlaceCombobox } from './PlaceCombobox';

type ChildRow = {
  readonly key: string;
  arGivenName: string;
  gender: 'M' | 'F';
  arSurname: string;
  motherId: string | null;
  placeOfOriginId: string | null;
  birthYear: string;
};

function emptyRow(key: string, defaults: { arSurname: string; placeOfOriginId: string | null }): ChildRow {
  return {
    key,
    arGivenName: '',
    gender: 'M',
    arSurname: defaults.arSurname,
    motherId: null,
    placeOfOriginId: defaults.placeOfOriginId,
    birthYear: '',
  };
}

interface Props {
  readonly treeId: string;
  readonly fatherId: string;
  readonly persons: readonly Person[];
  readonly onSuccess?: () => void;
}

/**
 * Tabular multi-child entry — several siblings in one submit. Each row
 * becomes a child of `fatherId` via `addRelativeAction`.
 */
export function AddChildrenTable({
  treeId,
  fatherId,
  persons,
  onSuccess,
}: Props) {
  const { t, dir } = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [defaults, setDefaults] = useState({ arSurname: '', placeOfOriginId: null as string | null });
  const [rows, setRows] = useState<ChildRow[]>([emptyRow('0', { arSurname: '', placeOfOriginId: null })]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getInheritanceDefaultsAction({ fatherId });
      if (cancelled || result?.serverError || !result?.data) return;
      const next = {
        arSurname: result.data.arSurname ?? '',
        placeOfOriginId: result.data.placeOfOriginId ?? null,
      };
      setDefaults(next);
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          arSurname: row.arSurname.trim() ? row.arSurname : next.arSurname,
          placeOfOriginId: row.placeOfOriginId ?? next.placeOfOriginId,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [fatherId]);

  function updateRow(key: string, patch: Partial<ChildRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(String(Date.now()), defaults)]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  function handleSubmit() {
    const filled = rows.filter((r) => r.arGivenName.trim());
    if (filled.length === 0) {
      toast.error(t('أدخل اسمًا واحدًا على الأقل', 'Enter at least one given name'));
      return;
    }
    const missingMother = filled.find((r) => !r.motherId);
    if (missingMother) {
      toast.error(
        t('يجب تحديد الأم لكل صف', 'Select a mother for every row'),
      );
      return;
    }

    startTransition(async () => {
      let created = 0;
      for (const row of filled) {
        const yearRaw = row.birthYear.trim();
        const birthYear =
          yearRaw === '' ? undefined : Number.parseInt(yearRaw, 10);
        if (yearRaw !== '' && Number.isNaN(birthYear)) {
          toast.error(t('سنة ميلاد غير صالحة', 'Invalid birth year'));
          return;
        }
        const result = await addRelativeAction({
          treeId,
          anchorPersonId: fatherId,
          kind: 'child',
          arGivenName: row.arGivenName.trim(),
          arSurname: row.arSurname.trim() || undefined,
          gender: row.gender,
          birthYear,
          placeOfOriginId: row.placeOfOriginId ?? undefined,
          motherId: row.motherId!,
        });
        if (result?.serverError || !result?.data?.personId) {
          toast.error(
            result?.serverError ??
              t(
                `فشل إضافة ${row.arGivenName} بعد ${created} ناجح`,
                `Failed to add ${row.arGivenName} after ${created} succeeded`,
              ),
          );
          router.refresh();
          return;
        }
        created += 1;
      }
      toast.success(
        t(`تم إضافة ${created} من الأبناء`, `Added ${created} children`),
      );
      setRows([emptyRow(String(Date.now()), defaults)]);
      onSuccess?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3" dir={dir}>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-start">
              <th className="px-2 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  {t('الاسم الأول', 'Given name')}
                  <FieldHint fieldKey="arGivenName" />
                </span>
              </th>
              <th className="px-2 py-2 font-medium">{t('الجنس', 'Gender')}</th>
              <th className="px-2 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  {t('العائلة', 'Surname')}
                  <FieldHint fieldKey="arSurname" />
                </span>
              </th>
              <th className="px-2 py-2 font-medium">{t('الأم', 'Mother')}</th>
              <th className="px-2 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  {t('الأصل', 'Origin')}
                  <FieldHint fieldKey="placeOfOrigin" />
                </span>
              </th>
              <th className="px-2 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  {t('سنة الميلاد', 'Birth year')}
                  <FieldHint fieldKey="birthYear" />
                </span>
              </th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b align-top last:border-b-0">
                <td className="px-2 py-2">
                  <Input
                    dir="rtl"
                    value={row.arGivenName}
                    onChange={(e) => updateRow(row.key, { arGivenName: e.target.value })}
                    placeholder="سامي"
                  />
                </td>
                <td className="px-2 py-2">
                  <Select
                    value={row.gender}
                    onValueChange={(v) => updateRow(row.key, { gender: v as 'M' | 'F' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">{t('ذكر', 'Male')}</SelectItem>
                      <SelectItem value="F">{t('أنثى', 'Female')}</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-2">
                  <Input
                    dir="rtl"
                    value={row.arSurname}
                    onChange={(e) => updateRow(row.key, { arSurname: e.target.value })}
                  />
                </td>
                <td className="px-2 py-2 min-w-[10rem]">
                  <PersonSelect
                    value={row.motherId}
                    onChange={(id) => updateRow(row.key, { motherId: id })}
                    persons={persons}
                    filterGender="F"
                    placeholder={t('اختر الأم', 'Select mother')}
                  />
                </td>
                <td className="px-2 py-2 min-w-[12rem]">
                  <PlaceCombobox
                    value={row.placeOfOriginId}
                    onChange={(placeId) =>
                      updateRow(row.key, { placeOfOriginId: placeId })
                    }
                  />
                </td>
                <td className="px-2 py-2 w-28">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="1980"
                    value={row.birthYear}
                    onChange={(e) => updateRow(row.key, { birthYear: e.target.value })}
                  />
                </td>
                <td className="px-2 py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={rows.length <= 1}
                    onClick={() => removeRow(row.key)}
                    aria-label={t('حذف الصف', 'Remove row')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" />
          {t('إضافة صف', 'Add row')}
        </Button>
        <Button type="button" disabled={isPending} onClick={handleSubmit}>
          {isPending
            ? t('جارٍ الحفظ…', 'Saving…')
            : t('حفظ الأبناء', 'Save children')}
        </Button>
      </div>
    </div>
  );
}
