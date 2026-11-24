import { describe, expect, it } from 'vitest';

import { buildRelationshipItems, type RelationshipFlagRow } from '../relationshipFlags';
import { buildNeighbors } from '../relationships';
import { multiSpouseFixture, nuclearFamilyFixture, orphanFixture } from './fixtures';

const OWNER = 'u-owner';
const MEMBER = 'u-member';

const row = (overrides: Partial<RelationshipFlagRow>): RelationshipFlagRow => ({
  id: 'd-1',
  person_a: 'p-sami',
  person_b: 'p-ahmad',
  relation_type: 'parent',
  status: 'open',
  raised_by: MEMBER,
  note: null,
  ...overrides,
});

describe('buildRelationshipItems', () => {
  it('lists both parents of a child, each as a parent link', () => {
    const items = buildRelationshipItems(buildNeighbors(nuclearFamilyFixture, 'p-sami'), [], {
      userId: MEMBER,
      treeOwnerId: OWNER,
    });
    expect(items.map((i) => [i.role, i.personId, i.relationType])).toEqual([
      ['father', 'p-ahmad', 'parent'],
      ['mother', 'p-fatima', 'parent'],
    ]);
    expect(items.every((i) => !i.validated && i.openDisputes.length === 0)).toBe(true);
  });

  it('lists every spouse and every child of a parent', () => {
    const items = buildRelationshipItems(buildNeighbors(multiSpouseFixture, 'p-ahmad'), [], {
      userId: OWNER,
      treeOwnerId: OWNER,
    });
    expect(items.filter((i) => i.role === 'spouse').map((i) => i.personId)).toEqual([
      'p-mariam',
      'p-hafsa',
    ]);
    expect(items.filter((i) => i.role === 'child').map((i) => i.personId)).toEqual([
      'p-yusuf',
      'p-omar',
      'p-sara',
    ]);
    expect(items.filter((i) => i.role === 'child').every((i) => i.relationType === 'parent')).toBe(
      true,
    );
  });

  it('returns nothing for a person with no parents, spouses or children', () => {
    const snapshot = orphanFixture;
    const focusId = snapshot.persons[0].id;
    expect(
      buildRelationshipItems(buildNeighbors(snapshot, focusId), [], {
        userId: MEMBER,
        treeOwnerId: OWNER,
      }),
    ).toEqual([]);
  });

  it('shows a Validated flag set from the other person\'s page', () => {
    // Validated on the child's page (child, father) and read on the father's page.
    const rows = [row({ status: 'validated', person_a: 'p-sami', person_b: 'p-ahmad' })];
    const items = buildRelationshipItems(buildNeighbors(nuclearFamilyFixture, 'p-ahmad'), rows, {
      userId: OWNER,
      treeOwnerId: OWNER,
    });
    expect(items.find((i) => i.personId === 'p-sami')?.validated).toBe(true);
    expect(items.find((i) => i.personId === 'p-layla')?.validated).toBe(false);
    expect(items.find((i) => i.personId === 'p-fatima')?.validated).toBe(false);
  });

  it('keeps a spouse flag and a parent flag apart', () => {
    const rows = [
      row({ status: 'validated', person_a: 'p-ahmad', person_b: 'p-fatima', relation_type: 'parent' }),
    ];
    const items = buildRelationshipItems(buildNeighbors(nuclearFamilyFixture, 'p-ahmad'), rows, {
      userId: OWNER,
      treeOwnerId: OWNER,
    });
    expect(items.find((i) => i.role === 'spouse')?.validated).toBe(false);
  });

  it('gives the tree owner the open dispute and a way to message who raised it', () => {
    const rows = [row({ note: 'Wrong father' })];
    const items = buildRelationshipItems(buildNeighbors(nuclearFamilyFixture, 'p-sami'), rows, {
      userId: OWNER,
      treeOwnerId: OWNER,
    });
    expect(items.find((i) => i.role === 'father')?.openDisputes).toEqual([
      { id: 'd-1', note: 'Wrong father', mine: false, canMessage: true },
    ]);
    expect(items.find((i) => i.role === 'mother')?.openDisputes).toEqual([]);
  });

  it('marks the viewer\'s own dispute and lets them message the tree owner', () => {
    const items = buildRelationshipItems(buildNeighbors(nuclearFamilyFixture, 'p-sami'), [row({})], {
      userId: MEMBER,
      treeOwnerId: OWNER,
    });
    expect(items[0].openDisputes).toEqual([
      { id: 'd-1', note: null, mine: true, canMessage: true },
    ]);
  });

  it('offers no conversation to a collaborator or for the owner\'s own dispute', () => {
    const neighbors = buildNeighbors(nuclearFamilyFixture, 'p-sami');
    const asCollaborator = buildRelationshipItems(neighbors, [row({})], {
      userId: 'u-collaborator',
      treeOwnerId: OWNER,
    });
    expect(asCollaborator[0].openDisputes[0]).toMatchObject({ mine: false, canMessage: false });

    const ownersOwn = buildRelationshipItems(neighbors, [row({ raised_by: OWNER })], {
      userId: OWNER,
      treeOwnerId: OWNER,
    });
    expect(ownersOwn[0].openDisputes[0]).toMatchObject({ mine: true, canMessage: false });
  });

  it('ignores closed disputes', () => {
    const rows = [row({ status: 'resolved' }), row({ id: 'd-2', status: 'dismissed' })];
    const items = buildRelationshipItems(buildNeighbors(nuclearFamilyFixture, 'p-sami'), rows, {
      userId: OWNER,
      treeOwnerId: OWNER,
    });
    expect(items[0].openDisputes).toEqual([]);
    expect(items[0].validated).toBe(false);
  });
});
