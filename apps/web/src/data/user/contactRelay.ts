'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import { revalidatePath } from 'next/cache';

export type ContactRelayRow = {
  id: string;
  match_id: string | null;
  from_user_id: string;
  to_user_id: string;
  target_person_id: string | null;
  status: string;
  message: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

const CreateSchema = z.object({
  targetPersonId: z.string().uuid(),
  message: z.string().trim().max(500).optional(),
});

/** W3.4: request contact for a person (inserts contact_relay + notifies owner). */
export async function createContactRelayAction(
  input: z.input<typeof CreateSchema>,
): Promise<ContactRelayRow> {
  const parsed = CreateSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.rpc('create_contact_relay_request', {
    p_target_person_id: parsed.targetPersonId,
    p_message: parsed.message ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/requests');
  return data as unknown as ContactRelayRow;
}

export async function listMyContactRelays(): Promise<{
  outgoing: ContactRelayRow[];
  incoming: ContactRelayRow[];
}> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return { outgoing: [], incoming: [] };
  const supabase = await createJuthoorSupabaseClient();
  // Table exists in migrations; generated types may lag — query via loose client.
  const loose = supabase as unknown as {
    from: (table: string) => any;
  };
  const { data, error } = await loose
    .from('contact_relay')
    .select(
      'id, match_id, from_user_id, to_user_id, target_person_id, status, message, created_at, expires_at, revoked_at',
    )
    .or(`from_user_id.eq.${uid},to_user_id.eq.${uid}`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { outgoing: [], incoming: [] };
  const rows = (data ?? []) as ContactRelayRow[];
  return {
    outgoing: rows.filter((r) => r.from_user_id === uid),
    incoming: rows.filter((r) => r.to_user_id === uid),
  };
}
