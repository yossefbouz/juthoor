-- ============================================================================
-- PR #26 re-review: close privacy/messaging/claim/matching leftovers
-- ============================================================================

-- ── 0. Helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_person_claimed(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.linked_person_id = p_person_id
      AND pr.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_person_claimed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_person_claimed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_sensitive_person_fields(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR EXISTS (
      SELECT 1 FROM public.person_field_grants g
      WHERE g.person_id = p_person_id
        AND g.grantee_user_id = auth.uid()
        AND g.scope = 'optional_fields'
    )
    OR (
      NOT public.is_person_living(p_person_id)
      AND EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = p_person_id AND public.can_access_tree(p.tree_id)
      )
    )
    OR (
      -- Living unclaimed: tree owner (IFT Admin) may view/edit sensitive fields.
      public.is_person_living(p_person_id)
      AND NOT public.is_person_claimed(p_person_id)
      AND EXISTS (
        SELECT 1
        FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = p_person_id AND t.owner_id = auth.uid()
      )
    );
$$;

-- ── 1. Contact columns: no table-level SELECT of email/phone ─────────────────
-- Strip contact from RLS-visible rows; serve via SECURITY DEFINER only.
DROP POLICY IF EXISTS person_profiles_select ON public.person_profiles;
CREATE POLICY person_profiles_select ON public.person_profiles FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.can_view_sensitive_person_fields(person_id)
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
    )
  );

-- Column privileges: revoke contact from direct table SELECT for roles.
REVOKE SELECT ON TABLE public.person_profiles FROM anon, authenticated;
GRANT SELECT (
  person_id,
  achievements_ar, achievements_en,
  contribution_ar, contribution_en,
  contact_consent, contribution_consent,
  updated_at, updated_by
) ON TABLE public.person_profiles TO authenticated;

GRANT SELECT ON TABLE public.person_profiles TO service_role;

-- Owners/editors still need to write contact columns.
GRANT INSERT, UPDATE, DELETE ON TABLE public.person_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_person_contact(p_person_id uuid)
RETURNS TABLE (contact_email text, contact_phone text, contact_consent boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_consent boolean;
  v_email text;
  v_phone text;
  v_tree uuid;
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT pp.contact_consent, pp.contact_email, pp.contact_phone, p.tree_id
    INTO v_consent, v_email, v_phone, v_tree
  FROM public.person_profiles pp
  JOIN public.persons p ON p.id = pp.person_id
  WHERE pp.person_id = p_person_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_privileged := public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR public.can_edit_optional_person_fields(p_person_id);

  -- Privileged managers may always read. Everyone else needs consent + tree access.
  -- Moderators do NOT bypass consent.
  IF v_privileged THEN
    contact_email := v_email;
    contact_phone := v_phone;
    contact_consent := COALESCE(v_consent, false);
    RETURN NEXT;
    RETURN;
  END IF;

  IF COALESCE(v_consent, false)
     AND v_tree IS NOT NULL
     AND public.can_access_tree(v_tree) THEN
    contact_email := v_email;
    contact_phone := v_phone;
    contact_consent := true;
    RETURN NEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_person_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_person_contact(uuid) TO authenticated;

-- Delete policies: optional-field editors only (not every tree writer)
DROP POLICY IF EXISTS person_profiles_delete ON public.person_profiles;
CREATE POLICY person_profiles_delete ON public.person_profiles FOR DELETE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id) OR public.is_admin());

DROP POLICY IF EXISTS person_displacement_delete ON public.person_displacement;
CREATE POLICY person_displacement_delete ON public.person_displacement FOR DELETE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id) OR public.is_admin());

DROP POLICY IF EXISTS person_identifiers_delete ON public.person_identifiers;
CREATE POLICY person_identifiers_delete ON public.person_identifiers FOR DELETE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id) OR public.is_admin());

