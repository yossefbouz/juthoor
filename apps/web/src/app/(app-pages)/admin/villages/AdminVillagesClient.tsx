'use client';

import { useState } from 'react';
import { Loader2, MapPin, Plus } from 'lucide-react';

import { AdminStaffNav } from '@/components/admin/AdminStaffNav';
import { useLocale } from '@/contexts/LocaleContext';
import {
  upsertAdminPlace,
  type AdminPlaceRow,
} from '@/data/admin/villages';
import type { PlaceType } from '@/data/user/places';

const PLACE_TYPES: Array<{ value: PlaceType; ar: string; en: string }> = [
  { value: 'village', ar: 'قرية', en: 'Village' },
  { value: 'city', ar: 'مدينة', en: 'City' },
  { value: 'clan_locality', ar: 'عشيرة', en: 'Clan' },
  { value: 'khirba', ar: 'خربة', en: 'Khirba' },
];

/**
 * D9 / Group A9: Platform Admin edits the canonical VCC list.
 */
export function AdminVillagesClient({
  initialPlaces,
}: {
  readonly initialPlaces: AdminPlaceRow[];
}) {
  const { t, dir, locale } = useLocale();
  const [places, setPlaces] = useState(initialPlaces);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [placeType, setPlaceType] = useState<PlaceType>('village');
  const [districtAr, setDistrictAr] = useState('');
  const [districtEn, setDistrictEn] = useState('');
  const [depopulatedYear, setDepopulatedYear] = useState('');
  const [isDepopulated, setIsDepopulated] = useState(false);

  function startNew() {
    setEditingId(null);
    setNameAr('');
    setNameEn('');
    setPlaceType('village');
    setDistrictAr('');
    setDistrictEn('');
    setDepopulatedYear('');
    setIsDepopulated(false);
    setError(null);
    setOk(null);
  }

  function startEdit(p: AdminPlaceRow) {
    setEditingId(p.id);
    setNameAr(p.name_ar);
    setNameEn(p.name_en ?? '');
    setPlaceType((p.place_type as PlaceType) ?? 'village');
    setDistrictAr(p.district_ar ?? '');
    setDistrictEn(p.district_en ?? '');
    setDepopulatedYear(p.depopulated_year ? String(p.depopulated_year) : '');
    setIsDepopulated(Boolean(p.is_depopulated));
    setError(null);
    setOk(null);
  }

  async function save() {
    if (!nameAr.trim()) {
      setError(t('الاسم بالعربية مطلوب.', 'Arabic name is required.'));
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const row = await upsertAdminPlace({
        id: editingId ?? undefined,
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || null,
        placeType,
        districtAr: districtAr.trim() || null,
        districtEn: districtEn.trim() || null,
        depopulatedYear: depopulatedYear.trim()
          ? Number(depopulatedYear)
          : null,
        isDepopulated,
      });
      setPlaces((list) => {
        const without = list.filter((p) => p.id !== row.id);
        return [...without, row].sort((a, b) =>
          a.name_ar.localeCompare(b.name_ar, 'ar'),
        );
      });
      setOk(editingId ? t('تم التحديث.', 'Updated.') : t('تمت الإضافة.', 'Added.'));
      startNew();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('فشل الحفظ.', 'Save failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={dir} className="mx-auto max-w-5xl px-4 py-8">
      <AdminStaffNav isAdmin />
      <h1
        className="text-3xl font-bold text-[var(--jt-olive-900)]"
        style={{ fontFamily: 'var(--jt-font-display)' }}
      >
        {t('إدارة القرى والمدن', 'Villages & places')}
      </h1>
      <p className="mt-2 text-sm text-[var(--jt-stone-600)]">
        {t(
          'صلاحية حصرية لمسؤول المنصة (D9): إضافة وتعديل سجلات VCC.',
          'Platform Admin exclusive (D9): add and edit VCC records.',
        )}
      </p>

      <section className="mt-6 rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--jt-olive-800)]">
            {editingId
              ? t('تعديل مكان', 'Edit place')
              : t('إضافة مكان', 'Add place')}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={startNew}
              className="text-xs font-semibold text-[var(--jt-stone-600)] underline"
            >
              {t('جديد', 'New')}
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder={t('الاسم بالعربية *', 'Arabic name *')}
            className="rounded-xl border border-[var(--jt-stone-200)] px-3 py-2 text-sm"
            style={{ fontFamily: 'var(--jt-font-arabic)' }}
          />
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder={t('الاسم بالإنجليزية', 'English name')}
            className="rounded-xl border border-[var(--jt-stone-200)] px-3 py-2 text-sm"
          />
          <select
            value={placeType}
            onChange={(e) => setPlaceType(e.target.value as PlaceType)}
            className="rounded-xl border border-[var(--jt-stone-200)] px-3 py-2 text-sm"
          >
            {PLACE_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {locale === 'ar' ? pt.ar : pt.en}
              </option>
            ))}
          </select>
          <input
            value={depopulatedYear}
            onChange={(e) => setDepopulatedYear(e.target.value)}
            placeholder={t('سنة التهجير', 'Depopulated year')}
            className="rounded-xl border border-[var(--jt-stone-200)] px-3 py-2 text-sm"
          />
          <input
            value={districtAr}
            onChange={(e) => setDistrictAr(e.target.value)}
            placeholder={t('القضاء (عربي)', 'District (Arabic)')}
            className="rounded-xl border border-[var(--jt-stone-200)] px-3 py-2 text-sm"
          />
          <input
            value={districtEn}
            onChange={(e) => setDistrictEn(e.target.value)}
            placeholder={t('القضاء (إنجليزي)', 'District (English)')}
            className="rounded-xl border border-[var(--jt-stone-200)] px-3 py-2 text-sm"
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--jt-stone-700)]">
          <input
            type="checkbox"
            checked={isDepopulated}
            onChange={(e) => setIsDepopulated(e.target.checked)}
          />
          {t('مهجّرة', 'Depopulated')}
        </label>
        {error && <p className="mt-2 text-sm text-[var(--jt-terra-600)]">{error}</p>}
        {ok && <p className="mt-2 text-sm text-[var(--jt-olive-700)]">{ok}</p>}
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--jt-olive-700)] px-4 py-2 text-sm font-semibold text-[var(--jt-stone-50)] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {busy ? t('يحفظ…', 'Saving…') : t('حفظ', 'Save')}
        </button>
      </section>

      <ul className="mt-6 space-y-2">
        {places.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--jt-stone-200)] bg-[var(--card)] px-4 py-3"
          >
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-[var(--jt-olive-700)]" />
              <div>
                <p className="font-semibold text-[var(--jt-olive-900)]">
                  {locale === 'ar' ? p.name_ar : p.name_en || p.name_ar}
                </p>
                <p className="text-xs text-[var(--jt-stone-500)]">
                  {p.place_type}
                  {p.district_en || p.district_ar
                    ? ` · ${locale === 'ar' ? p.district_ar : p.district_en}`
                    : ''}
                  {p.is_depopulated ? ` · ${t('مهجّرة', 'depopulated')}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => startEdit(p)}
              className="text-xs font-semibold text-[var(--jt-olive-800)] underline"
            >
              {t('تعديل', 'Edit')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
