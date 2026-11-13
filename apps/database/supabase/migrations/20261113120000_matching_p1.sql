-- ============================================================================
-- Matching engine P1 fixes (2026-11-13)
-- ============================================================================
--  1. normalize_arabic deletes short vowels, shadda, sukun, superscript alef and
--     tatweel instead of turning them into shadda / a space, so مُحَمَّد = محمد.
--     person_names' generated columns are recomputed.
--  2. Surnames compare without the Arabic article: "Ajrami" = "العجرمي" = "آل العجرمي".
--     First names ignore spaces ("عبد الله" = "عبدالله"), and the same name spelled
--     differently across scripts (Saleh / صالح) earns phonetic-level points via a
--     consonant skeleton.
--  3. The app's placeholder partners ("أنثى N" / "Female N", notes = 'placeholder')
--     and feminine "unknown" forms are not names, and placeholder people are never
--     paired; their pending matches are removed.
--  4. score_pair_impl: a first-name disagreement vetoes auto-link and costs 20
--     points; the living gate is 76 raw points (spec), not 76% of 86.
--  5. Hints: decisions only on pending hints and open matches; a conversation
--     opens only after both owners accept; a decline closes the match's relay.
--  6. The archive-vault auth user gets '' instead of NULL token columns (GoTrue
--     could not list users while they were NULL).
-- After applying: run a full matching batch to rebuild features and re-score.
-- ============================================================================

-- ── 1. normalize_arabic ─────────────────────────────────────────────────────
-- translate() deletes characters that have no counterpart in the target list.
CREATE OR REPLACE FUNCTION public.normalize_arabic(txt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT regexp_replace(
    translate(
      coalesce(lower(txt), ''),
      'أإآٱىةؤئًٌٍَُِّْـٰ',
      'اااايهوي'
    ),
    '\s+', ' ', 'g'
  );
$function$;

-- Recompute person_names' stored generated columns (given_name_norm,
-- surname_norm, given_phonetic, surname_phonetic) with the new normalisation.
UPDATE public.person_names SET given_name = given_name;

