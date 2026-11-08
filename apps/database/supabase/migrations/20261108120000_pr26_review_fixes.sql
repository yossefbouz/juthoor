-- ============================================================================
-- PR #26 review fixes (2026-11-08)
-- ============================================================================
-- Fix-forward for migrations 20261107120000..20261107200000, which are already
-- applied on the hosted project. Every statement is idempotent so this file can
-- be pasted into the SQL editor as a hotfix and later replayed by the CLI.
--
--  1. trees_select broke tree creation (INSERT ... RETURNING).
--  2. Living-person detail helper + read gates (displacement, identifiers).
--  3. person_profiles contact columns: column-level privileges + get_person_contact().
--  4. Identity documents (id_card / passport) hidden from non-privileged viewers,
--     including anonymous storage reads.
--  5. Record ownership can no longer be self-assigned; claims go through
--     request_person_claim / review_person_claim.
--  6. Messaging: threads are per (context, pair); callers must be a party.
--  7. contact_relay writes only through RPCs; respond_contact_relay added.
--  8. Grants: internal / expensive functions revoked from anon (and teardown
--     from authenticated).
--  9. list_visible_pft_links masks private-tree and living names.
-- 10. raise_relationship_dispute checks the persons belong to the tree.
-- 11. verification_appeals INSERT cannot pre-set review fields.
-- 12. FKs to auth.users that blocked account deletion become ON DELETE SET NULL.
-- 13. sync_person_is_living also recomputes the OLD person on UPDATE/DELETE.
-- 14. "Unknown" placeholder names no longer score as name matches; all
--     persons are re-queued for feature refresh.
-- 15. score_pair: UNRWA evidence must exist on BOTH sides.
-- ============================================================================


-- ── 1. trees_select ─────────────────────────────────────────────────────────
-- can_access_tree(id) looks the row up in public.trees. On INSERT ... RETURNING
-- Postgres checks SELECT policies before the row exists, so the helper returned
-- false and every non-admin tree insert failed. Keep the owner / public test on
-- the row itself; the helper still covers approved members.
DROP POLICY IF EXISTS "trees_select" ON public.trees;
CREATE POLICY "trees_select"
  ON public.trees
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR is_public
    OR public.can_access_tree(id)
    OR public.is_admin()
  );


-- ── 2. Living-person detail gate ────────────────────────────────────────────
-- Optional details of a LIVING person are visible to: platform admin, the record
-- owner, a person_field_grants grantee, the tree owner and approved tree members.
-- Deceased people: anyone who can read the tree.
CREATE OR REPLACE FUNCTION public.can_view_living_person_details(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NOT public.is_person_living(p_person_id)
    OR public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR EXISTS (
      SELECT 1 FROM public.person_field_grants g
      WHERE g.person_id = p_person_id
        AND g.grantee_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = p_person_id
        AND (
          t.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.tree_members tm
            WHERE tm.tree_id = t.id
              AND tm.user_id = auth.uid()
              AND tm.status = 'approved'
          )
        )
    );
$$;

COMMENT ON FUNCTION public.can_view_living_person_details(uuid) IS
  'Living people: admin, record owner, field grantee, tree owner or approved member. Deceased: true.';

REVOKE ALL ON FUNCTION public.can_view_living_person_details(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_living_person_details(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_living_person_details(uuid) TO authenticated;

-- person_displacement: read needs tree access AND the living gate.
DROP POLICY IF EXISTS person_displacement_select ON public.person_displacement;
CREATE POLICY person_displacement_select ON public.person_displacement FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
      )
      AND public.can_view_living_person_details(person_id)
    )
  );

-- Deleting optional data follows the same rule as editing it.
DROP POLICY IF EXISTS person_displacement_delete ON public.person_displacement;
CREATE POLICY person_displacement_delete ON public.person_displacement FOR DELETE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id));

DROP POLICY IF EXISTS person_profiles_delete ON public.person_profiles;
CREATE POLICY person_profiles_delete ON public.person_profiles FOR DELETE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id));

-- person_identifiers: authenticated only, living gate on read. Writes: optional
-- field editors, or the user who created the person record (add-person flow).
DROP POLICY IF EXISTS person_identifiers_select ON public.person_identifiers;
CREATE POLICY person_identifiers_select ON public.person_identifiers FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
      )
      AND public.can_view_living_person_details(person_id)
    )
  );

DROP POLICY IF EXISTS person_identifiers_insert ON public.person_identifiers;
CREATE POLICY person_identifiers_insert ON public.person_identifiers FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_edit_optional_person_fields(person_id)
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id
        AND p.created_by = auth.uid()
        AND public.can_write_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS person_identifiers_update ON public.person_identifiers;
CREATE POLICY person_identifiers_update ON public.person_identifiers FOR UPDATE
  TO authenticated
  USING (
    public.can_edit_optional_person_fields(person_id)
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id
        AND p.created_by = auth.uid()
        AND public.can_write_tree(p.tree_id)
    )
  )
  WITH CHECK (
    public.can_edit_optional_person_fields(person_id)
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id
        AND p.created_by = auth.uid()
        AND public.can_write_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS person_identifiers_delete ON public.person_identifiers;
CREATE POLICY person_identifiers_delete ON public.person_identifiers FOR DELETE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id));

-- Evidence must be an attachment of the same person.
CREATE OR REPLACE FUNCTION public.check_person_identifier_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.evidence_attachment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.person_attachments a
    WHERE a.id = NEW.evidence_attachment_id
      AND a.person_id = NEW.person_id
  ) THEN
    RAISE EXCEPTION 'evidence_attachment_id must be an attachment of the same person'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_person_identifiers_evidence ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_evidence
  BEFORE INSERT OR UPDATE OF evidence_attachment_id, person_id
  ON public.person_identifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.check_person_identifier_evidence();


-- ── 3. person_profiles contact columns (D3, column-level) ───────────────────
-- Table-level SELECT is replaced by column-level SELECT on every column except
-- contact_email / contact_phone. Contacts are read through get_person_contact().
-- NOTE: a column added to person_profiles later must be granted explicitly.
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'person_profiles'
    AND column_name NOT IN ('contact_email', 'contact_phone');

  EXECUTE 'REVOKE SELECT ON public.person_profiles FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.person_profiles TO anon, authenticated', v_cols);
END $$;