-- D8: UNRWA inserts/updates require evidence on this person
DROP POLICY IF EXISTS person_identifiers_insert ON public.person_identifiers;
CREATE POLICY person_identifiers_insert ON public.person_identifiers FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_edit_optional_person_fields(person_id)
    AND (
      id_type <> 'unrwa_registration'
      OR (
        evidence_attachment_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.person_attachments a
          WHERE a.id = evidence_attachment_id AND a.person_id = person_identifiers.person_id
        )
      )
    )
    AND (
      evidence_attachment_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.person_attachments a
        WHERE a.id = evidence_attachment_id AND a.person_id = person_identifiers.person_id
      )
    )
  );

DROP POLICY IF EXISTS person_identifiers_update ON public.person_identifiers;
CREATE POLICY person_identifiers_update ON public.person_identifiers FOR UPDATE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id))
  WITH CHECK (
    public.can_edit_optional_person_fields(person_id)
    AND (
      id_type <> 'unrwa_registration'
      OR (
        evidence_attachment_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.person_attachments a
          WHERE a.id = evidence_attachment_id AND a.person_id = person_identifiers.person_id
        )
      )
    )
  );

-- ── 2. Identity-doc metadata + storage ───────────────────────────────────────
DROP POLICY IF EXISTS pa_select ON public.person_attachments;
DROP POLICY IF EXISTS "pa_select" ON public.person_attachments;
CREATE POLICY pa_select ON public.person_attachments FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
    )
    AND (
      tag IS NULL
      OR tag::text NOT IN ('id_card', 'family_card', 'passport')
      OR public.can_view_sensitive_person_fields(person_id)
      OR uploaded_by = auth.uid()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "pa_storage_read" ON storage.objects;
CREATE POLICY "pa_storage_read" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (
    bucket_id = 'person-attachments'
    AND public.can_access_tree(((storage.foldername(storage.objects.name))[1])::uuid)
    AND EXISTS (
      SELECT 1 FROM public.person_attachments pa
      WHERE pa.storage_path = storage.objects.name
    )
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.person_attachments pa
        WHERE pa.storage_path = storage.objects.name
          AND pa.tag IS NOT NULL
          AND pa.tag::text IN ('id_card', 'family_card', 'passport')
      )
      OR EXISTS (
        SELECT 1 FROM public.person_attachments pa
        WHERE pa.storage_path = storage.objects.name
          AND (
            public.is_admin()
            OR pa.uploaded_by = auth.uid()
            OR public.can_view_sensitive_person_fields(pa.person_id)
          )
      )
    )
  );

