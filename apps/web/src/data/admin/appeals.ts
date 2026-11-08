'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { requireAdminFromStaff, requireStaff } from '@/data/admin/requireStaff';

export type VerificationAppeal = {
  id: string;
  verification_id: string;
  appellant_id: string;
  reason: string;
  status: 'open' | 'accepted' | 'rejected' | 'withdrawn';
  staff_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  appellant_name?: string | null;
};

const SELECT_COLS =
  'id, verification_id, appellant_id, reason, status, staff_note, reviewed_by, reviewed_at, created_at';

/** Staff: open appeals for /admin/appeals. */
export async function listOpenAppeals(): Promise<VerificationAppeal[]> {
  await requireStaff();
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('verification_appeals')
    .select(SELECT_COLS)
    .eq('status', 'open')
    .order('created_at', { ascending: true });
  if (error || !data) return [];

  const rows = data as VerificationAppeal[];
  const userIds = Array.from(new Set(rows.map((r) => r.appellant_id)));
  if (userIds.length === 0) return rows;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, display_name_ar')
    .in('id', userIds);
  const nameById = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      p.display_name_ar || p.display_name || null,
    ]),
  );
  return rows.map((r) => ({
    ...r,
    appellant_name: nameById.get(r.appellant_id) ?? null,
  }));
}

const ResolveSchema = z.object({
  id: z.string().uuid(),
  accept: z.boolean(),
  note: z.string().trim().max(2000).optional(),
});

/**
 * Admin-only resolve. Accepting an appeal re-opens the identity verification
 * as pending so staff re-review documents (safer than auto-approving).
 * Moderators can read the queue but not decide.
 */
export async function resolveAppeal(
  input: z.input<typeof ResolveSchema>,
): Promise<void> {
  const parsed = ResolveSchema.parse(input);
  const adminId = await requireAdminFromStaff();
  const supabase = await createJuthoorSupabaseClient();

  const { data: appeal, error: loadErr } = await supabase
    .from('verification_appeals')
    .select('id, verification_id, status')
    .eq('id', parsed.id)
    .eq('status', 'open')
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message);
  if (!appeal) throw new Error('Appeal not found or already resolved');

  const { error } = await supabase
    .from('verification_appeals')
    .update({
      status: parsed.accept ? 'accepted' : 'rejected',
      staff_note: parsed.note?.trim() || null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.id)
    .eq('status', 'open');
  if (error) throw new Error(error.message);

  if (parsed.accept) {
    const { error: reopenErr } = await supabase
      .from('identity_verifications')
      .update({
        status: 'pending',
        reviewer_note: parsed.note?.trim()
          ? `Appeal accepted — reopened for review. ${parsed.note.trim()}`
          : 'Appeal accepted — reopened for review.',
        reviewed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appeal.verification_id);
    if (reopenErr) throw new Error(reopenErr.message);
  }
}
