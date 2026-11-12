-- Wave 1 Matching (D4 / D8 / D9 / Q3): AIO 22-field / 100-point scorecard.
--
-- Builds on 20261024000000_matching_aio_linking.sql:
--   * Raw-point thresholds 90 (both deceased) / 76 (either living) on a 0-100 scale.
--   * Literal and phonetic scored as SEPARATE additive fields (no collapse).
--   * Paternal/maternal grandmother omitted from the 100-point sum (AIO table).
--   * Email omitted (not in AIO table).
--   * person_identifiers: UNRWA + 1948 family-card perfect-match short-circuit (D8).
--   * Nightly pg_cron schedule for run_matching_batch (best-effort if extension present).
--   * D9: confirm/reject/defer of matches and confirm/reject/revoke of person_links
--     remain platform-admin exclusive; owners keep match_hints + revoke_auto_link (Q3).
--   * auto_merge_enabled stays DEFAULT false (shadow mode).
--
-- version meta: aio-100-v1

-- ── 0. thresholds: store raw points on the 100-point scale ───────────────────
ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_link_threshold_deceased_check,
  DROP CONSTRAINT IF EXISTS app_settings_link_threshold_living_check;

UPDATE public.app_settings
  SET link_threshold_deceased = CASE
        WHEN link_threshold_deceased <= 1 THEN round(link_threshold_deceased * 100)
        ELSE link_threshold_deceased END,
      link_threshold_living = CASE
        WHEN link_threshold_living <= 1 THEN round(link_threshold_living * 100)
        ELSE link_threshold_living END;

ALTER TABLE public.app_settings
  ALTER COLUMN link_threshold_deceased SET DEFAULT 90,
  ALTER COLUMN link_threshold_living SET DEFAULT 76;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_link_threshold_deceased_check
    CHECK (link_threshold_deceased > 0 AND link_threshold_deceased <= 100),
  ADD CONSTRAINT app_settings_link_threshold_living_check
    CHECK (link_threshold_living > 0 AND link_threshold_living <= 100);

COMMENT ON COLUMN public.app_settings.link_threshold_deceased IS
  'Auto-link raw-point threshold on the AIO-100 scale when both people are deceased (default 90).';
COMMENT ON COLUMN public.app_settings.link_threshold_living IS
  'Auto-link raw-point threshold on the AIO-100 scale when either person is living (default 76).';
COMMENT ON COLUMN public.app_settings.auto_merge_threshold IS
  'DEPRECATED: superseded by link_threshold_* on the AIO-100 point scale.';
COMMENT ON COLUMN public.app_settings.score_pct_floor IS
  'DEPRECATED: superseded by raw-point link_threshold_* (score/100 is informational only).';

-- ── 1. spouse surname features (for Spouse Family 8+2) ───────────────────────
ALTER TABLE public.match_features
  ADD COLUMN IF NOT EXISTS spouse_surnames_norm text[],
  ADD COLUMN IF NOT EXISTS spouse_surnames_phon text[];

COMMENT ON COLUMN public.match_features.spouse_names_norm IS
  'Spouse given names (norm). Maps to AIO Spouse First (4).';
COMMENT ON COLUMN public.match_features.spouse_surnames_norm IS
  'Spouse family names (norm). Maps to AIO Spouse Family (8). Null/empty → spouse-family scores 0.';

-- ── 2. exact-match helper (literal / phonetic as separate additive fields) ───
CREATE OR REPLACE FUNCTION public.mf_exact_pts(a text, b text, w int) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN a IS NULL OR b IS NULL OR a = '' OR b = '' THEN 0
    WHEN a = b THEN w
    ELSE 0
  END;
$$;

