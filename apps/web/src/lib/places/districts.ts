export type DistrictOption = {
  key: string;
  label_ar: string;
  label_en: string | null;
};

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
