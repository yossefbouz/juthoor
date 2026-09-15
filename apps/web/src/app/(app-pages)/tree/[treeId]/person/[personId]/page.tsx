import { notFound } from 'next/navigation';

import { AddChildCard } from '@/components/tree/AddChildCard';
import { PersonPageHeader } from '@/components/tree/PersonPageHeader';
import { TreeView360 } from '@/components/tree/TreeView360';
import { EvidencePanel } from '@/components/person/EvidencePanel';
import { PersonStoryPanel } from '@/components/person/PersonStoryPanel';
import { getPerson, getTreePersons } from '@/data/anon/persons';
import { getTreeSnapshot } from '@/data/anon/treeSnapshot';
import { getPrimaryPhotoUrl } from '@/data/user/attachments';
import { loadPersonProfile } from '@/data/user/personProfiles';
import { buildNeighbors } from '@/lib/tree/relationships';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

interface Props {
  readonly params: Promise<{
    readonly treeId: string;
    readonly personId: string;
  }>;
}

/**
 * Determine whether the current viewer can upload / delete attachments on this
 * person — i.e. they are the tree owner or an approved collaborator (not read-only).
 * Read-only members can VIEW evidence but not modify it.
 */
async function viewerCanManage(treeId: string): Promise<boolean> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return false;
  const supabase = await createJuthoorSupabaseClient();

  const { data: tree } = await supabase
    .from('trees')
    .select('owner_id')
    .eq('id', treeId)
    .maybeSingle();
  if ((tree as { owner_id: string } | null)?.owner_id === uid) return true;

  const { data: member } = await supabase
    .from('tree_members')
    .select('role, status')
    .eq('tree_id', treeId)
    .eq('user_id', uid)
    .maybeSingle();
  const m = member as { role: string; status: string } | null;
  return m?.status === 'approved' && (m.role === 'owner' || m.role === 'collaborator');
}

export default async function PersonPage({ params }: Props) {
  const { treeId, personId } = await params;

  const person = await getPerson(personId);
  if (!person) notFound();

  const [snapshot, allPersons, primaryPhotoUrl, canManage, personProfile] =
    await Promise.all([
      getTreeSnapshot(treeId),
      getTreePersons(treeId),
      getPrimaryPhotoUrl(personId),
      viewerCanManage(treeId),
      loadPersonProfile(personId).catch(() => null),
    ]);
  const neighbors = buildNeighbors(snapshot, personId);

  // primaryPhotoId is on persons row (added by attachments migration)
  const primaryPhotoId = (person as { primary_photo_id?: string | null }).primary_photo_id ?? null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PersonPageHeader
        treeId={treeId}
        person={person}
        photoUrl={primaryPhotoUrl}
        allPersons={allPersons}
      />

      {/* Side-by-side on desktop: 360° tree on the start, evidence on the end.
          Stacks vertically below md so mobile keeps the wheel front-and-centre. */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0">
          <TreeView360 treeId={treeId} neighbors={neighbors} />
        </div>
        <div className="min-w-0">
          <EvidencePanel
            treeId={treeId}
            personId={personId}
            initialPrimaryPhotoId={primaryPhotoId}
            canManage={canManage}
          />
        </div>
      </div>

      <PersonStoryPanel
        personId={personId}
        initialProfile={personProfile}
        canManage={canManage}
      />

      {person.gender === 'M' ? (
        <AddChildCard treeId={treeId} fatherId={personId} persons={allPersons} />
      ) : null}
    </div>
  );
}