-- ── 3. refresh_match_features: also extract spouse surnames ──────────────────
CREATE OR REPLACE FUNCTION public.refresh_match_features(p_person_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_tree uuid; v_gender public.gender_type;
  v_father uuid; v_mother uuid;
  v_pgf uuid; v_pgm uuid; v_mgf uuid; v_mgm uuid;
  v_birth_year smallint; v_birth_place uuid;
  v_death_year smallint; v_death_place uuid;
  v_spouse_norm text[]; v_spouse_phon text[];
  v_spouse_sur_norm text[]; v_spouse_sur_phon text[];
  v_num_children int;
BEGIN
  SELECT tree_id, gender INTO v_tree, v_gender FROM public.persons WHERE id = p_person_id;
  IF NOT FOUND THEN
    DELETE FROM public.match_features WHERE person_id = p_person_id;
    DELETE FROM public.match_features_dirty WHERE person_id = p_person_id;
    RETURN;
  END IF;

  SELECT father_id, mother_id INTO v_father, v_mother FROM public.match_resolve_parents(p_person_id);
  IF v_father IS NOT NULL THEN
    SELECT father_id, mother_id INTO v_pgf, v_pgm FROM public.match_resolve_parents(v_father);
  END IF;
  IF v_mother IS NOT NULL THEN
    SELECT father_id, mother_id INTO v_mgf, v_mgm FROM public.match_resolve_parents(v_mother);
  END IF;

  SELECT date_year, place_id INTO v_birth_year, v_birth_place
    FROM public.events WHERE person_id = p_person_id AND event_type = 'BIRT' LIMIT 1;
  SELECT date_year, place_id INTO v_death_year, v_death_place
    FROM public.events WHERE person_id = p_person_id AND event_type = 'DEAT' LIMIT 1;

  SELECT array_agg(public.mf_given_norm(sp)) FILTER (WHERE public.mf_given_norm(sp) IS NOT NULL),
         array_agg(public.mf_given_phon(sp)) FILTER (WHERE public.mf_given_phon(sp) IS NOT NULL),
         array_agg(public.mf_surname_norm(sp)) FILTER (WHERE public.mf_surname_norm(sp) IS NOT NULL),
         array_agg(public.mf_surname_phon(sp)) FILTER (WHERE public.mf_surname_phon(sp) IS NOT NULL)
    INTO v_spouse_norm, v_spouse_phon, v_spouse_sur_norm, v_spouse_sur_phon
    FROM (
      SELECT CASE WHEN fam.partner1_id = p_person_id THEN fam.partner2_id ELSE fam.partner1_id END AS sp
      FROM public.families fam
      WHERE fam.partner1_id = p_person_id OR fam.partner2_id = p_person_id
    ) s WHERE sp IS NOT NULL;

  SELECT count(*) INTO v_num_children
    FROM public.families fam JOIN public.family_children fc ON fc.family_id = fam.id
    WHERE fam.partner1_id = p_person_id OR fam.partner2_id = p_person_id;

  INSERT INTO public.match_features (
    person_id, tree_id, gender, is_living, privacy_hold, is_anchor,
    given_norm, given_phon, surname_norm, surname_phon,
    father_norm, father_phon, mother_norm, mother_phon,
    spouse_names_norm, spouse_names_phon,
    spouse_surnames_norm, spouse_surnames_phon,
    pgf_norm, pgf_phon, pgm_norm, pgm_phon, mgf_norm, mgf_phon, mgm_norm, mgm_phon,
    num_children, birth_year, birth_place_id, death_year, death_place_id, origin_place_id, email,
    features_updated_at
  ) VALUES (
    p_person_id, v_tree, v_gender, public.is_person_living(p_person_id),
    EXISTS (SELECT 1 FROM public.person_privacy_holds WHERE person_id = p_person_id),
    false,
    public.mf_given_norm(p_person_id), public.mf_given_phon(p_person_id),
    public.mf_surname_norm(p_person_id), public.mf_surname_phon(p_person_id),
    public.mf_given_norm(v_father), public.mf_given_phon(v_father),
    public.mf_given_norm(v_mother), public.mf_given_phon(v_mother),
    v_spouse_norm, v_spouse_phon, v_spouse_sur_norm, v_spouse_sur_phon,
    public.mf_given_norm(v_pgf), public.mf_given_phon(v_pgf),
    public.mf_given_norm(v_pgm), public.mf_given_phon(v_pgm),
    public.mf_given_norm(v_mgf), public.mf_given_phon(v_mgf),
    public.mf_given_norm(v_mgm), public.mf_given_phon(v_mgm),
    v_num_children, v_birth_year, v_birth_place, v_death_year, v_death_place, v_birth_place, NULL,
    now()
  )
  ON CONFLICT (person_id) DO UPDATE SET
    tree_id = EXCLUDED.tree_id, gender = EXCLUDED.gender, is_living = EXCLUDED.is_living,
    privacy_hold = EXCLUDED.privacy_hold,
    given_norm = EXCLUDED.given_norm, given_phon = EXCLUDED.given_phon,
    surname_norm = EXCLUDED.surname_norm, surname_phon = EXCLUDED.surname_phon,
    father_norm = EXCLUDED.father_norm, father_phon = EXCLUDED.father_phon,
    mother_norm = EXCLUDED.mother_norm, mother_phon = EXCLUDED.mother_phon,
    spouse_names_norm = EXCLUDED.spouse_names_norm, spouse_names_phon = EXCLUDED.spouse_names_phon,
    spouse_surnames_norm = EXCLUDED.spouse_surnames_norm, spouse_surnames_phon = EXCLUDED.spouse_surnames_phon,
    pgf_norm = EXCLUDED.pgf_norm, pgf_phon = EXCLUDED.pgf_phon,
    pgm_norm = EXCLUDED.pgm_norm, pgm_phon = EXCLUDED.pgm_phon,
    mgf_norm = EXCLUDED.mgf_norm, mgf_phon = EXCLUDED.mgf_phon,
    mgm_norm = EXCLUDED.mgm_norm, mgm_phon = EXCLUDED.mgm_phon,
    num_children = EXCLUDED.num_children,
    birth_year = EXCLUDED.birth_year, birth_place_id = EXCLUDED.birth_place_id,
    death_year = EXCLUDED.death_year, death_place_id = EXCLUDED.death_place_id,
    origin_place_id = EXCLUDED.origin_place_id, features_updated_at = now();

  DELETE FROM public.match_features_dirty WHERE person_id = p_person_id;
END $$;

-- ── 4. person_identifiers (D8) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.person_identifiers (
  id                      uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id               uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  id_type                 text NOT NULL
                            CHECK (id_type IN ('unrwa_registration', 'family_card_1948')),
  id_value                text NOT NULL,
  evidence_attachment_id  uuid NULL REFERENCES public.person_attachments(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, id_type)
);
-- Same id_value may appear on two persons (that is the perfect-match signal).
-- UNIQUE(id_type, id_value) is intentionally NOT used: it would block cross-person sharing.
CREATE INDEX IF NOT EXISTS idx_person_identifiers_type_value
  ON public.person_identifiers (id_type, id_value);

ALTER TABLE public.person_identifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_identifiers_select ON public.person_identifiers;
CREATE POLICY person_identifiers_select ON public.person_identifiers FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS person_identifiers_insert ON public.person_identifiers;
CREATE POLICY person_identifiers_insert ON public.person_identifiers FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS person_identifiers_update ON public.person_identifiers;
CREATE POLICY person_identifiers_update ON public.person_identifiers FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS person_identifiers_delete ON public.person_identifiers;
CREATE POLICY person_identifiers_delete ON public.person_identifiers FOR DELETE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    )
  );

