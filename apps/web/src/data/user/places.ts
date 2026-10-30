'use server';

import { viewerPrivilegedTreeIds } from '@/data/anon/treeAccess';
import { isPresumedLiving } from '@/lib/privacy/lifeData';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import type { PlaceExternalLink } from '@/types/database';

export type PlaceType = 'village' | 'city' | 'clan_locality' | 'khirba';

export type PlaceListItem = {
  id: string;
  name_ar: string;
  name_en: string | null;
  place_type: PlaceType | null;
  district_ar: string | null;
  district_en: string | null;
  depopulated_year: number | null;
  is_depopulated: boolean | null;
};

export type PlaceTypeCounts = {
  village: number;
  city: number;
  clan_locality: number;
  khirba: number;
  total: number;
};

export async function loadAllPlaces(): Promise<PlaceListItem[]> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('places')
    .select('id, name_ar, name_en, place_type, district_ar, district_en, depopulated_year, is_depopulated')
    .order('name_ar', { ascending: true });
  if (error) throw new Error(`Failed to load places: ${error.message}`);
  return (data ?? []) as PlaceListItem[];
}

export async function loadPlaceTypeCounts(): Promise<PlaceTypeCounts> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.from('places').select('place_type');
  if (error) throw new Error(`Failed to count places: ${error.message}`);

  const counts: PlaceTypeCounts = {
    village: 0,
    city: 0,
    clan_locality: 0,
    khirba: 0,
    total: 0,
  };
  for (const row of data ?? []) {
    const type = (row as { place_type: string | null }).place_type;
    if (type === 'village') counts.village++;
    else if (type === 'city') counts.city++;
    else if (type === 'clan_locality') counts.clan_locality++;
    else if (type === 'khirba') counts.khirba++;
    counts.total++;
  }
  return counts;
}

export type PlaceDetail = PlaceListItem & {
  latitude: number | null;
  longitude: number | null;
};

