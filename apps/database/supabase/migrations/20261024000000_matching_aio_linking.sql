-- Matching follows the All-in-One (decisions D4, Q3, D2, 24 Oct 2026).
--
--   1. Thresholds are percentages of the full 325-point scale (score_pct; 275 when either person is living):
--      90% for deceased pairs, 76% when either person is living. They replace the raw
--      450-point threshold, which the scorer (maximum 343) could never reach.
--   2. Living pairs link automatically; both tree owners are then notified and can
--      revoke (revoke_auto_link). Previously a living person capped a pair at review.
--   3. The batch now performs the link when app_settings.auto_merge_enabled is on
--      (still off by default; turn it on only after checking precision on eval_pairs).
--   4. is_person_living: the presumed-deceased birth cut-off moves from 100 to 150 years.
--   The vetoes and the two-evidence-group rule are unchanged.

-- ── 1. settings ──────────────────────────────────────────────────────────────
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS link_threshold_deceased numeric NOT NULL DEFAULT 0.90
    CHECK (link_threshold_deceased > 0 AND link_threshold_deceased <= 1),
  ADD COLUMN IF NOT EXISTS link_threshold_living numeric NOT NULL DEFAULT 0.76
    CHECK (link_threshold_living > 0 AND link_threshold_living <= 1);
COMMENT ON COLUMN public.app_settings.link_threshold_deceased IS
  'Auto-link threshold on score_pct when both people are deceased (AIO 3.6: 90).';
COMMENT ON COLUMN public.app_settings.link_threshold_living IS
  'Auto-link threshold on score_pct when either person is living (AIO 3.6: 76).';
COMMENT ON COLUMN public.app_settings.auto_merge_threshold IS
  'DEPRECATED: raw-point threshold no longer used (the scorer maximum is 343). See link_threshold_*.';
COMMENT ON COLUMN public.app_settings.score_pct_floor IS
  'DEPRECATED: superseded by link_threshold_*.';

-- ── 2. one rule for "living" (D2): 150 years ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_person_living(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    -- A recorded death → not living.
    WHEN EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.person_id = p_person_id AND e.event_type = 'DEAT'
    ) THEN false
    -- Birth year known and 150 or more years ago → presumed not living.
    WHEN EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.person_id = p_person_id AND e.event_type = 'BIRT'
        AND e.date_year IS NOT NULL
        AND e.date_year <= (extract(year FROM now())::int - 150)
    ) THEN false
    -- No death, and birth < 150y or unknown → fail toward living.
    ELSE true
  END;
$$;
COMMENT ON FUNCTION public.is_person_living IS
  'True when a person has no death event and was born less than 150 years ago; fails toward living when the birth year is unknown (decision D2).';

-- ── 3. score_pair: percentage thresholds, living no longer capped ────────────
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
  -- AIO section 3.6 thresholds, as a share of the full scale (a missing field counts as zero):
  -- 90% when both people are deceased, 76% when either is living (D4).
  SELECT link_threshold_deceased, link_threshold_living INTO v_thr_dec, v_thr_liv FROM public.app_settings LIMIT 1;
  v_thr_dec := COALESCE(v_thr_dec, 0.90);
  v_thr_liv := COALESCE(v_thr_liv, 0.76);
  v_thr := CASE WHEN v_either_living THEN v_thr_liv ELSE v_thr_dec END;

  -- The vetoes and the two-evidence-group rule stay. A living person no longer
  -- blocks the decision (Q3: living pairs link, then both owners are notified).
  IF coalesce(array_length(v_vetoes,1),0) = 0
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
      'clusters_agreed',v_clusters,'decision',v_decision,
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

