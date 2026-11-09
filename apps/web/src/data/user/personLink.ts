'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { authActionClient } from '@/lib/safe-action';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

export type PersonClaimRequest = {
  id: string;
  person_id: string;
  requester_user_id: string;
  tree_id: string | null;
  status: 'pending' | 'approved' | 'declined' | string;
  created_at: string;
  person_name_ar?: string | null;
  person_name_en?: string | null;
  requester_name?: string | null;
};

/**
 * Request to link the current account to an existing person ("Is this you?").
 * Goes through request_person_claim (approval flow). Direct claim_linked_person
 * remains for AddPersonForm linkAsSelf (created_by = tree owner) and for the
 * approve path inside respond_person_claim.
 */
export const linkMyPersonAction = authActionClient
  .schema(z.object({ personId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();

    const { data, error } = await supabase.rpc('request_person_claim', {
      p_person_id: parsedInput.personId,
    });
    if (error) {
      // Pass RPC codes / messages through; friendlyAuthError maps them to
      // bilingual copy instead of collapsing to the generic fallback.
      throw new Error(error.message);
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/requests');
    revalidatePath('/tree');
    revalidatePath('/register/complete');
    return {
      requestId: (data as string | null) ?? null,
      personId: parsedInput.personId,
      pending: true as const,
    };
  });

/**
 * Tree owner / admin responds to a pending person-claim request.
 * Approve path uses claim_linked_person server-side inside the RPC.
 */
export const respondPersonClaimAction = authActionClient
  .schema(
    z.object({
      claimId: z.string().uuid(),
      decision: z.enum(['approved', 'declined']),
    }),
  )
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();
    const { data, error } = await supabase.rpc('respond_person_claim', {
      p_claim_id: parsedInput.claimId,
      p_decision: parsedInput.decision,
    });
    if (error) throw new Error(error.message);

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/requests');
    revalidatePath('/tree');
    return { ok: true as const, result: data };
  });

/** Pending claim requests the current user can approve (tree owner / admin). */
export async function listIncomingPersonClaims(): Promise<PersonClaimRequest[]> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return [];
  const supabase = await createJuthoorSupabaseClient();

  const { data, error } = await supabase
    .from('person_claim_requests')
    .select('id, person_id, requester_user_id, tree_id, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];

  const rows = data as PersonClaimRequest[];
  if (rows.length === 0) return rows;

  const personIds = Array.from(new Set(rows.map((r) => r.person_id)));
  const requesterIds = Array.from(new Set(rows.map((r) => r.requester_user_id)));

  const [{ data: persons }, { data: profiles }] = await Promise.all([
    supabase
      .from('persons')
      .select('id, display_name_ar, display_name_en')
      .in('id', personIds),
    supabase
      .from('profiles')
      .select('id, display_name, display_name_ar')
      .in('id', requesterIds),
  ]);

  const personById = new Map(
    ((persons ?? []) as Array<{
      id: string;
      display_name_ar: string | null;
      display_name_en: string | null;
    }>).map((p) => [p.id, p]),
  );
  const nameById = new Map(
    ((profiles ?? []) as Array<{
      id: string;
      display_name: string | null;
      display_name_ar: string | null;
    }>).map((p) => [p.id, p.display_name_ar || p.display_name || null]),
  );

  return rows.map((r) => {
    const person = personById.get(r.person_id);
    return {
      ...r,
      person_name_ar: person?.display_name_ar ?? null,
      person_name_en: person?.display_name_en ?? null,
      requester_name: nameById.get(r.requester_user_id) ?? null,
    };
  });
}

/** Read the current user's linked person id, or null. */
export async function getLinkedPersonId(): Promise<string | null> {
  const userId = await getCachedLoggedInUserIdOrNull();
  if (!userId) return null;
  const supabase = await createJuthoorSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('linked_person_id, self_person_id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  const row = data as {
    linked_person_id: string | null;
    self_person_id: string | null;
  } | null;
  return row?.linked_person_id ?? row?.self_person_id ?? null;
}
