import { notFound } from 'next/navigation';

import { AddPersonForm } from '@/components/tree/AddPersonForm';
import { AddPersonPageHeader } from '@/components/tree/AddPersonPageHeader';
import { getTreeById } from '@/data/anon/trees';
import { getTreeFamilies } from '@/data/anon/families';
import { getTreePersons } from '@/data/anon/persons';

interface Props {
  readonly params: Promise<{ readonly treeId: string }>;
  readonly searchParams: Promise<{
    readonly relativeTo?: string;
    readonly as?: string;
  }>;
}

export default async function AddPersonPage({ params, searchParams }: Props) {
  const { treeId } = await params;
  const { relativeTo, as: asKind } = await searchParams;
  const tree = await getTreeById(treeId);
  if (!tree) notFound();
  const [persons, familyRows] = await Promise.all([
    getTreePersons(treeId).catch(() => []),
    getTreeFamilies(treeId).catch(() => []),
  ]);
  const families = familyRows.map((f) => ({
    id: f.id,
    partner1Id: f.partner1_id,
    partner2Id: f.partner2_id,
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
      <AddPersonPageHeader />

      <AddPersonForm
        treeId={treeId}
        mode="general"
        persons={persons}
        families={families}
        initialAnchorPersonId={relativeTo ?? null}
        initialRelationshipKind={parseRelationshipKind(asKind)}
      />
    </div>
  );
}

function parseRelationshipKind(
  raw: string | undefined,
):
  | 'child'
  | 'parent'
  | 'spouse'
  | 'sibling'
  | 'self'
  | 'unrelated'
  | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (
    lower === 'child' ||
    lower === 'parent' ||
    lower === 'spouse' ||
    lower === 'sibling' ||
    lower === 'self' ||
    lower === 'unrelated'
  ) {
    return lower;
  }
  return undefined;
}
