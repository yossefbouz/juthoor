import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTreeSnapshot, getViewerTreeSnapshot } from '@/data/anon/treeSnapshot';
import { viewerHasPrivilegedTreeAccess } from '@/data/anon/treeAccess';
import type { PersonView } from '@/lib/tree/types';

// Keep the cookie-bound Supabase client and the other loaders out of jsdom.
vi.mock('@/data/anon/persons', () => ({
  getTreePersons: vi.fn(async () => [
    { id: 'living', gender: 'M', display_name_ar: 'محمد', display_name_en: null, notes: null },
    { id: 'deceased', gender: 'M', display_name_ar: 'إبراهيم', display_name_en: null, notes: null },
    { id: 'presumed', gender: 'F', display_name_ar: 'فاطمة', display_name_en: null, notes: null },
  ]),
}));
vi.mock('@/data/anon/families', () => ({
  getTreeFamilies: vi.fn(async () => []),
  getTreeFamilyChildren: vi.fn(async () => []),
}));
vi.mock('@/data/anon/treeAccess', () => ({
  viewerHasPrivilegedTreeAccess: vi.fn(),
}));
vi.mock('@/supabase-clients/juthoor-server', () => {
  const lifeEvents = [
    { person_id: 'living', event_type: 'BIRT', date_year: 1990, place_id: 'safad', places: { name_ar: 'صفد' } },
    { person_id: 'deceased', event_type: 'BIRT', date_year: 1900, place_id: 'lifta', places: { name_ar: 'لفتا' } },
    { person_id: 'deceased', event_type: 'DEAT', date_year: 1970, place_id: null, places: null },
    { person_id: 'presumed', event_type: 'BIRT', date_year: 1850, place_id: 'jaffa', places: { name_ar: 'يافا' } },
  ];
  const query = Object.assign(Promise.resolve({ data: lifeEvents, error: null }), {
    select: () => query,
    eq: () => query,
    in: () => query,
    not: () => query,
  });
  return { createJuthoorSupabaseClient: vi.fn(async () => ({ from: () => query })) };
});

function byId(persons: readonly PersonView[], id: string): PersonView {
  return persons.find((p) => p.id === id)!;
}

describe('getViewerTreeSnapshot — living people on the tree views', () => {
  beforeEach(() => vi.mocked(viewerHasPrivilegedTreeAccess).mockReset());

  it('hides a living person’s birth year and birthplace from a non-member', async () => {
    vi.mocked(viewerHasPrivilegedTreeAccess).mockResolvedValue(false);
    const { persons } = await getViewerTreeSnapshot('tree');

    expect(byId(persons, 'living')).toMatchObject({
      displayNameAr: 'محمد',
      birthYear: null,
      placeOfOriginId: null,
      birthPlaceAr: null,
    });
  });

  it('keeps the details of deceased and presumed-deceased people for a non-member', async () => {
    vi.mocked(viewerHasPrivilegedTreeAccess).mockResolvedValue(false);
    const { persons } = await getViewerTreeSnapshot('tree');

    expect(byId(persons, 'deceased')).toMatchObject({
      birthYear: 1900,
      deathYear: 1970,
      birthPlaceAr: 'لفتا',
    });
    expect(byId(persons, 'presumed')).toMatchObject({
      birthYear: 1850,
      placeOfOriginId: 'jaffa',
    });
  });

  it('shows everything to the owner or an approved member', async () => {
    vi.mocked(viewerHasPrivilegedTreeAccess).mockResolvedValue(true);
    const { persons } = await getViewerTreeSnapshot('tree');

    expect(byId(persons, 'living')).toMatchObject({
      birthYear: 1990,
      placeOfOriginId: 'safad',
      birthPlaceAr: 'صفد',
    });
  });

  it('leaves the unmasked loader for server-side checks untouched', async () => {
    const { persons } = await getTreeSnapshot('tree');

    expect(byId(persons, 'living').birthYear).toBe(1990);
    expect(viewerHasPrivilegedTreeAccess).not.toHaveBeenCalled();
  });
});
