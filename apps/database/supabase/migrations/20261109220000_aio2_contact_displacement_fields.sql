-- ============================================================================
-- AIO2 §5.5 / §5.7 remaining fields + at-rest contact encryption (pgcrypto)
-- ============================================================================

-- ── Contact / current location (§5.5) ────────────────────────────────────────
ALTER TABLE public.person_profiles
  ADD COLUMN IF NOT EXISTS current_country text,
  ADD COLUMN IF NOT EXISTS current_city text,
  ADD COLUMN IF NOT EXISTS current_address text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text
    CHECK (
      preferred_contact_method IS NULL
      OR preferred_contact_method IN ('email', 'mobile', 'messaging', 'do_not_contact')
    ),
  ADD COLUMN IF NOT EXISTS contact_email_enc bytea,
  ADD COLUMN IF NOT EXISTS contact_phone_enc bytea,
  ADD COLUMN IF NOT EXISTS current_address_enc bytea;

COMMENT ON COLUMN public.person_profiles.contact_email_enc IS
  'pgp_sym_encrypt ciphertext for contact_email (AIO2 §5.5).';
COMMENT ON COLUMN public.person_profiles.contact_phone_enc IS
  'pgp_sym_encrypt ciphertext for contact_phone (AIO2 §5.5).';
COMMENT ON COLUMN public.person_profiles.current_address_enc IS
  'pgp_sym_encrypt ciphertext for current_address (AIO2 §5.5).';

-- Encryption key stored in app_settings (override in production).
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS contact_crypto_key text;

UPDATE public.app_settings
SET contact_crypto_key = COALESCE(
  NULLIF(btrim(contact_crypto_key), ''),
  encode(gen_random_bytes(32), 'hex')
)
WHERE id IS NOT NULL
  AND (contact_crypto_key IS NULL OR btrim(contact_crypto_key) = '');

