import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { getTreeById } from '@/data/anon/trees';
import { getTreePersons } from '@/data/anon/persons';
import { getTreeSnapshot } from '@/data/anon/treeSnapshot';

import { EmptyTreeBanner } from '@/components/tree/EmptyTreeBanner';
import { TreePageHeader } from '@/components/tree/TreePageHeader';
import { TreeWorkspace } from '@/components/tree/TreeWorkspace';

interface Props {
  readonly params: Promise<{ readonly treeId: string }>;
  readonly searchParams: Promise<{
    readonly root?: string;
    readonly selected?: string;
  }>;
}

/**
 * Tree landing — now shows the actual family chart by default. When the
 * tree is empty, a friendly "add your first person" CTA replaces the chart.
 * Replaces the previous redirect-to-add-self pattern, which was opaque
 * and hid the chart from users who landed via a shared link.
 *
 * `?root=<personId>` URL param re-roots the chart at that person — used by
 * the per-card "View tree" context-menu action and Family Search results
 * that want to land on the oldest known ancestor.
 */
export default async function TreePage({ params, searchParams }: Props) {
  const { treeId } = await params;
  const { root: rootParam } = await searchParams;

  const tree = await getTreeById(treeId);
  if (!tree) notFound();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <TreePageHeader treeId={treeId} treeName={tree.name} treeDescription={tree.description} />

      <Suspense fallback={<TreeLoadingSkeleton />}>
        <TreeChartOrEmpty treeId={treeId} requestedRoot={rootParam} />
      </Suspense>
    </div>
  );
}

async function TreeChartOrEmpty({
  treeId,
  requestedRoot,
}: {
  readonly treeId: string;
  readonly requestedRoot?: string;
}) {
  const [snapshot, persons] = await Promise.all([
    getTreeSnapshot(treeId),
    getTreePersons(treeId),
  ]);

  if (persons.length === 0) {
    return <EmptyTreeBanner treeId={treeId} />;
  }

  // Honor ?root=<personId> if it's present AND points to someone in this
  // tree; otherwise fall back to the first person. Avoids 500s when the
  // URL carries a stale id from a deleted person.
  const rootPersonId =
    requestedRoot && persons.some((p) => p.id === requestedRoot)
      ? requestedRoot
      : persons[0].id;

  return (
    <TreeWorkspace
      treeId={treeId}
      snapshot={snapshot}
      rootPersonId={rootPersonId}
      persons={persons}
    />
  );
}

function TreeLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-[480px] w-full rounded-3xl" />
    </div>
  );
}
