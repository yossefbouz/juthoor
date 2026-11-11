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

/** Delete attachment row (+ storage) via DEFINER RPC. */
export const deletePersonAttachmentAction = authActionClient
  .schema(z.object({ attachmentId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();
    const { error } = await supabase.rpc('delete_person_attachment', {
      p_attachment_id: parsedInput.attachmentId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
