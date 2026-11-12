'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import { requireAdmin } from '@/data/admin/requireAdmin';
import { requireStaff } from '@/data/admin/requireStaff';

const BUCKET = 'verification-docs';
const ALLOWED_EXT = /^(jpg|jpeg|png|webp|heic|pdf)$/i;

export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type IdDocumentType = 'passport' | 'national_id' | 'refugee_card' | 'other';

export type IdentityVerification = {
  id: string;
  user_id: string;
  tree_id: string | null;
  id_document_path: string;
  id_document_type: IdDocumentType;
  family_evidence_path: string | null;
  family_evidence_note: string | null;
  status: VerificationStatus;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type PendingVerification = IdentityVerification & {
  submitter_name: string | null;
  tree_name: string | null;
  id_document_url: string | null;
  family_evidence_url: string | null;
};

export type SelectableTree = { id: string; name: string | null };

const SELECT_COLS =
  'id, user_id, tree_id, id_document_path, id_document_type, family_evidence_path, family_evidence_note, status, reviewer_note, reviewed_at, created_at';

/** Server-signed upload URL into the user's private folder in verification-docs.
 *  Path `{uid}/{uuid}.{ext}` lets the storage RLS gate ownership by folder. */
export async function getVerificationUploadTarget(input: {
  fileExtension: string;
}): Promise<{ path: string; token: string }> {
  const ext = input.fileExtension.replace(/^\./, '').toLowerCase();
  if (!ALLOWED_EXT.test(ext)) throw new Error(`Unsupported file type: ${ext}`);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const path = `${uid}/${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { path, token: data.token };
}

const SubmitSchema = z.object({
  idDocumentPath: z.string().min(1),
  idDocumentType: z.enum(['passport', 'national_id', 'refugee_card', 'other']),
  familyEvidencePath: z.string().min(1).optional(),
  familyEvidenceNote: z.string().trim().max(2000).optional(),
  treeId: z.string().uuid().optional(),
});

export async function submitVerification(
  input: z.input<typeof SubmitSchema>,
): Promise<IdentityVerification> {
  const parsed = SubmitSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();

  const { data, error } = await supabase
    .from('identity_verifications')
    .insert({
      user_id: uid,
      tree_id: parsed.treeId ?? null,
      id_document_path: parsed.idDocumentPath,
      id_document_type: parsed.idDocumentType,
      family_evidence_path: parsed.familyEvidencePath ?? null,
      family_evidence_note: parsed.familyEvidenceNote?.trim() || null,
    })
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(`Failed to submit verification: ${error.message}`);
  return data as IdentityVerification;
}

/** The current user's most recent verification request, or null. Degrades to
 *  null if the table has not been migrated yet. */
export async function getMyVerification(): Promise<IdentityVerification | null> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return null;
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('identity_verifications')
    .select(SELECT_COLS)
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as IdentityVerification | null) ?? null;
}

/** Staff (admin or moderator): pending verification requests with signed URLs. */
export async function listPendingVerifications(): Promise<PendingVerification[]> {
  await requireStaff();
  const supabase = await createJuthoorSupabaseClient();

  const { data, error } = await supabase
    .from('identity_verifications')
    .select(SELECT_COLS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) return [];
  const rows = (data ?? []) as IdentityVerification[];
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const treeIds = Array.from(new Set(rows.map((r) => r.tree_id).filter(Boolean) as string[]));
  const [{ data: profiles }, treesRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name, display_name_ar').in('id', userIds),
    treeIds.length
      ? supabase.from('trees').select('id, name').in('id', treeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name_ar || p.display_name || null]),
  );
  const treeNameById = new Map((treesRes.data ?? []).map((t) => [t.id, t.name]));

  const signed = await Promise.all(
    rows.map(async (r) => {
      const [idUrl, famUrl] = await Promise.all([
        supabase.storage.from(BUCKET).createSignedUrl(r.id_document_path, 600),
        r.family_evidence_path
          ? supabase.storage.from(BUCKET).createSignedUrl(r.family_evidence_path, 600)
          : Promise.resolve({ data: null as { signedUrl: string } | null }),
      ]);
      return {
        ...r,
        submitter_name: nameById.get(r.user_id) ?? null,
        tree_name: r.tree_id ? treeNameById.get(r.tree_id) ?? null : null,
        id_document_url: idUrl.data?.signedUrl ?? null,
        family_evidence_url: famUrl.data?.signedUrl ?? null,
      };
    }),
  );
  return signed;
}

const ReviewSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(2000).optional(),
});

/** Admin: approve or reject a verification request. On approval, if the request
 *  targets a specific tree, the submitter is granted collaborator (edit) access
 *  to that tree first — so "approved" always means "can now edit". The admin's
 *  is_admin() RLS permits the tree_members grant. */
export async function reviewVerification(
  input: z.input<typeof ReviewSchema>,
): Promise<void> {
  const parsed = ReviewSchema.parse(input);
  const reviewerId = await requireAdmin();
  const supabase = await createJuthoorSupabaseClient();
  const now = new Date().toISOString();

  if (parsed.approve) {
    const { data: row } = await supabase
      .from('identity_verifications')
      .select('user_id, tree_id')
      .eq('id', parsed.id)
      .maybeSingle();
    const v = row as { user_id: string; tree_id: string | null } | null;
    if (v?.tree_id && v.user_id) {
      const { error: grantErr } = await supabase.from('tree_members').upsert(
        {
          tree_id: v.tree_id,
          user_id: v.user_id,
          role: 'collaborator',
          status: 'approved',
          accepted_at: now,
          reviewed_at: now,
          reviewed_by: reviewerId,
        },
        { onConflict: 'tree_id,user_id' },
      );
      if (grantErr) throw new Error(`Failed to grant tree access: ${grantErr.message}`);
    }
  }

  const { error } = await supabase
    .from('identity_verifications')
    .update({
      status: parsed.approve ? 'approved' : 'rejected',
      reviewer_note: parsed.note?.trim() || null,
      reviewed_by: reviewerId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', parsed.id);
  if (error) throw new Error(`Failed to review: ${error.message}`);
}

/** Trees the current user can target when verifying (their own + public /
 *  accessible, per RLS), so an approved verification grants edit access to it. */
export async function listVerifiableTrees(): Promise<SelectableTree[]> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('trees')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(100);
  if (error) return [];
  return (data ?? []) as SelectableTree[];
}
