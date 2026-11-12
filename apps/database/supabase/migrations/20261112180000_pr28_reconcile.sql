-- ============================================================================
-- PR #28: reconcile the hosted project after 20261112150000/160000/170000
-- ============================================================================
-- Those three migrations were applied on the hosted project in their original
-- form. This migration corrects them going forward and is safe to run on a
-- database that never had the problems (every statement is idempotent).
--
--  1. claim_linked_person: no admin shortcut; owner path only for a fresh,
--     unconnected self-entry.
--  2. open_thread_from_match_hint_accept: hint must be accepted; a declined or
--     revoked relay is never reopened; accepted relays do not expire.
--  3. upsert_person_displacement: the registration year is an int column. Drop
--     the date overload (it made every REST call ambiguous) and the int-vs-date
--     sentinel trigger (it failed every write to person_displacement).
--  4. get_person_story: same tree-access rule as the old REST policy.
--  5. Messaging: accepted relays never expire; restore the participants that
--     20261112160000 removed from accepted relay threads.
--  6. delete_person_attachment returns the path (no wildcard storage.objects
--     delete); uploaders / record owners / admins may delete the file.
--  7. Internal matching, link and notification functions are closed to
--     logged-in users again (the blanket loop in 150000 had opened them).
--  8. contact_crypto_key raises instead of falling back to a public string.
-- ============================================================================

-- ── 1. claim_linked_person ─────────────────────────────────────────────────
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

REVOKE ALL ON FUNCTION public.claim_linked_person(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_linked_person(uuid) TO authenticated;

-- ── 2. open_thread_from_match_hint_accept ──────────────────────────────────
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

-- ── 3. upsert_person_displacement: one int overload, no sentinel trigger ────
DROP TRIGGER IF EXISTS trg_clear_unrwa_reg_date_sentinel ON public.person_displacement;
DROP FUNCTION IF EXISTS public.clear_unrwa_registration_date_if_sentinel();
DROP FUNCTION IF EXISTS public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid,
  text, date, text, text, text, text, text, text, text, text, text, text, text, text
);

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

-- ── 4. get_person_story ────────────────────────────────────────────────────
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

-- ── 5. Messaging: accepted relays never expire; restore removed participants ─
UPDATE public.contact_relay
   SET expires_at = NULL
 WHERE status = 'accepted'
   AND revoked_at IS NULL
   AND expires_at IS NOT NULL;

INSERT INTO public.message_thread_participants (thread_id, user_id)
SELECT mt.id, v.user_id
FROM public.message_threads mt
JOIN public.contact_relay cr ON cr.id = mt.context_id
CROSS JOIN LATERAL (VALUES (cr.from_user_id), (cr.to_user_id)) AS v(user_id)
WHERE mt.context_type = 'contact_relay'
  AND cr.status = 'accepted'
  AND cr.revoked_at IS NULL
  AND v.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.message_context_is_active(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mt public.message_threads%ROWTYPE;
  v_relay public.contact_relay%ROWTYPE;
BEGIN
  SELECT * INTO v_mt FROM public.message_threads WHERE id = p_thread_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_mt.context_type = 'contact_relay' THEN
    SELECT * INTO v_relay FROM public.contact_relay WHERE id = v_mt.context_id;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    RETURN v_relay.status = 'accepted'
      AND v_relay.revoked_at IS NULL;
  END IF;

  -- Other contexts stay open while the thread exists and pair keys are set.
  RETURN v_mt.participant_low IS NOT NULL AND v_mt.participant_high IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.message_context_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_context_is_active(uuid) TO authenticated;

-- ── 6. Attachments: return the path; uploaders / record owners delete files ──
DROP FUNCTION IF EXISTS public.delete_person_attachment(uuid);

CREATE OR REPLACE FUNCTION public.delete_person_attachment(p_attachment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.person_attachments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.person_attachments WHERE id = p_attachment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT (
    v_row.uploaded_by = v_uid
    OR public.is_admin()
    OR public.is_record_owner(v_row.person_id)
    OR EXISTS (
      SELECT 1 FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = v_row.person_id AND t.owner_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.person_attachments WHERE id = p_attachment_id;

  -- The caller removes the file through the Storage API with this path
  -- (deleting storage.objects rows from SQL does not remove the file).
  RETURN v_row.storage_path;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_person_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_person_attachment(uuid) TO authenticated;

-- Uploaders, record owners and admins may delete an attachment's file (the
-- original policy only allowed the tree owner). Checked through a definer
-- helper so person_attachments RLS does not hide the row from the uploader.
CREATE OR REPLACE FUNCTION public.can_delete_attachment_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.person_attachments a
      WHERE a.storage_path = p_name
        AND (a.uploaded_by = auth.uid() OR public.is_record_owner(a.person_id))
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_delete_attachment_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_attachment_object(text) TO authenticated;

DROP POLICY IF EXISTS "pa_storage_delete_uploader_or_owner" ON storage.objects;
CREATE POLICY "pa_storage_delete_uploader_or_owner" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'person-attachments'
    AND public.can_delete_attachment_object(name)
  );

-- ── 7–8. Internal functions closed; no public key fallback ─────────────────
-- ── Internal functions: never callable through the API ───────────────────────
-- The blanket loop in 20261112150000 granted authenticated EXECUTE on every
-- SECURITY DEFINER function outside a short list. These have no permission
-- check of their own (teardown_person_link, auto_link_match, the matcher, the
-- notification helpers, private-tree lookups). Every caller is itself a
-- SECURITY DEFINER function or the cron job, so revoking breaks nothing.
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
        'teardown_person_link', 'auto_link_match',
        'run_matching_batch', 'run_matching_scheduled', 'run_eval',
        'refresh_match_features', 'refresh_match_features_batch',
        'refresh_match_block_keys', 'generate_match_candidates',
        'refresh_person_identity_groups', 'drain_overlay_refresh',
        'create_match_notification', 'create_auto_link_notification',
        'match_resolve_parents', 'match_person_owner', 'match_living_flags'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ── Contact key: no public fallback ──────────────────────────────────────────
-- 20261109220000 fell back to a hard-coded string (public in the repo) when the
-- key was blank. Fail loudly instead; 20261112150000 fills a blank key.
CREATE OR REPLACE FUNCTION public.contact_crypto_key()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT NULLIF(btrim(s.contact_crypto_key), '') INTO v_key
  FROM public.app_settings s
  LIMIT 1;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'contact_crypto_key is not configured';
  END IF;
  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.contact_crypto_key() FROM PUBLIC, anon, authenticated;

