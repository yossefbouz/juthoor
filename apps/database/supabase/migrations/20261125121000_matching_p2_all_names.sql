-- ============================================================================
-- Matching P2 (2/4): compare every name a person has (2026-11-25)
-- ============================================================================
-- Until now only the primary person_names row was compared, so a woman entered
-- under her married surname in one tree and her birth surname in another, or a
-- man entered as "Abu Ali" in one and "Mahmoud" in another, never matched on
-- the name fields.
--
--  1. match_features keeps every given name and surname of the person (primary
--     and alternates), built with the P1 rules: placeholders ignored, surname
--     article stripped, spaces ignored in given names, plus the consonant
--     skeletons used for the cross-script match.
--     One exception: a given name typed in Latin letters that is only a second
--     spelling of one of the person's own Arabic-script given names (same
--     consonant skeleton) is left out. The Arabic spelling compares reliably;
--     the Latin copy would only add the lossy comparisons, and brothers called
--     محمد / Mohammad and محمود / Mahmoud would stop being told apart.
--  2. score_pair_impl (body of 20261122120000) takes the best match across the
--     two people's names for the given name and the surname. given_disagree is
--     raised only when no pair of given names matches.
--  3. The phonetic given+surname blocking pass (pass 1) emits a key for every
--     given × surname combination.
--
-- Not changed: the scalar given_norm / given_phon / surname_norm / surname_phon
-- columns still hold the primary name; parents, grandparents and spouses are
-- still compared by their primary name; the 1948 family-card perfect match
-- still requires the primary given names to be equal.
-- ============================================================================

-- ── 1. Features ─────────────────────────────────────────────────────────────
ALTER TABLE public.match_features
  ADD COLUMN IF NOT EXISTS given_norms       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS given_phons       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS surname_norms     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS surname_phons     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS given_skel_latin  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS given_skel_native text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.match_features.given_norms IS
  'Every given name of the person (primary and alternates), normalised like given_norm. Placeholders left out.';
COMMENT ON COLUMN public.match_features.given_skel_latin IS
  'Consonant skeletons (2+ letters) of the given names typed in Latin letters. Compared with the other person''s given_skel_native for the cross-script match.';
COMMENT ON COLUMN public.match_features.given_skel_native IS
  'Consonant skeletons (2+ letters) of the given names typed without Latin letters.';

