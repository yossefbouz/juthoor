/**
 * Marriage-recording rules — Terms & Conditions Article 6.
 *
 * Pure, I/O-free validators over a {@link TreeSnapshot}, mirroring the design of
 * `relationships.ts` so they are deterministic and unit-testable. The DB-side
 * caller (`data/user/relatives.ts`) loads a snapshot and asks these functions
 * whether a proposed union is allowed BEFORE any write happens.
 *
 * Rules enforced (T&C 6.2–6.3 / AIO W0.3 R9):
 *   - a marriage is recorded between a man and a woman (M × F);
 *   - a woman may not be married to more than one man at the same time;
 *   - a man may not be married to more than four women at the same time;
 *   - mahram by blood: no marriage between ancestor/descendant, siblings,
 *     a parent's sibling (aunt/uncle), or a sibling's child (niece/nephew);
 *   - mahram by affinity: stepmother, stepsister, mother-in-law while married
 *     to her daughter, sister-in-law while married to her sister;
 *   - concurrent-spouse counts exclude unions where the other partner has a
 *     recorded deathYear (widowhood), and unions marked `isDissolved` (DIV
 *     event on the family, or `families.notes === 'dissolved'`).
 */

import type { GenderType } from '@/types/database';
import type { PersonView, TreeSnapshot } from './types';

export const MAX_WIVES = 4;

export type MarriageViolationCode =
  | 'same_gender'
  | 'woman_already_married'
  | 'man_four_wives'
  | 'blood_relative'
  | 'affinity_relative';

export interface MarriageViolation {
  readonly code: MarriageViolationCode;
  readonly messageAr: string;
  readonly messageEn: string;
}

const VIOLATIONS: Record<MarriageViolationCode, Omit<MarriageViolation, 'code'>> = {
  same_gender: {
    messageAr: 'لا يمكن تسجيل زواج بين شخصين من الجنس نفسه.',
    messageEn: 'A marriage cannot be recorded between two people of the same gender.',
  },
  woman_already_married: {
    messageAr: 'لا يمكن تسجيل المرأة متزوجة من أكثر من رجل واحد في الوقت نفسه.',
    messageEn: 'A woman cannot be recorded as married to more than one man at the same time.',
  },
  man_four_wives: {
    messageAr: 'لا يمكن تسجيل الرجل متزوجًا من أكثر من أربع نساء في الوقت نفسه.',
    messageEn: 'A man cannot be recorded as married to more than four women at the same time.',
  },
  blood_relative: {
    messageAr: 'لا يمكن تسجيل زواج بين قريبين بهذه الدرجة من القرابة (محرَم).',
    messageEn: 'A marriage cannot be recorded between close blood relatives (mahram).',
  },
  affinity_relative: {
    messageAr: 'لا يمكن تسجيل زواج بسبب قرابة المصاهرة (محرَم).',
    messageEn: 'A marriage cannot be recorded because of an affinity (in-law / step) mahram relationship.',
  },
};

const violation = (code: MarriageViolationCode): MarriageViolation => ({
  code,
  ...VIOLATIONS[code],
});

// ============================================================================
// Graph helpers (pure)
// ============================================================================

function personOf(snapshot: TreeSnapshot, personId: string): PersonView | undefined {
  return snapshot.persons.find((p) => p.id === personId);
}

/** Partner ids recorded as parents in the families that `personId` is a child of. */
function parentsOf(snapshot: TreeSnapshot, personId: string): string[] {
  const parentFamilyIds = new Set(
    snapshot.familyChildren
      .filter((l) => l.childId === personId)
      .map((l) => l.familyId),
  );
  const parents = new Set<string>();
  for (const fam of snapshot.families) {
    if (!parentFamilyIds.has(fam.id)) continue;
    if (fam.partner1Id) parents.add(fam.partner1Id);
    if (fam.partner2Id) parents.add(fam.partner2Id);
  }
  return [...parents];
}

/** Children recorded in the families that `personId` is a partner in. */
function childrenOf(snapshot: TreeSnapshot, personId: string): string[] {
  const ownFamilyIds = new Set(
    snapshot.families
      .filter((f) => f.partner1Id === personId || f.partner2Id === personId)
      .map((f) => f.id),
  );
  const children = new Set<string>();
  for (const link of snapshot.familyChildren) {
    if (ownFamilyIds.has(link.familyId)) children.add(link.childId);
  }
  return [...children];
}

