-- ============================================================================
-- R10: mandatory parent-name columns on persons + create RPC
-- ============================================================================
-- Mandatory set: First, Family, Father First, Father Family, Mother First,
-- Mother Maiden, Year of Birth, Place of Birth, Origin.
-- Blank text fields default to Unknown / غير معروف; needs_completion when any
-- mandatory piece is missing or was defaulted.
-- ============================================================================

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS father_given_ar   text,
  ADD COLUMN IF NOT EXISTS father_surname_ar text,
  ADD COLUMN IF NOT EXISTS mother_given_ar   text,
  ADD COLUMN IF NOT EXISTS mother_maiden_ar  text,
  ADD COLUMN IF NOT EXISTS father_given_en   text,
  ADD COLUMN IF NOT EXISTS father_surname_en text,
  ADD COLUMN IF NOT EXISTS mother_given_en   text,
  ADD COLUMN IF NOT EXISTS mother_maiden_en  text;

COMMENT ON COLUMN public.persons.father_given_ar IS
  'R10 mandatory: father first name (Arabic). Defaults to غير معروف when blank at create.';
COMMENT ON COLUMN public.persons.father_surname_ar IS
  'R10 mandatory: father family name (Arabic). Defaults to غير معروف when blank at create.';
COMMENT ON COLUMN public.persons.mother_given_ar IS
  'R10 mandatory: mother first name (Arabic). Defaults to غير معروف when blank at create.';
COMMENT ON COLUMN public.persons.mother_maiden_ar IS
  'R10 mandatory: mother maiden name (Arabic). Defaults to غير معروف when blank at create.';
COMMENT ON COLUMN public.persons.father_given_en IS
  'R10 mandatory: father first name (English). Defaults to Unknown when blank at create.';
COMMENT ON COLUMN public.persons.father_surname_en IS
  'R10 mandatory: father family name (English). Defaults to Unknown when blank at create.';
COMMENT ON COLUMN public.persons.mother_given_en IS
  'R10 mandatory: mother first name (English). Defaults to Unknown when blank at create.';
COMMENT ON COLUMN public.persons.mother_maiden_en IS
  'R10 mandatory: mother maiden name (English). Defaults to Unknown when blank at create.';

COMMENT ON COLUMN public.persons.needs_completion IS
  'R10: true when any mandatory field was defaulted to Unknown or birth year / place of origin is missing at create time.';

DROP FUNCTION IF EXISTS public.create_person_with_primary_name(
  uuid, public.gender_type, public.name_type, text, text, text, text, text, int, int, uuid, boolean
);

