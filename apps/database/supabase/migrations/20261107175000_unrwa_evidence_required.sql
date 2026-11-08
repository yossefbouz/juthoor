-- ============================================================================
-- D8: UNRWA registration number requires card evidence
-- ============================================================================
-- App must upload a card to person-attachments (or verification-docs) and set
-- person_identifiers.evidence_attachment_id. upsert_person_displacement now
-- requires p_unrwa_evidence_attachment_id when saving an UNRWA number.
-- auto_link_match refuses UNRWA perfect-matches that lack evidence on either side.
-- ============================================================================

-- Drop prior signature (12 args) before adding evidence parameter.
DROP FUNCTION IF EXISTS public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.upsert_person_displacement(
  p_person_id                      uuid,
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
  p_unrwa_evidence_attachment_id   uuid DEFAULT NULL
)
RETURNS public.person_displacement
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.person_displacement;
  v_unrwa text;
  v_card  text;
  v_evidence uuid;
  v_existing_evidence uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_edit_optional_person_fields(p_person_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_unrwa := NULLIF(btrim(COALESCE(p_unrwa_registration_number, '')), '');
  v_card  := NULLIF(btrim(COALESCE(p_family_card_1948_number, '')), '');
  v_evidence := p_unrwa_evidence_attachment_id;

  IF v_unrwa IS NOT NULL THEN
    SELECT pi.evidence_attachment_id INTO v_existing_evidence
      FROM public.person_identifiers pi
     WHERE pi.person_id = p_person_id
       AND pi.id_type = 'unrwa_registration';

    IF v_evidence IS NULL THEN
      v_evidence := v_existing_evidence;
    END IF;

    IF v_evidence IS NULL THEN
      RAISE EXCEPTION 'unrwa_evidence_required'
        USING ERRCODE = '23514',
              MESSAGE = 'UNRWA registration number requires an uploaded card (evidence_attachment_id)';
    END IF;

    -- Evidence must belong to this person.
    IF NOT EXISTS (
      SELECT 1 FROM public.person_attachments pa
      WHERE pa.id = v_evidence AND pa.person_id = p_person_id
    ) THEN
      RAISE EXCEPTION 'unrwa_evidence_invalid'
        USING ERRCODE = '23514',
              MESSAGE = 'UNRWA evidence attachment must belong to this person';
    END IF;
  END IF;

  INSERT INTO public.person_displacement AS pd (
    person_id,
    unrwa_registration_number,
    family_card_1948_number,
    host_country_first,
    host_country_current,
    refugee_status,
    camp_name,
    displacement_year,
    displacement_wave,
    land_property_notes,
    oral_history,
    oral_history_provenance,
    updated_at,
    updated_by
  )
  VALUES (
    p_person_id,
    v_unrwa,
    v_card,
    NULLIF(btrim(COALESCE(p_host_country_first, '')), ''),
    NULLIF(btrim(COALESCE(p_host_country_current, '')), ''),
    NULLIF(btrim(COALESCE(p_refugee_status, '')), ''),
    NULLIF(btrim(COALESCE(p_camp_name, '')), ''),
    p_displacement_year,
    NULLIF(btrim(COALESCE(p_displacement_wave, '')), ''),
    NULLIF(btrim(COALESCE(p_land_property_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_oral_history, '')), ''),
    NULLIF(btrim(COALESCE(p_oral_history_provenance, '')), ''),
    now(),
    auth.uid()
  )
  ON CONFLICT (person_id) DO UPDATE SET
    unrwa_registration_number = EXCLUDED.unrwa_registration_number,
    family_card_1948_number   = EXCLUDED.family_card_1948_number,
    host_country_first        = EXCLUDED.host_country_first,
    host_country_current      = EXCLUDED.host_country_current,
    refugee_status            = EXCLUDED.refugee_status,
    camp_name                 = EXCLUDED.camp_name,
    displacement_year         = EXCLUDED.displacement_year,
    displacement_wave         = EXCLUDED.displacement_wave,
    land_property_notes       = EXCLUDED.land_property_notes,
    oral_history              = EXCLUDED.oral_history,
    oral_history_provenance   = EXCLUDED.oral_history_provenance,
    updated_at                = now(),
    updated_by                = auth.uid()
  RETURNING * INTO v_row;

  IF v_unrwa IS NOT NULL THEN
    INSERT INTO public.person_identifiers (person_id, id_type, id_value, evidence_attachment_id)
    VALUES (p_person_id, 'unrwa_registration', v_unrwa, v_evidence)
    ON CONFLICT (person_id, id_type) DO UPDATE SET
      id_value = EXCLUDED.id_value,
      evidence_attachment_id = COALESCE(EXCLUDED.evidence_attachment_id, public.person_identifiers.evidence_attachment_id);
  ELSE
    DELETE FROM public.person_identifiers
    WHERE person_id = p_person_id AND id_type = 'unrwa_registration';
  END IF;

  IF v_card IS NOT NULL THEN
    INSERT INTO public.person_identifiers (person_id, id_type, id_value)
    VALUES (p_person_id, 'family_card_1948', v_card)
    ON CONFLICT (person_id, id_type) DO UPDATE SET id_value = EXCLUDED.id_value;
  ELSE
    DELETE FROM public.person_identifiers
    WHERE person_id = p_person_id AND id_type = 'family_card_1948';
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.upsert_person_displacement IS
  'R13 upsert for displacement fields. Gated by can_edit_optional_person_fields. UNRWA number requires evidence_attachment_id (uploaded card). Mirrors UNRWA / family_card_1948 into person_identifiers.';

REVOKE ALL ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid
) TO authenticated;

