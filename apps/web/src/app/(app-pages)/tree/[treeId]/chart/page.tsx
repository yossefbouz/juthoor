import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { T } from '@/components/ui/Typography';
import { FamilyChart } from '@/components/tree/FamilyChart';
import { getTreeById } from '@/data/anon/trees';
import { getTreePersons } from '@/data/anon/persons';
import { getViewerTreeSnapshot } from '@/data/anon/treeSnapshot';

interface Props {
  readonly params: Promise<{ readonly treeId: string }>;
}

/**
 * Full-tree chart view powered by `relatives-tree`. Complements the
 * 360° person-centric view by letting the user see everyone at once
 * with pan + zoom. Click any tile to jump back to the 360° view of
 * that person.
 */
export default async function ChartPage({ params }: Props) {
  const { treeId } = await params;

  const tree = await getTreeById(treeId);
  if (!tree) notFound();

  const [snapshot, persons] = await Promise.all([
    getViewerTreeSnapshot(treeId),
    getTreePersons(treeId),
  ]);

  // Root the chart at the first person the user added (oldest
  // created_at). Users can re-centre the 360° view by clicking any tile.
  const rootPerson = persons[0] ?? null;

  return (
    <div dir="rtl" className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <T.H1>المخطط الكامل</T.H1>
          <T.P className="text-muted-foreground">
            شجرة {tree.name} بعرض شامل — انقر أي شخص للعودة إلى العرض الدائري.
          </T.P>
        </div>
        <Link href={`/tree/${treeId}`}>
          <Button variant="outline">العودة للشجرة</Button>
        </Link>
      </header>

      {rootPerson ? (
        <FamilyChart
          treeId={treeId}
          snapshot={snapshot}
          rootPersonId={rootPerson.id}
        />
      ) : (
        <div className="rounded border p-6 text-center text-muted-foreground">
          أضف شخصًا واحدًا على الأقل لعرض المخطط.
        </div>
      )}
    </div>
  );
}