CREATE OR REPLACE FUNCTION public.get_person_contact(p_person_id uuid)
RETURNS TABLE (
  contact_email   text,
  contact_phone   text,
  contact_consent boolean,
  can_manage      boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tree   uuid;
  v_email  text;
  v_phone  text;
  v_consent boolean;
  v_manage boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT p.tree_id INTO v_tree FROM public.persons p WHERE p.id = p_person_id;
  IF v_tree IS NULL OR NOT (public.can_access_tree(v_tree) OR public.is_admin()) THEN
    RETURN;
  END IF;

  SELECT pp.contact_email, pp.contact_phone, COALESCE(pp.contact_consent, false)
    INTO v_email, v_phone, v_consent
  FROM public.person_profiles pp
  WHERE pp.person_id = p_person_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_manage := public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR public.can_edit_optional_person_fields(p_person_id)
    OR EXISTS (SELECT 1 FROM public.trees t WHERE t.id = v_tree AND t.owner_id = auth.uid());

  RETURN QUERY SELECT
    CASE WHEN v_consent OR v_manage THEN v_email END,
    CASE WHEN v_consent OR v_manage THEN v_phone END,
    v_consent,
    v_manage;
END;
$$;

COMMENT ON FUNCTION public.get_person_contact(uuid) IS
  'D3: contact email/phone when the person consented, or for admin / record owner / optional-field editors / tree owner. Otherwise NULLs (request via contact relay).';

REVOKE ALL ON FUNCTION public.get_person_contact(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_person_contact(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_person_contact(uuid) TO authenticated;


-- ── 4. Identity documents (id_card / passport) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_identity_attachment(
  p_person_id uuid,
  p_uploaded_by uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR p_uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = p_person_id AND t.owner_id = auth.uid()
    )
  );
$$;

-- True when a storage object is an identity document the caller may not read.
CREATE OR REPLACE FUNCTION public.is_restricted_attachment_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.person_attachments a
    WHERE a.storage_path = p_name
      AND a.tag::text IN ('id_card', 'passport')
      AND NOT public.can_view_identity_attachment(a.person_id, a.uploaded_by)
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_identity_attachment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_restricted_attachment_object(text) FROM PUBLIC;
-- Storage read policy applies to anon too, so both roles need EXECUTE.
GRANT EXECUTE ON FUNCTION public.can_view_identity_attachment(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_restricted_attachment_object(text) TO anon, authenticated;

DROP POLICY IF EXISTS pa_select ON public.person_attachments;
CREATE POLICY pa_select ON public.person_attachments FOR SELECT
  USING (
    public.can_access_tree((SELECT tree_id FROM public.persons WHERE id = person_id))
    AND (
      tag::text NOT IN ('id_card', 'passport')
      OR public.can_view_identity_attachment(person_id, uploaded_by)
    )
  );

DROP POLICY IF EXISTS "pa_storage_read" ON storage.objects;
CREATE POLICY "pa_storage_read" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (
    bucket_id = 'person-attachments'
    AND public.can_access_tree(((storage.foldername(storage.objects.name))[1])::uuid)
    AND NOT public.is_restricted_attachment_object(storage.objects.name)
  );

-- Upload: the optional-field branch must also prove the person is in the
-- tree named by the first folder.
DROP POLICY IF EXISTS "pa_storage_insert" ON storage.objects;
CREATE POLICY "pa_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'person-attachments'
    AND (
      public.is_admin()
      OR (
        EXISTS (
          SELECT 1 FROM public.persons p
          WHERE p.id::text = (storage.foldername(name))[2]
            AND p.tree_id::text = (storage.foldername(name))[1]
        )
        AND public.can_edit_optional_person_fields(((storage.foldername(name))[2])::uuid)
      )
      OR EXISTS (
        SELECT 1 FROM public.trees t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND (
            t.owner_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.tree_members tm
              WHERE tm.tree_id = t.id
                AND tm.user_id = auth.uid()
                AND tm.status = 'approved'
                AND tm.role IN ('owner', 'collaborator')
            )
          )
      )
    )
  );


-- ── 5. Record ownership claims (D1, spec: "request edit access") ────────────
-- API roles may clear their own link but never set one; links are written by
-- the SECURITY DEFINER functions below (current_user is then the owner role).
CREATE OR REPLACE FUNCTION public.protect_profiles_person_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.linked_person_id IS NOT NULL OR NEW.self_person_id IS NOT NULL THEN
        RAISE EXCEPTION 'person_link_requires_claim' USING ERRCODE = '42501';
      END IF;
    ELSIF (NEW.linked_person_id IS DISTINCT FROM OLD.linked_person_id
           AND NEW.linked_person_id IS NOT NULL)
       OR (NEW.self_person_id IS DISTINCT FROM OLD.self_person_id
           AND NEW.self_person_id IS NOT NULL) THEN
      RAISE EXCEPTION 'person_link_requires_claim' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Fires before trg_profiles_sync_person_link (alphabetical order).
DROP TRIGGER IF EXISTS trg_profiles_protect_person_link ON public.profiles;
CREATE TRIGGER trg_profiles_protect_person_link
  BEFORE INSERT OR UPDATE OF linked_person_id, self_person_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_person_link();

CREATE TABLE IF NOT EXISTS public.person_claim_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  note         text CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_person_claim_requests_pending
  ON public.person_claim_requests (person_id, user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_person_claim_requests_person
  ON public.person_claim_requests (person_id, status);

ALTER TABLE public.person_claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_claim_requests_select ON public.person_claim_requests;
CREATE POLICY person_claim_requests_select ON public.person_claim_requests FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = person_id AND t.owner_id = auth.uid()
    )
  );
-- No INSERT / UPDATE / DELETE policies: RPC only.

COMMENT ON TABLE public.person_claim_requests IS
  'D1: a user asks to become the record owner of a person. The tree owner (IFT Administrator) or a platform admin approves.';

-- Returns 'linked' (tree owner / admin, or already linked) or 'requested'.
CREATE OR REPLACE FUNCTION public.request_person_claim(
  p_person_id uuid,
  p_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_tree  uuid;
  v_owner uuid;
  v_name  text;
  v_rows  int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.tree_id, t.owner_id, COALESCE(p.display_name_ar, p.display_name_en, '?')
    INTO v_tree, v_owner, v_name
  FROM public.persons p
  JOIN public.trees t ON t.id = p.tree_id
  WHERE p.id = p_person_id;
  IF v_tree IS NULL OR NOT (public.can_access_tree(v_tree) OR public.is_admin()) THEN
    RAISE EXCEPTION 'person_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = v_uid AND pr.linked_person_id = p_person_id
  ) THEN
    RETURN 'linked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.linked_person_id = p_person_id
      AND pr.deleted_at IS NULL
      AND pr.id <> v_uid
  ) THEN
    RAISE EXCEPTION 'already_claimed' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = v_uid AND pr.linked_person_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'already_linked_other' USING ERRCODE = '23505';
  END IF;

  -- The tree owner (IFT Administrator) or a platform admin links directly.
  IF v_owner = v_uid OR public.is_admin() THEN
    UPDATE public.profiles SET linked_person_id = p_person_id WHERE id = v_uid;
    RETURN 'linked';
  END IF;

  INSERT INTO public.person_claim_requests (person_id, user_id, note)
  VALUES (p_person_id, v_uid, NULLIF(btrim(COALESCE(p_note, '')), ''))
  ON CONFLICT (person_id, user_id) WHERE status = 'pending' DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    INSERT INTO public.notifications (
      recipient_user_id, kind, title_ar, title_en, body_ar, body_en, link
    ) VALUES (
      v_owner,
      'person_claim',
      'طلب ملكية سجل',
      'Record ownership request',
      'يطلب مستخدم أن يُربط حسابه بسجل: ' || v_name,
      'A user asked to be linked to the record of: ' || v_name,
      '/dashboard/requests'
    );
  END IF;

  RETURN 'requested';
