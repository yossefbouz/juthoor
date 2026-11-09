import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/types/database';

import { exportTreeToSnapshot } from '../exportPipeline';
import { serializeGedcom } from '../serialize';

type Row = Record<string, unknown>;

interface FakeQuery extends Promise<{ data: readonly Row[]; error: null }> {
  select(): FakeQuery;
  eq(column: string): FakeQuery;
  order(): FakeQuery;
  range(from: number, to: number): FakeQuery;
}

/** Like the real API, one response carries at most 1000 rows. */
const MAX_ROWS = 1000;

/**
 * Stand-in for the Supabase query builder over rows that already belong to
 * one tree. A filter through the joined person or family keeps the rows that
 * have one, which is what tells person events from family events.
 */
function fakeQuery(rows: readonly Row[]): FakeQuery {
  const query: FakeQuery = Object.assign(
    Promise.resolve({ data: rows.slice(0, MAX_ROWS), error: null as null }),
    {
      select: () => query,
      eq: (column: string) => {
        if (column === 'persons.tree_id') {
          return fakeQuery(rows.filter((r) => r.person_id != null));
        }
        if (column === 'families.tree_id') {
          return fakeQuery(rows.filter((r) => r.family_id != null));
        }
        return query;
      },
      order: () => query,
      range: (from: number, to: number) => fakeQuery(rows.slice(from, to + 1)),
    }
  );
  return query;
}

function fakeSupabase(rows: Record<string, readonly Row[]>): SupabaseClient<Database> {
  return {
    from: (table: string) => fakeQuery(rows[table] ?? []),
  } as unknown as SupabaseClient<Database>;
}

function person(id: string, xref: string, gender: 'M' | 'F', notes: string | null = null): Row {
  return { id, gedcom_xref: xref, gender, display_name_ar: null, display_name_en: null, notes };
}

function name(personId: string, given: string, surname: string): Row {
  return {
    person_id: personId,
    is_primary: true,
    name_type: 'birth',
    given_name: given,
    surname,
    gedcom_name: null,
    lang: 'ar',
  };
}

function event(
  owner: { person_id?: string; family_id?: string },
  eventType: string,
  year: number | null,
  placeName: string | null = null
): Row {
  return {
    person_id: owner.person_id ?? null,
    family_id: owner.family_id ?? null,
    event_type: eventType,
    date_value: null,
    date_year: year,
    place_id: null,
    place_name: placeName,
  };
}

// Grandfather (deceased), his son and daughter-in-law (living, married in
// 1985), and a great-grandmother born in 1850 with no recorded death, who is
// presumed deceased under decision D2.
const ROWS: Record<string, readonly Row[]> = {
  persons: [
    person('p-grandfather', '@I1@', 'M'),
    person('p-father', '@I2@', 'M', 'Mobile 0599 000 000'),
    person('p-mother', '@I3@', 'F'),
    person('p-great-grandmother', '@I4@', 'F'),
  ],
  families: [
    { id: 'f-grandparents', gedcom_xref: '@F1@', partner1_id: 'p-grandfather', partner2_id: null },
    { id: 'f-parents', gedcom_xref: '@F2@', partner1_id: 'p-father', partner2_id: 'p-mother' },
  ],
  family_children: [
    { family_id: 'f-grandparents', child_id: 'p-father', pedigree: 'birth', families: { tree_id: 't' } },
  ],
  person_names: [
    name('p-grandfather', 'إبراهيم', 'الخطيب'),
    name('p-father', 'محمد', 'الخطيب'),
    name('p-mother', 'رنا', 'العجرمي'),
    name('p-great-grandmother', 'فاطمة', 'الخطيب'),
  ],
  events: [
    event({ person_id: 'p-grandfather' }, 'BIRT', 1900, 'Safad'),
    event({ person_id: 'p-grandfather' }, 'DEAT', 1970),
    event({ person_id: 'p-father' }, 'BIRT', 1960, 'Amman'),
    event({ person_id: 'p-mother' }, 'BIRT', 1965, 'Irbid'),
    event({ person_id: 'p-great-grandmother' }, 'BIRT', 1850, 'Lifta'),
    event({ family_id: 'f-parents' }, 'MARR', 1985, 'Amman'),
  ],
  places: [],
  person_identifiers: [],
};

