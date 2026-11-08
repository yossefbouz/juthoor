'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireAdmin } from '@/data/admin/requireAdmin';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { createSupabaseAdminClient } from '@/supabase-clients/admin';

const SetModeratorSchema = z.object({
  userId: z.string().uuid(),
  isModerator: z.boolean(),
});

/**
 * Platform admin appoints or removes a moderator. Uses the service-role
 * client so the protect_profiles_is_admin trigger (which blocks self-service
 * elevation through the normal client) is not the path we use; only admins
 * reach this action.
 */
export async function setModeratorRole(
  input: z.input<typeof SetModeratorSchema>,
): Promise<void> {
  const parsed = SetModeratorSchema.parse(input);
  const adminId = await requireAdmin();
  if (!adminId) throw new Error('Not authorized');
  if (parsed.userId === adminId && !parsed.isModerator) {
    // Allow demoting self only if another admin exists; keep simple: block self-demote.
    throw new Error('Ask another admin to change your own moderator flag');
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({
      is_moderator: parsed.isModerator,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.userId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/appeals');
  revalidatePath('/admin/verifications');
  revalidatePath('/admin/moderators');
}

/** List profiles that are admins or moderators (for the staff appointments UI). */
export async function listStaffProfiles(): Promise<
  Array<{
    id: string;
    display_name: string | null;
    display_name_ar: string | null;
    is_admin: boolean;
    is_moderator: boolean;
  }>
> {
  await requireAdmin();
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, display_name_ar, is_admin, is_moderator')
    .or('is_admin.eq.true,is_moderator.eq.true')
    .is('deleted_at', null)
    .order('display_name', { ascending: true });
  if (error || !data) return [];
  return data as Array<{
    id: string;
    display_name: string | null;
    display_name_ar: string | null;
    is_admin: boolean;
    is_moderator: boolean;
  }>;
}