END;
$$;

-- Tree owner or admin approves / rejects. Returns the new status.
CREATE OR REPLACE FUNCTION public.review_person_claim(
  p_request_id uuid,
  p_approve boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_req    public.person_claim_requests%ROWTYPE;
  v_owner  uuid;
  v_name   text;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.person_claim_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT t.owner_id, COALESCE(p.display_name_ar, p.display_name_en, '?')
    INTO v_owner, v_name
  FROM public.persons p
  JOIN public.trees t ON t.id = p.tree_id
  WHERE p.id = v_req.person_id;

  IF NOT (v_owner = v_uid OR public.is_admin()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING ERRCODE = '22023';
  END IF;

  IF p_approve THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.linked_person_id = v_req.person_id
        AND pr.deleted_at IS NULL
        AND pr.id <> v_req.user_id
    ) THEN
      RAISE EXCEPTION 'already_claimed' USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = v_req.user_id
        AND pr.linked_person_id IS NOT NULL
        AND pr.linked_person_id <> v_req.person_id
    ) THEN
      RAISE EXCEPTION 'already_linked_other' USING ERRCODE = '23505';
    END IF;
    UPDATE public.profiles
       SET linked_person_id = v_req.person_id
     WHERE id = v_req.user_id AND deleted_at IS NULL;
    v_status := 'approved';
  ELSE
    v_status := 'rejected';
  END IF;

  UPDATE public.person_claim_requests
     SET status = v_status, reviewed_by = v_uid, reviewed_at = now()
   WHERE id = v_req.id;

  INSERT INTO public.notifications (
    recipient_user_id, kind, title_ar, title_en, body_ar, body_en, link
  ) VALUES (
    v_req.user_id,
    'person_claim_' || v_status,
    CASE WHEN p_approve THEN 'تمت الموافقة على طلبك' ELSE 'تم رفض طلبك' END,
    CASE WHEN p_approve THEN 'Your record request was approved' ELSE 'Your record request was declined' END,
    v_name,
    v_name,
    '/dashboard'
  );

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.request_person_claim(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_person_claim(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_person_claim(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.review_person_claim(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_person_claim(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_person_claim(uuid, boolean) TO authenticated;


-- ── 6. Messaging: one thread per (context, pair); callers must be a party ───
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS user_a uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_b uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill two-person threads. Threads with more participants keep NULLs and
-- are never matched again by the RPC (new pair threads are created instead).
UPDATE public.message_threads mt
   SET user_a = s.a, user_b = s.b
  FROM (
    SELECT thread_id,
           min(user_id::text)::uuid AS a,
           max(user_id::text)::uuid AS b,
           count(*) AS n
    FROM public.message_thread_participants
    GROUP BY thread_id
  ) s
 WHERE s.thread_id = mt.id
   AND s.n = 2
   AND mt.user_a IS NULL;

DO $$
DECLARE
  v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.message_threads'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (context_type, context_id)';
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.message_threads DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_threads_context_pair
  ON public.message_threads (context_type, context_id, user_a, user_b);
CREATE INDEX IF NOT EXISTS idx_message_threads_context
  ON public.message_threads (context_type, context_id);

CREATE OR REPLACE FUNCTION public.open_or_create_message_thread(
  p_context_type public.message_context_type,
  p_context_id uuid,
  p_counterpart_user_id uuid DEFAULT NULL,
  p_initial_body text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_other      uuid;
  v_context_id uuid := p_context_id;
  v_attachment public.person_attachments%ROWTYPE;
  v_tree_id    uuid;
  v_owner      uuid;
  v_relay      public.contact_relay%ROWTYPE;
  v_thread_id  uuid;
  v_body       text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_context_id IS NULL THEN
    RAISE EXCEPTION 'context_id required';
  END IF;

  IF p_context_type IN ('picture_link', 'document_link') THEN
    -- Parties: the uploader and the owner of the person's tree.
    SELECT * INTO v_attachment FROM public.person_attachments WHERE id = v_context_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Attachment not found';
    END IF;
    SELECT t.owner_id INTO v_owner
    FROM public.persons p JOIN public.trees t ON t.id = p.tree_id
    WHERE p.id = v_attachment.person_id;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Tree owner not found';
    END IF;
    IF v_uid = v_owner THEN
      v_other := v_attachment.uploaded_by;
    ELSIF v_uid = v_attachment.uploaded_by THEN
      v_other := v_owner;
    ELSE
      RAISE EXCEPTION 'Not a party to this attachment' USING ERRCODE = '42501';
    END IF;

  ELSIF p_context_type = 'contact_relay' THEN
    -- Parties: from_user / to_user of the relay. Person-based requests must be
    -- accepted by the recipient first (respond_contact_relay).
    SELECT * INTO v_relay FROM public.contact_relay WHERE id = v_context_id;
    IF NOT FOUND THEN
      SELECT * INTO v_relay
      FROM public.contact_relay
      WHERE match_id = v_context_id
        AND revoked_at IS NULL
        AND (from_user_id = v_uid OR to_user_id = v_uid)
      ORDER BY created_at DESC
      LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'contact_relay not found';
      END IF;
    END IF;
    IF v_relay.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'contact_relay revoked';
    END IF;
    IF v_relay.from_user_id = v_uid THEN
      v_other := v_relay.to_user_id;
    ELSIF v_relay.to_user_id = v_uid THEN
      v_other := v_relay.from_user_id;
    ELSE
      RAISE EXCEPTION 'Not a contact_relay participant' USING ERRCODE = '42501';
    END IF;
    IF v_relay.match_id IS NULL AND v_relay.status <> 'accepted' THEN
      RAISE EXCEPTION 'Contact request has not been accepted' USING ERRCODE = '42501';
    END IF;
    v_context_id := v_relay.id;

  ELSIF p_context_type = 'relationship_dispute' THEN
    -- context_id = family_id. Non-owners (with tree access) open a thread with
    -- the owner; the owner may only answer users who raised a dispute there.
    SELECT f.tree_id INTO v_tree_id FROM public.families f WHERE f.id = v_context_id;
    IF v_tree_id IS NULL THEN
      RAISE EXCEPTION 'Family not found for dispute';
    END IF;
    SELECT t.owner_id INTO v_owner FROM public.trees t WHERE t.id = v_tree_id;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Tree owner not found';
    END IF;
    IF v_uid = v_owner THEN
      v_other := p_counterpart_user_id;
      IF v_other IS NULL THEN
        RAISE EXCEPTION 'counterpart_user_id required when caller is tree owner';
      END IF;
      IF NOT EXISTS (
           SELECT 1 FROM public.relationship_disputes d
           WHERE d.tree_id = v_tree_id AND d.raised_by = v_other
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.message_threads mt
           WHERE mt.context_type = p_context_type
             AND mt.context_id = v_context_id
             AND mt.user_a = LEAST(v_uid, v_other)
             AND mt.user_b = GREATEST(v_uid, v_other)
         ) THEN
        RAISE EXCEPTION 'Counterpart has not raised a dispute in this tree'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NOT public.can_access_tree(v_tree_id) THEN
        RAISE EXCEPTION 'Cannot access this tree' USING ERRCODE = '42501';
      END IF;
      v_other := v_owner;
    END IF;

  ELSE
    RAISE EXCEPTION 'Unsupported context type';
  END IF;

  IF p_counterpart_user_id IS NOT NULL AND p_counterpart_user_id IS DISTINCT FROM v_other THEN
    RAISE EXCEPTION 'counterpart_user_id does not match this context' USING ERRCODE = '42501';
  END IF;
  IF v_other IS NULL OR v_other = v_uid THEN
    RAISE EXCEPTION 'A distinct counterpart is required';
  END IF;

  SELECT mt.id INTO v_thread_id
  FROM public.message_threads mt
  WHERE mt.context_type = p_context_type
    AND mt.context_id = v_context_id
    AND mt.user_a = LEAST(v_uid, v_other)
    AND mt.user_b = GREATEST(v_uid, v_other);

  IF v_thread_id IS NULL THEN
    INSERT INTO public.message_threads (context_type, context_id, user_a, user_b)
    VALUES (p_context_type, v_context_id, LEAST(v_uid, v_other), GREATEST(v_uid, v_other))
    ON CONFLICT (context_type, context_id, user_a, user_b) DO NOTHING
    RETURNING id INTO v_thread_id;
    IF v_thread_id IS NULL THEN
      SELECT mt.id INTO v_thread_id
      FROM public.message_threads mt
      WHERE mt.context_type = p_context_type
        AND mt.context_id = v_context_id
        AND mt.user_a = LEAST(v_uid, v_other)
        AND mt.user_b = GREATEST(v_uid, v_other);
    END IF;
  END IF;

  INSERT INTO public.message_thread_participants (thread_id, user_id)
  VALUES (v_thread_id, v_uid), (v_thread_id, v_other)
  ON CONFLICT DO NOTHING;

  v_body := NULLIF(btrim(COALESCE(p_initial_body, '')), '');
  IF v_body IS NOT NULL THEN
    INSERT INTO public.messages (thread_id, sender_id, body)
    VALUES (v_thread_id, v_uid, left(v_body, 4000));
  END IF;

  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_or_create_message_thread(public.message_context_type, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_or_create_message_thread(public.message_context_type, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_or_create_message_thread(public.message_context_type, uuid, uuid, text) TO authenticated;

-- ensure_contact_relay: caller and counterpart must own the two sides' trees.
CREATE OR REPLACE FUNCTION public.ensure_contact_relay(
  p_match_id uuid,
  p_counterpart_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_match_id IS NULL OR p_counterpart_user_id IS NULL OR p_counterpart_user_id = v_uid THEN
    RAISE EXCEPTION 'Invalid contact_relay parties';
  END IF;

  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.persons pa ON pa.id = m.person_a_id
    JOIN public.trees ta ON ta.id = pa.tree_id
    JOIN public.persons pb ON pb.id = m.person_b_id
    JOIN public.trees tb ON tb.id = pb.tree_id
    WHERE m.id = p_match_id
      AND (
        (ta.owner_id = v_uid AND tb.owner_id = p_counterpart_user_id)
        OR (tb.owner_id = v_uid AND ta.owner_id = p_counterpart_user_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not a party to this match' USING ERRCODE = '42501';
  END IF;

  SELECT cr.id INTO v_id
  FROM public.contact_relay cr
  WHERE cr.match_id = p_match_id
    AND cr.revoked_at IS NULL
    AND (
      (cr.from_user_id = v_uid AND cr.to_user_id = p_counterpart_user_id)
      OR (cr.from_user_id = p_counterpart_user_id AND cr.to_user_id = v_uid)
    )
  ORDER BY cr.created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.contact_relay (match_id, from_user_id, to_user_id, expires_at)
  VALUES (p_match_id, v_uid, p_counterpart_user_id, now() + interval '30 days')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_contact_relay(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_contact_relay(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_contact_relay(uuid, uuid) TO authenticated;

-- open_thread_from_match_hint_accept: the hint must actually be accepted.
CREATE OR REPLACE FUNCTION public.open_thread_from_match_hint_accept(
  p_hint_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hint public.match_hints%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_my_person uuid;
  v_other_person uuid;
  v_other_owner uuid;
  v_relay_id uuid;
  v_thread_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hint FROM public.match_hints WHERE id = p_hint_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hint not found';
  END IF;
  IF v_hint.owner_user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not your hint' USING ERRCODE = '42501';
  END IF;
  IF v_hint.status <> 'accepted' THEN
    RAISE EXCEPTION 'Hint has not been accepted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_hint.match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  SELECT p.id INTO v_my_person
  FROM public.persons p
  JOIN public.trees t ON t.id = p.tree_id
  WHERE p.id IN (v_match.person_a_id, v_match.person_b_id)
    AND t.owner_id = v_uid
  LIMIT 1;

  v_other_person := v_hint.counterpart_person_id;
  IF v_other_person IS NULL THEN
    IF v_my_person = v_match.person_a_id THEN
      v_other_person := v_match.person_b_id;
    ELSE
      v_other_person := v_match.person_a_id;
    END IF;
  END IF;

  SELECT t.owner_id INTO v_other_owner
  FROM public.persons p
  JOIN public.trees t ON t.id = p.tree_id
  WHERE p.id = v_other_person;

  IF v_other_owner IS NULL OR v_other_owner = v_uid THEN
    RAISE EXCEPTION 'No distinct counterpart owner for messaging';
  END IF;

  v_relay_id := public.ensure_contact_relay(v_hint.match_id, v_other_owner);
  v_thread_id := public.open_or_create_message_thread(
    'contact_relay'::public.message_context_type,
    v_relay_id,
    v_other_owner,
    'Contact request accepted. You can message here.'
  );
  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_thread_from_match_hint_accept(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_thread_from_match_hint_accept(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.open_thread_from_match_hint_accept(uuid) TO authenticated;


-- ── 7. contact_relay: writes through RPCs only ──────────────────────────────
DROP POLICY IF EXISTS contact_relay_insert_own ON public.contact_relay;
DROP POLICY IF EXISTS contact_relay_update_parties ON public.contact_relay;

-- Recipient accepts or declines a person-based contact request. Accepting opens
-- a messaging thread between the two users and returns its id.
CREATE OR REPLACE FUNCTION public.respond_contact_relay(
  p_relay_id uuid,
  p_accept boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_relay  public.contact_relay%ROWTYPE;
  v_thread uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_relay FROM public.contact_relay WHERE id = p_relay_id FOR UPDATE;
  IF NOT FOUND OR v_relay.to_user_id <> v_uid THEN
    RAISE EXCEPTION 'contact_relay not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_relay.status <> 'pending' OR v_relay.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'contact request is no longer pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contact_relay
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
         responded_at = now()
   WHERE id = v_relay.id;

  INSERT INTO public.notifications (
    recipient_user_id, kind, title_ar, title_en, body_ar, body_en, link
  ) VALUES (
    v_relay.from_user_id,
    CASE WHEN p_accept THEN 'contact_request_accepted' ELSE 'contact_request_declined' END,
    CASE WHEN p_accept THEN 'تم قبول طلب التواصل' ELSE 'تم رفض طلب التواصل' END,
    CASE WHEN p_accept THEN 'Contact request accepted' ELSE 'Contact request declined' END,
    NULL,
    NULL,
    CASE WHEN p_accept THEN '/messages' ELSE '/dashboard/requests' END
  );

  IF p_accept THEN
    v_thread := public.open_or_create_message_thread(
      'contact_relay'::public.message_context_type,
      v_relay.id,
      v_relay.from_user_id,
      NULL
    );
  END IF;

  RETURN v_thread;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_contact_relay(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_contact_relay(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_contact_relay(uuid, boolean) TO authenticated;


-- ── 8. Grants ───────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on new functions to anon and authenticated directly,
-- so REVOKE ... FROM PUBLIC alone does not close them.
-- teardown_person_link is internal: only revoke_person_link / revoke_auto_link
-- (both SECURITY DEFINER with their own checks) may call it.
REVOKE EXECUTE ON FUNCTION public.teardown_person_link(uuid, text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'compute_all_paths', 'run_matching_batch', 'refresh_match_features',
        'score_pair', 'revoke_person_link', 'revoke_auto_link', 'auto_link_match',
        'raise_relationship_dispute', 'create_contact_relay_request',
        'list_visible_pft_links', 'upsert_person_displacement',
        'update_person_optional_profile', 'is_record_owner',
        'can_edit_optional_person_fields'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;


-- ── 9. list_visible_pft_links: mask private-tree and living names ───────────
CREATE OR REPLACE FUNCTION public.list_visible_pft_links()
RETURNS TABLE (
  link_id               uuid,
  person_a_id           uuid,
  person_b_id           uuid,
  tree_a_id             uuid,
  tree_b_id             uuid,
  name_a_ar             text,
  name_a_en             text,
  name_b_ar             text,
  name_b_en             text,
  canonical_person_id   uuid,
  group_id              uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    x.link_id,
    x.person_a_id,
    x.person_b_id,
    CASE WHEN x.see_tree_a THEN x.tree_a_id END,
    CASE WHEN x.see_tree_b THEN x.tree_b_id END,
    CASE WHEN x.see_name_a THEN x.name_a_ar END,
    CASE WHEN x.see_name_a THEN x.name_a_en END,
    CASE WHEN x.see_name_b THEN x.name_b_ar END,
    CASE WHEN x.see_name_b THEN x.name_b_en END,
    x.canonical_person_id,
    x.group_id
  FROM (
    SELECT
      l.id AS link_id,
      l.person_a_id,
      l.person_b_id,
      pa.tree_id AS tree_a_id,
      pb.tree_id AS tree_b_id,
      pa.display_name_ar AS name_a_ar,
      pa.display_name_en AS name_a_en,
      pb.display_name_ar AS name_b_ar,
      pb.display_name_en AS name_b_en,
      COALESCE(ga.canonical_person_id, gb.canonical_person_id, l.person_a_id) AS canonical_person_id,
      COALESCE(ga.group_id, gb.group_id, l.person_a_id) AS group_id,
      l.created_at,
      public.is_admin() OR public.can_access_tree(pa.tree_id) AS see_tree_a,
      public.is_admin() OR public.can_access_tree(pb.tree_id) AS see_tree_b,
      public.is_admin()
        OR (public.can_access_tree(pa.tree_id) AND public.can_view_living_person_details(pa.id)) AS see_name_a,
      public.is_admin()
        OR (public.can_access_tree(pb.tree_id) AND public.can_view_living_person_details(pb.id)) AS see_name_b
    FROM public.person_links l
    JOIN public.persons pa ON pa.id = l.person_a_id
    JOIN public.persons pb ON pb.id = l.person_b_id
    LEFT JOIN public.person_identity_groups ga ON ga.person_id = l.person_a_id
    LEFT JOIN public.person_identity_groups gb ON gb.person_id = l.person_b_id
    WHERE l.status = 'confirmed'
  ) x
  WHERE x.see_tree_a OR x.see_tree_b
  ORDER BY x.group_id, x.created_at;
$$;

REVOKE ALL ON FUNCTION public.list_visible_pft_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_visible_pft_links() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_visible_pft_links() TO authenticated;
COMMENT ON FUNCTION public.list_visible_pft_links() IS
  'PFT overlay: confirmed links with at least one accessible side. Tree id and names of a side are NULL unless the viewer can read that tree; living names also need can_view_living_person_details.';


-- ── 10. raise_relationship_dispute: persons must belong to the tree ─────────
CREATE OR REPLACE FUNCTION public.raise_relationship_dispute(
  p_tree_id uuid,
  p_person_a uuid,
  p_person_b uuid,
  p_relation_type text,
  p_note text DEFAULT NULL
)
RETURNS public.relationship_disputes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_row public.relationship_disputes;
  v_a text;
  v_b text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_tree_id IS NULL OR p_person_a IS NULL OR p_person_b IS NULL THEN
    RAISE EXCEPTION 'tree_id, person_a, and person_b are required';
  END IF;
  IF NOT public.can_access_tree(p_tree_id) THEN
    RAISE EXCEPTION 'Cannot access this tree';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_a AND tree_id = p_tree_id)
     OR NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_b AND tree_id = p_tree_id) THEN
    RAISE EXCEPTION 'Both persons must belong to this tree' USING ERRCODE = '22023';
  END IF;

  SELECT owner_id INTO v_owner FROM public.trees WHERE id = p_tree_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Tree not found';
  END IF;

  SELECT COALESCE(display_name_ar, display_name_en, '?') INTO v_a
  FROM public.persons WHERE id = p_person_a;
  SELECT COALESCE(display_name_ar, display_name_en, '?') INTO v_b
  FROM public.persons WHERE id = p_person_b;

  INSERT INTO public.relationship_disputes(
    tree_id, person_a, person_b, relation_type, status, raised_by, note
  ) VALUES (
    p_tree_id, p_person_a, p_person_b,
    COALESCE(NULLIF(trim(p_relation_type), ''), 'unknown'),
    'open', v_uid, NULLIF(trim(COALESCE(p_note, '')), '')
  )
  RETURNING * INTO v_row;

  INSERT INTO public.notifications(
    recipient_user_id, kind, title_ar, title_en, body_ar, body_en, link
  ) VALUES (
    v_owner,
    'relationship_dispute',
    'نزاع على صلة قرابة',
    'Relationship dispute',
    'تم الإبلاغ عن نزاع في الصلة بين ' || COALESCE(v_a, '?') || ' و ' || COALESCE(v_b, '?'),
    'A relationship dispute was raised between ' || COALESCE(v_a, '?') || ' and ' || COALESCE(v_b, '?'),
    '/tree/' || p_tree_id::text || '/person/' || p_person_a::text
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.raise_relationship_dispute(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.raise_relationship_dispute(uuid, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.raise_relationship_dispute(uuid, uuid, uuid, text, text) TO authenticated;


-- ── 11. verification_appeals: appellant cannot pre-set review fields ────────
DROP POLICY IF EXISTS verification_appeals_insert_own ON public.verification_appeals;
CREATE POLICY verification_appeals_insert_own ON public.verification_appeals
  FOR INSERT TO authenticated
  WITH CHECK (
    appellant_id = auth.uid()
    AND status = 'open'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND staff_note IS NULL
    AND EXISTS (
      SELECT 1 FROM public.identity_verifications v
      WHERE v.id = verification_id AND v.user_id = auth.uid()
    )
  );


-- ── 12. Account deletion: FKs to auth.users must not block it ───────────────
-- Every NO ACTION / RESTRICT foreign key from a nullable public column to
-- auth.users becomes ON DELETE SET NULL (persons.created_by, *.reviewed_by,
-- merge_log.actor_user_id, ...). NOT NULL columns are reported, not changed.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass AS tbl,
           a.attname AS col,
           a.attnotnull AS notnull
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype IN ('a', 'r')
      AND array_length(c.conkey, 1) = 1
  LOOP
    IF r.notnull THEN
      RAISE NOTICE 'FK %.% (%) is NOT NULL and still blocks auth user deletion', r.tbl, r.col, r.conname;
    ELSE
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
        r.tbl, r.conname, r.col
      );
    END IF;
  END LOOP;
END $$;

-- access_log is an audit trail: keep rows when the viewer's account goes.
ALTER TABLE public.access_log ALTER COLUMN viewer_id DROP NOT NULL;
DO $$
DECLARE
  v_con text;
BEGIN
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.conrelid = 'public.access_log'::regclass
    AND c.contype = 'f'
    AND a.attname = 'viewer_id';
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.access_log DROP CONSTRAINT %I', v_con);
  END IF;
  ALTER TABLE public.access_log
    ADD CONSTRAINT access_log_viewer_id_fkey
    FOREIGN KEY (viewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;


-- ── 13. sync_person_is_living: recompute OLD and NEW persons ────────────────
CREATE OR REPLACE FUNCTION public.sync_person_is_living()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.person_id IS NOT NULL
     AND OLD.event_type::text IN ('BIRT', 'DEAT') THEN
    UPDATE public.persons p
       SET is_living = public.is_person_living(OLD.person_id)
     WHERE p.id = OLD.person_id
       AND p.is_living IS DISTINCT FROM public.is_person_living(OLD.person_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.person_id IS NOT NULL
     AND NEW.event_type::text IN ('BIRT', 'DEAT') THEN
    UPDATE public.persons p
       SET is_living = public.is_person_living(NEW.person_id)
     WHERE p.id = NEW.person_id
       AND p.is_living IS DISTINCT FROM public.is_person_living(NEW.person_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ── 14. "Unknown" placeholder names are not names ───────────────────────────
-- create_person_with_primary_name stores غير معروف / Unknown when a name part is
-- blank. Treat those as missing so unrelated incomplete records do not score
-- name points (or the 1948 family-card shortcut) against each other.
CREATE OR REPLACE FUNCTION public.mf_is_placeholder_name(p_name text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_name IS NULL OR lower(btrim(p_name)) IN ('', 'غير معروف', 'unknown');
$$;

CREATE OR REPLACE FUNCTION public.mf_given_norm(p_person_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.mf_is_placeholder_name(pn.given_name) THEN NULL
              ELSE public.normalize_arabic(public.transliterate_to_arabic(pn.given_name)) END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.mf_given_phon(p_person_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.mf_is_placeholder_name(pn.given_name) THEN NULL
              ELSE public.arabic_phonetic(public.transliterate_to_arabic(pn.given_name)) END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.mf_surname_norm(p_person_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.mf_is_placeholder_name(pn.surname) THEN NULL
              ELSE public.normalize_arabic(public.transliterate_to_arabic(pn.surname)) END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.mf_surname_phon(p_person_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN public.mf_is_placeholder_name(pn.surname) THEN NULL
              ELSE public.arabic_phonetic(public.transliterate_to_arabic(pn.surname)) END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$$;

-- Re-queue every person so the nightly incremental batch rebuilds features with
-- the new transliteration (20261107190000), spouse surnames (20261107130000)
-- and the placeholder rule above.
INSERT INTO public.match_features_dirty (person_id)
SELECT p.id FROM public.persons p
ON CONFLICT (person_id) DO NOTHING;


-- ── 15. score_pair: UNRWA evidence on BOTH sides ────────────────────────────
-- Identical to 20261107130000 except identifier_evidence now requires an
-- evidence attachment on both persons, so one side's card cannot vouch for a
-- number copied onto another record.
CREATE OR REPLACE FUNCTION public.score_pair(p_a uuid, p_b uuid)
RETURNS TABLE(score int, breakdown jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  a public.match_features%ROWTYPE;
  b public.match_features%ROWTYPE;
  p_given int; p_surname int; p_father int; p_mother int;
  p_pgf int; p_mgf int;
  p_spouse_first int; p_spouse_family int; p_spouse int;
  p_origin int; p_birth int; p_bplace int; p_death int; p_dplace int;
  p_children int;
  sp_given_lit int; sp_given_phon int; sp_sur_lit int; sp_sur_phon int;
  v_score int;
  v_vetoes text[] := ARRAY[]::text[];
  v_privacy text := NULL;
  -- clusters
  patri_max int; patri_pts int; mat_max int; mat_pts int; sp_max int; anc_max int; anc_pts int;
  v_max int; v_score_pct numeric := 0; v_evidence_pct numeric := 0;
  v_full int := 100; v_either_living boolean; v_clusters int := 0; v_nonpatri boolean := false;
  patri_ok boolean; mat_ok boolean; sp_ok boolean; anc_ok boolean;
  v_thr_dec numeric; v_thr_liv numeric; v_thr numeric; v_decision text;
  both_spouses boolean; both_spouse_surnames boolean;
  v_id_match text := NULL; v_id_evidence boolean := false;
  v_unrwa_val text; v_card_val text;
BEGIN
  SELECT * INTO a FROM public.match_features WHERE person_id = p_a;
  SELECT * INTO b FROM public.match_features WHERE person_id = p_b;
  IF a.person_id IS NULL OR b.person_id IS NULL THEN
    RETURN QUERY SELECT 0, jsonb_build_object('meta',
      jsonb_build_object('version','aio-100-v1','score',0,'decision','review','error','missing_features'));
    RETURN;
  END IF;

  v_either_living := coalesce(a.is_living, false) OR coalesce(b.is_living, false);

  -- ── hard vetoes (also gate perfect-match short-circuit) ───────────────────
  IF (a.gender='M' AND b.gender='F') OR (a.gender='F' AND b.gender='M') THEN
    v_vetoes := array_append(v_vetoes,'gender_mismatch');
  END IF;
  IF a.tree_id = b.tree_id THEN v_vetoes := array_append(v_vetoes,'same_tree'); END IF;
  IF a.birth_year IS NOT NULL AND b.birth_year IS NOT NULL AND abs(a.birth_year-b.birth_year) > 15 THEN
    v_vetoes := array_append(v_vetoes,'birth_year_gap');
  END IF;
  IF a.privacy_hold OR b.privacy_hold THEN v_vetoes := array_append(v_vetoes,'privacy_hold'); END IF;
  IF a.is_living OR b.is_living THEN v_privacy := 'living_suppressed'; END IF;

  -- ── D8 perfect-match short-circuit (UNRWA / 1948 family card) ─────────────
  SELECT ia.id_value,
         (ia.evidence_attachment_id IS NOT NULL AND ib.evidence_attachment_id IS NOT NULL)
    INTO v_unrwa_val, v_id_evidence
    FROM public.person_identifiers ia
    JOIN public.person_identifiers ib
      ON ia.id_type = ib.id_type AND ia.id_value = ib.id_value
   WHERE ia.person_id = p_a AND ib.person_id = p_b
     AND ia.id_type = 'unrwa_registration'
   LIMIT 1;
  IF v_unrwa_val IS NOT NULL THEN
    v_id_match := 'unrwa_registration';
  ELSE
    SELECT ia.id_value INTO v_card_val
      FROM public.person_identifiers ia
      JOIN public.person_identifiers ib
        ON ia.id_type = ib.id_type AND ia.id_value = ib.id_value
     WHERE ia.person_id = p_a AND ib.person_id = p_b
       AND ia.id_type = 'family_card_1948'
       AND public.mf_present(a.given_norm, b.given_norm)
       AND a.given_norm = b.given_norm
     LIMIT 1;
    IF v_card_val IS NOT NULL THEN
      v_id_match := 'family_card_1948';
      v_id_evidence := true;  -- family card has no separate evidence column requirement
    END IF;
  END IF;

  IF v_id_match IS NOT NULL THEN
    -- Hard vetoes still apply. Evidence for UNRWA is deferred to the app layer:
    -- we still short-circuit the score; meta.identifier_evidence records presence.
    IF coalesce(array_length(v_vetoes,1),0) = 0 THEN
      v_decision := 'auto_link';
      v_score := 100;
    ELSE
      v_decision := 'review';
      v_score := 100;
    END IF;
    RETURN QUERY SELECT v_score, jsonb_build_object(
      'meta', jsonb_build_object(
        'version','aio-100-v1','score',v_score,'full_scale',100,'score_pct',1.0,
        'threshold', NULL, 'clusters_agreed', NULL, 'decision', v_decision,
        'vetoes', to_jsonb(v_vetoes), 'privacy', v_privacy,
        'identifier_match', v_id_match,
        'identifier_evidence', v_id_evidence,
        'perfect_match', true),
      'params', jsonb_build_object('perfect_match', jsonb_build_object('w',100,'pts',v_score))
    );
    RETURN;
  END IF;

  -- ── AIO additive fields (literal + phonetic SEPARATE; missing = 0) ────────
  p_given   := public.mf_exact_pts(a.given_norm,   b.given_norm,   4)
             + public.mf_exact_pts(a.given_phon,   b.given_phon,   2);
  p_surname := public.mf_exact_pts(a.surname_norm, b.surname_norm, 4)
             + public.mf_exact_pts(a.surname_phon, b.surname_phon, 2);
  p_father  := public.mf_exact_pts(a.father_norm,  b.father_norm,  6)
             + public.mf_exact_pts(a.father_phon,  b.father_phon,  2);
  p_mother  := public.mf_exact_pts(a.mother_norm,  b.mother_norm,  6)
             + public.mf_exact_pts(a.mother_phon,  b.mother_phon,  2);
  p_pgf     := public.mf_exact_pts(a.pgf_norm,     b.pgf_norm,     6)
             + public.mf_exact_pts(a.pgf_phon,     b.pgf_phon,     2);
  -- pgm / mgm intentionally omitted from the 100-point sum (AIO table).
  p_mgf     := public.mf_exact_pts(a.mgf_norm,     b.mgf_norm,     6)
             + public.mf_exact_pts(a.mgf_phon,     b.mgf_phon,     2);

  both_spouses := a.spouse_names_norm IS NOT NULL AND array_length(a.spouse_names_norm,1) > 0
              AND b.spouse_names_norm IS NOT NULL AND array_length(b.spouse_names_norm,1) > 0;
  both_spouse_surnames := a.spouse_surnames_norm IS NOT NULL AND array_length(a.spouse_surnames_norm,1) > 0
                      AND b.spouse_surnames_norm IS NOT NULL AND array_length(b.spouse_surnames_norm,1) > 0;

  sp_given_lit  := CASE WHEN both_spouses AND a.spouse_names_norm && b.spouse_names_norm THEN 4 ELSE 0 END;
  sp_given_phon := CASE WHEN a.spouse_names_phon IS NOT NULL AND b.spouse_names_phon IS NOT NULL
                         AND array_length(a.spouse_names_phon,1) > 0
                         AND array_length(b.spouse_names_phon,1) > 0
                         AND a.spouse_names_phon && b.spouse_names_phon THEN 2 ELSE 0 END;
  p_spouse_first := sp_given_lit + sp_given_phon;

  sp_sur_lit  := CASE WHEN both_spouse_surnames AND a.spouse_surnames_norm && b.spouse_surnames_norm THEN 8 ELSE 0 END;
  sp_sur_phon := CASE WHEN a.spouse_surnames_phon IS NOT NULL AND b.spouse_surnames_phon IS NOT NULL
                       AND array_length(a.spouse_surnames_phon,1) > 0
                       AND array_length(b.spouse_surnames_phon,1) > 0
                       AND a.spouse_surnames_phon && b.spouse_surnames_phon THEN 2 ELSE 0 END;
  p_spouse_family := sp_sur_lit + sp_sur_phon;
  -- When only combined/given spouse names exist, map overlap to spouse-first (4+2);
  -- spouse-family stays 0 until surnames are enriched (documented).
  p_spouse := p_spouse_first + p_spouse_family;

  p_origin := public.mf_place_pts(a.origin_place_id, b.origin_place_id, 4);
  p_birth  := public.mf_year_pts(a.birth_year, b.birth_year, 7);
  p_bplace := public.mf_place_pts(a.birth_place_id, b.birth_place_id, 7);
  p_death  := public.mf_year_pts(a.death_year, b.death_year, 7);
  p_dplace := public.mf_place_pts(a.death_place_id, b.death_place_id, 7);

  IF a.num_children IS NULL OR b.num_children IS NULL THEN
    p_children := 0;
  ELSIF a.num_children = b.num_children THEN
    p_children := 8;
  ELSE
    p_children := 0;
  END IF;

  v_score := p_given + p_surname + p_father + p_mother + p_pgf + p_mgf
           + p_spouse + p_origin + p_birth + p_bplace + p_death + p_dplace + p_children;

  -- ── evidence clusters (num_children excluded from evidence_pct) ────────────
  patri_max := (CASE WHEN public.mf_present(a.given_norm,b.given_norm)   THEN 6 ELSE 0 END)
             + (CASE WHEN public.mf_present(a.father_norm,b.father_norm) THEN 8 ELSE 0 END)
             + (CASE WHEN public.mf_present(a.pgf_norm,b.pgf_norm)       THEN 8 ELSE 0 END);
  patri_pts := p_given + p_father + p_pgf;
  mat_max   := (CASE WHEN public.mf_present(a.mother_norm,b.mother_norm) THEN 8 ELSE 0 END)
             + (CASE WHEN public.mf_present(a.mgf_norm,b.mgf_norm)       THEN 8 ELSE 0 END);
  mat_pts   := p_mother + p_mgf;
  sp_max    := (CASE WHEN both_spouses THEN 6 ELSE 0 END)
             + (CASE WHEN both_spouse_surnames THEN 10 ELSE 0 END);
  anc_max   := (CASE WHEN a.origin_place_id IS NOT NULL AND b.origin_place_id IS NOT NULL THEN 4 ELSE 0 END)
             + (CASE WHEN a.birth_year IS NOT NULL AND b.birth_year IS NOT NULL THEN 7 ELSE 0 END)
             + (CASE WHEN a.birth_place_id IS NOT NULL AND b.birth_place_id IS NOT NULL THEN 7 ELSE 0 END)
             + (CASE WHEN a.death_year IS NOT NULL AND b.death_year IS NOT NULL THEN 7 ELSE 0 END)
             + (CASE WHEN a.death_place_id IS NOT NULL AND b.death_place_id IS NOT NULL THEN 7 ELSE 0 END);
  anc_pts   := p_origin + p_birth + p_bplace + p_death + p_dplace;

  v_max := patri_max + mat_max + sp_max + anc_max;
  IF v_max > 0 THEN
    v_evidence_pct := LEAST(1.0, round((patri_pts + mat_pts + p_spouse + anc_pts)::numeric / v_max, 3));
  END IF;
  v_score_pct := LEAST(1.0, round(v_score::numeric / v_full, 3));

  patri_ok := patri_max > 0 AND patri_pts >= 0.6 * patri_max;
  mat_ok   := mat_max   > 0 AND mat_pts   >= 0.6 * mat_max;
  sp_ok    := sp_max    > 0 AND p_spouse  >= 0.6 * sp_max;
  anc_ok   := anc_max   > 0 AND anc_pts   >= 0.6 * anc_max;
  v_clusters := (CASE WHEN patri_ok THEN 1 ELSE 0 END) + (CASE WHEN mat_ok THEN 1 ELSE 0 END)
              + (CASE WHEN sp_ok THEN 1 ELSE 0 END) + (CASE WHEN anc_ok THEN 1 ELSE 0 END);
  v_nonpatri := mat_ok OR sp_ok OR anc_ok;

  -- ── disagreement vetoes (present-but-different) ───────────────────────────
  IF public.mf_present(a.mother_norm,b.mother_norm) AND p_mother = 0 THEN
    v_vetoes := array_append(v_vetoes,'mother_disagree');
  END IF;
  IF both_spouses AND p_spouse = 0 THEN
    v_vetoes := array_append(v_vetoes,'spouse_disagree');
  END IF;
  IF a.origin_place_id IS NOT NULL AND b.origin_place_id IS NOT NULL
     AND a.origin_place_id <> b.origin_place_id THEN
    v_vetoes := array_append(v_vetoes,'origin_disagree');
  END IF;
  IF public.mf_present(a.mgf_norm,b.mgf_norm) AND p_mgf = 0 THEN
    v_vetoes := array_append(v_vetoes,'mgp_disagree');
  END IF;
  IF a.birth_year IS NOT NULL AND b.birth_year IS NOT NULL
     AND abs(a.birth_year-b.birth_year) > 10 AND abs(a.birth_year-b.birth_year) <= 15 THEN
    v_vetoes := array_append(v_vetoes,'birth_year_disagree');
  END IF;

  -- ── decision: raw points vs 90 / 76 (D4 / Q3) ──────────────────────────────
  SELECT link_threshold_deceased, link_threshold_living
    INTO v_thr_dec, v_thr_liv FROM public.app_settings LIMIT 1;
  v_thr_dec := COALESCE(v_thr_dec, 90);
  v_thr_liv := COALESCE(v_thr_liv, 76);
  v_thr := CASE WHEN v_either_living THEN v_thr_liv ELSE v_thr_dec END;

  IF coalesce(array_length(v_vetoes,1),0) = 0
     AND v_score >= v_thr
     AND v_clusters >= 2
     AND v_nonpatri THEN
    v_decision := 'auto_link';
  ELSE
    v_decision := 'review';
  END IF;

  RETURN QUERY SELECT v_score, jsonb_build_object(
    'meta', jsonb_build_object(
      'version','aio-100-v1','score',v_score,'max_attainable',v_max,
      'score_pct',v_score_pct,'evidence_pct',v_evidence_pct,'full_scale',v_full,
      'threshold',v_thr,'clusters_agreed',v_clusters,'decision',v_decision,
      'vetoes',to_jsonb(v_vetoes),'privacy',v_privacy),
    'params', jsonb_build_object(
      'given',         jsonb_build_object('w',6,'pts',p_given),
      'surname',       jsonb_build_object('w',6,'pts',p_surname),
      'father',        jsonb_build_object('w',8,'pts',p_father),
      'mother',        jsonb_build_object('w',8,'pts',p_mother),
      'pgf',           jsonb_build_object('w',8,'pts',p_pgf),
      'mgf',           jsonb_build_object('w',8,'pts',p_mgf),
      'spouse_first',  jsonb_build_object('w',6,'pts',p_spouse_first),
      'spouse_family', jsonb_build_object('w',10,'pts',p_spouse_family),
      'origin',        jsonb_build_object('w',4,'pts',p_origin),
      'birth_year',    jsonb_build_object('w',7,'pts',p_birth),
      'birth_place',   jsonb_build_object('w',7,'pts',p_bplace),
      'death_year',    jsonb_build_object('w',7,'pts',p_death),
      'death_place',   jsonb_build_object('w',7,'pts',p_dplace),
      'num_children',  jsonb_build_object('w',8,'pts',p_children))
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.score_pair(uuid, uuid) FROM anon;
