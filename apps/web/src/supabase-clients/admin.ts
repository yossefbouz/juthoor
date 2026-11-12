import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client for privileged Auth Admin operations
 * (e.g. permanently deleting a login after account closure).
 *
 * NEVER import this from a Client Component. The key must only live in
 * server env as SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC_*).
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
  }
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. Account closure cannot remove the Auth login without it.',
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Stable archive vault Auth user id (must match migration 20261107180000). */
export const ARCHIVE_VAULT_USER_ID =
  'a0000000-0000-4000-8000-0000000000a1' as const;
