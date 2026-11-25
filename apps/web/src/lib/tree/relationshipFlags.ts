/**
 * Validate / Dispute state for each relationship the person page shows
 * (AIO2 4.X.1.1.8). Pure: takes the 360° neighbours and the
 * relationship_disputes rows the viewer is allowed to read.
 */

import type { Neighbors, PersonView } from './types';

/** A relationship_disputes row as row-level security returned it to the viewer. */
export interface RelationshipFlagRow {
  readonly id: string;
  readonly person_a: string;
  readonly person_b: string;
  readonly relation_type: string;
  readonly status: string;
  readonly raised_by: string;
  readonly note: string | null;
}

export interface OpenDisputeView {
  readonly id: string;
  readonly note: string | null;
  /** The viewer raised this dispute. */
  readonly mine: boolean;
  /** The viewer is a party to the dispute thread (who raised it, or the tree owner). */
  readonly canMessage: boolean;
}

export type RelationshipRole = 'father' | 'mother' | 'spouse' | 'child';

export interface RelationshipItem {
  readonly role: RelationshipRole;
  readonly personId: string;
  readonly nameAr: string | null;
  readonly nameEn: string | null;
  /**
   * Stored relation_type. A parent-child link is 'parent' from either
   * person's page, so a flag set on the child's page shows on the parent's.
   */
  readonly relationType: 'parent' | 'spouse';
  readonly validated: boolean;
  readonly openDisputes: readonly OpenDisputeView[];
}

export interface RelationshipViewer {
  readonly userId: string | null;
  readonly treeOwnerId: string | null;
}

export function buildRelationshipItems(
  neighbors: Neighbors,
  rows: readonly RelationshipFlagRow[],
  viewer: RelationshipViewer,
): RelationshipItem[] {
  const focusId = neighbors.focus.id;
  const related: Array<{ role: RelationshipRole; person: PersonView }> = [];
  if (neighbors.parents.father) related.push({ role: 'father', person: neighbors.parents.father });
  if (neighbors.parents.mother) related.push({ role: 'mother', person: neighbors.parents.mother });
  for (const person of neighbors.spouses) related.push({ role: 'spouse', person });
  for (const group of neighbors.childrenByFamily) {
    for (const person of group.children) related.push({ role: 'child', person });
  }

  const seen = new Set<string>();
  const items: RelationshipItem[] = [];
  for (const { role, person } of related) {
    const relationType = role === 'spouse' ? 'spouse' : 'parent';
    const key = `${relationType}:${person.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const linkRows = rows.filter(
      (row) =>
        row.relation_type === relationType &&
        ((row.person_a === focusId && row.person_b === person.id) ||
          (row.person_a === person.id && row.person_b === focusId)),
    );
    items.push({
      role,
      personId: person.id,
      nameAr: person.displayNameAr,
      nameEn: person.displayNameEn,
      relationType,
      validated: linkRows.some((row) => row.status === 'validated'),
      openDisputes: linkRows
        .filter((row) => row.status === 'open')
        .map((row) => ({
          id: row.id,
          note: row.note,
          mine: row.raised_by === viewer.userId,
          // The thread is between who raised it and the tree owner; an owner's
          // own dispute has no thread.
          canMessage:
            row.raised_by !== viewer.treeOwnerId &&
            viewer.userId !== null &&
            (row.raised_by === viewer.userId || viewer.treeOwnerId === viewer.userId),
        })),
    });
  }
  return items;
}