-- All names of one person as six arrays (one row, empty arrays when there is no
-- usable name). Same expressions as mf_given_norm / mf_given_phon /
-- mf_surname_norm / mf_surname_phon in 20261113120000, over every name row.
CREATE OR REPLACE FUNCTION public.mf_all_names(p_person_id uuid)
RETURNS TABLE (
  given_norms text[],
  given_phons text[],
  surname_norms text[],
  surname_phons text[],
  given_skel_latin text[],
  given_skel_native text[]
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH n AS (
    SELECT
      CASE WHEN public.mf_is_placeholder_name(pn.given_name) THEN NULL
           ELSE replace(public.normalize_arabic(public.transliterate_to_arabic(pn.given_name)), ' ', '')
      END AS gn,
      CASE WHEN public.mf_is_placeholder_name(pn.given_name) THEN NULL
           ELSE replace(public.arabic_phonetic(public.transliterate_to_arabic(pn.given_name)), ' ', '')
      END AS gp,
      CASE WHEN public.mf_is_placeholder_name(pn.surname) THEN NULL
           ELSE public.mf_strip_article(public.normalize_arabic(public.transliterate_to_arabic(pn.surname)))
      END AS sn,
      CASE WHEN public.mf_is_placeholder_name(pn.surname) THEN NULL
           ELSE public.arabic_phonetic(public.mf_strip_article(public.normalize_arabic(public.transliterate_to_arabic(pn.surname))))
      END AS sp,
      COALESCE(pn.given_name ~ '[A-Za-z]', false) AS latin
    FROM public.person_names pn
    WHERE pn.person_id = p_person_id
  ),
  g AS (
    SELECT n.gn, n.gp, n.latin, public.mf_name_skeleton(n.gn) AS skel
    FROM n
    WHERE n.gn <> ''
  ),
  -- Given names kept: everything except a Latin-letter name that has the
  -- skeleton of one of the person's own Arabic-script names.
  gk AS (
    SELECT g.gn, g.gp, g.latin, g.skel
    FROM g
    WHERE NOT (g.latin AND EXISTS (SELECT 1 FROM g o WHERE NOT o.latin AND o.skel = g.skel))
  )
  SELECT
    COALESCE((SELECT array_agg(DISTINCT gk.gn) FROM gk), '{}'),
    COALESCE((SELECT array_agg(DISTINCT gk.gp) FROM gk WHERE gk.gp <> ''), '{}'),
    COALESCE((SELECT array_agg(DISTINCT n.sn) FROM n WHERE n.sn <> ''), '{}'),
    COALESCE((SELECT array_agg(DISTINCT n.sp) FROM n WHERE n.sp <> ''), '{}'),
    COALESCE((SELECT array_agg(DISTINCT gk.skel) FROM gk
               WHERE gk.latin AND char_length(gk.skel) >= 2), '{}'),
    COALESCE((SELECT array_agg(DISTINCT gk.skel) FROM gk
               WHERE NOT gk.latin AND char_length(gk.skel) >= 2), '{}');
$$;

-- Internal: only refresh_match_features (SECURITY DEFINER) calls it.
REVOKE ALL ON FUNCTION public.mf_all_names(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mf_all_names(uuid) TO service_role;

-- refresh_match_features: body of 20261107130000 plus the six name arrays.
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
  v_names record;
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

  SELECT * INTO v_names FROM public.mf_all_names(p_person_id);

  INSERT INTO public.match_features (
    person_id, tree_id, gender, is_living, privacy_hold, is_anchor,
    given_norm, given_phon, surname_norm, surname_phon,
    given_norms, given_phons, surname_norms, surname_phons,
    given_skel_latin, given_skel_native,
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
    v_names.given_norms, v_names.given_phons, v_names.surname_norms, v_names.surname_phons,
    v_names.given_skel_latin, v_names.given_skel_native,
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
    given_norms = EXCLUDED.given_norms, given_phons = EXCLUDED.given_phons,
    surname_norms = EXCLUDED.surname_norms, surname_phons = EXCLUDED.surname_phons,
    given_skel_latin = EXCLUDED.given_skel_latin, given_skel_native = EXCLUDED.given_skel_native,
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

-- Fill the new columns for the feature rows that already exist, so scoring
-- does not wait for the next batch.
UPDATE public.match_features mf
   SET (given_norms, given_phons, surname_norms, surname_phons, given_skel_latin, given_skel_native)
     = (SELECT n.given_norms, n.given_phons, n.surname_norms, n.surname_phons,
               n.given_skel_latin, n.given_skel_native
          FROM public.mf_all_names(mf.person_id) n);

-- The names to compare for one field: every name when the feature row has
-- them, otherwise the single primary value (a row written without the arrays).
-- Placeholders never count.
CREATE OR REPLACE FUNCTION public.mf_name_list(p_all text[], p_primary text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.mf_filter_placeholder_arr(
    CASE WHEN cardinality(p_all) > 0 THEN p_all ELSE ARRAY[p_primary] END);
$$;

-- Internal: only score_pair_impl (SECURITY DEFINER) calls it.
REVOKE ALL ON FUNCTION public.mf_name_list(text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mf_name_list(text[], text) TO service_role;

-- ── 2. score_pair_impl: body of 20261122120000, names compared across all ───
CREATE OR REPLACE FUNCTION public.score_pair_impl(p_a uuid, p_b uuid)
 RETURNS TABLE(score integer, breakdown jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  a public.match_features%ROWTYPE;
  b public.match_features%ROWTYPE;
  a_given text[]; b_given text[];
  a_given_phon text[]; b_given_phon text[];
  a_surname text[]; b_surname text[];
  a_surname_phon text[]; b_surname_phon text[];
  v_given_present boolean;
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

  -- Every name the person has (primary and alternates), see mf_name_list.
  a_given        := public.mf_name_list(a.given_norms,   a.given_norm);
  b_given        := public.mf_name_list(b.given_norms,   b.given_norm);
  a_given_phon   := public.mf_name_list(a.given_phons,   a.given_phon);
  b_given_phon   := public.mf_name_list(b.given_phons,   b.given_phon);
  a_surname      := public.mf_name_list(a.surname_norms, a.surname_norm);
  b_surname      := public.mf_name_list(b.surname_norms, b.surname_norm);
  a_surname_phon := public.mf_name_list(a.surname_phons, a.surname_phon);
  b_surname_phon := public.mf_name_list(b.surname_phons, b.surname_phon);
  v_given_present := cardinality(a_given) > 0 AND cardinality(b_given) > 0;

  -- Best match across the names: literal 4 + phonetic 2.
  p_given   := (CASE WHEN a_given && b_given THEN 4 ELSE 0 END)
             + (CASE WHEN a_given_phon && b_given_phon THEN 2 ELSE 0 END);
  -- Same name entered in different scripts (Saleh / صالح, Abdullah / عبدالله):
  -- transliteration is lossy, so equal consonant skeletons earn the
  -- phonetic-level 2 points. Only across scripts: two Arabic spellings compare
  -- reliably, and the skeleton would merge حسن and حسين.
  IF p_given = 0 AND v_given_present
     AND (a.given_skel_latin && b.given_skel_native
          OR a.given_skel_native && b.given_skel_latin) THEN
    p_given := 2;
  END IF;
  p_surname := (CASE WHEN a_surname && b_surname THEN 4 ELSE 0 END)
             + (CASE WHEN a_surname_phon && b_surname_phon THEN 2 ELSE 0 END);
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

  -- Both people have a first name and no pair of their names matches, exactly,
  -- phonetically or across scripts. Brothers share parents, surname and places,
  -- so without this they scored like duplicates. Veto auto-link and take 20
  -- points off.
  IF v_given_present AND p_given = 0 THEN
    v_vetoes := array_append(v_vetoes, 'given_disagree');
    v_score := GREATEST(v_score - 20, 0);
  END IF;

  patri_max := (CASE WHEN v_given_present                                THEN 6 ELSE 0 END)
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

-- ── 3. Blocking: body of 20260711090000, pass 1 over every name ─────────────
CREATE OR REPLACE FUNCTION public.refresh_match_block_keys(p_full boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_full THEN TRUNCATE public.match_block_keys; END IF;

  -- pass 1: phonetic given + surname (cross-script — features are script-folded),
  -- one key for every given × surname combination of the person's names.
  INSERT INTO public.match_block_keys(person_id, pass, block_key, tree_id)
    SELECT mf.person_id, 1, g.phon || '|' || s.phon, mf.tree_id
    FROM public.match_features mf
    CROSS JOIN LATERAL unnest(mf.given_phons   || mf.given_phon)   AS g(phon)
    CROSS JOIN LATERAL unnest(mf.surname_phons || mf.surname_phon) AS s(phon)
    WHERE g.phon <> '' AND s.phon <> '' AND NOT mf.privacy_hold
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
END $$;
