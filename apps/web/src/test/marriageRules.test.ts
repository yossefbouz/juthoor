import { describe, expect, it } from 'vitest';
import {
  concurrentSpouseIdsOf,
  prohibitedAffinityRelatives,
  prohibitedBloodRelatives,
  validateMarriage,
  validateNewSpouse,
} from '@/lib/tree/marriageRules';
import type {
  FamilyChildLink,
  FamilyView,
  PersonView,
  TreeSnapshot,
} from '@/lib/tree/types';
import type { GenderType } from '@/types/database';

const p = (
  id: string,
  gender: GenderType,
  deathYear: number | null = null,
): PersonView => ({
  id,
  gender,
  displayNameAr: null,
  displayNameEn: null,
  isPlaceholder: false,
  birthYear: null,
  deathYear,
  placeOfOriginId: null,
});
const fam = (
  id: string,
  a: string | null,
  b: string | null,
  isDissolved = false,
): FamilyView => ({
  id,
  partner1Id: a,
  partner2Id: b,
  isDissolved,
});
const kid = (familyId: string, childId: string): FamilyChildLink => ({
  familyId,
  childId,
  pedigree: 'birth',
  birthOrder: null,
});

// Three-generation family:
//   GF × GM → FA (father), AU (aunt)
//   FA × MO → S (son), D (daughter)
//   W, M2 are unrelated; GF/GM/FA/MO are married couples.
const FAMILY: TreeSnapshot = {
  persons: [
    p('GF', 'M'), p('GM', 'F'), p('FA', 'M'), p('AU', 'F'),
    p('MO', 'F'), p('S', 'M'), p('D', 'F'), p('W', 'F'), p('M2', 'M'),
  ],
  families: [fam('fG', 'GF', 'GM'), fam('fP', 'FA', 'MO')],
  familyChildren: [kid('fG', 'FA'), kid('fG', 'AU'), kid('fP', 'S'), kid('fP', 'D')],
};

// A man married to four women, plus a fifth unmarried woman.
const POLY: TreeSnapshot = {
  persons: [
    p('MAN', 'M'), p('w1', 'F'), p('w2', 'F'), p('w3', 'F'), p('w4', 'F'), p('w5', 'F'),
  ],
  families: [
    fam('m1', 'MAN', 'w1'), fam('m2', 'MAN', 'w2'),
    fam('m3', 'MAN', 'w3'), fam('m4', 'MAN', 'w4'),
  ],
  familyChildren: [],
};

// Stepfamily:
//   FA × MO → SON
//   FA × SM (stepmother) — SM × EX → SS (stepsister, not blood sibling of SON)
const STEP: TreeSnapshot = {
  persons: [
    // FA and EX deceased so SM is free to remarry; affinity still bars SON x SM / SS.
    p('FA', 'M', 1990), p('MO', 'F'), p('SON', 'M'),
    p('SM', 'F'), p('EX', 'M', 1985), p('SS', 'F'), p('OTHER', 'F'),
  ],
  families: [
    fam('fP', 'FA', 'MO'),
    fam('fStep', 'FA', 'SM'),
    fam('fEx', 'EX', 'SM'),
  ],
  familyChildren: [
    kid('fP', 'SON'),
    kid('fEx', 'SS'),
  ],
};

// In-laws while married:
//   FIL × MIL → WIFE, SIL (sister-in-law)
//   HUS × WIFE
const INLAWS: TreeSnapshot = {
  persons: [
    // FIL deceased so MIL could remarry; affinity still bars HUS x MIL / SIL.
    p('FIL', 'M', 1995), p('MIL', 'F'), p('WIFE', 'F'), p('SIL', 'F'),
    p('HUS', 'M'), p('STRANGER', 'F'),
  ],
  families: [
    fam('fW', 'FIL', 'MIL'),
    fam('fH', 'HUS', 'WIFE'),
  ],
  familyChildren: [kid('fW', 'WIFE'), kid('fW', 'SIL')],
};

// Same as INLAWS but WIFE is deceased (widowhood dissolves concurrent union).
const INLAWS_WIDOWED: TreeSnapshot = {
  persons: [
    // Wife deceased (in-laws drop); FIL deceased so MIL is free — union allowed.
    p('FIL', 'M', 1995), p('MIL', 'F'), p('WIFE', 'F', 2010), p('SIL', 'F'),
    p('HUS', 'M'), p('STRANGER', 'F'),
  ],
  families: [
    fam('fW', 'FIL', 'MIL'),
    fam('fH', 'HUS', 'WIFE'),
  ],
  familyChildren: [kid('fW', 'WIFE'), kid('fW', 'SIL')],
};

// Four wives, one deceased — man may take another concurrent wife.
const POLY_WIDOWED: TreeSnapshot = {
  persons: [
    p('MAN', 'M'),
    p('w1', 'F'), p('w2', 'F'), p('w3', 'F'), p('w4', 'F', 2000), p('w5', 'F'),
  ],
  families: [
    fam('m1', 'MAN', 'w1'), fam('m2', 'MAN', 'w2'),
    fam('m3', 'MAN', 'w3'), fam('m4', 'MAN', 'w4'),
  ],
  familyChildren: [],
};

