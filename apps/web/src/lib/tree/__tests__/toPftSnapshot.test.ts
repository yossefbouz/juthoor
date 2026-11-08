import { describe, expect, it } from 'vitest';

import type { PftIdentityGroup } from '@/data/user/pft';
import { toPftChartModel } from '@/lib/tree/toPftSnapshot';

const group: PftIdentityGroup = {
  groupId: 'g1',
  canonicalPersonId: 'p1',
  links: [
    {
      link_id: 'l1',
      person_a_id: 'p1',
      person_b_id: 'p2',
      tree_a_id: 't1',
      tree_b_id: 't2',
      name_a_ar: 'أحمد',
      name_a_en: 'Ahmad',
      name_b_ar: 'أحمد',
      name_b_en: 'Ahmad',
      canonical_person_id: 'p1',
      group_id: 'g1',
    },
  ],
  members: [
    { personId: 'p1', treeId: 't1', nameAr: 'أحمد', nameEn: 'Ahmad' },
    { personId: 'p2', treeId: 't2', nameAr: 'أحمد', nameEn: 'Ahmad' },
  ],
};

describe('toPftChartModel', () => {
  it('builds a synthetic family under the canonical root with same_as edges', () => {
    const model = toPftChartModel(group);
    expect(model).not.toBeNull();
    expect(model!.rootPersonId).toBe('p1');
    expect(model!.snapshot.persons).toHaveLength(2);
    expect(model!.snapshot.families).toHaveLength(1);
    expect(model!.snapshot.familyChildren).toEqual([
      expect.objectContaining({ childId: 'p2', pedigree: 'other' }),
    ]);
    expect(model!.sameAsEdges).toEqual([
      { a: 'p1', b: 'p2', linkId: 'l1' },
    ]);
    expect(model!.treeIdByPerson.get('p2')).toBe('t2');
  });

  it('returns null for an empty group', () => {
    expect(
      toPftChartModel({ ...group, members: [], links: [] }),
    ).toBeNull();
  });
});