COMMENT ON COLUMN public.person_identifiers.evidence_attachment_id IS
  'Required for UNRWA at the app and upsert_person_displacement layers. Scorer records presence in meta.identifier_evidence; auto_link_match refuses UNRWA short-circuits without evidence.';

-- Block automatic perfect-match linking when UNRWA evidence is missing.
CREATE OR REPLACE FUNCTION public.auto_link_match(p_match_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.matches%ROWTYPE;
  v_link uuid;
  v_owner_a uuid; v_owner_b uuid;
  v_id_match text;
  v_id_evidence boolean;
BEGIN
  -- only a still-pending match can auto-link: a human decision or an earlier link wins.
  SELECT * INTO m FROM public.matches WHERE id = p_match_id AND status = 'pending';
  IF m.id IS NULL THEN RETURN NULL; END IF;

  v_id_match := m.score_breakdown -> 'meta' ->> 'identifier_match';
  v_id_evidence := COALESCE((m.score_breakdown -> 'meta' ->> 'identifier_evidence')::boolean, false);

  -- D8: UNRWA perfect-match is not eligible for auto-link without card evidence.
  IF v_id_match = 'unrwa_registration' AND NOT v_id_evidence THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.person_links(person_a_id, person_b_id, status, link_type,
      source_match_id, confidence_score, source, reviewed_at)
    VALUES (m.person_a_id, m.person_b_id, 'confirmed', 'same_as', m.id, m.confidence_score, 'system', now())
    ON CONFLICT (person_a_id, person_b_id) DO NOTHING
    RETURNING id INTO v_link;
  -- a link already exists for this pair (confirmed, or revoked by a person): leave it alone.
  IF v_link IS NULL THEN RETURN NULL; END IF;

  UPDATE public.matches SET status = 'auto_merged', reviewed_at = now() WHERE id = m.id;
  INSERT INTO public.merge_log(action, person_link_id, match_id, actor_role, after_state)
    VALUES ('confirm', v_link, m.id, 'system',
            jsonb_build_object('status', 'confirmed', 'via', 'auto_link'));
  PERFORM public.enqueue_overlay_refresh('auto_link', v_link);

  v_owner_a := public.match_person_owner(m.person_a_id);
  v_owner_b := public.match_person_owner(m.person_b_id);
  INSERT INTO public.match_hints(match_id, owner_user_id, counterpart_person_id, status)
    VALUES (m.id, v_owner_a, m.person_b_id, 'accepted'), (m.id, v_owner_b, m.person_a_id, 'accepted')
    ON CONFLICT (match_id, owner_user_id) DO NOTHING;
  PERFORM public.create_auto_link_notification(v_owner_a, m.id, v_link);
  IF v_owner_b IS DISTINCT FROM v_owner_a THEN
    PERFORM public.create_auto_link_notification(v_owner_b, m.id, v_link);
  END IF;
  RETURN v_link;
END $$;

REVOKE ALL ON FUNCTION public.auto_link_match(uuid) FROM PUBLIC;
COMMENT ON FUNCTION public.auto_link_match IS
  'Links a still-pending match when auto linking is on. Refuses UNRWA perfect-matches that lack identifier_evidence on either side (D8 card required).';

-- Allow record owners (and optional-field editors) to upload UNRWA card evidence
-- even when they are not tree collaborators.
DROP POLICY IF EXISTS pa_insert ON public.person_attachments;
CREATE POLICY pa_insert ON public.person_attachments FOR INSERT
  WITH CHECK (
    auth.uid() = uploaded_by
    AND (
      public.is_admin()
      OR public.is_record_owner(person_id)
      OR public.can_edit_optional_person_fields(person_id)
      OR EXISTS (
        SELECT 1
        FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = person_id
          AND (
            t.owner_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.tree_members tm
              WHERE tm.tree_id = t.id
                AND tm.user_id = auth.uid()
                AND tm.status = 'approved'
                AND tm.role IN ('owner','collaborator')
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS "pa_storage_insert" ON storage.objects;
CREATE POLICY "pa_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'person-attachments'
    AND (
      public.is_admin()
      OR public.is_record_owner(((storage.foldername(name))[2])::uuid)
      OR public.can_edit_optional_person_fields(((storage.foldername(name))[2])::uuid)
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
                AND tm.role IN ('owner','collaborator')
            )
          )
      )
    )
  );
