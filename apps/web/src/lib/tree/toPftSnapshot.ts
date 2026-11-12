/**
 * Build a FamilyChart-compatible TreeSnapshot from a PFT identity group.
 *
 * Confirmed person_links are identity (same_as) edges, not blood kin. For
 * layout we hang every non-root member under a synthetic family with the
 * group root as the sole recorded parent (phantoms fill the other slot).
 * That is visualization-only — label the chart "linked identities".
 *
 * same_as pairs are returned separately so the chart can draw dashed
 * identity edges on top of the synthetic family connectors.
 */

import type { PftIdentityGroup } from '@/data/user/pft';

import type { FamilyChildLink, FamilyView, PersonView, TreeSnapshot } from './types';

export type PftSameAsEdge = {
  readonly a: string;
  readonly b: string;
  readonly linkId: string;
};

export type PftChartModel = {
  readonly snapshot: TreeSnapshot;
  readonly rootPersonId: string;
  /** personId → treeId for deep links into each person's own tree. */
  readonly treeIdByPerson: ReadonlyMap<string, string>;
  readonly sameAsEdges: readonly PftSameAsEdge[];
};

export function toPftChartModel(group: PftIdentityGroup): PftChartModel | null {
  if (group.members.length === 0) return null;

  const treeIdByPerson = new Map(
    group.members.map((m) => [m.personId, m.treeId] as const),
  );

  const rootPersonId = group.members.some((m) => m.personId === group.canonicalPersonId)
    ? group.canonicalPersonId
    : group.members[0].personId;

  const persons: PersonView[] = group.members.map((m) => ({
    id: m.personId,
    gender: 'U',
    displayNameAr: m.nameAr,
    displayNameEn: m.nameEn,
    isPlaceholder: false,
    birthYear: null,
    deathYear: null,
    placeOfOriginId: null,
  }));

  const others = group.members.filter((m) => m.personId !== rootPersonId);
  const families: FamilyView[] = [];
  const familyChildren: FamilyChildLink[] = [];

  if (others.length > 0) {
    const familyId = `pft-fam-${group.groupId}`;
    families.push({
      id: familyId,
      partner1Id: rootPersonId,
      partner2Id: null,
      isDissolved: false,
    });
    others.forEach((m, i) => {
      familyChildren.push({
        familyId,
        childId: m.personId,
        pedigree: 'other',
        birthOrder: i + 1,
      });
    });
  }

  const sameAsEdges: PftSameAsEdge[] = group.links.map((l) => ({
    a: l.person_a_id,
    b: l.person_b_id,
    linkId: l.link_id,
  }));

  return {
    snapshot: { persons, families, familyChildren },
    rootPersonId,
    treeIdByPerson,
    sameAsEdges,
  };
}