COMMENT ON TABLE public.person_identifiers IS
  'External identity keys for perfect-match short-circuit (D8): unrwa_registration and family_card_1948. UNRWA evidence_attachment_id is required at the app layer; the scorer short-circuits score even when evidence is deferred.';
COMMENT ON COLUMN public.person_identifiers.evidence_attachment_id IS
  'Required for UNRWA at the app layer. Scorer still short-circuits on shared id_value; evidence presence is recorded in meta for the admin queue.';

-- ── 5. score_pair: AIO 100-point table (aio-100-v1) ─────────────────────────
CREATE OR REPLACE FUNCTION public.score_pair(p_a uuid, p_b uuid)
RETURNS TABLE(score int, breakdown jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  a public.match_features%ROWTYPE;
  b public.match_features%ROWTYPE;
  p_given int; p_surname int; p_father int; p_mother int;
  p_pgf int; p_mgf int;
  p_spouse_first int; p_spouse_family int; p_spouse int;
  p_origin int; p_birth int; p_bplace int; p_death int; p_dplace int;
  p_children int;
  sp_given_lit int; sp_given_phon int; sp_sur_lit int; sp_sur_phon int;
  v_score int;
  v_vetoes text[] := ARRAY[]::text[];
  v_privacy text := NULL;
  -- clusters
  patri_max int; patri_pts int; mat_max int; mat_pts int; sp_max int; anc_max int; anc_pts int;
  v_max int; v_score_pct numeric := 0; v_evidence_pct numeric := 0;
  v_full int := 100; v_either_living boolean; v_clusters int := 0; v_nonpatri boolean := false;
  patri_ok boolean; mat_ok boolean; sp_ok boolean; anc_ok boolean;
  v_thr_dec numeric; v_thr_liv numeric; v_thr numeric; v_decision text;
  both_spouses boolean; both_spouse_surnames boolean;
  v_id_match text := NULL; v_id_evidence boolean := false;
  v_unrwa_val text; v_card_val text;
BEGIN
  SELECT * INTO a FROM public.match_features WHERE person_id = p_a;
  SELECT * INTO b FROM public.match_features WHERE person_id = p_b;
  IF a.person_id IS NULL OR b.person_id IS NULL THEN
    RETURN QUERY SELECT 0, jsonb_build_object('meta',
      jsonb_build_object('version','aio-100-v1','score',0,'decision','review','error','missing_features'));
    RETURN;
  END IF;

  v_either_living := coalesce(a.is_living, false) OR coalesce(b.is_living, false);

  -- ── hard vetoes (also gate perfect-match short-circuit) ───────────────────
  IF (a.gender='M' AND b.gender='F') OR (a.gender='F' AND b.gender='M') THEN
    v_vetoes := array_append(v_vetoes,'gender_mismatch');
  END IF;
  IF a.tree_id = b.tree_id THEN v_vetoes := array_append(v_vetoes,'same_tree'); END IF;
  IF a.birth_year IS NOT NULL AND b.birth_year IS NOT NULL AND abs(a.birth_year-b.birth_year) > 15 THEN
    v_vetoes := array_append(v_vetoes,'birth_year_gap');
  END IF;
  IF a.privacy_hold OR b.privacy_hold THEN v_vetoes := array_append(v_vetoes,'privacy_hold'); END IF;
  IF a.is_living OR b.is_living THEN v_privacy := 'living_suppressed'; END IF;

  -- ── D8 perfect-match short-circuit (UNRWA / 1948 family card) ─────────────
  SELECT ia.id_value,
         (ia.evidence_attachment_id IS NOT NULL OR ib.evidence_attachment_id IS NOT NULL)
    INTO v_unrwa_val, v_id_evidence
    FROM public.person_identifiers ia
    JOIN public.person_identifiers ib
      ON ia.id_type = ib.id_type AND ia.id_value = ib.id_value
   WHERE ia.person_id = p_a AND ib.person_id = p_b
     AND ia.id_type = 'unrwa_registration'
   LIMIT 1;
  IF v_unrwa_val IS NOT NULL THEN
    v_id_match := 'unrwa_registration';
  ELSE
    SELECT ia.id_value INTO v_card_val
      FROM public.person_identifiers ia
      JOIN public.person_identifiers ib
        ON ia.id_type = ib.id_type AND ia.id_value = ib.id_value
     WHERE ia.person_id = p_a AND ib.person_id = p_b
       AND ia.id_type = 'family_card_1948'
       AND public.mf_present(a.given_norm, b.given_norm)
       AND a.given_norm = b.given_norm
     LIMIT 1;
    IF v_card_val IS NOT NULL THEN
      v_id_match := 'family_card_1948';
      v_id_evidence := true;  -- family card has no separate evidence column requirement
    END IF;
  END IF;

  IF v_id_match IS NOT NULL THEN
    -- Hard vetoes still apply. Evidence for UNRWA is deferred to the app layer:
    -- we still short-circuit the score; meta.identifier_evidence records presence.
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

  -- ── AIO additive fields (literal + phonetic SEPARATE; missing = 0) ────────
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
  -- pgm / mgm intentionally omitted from the 100-point sum (AIO table).
  p_mgf     := public.mf_exact_pts(a.mgf_norm,     b.mgf_norm,     6)
             + public.mf_exact_pts(a.mgf_phon,     b.mgf_phon,     2);

  both_spouses := a.spouse_names_norm IS NOT NULL AND array_length(a.spouse_names_norm,1) > 0
              AND b.spouse_names_norm IS NOT NULL AND array_length(b.spouse_names_norm,1) > 0;
  both_spouse_surnames := a.spouse_surnames_norm IS NOT NULL AND array_length(a.spouse_surnames_norm,1) > 0
                      AND b.spouse_surnames_norm IS NOT NULL AND array_length(b.spouse_surnames_norm,1) > 0;

  sp_given_lit  := CASE WHEN both_spouses AND a.spouse_names_norm && b.spouse_names_norm THEN 4 ELSE 0 END;
  sp_given_phon := CASE WHEN a.spouse_names_phon IS NOT NULL AND b.spouse_names_phon IS NOT NULL
                         AND array_length(a.spouse_names_phon,1) > 0
                         AND array_length(b.spouse_names_phon,1) > 0
                         AND a.spouse_names_phon && b.spouse_names_phon THEN 2 ELSE 0 END;
  p_spouse_first := sp_given_lit + sp_given_phon;

  sp_sur_lit  := CASE WHEN both_spouse_surnames AND a.spouse_surnames_norm && b.spouse_surnames_norm THEN 8 ELSE 0 END;
  sp_sur_phon := CASE WHEN a.spouse_surnames_phon IS NOT NULL AND b.spouse_surnames_phon IS NOT NULL
                       AND array_length(a.spouse_surnames_phon,1) > 0
                       AND array_length(b.spouse_surnames_phon,1) > 0
                       AND a.spouse_surnames_phon && b.spouse_surnames_phon THEN 2 ELSE 0 END;
  p_spouse_family := sp_sur_lit + sp_sur_phon;
  -- When only combined/given spouse names exist, map overlap to spouse-first (4+2);
  -- spouse-family stays 0 until surnames are enriched (documented).
  p_spouse := p_spouse_first + p_spouse_family;

  p_origin := public.mf_place_pts(a.origin_place_id, b.origin_place_id, 4);
  p_birth  := public.mf_year_pts(a.birth_year, b.birth_year, 7);
  p_bplace := public.mf_place_pts(a.birth_place_id, b.birth_place_id, 7);
  p_death  := public.mf_year_pts(a.death_year, b.death_year, 7);
  p_dplace := public.mf_place_pts(a.death_place_id, b.death_place_id, 7);

  IF a.num_children IS NULL OR b.num_children IS NULL THEN
    p_children := 0;
  ELSIF a.num_children = b.num_children THEN
    p_children := 8;
  ELSE
    p_children := 0;
  END IF;

  v_score := p_given + p_surname + p_father + p_mother + p_pgf + p_mgf
           + p_spouse + p_origin + p_birth + p_bplace + p_death + p_dplace + p_children;

  -- ── evidence clusters (num_children excluded from evidence_pct) ────────────
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
             + (CASE WHEN a.death_year IS NOT NULL AND b.death_year IS NOT NULL THEN 7 ELSE 0 END)
             + (CASE WHEN a.death_place_id IS NOT NULL AND b.death_place_id IS NOT NULL THEN 7 ELSE 0 END);
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

  -- ── disagreement vetoes (present-but-different) ───────────────────────────
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

  -- ── decision: raw points vs 90 / 76 (D4 / Q3) ──────────────────────────────
  SELECT link_threshold_deceased, link_threshold_living
    INTO v_thr_dec, v_thr_liv FROM public.app_settings LIMIT 1;
  v_thr_dec := COALESCE(v_thr_dec, 90);
  v_thr_liv := COALESCE(v_thr_liv, 76);
  v_thr := CASE WHEN v_either_living THEN v_thr_liv ELSE v_thr_dec END;

  IF coalesce(array_length(v_vetoes,1),0) = 0
     AND v_score >= v_thr
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
      'threshold',v_thr,'clusters_agreed',v_clusters,'decision',v_decision,
      'vetoes',to_jsonb(v_vetoes),'privacy',v_privacy),
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
END $$;

