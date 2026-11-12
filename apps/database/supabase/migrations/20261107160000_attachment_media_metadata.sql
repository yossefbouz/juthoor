-- Wave 4 (W4.1–W4.2): picture/document archive metadata on person_attachments
-- + notify the IFT Administrator (tree owner) when an attachment is linked to a person.

DO $$ BEGIN
  CREATE TYPE public.media_kind AS ENUM ('picture', 'document');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.person_attachments
  ADD COLUMN IF NOT EXISTS place_taken_id uuid REFERENCES public.places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS date_taken date,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS issuing_authority text,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS media_kind public.media_kind;

-- Backfill media_kind from existing attachment_kind (photo → picture).
UPDATE public.person_attachments
SET media_kind = CASE
  WHEN kind::text = 'document' THEN 'document'::public.media_kind
  ELSE 'picture'::public.media_kind
END
WHERE media_kind IS NULL;

ALTER TABLE public.person_attachments
  ALTER COLUMN media_kind SET DEFAULT 'picture'::public.media_kind;

ALTER TABLE public.person_attachments
  ALTER COLUMN media_kind SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_person_attachments_media_kind
  ON public.person_attachments (media_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_person_attachments_place_taken
  ON public.person_attachments (place_taken_id)
  WHERE place_taken_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_person_attachments_date_taken
  ON public.person_attachments (date_taken)
  WHERE date_taken IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_person_attachments_title
  ON public.person_attachments (title)
  WHERE title IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_person_attachments_issuing_authority
  ON public.person_attachments (issuing_authority)
  WHERE issuing_authority IS NOT NULL;

COMMENT ON COLUMN public.person_attachments.place_taken_id IS
  'VCC place where a picture was taken (module 7.1.2).';
COMMENT ON COLUMN public.person_attachments.date_taken IS
  'Date a picture was taken (module 7.1.3).';
COMMENT ON COLUMN public.person_attachments.title IS
  'Document title (module 8.1.1).';
COMMENT ON COLUMN public.person_attachments.issuing_authority IS
  'Document issuing authority (module 8.1.2).';
COMMENT ON COLUMN public.person_attachments.issue_date IS
  'Document issue date (module 8.1.3).';
COMMENT ON COLUMN public.person_attachments.media_kind IS
  'Archive lane: picture | document (maps from attachment_kind photo→picture).';

-- Notify tree owner (IFT Admin) when an attachment is linked to a person.
-- Inserts into notifications (no INSERT policy for authenticated) via DEFINER.
CREATE OR REPLACE FUNCTION public.notify_ift_on_attachment_link(
  p_attachment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.person_attachments%ROWTYPE;
  v_owner uuid;
  v_person_name text;
  v_tree_id uuid;
  v_kind text;
  v_notif_id uuid;
  v_media text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_att
  FROM public.person_attachments
  WHERE id = p_attachment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment not found';
  END IF;

  SELECT p.tree_id,
         COALESCE(p.display_name_ar, p.display_name_en, 'فرد')
    INTO v_tree_id, v_person_name
  FROM public.persons p
  WHERE p.id = v_att.person_id;

  IF v_tree_id IS NULL THEN
    RAISE EXCEPTION 'Person not found';
  END IF;

  SELECT t.owner_id INTO v_owner
  FROM public.trees t
  WHERE t.id = v_tree_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Tree owner not found';
  END IF;

  -- Uploader is the owner: no self-notify.
  IF v_owner = v_uid THEN
    RETURN NULL;
  END IF;

  v_media := COALESCE(v_att.media_kind::text, CASE WHEN v_att.kind::text = 'document' THEN 'document' ELSE 'picture' END);
  v_kind := CASE WHEN v_media = 'document' THEN 'document_link' ELSE 'picture_link' END;

  INSERT INTO public.notifications (
    recipient_user_id,
    kind,
    title_ar,
    title_en,
    body_ar,
    body_en,
    link
  ) VALUES (
    v_owner,
    v_kind,
    CASE WHEN v_media = 'document'
      THEN 'مستند جديد مرتبط بفرد'
      ELSE 'صورة جديدة مرتبطة بفرد'
    END,
    CASE WHEN v_media = 'document'
      THEN 'New document linked to a person'
      ELSE 'New picture linked to a person'
    END,
    CASE WHEN v_media = 'document'
      THEN 'تم ربط مستند بالفرد: ' || v_person_name
      ELSE 'تم ربط صورة بالفرد: ' || v_person_name
    END,
    CASE WHEN v_media = 'document'
      THEN 'A document was linked to: ' || v_person_name
      ELSE 'A picture was linked to: ' || v_person_name
    END,
    '/tree/' || v_tree_id::text || '/person/' || v_att.person_id::text
  )
  RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_ift_on_attachment_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_ift_on_attachment_link(uuid) TO authenticated;

COMMENT ON FUNCTION public.notify_ift_on_attachment_link(uuid) IS
  'W4.1/W4.2: notify tree owner (IFT Admin) when an attachment is linked to a person.';
