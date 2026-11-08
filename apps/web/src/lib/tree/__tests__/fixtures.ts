/**
 * Fixture snapshots for relationship-solver tests.
 *
 * Each fixture constructs a small, deterministic tree so assertions can
 * check exact ids. Keep fixtures minimal — one concept per fixture.
 */

import type {
  FamilyChildLink,
  FamilyView,
  PersonView,
  TreeSnapshot,
} from '../types';

const person = (
  id: string,
  gender: PersonView['gender'],
  displayNameAr: string,
  overrides: Partial<PersonView> = {}
): PersonView => ({
  id,
  gender,
  displayNameAr,
  displayNameEn: null,
  isPlaceholder: false,
  birthYear: null,
  deathYear: null,
  placeOfOriginId: null,
  ...overrides,
});

const family = (
  id: string,
  partner1Id: string | null,
  partner2Id: string | null,
  isDissolved = false,
): FamilyView => ({ id, partner1Id, partner2Id, isDissolved });

const link = (
  familyId: string,
  childId: string,
  birthOrder: number | null = null
): FamilyChildLink => ({
  familyId,
  childId,
  pedigree: 'birth',
  birthOrder,
});

/**
 * Simple nuclear family:
 *   f1: (AHMAD + FATIMA) -> [SAMI, LAYLA]
 * Focus cases: SAMI should see parents=AHMAD/FATIMA, sibling=LAYLA.
 */
export const nuclearFamilyFixture: TreeSnapshot = {
  persons: [
    person('p-ahmad', 'M', 'أحمد'),
    person('p-fatima', 'F', 'فاطمة'),
    person('p-sami', 'M', 'سامي'),
    person('p-layla', 'F', 'ليلى'),
  ],
  families: [family('f-1', 'p-ahmad', 'p-fatima')],
  familyChildren: [link('f-1', 'p-sami', 1), link('f-1', 'p-layla', 2)],
};

/**
 * Father with two wives (multi-spouse):
 *   f1: AHMAD + MARIAM -> [YUSUF]
 *   f2: AHMAD + HAFSA  -> [OMAR, SARA]
 * Focus on AHMAD: spouses=[MARIAM, HAFSA], childrenByFamily groups
 *   f1 children separately from f2 children.
 */
export const multiSpouseFixture: TreeSnapshot = {
  persons: [
    person('p-ahmad', 'M', 'أحمد'),
    person('p-mariam', 'F', 'مريم'),
    person('p-hafsa', 'F', 'حفصة'),
    person('p-yusuf', 'M', 'يوسف'),
    person('p-omar', 'M', 'عمر'),
    person('p-sara', 'F', 'سارة'),
  ],
  families: [
    family('f-1', 'p-ahmad', 'p-mariam'),
    family('f-2', 'p-ahmad', 'p-hafsa'),
  ],
  familyChildren: [
    link('f-1', 'p-yusuf', 1),
    link('f-2', 'p-omar', 1),
    link('f-2', 'p-sara', 2),
  ],
};

/**
 * Mother unknown — placeholder "Female 1":
 *   f1: ABBAS + {placeholder mother} -> [HUDA]
 */
export const placeholderMotherFixture: TreeSnapshot = {
  persons: [
    person('p-abbas', 'M', 'عبّاس'),
    person('p-ph-1', 'F', 'Female 1', { isPlaceholder: true }),
    person('p-huda', 'F', 'هدى'),
  ],
  families: [family('f-1', 'p-abbas', 'p-ph-1')],
  familyChildren: [link('f-1', 'p-huda', 1)],
};

/**
 * Only one parent known (no family row linking to a partner):
 *   f1: KHALID + null -> [NOOR]
 * The solver should still return parents with father=KHALID, mother=null.
 */
export const soloParentFixture: TreeSnapshot = {
  persons: [
    person('p-khalid', 'M', 'خالد'),
    person('p-noor', 'F', 'نور'),
  ],
  families: [family('f-1', 'p-khalid', null)],
  familyChildren: [link('f-1', 'p-noor', 1)],
};

/**
 * Orphan: a person with no family-of-origin record at all.
 */
export const orphanFixture: TreeSnapshot = {
  persons: [person('p-alone', 'M', 'وحيد')],
  families: [],
  familyChildren: [],
};
