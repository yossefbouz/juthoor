'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

const LogSchema = z.object({
  resourceType: z.enum([
    'verification_doc',
    'person_contact',
    'identity_verification',
    'person_displacement',
    'person_story',
    'person_page',
  ]),
  resourceId: z.string().min(1).max(200),
  action: z.enum(['view', 'open', 'download']).default('view'),
});

/**
 * Append an access_log row for the current viewer. Best-effort: failures
 * are swallowed so a logging outage never blocks the sensitive view itself.
 */
export async function logAccessAction(
  input: z.input<typeof LogSchema>,
): Promise<{ ok: boolean }> {
  const parsed = LogSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return { ok: false };

  const supabase = await createJuthoorSupabaseClient();
  const { error } = await supabase.rpc('log_access', {
    p_resource_type: parsed.resourceType,
    p_resource_id: parsed.resourceId,
    p_action: parsed.action,
  });
  if (error) {
    // Fallback direct insert if the RPC is not yet migrated.
    const { error: insertErr } = await supabase.from('access_log').insert({
      viewer_id: uid,
      resource_type: parsed.resourceType,
      resource_id: parsed.resourceId,
      action: parsed.action,
    });
    if (insertErr) return { ok: false };
  }
  return { ok: true };
}
