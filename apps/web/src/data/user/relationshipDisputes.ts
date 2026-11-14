'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import { revalidatePath } from 'next/cache';

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

/** W3.6: dispute a relationship and notify the tree owner. */
export async function raiseRelationshipDisputeAction(
  input: z.input<typeof RaiseSchema>,
): Promise<RelationshipDispute> {
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
  revalidatePath(`/tree/${parsed.treeId}/person/${parsed.personA}`);
  return data as RelationshipDispute;
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
