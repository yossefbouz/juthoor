-- ============================================================================
-- Yossef review (cdfdbeb..8ac8bd7): DEFINER grant lockdown + must-fix
-- ============================================================================
-- Supabase grants EXECUTE to anon/authenticated on new functions by default.
-- REVOKE ... FROM PUBLIC alone does not close those role grants.

-- ── 1. Urgent: close open DEFINER surfaces ───────────────────────────────────
REVOKE ALL ON FUNCTION public.upsert_optional_identifier(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contact_crypto_key()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.encrypt_contact_value(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_contact_value(bytea)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_person_claimed(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.person_identifier_verified(uuid, text) FROM anon;

-- Never leave the contact key blank (fallback string is public in the repo).
UPDATE public.app_settings
SET contact_crypto_key = COALESCE(
  NULLIF(btrim(contact_crypto_key), ''),
  encode(extensions.gen_random_bytes(32), 'hex')
)
WHERE contact_crypto_key IS NULL OR btrim(contact_crypto_key) = '';

-- Harden upsert_optional_identifier: auth + no silent EXCEPTION WHEN others
CREATE OR REPLACE FUNCTION public.upsert_optional_identifier(
  p_person_id uuid,
  p_type text,
  p_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Callable only via other DEFINER functions (EXECUTE revoked from anon/authenticated).
  IF p_person_id IS NULL OR p_type IS NULL OR btrim(p_type) = '' THEN
    RETURN;
  END IF;
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    DELETE FROM public.person_identifiers
    WHERE person_id = p_person_id AND id_type = p_type;
    RETURN;
  END IF;
  INSERT INTO public.person_identifiers (person_id, id_type, id_value)
  VALUES (p_person_id, p_type, btrim(p_value))
  ON CONFLICT (person_id, id_type) DO UPDATE SET id_value = EXCLUDED.id_value;
EXCEPTION
  WHEN check_violation OR foreign_key_violation THEN
    -- Unknown id_type enum / FK — ignore only those.
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_optional_identifier(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

-- ── 2. Claims: no self-approve; narrow created_by to first self-entry ────────
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

  -- First self-entry only: a person the caller created in their own tree in the
  -- last 10 minutes and not yet tied into any family. Everyone else, admins
  -- included, goes through request_person_claim and someone else approves.
  v_ok := EXISTS (
      SELECT 1
      FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      JOIN public.profiles me ON me.id = v_uid AND me.deleted_at IS NULL
      WHERE p.id = p_person_id
        AND p.created_by = v_uid
        AND t.owner_id = v_uid
        AND me.self_person_id IS NULL
        AND me.linked_person_id IS NULL
        AND public.can_access_tree(p.tree_id)
        AND p.created_at > now() - interval '10 minutes'
        AND NOT EXISTS (SELECT 1 FROM public.family_children fc WHERE fc.child_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM public.families f WHERE p.id IN (f.partner1_id, f.partner2_id))
    );

  IF NOT v_ok THEN
    RAISE EXCEPTION 'claim_requires_approval' USING ERRCODE = '42501';
  END IF;

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
  v_owner uuid;
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

  SELECT owner_id INTO v_owner FROM public.trees WHERE id = v_tree;
  -- Tree owner must use claim_linked_person (first self) or an admin; no self-request.
  IF v_owner = v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'owner_cannot_self_request' USING ERRCODE = '42501';
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

  -- Approver must not be the requester (self-approve hole).
  IF v_uid = v_row.requester_user_id THEN
    RAISE EXCEPTION 'cannot_self_approve' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO v_owner FROM public.trees WHERE id = v_row.tree_id;
  IF NOT (public.is_admin() OR v_owner = v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Re-check requester still free / person still unclaimed.
  IF p_decision = 'approved' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = v_row.requester_user_id
        AND pr.linked_person_id IS NOT NULL
        AND pr.deleted_at IS NULL
        AND pr.linked_person_id IS DISTINCT FROM v_row.person_id
    ) THEN
      RAISE EXCEPTION 'requester_already_linked' USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.linked_person_id = v_row.person_id
        AND pr.deleted_at IS NULL
        AND pr.id <> v_row.requester_user_id
    ) THEN
      RAISE EXCEPTION 'already_linked' USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.person_claim_requests
     SET status = p_decision,
         reviewed_by = v_uid,
         reviewed_at = now()
   WHERE id = p_claim_id;

  IF p_decision = 'approved' THEN
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

    -- Close other pending claims on this person.
    UPDATE public.person_claim_requests
       SET status = 'declined',
           reviewed_by = v_uid,
           reviewed_at = now()
     WHERE person_id = v_row.person_id
       AND status = 'pending'
       AND id <> p_claim_id;
  END IF;

  RETURN v_row.person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_person_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_person_claim(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.respond_person_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_person_claim(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_linked_person(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_linked_person(uuid) TO authenticated;

-- Claim inbox: owner/admin only + requester display fields (DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.list_incoming_person_claims()
RETURNS TABLE (
  id uuid,
  person_id uuid,
  requester_user_id uuid,
  tree_id uuid,
  status text,
  created_at timestamptz,
  person_name_ar text,
  person_name_en text,
  requester_name text,
  requester_verified boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.person_id,
    c.requester_user_id,
    c.tree_id,
    c.status::text,
    c.created_at,
    p.display_name_ar,
    p.display_name_en,
    COALESCE(NULLIF(btrim(pr.display_name_ar), ''), NULLIF(btrim(pr.display_name), ''), 'Member'),
    EXISTS (
      SELECT 1 FROM public.identity_verifications iv
      WHERE iv.user_id = c.requester_user_id AND iv.status = 'approved'
    )
  FROM public.person_claim_requests c
  JOIN public.trees t ON t.id = c.tree_id
  JOIN public.persons p ON p.id = c.person_id
  LEFT JOIN public.profiles pr ON pr.id = c.requester_user_id AND pr.deleted_at IS NULL
  WHERE c.status = 'pending'
    AND (t.owner_id = v_uid OR public.is_admin())
  ORDER BY c.created_at DESC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.list_incoming_person_claims() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_incoming_person_claims() TO authenticated;

-- ── 3. Match-hint accept: create relay as accepted ───────────────────────────
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
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_hint FROM public.match_hints WHERE id = p_hint_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hint not found';
  END IF;
  IF v_hint.owner_user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not your hint';
  END IF;
  IF v_hint.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'hint_not_accepted' USING ERRCODE = '42501';
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

  -- Never reopen contact the other side declined or revoked for this match.
  IF EXISTS (
    SELECT 1 FROM public.contact_relay cr
    WHERE cr.match_id = v_hint.match_id
      AND ((cr.from_user_id = v_uid AND cr.to_user_id = v_other_owner)
        OR (cr.from_user_id = v_other_owner AND cr.to_user_id = v_uid))
      AND (cr.status IN ('declined', 'revoked') OR cr.revoked_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'contact_declined' USING ERRCODE = '42501';
  END IF;

  v_relay_id := public.ensure_contact_relay(v_hint.match_id, v_other_owner);

  -- An accepted hint is consent: a pending relay from it becomes accepted and
  -- does not expire.
  UPDATE public.contact_relay
     SET status = 'accepted',
         responded_at = COALESCE(responded_at, now()),
         expires_at = NULL
   WHERE id = v_relay_id
     AND status = 'pending';

  v_thread_id := public.open_or_create_message_thread(
    'contact_relay'::public.message_context_type,
    v_relay_id,
    v_other_owner,
    'Contact request accepted. You can message here.'
  );
  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_thread_from_match_hint_accept(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_thread_from_match_hint_accept(uuid) TO authenticated;

-- ── 4. ID-scan attachments: cannot retag out of identity; owner can delete ───
DROP POLICY IF EXISTS pa_delete ON public.person_attachments;
CREATE POLICY pa_delete ON public.person_attachments FOR DELETE USING (
  uploaded_by = auth.uid()
  OR public.is_admin()
  OR public.is_record_owner(person_id)
  OR EXISTS (
    SELECT 1 FROM public.persons p
    JOIN public.trees t ON t.id = p.tree_id
    WHERE p.id = person_id AND t.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS pa_update ON public.person_attachments;
CREATE POLICY pa_update ON public.person_attachments FOR UPDATE
USING (
  uploaded_by = auth.uid()
  OR public.is_admin()
  OR public.is_record_owner(person_id)
  OR EXISTS (
    SELECT 1 FROM public.persons p
    JOIN public.trees t ON t.id = p.tree_id
    WHERE p.id = person_id AND t.owner_id = auth.uid()
  )
)
WITH CHECK (
  uploaded_by = auth.uid()
  OR public.is_admin()
  OR public.is_record_owner(person_id)
  OR EXISTS (
    SELECT 1 FROM public.persons p
    JOIN public.trees t ON t.id = p.tree_id
    WHERE p.id = person_id AND t.owner_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.person_attachments_identity_tag_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF OLD.tag IN ('id_card', 'family_card', 'passport')
     AND NEW.tag IS DISTINCT FROM OLD.tag
     AND NEW.tag NOT IN ('id_card', 'family_card', 'passport') THEN
    RAISE EXCEPTION 'identity_tag_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_person_attachments_identity_tag_guard ON public.person_attachments;
CREATE TRIGGER trg_person_attachments_identity_tag_guard
  BEFORE UPDATE OF tag ON public.person_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.person_attachments_identity_tag_guard();

REVOKE ALL ON FUNCTION public.person_attachments_identity_tag_guard() FROM PUBLIC, anon, authenticated;

-- ── 5. UNRWA: evidence only when number changes; same-person identity card ───
CREATE OR REPLACE FUNCTION public.upsert_person_displacement(
  p_person_id uuid,
  p_unrwa_registration_number      text DEFAULT NULL,
  p_family_card_1948_number        text DEFAULT NULL,
  p_host_country_first             text DEFAULT NULL,
  p_host_country_current           text DEFAULT NULL,
  p_refugee_status                 text DEFAULT NULL,
  p_camp_name                      text DEFAULT NULL,
  p_displacement_year              int DEFAULT NULL,
  p_displacement_wave              text DEFAULT NULL,
  p_land_property_notes            text DEFAULT NULL,
  p_oral_history                   text DEFAULT NULL,
  p_oral_history_provenance        text DEFAULT NULL,
  p_unrwa_evidence_attachment_id   uuid DEFAULT NULL,
  p_unrwa_field_of_operations      text DEFAULT NULL,
  p_unrwa_registration_date        int DEFAULT NULL,
  p_unrwa_registration_status      text DEFAULT NULL,
  p_unrwa_services_area            text DEFAULT NULL,
  p_host_travel_document_number    text DEFAULT NULL,
  p_host_id_residency_number       text DEFAULT NULL,
  p_pa_id_number                   text DEFAULT NULL,
  p_palestinian_passport_number    text DEFAULT NULL,
  p_israeli_id_number              text DEFAULT NULL,
  p_other_identity_document        text DEFAULT NULL,
  p_land_record_reference          text DEFAULT NULL,
  p_land_registry                  text DEFAULT NULL,
  p_property_location              text DEFAULT NULL,
  p_ownership_nature               text DEFAULT NULL
)
RETURNS public.person_displacement
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.person_displacement%ROWTYPE;
  v_unrwa text;
  v_card text;
  v_clear_unrwa boolean;
  v_clear_card boolean;
  v_prev_unrwa text;
  v_evidence uuid;
  v_existing_evidence uuid;
  v_number_changed boolean;
  v_host_first text;
  v_host_current text;
  v_refugee text;
  v_camp text;
  v_year int;
  v_wave text;
  v_land text;
  v_oral text;
  v_oral_prov text;
  v_field text;
  v_reg_date int;
  v_reg_status text;
  v_services text;
  v_travel text;
  v_host_id text;
  v_pa text;
  v_pass text;
  v_il text;
  v_other_id text;
  v_land_ref text;
  v_land_reg text;
  v_prop_loc text;
  v_own_nat text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_edit_optional_person_fields(p_person_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_clear_unrwa := (p_unrwa_registration_number IS NOT NULL AND btrim(p_unrwa_registration_number) = '');
  v_clear_card := (p_family_card_1948_number IS NOT NULL AND btrim(p_family_card_1948_number) = '');
  v_unrwa := NULLIF(btrim(COALESCE(p_unrwa_registration_number, '')), '');
  v_card := NULLIF(btrim(COALESCE(p_family_card_1948_number, '')), '');

  SELECT id_value, evidence_attachment_id
    INTO v_prev_unrwa, v_existing_evidence
  FROM public.person_identifiers
  WHERE person_id = p_person_id AND id_type = 'unrwa_registration';
  IF v_prev_unrwa IS NULL THEN
    SELECT unrwa_registration_number INTO v_prev_unrwa
    FROM public.person_displacement WHERE person_id = p_person_id;
  END IF;

  -- NULL arg = keep previous number (do not force evidence on unrelated edits).
  IF p_unrwa_registration_number IS NULL THEN
    v_unrwa := v_prev_unrwa;
  END IF;
  IF v_clear_unrwa THEN
    v_unrwa := NULL;
  END IF;

  IF p_family_card_1948_number IS NULL THEN
    SELECT family_card_1948_number INTO v_card
    FROM public.person_displacement WHERE person_id = p_person_id;
    IF v_card IS NULL THEN
      SELECT id_value INTO v_card
      FROM public.person_identifiers
      WHERE person_id = p_person_id AND id_type = 'family_card_1948';
    END IF;
  END IF;
  IF v_clear_card THEN v_card := NULL; END IF;

  SELECT
    host_country_first, host_country_current, refugee_status, camp_name,
    displacement_year, displacement_wave, land_property_notes,
    oral_history, oral_history_provenance,
    unrwa_field_of_operations, unrwa_registration_date, unrwa_registration_status,
    unrwa_services_area, host_travel_document_number, host_id_residency_number,
    pa_id_number, palestinian_passport_number, israeli_id_number,
    other_identity_document, land_record_reference, land_registry,
    property_location, ownership_nature
  INTO
    v_host_first, v_host_current, v_refugee, v_camp,
    v_year, v_wave, v_land, v_oral, v_oral_prov,
    v_field, v_reg_date, v_reg_status, v_services, v_travel, v_host_id,
    v_pa, v_pass, v_il,
    v_other_id, v_land_ref, v_land_reg, v_prop_loc, v_own_nat
  FROM public.person_displacement WHERE person_id = p_person_id;

  IF p_host_country_first IS NOT NULL THEN
    v_host_first := NULLIF(btrim(p_host_country_first), '');
  END IF;
  IF p_host_country_current IS NOT NULL THEN
    v_host_current := NULLIF(btrim(p_host_country_current), '');
  END IF;
  IF p_refugee_status IS NOT NULL THEN
    v_refugee := NULLIF(btrim(p_refugee_status), '');
  END IF;
  IF p_camp_name IS NOT NULL THEN
    v_camp := NULLIF(btrim(p_camp_name), '');
  END IF;
  IF p_displacement_wave IS NOT NULL THEN
    v_wave := NULLIF(btrim(p_displacement_wave), '');
    v_year := p_displacement_year;
  ELSIF p_displacement_year IS NOT NULL THEN
    v_year := p_displacement_year;
  END IF;
  IF p_land_property_notes IS NOT NULL THEN
    v_land := NULLIF(btrim(p_land_property_notes), '');
  END IF;
  IF p_oral_history IS NOT NULL THEN
    v_oral := NULLIF(btrim(p_oral_history), '');
  END IF;
  IF p_oral_history_provenance IS NOT NULL THEN
    v_oral_prov := NULLIF(btrim(p_oral_history_provenance), '');
  END IF;
  IF p_unrwa_field_of_operations IS NOT NULL THEN
    v_field := NULLIF(btrim(p_unrwa_field_of_operations), '');
  END IF;
  IF p_unrwa_registration_date IS NOT NULL THEN
    v_reg_date := NULLIF(p_unrwa_registration_date, 0);  -- 0 = clear
  END IF;
  IF p_unrwa_registration_status IS NOT NULL THEN
    v_reg_status := NULLIF(btrim(p_unrwa_registration_status), '');
  END IF;
  IF p_unrwa_services_area IS NOT NULL THEN
    v_services := NULLIF(btrim(p_unrwa_services_area), '');
  END IF;
  IF p_host_travel_document_number IS NOT NULL THEN
    v_travel := NULLIF(btrim(p_host_travel_document_number), '');
  END IF;
  IF p_host_id_residency_number IS NOT NULL THEN
    v_host_id := NULLIF(btrim(p_host_id_residency_number), '');
  END IF;
  IF p_pa_id_number IS NOT NULL THEN
    v_pa := NULLIF(btrim(p_pa_id_number), '');
  END IF;
  IF p_palestinian_passport_number IS NOT NULL THEN
    v_pass := NULLIF(btrim(p_palestinian_passport_number), '');
  END IF;
  IF p_israeli_id_number IS NOT NULL THEN
    v_il := NULLIF(btrim(p_israeli_id_number), '');
  END IF;
  IF p_other_identity_document IS NOT NULL THEN
    v_other_id := NULLIF(btrim(p_other_identity_document), '');
  END IF;
  IF p_land_record_reference IS NOT NULL THEN
    v_land_ref := NULLIF(btrim(p_land_record_reference), '');
  END IF;
  IF p_land_registry IS NOT NULL THEN
    v_land_reg := NULLIF(btrim(p_land_registry), '');
  END IF;
  IF p_property_location IS NOT NULL THEN
    v_prop_loc := NULLIF(btrim(p_property_location), '');
  END IF;
  IF p_ownership_nature IS NOT NULL THEN
    v_own_nat := NULLIF(btrim(p_ownership_nature), '');
  END IF;

  v_number_changed := (v_unrwa IS DISTINCT FROM v_prev_unrwa);
  v_evidence := p_unrwa_evidence_attachment_id;

  IF v_unrwa IS NOT NULL AND v_number_changed THEN
    -- Changing (or first-setting) the number requires a fresh same-person identity card.
    IF v_evidence IS NULL THEN
      RAISE EXCEPTION 'unrwa_evidence_required' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.person_attachments a
      WHERE a.id = v_evidence
        AND a.person_id = p_person_id
        AND a.tag IN ('id_card', 'family_card', 'passport')
    ) THEN
      RAISE EXCEPTION 'unrwa_evidence_person_mismatch' USING ERRCODE = '22023';
    END IF;
  ELSIF v_unrwa IS NOT NULL AND NOT v_number_changed THEN
    -- Keep existing evidence; ignore stale client resends.
    v_evidence := v_existing_evidence;
  END IF;

  INSERT INTO public.person_displacement AS d (
    person_id, unrwa_registration_number, family_card_1948_number,
    host_country_first, host_country_current, refugee_status, camp_name,
    displacement_year, displacement_wave, land_property_notes,
    oral_history, oral_history_provenance,
    unrwa_field_of_operations, unrwa_registration_date, unrwa_registration_status,
    unrwa_services_area, host_travel_document_number, host_id_residency_number,
    pa_id_number, palestinian_passport_number, israeli_id_number,
    other_identity_document, land_record_reference, land_registry,
    property_location, ownership_nature,
    updated_by, updated_at
  ) VALUES (
    p_person_id, v_unrwa, v_card,
    v_host_first, v_host_current, v_refugee, v_camp,
    v_year, v_wave, v_land, v_oral, v_oral_prov,
    v_field, v_reg_date, v_reg_status, v_services, v_travel, v_host_id,
    v_pa, v_pass, v_il,
    v_other_id, v_land_ref, v_land_reg, v_prop_loc, v_own_nat,
    auth.uid(), now()
  )
  ON CONFLICT (person_id) DO UPDATE SET
    unrwa_registration_number = EXCLUDED.unrwa_registration_number,
    family_card_1948_number = EXCLUDED.family_card_1948_number,
    host_country_first = EXCLUDED.host_country_first,
    host_country_current = EXCLUDED.host_country_current,
    refugee_status = EXCLUDED.refugee_status,
    camp_name = EXCLUDED.camp_name,
    displacement_year = EXCLUDED.displacement_year,
    displacement_wave = EXCLUDED.displacement_wave,
    land_property_notes = EXCLUDED.land_property_notes,
    oral_history = EXCLUDED.oral_history,
    oral_history_provenance = EXCLUDED.oral_history_provenance,
    unrwa_field_of_operations = EXCLUDED.unrwa_field_of_operations,
    unrwa_registration_date = EXCLUDED.unrwa_registration_date,
    unrwa_registration_status = EXCLUDED.unrwa_registration_status,
    unrwa_services_area = EXCLUDED.unrwa_services_area,
    host_travel_document_number = EXCLUDED.host_travel_document_number,
    host_id_residency_number = EXCLUDED.host_id_residency_number,
    pa_id_number = EXCLUDED.pa_id_number,
    palestinian_passport_number = EXCLUDED.palestinian_passport_number,
    israeli_id_number = EXCLUDED.israeli_id_number,
    other_identity_document = EXCLUDED.other_identity_document,
    land_record_reference = EXCLUDED.land_record_reference,
    land_registry = EXCLUDED.land_registry,
    property_location = EXCLUDED.property_location,
    ownership_nature = EXCLUDED.ownership_nature,
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING * INTO v_row;

  IF v_unrwa IS NOT NULL THEN
    INSERT INTO public.person_identifiers (person_id, id_type, id_value, evidence_attachment_id)
    VALUES (p_person_id, 'unrwa_registration', v_unrwa, v_evidence)
    ON CONFLICT (person_id, id_type) DO UPDATE SET
      id_value = EXCLUDED.id_value,
      evidence_attachment_id = CASE
        WHEN v_number_changed THEN EXCLUDED.evidence_attachment_id
        ELSE COALESCE(EXCLUDED.evidence_attachment_id, public.person_identifiers.evidence_attachment_id)
      END;
  ELSIF v_clear_unrwa THEN
    DELETE FROM public.person_identifiers
    WHERE person_id = p_person_id AND id_type = 'unrwa_registration';
  END IF;

  IF v_card IS NOT NULL THEN
    INSERT INTO public.person_identifiers (person_id, id_type, id_value)
    VALUES (p_person_id, 'family_card_1948', v_card)
    ON CONFLICT (person_id, id_type) DO UPDATE SET id_value = EXCLUDED.id_value;
  ELSIF v_clear_card THEN
    DELETE FROM public.person_identifiers
    WHERE person_id = p_person_id AND id_type = 'family_card_1948';
  END IF;

  PERFORM public.upsert_optional_identifier(p_person_id, 'pa_id', v_pa);
  PERFORM public.upsert_optional_identifier(p_person_id, 'pa_passport', v_pass);
  PERFORM public.upsert_optional_identifier(p_person_id, 'host_travel_doc', v_travel);
  PERFORM public.upsert_optional_identifier(p_person_id, 'host_id_residency', v_host_id);
  PERFORM public.upsert_optional_identifier(p_person_id, 'israeli_id', v_il);

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid,
  text, int, text, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid,
  text, int, text, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;

-- ── 6. Location / story columns: drop broad REST grants ──────────────────────
REVOKE SELECT (
  achievements_ar, achievements_en,
  contribution_ar, contribution_en,
  current_country, current_city, preferred_contact_method
) ON TABLE public.person_profiles FROM authenticated;

-- Keep consent flags visible for UI prompts.
GRANT SELECT (
  person_id,
  contact_consent, contribution_consent,
  updated_at, updated_by
) ON TABLE public.person_profiles TO authenticated;

-- Managers (and consented / deceased viewers) read story via DEFINER, not REST.
CREATE OR REPLACE FUNCTION public.get_person_story(p_person_id uuid)
RETURNS TABLE (
  achievements_ar text,
  achievements_en text,
  contribution_ar text,
  contribution_en text,
  contribution_consent boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.person_profiles%ROWTYPE;
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  SELECT pp.* INTO v_row FROM public.person_profiles pp WHERE pp.person_id = p_person_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_privileged := public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR public.can_edit_optional_person_fields(p_person_id);

  -- Same tree-access rule the old REST policy applied.
  IF NOT v_privileged AND NOT EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = p_person_id AND public.can_access_tree(p.tree_id)
  ) THEN
    RETURN;
  END IF;

  IF NOT (
    v_privileged
    OR COALESCE(v_row.contribution_consent, false)
    OR NOT public.is_person_living(p_person_id)
  ) THEN
    contribution_consent := COALESCE(v_row.contribution_consent, false);
    RETURN NEXT;
    RETURN;
  END IF;

  achievements_ar := v_row.achievements_ar;
  achievements_en := v_row.achievements_en;
  contribution_ar := v_row.contribution_ar;
  contribution_en := v_row.contribution_en;
  contribution_consent := COALESCE(v_row.contribution_consent, false);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_person_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_person_story(uuid) TO authenticated;

-- ── 7. Contact encrypt trigger: clear on '' even when UPDATE omits plaintext ─
CREATE OR REPLACE FUNCTION public.trg_encrypt_person_profile_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.contact_email IS NOT NULL AND btrim(NEW.contact_email) <> '' THEN
    NEW.contact_email_enc := public.encrypt_contact_value(NEW.contact_email);
    NEW.contact_email := NULL;
  ELSIF NEW.contact_email IS NOT NULL AND btrim(NEW.contact_email) = '' THEN
    NEW.contact_email_enc := NULL;
    NEW.contact_email := NULL;
  END IF;

  IF NEW.contact_phone IS NOT NULL AND btrim(NEW.contact_phone) <> '' THEN
    NEW.contact_phone_enc := public.encrypt_contact_value(NEW.contact_phone);
    NEW.contact_phone := NULL;
  ELSIF NEW.contact_phone IS NOT NULL AND btrim(NEW.contact_phone) = '' THEN
    NEW.contact_phone_enc := NULL;
    NEW.contact_phone := NULL;
  END IF;

  IF NEW.current_address IS NOT NULL AND btrim(NEW.current_address) <> '' THEN
    NEW.current_address_enc := public.encrypt_contact_value(NEW.current_address);
    NEW.current_address := NULL;
  ELSIF NEW.current_address IS NOT NULL AND btrim(NEW.current_address) = '' THEN
    NEW.current_address_enc := NULL;
    NEW.current_address := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 8. Notes: gate living on is_person_living(), not persons.is_living col ───
DROP POLICY IF EXISTS person_notes_select ON public.person_notes;
CREATE POLICY person_notes_select ON public.person_notes
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_record_owner(person_id)
    OR public.can_view_sensitive_person_fields(person_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.persons p
         WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
      )
      AND NOT public.is_person_living(person_id)
    )
  );


-- ── 9. score_pair: admin (UI) or service_role only ───────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'score_pair'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'score_pair_impl'
  ) THEN
    ALTER FUNCTION public.score_pair(uuid, uuid) RENAME TO score_pair_impl;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.score_pair(uuid, uuid);
CREATE OR REPLACE FUNCTION public.score_pair(p_a uuid, p_b uuid)
RETURNS TABLE(score int, breakdown jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT s.score, s.breakdown FROM public.score_pair_impl(p_a, p_b) s;
END;
$$;

REVOKE ALL ON FUNCTION public.score_pair(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.score_pair(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.score_pair(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.score_pair_impl(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.score_pair_impl(uuid, uuid) TO service_role;

-- ── 10. Blanket: strip PUBLIC+anon EXECUTE from DEFINER funcs (anon inherits PUBLIC)
DO $$
DECLARE
  r record;
  allowlist text[] := ARRAY[
    'can_access_tree',
    'can_view_sensitive_person_fields',
    'search_master_tree',
    'list_visible_pft_links'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    -- Authenticated keeps EXECUTE unless locked above (crypto / optional id).
    IF r.proname NOT IN (
      'contact_crypto_key',
      'encrypt_contact_value',
      'decrypt_contact_value',
      'upsert_optional_identifier',
      'score_pair_impl',
      'person_attachments_identity_tag_guard',
      'person_attachments_void_card_check',
      'trg_encrypt_person_profile_contacts',
      'trg_mf_dirty_all_on_translit_override',
      'trg_mf_families',
      'trg_mf_family_children',
      'trg_mf_person_id',
      'trg_mf_persons'
    ) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    IF r.proname = ANY (allowlist) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    END IF;
  END LOOP;
END $$;