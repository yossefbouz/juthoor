'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import type { Place } from '@/types/database';

/**
 * Village/place search for the AddPerson form combobox.
 *
 * Searches `name_ar` and `name_en` with ILIKE so it's case-insensitive
 * for Latin text and works on Arabic substrings. When pg_trgm indexes
 * are live (see migration 20260417130000), this scales; until then it
 * is an accepted seq scan on 263 rows.
 *
 * `districtKey` matches DistrictSelect keys (lowercased district_ar/en).
 */
export async function searchPlaces(
  query: string,
  limit = 20,
  districtKey?: string | null,
): Promise<readonly Place[]> {
  const supabase = await createJuthoorSupabaseClient();
  const q = query.trim();
  // Fetch a wider page when filtering by district so client/server
  // truncation does not hide matches in a large district.
  const fetchLimit = districtKey ? Math.max(limit, 300) : limit;

  let builder = supabase
    .from('places')
    .select('*')
    .order('name_ar', { ascending: true })
    .limit(fetchLimit);

  if (q.length > 0) {
    const pattern = `%${q}%`;
    builder = builder.or(`name_ar.ilike.${pattern},name_en.ilike.${pattern}`);
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(
      q.length === 0
        ? `Failed to list places: ${error.message}`
        : `Failed to search places: ${error.message}`,
    );
  }

  const rows = data ?? [];
  if (!districtKey) return rows.slice(0, limit);

  const key = districtKey.trim().toLowerCase();
  return rows
    .filter((p) => {
      const ar = (p.district_ar ?? '').trim().toLowerCase();
      const en = (p.district_en ?? '').trim().toLowerCase();
      return ar === key || en === key;
    })
    .slice(0, limit);
}

export async function getPlaceById(id: string): Promise<Place | null> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load place: ${error.message}`);
  return data ?? null;
}
