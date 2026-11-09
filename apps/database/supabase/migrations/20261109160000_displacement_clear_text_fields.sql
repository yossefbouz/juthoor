-- Allow clearing non-identifier displacement text fields with '' (NULL = keep).
-- Matches identifier convention. Full form saves always send wave/text keys so
-- year can clear when p_displacement_wave IS NOT NULL and year is SQL NULL.

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
  v_clear_unrwa boolean := false;
  v_clear_card boolean := false;
  v_host_first text;
  v_host_current text;
  v_refugee text;
  v_camp text;
  v_year int;
  v_wave text;
  v_land text;
  v_oral text;
  v_oral_prov text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_edit_optional_person_fields(p_person_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Identifiers: NULL = keep, '' = clear.
  v_clear_unrwa := (p_unrwa_registration_number IS NOT NULL AND btrim(p_unrwa_registration_number) = '');
  v_clear_card := (p_family_card_1948_number IS NOT NULL AND btrim(p_family_card_1948_number) = '');
  v_unrwa := NULLIF(btrim(COALESCE(p_unrwa_registration_number, '')), '');
  v_card := NULLIF(btrim(COALESCE(p_family_card_1948_number, '')), '');

  IF p_unrwa_registration_number IS NULL THEN
    SELECT unrwa_registration_number INTO v_unrwa
    FROM public.person_displacement WHERE person_id = p_person_id;
    IF v_unrwa IS NULL THEN
      SELECT id_value INTO v_unrwa
      FROM public.person_identifiers
      WHERE person_id = p_person_id AND id_type = 'unrwa_registration';
    END IF;
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

  IF v_clear_unrwa THEN v_unrwa := NULL; END IF;
  IF v_clear_card THEN v_card := NULL; END IF;

  -- Load existing non-identifier fields (keep defaults).
  SELECT
    host_country_first, host_country_current, refugee_status, camp_name,
    displacement_year, displacement_wave, land_property_notes,
    oral_history, oral_history_provenance
  INTO
    v_host_first, v_host_current, v_refugee, v_camp,
    v_year, v_wave, v_land, v_oral, v_oral_prov
  FROM public.person_displacement WHERE person_id = p_person_id;

  -- Text fields: NULL keeps, '' clears, non-empty sets.
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
    -- Form always sends wave with year; null year then means clear.
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

  v_evidence := p_unrwa_evidence_attachment_id;
  IF v_unrwa IS NOT NULL THEN
    IF v_evidence IS NULL THEN
      SELECT evidence_attachment_id INTO v_existing_evidence
      FROM public.person_identifiers
      WHERE person_id = p_person_id AND id_type = 'unrwa_registration';
      v_evidence := v_existing_evidence;
    END IF;
    IF v_evidence IS NULL THEN
      RAISE EXCEPTION 'unrwa_evidence_required' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.person_attachments a
      WHERE a.id = v_evidence AND a.person_id = p_person_id
    ) THEN
      RAISE EXCEPTION 'unrwa_evidence_person_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.person_displacement AS d (
    person_id, unrwa_registration_number, family_card_1948_number,
    host_country_first, host_country_current, refugee_status, camp_name,
    displacement_year, displacement_wave, land_property_notes,
    oral_history, oral_history_provenance, updated_by, updated_at
  ) VALUES (
    p_person_id, v_unrwa, v_card,
    v_host_first, v_host_current, v_refugee, v_camp,
    v_year, v_wave, v_land, v_oral, v_oral_prov,
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
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING * INTO v_row;

  IF v_unrwa IS NOT NULL THEN
    INSERT INTO public.person_identifiers (person_id, id_type, id_value, evidence_attachment_id)
    VALUES (p_person_id, 'unrwa_registration', v_unrwa, v_evidence)
    ON CONFLICT (person_id, id_type) DO UPDATE SET
      id_value = EXCLUDED.id_value,
      evidence_attachment_id = COALESCE(EXCLUDED.evidence_attachment_id, public.person_identifiers.evidence_attachment_id);
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

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.upsert_person_displacement IS
  'Upsert displacement. Identifiers + text: NULL keeps, empty string clears. UNRWA non-empty requires evidence_attachment_id.';

REVOKE ALL ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid
) TO authenticated;
