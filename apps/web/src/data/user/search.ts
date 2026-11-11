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
    district,
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

  const hasNameOrYearOrPlace = Boolean(
    qTr?.arabic ||
      q ||
      gTr?.arabic ||
      given ||
      sTr?.arabic ||
      surname ||
      fTr?.arabic ||
      father ||
      mTr?.arabic ||
      mother ||
      pgfTr?.arabic ||
      paternalGrandfather ||
      pggfTr?.arabic ||
      paternalGreatGrandfather ||
      placeId ||
      birthYear,
  );
  const districtOnly =
    Boolean(district?.trim()) && !placeId && !hasNameOrYearOrPlace;

  const supabase = await createJuthoorSupabaseClient();

  // search_master_tree gates on name/place/year. District-only would return [].
  if (districtOnly) {
    return searchByDistrictOnly(supabase, district!.trim(), gender ?? null, limit);
  }

  const effectiveLimit = Boolean(district?.trim()) && !placeId ? Math.max(limit, 100) : limit;

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
    lim: effectiveLimit,
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }
  return (data ?? []) as SearchResult[];
}

async function searchByDistrictOnly(
  supabase: Awaited<ReturnType<typeof createJuthoorSupabaseClient>>,
  district: string,
  gender: string | null,
  limit: number,
): Promise<SearchResult[]> {
  const key = district.trim().toLowerCase();
  const { data: places, error: pErr } = await supabase
    .from('places')
    .select('id, name_ar, name_en, district_ar, district_en');
  if (pErr) throw new Error(`Search failed: ${pErr.message}`);
  const allowed = ((places ?? []) as Array<{
    id: string;
    name_ar: string | null;
    name_en: string | null;
    district_ar: string | null;
    district_en: string | null;
  }>).filter((p) => {
    const ar = (p.district_ar ?? '').trim().toLowerCase();
    const en = (p.district_en ?? '').trim().toLowerCase();
    return ar === key || en === key;
  });
  if (allowed.length === 0) return [];
  const placeIds = allowed.map((p) => p.id);
  const placeById = new Map(allowed.map((p) => [p.id, p]));

  const { data: events, error: eErr } = await supabase
    .from('events')
    .select('person_id, place_id, date_year')
    .eq('event_type', 'BIRT')
    .in('place_id', placeIds)
    .limit(Math.max(limit * 4, 200));
  if (eErr) throw new Error(`Search failed: ${eErr.message}`);
  const personIds = Array.from(
    new Set(((events ?? []) as Array<{ person_id: string }>).map((e) => e.person_id)),
  ).slice(0, limit);
  if (personIds.length === 0) return [];

  let personQuery = supabase
    .from('persons')
    .select('id, tree_id, display_name_ar, display_name_en, gender, is_living')
    .in('id', personIds);
  if (gender) personQuery = personQuery.eq('gender', gender);
  const { data: persons, error: perr } = await personQuery;
  if (perr) throw new Error(`Search failed: ${perr.message}`);

  const birtByPerson = new Map(
    ((events ?? []) as Array<{ person_id: string; place_id: string | null; date_year: number | null }>).map(
      (e) => [e.person_id, e],
    ),
  );

  return ((persons ?? []) as Array<{
    id: string;
    tree_id: string;
    display_name_ar: string | null;
    display_name_en: string | null;
    gender: string | null;
    is_living: boolean | null;
  }>).map((p) => {
    const birt = birtByPerson.get(p.id);
    const place = birt?.place_id ? placeById.get(birt.place_id) : null;
    const hideOrigin = Boolean(p.is_living);
    return {
      person_id: p.id,
      tree_id: p.tree_id,
      tree_name: null,
      tree_is_public: true,
      tree_is_accessible: true,
      display_name_ar: p.display_name_ar,
      display_name_en: p.display_name_en,
      gender: p.gender,
      primary_given: null,
      primary_surname: null,
      birth_year: hideOrigin ? null : (birt?.date_year ?? null),
      origin_place_id: hideOrigin ? null : (birt?.place_id ?? null),
      origin_name_ar: hideOrigin ? null : (place?.name_ar ?? null),
      origin_name_en: hideOrigin ? null : (place?.name_en ?? null),
      score: 1,
      breakdown: { district: 1 },
    } as SearchResult;
  });
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
