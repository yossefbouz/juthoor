-- F5: batch completion — the two pieces B12 deferred, plus a latent drain fix.
--
-- 1. drain_overlay_refresh(): REFRESH MATERIALIZED VIEW CONCURRENTLY can NEVER
--    run inside a function (functions always execute inside a transaction), so
--    the original CONCURRENTLY body would have errored the first time anything
--    was pending. Plain refresh instead — documented trade-off: the overlay
--    matview is tiny (one row per confirmed-linked person), the nightly batch is
--    advisory-locked single-flight, and readers only see a brief lock. Signature
--    unchanged, so the F1 lockdown grants (service_role-only) carry over.
--
-- 2. run_matching_batch(): now ALSO
--    (a) UPSERTs a person_links row as 'proposed' (link-not-merge substrate) for
--        every pair it queues — source='system', source_match_id, state-only
--        breakdown — and NEVER downgrades a human decision: the ON CONFLICT
--        update only touches rows still in 'proposed' (confirmed/rejected/
--        revoked links are untouched);
--    (b) drains the overlay-refresh queue at the END of the batch, so admin
--        confirms/revokes made during the day materialize in the Mother Tree
--        overlay every night without ever blocking a request path.
--    Shadow mode unchanged: every match still lands 'pending'; matching_runs
--    counters unchanged; advisory lock (724242) unchanged.

CREATE OR REPLACE FUNCTION public.drain_overlay_refresh()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.overlay_refresh_queue WHERE processed_at IS NULL;
  IF v_n > 0 THEN
    -- Plain refresh: CONCURRENTLY is impossible in function/transaction context.
    -- The matview is small and the nightly batch is the only scheduled caller.
    REFRESH MATERIALIZED VIEW public.person_identity_groups;
    UPDATE public.overlay_refresh_queue SET processed_at = now() WHERE processed_at IS NULL;
  END IF;
  RETURN v_n;
END $$;

COMMENT ON FUNCTION public.drain_overlay_refresh IS
  'Drain pending Mother-Tree overlay refresh requests (plain refresh — CONCURRENTLY cannot run inside a function). Called at the end of run_matching_batch and by the Vercel fallback.';

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
  v_match_id uuid;
BEGIN
  -- Single-flight: documented advisory lock key. If another batch holds it, bail.
  IF NOT pg_try_advisory_xact_lock(724242) THEN
    RETURN NULL;
  END IF;
  SET LOCAL statement_timeout = 0;

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

  -- 3 + 4. candidates → score → upsert match (pending) + proposed link
  FOR r IN SELECT person_a_id, person_b_id FROM public.generate_match_candidates() LOOP
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
      WHERE public.matches.status = 'pending'   -- never clobber a human decision
    RETURNING id INTO v_match_id;

    -- the reversible link-not-merge substrate: a 'proposed' same_as edge per
    -- queued pair. NEVER downgrades: only rows still 'proposed' are updated.
    INSERT INTO public.person_links(person_a_id, person_b_id, status, link_type,
        source_match_id, confidence_score, source, score_breakdown)
      VALUES (r.person_a_id, r.person_b_id, 'proposed', 'same_as',
              v_match_id, v_score, 'system', v_breakdown)
    ON CONFLICT (person_a_id, person_b_id) DO UPDATE
      SET confidence_score = EXCLUDED.confidence_score,
          score_breakdown  = EXCLUDED.score_breakdown,
          source_match_id  = COALESCE(EXCLUDED.source_match_id, public.person_links.source_match_id)
      WHERE public.person_links.status = 'proposed';

    v_queued := v_queued + 1;
  END LOOP;

  -- 5. materialize any day-time confirms/revokes into the overlay (F5b)
  PERFORM public.drain_overlay_refresh();

  UPDATE public.matching_runs
    SET status = 'completed', finished_at = now(),
        persons_probed = v_probed, pairs_compared = v_pairs,
        queued = v_queued, living_suppressed = v_living
    WHERE id = v_run;

  RETURN v_run;
END $$;

COMMENT ON FUNCTION public.run_matching_batch IS
  'Shadow-mode nightly matcher: refresh features → block → candidates → score_pair → UPSERT matches as pending + person_links as proposed (never clobbering human decisions on either), then drain the overlay-refresh queue. Advisory-locked single-flight (key 724242).';