COMMENT ON FUNCTION public.score_pair IS
  'AIO-100 v1 scorer: 22 additive fields (literal+phonetic separate), max 100. Thresholds 90/76 raw points. UNRWA/family-card perfect match short-circuit. pgm/mgm/email omitted. Gates: vetoes + ≥2 evidence clusters with a non-patriline corroborator. Shadow mode still controlled by auto_merge_enabled.';

-- ── 6. D9: admin-only revoke_person_link; owners keep revoke_auto_link (Q3) ──
-- Extract teardown so revoke_auto_link can call it without admin auth.
CREATE OR REPLACE FUNCTION public.teardown_person_link(p_link_id uuid, p_actor_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  l public.person_links%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.person_links WHERE id = p_link_id;
  IF l.id IS NULL THEN RAISE EXCEPTION 'link_not_found' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.person_links SET status = 'revoked', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_link_id;
  INSERT INTO public.merge_log(action, person_link_id, match_id, actor_user_id, actor_role,
      before_state, after_state)
    VALUES ('revoke', p_link_id, l.source_match_id, auth.uid(), coalesce(p_actor_role, 'admin'),
            jsonb_build_object('status', l.status), jsonb_build_object('status','revoked'));

  DELETE FROM public.notifications WHERE person_link_id = p_link_id;
  UPDATE public.contact_relay SET revoked_at = now()
    WHERE match_id = l.source_match_id AND revoked_at IS NULL;

  DELETE FROM public.match_paths
    WHERE source_person_id IN (l.person_a_id, l.person_b_id)
       OR target_person_id IN (l.person_a_id, l.person_b_id);

  PERFORM public.enqueue_overlay_refresh('revoke', p_link_id);
END $$;
REVOKE ALL ON FUNCTION public.teardown_person_link(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.revoke_person_link(p_link_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- D9: platform admin exclusive for general link revoke.
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  PERFORM public.teardown_person_link(p_link_id, 'admin');
END $$;
GRANT EXECUTE ON FUNCTION public.revoke_person_link(uuid) TO authenticated;
COMMENT ON FUNCTION public.revoke_person_link IS
  'D9: platform-admin-only teardown of a same_as edge. Owners revoke automatic links via revoke_auto_link (Q3).';

-- confirm / reject already require is_admin(); restate comments for D9 clarity.
COMMENT ON FUNCTION public.confirm_person_link IS
  'D9: platform-admin-only finalizer for a proposed same_as edge.';
COMMENT ON FUNCTION public.reject_person_link IS
  'D9: platform-admin-only rejection of a proposed same_as edge.';
COMMENT ON FUNCTION public.resolve_match IS
  'D9: platform-admin-only approve/reject/defer of a match. Owners use resolve_match_hint for deferred hints.';

CREATE OR REPLACE FUNCTION public.revoke_auto_link(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.matches%ROWTYPE;
  v_link uuid;
  v_tree_a uuid; v_tree_b uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0002'; END IF;
  IF m.status <> 'auto_merged' THEN RAISE EXCEPTION 'not_auto_linked' USING ERRCODE = '22023'; END IF;

  SELECT tree_id INTO v_tree_a FROM public.persons WHERE id = m.person_a_id;
  SELECT tree_id INTO v_tree_b FROM public.persons WHERE id = m.person_b_id;
  -- Q3 exception to D9: an involved tree writer (or admin) may revoke an automatic link.
  IF NOT (public.is_admin() OR public.can_write_tree(v_tree_a) OR public.can_write_tree(v_tree_b)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_link FROM public.person_links
    WHERE source_match_id = p_match_id AND status = 'confirmed';
  IF v_link IS NULL THEN RAISE EXCEPTION 'link_not_found' USING ERRCODE = 'P0002'; END IF;

  PERFORM public.teardown_person_link(
    v_link,
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'owner' END);

  UPDATE public.matches
    SET status = 'admin_rejected', reviewed_by = auth.uid(), reviewed_at = now(),
        notes = trim(both ' ' from coalesce(notes, '') || ' revoked after auto-link')
    WHERE id = p_match_id;
  UPDATE public.match_hints SET status = 'rejected', updated_at = now() WHERE match_id = p_match_id;
END $$;
GRANT EXECUTE ON FUNCTION public.revoke_auto_link(uuid) TO authenticated;
COMMENT ON FUNCTION public.revoke_auto_link IS
  'Q3: owner or admin revokes an automatic link (teardown + mark match rejected so the nightly batch never re-links). Exception to D9 admin-only revoke.';

-- ── 7. Nightly schedule (best-effort pg_cron) ────────────────────────────────
-- Staging/prod must enable the pg_cron extension for this to take effect.
-- Local / CI without the extension is fine: the DO block ignores failure.
-- Schedule: 02:30 UTC daily → SELECT public.run_matching_batch(false)
--
-- Manual fallback when pg_cron is unavailable:
--   SELECT public.run_matching_batch(false);
--   or a Vercel / GitHub Actions cron that calls the same RPC via service_role.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('juthoor-matching-nightly');
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- job may not exist yet
    END;
    PERFORM cron.schedule(
      'juthoor-matching-nightly',
      '30 2 * * *',
      $cron$SELECT public.run_matching_batch(false)$cron$
    );
    RAISE NOTICE 'Scheduled juthoor-matching-nightly via pg_cron (02:30 UTC).';
  ELSE
    RAISE NOTICE 'pg_cron extension not installed; nightly matching schedule skipped. Enable pg_cron on staging/prod.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END $$;
