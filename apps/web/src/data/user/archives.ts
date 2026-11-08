'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';

export type ArchivePicture = {
  id: string;
  person_id: string;
  tree_id: string;
  person_name_ar: string | null;
  person_name_en: string | null;
  place_taken_id: string | null;
  place_name_ar: string | null;
  place_name_en: string | null;
  date_taken: string | null;
  year: number | null;
  caption_ar: string | null;
  caption_en: string | null;
  storage_path: string;
  signed_url: string | null;
  created_at: string;
};

export type ArchiveDocument = {
  id: string;
  person_id: string;
  tree_id: string;
  person_name_ar: string | null;
  person_name_en: string | null;
  title: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  year: number | null;
  caption_ar: string | null;
  caption_en: string | null;
  storage_path: string;
  mime_type: string;
  signed_url: string | null;
  created_at: string;
};

export type FamilyGalleryItem = {
  id: string;
  person_id: string;
  tree_id: string;
  person_name_ar: string | null;
  person_name_en: string | null;
  date_taken: string | null;
  caption_ar: string | null;
  caption_en: string | null;
  signed_url: string | null;
};

type AttachmentRow = {
  id: string;
  person_id: string;
  place_taken_id: string | null;
  date_taken: string | null;
  title: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  year: number | null;
  caption_ar: string | null;
  caption_en: string | null;
  storage_path: string;
  mime_type: string;
  created_at: string;
  media_kind: string;
  tag: string | null;
};

const IDENTITY_DOC_TAGS = new Set(['id_card', 'unrwa_card', 'family_card']);

function isPublicArchiveRow(row: AttachmentRow): boolean {
  return !IDENTITY_DOC_TAGS.has((row.tag ?? '').toLowerCase());
}

type PersonRow = {
  id: string;
  tree_id: string;
  display_name_ar: string | null;
  display_name_en: string | null;
};

type PlaceRow = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
};

async function signPaths(paths: string[]): Promise<Map<string, string | null>> {
  const supabase = await createJuthoorSupabaseClient();
  const out = new Map<string, string | null>();
  await Promise.all(
    paths.map(async (path) => {
      const { data } = await supabase.storage
        .from('person-attachments')
        .createSignedUrl(path, 600);
      out.set(path, data?.signedUrl ?? null);
    }),
  );
  return out;
}

async function loadPersonsByIds(ids: string[]): Promise<Map<string, PersonRow>> {
  if (ids.length === 0) return new Map();
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('persons')
    .select('id, tree_id, display_name_ar, display_name_en')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as PersonRow[]).map((p) => [p.id, p]));
}

async function loadPlacesByIds(ids: string[]): Promise<Map<string, PlaceRow>> {
  if (ids.length === 0) return new Map();
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('places')
    .select('id, name_ar, name_en')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as PlaceRow[]).map((p) => [p.id, p]));
}

/** Picture archive rows with person + place joins. Client filters by name/place/date. */
export async function loadPictureArchive(limit = 200): Promise<ArchivePicture[]> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('person_attachments')
    .select(
      'id, person_id, place_taken_id, date_taken, title, issuing_authority, issue_date, year, caption_ar, caption_en, storage_path, mime_type, created_at, media_kind, tag',
    )
    .eq('media_kind', 'picture')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as AttachmentRow[]).filter(isPublicArchiveRow);
  const personMap = await loadPersonsByIds(Array.from(new Set(rows.map((r) => r.person_id))));
  const placeMap = await loadPlacesByIds(
    Array.from(new Set(rows.map((r) => r.place_taken_id).filter(Boolean) as string[])),
  );
  const signed = await signPaths(rows.map((r) => r.storage_path));

  return rows
    .filter((r) => personMap.has(r.person_id))
    .map((r) => {
      const person = personMap.get(r.person_id)!;
      const place = r.place_taken_id ? placeMap.get(r.place_taken_id) : undefined;
      return {
        id: r.id,
        person_id: r.person_id,
        tree_id: person.tree_id,
        person_name_ar: person.display_name_ar,
        person_name_en: person.display_name_en,
        place_taken_id: r.place_taken_id,
        place_name_ar: place?.name_ar ?? null,
        place_name_en: place?.name_en ?? null,
        date_taken: r.date_taken,
        year: r.year,
        caption_ar: r.caption_ar,
        caption_en: r.caption_en,
        storage_path: r.storage_path,
        signed_url: signed.get(r.storage_path) ?? null,
        created_at: r.created_at,
      };
    });
}

/** Document archive rows with person joins. Client filters by title/authority/date. */
export async function loadDocumentArchive(limit = 200): Promise<ArchiveDocument[]> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('person_attachments')
    .select(
      'id, person_id, place_taken_id, date_taken, title, issuing_authority, issue_date, year, caption_ar, caption_en, storage_path, mime_type, created_at, media_kind, tag',
    )
    .eq('media_kind', 'document')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as AttachmentRow[]).filter(isPublicArchiveRow);
  const personMap = await loadPersonsByIds(Array.from(new Set(rows.map((r) => r.person_id))));
  const signed = await signPaths(rows.map((r) => r.storage_path));

  return rows
    .filter((r) => personMap.has(r.person_id))
    .map((r) => {
      const person = personMap.get(r.person_id)!;
      return {
        id: r.id,
        person_id: r.person_id,
        tree_id: person.tree_id,
        person_name_ar: person.display_name_ar,
        person_name_en: person.display_name_en,
        title: r.title,
        issuing_authority: r.issuing_authority,
        issue_date: r.issue_date,
        year: r.year,
        caption_ar: r.caption_ar,
        caption_en: r.caption_en,
        storage_path: r.storage_path,
        mime_type: r.mime_type,
        signed_url: signed.get(r.storage_path) ?? null,
        created_at: r.created_at,
      };
    });
}

/** Pictures linked to people whose primary surname matches. */
export async function loadFamilyGallery(surname: string, limit = 48): Promise<FamilyGalleryItem[]> {
  const trimmed = surname.trim();
  if (!trimmed) return [];
  const supabase = await createJuthoorSupabaseClient();

  const { data: nameRows, error: nameErr } = await supabase
    .from('person_names')
    .select('person_id')
    .ilike('surname', trimmed)
    .limit(2000);
  if (nameErr) throw new Error(nameErr.message);
  const personIds = Array.from(
    new Set(((nameRows ?? []) as Array<{ person_id: string }>).map((r) => r.person_id)),
  );
  if (personIds.length === 0) return [];

  const { data, error } = await supabase
    .from('person_attachments')
    .select(
      'id, person_id, date_taken, caption_ar, caption_en, storage_path, created_at, media_kind, tag',
    )
    .eq('media_kind', 'picture')
    .in('person_id', personIds)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as AttachmentRow[]).filter(isPublicArchiveRow);
  const personMap = await loadPersonsByIds(Array.from(new Set(rows.map((r) => r.person_id))));
  const signed = await signPaths(rows.map((r) => r.storage_path));

  return rows
    .filter((r) => personMap.has(r.person_id))
    .map((r) => {
      const person = personMap.get(r.person_id)!;
      return {
        id: r.id,
        person_id: r.person_id,
        tree_id: person.tree_id,
        person_name_ar: person.display_name_ar,
        person_name_en: person.display_name_en,
        date_taken: r.date_taken,
        caption_ar: r.caption_ar,
        caption_en: r.caption_en,
        signed_url: signed.get(r.storage_path) ?? null,
      };
    });
}
