-- D8: UNRWA registration card number and 1948 host-country family-card number are
-- perfect-match identifiers (All-in-One 3.6 and 5.7).
--
--   * person_identifiers stores the numbers (visible only to people who can write the tree).
--   * UNRWA: counts only when BOTH people have a copy of the card on file (attachment tag
--     'unrwa_card'). A copy of the UNRWA card must be provided.
--   * Family card: a card covers a whole household, so brothers and sisters share one number.
--     It counts only when the given names also agree (spelling or phonetic).
--   * A perfect match auto-links, whatever the score, unless a hard veto applies
--     (different gender, same tree, privacy hold). The other disagreement vetoes and the
--     two-evidence-group rule do not apply to it.
--   * A shared number also makes the two people candidates (block-key pass 7).

-- ── 1. the card-copy tag ─────────────────────────────────────────────────────
ALTER TYPE public.attachment_tag ADD VALUE IF NOT EXISTS 'unrwa_card';

-- ── 2. the identifiers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.person_identifiers (
  id          uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id   uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('unrwa_card', 'family_card_1948')),
  value       text NOT NULL CHECK (length(btrim(value)) BETWEEN 3 AND 40),
  -- comparison key: letters and digits only, upper case ("12-345/6" = "123456")
  value_norm  text GENERATED ALWAYS AS (upper(regexp_replace(value, '[^0-9A-Za-z]', '', 'g'))) STORED,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_person_identifiers_lookup ON public.person_identifiers (kind, value_norm);

ALTER TABLE public.person_identifiers ENABLE ROW LEVEL SECURITY;
-- Sensitive: only people who can write the person's tree (and admins) read or change them.
DROP POLICY IF EXISTS person_identifiers_writers ON public.person_identifiers;
CREATE POLICY person_identifiers_writers ON public.person_identifiers
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.can_write_tree((SELECT p.tree_id FROM public.persons p WHERE p.id = person_id)))
  WITH CHECK (public.is_admin() OR public.can_write_tree((SELECT p.tree_id FROM public.persons p WHERE p.id = person_id)));
COMMENT ON TABLE public.person_identifiers IS
  'UNRWA card number and 1948 family-card number of a person (perfect-match identifiers, decision D8). Tree writers and admins only.';

-- ── 3. the perfect-match test ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.person_has_unrwa_card_copy(p_person uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.person_attachments a
                 WHERE a.person_id = p_person AND a.tag::text = 'unrwa_card');
$$;
REVOKE ALL ON FUNCTION public.person_has_unrwa_card_copy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.person_has_unrwa_card_copy(uuid) TO authenticated;

-- 'unrwa_card' | 'family_card_1948' | NULL
CREATE OR REPLACE FUNCTION public.identifier_perfect_match(p_a uuid, p_b uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.person_identifiers x
      JOIN public.person_identifiers y ON y.kind = x.kind AND y.value_norm = x.value_norm
      WHERE x.person_id = p_a AND y.person_id = p_b AND x.kind = 'unrwa_card' AND x.value_norm <> ''
        AND public.person_has_unrwa_card_copy(p_a) AND public.person_has_unrwa_card_copy(p_b)
    ) THEN 'unrwa_card'
    WHEN EXISTS (
      SELECT 1 FROM public.person_identifiers x
      JOIN public.person_identifiers y ON y.kind = x.kind AND y.value_norm = x.value_norm
      JOIN public.match_features fa ON fa.person_id = x.person_id
      JOIN public.match_features fb ON fb.person_id = y.person_id
      WHERE x.person_id = p_a AND y.person_id = p_b AND x.kind = 'family_card_1948' AND x.value_norm <> ''
        AND ((fa.given_norm <> '' AND fa.given_norm = fb.given_norm)
          OR (fa.given_phon <> '' AND fa.given_phon = fb.given_phon))
    ) THEN 'family_card_1948'
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.identifier_perfect_match(uuid, uuid) FROM PUBLIC;
COMMENT ON FUNCTION public.identifier_perfect_match IS
  'Perfect-match identifiers (D8): same UNRWA card number with a card copy on both people, or the same 1948 family-card number with the same given name.';

