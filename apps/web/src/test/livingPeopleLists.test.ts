import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadFamilyAcrossVillages } from '@/data/user/families-search';
import { loadPersonsFromPlace } from '@/data/user/places';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  user: null as string | null,
  tables: {} as Record<string, readonly Record<string, unknown>[]>,
}));

interface FakeQuery extends Promise<{ data: Row[]; error: null }> {
  select(): FakeQuery;
  eq(column: string, value: unknown): FakeQuery;
  in(column: string, values: readonly unknown[]): FakeQuery;
  ilike(column: string, value: string): FakeQuery;
  limit(count: number): FakeQuery;
  order(): FakeQuery;
}

/** In-memory stand-in for the Supabase query builder: filters really filter. */
function fakeQuery(rows: readonly Row[]): FakeQuery {
  const query: FakeQuery = Object.assign(
    Promise.resolve({ data: [...rows], error: null as null }),
    {
      select: () => query,
      eq: (column: string, value: unknown) =>
        fakeQuery(rows.filter((r) => r[column] === value)),
      in: (column: string, values: readonly unknown[]) =>
        fakeQuery(rows.filter((r) => values.includes(r[column]))),
      ilike: (column: string, value: string) =>
        fakeQuery(rows.filter((r) => String(r[column]).toLowerCase() === value.toLowerCase())),
      limit: (count: number) => fakeQuery(rows.slice(0, count)),
      order: () => query,
    }
  );
  return query;
}

vi.mock('@/supabase-clients/juthoor-server', () => ({
  createJuthoorSupabaseClient: async () => ({
    from: (table: string) => fakeQuery(db.tables[table] ?? []),
  }),
}));
vi.mock('@/rsc-data/supabase', () => ({
  getCachedLoggedInUserIdOrNull: async () => db.user,
}));

const year = new Date().getUTCFullYear();
const AMMAN = { id: 'amman', name_ar: 'عمّان', name_en: 'Amman' };

function birth(personId: string, birthYear: number): Row {
  return { person_id: personId, event_type: 'BIRT', date_year: birthYear, place_id: 'amman', places: AMMAN };
}

// One tree with a living adult, a deceased man and a living child, all born
// in Amman.
beforeEach(() => {
  db.user = null;
  db.tables = {
    trees: [{ id: 't-khatib', owner_id: 'owner-uid', name: 'عائلة الخطيب' }],
    tree_members: [],
    persons: [
      { id: 'rania', display_name_ar: 'رانيا الخطيب', display_name_en: 'Rania', gender: 'F', tree_id: 't-khatib' },
      { id: 'khalil', display_name_ar: 'خليل الخطيب', display_name_en: 'Khalil', gender: 'M', tree_id: 't-khatib' },
      { id: 'lina', display_name_ar: 'لينا الخطيب', display_name_en: 'Lina', gender: 'F', tree_id: 't-khatib' },
    ],
    person_names: ['rania', 'khalil', 'lina'].map((id) => ({
      person_id: id,
      surname: 'الخطيب',
      lang: 'ar',
      name_type: 'birth',
    })),
    events: [
      birth('rania', 1975),
      birth('khalil', 1940),
      { person_id: 'khalil', event_type: 'DEAT', date_year: 2009, place_id: null, places: null },
      birth('lina', year - 5),
    ],
  };
});

describe('loadPersonsFromPlace — living people on a village page', () => {
  it('withholds living people from another tree, with no ids to match them by', async () => {
    db.user = 'viewer-uid';
    const people = await loadPersonsFromPlace('amman');

    const shown = people.filter((p) => !p.protected);
    expect(shown).toEqual([expect.objectContaining({ person_id: 'khalil', birth_year: 1940 })]);

    const withheld = people.filter((p) => p.protected);
    expect(withheld).toHaveLength(2);
    for (const p of withheld) {
      expect(p).toMatchObject({
        display_name_ar: null,
        display_name_en: null,
        birth_year: null,
        tree_id: '',
        tree_name: null,
      });
      expect(['rania', 'lina']).not.toContain(p.person_id);
    }
  });

  it('shows everyone to the tree owner', async () => {
    db.user = 'owner-uid';
    const people = await loadPersonsFromPlace('amman');

    expect(people.every((p) => !p.protected)).toBe(true);
    expect(people.find((p) => p.person_id === 'rania')?.birth_year).toBe(1975);
  });

  it('still withholds a living child from a read-only member (Privacy §11)', async () => {
    db.user = 'viewer-uid';
    db.tables.tree_members = [
      { tree_id: 't-khatib', user_id: 'viewer-uid', role: 'read_only', status: 'approved' },
    ];
    const people = await loadPersonsFromPlace('amman');

    expect(people.find((p) => p.person_id === 'rania')?.protected).toBe(false);
    expect(people.filter((p) => p.protected)).toHaveLength(1);
    expect(people.some((p) => p.person_id === 'lina')).toBe(false);
  });
});

describe('loadFamilyAcrossVillages — living people in the family directory', () => {
  it('lists living people from another tree without a birth year or village', async () => {
    db.user = 'viewer-uid';
    const overview = await loadFamilyAcrossVillages('الخطيب');

    const amman = overview.groups.find((g) => g.village_id === 'amman')!;
    expect(amman.sample_persons).toEqual([
      expect.objectContaining({ person_id: 'khalil', birth_year: 1940 }),
    ]);

    const unknown = overview.groups.find((g) => g.village_id === null)!;
    expect(unknown.sample_persons.map((p) => p.person_id).sort()).toEqual(['lina', 'rania']);
    expect(unknown.sample_persons.every((p) => p.birth_year === null)).toBe(true);
  });

  it('keeps them in their village, with birth years, for the tree owner', async () => {
    db.user = 'owner-uid';
    const overview = await loadFamilyAcrossVillages('الخطيب');

    const amman = overview.groups.find((g) => g.village_id === 'amman')!;
    expect(amman.sample_persons.map((p) => p.person_id).sort()).toEqual(['khalil', 'lina', 'rania']);
    expect(amman.sample_persons.find((p) => p.person_id === 'rania')?.birth_year).toBe(1975);
  });
});
