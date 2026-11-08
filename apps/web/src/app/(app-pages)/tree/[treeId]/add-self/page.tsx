import { notFound } from 'next/navigation';

import { AddPersonForm } from '@/components/tree/AddPersonForm';
import { AddSelfHeader } from '@/components/tree/AddSelfHeader';
import { IsThisYouPanel } from '@/components/tree/IsThisYouPanel';
import { getTreeById } from '@/data/anon/trees';
import { getTreePersons } from '@/data/anon/persons';
import { getLinkedPersonId } from '@/data/user/personLink';

interface Props {
  readonly params: Promise<{ readonly treeId: string }>;
}

/**
 * Step 3 bootstrap: after auto-creating the tree, we route the user
 * here so the very first person they add is themselves. This anchors
 * the whole tree and gives the 360° view a centre to focus on.
 *
 * W2.4: before creating a new self row, offer a master-tree search so
 * the user can confirm "Is this you?" and set linked_person_id.
 */
export default async function AddSelfPage({ params }: Props) {
  const { treeId } = await params;
  const tree = await getTreeById(treeId);
  if (!tree) notFound();
  const [persons, linkedPersonId] = await Promise.all([
    getTreePersons(treeId).catch(() => []),
    getLinkedPersonId().catch(() => null),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-8">
      <AddSelfHeader />

      <IsThisYouPanel alreadyLinked={Boolean(linkedPersonId)} />

      <AddPersonForm treeId={treeId} mode="self" persons={persons} />
    </div>
  );
}
