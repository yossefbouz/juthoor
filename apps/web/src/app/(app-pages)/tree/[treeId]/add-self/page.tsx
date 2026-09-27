import { notFound } from 'next/navigation';

import { AddPersonForm } from '@/components/tree/AddPersonForm';
import { AddSelfHeader } from '@/components/tree/AddSelfHeader';
import { getTreeById } from '@/data/anon/trees';
import { getTreePersons } from '@/data/anon/persons';

interface Props {
  readonly params: Promise<{ readonly treeId: string }>;
}

/**
 * Step 3 bootstrap: after auto-creating the tree, we route the user
 * here so the very first person they add is themselves. This anchors
 * the whole tree and gives the 360° view a centre to focus on.
 */
export default async function AddSelfPage({ params }: Props) {
  const { treeId } = await params;
  const tree = await getTreeById(treeId);
  if (!tree) notFound();
  const persons = await getTreePersons(treeId).catch(() => []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-8">
      <AddSelfHeader />

      <AddPersonForm treeId={treeId} mode="self" persons={persons} />
    </div>
  );
}