/** Recorded spouses (the other partner in every family `personId` belongs to). */
export function spouseIdsOf(snapshot: TreeSnapshot, personId: string): string[] {
  const spouses = new Set<string>();
  for (const fam of snapshot.families) {
    if (fam.partner1Id === personId && fam.partner2Id) spouses.add(fam.partner2Id);
    else if (fam.partner2Id === personId && fam.partner1Id) spouses.add(fam.partner1Id);
  }
  return [...spouses];
}

/**
 * Spouses that still count as concurrent for polygyny / polyandry limits.
 * A union is not concurrent when it is dissolved (DIV / notes) or when the
 * other partner has a recorded deathYear (widowhood).
 */
export function concurrentSpouseIdsOf(
  snapshot: TreeSnapshot,
  personId: string,
): string[] {
  const spouses = new Set<string>();
  for (const fam of snapshot.families) {
    if (fam.isDissolved) continue;
    let spouseId: string | null = null;
    if (fam.partner1Id === personId && fam.partner2Id) spouseId = fam.partner2Id;
    else if (fam.partner2Id === personId && fam.partner1Id) spouseId = fam.partner1Id;
    if (!spouseId) continue;
    const spouse = personOf(snapshot, spouseId);
    if (spouse != null && spouse.deathYear === null) spouses.add(spouseId);
  }
  return [...spouses];
}

/** Siblings: anyone who shares at least one parent with `personId`. */
function siblingsOf(snapshot: TreeSnapshot, personId: string): Set<string> {
  const myParents = new Set(parentsOf(snapshot, personId));
  if (myParents.size === 0) return new Set();
  const siblingFamilyIds = new Set<string>();
  for (const fam of snapshot.families) {
    if (
      (fam.partner1Id && myParents.has(fam.partner1Id)) ||
      (fam.partner2Id && myParents.has(fam.partner2Id))
    ) {
      siblingFamilyIds.add(fam.id);
    }
  }
  const siblings = new Set<string>();
  for (const link of snapshot.familyChildren) {
    if (siblingFamilyIds.has(link.familyId) && link.childId !== personId) {
      siblings.add(link.childId);
    }
  }
  return siblings;
}

function transitive(
  start: string,
  step: (id: string) => string[],
): Set<string> {
  const seen = new Set<string>();
  const stack = step(start);
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (seen.has(next)) continue;
    seen.add(next);
    for (const n of step(next)) if (!seen.has(n)) stack.push(n);
  }
  return seen;
}

/**
 * All blood relatives of `personId` within the mahram degrees that bar marriage:
 * ancestors, descendants, siblings, parents' siblings (aunts/uncles), and
 * siblings' children (nieces/nephews).
 */
export function prohibitedBloodRelatives(
  snapshot: TreeSnapshot,
  personId: string,
): Set<string> {
  const ancestors = transitive(personId, (id) => parentsOf(snapshot, id));
  const descendants = transitive(personId, (id) => childrenOf(snapshot, id));
  const siblings = siblingsOf(snapshot, personId);

  const auntsUncles = new Set<string>();
  for (const parent of parentsOf(snapshot, personId)) {
    for (const s of siblingsOf(snapshot, parent)) auntsUncles.add(s);
  }

  const niecesNephews = new Set<string>();
  for (const sib of siblings) {
    for (const child of childrenOf(snapshot, sib)) niecesNephews.add(child);
  }

  const all = new Set<string>([
    ...ancestors,
    ...descendants,
    ...siblings,
    ...auntsUncles,
    ...niecesNephews,
  ]);
  all.delete(personId);
  return all;
}

/**
 * Affinity mahram of `personId` (framed for a man; used from the male partner
 * in {@link validateMarriage}):
 *   - stepmother: father's other wife who is not mother;
 *   - stepsister: daughter of a stepmother/stepfather union who is not a
 *     blood sibling;
 *   - mother-in-law: mother of a concurrent wife;
 *   - sister-in-law: sister of a concurrent wife.
 */