// Married woman whose husband is deceased may remarry.
const WIDOW: TreeSnapshot = {
  persons: [p('WID', 'F'), p('HUS', 'M', 1999), p('SUITOR', 'M')],
  families: [fam('m1', 'HUS', 'WID')],
  familyChildren: [],
};


// Four wives, one divorced — man may take another concurrent wife.
const POLY_DIVORCED: TreeSnapshot = {
  persons: [
    p('MAN', 'M'),
    p('w1', 'F'), p('w2', 'F'), p('w3', 'F'), p('w4', 'F'), p('w5', 'F'),
  ],
  families: [
    fam('m1', 'MAN', 'w1'), fam('m2', 'MAN', 'w2'),
    fam('m3', 'MAN', 'w3'), fam('m4', 'MAN', 'w4', true),
  ],
  familyChildren: [],
};

// Divorced woman may remarry.
const DIVORCEE: TreeSnapshot = {
  persons: [p('DIV', 'F'), p('EX', 'M'), p('SUITOR', 'M')],
  families: [fam('m1', 'EX', 'DIV', true)],
  familyChildren: [],
};

describe('prohibitedBloodRelatives — mahram by blood', () => {
  it('covers mother, grandmother, sister, and aunt for the son', () => {
    const rel = prohibitedBloodRelatives(FAMILY, 'S');
    expect(rel.has('MO')).toBe(true); // mother
    expect(rel.has('GM')).toBe(true); // grandmother
    expect(rel.has('D')).toBe(true); // sister
    expect(rel.has('AU')).toBe(true); // paternal aunt
    expect(rel.has('FA')).toBe(true); // father
    expect(rel.has('S')).toBe(false); // not self
    expect(rel.has('W')).toBe(false); // unrelated
  });
});

describe('prohibitedAffinityRelatives — mahram by affinity', () => {
  it('includes stepmother and stepsister', () => {
    const rel = prohibitedAffinityRelatives(STEP, 'SON');
    expect(rel.has('SM')).toBe(true);
    expect(rel.has('SS')).toBe(true);
    expect(rel.has('MO')).toBe(false);
    expect(rel.has('OTHER')).toBe(false);
  });

  it('includes mother-in-law and sister-in-law while married to the wife', () => {
    const rel = prohibitedAffinityRelatives(INLAWS, 'HUS');
    expect(rel.has('MIL')).toBe(true);
    expect(rel.has('SIL')).toBe(true);
    expect(rel.has('STRANGER')).toBe(false);
  });

  it('drops in-laws after the wife is deceased (widowhood)', () => {
    const rel = prohibitedAffinityRelatives(INLAWS_WIDOWED, 'HUS');
    expect(rel.has('MIL')).toBe(false);
    expect(rel.has('SIL')).toBe(false);
  });
});

describe('concurrentSpouseIdsOf — widowhood/divorce-aware counting', () => {
  it('excludes a deceased spouse from the concurrent set', () => {
    expect(concurrentSpouseIdsOf(POLY_WIDOWED, 'MAN').sort()).toEqual(
      ['w1', 'w2', 'w3'].sort(),
    );
    expect(concurrentSpouseIdsOf(WIDOW, 'WID')).toEqual([]);
  });

  it('excludes a spouse with hasDeath but no deathYear (undated DEAT)', () => {
    const snap: TreeSnapshot = {
      persons: [
        p('MAN', 'M'),
        { ...p('w1', 'F'), hasDeath: true, deathYear: null },
        p('w2', 'F'),
      ],
      families: [fam('m1', 'MAN', 'w1'), fam('m2', 'MAN', 'w2')],
      familyChildren: [],
    };
    expect(concurrentSpouseIdsOf(snap, 'MAN')).toEqual(['w2']);
  });

  it('excludes a divorced spouse from the concurrent set', () => {
    expect(concurrentSpouseIdsOf(POLY_DIVORCED, 'MAN').sort()).toEqual(
      ['w1', 'w2', 'w3'].sort(),
    );
    expect(concurrentSpouseIdsOf(DIVORCEE, 'DIV')).toEqual([]);
  });
});

