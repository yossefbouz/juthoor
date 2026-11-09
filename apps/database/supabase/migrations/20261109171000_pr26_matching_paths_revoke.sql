-- ============================================================================
-- Matching / paths / EXECUTE grants from PR #26 re-review
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mf_is_placeholder_name(t text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN t IS NULL OR btrim(t) = '' THEN true
    WHEN lower(btrim(t)) IN (
      'unknown', 'unk', 'n/a', 'na', 'none',
      'غير معروف', 'غيرمعروف', 'مجهول'
    ) THEN true
    WHEN btrim(t) IN ('جير معروف', 'جر معروف') THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.mf_given_norm(p_person_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN public.mf_is_placeholder_name(pn.given_name) THEN NULL
    ELSE public.normalize_arabic(public.transliterate_to_arabic(pn.given_name))
  END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mf_given_phon(p_person_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN public.mf_is_placeholder_name(pn.given_name) THEN NULL
    ELSE public.arabic_phonetic(public.transliterate_to_arabic(pn.given_name))
  END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mf_surname_norm(p_person_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN public.mf_is_placeholder_name(pn.surname) THEN NULL
    ELSE public.normalize_arabic(public.transliterate_to_arabic(pn.surname))
  END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mf_surname_phon(p_person_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN public.mf_is_placeholder_name(pn.surname) THEN NULL
    ELSE public.arabic_phonetic(public.transliterate_to_arabic(pn.surname))
  END
  FROM public.person_names pn WHERE pn.person_id = p_person_id AND pn.is_primary LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mf_filter_placeholder_arr(arr text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT x FROM unnest(COALESCE(arr, ARRAY[]::text[])) AS x
      WHERE x IS NOT NULL AND btrim(x) <> '' AND NOT public.mf_is_placeholder_name(x)
    ),
    ARRAY[]::text[]
  );
$$;

-- score_pair: both-side UNRWA evidence; living gate uses full_scale; filter spouse placeholders
CREATE OR REPLACE FUNCTION public.score_pair(p_a uuid, p_b uuid)
RETURNS TABLE(score int, breakdown jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- D8: both sides must carry evidence for UNRWA perfect match
  SELECT ia.id_value,
         (ia.evidence_attachment_id IS NOT NULL AND ib.evidence_attachment_id IS NOT NULL)
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
  ELSIF a.num_children = b.num_children THEN
    p_children := 8;
  ELSE
    p_children := 0;
  END IF;

  v_score := p_given + p_surname + p_father + p_mother + p_pgf + p_mgf
           + p_spouse + p_origin + p_birth + p_bplace + p_death + p_dplace + p_children;

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

  -- Gate in the same units as full_scale (living 86 → thr 76 means ~65.4 raw points)
  v_gate_score := (v_thr / 100.0) * v_full;

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
$$;

COMMENT ON FUNCTION public.score_pair(uuid, uuid) IS
  'AIO-100 scorer: living gate uses full_scale, placeholders filtered, UNRWA needs evidence on both sides.';

-- Dirty features so placeholder / transliterate order fixes apply
INSERT INTO public.match_features_dirty (person_id)
SELECT id FROM public.persons
ON CONFLICT (person_id) DO NOTHING;

-- ── compute_all_paths: iterative BFS with early stop ─────────────────────────
CREATE OR REPLACE FUNCTION public.compute_all_paths(
  p_source   uuid,
  p_target   uuid,
  p_max_paths int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src_tree uuid;
  v_tgt_tree uuid;
  v_max int;
  v_paths jsonb := '[]'::jsonb;
  v_found int := 0;
  r record;
BEGIN
  IF p_source IS NULL OR p_target IS NULL OR p_source = p_target THEN
    RETURN jsonb_build_object('paths', jsonb_build_array(), 'note', 'same_person');
  END IF;

  SELECT tree_id INTO v_src_tree FROM public.persons WHERE id = p_source;
  SELECT tree_id INTO v_tgt_tree FROM public.persons WHERE id = p_target;
  IF v_src_tree IS NULL OR NOT public.can_access_tree(v_src_tree) THEN
    RETURN NULL;
  END IF;
  IF v_tgt_tree IS NULL OR NOT public.can_access_tree(v_tgt_tree) THEN
    RETURN jsonb_build_object('paths', jsonb_build_array(), 'note', 'target_inaccessible');
  END IF;

  v_max := GREATEST(1, LEAST(COALESCE(p_max_paths, 5), 5));

  FOR r IN
    WITH RECURSIVE edges AS (
      SELECT fam.partner1_id AS a, fc.child_id AS b, 'parent'::text AS rel
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner1_id IS NOT NULL
      UNION ALL
      SELECT fam.partner2_id, fc.child_id, 'parent'
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner2_id IS NOT NULL
      UNION ALL
      SELECT fc.child_id, fam.partner1_id, 'child'
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner1_id IS NOT NULL
      UNION ALL
      SELECT fc.child_id, fam.partner2_id, 'child'
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner2_id IS NOT NULL
      UNION ALL
      SELECT partner1_id, partner2_id, 'spouse' FROM public.families
        WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL
      UNION ALL
      SELECT partner2_id, partner1_id, 'spouse' FROM public.families
        WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL
      UNION ALL
      SELECT fc1.child_id, fc2.child_id, 'sibling'
        FROM public.family_children fc1
        JOIN public.family_children fc2 ON fc1.family_id = fc2.family_id
        WHERE fc1.child_id <> fc2.child_id
      UNION ALL
      SELECT person_a_id, person_b_id, 'same_as' FROM public.person_links WHERE status = 'confirmed'
      UNION ALL
      SELECT person_b_id, person_a_id, 'same_as' FROM public.person_links WHERE status = 'confirmed'
    ),
    bfs AS (
      SELECT
        p_source AS node,
        0 AS depth,
        ARRAY[p_source] AS path,
        ARRAY[]::text[] AS rels
      UNION ALL
      SELECT
        e.b,
        bfs.depth + CASE WHEN e.rel = 'same_as' THEN 0 ELSE 1 END,
        bfs.path || e.b,
        bfs.rels || e.rel
      FROM bfs
      JOIN edges e ON e.a = bfs.node
      WHERE bfs.depth < 5
        AND NOT (e.b = ANY(bfs.path))
        AND cardinality(bfs.path) < 10
    )
    SELECT
      h.depth AS degrees,
      (SELECT jsonb_agg(
          jsonb_build_object(
            'person_id', pid,
            'relation', CASE WHEN idx = 1 THEN 'self' ELSE h.rels[idx - 1] END
          ) ORDER BY idx)
        FROM unnest(h.path) WITH ORDINALITY AS t(pid, idx)
      ) AS struct_path
    FROM (
      SELECT * FROM bfs WHERE node = p_target
      ORDER BY depth ASC, cardinality(path) ASC
      LIMIT v_max
    ) h
  LOOP
    v_found := v_found + 1;
    v_paths := v_paths || jsonb_build_array(
      jsonb_build_object(
        'degrees', r.degrees,
        'path', public.mask_degrees_path(p_source, r.struct_path)
      )
    );
    EXIT WHEN v_found >= v_max;
  END LOOP;

  RETURN jsonb_build_object(
    'paths', v_paths,
    'max_paths', v_max,
    'note', 'all_paths_within_graph'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compute_all_paths(uuid, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_all_paths(uuid, uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_all_paths(uuid, uuid, int) TO authenticated;

-- Matcher EXECUTE: no anon; batch not for authenticated end users
REVOKE ALL ON FUNCTION public.score_pair(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.score_pair(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.score_pair(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.score_pair(uuid, uuid) TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'run_matching_batch'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.auto_link_match(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_link_match(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.auto_link_match(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_link_match(uuid) TO service_role;
