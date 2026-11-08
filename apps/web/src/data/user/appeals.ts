'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { authActionClient } from '@/lib/safe-action';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

/**
 * User submits an appeal against their own rejected identity verification.
 * RLS requires appellant_id = auth.uid() and ownership of the verification row.
 */
export const submitVerificationAppealAction = authActionClient
  .schema(
    z.object({
      verificationId: z.string().uuid(),
      reason: z.string().trim().min(10).max(2000),
    }),
  )
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const supabase = await createJuthoorSupabaseClient();

    const { data: verification, error: vErr } = await supabase
      .from('identity_verifications')
      .select('id, user_id, status')
      .eq('id', parsedInput.verificationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!verification) throw new Error('Verification not found');
    if (verification.status !== 'rejected') {
      throw new Error('Only rejected verifications can be appealed');
    }

    const { data: open } = await supabase
      .from('verification_appeals')
      .select('id')
      .eq('verification_id', parsedInput.verificationId)
      .eq('appellant_id', userId)
      .eq('status', 'open')
      .maybeSingle();
    if (open) throw new Error('An open appeal already exists for this verification');

    const { error } = await supabase.from('verification_appeals').insert({
      verification_id: parsedInput.verificationId,
      appellant_id: userId,
      reason: parsedInput.reason,
      status: 'open',
    });
    if (error) throw new Error(error.message);

    revalidatePath('/verify');
    revalidatePath('/admin/appeals');
    return { ok: true as const };
  });

/** Current user's open appeal for a verification, if any. */
export async function getMyOpenAppeal(
  verificationId: string,
): Promise<{ id: string; reason: string; created_at: string } | null> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return null;
  const supabase = await createJuthoorSupabaseClient();
  const { data } = await supabase
    .from('verification_appeals')
    .select('id, reason, created_at')
    .eq('verification_id', verificationId)
    .eq('appellant_id', uid)
    .eq('status', 'open')
    .maybeSingle();
  return (data as { id: string; reason: string; created_at: string } | null) ?? null;
}
