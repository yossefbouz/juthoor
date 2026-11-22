-- ============================================================================
-- PR #31 review fixes (2026-11-22), as a forward migration
-- ============================================================================
-- 20261114120000_findings_group_a.sql may already be applied on a host, so it
-- is not edited. This file brings every environment to the same state.
--
--  1. Nightly matching is off again, and off by default. Switching it on is a
--     separate decision (go-live criteria are not agreed yet).
--  2. create_person_with_primary_name is back to its 20261107174000 body: a
--     missing origin stays empty and the record is flagged needs_completion.
--     The Group A version put a shared "Unknown" place on a BIRT event and
--     wrote person_profiles from a SECURITY INVOKER function; signed-in users
--     cannot read person_profiles.origin_text (the ON CONFLICT clause needs
--     it), and a collaborator may not insert a living person's profile row.
--  3. The shared "Unknown" place is not evidence: mf_place_pts gives it no
--     points, and BIRT events that only carried it are removed.
--  4. score_pair_impl is back to its 20261113120000 body: a perfect-match pair
--     with birth years more than 15 apart goes to review. The UNRWA path has
--     no first-name check, so that veto is what keeps two family members who
--     share one registration number apart.
--  5. validate_relationship checks that both people belong to the tree (as
--     raise_relationship_dispute does) and returns the existing row when the
--     same user validates the same relationship again.
--  6. get_person_story: a living person's contribution_consent covers the
--     achievements and contribution text only. Hamula, origin, occupation,
--     education and migration notes of a living person are returned to
--     privileged viewers only.
--
-- Not changed here: admins can still write optional fields through
-- can_edit_optional_person_fields (needs the D9 decision first).
-- ============================================================================

-- ── 1. Nightly matching off ─────────────────────────────────────────────────
UPDATE public.app_settings
   SET nightly_matching_enabled = false
 WHERE nightly_matching_enabled IS DISTINCT FROM false;

ALTER TABLE public.app_settings
  ALTER COLUMN nightly_matching_enabled SET DEFAULT false;

-- ── 2. create_person_with_primary_name: body of 20261107174000, unchanged ───
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

-- ── 3. The shared "Unknown" place is not evidence ───────────────────────────
CREATE OR REPLACE FUNCTION public.mf_place_pts(a uuid, b uuid, w int) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN a IS NOT NULL AND a = b
         AND a <> '00000000-0000-4000-8000-000000000001'::uuid THEN w
    ELSE 0
  END;
$$;

-- BIRT events created only to hold the default place carry nothing else.
DELETE FROM public.events e
 WHERE e.event_type::text = 'BIRT'
   AND e.place_id = '00000000-0000-4000-8000-000000000001'
   AND e.date_year IS NULL AND e.date_value IS NULL AND e.date_sort IS NULL
   AND e.place_name IS NULL AND e.description IS NULL
   AND e.cause IS NULL AND e.notes IS NULL;

UPDATE public.events
   SET place_id = NULL
 WHERE place_id = '00000000-0000-4000-8000-000000000001';