CREATE OR REPLACE FUNCTION public.create_person_with_primary_name(
  p_tree_id            uuid,
  p_gender             public.gender_type,
  p_name_type          public.name_type default 'birth',
  p_lang               text default 'ar',
  p_given_name         text default null,
  p_surname            text default null,
  p_display_name_ar    text default null,
  p_display_name_en    text default null,
  p_birth_year         int default null,
  p_death_year         int default null,
  p_place_of_origin_id uuid default null,
  p_is_placeholder     boolean default false,
  p_father_given_ar    text default null,
  p_father_surname_ar  text default null,
  p_mother_given_ar    text default null,
  p_mother_maiden_ar   text default null,
  p_father_given_en    text default null,
  p_father_surname_en  text default null,
  p_mother_given_en    text default null,
  p_mother_maiden_en   text default null
)
RETURNS TABLE (
  person_id uuid,
  name_id   uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_name_id   uuid;
  v_user_id   uuid;
  v_given     text;
  v_surname   text;
  v_display_ar text;
  v_display_en text;
  v_unknown_ar text := 'غير معروف';
  v_unknown_en text := 'Unknown';
  v_unknown   text;
  v_needs_completion boolean := false;
  v_father_given_ar   text;
  v_father_surname_ar text;
  v_mother_given_ar   text;
  v_mother_maiden_ar  text;
  v_father_given_en   text;
  v_father_surname_en text;
  v_mother_given_en   text;
  v_mother_maiden_en  text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_given   := NULLIF(btrim(COALESCE(p_given_name, '')), '');
  v_surname := NULLIF(btrim(COALESCE(p_surname, '')), '');
  v_display_ar := NULLIF(btrim(COALESCE(p_display_name_ar, '')), '');
  v_display_en := NULLIF(btrim(COALESCE(p_display_name_en, '')), '');
  v_unknown := CASE WHEN COALESCE(p_lang, 'ar') = 'en' THEN v_unknown_en ELSE v_unknown_ar END;

  v_father_given_ar   := NULLIF(btrim(COALESCE(p_father_given_ar, '')), '');
  v_father_surname_ar := NULLIF(btrim(COALESCE(p_father_surname_ar, '')), '');
  v_mother_given_ar   := NULLIF(btrim(COALESCE(p_mother_given_ar, '')), '');
  v_mother_maiden_ar  := NULLIF(btrim(COALESCE(p_mother_maiden_ar, '')), '');
  v_father_given_en   := NULLIF(btrim(COALESCE(p_father_given_en, '')), '');
  v_father_surname_en := NULLIF(btrim(COALESCE(p_father_surname_en, '')), '');
  v_mother_given_en   := NULLIF(btrim(COALESCE(p_mother_given_en, '')), '');
  v_mother_maiden_en  := NULLIF(btrim(COALESCE(p_mother_maiden_en, '')), '');

  -- R10: non-placeholders get Unknown defaults for blank mandatory text fields.
  IF NOT COALESCE(p_is_placeholder, false) THEN
    IF v_given IS NULL
       AND v_display_ar IS NULL
       AND v_display_en IS NULL THEN
      v_given := v_unknown;
      v_needs_completion := true;
    END IF;
    IF v_surname IS NULL THEN
      v_surname := v_unknown;
      v_needs_completion := true;
    END IF;

    -- Prefer Arabic Unknown when any Arabic parent field is in play; else English.
    IF v_father_given_ar IS NULL AND v_father_given_en IS NULL THEN
      v_father_given_ar := v_unknown_ar;
      v_needs_completion := true;
    ELSIF v_father_given_ar IS NULL AND v_father_given_en IS NOT NULL THEN
      NULL; -- EN-only is fine
    END IF;
    IF v_father_surname_ar IS NULL AND v_father_surname_en IS NULL THEN
      v_father_surname_ar := v_unknown_ar;
      v_needs_completion := true;
    END IF;
    IF v_mother_given_ar IS NULL AND v_mother_given_en IS NULL THEN
      v_mother_given_ar := v_unknown_ar;
      v_needs_completion := true;
    END IF;
    IF v_mother_maiden_ar IS NULL AND v_mother_maiden_en IS NULL THEN
      v_mother_maiden_ar := v_unknown_ar;
      v_needs_completion := true;
    END IF;

    -- Mirror Unknown into the other language when that language is also blank.
    IF v_father_given_en IS NULL AND v_father_given_ar = v_unknown_ar THEN
      v_father_given_en := v_unknown_en;
    END IF;
    IF v_father_surname_en IS NULL AND v_father_surname_ar = v_unknown_ar THEN
      v_father_surname_en := v_unknown_en;
    END IF;
    IF v_mother_given_en IS NULL AND v_mother_given_ar = v_unknown_ar THEN
      v_mother_given_en := v_unknown_en;
    END IF;
    IF v_mother_maiden_en IS NULL AND v_mother_maiden_ar = v_unknown_ar THEN
      v_mother_maiden_en := v_unknown_en;
    END IF;

    -- Birth year / place of origin (also stands in for place of birth today).
    IF p_birth_year IS NULL OR p_place_of_origin_id IS NULL THEN
      v_needs_completion := true;
    END IF;
  END IF;

  IF v_given IS NULL
     AND v_display_ar IS NULL
     AND v_display_en IS NULL THEN
    RAISE EXCEPTION 'At least one name (given or display) is required'
      USING ERRCODE = '22004';
  END IF;

  IF v_display_ar IS NULL AND (v_given IS NOT NULL OR v_surname IS NOT NULL)
     AND COALESCE(p_lang, 'ar') = 'ar' THEN
    v_display_ar := NULLIF(btrim(CONCAT_WS(' ', v_given, v_surname)), '');
  END IF;
  IF v_display_en IS NULL AND (v_given IS NOT NULL OR v_surname IS NOT NULL)
     AND COALESCE(p_lang, 'ar') = 'en' THEN
    v_display_en := NULLIF(btrim(CONCAT_WS(' ', v_given, v_surname)), '');
  END IF;

  INSERT INTO public.persons (
    tree_id,
    gender,
    display_name_ar,
    display_name_en,
    created_by,
    notes,
    needs_completion,
    father_given_ar,
    father_surname_ar,
    mother_given_ar,
    mother_maiden_ar,
    father_given_en,
    father_surname_en,
    mother_given_en,
    mother_maiden_en
  )
  VALUES (
    p_tree_id,
    p_gender,
    COALESCE(v_display_ar, p_display_name_ar),
    COALESCE(v_display_en, p_display_name_en),
    v_user_id,
    CASE WHEN p_is_placeholder THEN 'placeholder' ELSE NULL END,
    v_needs_completion,
    v_father_given_ar,
    v_father_surname_ar,
    v_mother_given_ar,
    v_mother_maiden_ar,
    v_father_given_en,
    v_father_surname_en,
    v_mother_given_en,
    v_mother_maiden_en
  )
  RETURNING id INTO v_person_id;

  INSERT INTO public.person_names (
    person_id,
    name_type,
    is_primary,
    lang,
    given_name,
    surname
  )
  VALUES (
    v_person_id,
    p_name_type,
    true,
    p_lang,
    v_given,
    v_surname
  )
  RETURNING id INTO v_name_id;

  IF p_birth_year IS NOT NULL OR p_place_of_origin_id IS NOT NULL THEN
    INSERT INTO public.events (
      person_id,
      event_type,
      date_year,
      place_id
    )
    VALUES (
      v_person_id,
      'BIRT',
      p_birth_year,
      p_place_of_origin_id
    );
  END IF;

  IF p_death_year IS NOT NULL THEN
    INSERT INTO public.events (
      person_id,
      event_type,
      date_year
    )
    VALUES (
      v_person_id,
      'DEAT',
      p_death_year
    );
  END IF;

  RETURN QUERY SELECT v_person_id, v_name_id;
END;
$$;

COMMENT ON FUNCTION public.create_person_with_primary_name IS
  'Atomic person + primary name + optional BIRT/DEAT + R10 parent names. Blank mandatory text → Unknown/غير معروف; needs_completion when any mandatory blank. SECURITY INVOKER.';

REVOKE ALL ON FUNCTION public.create_person_with_primary_name(
  uuid, public.gender_type, public.name_type, text, text, text, text, text, int, int, uuid, boolean,
  text, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_person_with_primary_name(
  uuid, public.gender_type, public.name_type, text, text, text, text, text, int, int, uuid, boolean,
  text, text, text, text, text, text, text, text
) TO authenticated;
