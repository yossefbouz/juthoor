import { describe, expect, it } from 'vitest';

import { buildNeighbors } from '../relationships';
import {
  multiSpouseFixture,
  nuclearFamilyFixture,
  orphanFixture,
  placeholderMotherFixture,
  soloParentFixture,
} from './fixtures';

describe('buildNeighbors — nuclear family', () => {
  it('returns both parents and the one sibling for a child focus', () => {
    const neighbors = buildNeighbors(nuclearFamilyFixture, 'p-sami');

    expect(neighbors.focus.id).toBe('p-sami');
    expect(neighbors.parents.father?.id).toBe('p-ahmad');
    expect(neighbors.parents.mother?.id).toBe('p-fatima');
    expect(neighbors.parents.familyId).toBe('f-1');
    expect(neighbors.siblings.map((p) => p.id)).toEqual(['p-layla']);
    expect(neighbors.spouses).toEqual([]);
    expect(neighbors.childrenByFamily).toEqual([]);
  });

  it('assigns the male partner to father and female to mother regardless of column order', () => {
    const flipped = {
      ...nuclearFamilyFixture,
      families: [
        // Swap so that mother is partner1 and father is partner2.
        { id: 'f-1', partner1Id: 'p-fatima', partner2Id: 'p-ahmad', isDissolved: false },
      ],
    };
    const neighbors = buildNeighbors(flipped, 'p-sami');
    expect(neighbors.parents.father?.id).toBe('p-ahmad');
    expect(neighbors.parents.mother?.id).toBe('p-fatima');
  });

  it('returns parents with self-person focus seeing no siblings when none exist', () => {
    const onlyChild = {
      ...nuclearFamilyFixture,
      familyChildren: [{ familyId: 'f-1', childId: 'p-sami', pedigree: 'birth' as const, birthOrder: 1 }],
    };
    const neighbors = buildNeighbors(onlyChild, 'p-sami');
    expect(neighbors.siblings).toEqual([]);
  });
});

describe('buildNeighbors — multi-spouse father', () => {
  it('groups children by family so each mother has her own group', () => {
    const neighbors = buildNeighbors(multiSpouseFixture, 'p-ahmad');

    expect(neighbors.spouses.map((p) => p.id).sort()).toEqual([
      'p-hafsa',
      'p-mariam',
    ]);

    // Two groups, one per family.
    expect(neighbors.childrenByFamily).toHaveLength(2);

    const f1 = neighbors.childrenByFamily.find((g) => g.familyId === 'f-1');
    const f2 = neighbors.childrenByFamily.find((g) => g.familyId === 'f-2');

    expect(f1?.otherParentId).toBe('p-mariam');
    expect(f1?.children.map((c) => c.id)).toEqual(['p-yusuf']);

    expect(f2?.otherParentId).toBe('p-hafsa');
    expect(f2?.children.map((c) => c.id)).toEqual(['p-omar', 'p-sara']);
  });

  it('half-siblings are surfaced correctly: focus on YUSUF sees OMAR and SARA as siblings', () => {
    const neighbors = buildNeighbors(multiSpouseFixture, 'p-yusuf');
    // Yusuf's family-of-origin is f-1 (Ahmad+Mariam). His half-siblings
    // come from Ahmad's other family f-2 (Omar, Sara). Full-siblings: none.
    const siblingIds = neighbors.siblings.map((p) => p.id).sort();
    expect(siblingIds).toEqual(['p-omar', 'p-sara']);
  });
});

describe('buildNeighbors — placeholder mother', () => {
  it('surfaces the placeholder mother as a valid parent slot', () => {
    const neighbors = buildNeighbors(placeholderMotherFixture, 'p-huda');
    expect(neighbors.parents.father?.id).toBe('p-abbas');
    expect(neighbors.parents.mother?.id).toBe('p-ph-1');
    expect(neighbors.parents.mother?.isPlaceholder).toBe(true);
  });
});

describe('buildNeighbors — solo parent (no partner linked)', () => {
  it('returns father and null mother when only one partner is set on the family row', () => {
    const neighbors = buildNeighbors(soloParentFixture, 'p-noor');
    expect(neighbors.parents.father?.id).toBe('p-khalid');
    expect(neighbors.parents.mother).toBeNull();
    expect(neighbors.parents.familyId).toBe('f-1');
  });
});

describe('buildNeighbors — orphan', () => {
  it('returns empty parents/siblings/spouses/children for a person with no family records', () => {
    const neighbors = buildNeighbors(orphanFixture, 'p-alone');
    expect(neighbors.parents.father).toBeNull();
    expect(neighbors.parents.mother).toBeNull();
    expect(neighbors.parents.familyId).toBeNull();
    expect(neighbors.siblings).toEqual([]);
    expect(neighbors.spouses).toEqual([]);
    expect(neighbors.childrenByFamily).toEqual([]);
  });
});

describe('buildNeighbors — error cases', () => {
  it('throws when the focus id is not in the snapshot', () => {
    expect(() => buildNeighbors(nuclearFamilyFixture, 'p-nonexistent')).toThrow(
      /focus person/i
    );
  });
});
