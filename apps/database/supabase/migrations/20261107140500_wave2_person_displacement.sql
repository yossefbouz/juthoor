-- ============================================================================
-- Wave 2.3 — R13 displacement / UNRWA / host-country / oral-history fields
-- ============================================================================
-- Staged behind a person-page tab. OPTIONAL living fields: same write gate as
-- person_profiles (record owner OR grant OR tree writer). When UNRWA /
-- family_card_1948 numbers are set, callers also upsert person_identifiers.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.person_displacement (
  person_id                   uuid PRIMARY KEY REFERENCES public.persons(id) ON DELETE CASCADE,
  unrwa_registration_number   text,
  family_card_1948_number     text,
  host_country_first          text,
  host_country_current        text,
  refugee_status              text,
  camp_name                   text,
  displacement_year           int,
  displacement_wave           text,
  land_property_notes         text,
  oral_history                text,
  oral_history_provenance     text,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.person_displacement IS
  'R13 optional displacement / identity enrichment (1:1 with persons). Writable via can_edit_optional_person_fields. UNRWA and 1948 family-card values should also be upserted into person_identifiers by the app/RPC.';

ALTER TABLE public.person_displacement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_displacement_select ON public.person_displacement;
CREATE POLICY person_displacement_select ON public.person_displacement FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS person_displacement_insert ON public.person_displacement;
CREATE POLICY person_displacement_insert ON public.person_displacement FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_optional_person_fields(person_id));

DROP POLICY IF EXISTS person_displacement_update ON public.person_displacement;
CREATE POLICY person_displacement_update ON public.person_displacement FOR UPDATE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id))
  WITH CHECK (public.can_edit_optional_person_fields(person_id));

DROP POLICY IF EXISTS person_displacement_delete ON public.person_displacement;
CREATE POLICY person_displacement_delete ON public.person_displacement FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    )
  );

-- Upsert displacement + mirror UNRWA / 1948 card into person_identifiers.
CREATE OR REPLACE FUNCTION public.upsert_person_displacement(
  p_person_id                 uuid,
  p_unrwa_registration_number text DEFAULT NULL,
  p_family_card_1948_number   text DEFAULT NULL,
  p_host_country_first        text DEFAULT NULL,
  p_host_country_current      text DEFAULT NULL,
  p_refugee_status            text DEFAULT NULL,
  p_camp_name                 text DEFAULT NULL,
  p_displacement_year         int DEFAULT NULL,
  p_displacement_wave         text DEFAULT NULL,
  p_land_property_notes       text DEFAULT NULL,
  p_oral_history              text DEFAULT NULL,
  p_oral_history_provenance   text DEFAULT NULL
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_edit_optional_person_fields(p_person_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_unrwa := NULLIF(btrim(COALESCE(p_unrwa_registration_number, '')), '');
  v_card  := NULLIF(btrim(COALESCE(p_family_card_1948_number, '')), '');

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

  -- Mirror into person_identifiers for matching (D8). Clear when blank.
  IF v_unrwa IS NOT NULL THEN
    INSERT INTO public.person_identifiers (person_id, id_type, id_value)
    VALUES (p_person_id, 'unrwa_registration', v_unrwa)
    ON CONFLICT (person_id, id_type) DO UPDATE SET id_value = EXCLUDED.id_value;
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
  'R13 upsert for displacement fields. SECURITY DEFINER gated by can_edit_optional_person_fields. Also upserts/deletes matching person_identifiers rows for UNRWA and family_card_1948.';

REVOKE ALL ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text
) TO authenticated;
