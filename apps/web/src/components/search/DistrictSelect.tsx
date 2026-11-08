'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type DistrictOption = {
  key: string;
  label_ar: string;
  label_en: string | null;
};

/**
 * District filter for search / families / villages. Options are derived from
 * places.district_ar / district_en (unique keys).
 */
export function DistrictSelect({
  districts,
  value,
  onChange,
  locale,
  placeholder,
  allLabel,
}: {
  districts: DistrictOption[];
  value: string | null;
  onChange: (key: string | null) => void;
  locale: 'ar' | 'en';
  placeholder?: string;
  allLabel?: string;
}) {
  const all = allLabel ?? (locale === 'ar' ? 'كل المناطق' : 'All districts');
  return (
    <Select
      value={value ?? '__all__'}
      onValueChange={(v) => onChange(v === '__all__' ? null : v)}
    >
      <SelectTrigger className="h-11 rounded-xl border-[var(--jt-stone-200)] bg-[var(--background)]">
        <SelectValue placeholder={placeholder ?? all} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{all}</SelectItem>
        {districts.map((d) => (
          <SelectItem key={d.key} value={d.key}>
            {locale === 'ar' ? d.label_ar : d.label_en || d.label_ar}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Unique district options from place rows that carry district_ar/en. */
export function districtsFromPlaces(
  places: ReadonlyArray<{ district_ar: string | null; district_en: string | null }>,
): DistrictOption[] {
  const map = new Map<string, DistrictOption>();
  for (const p of places) {
    const ar = (p.district_ar ?? '').trim();
    const en = (p.district_en ?? '').trim();
    if (!ar && !en) continue;
    const key = (ar || en).toLowerCase();
    if (map.has(key)) continue;
    map.set(key, { key, label_ar: ar || en, label_en: en || null });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.label_ar.localeCompare(b.label_ar, 'ar'),
  );
}

export function placeMatchesDistrict(
  place: { district_ar: string | null; district_en: string | null },
  districtKey: string | null,
): boolean {
  if (!districtKey) return true;
  const ar = (place.district_ar ?? '').trim().toLowerCase();
  const en = (place.district_en ?? '').trim().toLowerCase();
  return ar === districtKey || en === districtKey;
}