-- ── 3. Field grants: claimed check via DEFINER; UPDATE policy; force granted_by
DROP POLICY IF EXISTS person_field_grants_insert ON public.person_field_grants;
CREATE POLICY person_field_grants_insert ON public.person_field_grants FOR INSERT
  TO authenticated
  WITH CHECK (
    granted_by = auth.uid()
    AND grantee_user_id <> auth.uid()
    AND (
      public.is_admin()
      OR public.is_record_owner(person_id)
      OR (
        NOT public.is_person_claimed(person_id)
        AND EXISTS (
          SELECT 1 FROM public.persons p
          JOIN public.trees t ON t.id = p.tree_id
          WHERE p.id = person_id AND t.owner_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS person_field_grants_update ON public.person_field_grants;
CREATE POLICY person_field_grants_update ON public.person_field_grants FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_record_owner(person_id)
    OR granted_by = auth.uid()
    OR (
      NOT public.is_person_claimed(person_id)
      AND EXISTS (
        SELECT 1 FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = person_id AND t.owner_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    granted_by = auth.uid()
    AND (
      public.is_admin()
      OR public.is_record_owner(person_id)
      OR (
        NOT public.is_person_claimed(person_id)
        AND EXISTS (
          SELECT 1 FROM public.persons p
          JOIN public.trees t ON t.id = p.tree_id
          WHERE p.id = person_id AND t.owner_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS person_field_grants_delete ON public.person_field_grants;
CREATE POLICY person_field_grants_delete ON public.person_field_grants FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_record_owner(person_id)
    OR granted_by = auth.uid()
    OR (
      NOT public.is_person_claimed(person_id)
      AND EXISTS (
        SELECT 1 FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = person_id AND t.owner_id = auth.uid()
      )
    )
  );

-- ── 4. Claim request / approve flow ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.person_claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tree_id uuid NOT NULL REFERENCES public.trees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS person_claim_requests_one_pending
  ON public.person_claim_requests (person_id, requester_user_id)
  WHERE status = 'pending';

ALTER TABLE public.person_claim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_claim_requests_select ON public.person_claim_requests;
CREATE POLICY person_claim_requests_select ON public.person_claim_requests FOR SELECT
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.trees t
      WHERE t.id = tree_id AND t.owner_id = auth.uid()
    )
  );

-- Narrow direct claim: admin OR self-create in own tree only (no verification shortcut)
CREATE OR REPLACE FUNCTION public.claim_linked_person(p_person_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'person_id required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'Person not found or not accessible' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.linked_person_id = p_person_id
      AND pr.deleted_at IS NULL
      AND pr.id <> v_uid
  ) THEN
    RAISE EXCEPTION 'already_linked' USING ERRCODE = '23505';
  END IF;

  v_ok := public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = p_person_id
        AND p.created_by = v_uid
        AND t.owner_id = v_uid
        AND public.can_access_tree(p.tree_id)
    );

  IF NOT v_ok THEN
    RAISE EXCEPTION 'claim_requires_approval' USING ERRCODE = '42501';
  END IF;

  -- Drop tree-owner-issued grants when the person becomes claimed.
  DELETE FROM public.person_field_grants g
  WHERE g.person_id = p_person_id
    AND EXISTS (
      SELECT 1 FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = g.person_id AND t.owner_id = g.granted_by
    )
    AND g.granted_by <> v_uid;

  UPDATE public.profiles
     SET linked_person_id = p_person_id,
         self_person_id = p_person_id,
         updated_at = now()
   WHERE id = v_uid
     AND deleted_at IS NULL;

  RETURN p_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_person_claim(p_person_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tree uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT tree_id INTO v_tree FROM public.persons WHERE id = p_person_id;
  IF v_tree IS NULL THEN
    RAISE EXCEPTION 'Person not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_access_tree(v_tree) THEN
    RAISE EXCEPTION 'tree_access_required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.linked_person_id = p_person_id AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'already_linked' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = v_uid AND pr.linked_person_id IS NOT NULL AND pr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'requester_already_linked' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.person_claim_requests (person_id, requester_user_id, tree_id, status)
  VALUES (p_person_id, v_uid, v_tree, 'pending')
  ON CONFLICT (person_id, requester_user_id) WHERE status = 'pending' DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.person_claim_requests
    WHERE person_id = p_person_id AND requester_user_id = v_uid AND status = 'pending';
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'already_pending' USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.notifications(
    recipient_user_id, kind, title_ar, title_en, body_ar, body_en, link
  )
  SELECT t.owner_id,
         'person_claim_request',
         'طلب ربط شخص',
         'Person claim request',
         'طلب مستخدم ربط حسابه بشخص في شجرتك',
         'A user requested to link their account to a person in your tree',
         '/dashboard/requests'
  FROM public.trees t
  WHERE t.id = v_tree
    AND t.owner_id IS NOT NULL
    AND t.owner_id <> v_uid;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_person_claim(p_claim_id uuid, p_decision text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.person_claim_requests%ROWTYPE;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_decision NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT * INTO v_row FROM public.person_claim_requests WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'claim_not_pending';
  END IF;

  SELECT owner_id INTO v_owner FROM public.trees WHERE id = v_row.tree_id;
  IF NOT (public.is_admin() OR v_owner = v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.person_claim_requests
     SET status = p_decision,
         reviewed_by = v_uid,
         reviewed_at = now()
   WHERE id = p_claim_id;

  IF p_decision = 'approved' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.linked_person_id = v_row.person_id
        AND pr.deleted_at IS NULL
        AND pr.id <> v_row.requester_user_id
    ) THEN
      RAISE EXCEPTION 'already_linked' USING ERRCODE = '23505';
    END IF;

    DELETE FROM public.person_field_grants g
    WHERE g.person_id = v_row.person_id
      AND EXISTS (
        SELECT 1 FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = g.person_id AND t.owner_id = g.granted_by
      )
      AND g.granted_by <> v_row.requester_user_id;

    UPDATE public.profiles
       SET linked_person_id = v_row.person_id,
           self_person_id = v_row.person_id,
           updated_at = now()
     WHERE id = v_row.requester_user_id
       AND deleted_at IS NULL;
  END IF;

  RETURN v_row.person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_person_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_person_claim(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_person_claim(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_person_claim(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_linked_person(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_linked_person(uuid) TO authenticated;

COMMENT ON FUNCTION public.request_person_claim(uuid) IS
  'Living person asks to claim a record; requires tree access. Tree owner/admin approves via respond_person_claim.';

-- ── 5. access_log.viewer_id nullable (SET NULL FK) ───────────────────────────
ALTER TABLE public.access_log
  ALTER COLUMN viewer_id DROP NOT NULL;

-- ── 6. Messaging: per-pair threads; derive counterpart; relay acceptance ─────
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS participant_low uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS participant_high uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill from existing two-party threads where possible
UPDATE public.message_threads mt
SET
  participant_low = sub.lo,
  participant_high = sub.hi
FROM (
  SELECT thread_id,
         (ARRAY_AGG(user_id ORDER BY user_id::text))[1] AS lo,
         (ARRAY_AGG(user_id ORDER BY user_id::text DESC))[1] AS hi
  FROM public.message_thread_participants
  GROUP BY thread_id
  HAVING COUNT(*) = 2
) sub
WHERE mt.id = sub.thread_id
  AND mt.participant_low IS NULL;

ALTER TABLE public.message_threads
  DROP CONSTRAINT IF EXISTS message_threads_context_type_context_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_threads_context_pair_key'
  ) THEN
    ALTER TABLE public.message_threads
      ADD CONSTRAINT message_threads_context_pair_key
      UNIQUE (context_type, context_id, participant_low, participant_high);
  END IF;
END $$;

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
  v_uid uuid := auth.uid();
  v_thread_id uuid;
  v_other uuid;
  v_derived uuid;
  v_context_id uuid := p_context_id;
  v_attachment public.person_attachments%ROWTYPE;
  v_tree_id uuid;
  v_owner uuid;
  v_relay public.contact_relay%ROWTYPE;
  v_body text;
  v_relay_found boolean := false;
  v_dispute public.relationship_disputes%ROWTYPE;
  v_low uuid;
  v_high uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_context_id IS NULL THEN RAISE EXCEPTION 'context_id required'; END IF;

  IF p_context_type IN ('picture_link', 'document_link') THEN
    SELECT * INTO v_attachment FROM public.person_attachments WHERE id = v_context_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Attachment not found'; END IF;
    SELECT p.tree_id INTO v_tree_id FROM public.persons p WHERE p.id = v_attachment.person_id;
    SELECT t.owner_id INTO v_owner FROM public.trees t WHERE t.id = v_tree_id;
    IF v_owner IS NULL THEN RAISE EXCEPTION 'Tree owner not found'; END IF;
    IF NOT (v_uid = v_owner OR v_uid = v_attachment.uploaded_by OR public.is_admin()) THEN
      RAISE EXCEPTION 'Not a party to this attachment thread' USING ERRCODE = '42501';
    END IF;
    IF v_uid = v_owner THEN
      v_derived := v_attachment.uploaded_by;
    ELSE
      v_derived := v_owner;
    END IF;
    IF p_counterpart_user_id IS NOT NULL AND p_counterpart_user_id IS DISTINCT FROM v_derived THEN
      RAISE EXCEPTION 'counterpart_mismatch' USING ERRCODE = '22023';
    END IF;
    v_other := v_derived;

  ELSIF p_context_type = 'contact_relay' THEN
    SELECT * INTO v_relay FROM public.contact_relay WHERE id = v_context_id;
    v_relay_found := FOUND;
    IF NOT v_relay_found THEN
      SELECT * INTO v_relay
      FROM public.contact_relay
      WHERE match_id = v_context_id
        AND (from_user_id = v_uid OR to_user_id = v_uid)
      ORDER BY created_at DESC
      LIMIT 1;
      v_relay_found := FOUND;
    END IF;
    IF NOT v_relay_found THEN
      RAISE EXCEPTION 'contact_relay not found';
    END IF;
    v_context_id := v_relay.id;
    IF NOT (v_uid = v_relay.from_user_id OR v_uid = v_relay.to_user_id OR public.is_admin()) THEN
      RAISE EXCEPTION 'Not a contact_relay participant' USING ERRCODE = '42501';
    END IF;
    IF v_relay.status IS DISTINCT FROM 'accepted'
       OR v_relay.revoked_at IS NOT NULL
       OR (v_relay.expires_at IS NOT NULL AND v_relay.expires_at < now()) THEN
      RAISE EXCEPTION 'contact_relay_not_active' USING ERRCODE = '42501';
    END IF;
    v_derived := CASE WHEN v_relay.from_user_id = v_uid THEN v_relay.to_user_id ELSE v_relay.from_user_id END;
    IF p_counterpart_user_id IS NOT NULL AND p_counterpart_user_id IS DISTINCT FROM v_derived THEN
      RAISE EXCEPTION 'counterpart_mismatch' USING ERRCODE = '22023';
    END IF;
    v_other := v_derived;

  ELSIF p_context_type = 'relationship_dispute' THEN
    -- Prefer dispute id as context; fall back to a dispute the caller raised
    -- on a family whose partners match the disputed persons.
    SELECT * INTO v_dispute FROM public.relationship_disputes WHERE id = v_context_id;
    IF NOT FOUND THEN
      SELECT d.* INTO v_dispute
      FROM public.relationship_disputes d
      JOIN public.families f ON f.id = v_context_id AND f.tree_id = d.tree_id
      WHERE d.raised_by = v_uid
        AND (
          (d.person_a IN (f.partner1_id, f.partner2_id)
           AND d.person_b IN (f.partner1_id, f.partner2_id))
          OR d.person_a IN (SELECT fc.child_id FROM public.family_children fc WHERE fc.family_id = f.id)
          OR d.person_b IN (SELECT fc.child_id FROM public.family_children fc WHERE fc.family_id = f.id)
        )
      ORDER BY d.created_at DESC
      LIMIT 1;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dispute_required' USING ERRCODE = '42501';
    END IF;
    v_context_id := v_dispute.id;
    v_tree_id := v_dispute.tree_id;
    SELECT t.owner_id INTO v_owner FROM public.trees t WHERE t.id = v_tree_id;
    IF NOT (
      v_uid = v_dispute.raised_by
      OR v_uid = v_owner
      OR public.is_admin()
    ) THEN
      RAISE EXCEPTION 'Not a party to this dispute thread' USING ERRCODE = '42501';
    END IF;
    IF v_uid = v_dispute.raised_by THEN
      v_derived := v_owner;
    ELSE
      v_derived := v_dispute.raised_by;
    END IF;
    IF p_counterpart_user_id IS NOT NULL AND p_counterpart_user_id IS DISTINCT FROM v_derived THEN
      RAISE EXCEPTION 'counterpart_mismatch' USING ERRCODE = '22023';
    END IF;
    v_other := v_derived;
  ELSE
    RAISE EXCEPTION 'Unsupported message context';
  END IF;

  IF v_other IS NULL OR v_other = v_uid THEN
    RAISE EXCEPTION 'A distinct counterpart is required';
  END IF;

  v_low := LEAST(v_uid, v_other);
  v_high := GREATEST(v_uid, v_other);

  SELECT mt.id INTO v_thread_id
  FROM public.message_threads mt
  WHERE mt.context_type = p_context_type
    AND mt.context_id = v_context_id
    AND mt.participant_low = v_low
    AND mt.participant_high = v_high;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.message_threads (
      context_type, context_id, participant_low, participant_high
    ) VALUES (p_context_type, v_context_id, v_low, v_high)
    RETURNING id INTO v_thread_id;
  END IF;

  INSERT INTO public.message_thread_participants (thread_id, user_id)
  VALUES (v_thread_id, v_uid) ON CONFLICT DO NOTHING;
  INSERT INTO public.message_thread_participants (thread_id, user_id)
  VALUES (v_thread_id, v_other) ON CONFLICT DO NOTHING;

  v_body := NULLIF(btrim(COALESCE(p_initial_body, '')), '');
  IF v_body IS NOT NULL THEN
    INSERT INTO public.messages (thread_id, sender_id, body)
    VALUES (v_thread_id, v_uid, left(v_body, 4000));
  END IF;

  RETURN v_thread_id;
END;
$$;

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
  v_id uuid;
  v_expected uuid;
  v_party boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_match_id IS NULL OR p_counterpart_user_id IS NULL OR p_counterpart_user_id = v_uid THEN
    RAISE EXCEPTION 'Invalid contact_relay parties';
  END IF;

  -- Counterpart must be the other tree's owner for this match.
  SELECT CASE
           WHEN ta.owner_id = v_uid THEN tb.owner_id
           WHEN tb.owner_id = v_uid THEN ta.owner_id
           ELSE NULL
         END
    INTO v_expected
  FROM public.matches m
  JOIN public.persons pa ON pa.id = m.person_a_id
  JOIN public.persons pb ON pb.id = m.person_b_id
  JOIN public.trees ta ON ta.id = pa.tree_id
  JOIN public.trees tb ON tb.id = pb.tree_id
  WHERE m.id = p_match_id;

  IF v_expected IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not a party to this match' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() AND p_counterpart_user_id IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'counterpart_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.persons pa ON pa.id = m.person_a_id
    JOIN public.persons pb ON pb.id = m.person_b_id
    JOIN public.trees ta ON ta.id = pa.tree_id
    JOIN public.trees tb ON tb.id = pb.tree_id
    WHERE m.id = p_match_id
      AND (ta.owner_id = v_uid OR tb.owner_id = v_uid OR public.is_admin())
  ) INTO v_party;

  IF NOT v_party THEN
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

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.contact_relay (match_id, from_user_id, to_user_id, status, expires_at)
  VALUES (p_match_id, v_uid, p_counterpart_user_id, 'pending', now() + interval '30 days')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_contact_relay(
  p_relay_id uuid,
  p_status text
)
RETURNS public.contact_relay
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.contact_relay;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_status NOT IN ('accepted', 'declined', 'revoked') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO v_row FROM public.contact_relay WHERE id = p_relay_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relay not found'; END IF;
  IF v_row.to_user_id <> v_uid AND v_row.from_user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not a party' USING ERRCODE = '42501';
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'relay_revoked';
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RAISE EXCEPTION 'relay_expired';
  END IF;
  IF p_status = 'revoked' AND v_row.from_user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the requester can revoke' USING ERRCODE = '42501';
  END IF;
  IF p_status IN ('accepted', 'declined') THEN
    IF v_row.to_user_id <> v_uid AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only the recipient can accept or decline' USING ERRCODE = '42501';
    END IF;
    IF v_row.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'relay_not_pending';
    END IF;
  END IF;

  UPDATE public.contact_relay
     SET status = p_status,
         responded_at = now(),
         revoked_at = CASE WHEN p_status = 'revoked' THEN now() ELSE revoked_at END
   WHERE id = p_relay_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
-- Align optional-field editor with is_person_claimed (DEFINER)
CREATE OR REPLACE FUNCTION public.can_edit_optional_person_fields(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR EXISTS (
      SELECT 1 FROM public.person_field_grants g
      WHERE g.person_id = p_person_id
        AND g.grantee_user_id = auth.uid()
        AND g.scope = 'optional_fields'
    )
    OR (
      NOT public.is_person_living(p_person_id)
      AND EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = p_person_id
          AND public.can_write_tree(p.tree_id)
      )
    )
    OR (
      public.is_person_living(p_person_id)
      AND NOT public.is_person_claimed(p_person_id)
      AND EXISTS (
        SELECT 1
        FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = p_person_id
          AND t.owner_id = auth.uid()
      )
    );
$$;
