import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

export type Row = Record<string, unknown>;

interface FakeQuery extends Promise<{ data: readonly Row[]; error: null }> {
  select(): FakeQuery;
  eq(column: string): FakeQuery;
  order(): FakeQuery;
  range(from: number, to: number): FakeQuery;
}

/** Like the real API, one response carries at most 1000 rows. */
export const MAX_ROWS = 1000;

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

export function fakeSupabase(rows: Record<string, readonly Row[]>): SupabaseClient<Database> {
  return {
    from: (table: string) => fakeQuery(rows[table] ?? []),
  } as unknown as SupabaseClient<Database>;
}
