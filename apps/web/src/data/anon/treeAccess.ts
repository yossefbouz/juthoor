'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

/**
 * True when the current viewer owns the tree or is an approved member of it
 * (any role). Such viewers see living people's life data; other readers of a
 * public tree get it masked (plan §5.5).
 */
export async function viewerHasPrivilegedTreeAccess(
  treeId: string
): Promise<boolean> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return false;
  const supabase = await createJuthoorSupabaseClient();
  const [{ data: owned }, { data: member }] = await Promise.all([
    supabase
      .from('trees')
      .select('id')
      .eq('id', treeId)
      .eq('owner_id', uid)
      .maybeSingle(),
    supabase
      .from('tree_members')
      .select('tree_id')
      .eq('tree_id', treeId)
      .eq('user_id', uid)
      .eq('status', 'approved')
      .maybeSingle(),
  ]);
  return Boolean(owned) || Boolean(member);
}

/**
 * The trees the current viewer owns or is an approved member of (any role),
 * for pages that list people from many trees at once.
 */
export async function viewerPrivilegedTreeIds(): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return ids;
  const supabase = await createJuthoorSupabaseClient();
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('trees').select('id').eq('owner_id', uid),
    supabase
      .from('tree_members')
      .select('tree_id')
      .eq('user_id', uid)
      .eq('status', 'approved'),
  ]);
  for (const t of owned ?? []) ids.add(t.id);
  for (const m of memberships ?? []) ids.add(m.tree_id);
  return ids;
}
