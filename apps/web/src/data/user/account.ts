'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import {
  ARCHIVE_VAULT_USER_ID,
  createSupabaseAdminClient,
} from '@/supabase-clients/admin';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { createSupabaseClient } from '@/supabase-clients/server';

/**
 * Close the current user's account.
 *
 * Product rule:
 *   1. Genealogy data is NEVER deleted — every owned tree moves to the
 *      Archive Vault (system Auth user) for audit / heritage retention.
 *   2. The profile is anonymised and marked deleted.
 *   3. The Supabase Auth login is hard-deleted so the person cannot sign in
 *      again (requires SUPABASE_SERVICE_ROLE_KEY on the server only).
 */
export async function deleteAccountAction(): Promise<void> {
  const userId = await getCachedLoggedInUserIdOrNull();
  if (!userId) throw new Error('Not authenticated');
  if (userId === ARCHIVE_VAULT_USER_ID) {
    throw new Error('The archive vault account cannot be closed');
  }

  const juthoor = await createJuthoorSupabaseClient();
  const admin = createSupabaseAdminClient();

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const formerEmail = authUser.user?.email ?? null;

  const { data: ownedTrees, error: treesErr } = await juthoor
    .from('trees')
    .select('id, description')
    .eq('owner_id', userId);
  if (treesErr) throw new Error(treesErr.message);

  const archiveNote =
    '[archived — former owner closed their account; retained for audit]';
  let treesArchived = 0;

  for (const tree of ownedTrees ?? []) {
    const nextDescription = appendOwnershipNote(tree.description, archiveNote);
    const { error: xferErr } = await admin
      .from('trees')
      .update({
        owner_id: ARCHIVE_VAULT_USER_ID,
        is_public: false,
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_from_user_id: userId,
        description: nextDescription,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tree.id)
      .eq('owner_id', userId);

    if (xferErr) throw new Error(xferErr.message);
    treesArchived += 1;

    // Keep the closed user out of membership; vault owns the tree.
    await admin
      .from('tree_members')
      .delete()
      .eq('tree_id', tree.id)
      .eq('user_id', userId);

    await admin.from('tree_members').upsert(
      {
        tree_id: tree.id,
        user_id: ARCHIVE_VAULT_USER_ID,
        role: 'owner',
        status: 'approved',
      },
      { onConflict: 'tree_id,user_id' },
    );
  }

  // Other memberships (collaborator / read-only on someone else's tree).
  await admin.from('tree_members').delete().eq('user_id', userId);

  const { error: softErr } = await juthoor
    .from('profiles')
    .update({
      deleted_at: new Date().toISOString(),
      linked_person_id: null,
      self_person_id: null,
      display_name: 'Deleted user',
      display_name_ar: 'مستخدم محذوف',
      avatar_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (softErr) throw new Error(softErr.message);

  const { error: logErr } = await admin.from('account_closure_log').insert({
    former_user_id: userId,
    former_email: formerEmail,
    trees_archived: treesArchived,
    notes: 'Closed via deleteAccountAction; trees moved to archive vault.',
  });
  if (logErr) throw new Error(logErr.message);

  // Sign out current sessions first, then remove the Auth user so login dies.
  const authClient = await createSupabaseClient();
  await authClient.auth.signOut({ scope: 'global' });

  const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
  if (delAuthErr) {
    throw new Error(
      `Account data was archived, but removing the Auth login failed: ${delAuthErr.message}`,
    );
  }

  revalidatePath('/', 'layout');
  redirect('/login?closed=1');
}

function appendOwnershipNote(existing: string | null, note: string): string {
  const base = (existing ?? '').trim();
  if (base.includes(note)) return base;
  return base ? `${base}\n\n${note}` : note;
}
