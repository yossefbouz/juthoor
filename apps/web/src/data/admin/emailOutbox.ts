'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { isCurrentUserAdmin } from '@/data/admin/requireAdmin';

export type EmailOutboxRow = {
  id: string;
  notification_id: string | null;
  recipient_user_id: string;
  kind: string;
  to_email: string | null;
  subject: string;
  body_text: string;
  status: string;
  provider: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

/** Admin-only peek at the email outbox (future Resend worker drains pending). */
export async function listEmailOutbox(limit = 50): Promise<EmailOutboxRow[]> {
  if (!(await isCurrentUserAdmin())) return [];
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('email_outbox')
    .select(
      'id, notification_id, recipient_user_id, kind, to_email, subject, body_text, status, provider, error, created_at, sent_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as EmailOutboxRow[];
}
