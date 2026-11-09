'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';

export type FamilyIndexRow = {
  surname: string;
  count: number;
  is_arabic: boolean;
  districts?: string[];
};

export type TopSurnamesFilters = {
  surname?: string | null;
  district?: string | null;
  placeId?: string | null;
};

const DEFAULT_LIMIT = 60;
const FILTERED_LIMIT = 400;

function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Top surnames across all visible trees. Aggregates `person_names` —
 * RLS keeps the result limited to public + accessible trees.
 *
 * Filters (all optional, server-side):
 * - `surname`: ilike substring on surname
 * - `district`: only surnames with ≥1 person whose BIRT/origin place is in that district
 * - `placeId`: only surnames with ≥1 person whose BIRT/origin place matches (VCC / village)
 *
 * When any filter is set the result limit is raised so filtered lists are not truncated early.
 */
export async function loadTopSurnames(
  limit = DEFAULT_LIMIT,
  filters: TopSurnamesFilters = {},
): Promise<FamilyIndexRow[]> {
  const supabase = await createJuthoorSupabaseClient();

  const surnameQ = filters.surname?.trim() || null;
  const normalizedDistrict = filters.district?.trim().toLowerCase() || null;
  const placeId = filters.placeId?.trim() || null;
  const hasFilters = Boolean(surnameQ || normalizedDistrict || placeId);
  const effectiveLimit = hasFilters ? Math.max(limit, FILTERED_LIMIT) : limit;

  let allowedPersonIds: Set<string> | null = null;

  if (placeId) {
    const { data: events, error: eErr } = await supabase
      .from('events')
      .select('person_id, place_id')
      .eq('event_type', 'BIRT')
      .eq('place_id', placeId)
      .limit(5000);
    if (eErr) throw new Error(`Failed to load origins: ${eErr.message}`);
    allowedPersonIds = new Set(
      ((events ?? []) as Array<{ person_id: string }>).map((e) => e.person_id),
    );
    if (allowedPersonIds.size === 0) return [];
  } else if (normalizedDistrict) {
    const { data: places, error: pErr } = await supabase
      .from('places')
      .select('id, district_ar, district_en');
    if (pErr) throw new Error(`Failed to load places: ${pErr.message}`);
    const placeIds = ((places ?? []) as Array<{
      id: string;
      district_ar: string | null;
      district_en: string | null;
    }>)
      .filter((p) => {
        const ar = (p.district_ar ?? '').trim().toLowerCase();
        const en = (p.district_en ?? '').trim().toLowerCase();
        return ar === normalizedDistrict || en === normalizedDistrict;
      })
      .map((p) => p.id);
    if (placeIds.length === 0) return [];

    const { data: events, error: eErr } = await supabase
      .from('events')
      .select('person_id, place_id')
      .eq('event_type', 'BIRT')
      .in('place_id', placeIds)
      .limit(5000);
    if (eErr) throw new Error(`Failed to load origins: ${eErr.message}`);
    allowedPersonIds = new Set(
      ((events ?? []) as Array<{ person_id: string }>).map((e) => e.person_id),
    );
    if (allowedPersonIds.size === 0) return [];
  }

  let nameQuery = supabase
    .from('person_names')
    .select('surname, person_id')
    .not('surname', 'is', null)
    .limit(hasFilters ? 8000 : 4000);

  if (surnameQ) {
    nameQuery = nameQuery.ilike('surname', `%${escapeIlike(surnameQ)}%`);
  }

  const { data, error } = await nameQuery;
  if (error) throw new Error(`Failed to load surnames: ${error.message}`);

  const tally = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ surname: string | null; person_id: string }>) {
    if (allowedPersonIds && !allowedPersonIds.has(r.person_id)) continue;
    const s = (r.surname ?? '').trim();
    if (!s) continue;
    tally.set(s, (tally.get(s) ?? 0) + 1);
  }
  const rows = Array.from(tally.entries())
    .map(([surname, count]) => ({
      surname,
      count,
      is_arabic: /[؀-ۿ]/.test(surname),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, effectiveLimit);
  return rows;
}
