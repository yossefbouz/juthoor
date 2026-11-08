import { cache } from 'react';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInVerifiedSupabaseUser } from '@/rsc-data/supabase';

export type StaffRole = {
  userId: string;
  isAdmin: boolean;
  isModerator: boolean;
};

/**
 * Current user staff flags. Admins and moderators both count as "staff"
 * for verification read surfaces. Cached per request.
 */
export const getStaffRole = cache(async (): Promise<StaffRole | null> => {
  let uid: string | undefined;
  try {
    const { user } = await getCachedLoggedInVerifiedSupabaseUser();
    uid = user?.id;
  } catch {
    return null;
  }
  if (!uid) return null;

  const supabase = await createJuthoorSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('is_admin, is_moderator')
    .eq('id', uid)
    .maybeSingle();
  const row = data as { is_admin: boolean; is_moderator?: boolean } | null;
  if (!row) return null;
  const isAdmin = Boolean(row.is_admin);
  const isModerator = Boolean(row.is_moderator);
  if (!isAdmin && !isModerator) return null;
  return { userId: uid, isAdmin, isModerator };
});

export async function isCurrentUserStaff(): Promise<boolean> {
  return Boolean(await getStaffRole());
}

export async function requireStaff(): Promise<StaffRole> {
  const role = await getStaffRole();
  if (!role) throw new Error('Not authorized');
  return role;
}

export async function requireAdminFromStaff(): Promise<string> {
  const role = await getStaffRole();
  if (!role?.isAdmin) throw new Error('Not authorized');
  return role.userId;
}