-- ── 2. Surnames without the Arabic article ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.mf_strip_article(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN t IS NULL THEN NULL
    WHEN char_length(regexp_replace(btrim(t), '^(ال\s*)+', '')) >= 2
      THEN regexp_replace(btrim(t), '^(ال\s*)+', '')
    ELSE btrim(t)
  END;
$function$;

-- First names: spaces are not significant ("عبد الله" = "عبدالله").
CREATE OR REPLACE FUNCTION public.mf_given_norm(p_person_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN public.mf_is_placeholder_name(pn.given_name) THEN NULL
    ELSE replace(public.normalize_arabic(public.transliterate_to_arabic(pn.given_name)), ' ', '')
  END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.mf_given_phon(p_person_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN public.mf_is_placeholder_name(pn.given_name) THEN NULL
    ELSE replace(public.arabic_phonetic(public.transliterate_to_arabic(pn.given_name)), ' ', '')
  END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$function$;

-- Consonant skeleton of a normalised name: phonetic folding, no spaces, no
-- vowels / weak letters / ع / hamza seats, repeated letters collapsed. Used only
-- to recognise the same first name spelled differently across scripts.
CREATE OR REPLACE FUNCTION public.mf_name_skeleton(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  SELECT nullif(
    regexp_replace(
      regexp_replace(public.arabic_phonetic(replace(coalesce(t, ''), ' ', '')), '[اويىعءئؤ]', '', 'g'),
      '(.)\1+', '\1', 'g'),
    '');
$function$;

CREATE OR REPLACE FUNCTION public.mf_surname_norm(p_person_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN public.mf_is_placeholder_name(pn.surname) THEN NULL
    ELSE public.mf_strip_article(public.normalize_arabic(public.transliterate_to_arabic(pn.surname)))
  END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.mf_surname_phon(p_person_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN public.mf_is_placeholder_name(pn.surname) THEN NULL
    ELSE public.arabic_phonetic(public.mf_strip_article(public.normalize_arabic(public.transliterate_to_arabic(pn.surname))))
  END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$function$;

-- ── 3. Placeholder names and people ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mf_is_placeholder_name(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN t IS NULL OR btrim(t) = '' THEN true
    WHEN lower(btrim(t)) IN (
      'unknown', 'unk', 'n/a', 'na', 'none',
      'غير معروف', 'غيرمعروف', 'مجهول',
      'غير معروفة', 'غير معروفه', 'مجهولة', 'مجهوله'
    ) THEN true
    WHEN btrim(t) IN ('جير معروف', 'جر معروف') THEN true
    -- The app's auto-created placeholder partners: "أنثى N" / "Female N".
    WHEN lower(btrim(t)) ~ '^(أنثى|انثى|انثي|ذكر|female|male)( *[0-9]+)?$' THEN true
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_match_candidates(p_max_block_size integer DEFAULT 1000)
 RETURNS TABLE(person_a_id uuid, person_b_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$  -- writes match_block_skips
BEGIN
  -- audit + skip skewed blocks (recorded so recall loss is visible)
  DELETE FROM public.match_block_skips;
  INSERT INTO public.match_block_skips(pass, block_key, member_count)
    SELECT pass, block_key, count(*) FROM public.match_block_keys
    GROUP BY pass, block_key HAVING count(*) > p_max_block_size;

  RETURN QUERY
  SELECT DISTINCT k1.person_id, k2.person_id
  FROM public.match_block_keys k1
  JOIN public.match_block_keys k2
    ON k1.pass = k2.pass AND k1.block_key = k2.block_key AND k1.person_id < k2.person_id
  WHERE k1.tree_id <> k2.tree_id
    AND NOT EXISTS (SELECT 1 FROM public.persons px
                    WHERE px.id IN (k1.person_id, k2.person_id) AND px.notes = 'placeholder')
    AND NOT EXISTS (SELECT 1 FROM public.match_block_skips s WHERE s.pass = k1.pass AND s.block_key = k1.block_key)
    AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.person_a_id = k1.person_id AND m.person_b_id = k2.person_id);
END $function$;

DELETE FROM public.matches m
 WHERE m.status = 'pending'
   AND EXISTS (SELECT 1 FROM public.persons p
               WHERE p.id IN (m.person_a_id, m.person_b_id) AND p.notes = 'placeholder');

-- ── 4. score_pair_impl ──────────────────────────────────────────────────────
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

-- ── 5. Hints ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_match_hint(p_hint_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  h public.match_hints%ROWTYPE;
  m public.matches%ROWTYPE;
  v_other_accepted boolean;
  v_one boolean; v_both boolean;
  v_owner_a uuid; v_owner_b uuid;
  v_link uuid;
BEGIN
  SELECT * INTO h FROM public.match_hints WHERE id = p_hint_id;
  IF h.id IS NULL THEN RAISE EXCEPTION 'hint_not_found' USING ERRCODE = 'P0002'; END IF;
  IF h.owner_user_id <> auth.uid() THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  -- Only an open hint on an open match can be decided. Without this, two owners
  -- could re-confirm a link an admin rejected or an owner revoked.
  IF h.status <> 'pending' THEN RAISE EXCEPTION 'hint_not_pending' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM public.matches WHERE id = h.match_id;
  IF p_accept AND m.status NOT IN ('pending', 'deferred') THEN
    RAISE EXCEPTION 'match_not_open' USING ERRCODE = '22023';
  END IF;

  UPDATE public.match_hints
    SET status = CASE WHEN p_accept THEN 'accepted'::public.hint_status ELSE 'rejected'::public.hint_status END,
        updated_at = now()
    WHERE id = p_hint_id;

  IF NOT p_accept THEN
    -- A decline is not announced to the counterpart (§5.3), but any contact
    -- relay opened for this match with this owner is closed.
    UPDATE public.contact_relay
       SET status = 'declined',
           revoked_at = COALESCE(revoked_at, now()),
           responded_at = COALESCE(responded_at, now())
     WHERE match_id = h.match_id
       AND (from_user_id = h.owner_user_id OR to_user_id = h.owner_user_id)
       AND revoked_at IS NULL;
    RETURN;
  END IF;
  -- has the OTHER owner accepted too?
  SELECT EXISTS (
    SELECT 1 FROM public.match_hints
    WHERE match_id = h.match_id AND owner_user_id <> h.owner_user_id AND status = 'accepted'
  ) INTO v_other_accepted;

  IF v_other_accepted THEN
    -- dual-owner consent → confirm the link (valid even for a living person: it is
    -- human dual consent, not an auto-link).
    INSERT INTO public.person_links(person_a_id, person_b_id, status, link_type,
        source_match_id, confidence_score, source, reviewed_by, reviewed_at)
      VALUES (m.person_a_id, m.person_b_id, 'confirmed', 'same_as', m.id, m.confidence_score,
              'owner_pair', auth.uid(), now())
      ON CONFLICT (person_a_id, person_b_id) DO UPDATE
        SET status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now()
      RETURNING id INTO v_link;
    UPDATE public.matches SET status = 'admin_approved', reviewed_at = now() WHERE id = m.id;
    INSERT INTO public.merge_log(action, person_link_id, match_id, actor_user_id, actor_role, after_state)
      VALUES ('confirm', v_link, m.id, auth.uid(), 'owner', jsonb_build_object('status','confirmed','via','dual_owner'));
    PERFORM public.enqueue_overlay_refresh('dual_owner_confirm', v_link);

    SELECT one_living, both_living INTO v_one, v_both FROM public.match_living_flags(m.id);
    v_owner_a := public.match_person_owner(m.person_a_id);
    v_owner_b := public.match_person_owner(m.person_b_id);
    PERFORM public.create_match_notification(v_owner_a, 'connection_confirmed', m.id, v_link, v_one);
    PERFORM public.create_match_notification(v_owner_b, 'connection_confirmed', m.id, v_link, v_one);
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.open_thread_from_match_hint_accept(p_hint_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Both owners must agree before a conversation opens. Until the other owner
  -- accepts their hint, return no thread (the second acceptance opens it).
  IF EXISTS (
    SELECT 1 FROM public.match_hints oh
    WHERE oh.match_id = v_hint.match_id
      AND oh.owner_user_id <> v_hint.owner_user_id
      AND oh.status <> 'accepted'
  ) THEN
    RETURN NULL;
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
$function$;

-- ── 6. Archive-vault auth user: '' instead of NULL token columns ────────────
UPDATE auth.users
   SET confirmation_token     = COALESCE(confirmation_token, ''),
       recovery_token         = COALESCE(recovery_token, ''),
       email_change_token_new = COALESCE(email_change_token_new, ''),
       email_change           = COALESCE(email_change, '')
 WHERE id = 'a0000000-0000-4000-8000-0000000000a1';

-- ── Re-queue everyone so the next batch rebuilds features with the new rules ─
INSERT INTO public.match_features_dirty (person_id)
SELECT p.id FROM public.persons p
ON CONFLICT (person_id) DO NOTHING;
