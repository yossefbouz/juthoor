'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { SearchQuerySchema, type SearchQuery, type SearchResult } from '@/lib/search/zodSchemas';
import { toArabic } from '@/lib/search/phonetic';

/**
 * Search the Master Tree. Runs Latinâ†’Arabic pre-transliteration on each text
 * field so users can type "Ibraheem" and still match Ø¥Ø¨Ø±Ø§Ù‡ÙŠÙ… in the DB.
 *
 * Backed by `search_master_tree` (v2) in Postgres:
 *   - Arabic normalization + phonetic folding on stored names
 *   - per-field weighted scoring with JSONB breakdown
 *   - SECURITY INVOKER (RLS filters to public + accessible trees)
 */
export async function searchMasterTree(raw: SearchQuery): Promise<SearchResult[]> {
  const parsed = SearchQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '));
  }
  const {
    q,
    given,
    surname,
    father,
    mother,
    paternalGrandfather,
    paternalGreatGrandfather,
    placeId,
    birthYear,
    yearWindow,
    gender,
    limit,
  } = parsed.data;

  // Pre-transliterate every text field. Users typing "Ahmad" or "Deir Yassin"
  // need Arabic script before the Postgres trigram index will fire.
  const [qTr, gTr, sTr, fTr, mTr, pgfTr, pggfTr] = await Promise.all([
    q ? toArabic(q) : Promise.resolve(null),
    given ? toArabic(given) : Promise.resolve(null),
    surname ? toArabic(surname) : Promise.resolve(null),
    father ? toArabic(father) : Promise.resolve(null),
    mother ? toArabic(mother) : Promise.resolve(null),
    paternalGrandfather ? toArabic(paternalGrandfather) : Promise.resolve(null),
    paternalGreatGrandfather ? toArabic(paternalGreatGrandfather) : Promise.resolve(null),
  ]);

  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.rpc('search_master_tree', {
    q_given: gTr?.arabic ?? given ?? null,
    q_surname: sTr?.arabic ?? surname ?? null,
    q_father: fTr?.arabic ?? father ?? null,
    q_mother: mTr?.arabic ?? mother ?? null,
    q_pgf: pgfTr?.arabic ?? paternalGrandfather ?? null,
    q_pggf: pggfTr?.arabic ?? paternalGreatGrandfather ?? null,
    q_free: qTr?.arabic ?? q ?? null,
    q_place_id: placeId ?? null,
    q_birth_year: birthYear ?? null,
    q_year_window: yearWindow,
    q_gender: gender ?? null,
    lim: limit,
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }
  return (data ?? []) as SearchResult[];
}

type Village = {
  id: string;
  name_ar: string;
  name_en: string | null;
  district_ar: string | null;
  district_en: string | null;
};

/**
 * All places eligible as origin filters. Small enough (~263 rows) to ship
 * to the client and filter in memory for instant autocomplete.
 */
export async function loadVillagesForFilter(): Promise<Village[]> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('places')
    .select('id, name_ar, name_en, district_ar, district_en')
    .order('name_ar', { ascending: true });
  if (error) throw new Error(`Failed to load villages: ${error.message}`);
  return (data ?? []) as Village[];
}