export async function loadPlaceById(id: string): Promise<PlaceDetail | null> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('places')
    .select('id, name_ar, name_en, place_type, district_ar, district_en, depopulated_year, is_depopulated, latitude, longitude')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load place: ${error.message}`);
  return (data as PlaceDetail | null) ?? null;
}

export type PlaceProfile = {
  place_id: string;
  historical_overview_ar: string | null;
  historical_overview_en: string | null;
  what_remains_ar: string | null;
  what_remains_en: string | null;
  population_year: number | null;
  population_count: number | null;
  source_attribution_ar: string | null;
  source_attribution_en: string | null;
  external_links: PlaceExternalLink[] | null;
};

/** Editorial enrichment for a place (history, what-remains, sources, links).
 *  Degrades gracefully: returns null if the row is absent OR if the
 *  `place_profiles` table has not been migrated yet, so the village page renders
 *  unchanged until the migration is applied. */
export async function loadPlaceProfile(
  placeId: string,
): Promise<PlaceProfile | null> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('place_profiles')
    .select(
      'place_id, historical_overview_ar, historical_overview_en, what_remains_ar, what_remains_en, population_year, population_count, source_attribution_ar, source_attribution_en, external_links',
    )
    .eq('place_id', placeId)
    .maybeSingle();
  if (error) return null; // table missing / not yet migrated — degrade silently
  return (data as PlaceProfile | null) ?? null;
}

export type PlaceGalleryItem = {
  url: string;
  caption_ar?: string | null;
  caption_en?: string | null;
  year?: number | null;
};
export type PlaceDocItem = {
  url: string;
  label_ar?: string | null;
  label_en?: string | null;
};
export type PlaceMedia = {
  gallery: PlaceGalleryItem[];
  documents: PlaceDocItem[];
};

/** Curated per-village photo gallery (7.0) + document archive (8.0).
 *  Separate from loadPlaceProfile so it degrades to empty (and never regresses
 *  the rest of the profile) if the `gallery`/`documents` columns aren't migrated. */
export async function loadPlaceMedia(placeId: string): Promise<PlaceMedia> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('place_profiles')
    .select('gallery, documents')
    .eq('place_id', placeId)
    .maybeSingle();
  if (error || !data) return { gallery: [], documents: [] };
  const d = data as { gallery?: PlaceGalleryItem[] | null; documents?: PlaceDocItem[] | null };
  return { gallery: d.gallery ?? [], documents: d.documents ?? [] };
}

export type PlacePerson = {
  person_id: string;
  display_name_ar: string | null;
  display_name_en: string | null;
  gender: string | null;
  birth_year: number | null;
  tree_id: string;
  tree_name: string | null;
  /** Identity withheld from this list: a living person from a tree the viewer
   *  is not a member of (being listed here would reveal their birthplace), or,
   *  per Privacy §11, a living child under 16 from a tree the viewer can't
   *  manage. Name, year and tree are nulled and the ids are placeholders. */
  protected: boolean;
};

/** Tree ids the current viewer may manage (owner or approved collaborator).
 *  Used to decide whether protected (minor) records may be revealed. */
async function viewerWritableTreeIds(
  supabase: Awaited<ReturnType<typeof createJuthoorSupabaseClient>>,
): Promise<Set<string>> {
  const uid = await getCachedLoggedInUserIdOrNull();
  const writable = new Set<string>();
  if (!uid) return writable;
  const [owned, member] = await Promise.all([
    supabase.from('trees').select('id').eq('owner_id', uid),
    supabase.from('tree_members').select('tree_id, role, status').eq('user_id', uid),
  ]);
  for (const r of (owned.data ?? []) as Array<{ id: string }>) writable.add(r.id);
  for (const m of (member.data ?? []) as Array<{ tree_id: string; role: string; status: string }>) {
    if (m.status === 'approved' && (m.role === 'owner' || m.role === 'collaborator')) {
      writable.add(m.tree_id);
    }
  }
  return writable;
}

/** People whose BIRT event references this place. Two-step (events → persons,
 *  then trees) — keeping RLS happy and avoiding the nested-!inner quirk where
 *  PostgREST's join planner sometimes drops rows even when the data is
 *  visible. Limited to public + accessible trees by RLS. */
export async function loadPersonsFromPlace(
  placeId: string,
  limit = 200,
): Promise<PlacePerson[]> {
  const supabase = await createJuthoorSupabaseClient();
  const { data: eventRows, error: eErr } = await supabase
    .from('events')
    .select('person_id, date_year')
    .eq('place_id', placeId)
    .eq('event_type', 'BIRT')
    .limit(limit);
  if (eErr) throw new Error(`Failed to load events for place: ${eErr.message}`);
  const personIds = Array.from(
    new Set(((eventRows ?? []) as Array<{ person_id: string }>).map((r) => r.person_id)),
  );
  if (personIds.length === 0) return [];

  const { data: personRows, error: pErr } = await supabase
    .from('persons')
    .select('id, display_name_ar, display_name_en, gender, tree_id')
    .in('id', personIds);
  if (pErr) throw new Error(`Failed to load persons: ${pErr.message}`);

  const [writableTrees, privilegedTrees, deathRes] = await Promise.all([
    viewerWritableTreeIds(supabase),
    viewerPrivilegedTreeIds(),
    supabase
      .from('events')
      .select('person_id')
      .in('person_id', personIds)
      .eq('event_type', 'DEAT'),
  ]);
  if (deathRes.error) {
    throw new Error(`Failed to load death events: ${deathRes.error.message}`);
  }
  const deceased = new Set(
    ((deathRes.data ?? []) as Array<{ person_id: string }>).map((r) => r.person_id),
  );
  const currentYear = new Date().getUTCFullYear();

  const treeIds = Array.from(
    new Set(((personRows ?? []) as Array<{ tree_id: string }>).map((r) => r.tree_id)),
  );
  const treeNameById = new Map<string, string | null>();
  if (treeIds.length > 0) {
    // trees has a single `name` column — there is no name_ar/name_en.
    const { data: treeRows } = await supabase
      .from('trees')
      .select('id, name')
      .in('id', treeIds);
    for (const t of treeRows ?? []) {
      treeNameById.set(t.id, t.name ?? null);
    }
  }
  const yearByPerson = new Map<string, number | null>();
  for (const r of (eventRows ?? []) as Array<{ person_id: string; date_year: number | null }>) {
    if (!yearByPerson.has(r.person_id)) yearByPerson.set(r.person_id, r.date_year);
  }
  type PersonRow = {
    id: string;
    display_name_ar: string | null;
    display_name_en: string | null;
    gender: string | null;
    tree_id: string;
  };
  return ((personRows ?? []) as PersonRow[]).map((p, i) => {
    const birthYear = yearByPerson.get(p.id) ?? null;
    const living = isPresumedLiving(
      { hasDeath: deceased.has(p.id), birthYear },
      currentYear,
    );
    // A living person's birthplace is private to their own tree (as in the
    // people list), and every entry on this page is a birthplace.
    const outsideTheirTree = living && !privilegedTrees.has(p.tree_id);
    // Privacy §11: a living child under 16, in a tree the viewer can't manage,
    // is not shown publicly — withhold identity (name + year).
    const isMinor = living && birthYear != null && currentYear - birthYear < 16;
    const isProtected =
      outsideTheirTree || (isMinor && !writableTrees.has(p.tree_id));
    return {
      // Placeholder ids, so a protected entry can't be matched to the same
      // person on another page.
      person_id: isProtected ? `protected-${i}` : p.id,
      display_name_ar: isProtected ? null : p.display_name_ar,
      display_name_en: isProtected ? null : p.display_name_en,
      gender: isProtected ? null : p.gender,
      birth_year: isProtected ? null : birthYear,
      tree_id: isProtected ? '' : p.tree_id,
      tree_name: isProtected ? null : treeNameById.get(p.tree_id) ?? null,
      protected: isProtected,
    };
  });
}

export type SurnameGroupItem = {
  surname_ar: string | null;
  surname_en: string | null;
  count: number;
};

/** Surnames represented in this place — for "families from this village". */
export async function loadSurnamesFromPlace(placeId: string): Promise<SurnameGroupItem[]> {
  const supabase = await createJuthoorSupabaseClient();
  // Get persons born in this place, then join their primary surname.
  const { data, error } = await supabase
    .from('events')
    .select(`
      persons!inner (
        id,
        person_names!inner ( surname, surname_phonetic, lang, name_type )
      )
    `)
    .eq('place_id', placeId)
    .eq('event_type', 'BIRT');
  if (error) throw new Error(`Failed to load surnames from place: ${error.message}`);

  type Row = {
    persons: {
      id: string;
      person_names: Array<{
        surname: string | null;
        lang: string | null;
        name_type: string | null;
      }>;
    };
  };
  const map = new Map<string, { ar: string | null; en: string | null; count: number }>();
  for (const row of (data as unknown as Row[]) ?? []) {
    const names = row.persons?.person_names ?? [];
    const primary = names.find((n) => n.name_type === 'birth') ?? names[0];
    if (!primary?.surname) continue;
    const key = primary.surname.trim();
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      const isArabic = /[؀-ۿ]/.test(key);
      map.set(key, {
        ar: isArabic ? key : null,
        en: isArabic ? null : key,
        count: 1,
      });
    }
  }
  return Array.from(map.values())
    .map((v) => ({ surname_ar: v.ar, surname_en: v.en, count: v.count }))
    .sort((a, b) => b.count - a.count);
}