-- ── 4. score_pair_impl: body of 20261113120000, unchanged ───────────────────
CREATE OR REPLACE FUNCTION public.score_pair_impl(p_a uuid, p_b uuid)
 RETURNS TABLE(score integer, breakdown jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  a public.match_features%ROWTYPE;
  b public.match_features%ROWTYPE;
  a_spouses text[]; b_spouses text[];
  a_spouses_phon text[]; b_spouses_phon text[];
  a_sp_sur text[]; b_sp_sur text[];
  a_sp_sur_phon text[]; b_sp_sur_phon text[];
  p_given int; p_surname int; p_father int; p_mother int;
  p_pgf int; p_mgf int;
  p_spouse_first int; p_spouse_family int; p_spouse int;
  p_origin int; p_birth int; p_bplace int; p_death int; p_dplace int;
  p_children int;
  sp_given_lit int; sp_given_phon int; sp_sur_lit int; sp_sur_phon int;
  v_score int;
  v_vetoes text[] := ARRAY[]::text[];
  v_privacy text := NULL;
  patri_max int; patri_pts int; mat_max int; mat_pts int; sp_max int; anc_max int; anc_pts int;
  v_max int; v_score_pct numeric := 0; v_evidence_pct numeric := 0;
  v_full int := 100; v_either_living boolean; v_clusters int := 0; v_nonpatri boolean := false;
  patri_ok boolean; mat_ok boolean; sp_ok boolean; anc_ok boolean;
  v_thr_dec numeric; v_thr_liv numeric; v_thr numeric; v_decision text;
  both_spouses boolean; both_spouse_surnames boolean;
  v_id_match text := NULL; v_id_evidence boolean := false;
  v_unrwa_val text; v_card_val text;
  v_gate_score numeric;
BEGIN
  SELECT * INTO a FROM public.match_features WHERE person_id = p_a;
  SELECT * INTO b FROM public.match_features WHERE person_id = p_b;
  IF a.person_id IS NULL OR b.person_id IS NULL THEN
    RETURN QUERY SELECT 0, jsonb_build_object('meta',
      jsonb_build_object('version','aio-100-v1','score',0,'decision','review','error','missing_features'));
    RETURN;
  END IF;

  v_either_living := coalesce(a.is_living, false) OR coalesce(b.is_living, false);

  IF (a.gender='M' AND b.gender='F') OR (a.gender='F' AND b.gender='M') THEN
    v_vetoes := array_append(v_vetoes,'gender_mismatch');
  END IF;
  IF a.tree_id = b.tree_id THEN v_vetoes := array_append(v_vetoes,'same_tree'); END IF;
  IF a.birth_year IS NOT NULL AND b.birth_year IS NOT NULL AND abs(a.birth_year-b.birth_year) > 15 THEN
    v_vetoes := array_append(v_vetoes,'birth_year_gap');
  END IF;
  IF a.privacy_hold OR b.privacy_hold THEN v_vetoes := array_append(v_vetoes,'privacy_hold'); END IF;
  IF a.is_living OR b.is_living THEN v_privacy := 'living_suppressed'; END IF;

  -- D8/D9: perfect match needs shared id_value AND Platform Admin verification on both sides
  SELECT ia.id_value,
         (public.person_identifier_verified(p_a, 'unrwa_registration')
          AND public.person_identifier_verified(p_b, 'unrwa_registration'))
    INTO v_unrwa_val, v_id_evidence
    FROM public.person_identifiers ia
    JOIN public.person_identifiers ib
      ON ia.id_type = ib.id_type AND ia.id_value = ib.id_value
   WHERE ia.person_id = p_a AND ib.person_id = p_b
     AND ia.id_type = 'unrwa_registration'
   LIMIT 1;
  IF v_unrwa_val IS NOT NULL AND v_id_evidence THEN
    v_id_match := 'unrwa_registration';
  ELSIF v_unrwa_val IS NOT NULL AND NOT v_id_evidence THEN
    v_id_match := NULL;
    v_id_evidence := false;
  ELSE
    SELECT ia.id_value INTO v_card_val
      FROM public.person_identifiers ia
      JOIN public.person_identifiers ib
        ON ia.id_type = ib.id_type AND ia.id_value = ib.id_value
     WHERE ia.person_id = p_a AND ib.person_id = p_b
       AND ia.id_type = 'family_card_1948'
       AND public.mf_present(a.given_norm, b.given_norm)
       AND a.given_norm = b.given_norm
       AND NOT public.mf_is_placeholder_name(a.given_norm)
       AND public.person_identifier_verified(p_a, 'family_card_1948')
       AND public.person_identifier_verified(p_b, 'family_card_1948')
     LIMIT 1;
    IF v_card_val IS NOT NULL THEN
      v_id_match := 'family_card_1948';
      v_id_evidence := true;
    END IF;
  END IF;

  IF v_id_match IS NOT NULL THEN
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

  p_given   := public.mf_exact_pts(a.given_norm,   b.given_norm,   4)
             + public.mf_exact_pts(a.given_phon,   b.given_phon,   2);
  -- Same name entered in different scripts (Saleh / صالح, Abdullah / عبدالله):
  -- transliteration is lossy, so equal consonant skeletons earn the
  -- phonetic-level 2 points. Only across scripts: two Arabic spellings compare
  -- reliably, and the skeleton would merge حسن and حسين.
  IF p_given = 0 AND public.mf_present(a.given_norm, b.given_norm)
     AND char_length(public.mf_name_skeleton(a.given_norm)) >= 2
     AND public.mf_name_skeleton(a.given_norm) = public.mf_name_skeleton(b.given_norm)
     AND (SELECT pn.given_name ~ '[A-Za-z]' FROM public.person_names pn
           WHERE pn.person_id = p_a AND pn.is_primary LIMIT 1)
         IS DISTINCT FROM
         (SELECT pn.given_name ~ '[A-Za-z]' FROM public.person_names pn
           WHERE pn.person_id = p_b AND pn.is_primary LIMIT 1) THEN
    p_given := 2;
  END IF;
  p_surname := public.mf_exact_pts(a.surname_norm, b.surname_norm, 4)
             + public.mf_exact_pts(a.surname_phon, b.surname_phon, 2);
  p_father  := public.mf_exact_pts(a.father_norm,  b.father_norm,  6)
             + public.mf_exact_pts(a.father_phon,  b.father_phon,  2);
  p_mother  := public.mf_exact_pts(a.mother_norm,  b.mother_norm,  6)
             + public.mf_exact_pts(a.mother_phon,  b.mother_phon,  2);
  p_pgf     := public.mf_exact_pts(a.pgf_norm,     b.pgf_norm,     6)
             + public.mf_exact_pts(a.pgf_phon,     b.pgf_phon,     2);
  p_mgf     := public.mf_exact_pts(a.mgf_norm,     b.mgf_norm,     6)
             + public.mf_exact_pts(a.mgf_phon,     b.mgf_phon,     2);

  a_spouses := public.mf_filter_placeholder_arr(a.spouse_names_norm);
  b_spouses := public.mf_filter_placeholder_arr(b.spouse_names_norm);
  a_spouses_phon := public.mf_filter_placeholder_arr(a.spouse_names_phon);
  b_spouses_phon := public.mf_filter_placeholder_arr(b.spouse_names_phon);
  a_sp_sur := public.mf_filter_placeholder_arr(a.spouse_surnames_norm);
  b_sp_sur := public.mf_filter_placeholder_arr(b.spouse_surnames_norm);
  a_sp_sur_phon := public.mf_filter_placeholder_arr(a.spouse_surnames_phon);
  b_sp_sur_phon := public.mf_filter_placeholder_arr(b.spouse_surnames_phon);

  both_spouses := array_length(a_spouses,1) > 0 AND array_length(b_spouses,1) > 0;
  both_spouse_surnames := array_length(a_sp_sur,1) > 0 AND array_length(b_sp_sur,1) > 0;

  sp_given_lit  := CASE WHEN both_spouses AND a_spouses && b_spouses THEN 4 ELSE 0 END;
  sp_given_phon := CASE WHEN array_length(a_spouses_phon,1) > 0 AND array_length(b_spouses_phon,1) > 0
                         AND a_spouses_phon && b_spouses_phon THEN 2 ELSE 0 END;
  p_spouse_first := sp_given_lit + sp_given_phon;

  sp_sur_lit  := CASE WHEN both_spouse_surnames AND a_sp_sur && b_sp_sur THEN 8 ELSE 0 END;
  sp_sur_phon := CASE WHEN array_length(a_sp_sur_phon,1) > 0 AND array_length(b_sp_sur_phon,1) > 0
                       AND a_sp_sur_phon && b_sp_sur_phon THEN 2 ELSE 0 END;
  p_spouse_family := sp_sur_lit + sp_sur_phon;
  p_spouse := p_spouse_first + p_spouse_family;

  p_origin := public.mf_place_pts(a.origin_place_id, b.origin_place_id, 4);
  p_birth  := public.mf_year_pts(a.birth_year, b.birth_year, 7);
  p_bplace := public.mf_place_pts(a.birth_place_id, b.birth_place_id, 7);
  p_death  := public.mf_year_pts(a.death_year, b.death_year, 7);
  p_dplace := public.mf_place_pts(a.death_place_id, b.death_place_id, 7);

  IF v_either_living THEN
    p_death := 0;
    p_dplace := 0;
    v_full := 86;
  END IF;

  IF a.num_children IS NULL OR b.num_children IS NULL THEN
    p_children := 0;
  ELSIF a.num_children = 0 AND b.num_children = 0 THEN
    p_children := 0;
  ELSIF a.num_children = b.num_children THEN
    p_children := 8;
  ELSE
    p_children := 0;
  END IF;

  v_score := p_given + p_surname + p_father + p_mother + p_pgf + p_mgf
           + p_spouse + p_origin + p_birth + p_bplace + p_death + p_dplace + p_children;

  -- First names present on both sides that match neither exactly nor
  -- phonetically. Brothers share parents, surname and places, so without this
  -- they scored like duplicates. Veto auto-link and take 20 points off.
  IF public.mf_present(a.given_norm, b.given_norm) AND p_given = 0 THEN
    v_vetoes := array_append(v_vetoes, 'given_disagree');
    v_score := GREATEST(v_score - 20, 0);
  END IF;

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
             + (CASE WHEN NOT v_either_living AND a.death_year IS NOT NULL AND b.death_year IS NOT NULL THEN 7 ELSE 0 END)
             + (CASE WHEN NOT v_either_living AND a.death_place_id IS NOT NULL AND b.death_place_id IS NOT NULL THEN 7 ELSE 0 END);
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

  SELECT link_threshold_deceased, link_threshold_living
    INTO v_thr_dec, v_thr_liv FROM public.app_settings LIMIT 1;
  v_thr_dec := COALESCE(v_thr_dec, 90);
  v_thr_liv := COALESCE(v_thr_liv, 76);
  v_thr := CASE WHEN v_either_living THEN v_thr_liv ELSE v_thr_dec END;

  -- Thresholds are raw points on the 100-point scale (AIO2 §3.6 / D4: 90
  -- deceased, 76 living). Living pairs cannot score the death fields, so their
  -- full scale is 86, but the gate stays at 76 raw points; it is not rescaled.
  v_gate_score := v_thr;

  IF coalesce(array_length(v_vetoes,1),0) = 0
     AND v_score >= v_gate_score
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
      'threshold',v_thr,'gate_score',v_gate_score,'clusters_agreed',v_clusters,'decision',v_decision,
      'vetoes',to_jsonb(v_vetoes),'privacy',v_privacy,
      'living_rescaled', v_either_living),
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
END;
$function$;

