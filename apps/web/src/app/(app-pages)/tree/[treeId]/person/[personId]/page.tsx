import { notFound } from 'next/navigation';

import { AddChildCard } from '@/components/tree/AddChildCard';
import { PersonPageHeader } from '@/components/tree/PersonPageHeader';
import { TreeView360 } from '@/components/tree/TreeView360';
import { DisplacementPanel } from '@/components/person/DisplacementPanel';
import { EvidencePanel } from '@/components/person/EvidencePanel';
import { FieldGrantsPanel } from '@/components/person/FieldGrantsPanel';
import { DisputeRelationshipButton } from '@/components/person/DisputeRelationshipButton';
import { PersonAccessLogger } from '@/components/person/PersonAccessLogger';
import { PersonContactPanel } from '@/components/person/PersonContactPanel';
import { PersonStoryPanel } from '@/components/person/PersonStoryPanel';
import { getPerson, getTreePersons } from '@/data/anon/persons';
import { getViewerTreeSnapshot } from '@/data/anon/treeSnapshot';
import { getPrimaryPhotoUrl } from '@/data/user/attachments';
import {
  loadPersonDisplacement,
  loadUnrwaEvidenceAttachmentId,
} from '@/data/user/personDisplacement';
import {
  listGrantCandidates,
  listPersonFieldGrants,
} from '@/data/user/personFieldGrants';
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

  const isLiving = Boolean((person as { is_living?: boolean }).is_living);

  const [
    snapshot,
    allPersons,
    primaryPhotoUrl,
    canManage,
    personProfile,
    displacement,
    unrwaEvidenceId,
    canEditOptional,
    canManageGrants,
    fieldGrants,
    grantCandidates,
  ] = await Promise.all([
    getViewerTreeSnapshot(treeId),
    getTreePersons(treeId),
    getPrimaryPhotoUrl(personId),
    viewerCanManage(treeId),
    loadPersonProfile(personId).catch(() => null),
    loadPersonDisplacement(personId).catch(() => null),
    loadUnrwaEvidenceAttachmentId(personId).catch(() => null),
    (async () => {
      const supabase = await createJuthoorSupabaseClient();
      const { data } = await supabase.rpc('can_edit_optional_person_fields', {
        p_person_id: personId,
      });
      return Boolean(data);
    })().catch(() => false),
    (async () => {
      // Field grants: record owner, admin, or tree owner of an unclaimed living person.
      if (!isLiving) return false;
      const supabase = await createJuthoorSupabaseClient();
      const uid = await getCachedLoggedInUserIdOrNull();
      if (!uid) return false;

      const { data: isOwner } = await supabase.rpc('is_record_owner', {
        p_person_id: personId,
      });
      if (isOwner) return true;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', uid)
        .maybeSingle();
      if ((profile as { is_admin?: boolean } | null)?.is_admin) return true;

      const { data: tree } = await supabase
        .from('trees')
        .select('owner_id')
        .eq('id', treeId)
        .maybeSingle();
      if ((tree as { owner_id: string } | null)?.owner_id !== uid) return false;

      // Unclaimed: no other (or self) profile has linked_person_id = this person.
      const { data: claimer } = await supabase
        .from('profiles')
        .select('id')
        .eq('linked_person_id', personId)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      return !claimer;
    })().catch(() => false),
    isLiving
      ? listPersonFieldGrants(personId).catch(() => [])
      : Promise.resolve([]),
    isLiving
      ? listGrantCandidates(treeId).catch(() => [])
      : Promise.resolve([]),
  ]);
  const neighbors = buildNeighbors(snapshot, personId);

  // primaryPhotoId is on persons row (added by attachments migration)
  const primaryPhotoId = (person as { primary_photo_id?: string | null }).primary_photo_id ?? null;
  const needsCompletion = Boolean(
    (person as { needs_completion?: boolean | null }).needs_completion,
  );

  const hasDisplacementContent = Boolean(
    displacement?.unrwa_registration_number ||
      displacement?.family_card_1948_number ||
      displacement?.host_country_first ||
      displacement?.host_country_current ||
      displacement?.refugee_status ||
      displacement?.camp_name ||
      displacement?.displacement_year ||
      displacement?.displacement_wave ||
      displacement?.land_property_notes ||
      displacement?.oral_history ||
      displacement?.oral_history_provenance ||
      displacement?.unrwa_field_of_operations ||
      displacement?.unrwa_registration_date ||
      displacement?.unrwa_registration_status ||
      displacement?.unrwa_services_area ||
      displacement?.host_travel_document_number ||
      displacement?.host_id_residency_number ||
      displacement?.pa_id_number ||
      displacement?.palestinian_passport_number ||
      displacement?.other_identity_document ||
      displacement?.land_record_reference ||
      displacement?.land_registry ||
      displacement?.property_location ||
      displacement?.ownership_nature ||
      (canEditOptional && displacement?.israeli_id_number),
  );
  const hasStoryContent = Boolean(
    personProfile?.achievements_ar ||
      personProfile?.achievements_en ||
      personProfile?.contribution_ar ||
      personProfile?.contribution_en,
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PersonAccessLogger personId={personId} resourceType="person_page" enabled={isLiving} />
      <PersonAccessLogger
        personId={personId}
        resourceType="person_displacement"
        enabled={hasDisplacementContent}
      />
      <PersonAccessLogger
        personId={personId}
        resourceType="person_story"
        enabled={hasStoryContent}
      />

      <PersonPageHeader
        treeId={treeId}
        person={person}
        photoUrl={primaryPhotoUrl}
        allPersons={allPersons}
        needsCompletion={needsCompletion}
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

      <div className="flex flex-wrap items-center gap-3">
        <DisputeRelationshipButton
          treeId={treeId}
          focusPersonId={personId}
          relatedPersonId={
            neighbors.parents.father?.id ?? neighbors.parents.mother?.id ?? null
          }
          relationType="parent"
        />
      </div>

      <PersonStoryPanel
        personId={personId}
        initialProfile={personProfile}
        canManage={canEditOptional}
        isLiving={isLiving}
      />

      <DisplacementPanel
        personId={personId}
        treeId={treeId}
        initial={displacement}
        canManage={canEditOptional}
        initialUnrwaEvidenceId={unrwaEvidenceId}
      />

      <PersonContactPanel personId={personId} />

      {canManageGrants ? (
        <FieldGrantsPanel
          personId={personId}
          treeId={treeId}
          initialGrants={fieldGrants}
          candidates={grantCandidates}
        />
      ) : null}

      {person.gender === 'M' ? (
        <AddChildCard treeId={treeId} fatherId={personId} persons={allPersons} />
      ) : null}
    </div>
  );
}
