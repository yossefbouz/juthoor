import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/types/database';

import { exportTreeToSnapshot } from '../exportPipeline';
import { importGedcomSnapshot } from '../importPipeline';
import { parseGedcom } from '../parse';
import { serializeGedcom } from '../serialize';

import { fakeSupabase, type Row } from './fakeSupabase';

/**
 * A family tree made in another platform (here, an Ancestry-style file) is imported
 * as a new tree. The importer is its IFT Administrator, and its living people follow
 * the same rule as in any tree: everyone else sees only their mandatory details,
 * and only the IFT Administrator exports the rest (decision D5).
 */
const FILE = `0 HEAD
1 SOUR Ancestry
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Ibrahim /Khatib/
1 SEX M
1 BIRT
2 DATE 1900
2 PLAC Safad
1 DEAT
2 DATE 1970
1 BURI
2 PLAC Nablus cemetery
1 NOTE Buried beside his brother
0 @I2@ INDI
1 NAME Mohammad /Khatib/
1 SEX M
1 BIRT
2 DATE 12 MAY 1960
2 PLAC Amman
1 RESI
2 DATE 2019
2 PLAC 12 Rainbow Street, Amman
1 BAPM
2 DATE 1961
1 NOTE Mobile 0599 000 000
0 @I3@ INDI
1 NAME Rana /Ajrami/
1 SEX F
1 BIRT
2 DATE 1965
2 PLAC Irbid
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 @F2@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 MARR
2 DATE 1985
2 PLAC Amman
0 TRLR
`;

type Insert = Record<string, unknown>;

/** Records what the importer writes, and hands the rows back as the exporter reads them. */
function recordingSupabase() {
  const tables: Record<string, Insert[]> = {};
  let next = 0;
  const client = {
    from: (table: string) => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: (row: Insert) => {
        const stored = { ...row, id: `${table}-${++next}` };
        (tables[table] ??= []).push(stored);
        const done = Promise.resolve({ error: null });
        return Object.assign(done, {
          select: () => ({ single: () => Promise.resolve({ data: { id: stored.id }, error: null }) }),
        });
      },
    }),
  } as unknown as SupabaseClient<Database>;

  function rowsForExport(): Record<string, readonly Row[]> {
    return {
      persons: tables.persons ?? [],
      families: tables.families ?? [],
      person_names: tables.person_names ?? [],
      events: tables.events ?? [],
      family_children: (tables.family_children ?? []).map((l) => ({ ...l, families: { tree_id: 't' } })),
      person_notes: (tables.person_notes ?? []).map((n) => ({
        ...n,
        persons: { tree_id: 't' },
      })),
      places: [],
    };
  }
  return { client, rowsForExport, tables };
}

async function importedTree() {
  const { client, rowsForExport, tables } = recordingSupabase();
  const summary = await importGedcomSnapshot(client, 't', parseGedcom(FILE));
  return { summary, rows: rowsForExport(), tables };
}

describe('a tree imported from another platform', () => {
  it('is imported in full: the IFT Administrator keeps everything', async () => {
    const { summary, rows } = await importedTree();
    expect(summary.errors).toEqual([]);
    expect(summary.personsInserted).toBe(3);

    const snap = await exportTreeToSnapshot(fakeSupabase(rows), 't');
    const mohammad = snap.persons.find((p) => p.xref === '@I2@')!;
    expect(mohammad.events.map((e) => e.eventType).sort()).toEqual(['BAPM', 'BIRT', 'RESI']);
    expect(mohammad.notes).toBe('Mobile 0599 000 000');
    expect(snap.families.find((f) => f.xref === '@F2@')!.events).toHaveLength(1);
  });

  it('hides living people’s non-mandatory details from everyone else', async () => {
    const { rows } = await importedTree();
    const ged = serializeGedcom(
      await exportTreeToSnapshot(fakeSupabase(rows), 't', { maskLivingPeople: true })
    );

    for (const withheld of ['Rainbow Street', 'Mobile', '1961', '2019', '1985', '1960', 'Irbid']) {
      expect(ged).not.toContain(withheld);
    }
    // their names and family links remain
    expect(ged).toContain('1 NAME Mohammad /Khatib/');
    expect(ged).toContain('1 HUSB @I2@');
    expect(ged).toContain('1 WIFE @I3@');
  });

  it('treats the deceased of the imported tree as in any tree: their details stay', async () => {
    const { rows } = await importedTree();
    const snap = await exportTreeToSnapshot(fakeSupabase(rows), 't', { maskLivingPeople: true });
    const ibrahim = snap.persons.find((p) => p.xref === '@I1@')!;

    expect(ibrahim.events.map((e) => e.eventType).sort()).toEqual(['BIRT', 'BURI', 'DEAT']);
    expect(ibrahim.notes).toBe('Buried beside his brother');
  });
});
