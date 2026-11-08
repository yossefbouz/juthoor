'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { authActionClient } from '@/lib/safe-action';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

/**
 * Link the current account to an existing person (D1 / registration match 1.4).
 * Sets profiles.linked_person_id (mirrored to self_person_id by DB trigger).
 */
export const linkMyPersonAction = authActionClient
  .schema(z.object({ personId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const supabase = await createJuthoorSupabaseClient();

    const { data: person, error: personErr } = await supabase
      .from('persons')
      .select('id')
      .eq('id', parsedInput.personId)
      .maybeSingle();
    if (personErr) throw new Error(personErr.message);
    if (!person) throw new Error('Person not found or not accessible');

    // D10: another active account may already own this person.
    const { data: claimed } = await supabase
      .from('profiles')
      .select('id')
      .eq('linked_person_id', parsedInput.personId)
      .is('deleted_at', null)
      .neq('id', userId)
      .maybeSingle();
    if (claimed) {
      throw new Error(
        'This person is already linked to another account. Ask an administrator if you need to reclaim it.',
      );
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        linked_person_id: parsedInput.personId,
        self_person_id: parsedInput.personId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .is('deleted_at', null);

    if (error) {
      // Unique partial index on linked_person_id (active profiles).
      if (error.code === '23505' || /unique|duplicate/i.test(error.message)) {
        throw new Error(
          'This person is already linked to another account. Ask an administrator if you need to reclaim it.',
        );
      }
      throw new Error(error.message);
    }

    revalidatePath('/dashboard');
    revalidatePath('/tree');
    revalidatePath('/register/complete');
    return { linkedPersonId: parsedInput.personId };
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
