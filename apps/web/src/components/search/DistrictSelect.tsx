'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DistrictOption } from '@/lib/places/districts';

export type { DistrictOption };
export { districtsFromPlaces, placeMatchesDistrict } from '@/lib/places/districts';

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
