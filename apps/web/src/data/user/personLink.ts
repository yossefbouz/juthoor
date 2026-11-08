'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { authActionClient } from '@/lib/safe-action';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

/**
 * Link the current account to an existing person (D1).
 * Goes through claim_linked_person RPC so clients cannot PATCH linked_person_id
 * directly. Requires an approved identity verification (or admin).
 */
export const linkMyPersonAction = authActionClient
  .schema(z.object({ personId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();

    const { data, error } = await supabase.rpc('claim_linked_person', {
      p_person_id: parsedInput.personId,
    });
    if (error) {
      if (/already.?linked|already claimed/i.test(error.message)) {
        throw new Error(
          'This person is already linked to another account. Ask an administrator if you need to reclaim it.',
        );
      }
      if (/verification|not_authorized|42501/i.test(error.message)) {
        throw new Error(
          'Verify your identity before claiming a living person record, or ask an administrator.',
        );
      }
      throw new Error(error.message);
    }

    revalidatePath('/dashboard');
    revalidatePath('/tree');
    revalidatePath('/register/complete');
    return { linkedPersonId: (data as string | null) ?? parsedInput.personId };
  });

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