describe('validateMarriage — between two existing persons', () => {
  it('blocks a blood relative (son × aunt)', () => {
    const v = validateMarriage({ snapshot: FAMILY, aId: 'S', aGender: 'M', bId: 'AU', bGender: 'F' });
    expect(v?.code).toBe('blood_relative');
  });

  it('blocks same-gender unions', () => {
    const v = validateMarriage({ snapshot: FAMILY, aId: 'S', aGender: 'M', bId: 'FA', bGender: 'M' });
    expect(v?.code).toBe('same_gender');
  });

  it('blocks marrying a woman who already has a husband', () => {
    const v = validateMarriage({ snapshot: FAMILY, aId: 'M2', aGender: 'M', bId: 'MO', bGender: 'F' });
    expect(v?.code).toBe('woman_already_married');
  });

  it('blocks a fifth wife', () => {
    const v = validateMarriage({ snapshot: POLY, aId: 'MAN', aGender: 'M', bId: 'w5', bGender: 'F' });
    expect(v?.code).toBe('man_four_wives');
  });

  it('allows an unrelated, unmarried, opposite-gender union', () => {
    const v = validateMarriage({ snapshot: FAMILY, aId: 'S', aGender: 'M', bId: 'W', bGender: 'F' });
    expect(v).toBeNull();
  });

  it('blocks stepmother and stepsister', () => {
    expect(
      validateMarriage({
        snapshot: STEP, aId: 'SON', aGender: 'M', bId: 'SM', bGender: 'F',
      })?.code,
    ).toBe('affinity_relative');
    expect(
      validateMarriage({
        snapshot: STEP, aId: 'SON', aGender: 'M', bId: 'SS', bGender: 'F',
      })?.code,
    ).toBe('affinity_relative');
  });

  it('blocks mother-in-law and sister-in-law while married to the wife', () => {
    expect(
      validateMarriage({
        snapshot: INLAWS, aId: 'HUS', aGender: 'M', bId: 'MIL', bGender: 'F',
      })?.code,
    ).toBe('affinity_relative');
    expect(
      validateMarriage({
        snapshot: INLAWS, aId: 'HUS', aGender: 'M', bId: 'SIL', bGender: 'F',
      })?.code,
    ).toBe('affinity_relative');
  });

  it('allows mother-in-law after the wife is deceased', () => {
    const v = validateMarriage({
      snapshot: INLAWS_WIDOWED, aId: 'HUS', aGender: 'M', bId: 'MIL', bGender: 'F',
    });
    expect(v).toBeNull();
  });

  it('allows a fifth concurrent wife when one prior wife is deceased', () => {
    const v = validateMarriage({
      snapshot: POLY_WIDOWED, aId: 'MAN', aGender: 'M', bId: 'w5', bGender: 'F',
    });
    expect(v).toBeNull();
  });

  it('allows a widow to remarry', () => {
    const v = validateMarriage({
      snapshot: WIDOW, aId: 'SUITOR', aGender: 'M', bId: 'WID', bGender: 'F',
    });
    expect(v).toBeNull();
  });

  it('allows a fifth concurrent wife when one prior wife is divorced', () => {
    const v = validateMarriage({
      snapshot: POLY_DIVORCED, aId: 'MAN', aGender: 'M', bId: 'w5', bGender: 'F',
    });
    expect(v).toBeNull();
  });

  it('allows a divorcee to remarry', () => {
    const v = validateMarriage({
      snapshot: DIVORCEE, aId: 'SUITOR', aGender: 'M', bId: 'DIV', bGender: 'F',
    });
    expect(v).toBeNull();
  });
});

describe('validateNewSpouse — adding a brand-new spouse', () => {
  it('blocks same gender', () => {
    const v = validateNewSpouse({ snapshot: FAMILY, anchorId: 'S', anchorGender: 'M', newGender: 'M' });
    expect(v?.code).toBe('same_gender');
  });

  it('blocks a second husband for a married woman', () => {
    const v = validateNewSpouse({ snapshot: FAMILY, anchorId: 'MO', anchorGender: 'F', newGender: 'M' });
    expect(v?.code).toBe('woman_already_married');
  });

  it('blocks a fifth wife for a four-wife man', () => {
    const v = validateNewSpouse({ snapshot: POLY, anchorId: 'MAN', anchorGender: 'M', newGender: 'F' });
    expect(v?.code).toBe('man_four_wives');
  });

  it('allows a first spouse of the opposite gender', () => {
    const v = validateNewSpouse({ snapshot: FAMILY, anchorId: 'S', anchorGender: 'M', newGender: 'F' });
    expect(v).toBeNull();
  });

  it('allows a new wife when one of four prior wives is deceased', () => {
    const v = validateNewSpouse({
      snapshot: POLY_WIDOWED, anchorId: 'MAN', anchorGender: 'M', newGender: 'F',
    });
    expect(v).toBeNull();
  });

  it('allows a new husband for a widow', () => {
    const v = validateNewSpouse({
      snapshot: WIDOW, anchorId: 'WID', anchorGender: 'F', newGender: 'M',
    });
    expect(v).toBeNull();
  });

  it('allows a new wife when one of four prior wives is divorced', () => {
    const v = validateNewSpouse({
      snapshot: POLY_DIVORCED, anchorId: 'MAN', anchorGender: 'M', newGender: 'F',
    });
    expect(v).toBeNull();
  });

  it('allows a new husband for a divorcee', () => {
    const v = validateNewSpouse({
      snapshot: DIVORCEE, anchorId: 'DIV', anchorGender: 'F', newGender: 'M',
    });
    expect(v).toBeNull();
  });
});