-- ── 4. block-key pass 7 ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_match_block_keys(p_full boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_full THEN TRUNCATE public.match_block_keys; END IF;

  -- pass 1: phonetic given + surname (cross-script — features are script-folded)
  INSERT INTO public.match_block_keys(person_id, pass, block_key, tree_id)
    SELECT person_id, 1, given_phon || '|' || surname_phon, tree_id FROM public.match_features
    WHERE given_phon <> '' AND surname_phon <> '' AND NOT privacy_hold
    ON CONFLICT DO NOTHING;
  -- pass 2: phonetic surname + birth-decade
  INSERT INTO public.match_block_keys(person_id, pass, block_key, tree_id)
    SELECT person_id, 2, surname_phon || '|' || (birth_year/10)::text, tree_id FROM public.match_features
    WHERE surname_phon <> '' AND birth_year IS NOT NULL AND NOT privacy_hold
    ON CONFLICT DO NOTHING;
  -- pass 3: phonetic given + origin place
  INSERT INTO public.match_block_keys(person_id, pass, block_key, tree_id)
    SELECT person_id, 3, given_phon || '|' || origin_place_id::text, tree_id FROM public.match_features
    WHERE given_phon <> '' AND origin_place_id IS NOT NULL AND NOT privacy_hold
    ON CONFLICT DO NOTHING;
  -- pass 4: phonetic father + origin place
  INSERT INTO public.match_block_keys(person_id, pass, block_key, tree_id)
    SELECT person_id, 4, father_phon || '|' || origin_place_id::text, tree_id FROM public.match_features
    WHERE father_phon <> '' AND origin_place_id IS NOT NULL AND NOT privacy_hold
    ON CONFLICT DO NOTHING;
  -- pass 5: origin place + birth-decade (non-name anchor — mangled given still caught)
  INSERT INTO public.match_block_keys(person_id, pass, block_key, tree_id)
    SELECT person_id, 5, origin_place_id::text || '|' || (birth_year/10)::text, tree_id FROM public.match_features
    WHERE origin_place_id IS NOT NULL AND birth_year IS NOT NULL AND NOT privacy_hold
    ON CONFLICT DO NOTHING;
  -- pass 6: phonetic father + paternal grandfather (patriline anchor)
  INSERT INTO public.match_block_keys(person_id, pass, block_key, tree_id)
    SELECT person_id, 6, father_phon || '|' || pgf_phon, tree_id FROM public.match_features
    WHERE father_phon <> '' AND pgf_phon <> '' AND NOT privacy_hold
    ON CONFLICT DO NOTHING;
  -- pass 7: a shared UNRWA or 1948 family-card number (D8). Two people with the same card
  -- number are candidates even when their names are spelled completely differently.
  INSERT INTO public.match_block_keys(person_id, pass, block_key, tree_id)
    SELECT pi.person_id, 7, pi.kind || '|' || pi.value_norm, mf.tree_id
    FROM public.person_identifiers pi
    JOIN public.match_features mf ON mf.person_id = pi.person_id
    WHERE pi.value_norm <> '' AND NOT mf.privacy_hold
    ON CONFLICT DO NOTHING;
END $$;


-- ── 5. score_pair: a perfect match auto-links ────────────────────────────────
CREATE OR REPLACE FUNCTION public.score_pair(p_a uuid, p_b uuid)
RETURNS TABLE(score int, breakdown jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  a public.match_features%ROWTYPE;
  b public.match_features%ROWTYPE;
  p_given int; p_surname int; p_father int; p_mother int;
  p_pgf int; p_pgm int; p_mgf int; p_mgm int;
  p_spouse int; p_origin int; p_birth int; p_bplace int; p_death int; p_dplace int; p_email int;
  p_children int;
  sp_lit int; sp_phon int;
  v_score int;
  v_vetoes text[] := ARRAY[]::text[];
  v_privacy text := NULL;
  v_children_delta int;
  -- clusters
  patri_max int; patri_pts int; mat_max int; mat_pts int; sp_max int; anc_max int; anc_pts int;
  v_max int; v_score_pct numeric := 0; v_evidence_pct numeric := 0; v_full int; v_either_living boolean; v_clusters int := 0; v_nonpatri boolean := false;
  patri_ok boolean; mat_ok boolean; sp_ok boolean; anc_ok boolean;
  v_thr_dec numeric; v_thr_liv numeric; v_thr numeric; v_decision text;
  v_perfect text; v_hard boolean;
  both_spouses boolean;
BEGIN
  SELECT * INTO a FROM public.match_features WHERE person_id = p_a;
  SELECT * INTO b FROM public.match_features WHERE person_id = p_b;
  IF a.person_id IS NULL OR b.person_id IS NULL THEN
    RETURN QUERY SELECT 0, jsonb_build_object('meta',
      jsonb_build_object('version','frs-v2','score',0,'decision','review','error','missing_features'));
    RETURN;
  END IF;

  p_given   := public.mf_collapse_pts(a.given_norm,   b.given_norm,   a.given_phon,   b.given_phon,   10);
  p_surname := public.mf_collapse_pts(a.surname_norm, b.surname_norm, a.surname_phon, b.surname_phon, 10);
  p_father  := public.mf_collapse_pts(a.father_norm,  b.father_norm,  a.father_phon,  b.father_phon,  10);
  p_mother  := public.mf_collapse_pts(a.mother_norm,  b.mother_norm,  a.mother_phon,  b.mother_phon,  20);
  p_pgf     := public.mf_collapse_pts(a.pgf_norm, b.pgf_norm, a.pgf_phon, b.pgf_phon, 25);
  p_pgm     := public.mf_collapse_pts(a.pgm_norm, b.pgm_norm, a.pgm_phon, b.pgm_phon, 25);
  p_mgf     := public.mf_collapse_pts(a.mgf_norm, b.mgf_norm, a.mgf_phon, b.mgf_phon, 25);
  p_mgm     := public.mf_collapse_pts(a.mgm_norm, b.mgm_norm, a.mgm_phon, b.mgm_phon, 25);

  both_spouses := a.spouse_names_norm IS NOT NULL AND array_length(a.spouse_names_norm,1) > 0
              AND b.spouse_names_norm IS NOT NULL AND array_length(b.spouse_names_norm,1) > 0;
  sp_lit  := CASE WHEN a.spouse_names_norm && b.spouse_names_norm THEN 25 ELSE 0 END;
  sp_phon := CASE WHEN a.spouse_names_phon && b.spouse_names_phon THEN 25 ELSE 0 END;
  p_spouse := GREATEST(sp_lit, sp_phon) + CASE WHEN sp_lit = 25 THEN 2 ELSE 0 END;

  p_origin := public.mf_place_pts(a.origin_place_id, b.origin_place_id, 10);
  p_birth  := public.mf_year_pts(a.birth_year, b.birth_year, 25);
  p_bplace := public.mf_place_pts(a.birth_place_id, b.birth_place_id, 25);
  p_death  := public.mf_year_pts(a.death_year, b.death_year, 25);
  p_dplace := public.mf_place_pts(a.death_place_id, b.death_place_id, 25);
  p_email  := CASE WHEN a.email IS NOT NULL AND lower(a.email) = lower(b.email) THEN 25 ELSE 0 END;

  IF a.num_children IS NULL OR b.num_children IS NULL THEN
    p_children := 0;
  ELSE
    v_children_delta := abs(a.num_children - b.num_children);
    p_children := CASE WHEN v_children_delta=0 THEN 15 WHEN v_children_delta=1 THEN 9
                       WHEN v_children_delta=2 THEN 5 ELSE 0 END;
  END IF;

  v_score := p_given+p_surname+p_father+p_mother+p_pgf+p_pgm+p_mgf+p_mgm+p_spouse
           + p_origin+p_birth+p_bplace+p_death+p_dplace+p_email+p_children;

  -- ── evidence clusters (num_children excluded from evidence_pct) ──────────────
  patri_max := (CASE WHEN public.mf_present(a.given_norm,b.given_norm)   THEN 10 ELSE 0 END)
             + (CASE WHEN public.mf_present(a.father_norm,b.father_norm) THEN 10 ELSE 0 END)
             + (CASE WHEN public.mf_present(a.pgf_norm,b.pgf_norm)       THEN 25 ELSE 0 END)
             + (CASE WHEN public.mf_present(a.pgm_norm,b.pgm_norm)       THEN 25 ELSE 0 END);
  patri_pts := p_given + p_father + p_pgf + p_pgm;
  mat_max   := (CASE WHEN public.mf_present(a.mother_norm,b.mother_norm) THEN 20 ELSE 0 END)
             + (CASE WHEN public.mf_present(a.mgf_norm,b.mgf_norm)       THEN 25 ELSE 0 END)
             + (CASE WHEN public.mf_present(a.mgm_norm,b.mgm_norm)       THEN 25 ELSE 0 END);
  mat_pts   := p_mother + p_mgf + p_mgm;
  sp_max    := CASE WHEN both_spouses THEN 25 ELSE 0 END;
  anc_max   := (CASE WHEN a.origin_place_id IS NOT NULL AND b.origin_place_id IS NOT NULL THEN 10 ELSE 0 END)
             + (CASE WHEN a.birth_year IS NOT NULL AND b.birth_year IS NOT NULL THEN 25 ELSE 0 END)
             + (CASE WHEN a.birth_place_id IS NOT NULL AND b.birth_place_id IS NOT NULL THEN 25 ELSE 0 END)
             + (CASE WHEN a.death_year IS NOT NULL AND b.death_year IS NOT NULL THEN 25 ELSE 0 END)
             + (CASE WHEN a.death_place_id IS NOT NULL AND b.death_place_id IS NOT NULL THEN 25 ELSE 0 END)
             + (CASE WHEN a.email IS NOT NULL AND b.email IS NOT NULL THEN 25 ELSE 0 END);
  anc_pts   := p_origin + p_birth + p_bplace + p_death + p_dplace + p_email;

  v_max := patri_max + mat_max + sp_max + anc_max;
  IF v_max > 0 THEN
    -- +2 collapse bonuses can push clustered pts slightly over the clustered max.
    v_evidence_pct := LEAST(1.0, round((patri_pts + mat_pts + p_spouse + anc_pts)::numeric / v_max, 3));
  END IF;

  -- score_pct is the share of the FULL scale, so a field missing on either side counts as zero
  -- (AIO 3.6). The full scale is 325 points; death date and place are left out when either
  -- person is living (275), because a living person cannot match on them.
  v_either_living := coalesce(a.is_living, false) OR coalesce(b.is_living, false);
  v_full := CASE WHEN v_either_living THEN 275 ELSE 325 END;
  v_score_pct := LEAST(1.0, round(
    (v_score - CASE WHEN v_either_living THEN p_death + p_dplace ELSE 0 END)::numeric / v_full, 3));

  patri_ok := patri_max > 0 AND patri_pts >= 0.6 * patri_max;
  mat_ok   := mat_max   > 0 AND mat_pts   >= 0.6 * mat_max;
  sp_ok    := sp_max    > 0 AND p_spouse  >= 0.6 * sp_max;
  anc_ok   := anc_max   > 0 AND anc_pts   >= 0.6 * anc_max;
  v_clusters := (CASE WHEN patri_ok THEN 1 ELSE 0 END) + (CASE WHEN mat_ok THEN 1 ELSE 0 END)
              + (CASE WHEN sp_ok THEN 1 ELSE 0 END) + (CASE WHEN anc_ok THEN 1 ELSE 0 END);
  v_nonpatri := mat_ok OR sp_ok OR anc_ok;

  -- ── hard vetoes ───────────────────────────────────────────────────────────
  IF (a.gender='M' AND b.gender='F') OR (a.gender='F' AND b.gender='M') THEN v_vetoes := array_append(v_vetoes,'gender_mismatch'); END IF;
  IF a.tree_id = b.tree_id THEN v_vetoes := array_append(v_vetoes,'same_tree'); END IF;
  IF a.birth_year IS NOT NULL AND b.birth_year IS NOT NULL AND abs(a.birth_year-b.birth_year) > 15 THEN v_vetoes := array_append(v_vetoes,'birth_year_gap'); END IF;
  IF a.privacy_hold OR b.privacy_hold THEN v_vetoes := array_append(v_vetoes,'privacy_hold'); END IF;
  IF a.is_living OR b.is_living THEN v_privacy := 'living_suppressed'; END IF;

  -- ── disagreement vetoes (present-but-different) ───────────────────────────
  IF public.mf_present(a.mother_norm,b.mother_norm) AND p_mother < 8 THEN v_vetoes := array_append(v_vetoes,'mother_disagree'); END IF;
  IF both_spouses AND p_spouse = 0 THEN v_vetoes := array_append(v_vetoes,'spouse_disagree'); END IF;
  IF a.origin_place_id IS NOT NULL AND b.origin_place_id IS NOT NULL AND a.origin_place_id <> b.origin_place_id THEN v_vetoes := array_append(v_vetoes,'origin_disagree'); END IF;
  IF public.mf_present(a.mgf_norm,b.mgf_norm) AND p_mgf < 10 THEN v_vetoes := array_append(v_vetoes,'mgp_disagree'); END IF;
  IF a.birth_year IS NOT NULL AND b.birth_year IS NOT NULL AND abs(a.birth_year-b.birth_year) > 10 AND abs(a.birth_year-b.birth_year) <= 15 THEN v_vetoes := array_append(v_vetoes,'birth_year_disagree'); END IF;

  -- ── decision ──────────────────────────────────────────────────────────────
  -- AIO section 3.6 thresholds, as a share of the evidence available for the pair:
  -- 90% when both people are deceased, 76% when either is living (D4).
  SELECT link_threshold_deceased, link_threshold_living INTO v_thr_dec, v_thr_liv FROM public.app_settings LIMIT 1;
  v_thr_dec := COALESCE(v_thr_dec, 0.90);
  v_thr_liv := COALESCE(v_thr_liv, 0.76);
  v_thr := CASE WHEN v_either_living THEN v_thr_liv ELSE v_thr_dec END;

  -- The vetoes and the two-evidence-group rule stay. A living person no longer
  -- blocks the decision (Q3: living pairs link, then both owners are notified).
  -- A matching UNRWA card number (with the card copy on file) or 1948 family-card number
  -- (with the same given name) is a perfect match: it overrides the scoring (D8). Only the
  -- hard vetoes still apply: different genders, the same tree, a privacy hold.
  v_perfect := public.identifier_perfect_match(p_a, p_b);
  v_hard := v_vetoes && ARRAY['gender_mismatch','same_tree','privacy_hold']::text[];

  IF v_perfect IS NOT NULL AND NOT v_hard THEN
    v_decision := 'auto_link';
  ELSIF coalesce(array_length(v_vetoes,1),0) = 0
     AND v_score_pct >= v_thr
     AND v_clusters >= 2
     AND v_nonpatri THEN
    v_decision := 'auto_link';
  ELSE
    v_decision := 'review';
  END IF;

  RETURN QUERY SELECT v_score, jsonb_build_object(
    'meta', jsonb_build_object(
      'version','frs-v2','score',v_score,'max_attainable',v_max,'score_pct',v_score_pct,'evidence_pct',v_evidence_pct,'full_scale',v_full,'threshold',v_thr,
      'clusters_agreed',v_clusters,'decision',v_decision,'perfect_match',v_perfect,
      'vetoes',to_jsonb(v_vetoes),'privacy',v_privacy),
    'params', jsonb_build_object(
      'given',jsonb_build_object('w',10,'pts',p_given),
      'surname',jsonb_build_object('w',10,'pts',p_surname),
      'father',jsonb_build_object('w',10,'pts',p_father),
      'mother',jsonb_build_object('w',20,'pts',p_mother),
      'pgf',jsonb_build_object('w',25,'pts',p_pgf),
      'pgm',jsonb_build_object('w',25,'pts',p_pgm),
      'mgf',jsonb_build_object('w',25,'pts',p_mgf),
      'mgm',jsonb_build_object('w',25,'pts',p_mgm),
      'spouse',jsonb_build_object('w',25,'pts',p_spouse),
      'origin',jsonb_build_object('w',10,'pts',p_origin),
      'birth_year',jsonb_build_object('w',25,'pts',p_birth),
      'birth_place',jsonb_build_object('w',25,'pts',p_bplace),
      'death_year',jsonb_build_object('w',25,'pts',p_death),
      'death_place',jsonb_build_object('w',25,'pts',p_dplace),
      'email',jsonb_build_object('w',25,'pts',p_email),
      'num_children',jsonb_build_object('w',15,'pts',p_children))
  );
END $$;
