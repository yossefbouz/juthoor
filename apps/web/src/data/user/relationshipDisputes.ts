'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import { revalidatePath } from 'next/cache';
import type { RelationshipFlagRow } from '@/lib/tree/relationshipFlags';

export type RelationshipDispute = {
  id: string;
  tree_id: string;
  person_a: string;
  person_b: string;
  relation_type: string;
  status: string;
  raised_by: string;
  note: string | null;
  created_at: string;
};

const RaiseSchema = z.object({
  treeId: z.string().uuid(),
  personA: z.string().uuid(),
  personB: z.string().uuid(),
  relationType: z.string().trim().min(1).max(60),
  note: z.string().trim().max(1000).optional(),
});

/**
 * W3.6: dispute a relationship. The tree owner is notified and a message
 * thread with them is opened; `threadId` is null when the tree owner disputes
 * a link in their own tree (nobody to message).
 */
export async function raiseRelationshipDisputeAction(
  input: z.input<typeof RaiseSchema>,
): Promise<{ dispute: RelationshipDispute; threadId: string | null }> {
  const parsed = RaiseSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.rpc('raise_relationship_dispute', {
    p_tree_id: parsed.treeId,
    p_person_a: parsed.personA,
    p_person_b: parsed.personB,
    p_relation_type: parsed.relationType,
    p_note: parsed.note ?? null,
  });
  if (error) throw new Error(error.message);
  const dispute = data as RelationshipDispute;

  const { data: tree } = await supabase
    .from('trees')
    .select('owner_id')
    .eq('id', parsed.treeId)
    .maybeSingle();
  const ownerId = (tree as { owner_id: string } | null)?.owner_id ?? null;
  let threadId: string | null = null;
  if (ownerId && ownerId !== uid) {
    const { data: thread, error: threadError } = await supabase.rpc(
      'open_or_create_message_thread',
      { p_context_type: 'relationship_dispute', p_context_id: dispute.id },
    );
    if (threadError) throw new Error(threadError.message);
    threadId = thread as string;
  }

  revalidatePath(`/tree/${parsed.treeId}/person/${parsed.personA}`);
  return { dispute, threadId };
}

const ResolveSchema = z.object({
  disputeId: z.string().uuid(),
  status: z.enum(['resolved', 'dismissed']),
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
});

/** The tree owner or a collaborator closes an open dispute; the person who raised it is notified. */
export async function resolveRelationshipDisputeAction(
  input: z.input<typeof ResolveSchema>,
): Promise<RelationshipDispute> {
  const parsed = ResolveSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.rpc('resolve_relationship_dispute', {
    p_dispute_id: parsed.disputeId,
    p_status: parsed.status,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/tree/${parsed.treeId}/person/${parsed.personId}`);
  return data as RelationshipDispute;
}

const FlagsQuerySchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
});

/**
 * Validated flags and open disputes on this person's relationships, as far as
 * the viewer may read them: Validated is visible to everyone who can open the
 * tree; an open dispute only to who raised it, tree writers and admins.
 */
export async function listRelationshipFlags(input: {
  treeId: string;
  personId: string;
}): Promise<{
  rows: RelationshipFlagRow[];
  viewerId: string | null;
  treeOwnerId: string | null;
}> {
  const viewerId = await getCachedLoggedInUserIdOrNull();
  const parsed = FlagsQuerySchema.safeParse(input);
  if (!parsed.success) return { rows: [], viewerId, treeOwnerId: null };
  const { treeId, personId } = parsed.data;
  const supabase = await createJuthoorSupabaseClient();
  const [{ data: rows }, { data: tree }] = await Promise.all([
    supabase
      .from('relationship_disputes')
      .select('id, person_a, person_b, relation_type, status, raised_by, note')
      .eq('tree_id', treeId)
      .in('status', ['validated', 'open'])
      .or(`person_a.eq.${personId},person_b.eq.${personId}`),
    supabase.from('trees').select('owner_id').eq('id', treeId).maybeSingle(),
  ]);
  return {
    rows: (rows ?? []) as RelationshipFlagRow[],
    viewerId,
    treeOwnerId: (tree as { owner_id: string } | null)?.owner_id ?? null,
  };
}

/** AIO2 4.X.1.1.8 / Group A5: flag a relationship Validated. */
export async function validateRelationshipAction(
  input: z.input<typeof RaiseSchema>,
): Promise<RelationshipDispute> {
  const parsed = RaiseSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.rpc('validate_relationship', {
    p_tree_id: parsed.treeId,
    p_person_a: parsed.personA,
    p_person_b: parsed.personB,
    p_relation_type: parsed.relationType,
    p_note: parsed.note ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/tree/${parsed.treeId}/person/${parsed.personA}`);
  return data as RelationshipDispute;
}