describe('exportTreeToSnapshot — reading the tree', () => {
  it('exports every person of a tree larger than one API page', async () => {
    const count = 2 * MAX_ROWS + 1;
    const ids = Array.from({ length: count }, (_, i) => `p${i}`);
    const snap = await exportTreeToSnapshot(
      fakeSupabase({
        persons: ids.map((id, i) => person(id, `@I${i + 1}@`, 'M')),
        person_names: ids.map((id) => name(id, 'أحمد', 'الخطيب')),
        events: ids.map((id) => event({ person_id: id }, 'BIRT', 1900)),
      }),
      't'
    );

    expect(snap.persons).toHaveLength(count);
    expect(snap.persons.at(-1)!.events).toHaveLength(1);
    expect(snap.persons.at(-1)!.names[0].given).toBe('أحمد');
  });

  it('keeps person events and family events apart', async () => {
    const snap = await exportTreeToSnapshot(fakeSupabase(ROWS), 't');

    expect(snap.persons.find((p) => p.xref === '@I2@')!.events).toHaveLength(1);
    expect(snap.families.find((f) => f.xref === '@F2@')!.events).toEqual([
      expect.objectContaining({ eventType: 'MARR', year: 1985 }),
    ]);
  });
});

describe('exportTreeToSnapshot — living people (decision D5)', () => {
  it('exports every detail when masking is off (the IFT Administrator)', async () => {
    const snap = await exportTreeToSnapshot(fakeSupabase(ROWS), 't');
    const father = snap.persons.find((p) => p.xref === '@I2@')!;

    expect(father.events.find((e) => e.eventType === 'BIRT')).toMatchObject({
      year: 1960,
      place: 'Amman',
    });
    expect(father.notes).toBe('Mobile 0599 000 000');
    expect(snap.families.find((f) => f.xref === '@F2@')!.events).toHaveLength(1);
  });

  it('withholds living people’s events and notes but keeps names and links', async () => {
    const snap = await exportTreeToSnapshot(fakeSupabase(ROWS), 't', {
      maskLivingPeople: true,
    });
    const father = snap.persons.find((p) => p.xref === '@I2@')!;
    const mother = snap.persons.find((p) => p.xref === '@I3@')!;

    expect(father.events).toEqual([]);
    expect(father.notes).toBeUndefined();
    expect(father.names[0]).toMatchObject({ given: 'محمد', surname: 'الخطيب' });
    expect(mother.events).toEqual([]);

    const parents = snap.families.find((f) => f.xref === '@F2@')!;
    expect(parents.husbandXref).toBe('@I2@');
    expect(parents.wifeXref).toBe('@I3@');
    expect(parents.events).toEqual([]);

    const grandparents = snap.families.find((f) => f.xref === '@F1@')!;
    expect(grandparents.children.map((c) => c.childXref)).toEqual(['@I2@']);
  });

  it('keeps the details of deceased people, including those presumed deceased', async () => {
    const snap = await exportTreeToSnapshot(fakeSupabase(ROWS), 't', {
      maskLivingPeople: true,
    });
    const grandfather = snap.persons.find((p) => p.xref === '@I1@')!;
    const greatGrandmother = snap.persons.find((p) => p.xref === '@I4@')!;

    expect(grandfather.events.map((e) => e.eventType)).toEqual(['BIRT', 'DEAT']);
    expect(greatGrandmother.events).toEqual([
      expect.objectContaining({ eventType: 'BIRT', year: 1850, place: 'Lifta' }),
    ]);
  });

  it('uses the D2 150-year rule, not persons.is_living alone', async () => {
    const currentYear = new Date().getFullYear();
    const rows: Record<string, readonly Row[]> = {
      persons: [
        // Flag says deceased, but no DEAT and birth is recent → still living under D2.
        {
          ...person('p-flag-dead', '@I10@', 'M', 'secret note'),
          is_living: false,
        },
        // Flag says living, but born 150+ years ago with no DEAT → presumed deceased.
        {
          ...person('p-flag-alive', '@I11@', 'F', 'old note'),
          is_living: true,
        },
      ],
      families: [],
      family_children: [],
      person_names: [
        name('p-flag-dead', 'حديث', 'الشخص'),
        name('p-flag-alive', 'قديم', 'الشخص'),
      ],
      events: [
        event({ person_id: 'p-flag-dead' }, 'BIRT', currentYear - 40, 'Nablus'),
        event(
          { person_id: 'p-flag-alive' },
          'BIRT',
          currentYear - 150,
          'Jaffa'
        ),
      ],
      places: [],
      person_identifiers: [],
    };

    const snap = await exportTreeToSnapshot(fakeSupabase(rows), 't', {
      maskLivingPeople: true,
    });
    const recent = snap.persons.find((p) => p.xref === '@I10@')!;
    const ancient = snap.persons.find((p) => p.xref === '@I11@')!;

    expect(recent.events).toEqual([]);
    expect(recent.notes).toBeUndefined();
    expect(ancient.events).toEqual([
      expect.objectContaining({
        eventType: 'BIRT',
        year: currentYear - 150,
        place: 'Jaffa',
      }),
    ]);
    expect(ancient.notes).toBe('old note');
  });

  it('leaves no trace of the withheld details in the .ged text', async () => {
    const ged = serializeGedcom(
      await exportTreeToSnapshot(fakeSupabase(ROWS), 't', { maskLivingPeople: true })
    );

    for (const withheld of ['1960', '1965', '1985', 'Amman', 'Irbid', 'Mobile']) {
      expect(ged).not.toContain(withheld);
    }
    expect(ged).toContain('1 NAME محمد /الخطيب/');
    expect(ged).toContain('2 PLAC Safad');
  });

  it('emits person_identifiers as IDNO and ORIGIN notes on IFT Admin full export', async () => {
    const rows: Record<string, readonly Row[]> = {
      ...ROWS,
      person_identifiers: [
        {
          person_id: 'p-grandfather',
          id_type: 'unrwa_registration',
          id_value: 'UNRWA-123',
        },
        {
          person_id: 'p-grandfather',
          id_type: 'family_card_1948',
          id_value: 'FC-9',
        },
      ],
      person_displacement: [
        {
          person_id: 'p-grandfather',
          host_country_first: 'Lebanon',
          host_country_current: 'Lebanon',
          refugee_status: 'registered',
          camp_name: 'Ain al-Hilweh',
          displacement_year: 1948,
          displacement_wave: 'Nakba',
        },
      ],
    };
    const snap = await exportTreeToSnapshot(fakeSupabase(rows), 't', {
      maskLivingPeople: false,
    });
    const gf = snap.persons.find((p) => p.xref === '@I1@')!;
    expect(gf.idnos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'UNRWA', value: 'UNRWA-123' }),
        expect.objectContaining({ type: 'HOSTCARD1948', value: 'FC-9' }),
      ])
    );
    expect(gf.extraNotes).toEqual(
      expect.arrayContaining([
        'UNRWA: UNRWA-123',
        'HOSTCARD1948: FC-9',
        'ORIGIN: Safad',
      ])
    );
    expect(gf.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'EVEN',
          typeDetail: 'DISPLACEMENT',
          year: 1948,
          place: 'Lebanon',
        }),
        expect.objectContaining({
          eventType: 'EVEN',
          typeDetail: 'CAMPREGN',
          place: 'Ain al-Hilweh',
        }),
      ])
    );
    const ged = serializeGedcom(snap);
    expect(ged).toContain('2 VERS 7.0');
    expect(ged).toContain('1 SCHMA');
    expect(ged).not.toContain('FORM LINEAGE-LINKED');
    expect(ged).toContain('1 IDNO UNRWA-123');
    expect(ged).toContain('2 TYPE UNRWA');
    expect(ged).toContain('1 IDNO FC-9');
    expect(ged).toContain('2 TYPE HOSTCARD1948');
    expect(ged).toContain('1 NOTE UNRWA: UNRWA-123');
    expect(ged).toContain('2 TYPE DISPLACEMENT');
    expect(ged).toContain('2 TYPE CAMPREGN');
  });

  it('withholds identifiers when maskLivingPeople is true', async () => {
    const rows: Record<string, readonly Row[]> = {
      ...ROWS,
      person_identifiers: [
        {
          person_id: 'p-father',
          id_type: 'unrwa_registration',
          id_value: 'SECRET',
        },
      ],
    };
    const snap = await exportTreeToSnapshot(fakeSupabase(rows), 't', {
      maskLivingPeople: true,
    });
    for (const p of snap.persons) {
      expect(p.idnos).toBeUndefined();
      expect(p.refns).toBeUndefined();
      expect(p.extraNotes).toBeUndefined();
    }
  });
});

