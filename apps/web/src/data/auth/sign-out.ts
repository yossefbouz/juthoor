'use server';

import { createSupabaseClient } from '@/supabase-clients/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/**
 * Server sign-out. Callers on the client should run `clearClientAuthCaches()`
 * first (Cache Storage + service worker unregister) so a stale PWA shell
 * cannot keep a closed session. See `@/lib/auth/clearClientCaches`.
 */
export async function signOutAction() {
  const supabase = await createSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/', 'layout');
  redirect('/login');
}
