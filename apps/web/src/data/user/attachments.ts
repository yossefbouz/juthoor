'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import { ATTACHMENT_LIMITS } from '@/lib/attachments/limits';

export type AttachmentKind = 'photo' | 'document';
export type AttachmentTag =
  | 'portrait'
  | 'id_card'
  | 'passport'
  | 'birth_cert'
  | 'death_cert'
  | 'marriage_cert'
  | 'land_deed'
  | 'family_card'
  | 'unrwa_card'
  | 'letter'
  | 'old_photo'
  | 'other';

export type Attachment = {
  id: string;
  person_id: string;
  kind: AttachmentKind;
  tag: AttachmentTag;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  caption_ar: string | null;
  caption_en: string | null;
  year: number | null;
  uploaded_by: string | null;
  created_at: string;
  signed_url?: string | null;
  uploader_display_name?: string | null;
};

const ALLOWED_PHOTO = /^(jpg|jpeg|png|webp|heic)$/i;
const ALLOWED_DOC = /^pdf$/i;
const MAX_BYTES = ATTACHMENT_LIMITS.maxBytes;
const MAX_PER_PERSON = ATTACHMENT_LIMITS.maxPerPerson;

const InsertSchema = z.object({
  personId: z.string().uuid(),
  treeId: z.string().uuid(),
  kind: z.enum(['photo', 'document']),
  tag: z.enum([
    'portrait',
    'id_card',
    'passport',
    'birth_cert',
    'death_cert',
    'marriage_cert',
    'land_deed',
    'family_card',
    'unrwa_card',
    'letter',
    'old_photo',
    'other',
  ]),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().min(1).max(MAX_BYTES),
  captionAr: z.string().trim().max(280).optional(),
  captionEn: z.string().trim().max(280).optional(),
  year: z.coerce.number().int().min(1500).max(new Date().getUTCFullYear()).optional(),
});

/**
 * Server-signed upload URL. Client PUTs the file to Storage directly with this token.
 * Path convention `{treeId}/{personId}/{uuid}.{ext}` lets the storage RLS gate by tree.
 */
export async function getAttachmentUploadTarget(input: {
  treeId: string;
  personId: string;
  fileExtension: string;
  kind: AttachmentKind;
}): Promise<{ path: string; token: string }> {
  const ext = input.fileExtension.replace(/^\./, '').toLowerCase();
  if (input.kind === 'photo' && !ALLOWED_PHOTO.test(ext)) {
    throw new Error(`Unsupported photo type: ${ext}`);
  }
  if (input.kind === 'document' && !ALLOWED_DOC.test(ext)) {
    throw new Error(`Unsupported document type: ${ext}`);
  }
  const supabase = await createJuthoorSupabaseClient();
  const path = `${input.treeId}/${input.personId}/${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage
    .from('person-attachments')
    .createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { path, token: data.token };
}

export async function recordAttachment(input: z.input<typeof InsertSchema>): Promise<Attachment> {
  const parsed = InsertSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();

  // Soft-cap check
  const { count } = await supabase
    .from('person_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', parsed.personId);
  if ((count ?? 0) >= MAX_PER_PERSON) {
    throw new Error(`Limit reached: max ${MAX_PER_PERSON} attachments per person.`);
  }

  const { data, error } = await supabase
    .from('person_attachments')
    .insert({
      person_id: parsed.personId,
      kind: parsed.kind,
      tag: parsed.tag,
      storage_path: parsed.storagePath,
      mime_type: parsed.mimeType,
      size_bytes: parsed.sizeBytes,
      caption_ar: parsed.captionAr ?? null,
      caption_en: parsed.captionEn ?? null,
      year: parsed.year ?? null,
      uploaded_by: uid,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Attachment;
}

export async function listAttachments(personId: string): Promise<Attachment[]> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('person_attachments')
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Attachment[];
  if (rows.length === 0) return [];

  // Sign URLs in parallel + load uploader display names
  const uploaderIds = Array.from(new Set(rows.map((r) => r.uploaded_by).filter(Boolean) as string[]));
  const [profilesRes, ...signed] = await Promise.all([
    uploaderIds.length
      ? supabase.from('profiles').select('id, display_name, display_name_ar').in('id', uploaderIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null; display_name_ar: string | null }> }),
    ...rows.map((r) =>
      supabase.storage.from('person-attachments').createSignedUrl(r.storage_path, 600),
    ),
  ]);
  const nameById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, p.display_name_ar || p.display_name || null]),
  );
  return rows.map((r, i) => ({
    ...r,
    signed_url: (signed[i] as { data: { signedUrl: string } | null }).data?.signedUrl ?? null,
    uploader_display_name: r.uploaded_by ? nameById.get(r.uploaded_by) ?? null : null,
  }));
}

export async function setPrimaryPhoto(personId: string, attachmentId: string): Promise<void> {
  const supabase = await createJuthoorSupabaseClient();
  const { error } = await supabase
    .from('persons')
    .update({ primary_photo_id: attachmentId })
    .eq('id', personId);
  if (error) throw new Error(error.message);
}

export async function clearPrimaryPhoto(personId: string): Promise<void> {
  const supabase = await createJuthoorSupabaseClient();
  const { error } = await supabase
    .from('persons')
    .update({ primary_photo_id: null })
    .eq('id', personId);
  if (error) throw new Error(error.message);
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const supabase = await createJuthoorSupabaseClient();
  // Look up first to get storage_path for object deletion
  const { data: row, error: getErr } = await supabase
    .from('person_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .maybeSingle();
  if (getErr) throw new Error(getErr.message);
  if (!row) return;

  const path = (row as unknown as { storage_path: string }).storage_path;
  // RLS gates both â€” DB delete + storage object delete
  const [{ error: delDbErr }, { error: delStErr }] = await Promise.all([
      supabase.from('person_attachments').delete().eq('id', attachmentId),
    supabase.storage.from('person-attachments').remove([path]),
  ]);
  if (delDbErr) throw new Error(delDbErr.message);
  if (delStErr) {
    // Non-fatal â€” file might be left behind, log only
    console.error('Failed to remove storage object:', delStErr);
  }
}

/**
 * Resolve the primary photo URL for a person. Returns null if none set or RLS blocks.
 * Used by avatars across the app (search results, dashboard, person card).
 */
export async function getPrimaryPhotoUrl(personId: string): Promise<string | null> {
  const supabase = await createJuthoorSupabaseClient();
  const { data: person } = await supabase
    .from('persons')
    .select('primary_photo_id')
    .eq('id', personId)
    .maybeSingle();
  const primaryId = (person as { primary_photo_id: string | null } | null)?.primary_photo_id;
  if (!primaryId) return null;
  const { data: att } = await supabase
    .from('person_attachments')
    .select('storage_path')
    .eq('id', primaryId)
    .maybeSingle();
  if (!att) return null;
  const { data: signed } = await supabase.storage
    .from('person-attachments')
    .createSignedUrl((att as unknown as { storage_path: string }).storage_path, 3600);
  return signed?.signedUrl ?? null;
}

// NOTE: cannot export non-async values from a `'use server'` file. Constants
// live in `lib/attachments/limits.ts` instead â€” see ATTACHMENT_LIMITS there.
