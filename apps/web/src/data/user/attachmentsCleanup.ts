'use server';

import { z } from 'zod';
import { authActionClient } from '@/lib/safe-action';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';

/**
 * Remove an orphaned storage object after a failed attachment DB insert.
 * Runs as the authenticated user (not anon browser remove).
 */
export const removeOrphanedAttachmentObjectAction = authActionClient
  .schema(
    z.object({
      storagePath: z.string().min(1).max(500),
    }),
  )
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();
    const { error } = await supabase.storage
      .from('person-attachments')
      .remove([parsedInput.storagePath]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Delete an attachment row via the DEFINER RPC, then its file through the
 *  Storage API (the RPC returns the path; SQL cannot remove the stored file). */
export const deletePersonAttachmentAction = authActionClient
  .schema(z.object({ attachmentId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();
    const { data: path, error } = await supabase.rpc('delete_person_attachment', {
      p_attachment_id: parsedInput.attachmentId,
    });
    if (error) throw new Error(error.message);
    if (typeof path === 'string' && path.length > 0) {
      const { error: removeError } = await supabase.storage
        .from('person-attachments')
        .remove([path]);
      if (removeError) console.error('Failed to remove storage object:', removeError);
    }
    return { ok: true as const };
  });