-- ── 4. auto-link: link, audit, queue the overlay refresh, notify both owners ──
CREATE OR REPLACE FUNCTION public.create_auto_link_notification(p_recipient uuid, p_match uuid, p_link uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_recipient IS NULL THEN RETURN; END IF;
  -- Generic text only: never names a person, so it is safe when a living person is involved.
  INSERT INTO public.notifications(recipient_user_id, kind, match_id, person_link_id,
    title_ar, title_en, body_ar, body_en, link)
  VALUES (p_recipient, 'connection_auto_linked', p_match, p_link,
    'تم ربط اتصال عائلي تلقائيًا', 'A family connection was linked automatically',
    'تم ربط شخص في شجرتك بشخص في شجرة عائلة أخرى. راجع الاتصال في صفحة الاتصالات وألغِ الربط إذا كان خاطئًا.',
    'A person in your tree was linked to a person in another family tree. Review it on your connections page and revoke the link if it is wrong.',
    '/dashboard/connections');
END $$;
REVOKE ALL ON FUNCTION public.create_auto_link_notification(uuid, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.auto_link_match(p_match_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.matches%ROWTYPE;
  v_link uuid;
  v_owner_a uuid; v_owner_b uuid;
BEGIN
  -- only a still-pending match can auto-link: a human decision or an earlier link wins.
  SELECT * INTO m FROM public.matches WHERE id = p_match_id AND status = 'pending';
  IF m.id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.person_links(person_a_id, person_b_id, status, link_type,
      source_match_id, confidence_score, source, reviewed_at)
    VALUES (m.person_a_id, m.person_b_id, 'confirmed', 'same_as', m.id, m.confidence_score, 'system', now())
    ON CONFLICT (person_a_id, person_b_id) DO NOTHING
    RETURNING id INTO v_link;
  -- a link already exists for this pair (confirmed, or revoked by a person): leave it alone.
  IF v_link IS NULL THEN RETURN NULL; END IF;

  UPDATE public.matches SET status = 'auto_merged', reviewed_at = now() WHERE id = m.id;
  INSERT INTO public.merge_log(action, person_link_id, match_id, actor_role, after_state)
    VALUES ('confirm', v_link, m.id, 'system',
            jsonb_build_object('status', 'confirmed', 'via', 'auto_link'));
  PERFORM public.enqueue_overlay_refresh('auto_link', v_link);

  v_owner_a := public.match_person_owner(m.person_a_id);
  v_owner_b := public.match_person_owner(m.person_b_id);
  -- the owners' connections page lists matches through match_hints; an auto-link shows as accepted.
  INSERT INTO public.match_hints(match_id, owner_user_id, counterpart_person_id, status)
    VALUES (m.id, v_owner_a, m.person_b_id, 'accepted'), (m.id, v_owner_b, m.person_a_id, 'accepted')
    ON CONFLICT (match_id, owner_user_id) DO NOTHING;
  PERFORM public.create_auto_link_notification(v_owner_a, m.id, v_link);
  IF v_owner_b IS DISTINCT FROM v_owner_a THEN
    PERFORM public.create_auto_link_notification(v_owner_b, m.id, v_link);
  END IF;
  RETURN v_link;
END $$;
REVOKE ALL ON FUNCTION public.auto_link_match(uuid) FROM PUBLIC;
COMMENT ON FUNCTION public.auto_link_match IS
  'Links a still-pending match (confirmed same_as, source system), audits it, queues the overlay refresh and notifies both tree owners. Called by run_matching_batch only when auto linking is switched on.';

-- ── 5. an owner (or admin) revokes an automatic link ─────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_auto_link(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.matches%ROWTYPE;
  v_link uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0002'; END IF;
  IF m.status <> 'auto_merged' THEN RAISE EXCEPTION 'not_auto_linked' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_link FROM public.person_links
    WHERE source_match_id = p_match_id AND status = 'confirmed';
  IF v_link IS NULL THEN RAISE EXCEPTION 'link_not_found' USING ERRCODE = 'P0002'; END IF;

  -- revoke_person_link authorizes the caller (admin or a writer of either tree) and tears the link down.
  PERFORM public.revoke_person_link(v_link);
  -- a human has now rejected this pair, so the batch never re-links it.
  UPDATE public.matches
    SET status = 'admin_rejected', reviewed_by = auth.uid(), reviewed_at = now(),
        notes = trim(both ' ' from coalesce(notes, '') || ' revoked after auto-link')
    WHERE id = p_match_id;
  UPDATE public.match_hints SET status = 'rejected', updated_at = now() WHERE match_id = p_match_id;
END $$;
GRANT EXECUTE ON FUNCTION public.revoke_auto_link(uuid) TO authenticated;
COMMENT ON FUNCTION public.revoke_auto_link IS
  'Owner or admin revokes an automatic link: full teardown via revoke_person_link, and the match is marked rejected so the nightly batch never re-links the pair.';

-- ── 6. the batch performs the link when switched on ──────────────────────────
CREATE OR REPLACE FUNCTION public.run_matching_batch(p_full boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run uuid;
  r record;
  v_score int;
  v_breakdown jsonb;
  v_pairs int := 0;
  v_queued int := 0;
  v_living int := 0;
  v_probed int := 0;
  v_mid uuid;
  v_auto int := 0;
  v_enabled boolean;
BEGIN
  -- Single-flight: documented advisory lock key. If another batch holds it, bail.
  IF NOT pg_try_advisory_xact_lock(724242) THEN
    RETURN NULL;
  END IF;
  SET LOCAL statement_timeout = 0;

  SELECT auto_merge_enabled INTO v_enabled FROM public.app_settings LIMIT 1;
  v_enabled := COALESCE(v_enabled, false);

  INSERT INTO public.matching_runs(run_type, status)
    VALUES (CASE WHEN p_full THEN 'full' ELSE 'incremental' END, 'running')
    RETURNING id INTO v_run;

  -- 1. features
  IF p_full THEN
    PERFORM public.refresh_match_features(id) FROM public.persons;
  ELSE
    PERFORM public.refresh_match_features_batch();
  END IF;
  SELECT count(*) INTO v_probed FROM public.match_features;

  -- 2. block keys
  PERFORM public.refresh_match_block_keys(true);

  -- 3 + 4. candidates → score → upsert
  -- New candidates, plus the pairs already waiting in the queue: generate_match_candidates()
  -- skips every existing match, so without this a pending pair would never be re-scored
  -- (after the switch is turned on, or after someone corrects a record).
  FOR r IN SELECT person_a_id, person_b_id FROM public.generate_match_candidates()
           UNION
           SELECT person_a_id, person_b_id FROM public.matches WHERE status = 'pending' LOOP
    SELECT score, breakdown INTO v_score, v_breakdown
      FROM public.score_pair(r.person_a_id, r.person_b_id);
    v_pairs := v_pairs + 1;
    IF v_breakdown -> 'meta' ->> 'privacy' = 'living_suppressed' THEN
      v_living := v_living + 1;
    END IF;

    INSERT INTO public.matches(person_a_id, person_b_id, confidence_score, status, found_by, score_breakdown)
      VALUES (r.person_a_id, r.person_b_id, v_score, 'pending', 'system', v_breakdown)
    ON CONFLICT (person_a_id, person_b_id) DO UPDATE
      SET confidence_score = EXCLUDED.confidence_score,
          score_breakdown  = EXCLUDED.score_breakdown,
          updated_at       = now()
      WHERE public.matches.status = 'pending'    -- never clobber a human decision
    RETURNING id INTO v_mid;
    v_queued := v_queued + 1;

    -- Automatic linking (AIO 3.6): only when the switch is on and the gate said so.
    IF v_enabled AND v_mid IS NOT NULL AND v_breakdown -> 'meta' ->> 'decision' = 'auto_link' THEN
      IF public.auto_link_match(v_mid) IS NOT NULL THEN v_auto := v_auto + 1; END IF;
    END IF;
  END LOOP;

  UPDATE public.matching_runs
    SET status = 'completed', finished_at = now(),
        persons_probed = v_probed, pairs_compared = v_pairs,
        queued = v_queued, living_suppressed = v_living, auto_linked = v_auto
    WHERE id = v_run;

  RETURN v_run;
END $$;

COMMENT ON FUNCTION public.run_matching_batch IS
  'Nightly matcher: refresh features → block → generate candidates → score_pair → UPSERT matches as pending (never clobbers human decisions); when app_settings.auto_merge_enabled is on, pairs the gate marks auto_link are linked via auto_link_match. Advisory-locked single-flight (key 724242).';

-- ── 7. refresh the stored living flag for the new 150-year rule ──────────────
UPDATE public.match_features mf
   SET is_living = public.is_person_living(mf.person_id)
 WHERE mf.is_living IS DISTINCT FROM public.is_person_living(mf.person_id);
