'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { shouldHideLifeData } from '@/lib/privacy/lifeData';

import { viewerHasPrivilegedTreeAccess } from './treeAccess';

/** One row of the "list of all people" table. */
export interface PersonListRow {
  readonly id: string;
  readonly displayNameAr: string | null;
  readonly displayNameEn: string | null;
  readonly gender: string;
  readonly isPlaceholder: boolean;
  readonly isLiving: boolean;
  readonly birthYear: number | null;
  readonly birthPlaceAr: string | null;
  readonly deathYear: number | null;
}

export interface PersonListPage {
  readonly rows: readonly PersonListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export type PersonListStatusFilter =
  | 'all'
  | 'living'
  | 'deceased'
  | 'placeholder';

interface ListArgs {
  readonly treeId: string;
  /** Name search — matches Arabic OR English display name. */
  readonly q?: string;
  readonly gender?: 'M' | 'F';
  readonly status?: PersonListStatusFilter;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * Paginated, filterable list of every person in a tree — powers the
 * Ancestry-style "List of all people" view. Sorted by Arabic display
 * name (then English) so the table reads naturally in the RTL UI.
 *
 * Life years come from BIRT/DEAT events, bulk-fetched for the current
 * page only (20–100 ids), so the query stays cheap on large trees.
 */
export async function getTreePeoplePage(
  args: ListArgs
): Promise<PersonListPage> {
  const supabase = await createJuthoorSupabaseClient();
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, args.pageSize ?? 20));
  const from = (page - 1) * pageSize;

  let query = supabase
    .from('persons')
    .select('id, display_name_ar, display_name_en, gender, notes, is_living', {
      count: 'exact',
    })
    .eq('tree_id', args.treeId);

  const q = args.q?.trim();
  if (q) {
    // Escape PostgREST or-syntax delimiters in user input.
    const safe = q.replace(/[,()]/g, ' ').trim();
    query = query.or(
      `display_name_ar.ilike.%${safe}%,display_name_en.ilike.%${safe}%`
    );
  }
  if (args.gender) {
    query = query.eq('gender', args.gender);
  }
  switch (args.status) {
    case 'living':
      query = query.eq('is_living', true);
      break;
    case 'deceased':
      query = query.eq('is_living', false);
      break;
    case 'placeholder':
      query = query.eq('notes', 'placeholder');
      break;
    default:
      break;
  }

  const { data, error, count } = await query
    .order('display_name_ar', { ascending: true, nullsFirst: false })
    .order('display_name_en', { ascending: true, nullsFirst: false })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(`Failed to load people list: ${error.message}`);

  const persons = data ?? [];
  const facts = await getLifeFactsFor(
    persons.map((p) => p.id)
  );

  // A living person's birth year + birthplace are hidden from viewers without
  // privileged (owner / approved-member) access to the tree (plan §5.5).
  const privileged = await viewerHasPrivilegedTreeAccess(args.treeId);

  return {
    rows: persons.map((p) => {
      const f = facts.get(p.id);
      const hide = shouldHideLifeData(p.is_living, privileged);
      return {
        id: p.id,
        displayNameAr: p.display_name_ar,
        displayNameEn: p.display_name_en,
        gender: p.gender,
        isPlaceholder: p.notes === 'placeholder',
        isLiving: p.is_living,
        birthYear: hide ? null : (f?.birthYear ?? null),
        birthPlaceAr: hide ? null : (f?.birthPlaceAr ?? null),
        deathYear: f?.deathYear ?? null,
      };
    }),
    total: count ?? 0,
    page,
    pageSize,
  };
}

interface LifeFacts {
  readonly birthYear: number | null;
  readonly birthPlaceAr: string | null;
  readonly deathYear: number | null;
}

async function getLifeFactsFor(
  personIds: readonly string[]
): Promise<ReadonlyMap<string, LifeFacts>> {
  if (personIds.length === 0) return new Map();
  const supabase = await createJuthoorSupabaseClient();

  const { data, error } = await supabase
    .from('events')
    .select('person_id, event_type, date_year, places(name_ar)')
    .in('person_id', personIds as string[])
    .in('event_type', ['BIRT', 'DEAT']);

  if (error) throw new Error(`Failed to load life events: ${error.message}`);

  interface Row {
    readonly person_id: string;
    readonly event_type: 'BIRT' | 'DEAT';
    readonly date_year: number | null;
    readonly places: { readonly name_ar: string | null } | null;
  }
  const rows = (data ?? []) as unknown as readonly Row[];

  const byPerson = new Map<string, LifeFacts>();
  for (const row of rows) {
    const current = byPerson.get(row.person_id) ?? {
      birthYear: null,
      birthPlaceAr: null,
      deathYear: null,
    };
    byPerson.set(
      row.person_id,
      row.event_type === 'BIRT'
        ? {
            ...current,
            birthYear: row.date_year ?? current.birthYear,
            birthPlaceAr: row.places?.name_ar ?? current.birthPlaceAr,
          }
        : { ...current, deathYear: row.date_year ?? current.deathYear }
    );
  }
  return byPerson;
}