-- ── 5. validate_relationship: tree membership check, no duplicate rows ──────
CREATE OR REPLACE FUNCTION public.validate_relationship(
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
  v_type text := COALESCE(NULLIF(trim(p_relation_type), ''), 'unknown');
  v_row public.relationship_disputes;
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
  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_a AND tree_id = p_tree_id) THEN
    RAISE EXCEPTION 'person_a does not belong to tree';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_b AND tree_id = p_tree_id) THEN
    RAISE EXCEPTION 'person_b does not belong to tree';
  END IF;

  SELECT * INTO v_row
    FROM public.relationship_disputes d
   WHERE d.tree_id = p_tree_id
     AND d.person_a = p_person_a
     AND d.person_b = p_person_b
     AND d.relation_type = v_type
     AND d.status = 'validated'
     AND d.raised_by = v_uid
   LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.relationship_disputes(
    tree_id, person_a, person_b, relation_type, status, raised_by, note
  ) VALUES (
    p_tree_id, p_person_a, p_person_b, v_type,
    'validated', v_uid, NULLIF(trim(COALESCE(p_note, '')), '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ── 6. get_person_story: consent covers the story text only ─────────────────
CREATE OR REPLACE FUNCTION public.get_person_story(p_person_id uuid)
RETURNS TABLE (
  achievements_ar text,
  achievements_en text,
  contribution_ar text,
  contribution_en text,
  contribution_consent boolean,
  hamula_affiliation text,
  origin_relationship text,
  origin_text text,
  occupation text,
  education text,
  migration_notes text
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
  v_living boolean;
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

  IF NOT v_privileged AND NOT EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = p_person_id AND public.can_access_tree(p.tree_id)
  ) THEN
    RETURN;
  END IF;

  v_living := public.is_person_living(p_person_id);

  IF NOT (
    v_privileged
    OR COALESCE(v_row.contribution_consent, false)
    OR NOT v_living
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

  -- A living person's consent was given for the story text above. The fields
  -- below go to privileged viewers, or to everyone once the person is deceased.
  IF v_privileged OR NOT v_living THEN
    hamula_affiliation := v_row.hamula_affiliation;
    origin_relationship := v_row.origin_relationship;
    origin_text := v_row.origin_text;
    occupation := v_row.occupation;
    education := v_row.education;
    migration_notes := v_row.migration_notes;
  END IF;
  RETURN NEXT;
END;
$$;