CREATE OR REPLACE FUNCTION public.contact_crypto_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(btrim(contact_crypto_key), ''),
    'juthoor-dev-contact-key-change-me'
  )
  FROM public.app_settings
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.contact_crypto_key() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.encrypt_contact_value(p_plain text)
RETURNS bytea
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_plain IS NULL OR btrim(p_plain) = '' THEN NULL
    ELSE extensions.pgp_sym_encrypt(p_plain, public.contact_crypto_key())
  END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_contact_value(p_cipher bytea)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_cipher IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN extensions.pgp_sym_decrypt(p_cipher, public.contact_crypto_key());
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.encrypt_contact_value(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_contact_value(bytea) FROM PUBLIC;

-- Migrate existing plaintext into ciphertext, then clear plaintext columns.
UPDATE public.person_profiles
SET
  contact_email_enc = COALESCE(
    contact_email_enc,
    public.encrypt_contact_value(contact_email)
  ),
  contact_phone_enc = COALESCE(
    contact_phone_enc,
    public.encrypt_contact_value(contact_phone)
  ),
  current_address_enc = COALESCE(
    current_address_enc,
    public.encrypt_contact_value(current_address)
  )
WHERE contact_email IS NOT NULL
   OR contact_phone IS NOT NULL
   OR current_address IS NOT NULL;

UPDATE public.person_profiles
SET contact_email = NULL,
    contact_phone = NULL,
    current_address = NULL
WHERE contact_email_enc IS NOT NULL
   OR contact_phone_enc IS NOT NULL
   OR current_address_enc IS NOT NULL;

-- Keep column grants: still no SELECT of plaintext contact cols (already revoked).
-- Grant new non-sensitive columns.
GRANT SELECT (
  person_id,
  achievements_ar, achievements_en,
  contribution_ar, contribution_en,
  contact_consent, contribution_consent,
  current_country, current_city, preferred_contact_method,
  updated_at, updated_by
) ON TABLE public.person_profiles TO authenticated;

DROP FUNCTION IF EXISTS public.get_person_contact(uuid);

CREATE OR REPLACE FUNCTION public.get_person_contact(p_person_id uuid)
RETURNS TABLE (
  contact_email text,
  contact_phone text,
  contact_consent boolean,
  current_country text,
  current_city text,
  current_address text,
  preferred_contact_method text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.person_profiles%ROWTYPE;
  v_tree uuid;
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT pp.* INTO v_row
  FROM public.person_profiles pp
  WHERE pp.person_id = p_person_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT p.tree_id INTO v_tree FROM public.persons p WHERE p.id = p_person_id;

  v_privileged := public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR public.can_edit_optional_person_fields(p_person_id);

  IF NOT (
    v_privileged
    OR (
      COALESCE(v_row.contact_consent, false)
      AND v_tree IS NOT NULL
      AND public.can_access_tree(v_tree)
    )
  ) THEN
    -- Consent flag / location non-sensitive? Country/city still restricted per §5.5.
    RETURN;
  END IF;

  contact_email := COALESCE(
    public.decrypt_contact_value(v_row.contact_email_enc),
    v_row.contact_email
  );
  contact_phone := COALESCE(
    public.decrypt_contact_value(v_row.contact_phone_enc),
    v_row.contact_phone
  );
  current_address := COALESCE(
    public.decrypt_contact_value(v_row.current_address_enc),
    v_row.current_address
  );
  contact_consent := COALESCE(v_row.contact_consent, false);
  current_country := v_row.current_country;
  current_city := v_row.current_city;
  preferred_contact_method := v_row.preferred_contact_method;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_person_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_person_contact(uuid) TO authenticated;

-- Encrypt on write via trigger (authenticated upserts still send plaintext cols).
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

DROP TRIGGER IF EXISTS trg_encrypt_person_profile_contacts ON public.person_profiles;
CREATE TRIGGER trg_encrypt_person_profile_contacts
  BEFORE INSERT OR UPDATE ON public.person_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_encrypt_person_profile_contacts();

-- Widen person_identifiers.id_type for §5.7 host/PA/IL documents (export/IDNO).
ALTER TABLE public.person_identifiers DROP CONSTRAINT IF EXISTS person_identifiers_id_type_check;
ALTER TABLE public.person_identifiers
  ADD CONSTRAINT person_identifiers_id_type_check
  CHECK (id_type IN (
    'unrwa_registration',
    'family_card_1948',
    'pa_id',
    'pa_passport',
    'host_travel_doc',
    'host_id_residency',
    'israeli_id'
  ));

-- ── Displacement §5.7 extras ─────────────────────────────────────────────────
ALTER TABLE public.person_displacement
  ADD COLUMN IF NOT EXISTS unrwa_field_of_operations text
    CHECK (
      unrwa_field_of_operations IS NULL
      OR unrwa_field_of_operations IN ('jordan','lebanon','syria','west_bank','gaza')
    ),
  ADD COLUMN IF NOT EXISTS unrwa_registration_date int
    CHECK (unrwa_registration_date IS NULL OR (unrwa_registration_date BETWEEN 1948 AND 2100)),
  ADD COLUMN IF NOT EXISTS unrwa_registration_status text
    CHECK (
      unrwa_registration_status IS NULL
      OR unrwa_registration_status IN ('active','inactive','descendant')
    ),
  ADD COLUMN IF NOT EXISTS unrwa_services_area text,
  ADD COLUMN IF NOT EXISTS host_travel_document_number text,
  ADD COLUMN IF NOT EXISTS host_id_residency_number text,
  ADD COLUMN IF NOT EXISTS pa_id_number text,
  ADD COLUMN IF NOT EXISTS palestinian_passport_number text,
  ADD COLUMN IF NOT EXISTS israeli_id_number text,
  ADD COLUMN IF NOT EXISTS other_identity_document text,
  ADD COLUMN IF NOT EXISTS land_record_reference text,
  ADD COLUMN IF NOT EXISTS land_registry text
    CHECK (
      land_registry IS NULL
      OR land_registry IN ('ottoman_tapu','british_mandate','israeli','pa','other')
    ),
  ADD COLUMN IF NOT EXISTS property_location text,
  ADD COLUMN IF NOT EXISTS ownership_nature text
    CHECK (
      ownership_nature IS NULL
      OR ownership_nature IN ('owner','co_owner','heir','tenant')
    );

-- Drop prior overloads so CREATE does not leave ambiguous signatures.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'upsert_person_displacement'
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

-- Extend upsert RPC with new params (NULL = keep, '' = clear for text).
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
    v_reg_date := p_unrwa_registration_date;
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

  -- Mirror other ID numbers into person_identifiers where useful for search/export
  PERFORM public.upsert_optional_identifier(p_person_id, 'pa_id', v_pa);
  PERFORM public.upsert_optional_identifier(p_person_id, 'pa_passport', v_pass);
  PERFORM public.upsert_optional_identifier(p_person_id, 'host_travel_doc', v_travel);
  PERFORM public.upsert_optional_identifier(p_person_id, 'host_id_residency', v_host_id);
  PERFORM public.upsert_optional_identifier(p_person_id, 'israeli_id', v_il);

  RETURN v_row;
END;
$$;

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
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    DELETE FROM public.person_identifiers
    WHERE person_id = p_person_id AND id_type = p_type;
    RETURN;
  END IF;
  INSERT INTO public.person_identifiers (person_id, id_type, id_value)
  VALUES (p_person_id, p_type, btrim(p_value))
  ON CONFLICT (person_id, id_type) DO UPDATE SET id_value = EXCLUDED.id_value;
EXCEPTION WHEN check_violation OR foreign_key_violation OR others THEN
  -- id_type may be an enum; ignore types not yet in enum
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_optional_identifier(uuid, text, text) FROM PUBLIC;

-- land_property_notes already exists; keep as free-text supplement.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'upsert_person_displacement'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid,
  text, int, text, text, text, text, text, text, text,
  text, text, text, text, text
) TO authenticated;
