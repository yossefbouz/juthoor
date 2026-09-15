'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { useLocale } from '@/contexts/LocaleContext';
import type { PersonView, TreeSnapshot } from '@/lib/tree/types';
import type { Person } from '@/types/database';

import { FamilyChart } from './FamilyChart';
import { TreeSidePanel, type AddKind } from './TreeSidePanel';

interface Props {
  readonly treeId: string;
  readonly snapshot: TreeSnapshot;
  readonly rootPersonId: string;
  /** Full DB Person rows — needed by the inline AddPerson form. */
  readonly persons: readonly Person[];
}

const ADD_KINDS: readonly AddKind[] = ['parent', 'child', 'spouse', 'sibling'];

/**
 * Two-column layout: action panel + chart.
 *
 * Selection lives in the `?selected=<personId>` URL param. ChartNode
 * Links navigate to `?selected=...` (shallow update — no server round
 * trip), the panel reads the param via `useSearchParams`. URL state was
 * chosen over React context so the selection survives refresh and is
 * shareable, and so the chart and panel stay decoupled.
 *
 * `?add=<kind>` (set by the chart cards' `+` buttons) opens the panel's
 * add-relative sheet for the selected person — inline, no page change.
 *
 * Defaults: when nothing is selected, the panel shows an empty/help
 * state. When the URL points at a stale id, we fall back to nothing
 * selected rather than crashing.
 */
export function TreeWorkspace({
  treeId,
  snapshot,
  rootPersonId,
  persons,
}: Props) {
  const { dir } = useLocale();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('selected');
  const addParam = searchParams.get('add');

  const personById = useMemo(
    () => new Map(snapshot.persons.map((p) => [p.id, p])),
    [snapshot.persons],
  );

  const selected: PersonView | null =
    (selectedId && personById.get(selectedId)) || null;

  const initialAddKind: AddKind | null = ADD_KINDS.includes(
    addParam as AddKind,
  )
    ? (addParam as AddKind)
    : null;

  return (
    <div
      dir={dir}
      className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6"
    >
      <div className="md:order-2 md:flex-1 md:min-w-0">
        <FamilyChart
          treeId={treeId}
          snapshot={snapshot}
          rootPersonId={rootPersonId}
          selectedPersonId={selected?.id ?? null}
        />
      </div>
      <div className="md:order-1 md:w-80 md:flex-none">
        {/*
          Explicit width pins the panel at 320 px (Tailwind w-80) so the
          chart's intrinsic-content width can't squeeze it off the right
          edge. Without this, FamilyChart's wide canvas + flex-1 was
          collapsing the panel down to ~80 px on 1568-px viewports.
        */}
        <TreeSidePanel
          treeId={treeId}
          selected={selected}
          rootPersonId={rootPersonId}
          personCount={snapshot.persons.length}
          persons={persons}
          families={snapshot.families}
          initialAddKind={initialAddKind}
        />
      </div>
    </div>
  );
}