export function prohibitedAffinityRelatives(
  snapshot: TreeSnapshot,
  personId: string,
): Set<string> {
  const result = new Set<string>();
  const myParents = parentsOf(snapshot, personId);
  const myParentSet = new Set(myParents);
  const bloodSiblings = siblingsOf(snapshot, personId);

  const mothers: string[] = [];
  const fathers: string[] = [];
  for (const parentId of myParents) {
    const parent = personOf(snapshot, parentId);
    if (parent?.gender === 'F') mothers.push(parentId);
    else if (parent?.gender === 'M') fathers.push(parentId);
  }

  const stepmothers = new Set<string>();
  for (const fatherId of fathers) {
    for (const wifeId of spouseIdsOf(snapshot, fatherId)) {
      if (myParentSet.has(wifeId)) continue;
      stepmothers.add(wifeId);
      result.add(wifeId);
    }
  }

  const stepfathers = new Set<string>();
  for (const motherId of mothers) {
    for (const husId of spouseIdsOf(snapshot, motherId)) {
      if (myParentSet.has(husId)) continue;
      stepfathers.add(husId);
    }
  }

  const addStepsistersOf = (stepParentId: string) => {
    for (const childId of childrenOf(snapshot, stepParentId)) {
      if (childId === personId || bloodSiblings.has(childId)) continue;
      const child = personOf(snapshot, childId);
      if (child?.gender === 'F') result.add(childId);
    }
  };
  for (const sm of stepmothers) addStepsistersOf(sm);
  for (const sf of stepfathers) addStepsistersOf(sf);

  for (const wifeId of concurrentSpouseIdsOf(snapshot, personId)) {
    for (const parentId of parentsOf(snapshot, wifeId)) {
      const parent = personOf(snapshot, parentId);
      if (parent?.gender === 'F') result.add(parentId);
    }
    for (const sibId of siblingsOf(snapshot, wifeId)) {
      const sib = personOf(snapshot, sibId);
      if (sib?.gender === 'F') result.add(sibId);
    }
  }

  result.delete(personId);
  return result;
}

// ============================================================================
// Validators
// ============================================================================

const isMF = (g: GenderType): g is 'M' | 'F' => g === 'M' || g === 'F';

/**
 * Validate a union between two EXISTING persons (e.g. recording a father×mother
 * union when adding a child with a chosen existing mother). Returns the first
 * violation found, or null if the union is allowed.
 */
export function validateMarriage(args: {
  snapshot: TreeSnapshot;
  aId: string;
  aGender: GenderType;
  bId: string;
  bGender: GenderType;
}): MarriageViolation | null {
  const { snapshot, aId, aGender, bId, bGender } = args;

  if (aGender === bGender) return violation('same_gender');

  // Count rules apply when we can identify a man and a woman.
  if (isMF(aGender) && isMF(bGender)) {
    const womanId = aGender === 'F' ? aId : bId;
    const manId = aGender === 'M' ? aId : bId;

    const otherHusbands = concurrentSpouseIdsOf(snapshot, womanId).filter(
      (id) => id !== manId,
    );
    if (otherHusbands.length >= 1) return violation('woman_already_married');

    const otherWives = concurrentSpouseIdsOf(snapshot, manId).filter(
      (id) => id !== womanId,
    );
    if (otherWives.length >= MAX_WIVES) return violation('man_four_wives');

    if (prohibitedAffinityRelatives(snapshot, manId).has(womanId)) {
      return violation('affinity_relative');
    }
  }

  if (prohibitedBloodRelatives(snapshot, aId).has(bId)) {
    return violation('blood_relative');
  }
  return null;
}

/**
 * Validate adding a BRAND-NEW spouse to an existing anchor person. The new
 * person has no id yet, so blood/affinity relation cannot apply — only gender
 * and the anchor's concurrent-spouse count are checked.
 */
export function validateNewSpouse(args: {
  snapshot: TreeSnapshot;
  anchorId: string;
  anchorGender: GenderType;
  newGender: 'M' | 'F';
}): MarriageViolation | null {
  const { snapshot, anchorId, anchorGender, newGender } = args;

  if (anchorGender === newGender) return violation('same_gender');

  const anchorSpouseCount = concurrentSpouseIdsOf(snapshot, anchorId).length;
  // Anchor is the woman → she may have no other husband.
  if (anchorGender === 'F' && anchorSpouseCount >= 1) {
    return violation('woman_already_married');
  }
  // Anchor is the man → he may have at most four wives.
  if (anchorGender === 'M' && anchorSpouseCount >= MAX_WIVES) {
    return violation('man_four_wives');
  }
  return null;
}
