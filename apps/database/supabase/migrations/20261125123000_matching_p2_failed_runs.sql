-- ============================================================================
-- Matching P2 (4/4): a failed scheduled run leaves a record (2026-11-25)
-- ============================================================================
-- run_matching_scheduled (body of 20261112170000) let the batch's error escape:
-- the transaction rolled back, the batch's own 'running' row went with it, and
-- nothing in matching_runs said a run had been attempted. Now the error is
-- caught and a row with status 'failed' and the error text in notes is kept.
-- The kill switch (nightly_matching_enabled, default false) is unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_matching_scheduled(p_force_full boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '15min'
AS $$
DECLARE
  v_enabled boolean;
  v_dow int;
  v_full boolean;
  v_run uuid;
  v_error text;
BEGIN
  SELECT COALESCE(nightly_matching_enabled, false) INTO v_enabled
  FROM public.app_settings LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'nightly_matching_disabled');
  END IF;

  v_dow := EXTRACT(DOW FROM timezone('utc', now()))::int;
  v_full := COALESCE(p_force_full, false) OR (v_dow = 0);

  BEGIN
    v_run := public.run_matching_batch(v_full);
  EXCEPTION WHEN query_canceled OR OTHERS THEN
    -- Everything the batch did, its 'running' row included, is rolled back to
    -- the start of this block. OTHERS does not cover a statement timeout or a
    -- cancel, hence query_canceled.
    v_error := SQLERRM || ' (SQLSTATE ' || SQLSTATE || ')';
    INSERT INTO public.matching_runs(run_type, status, finished_at, errored, notes)
      VALUES (CASE WHEN v_full THEN 'full' ELSE 'incremental' END, 'failed', now(), 1, v_error)
      RETURNING id INTO v_run;
    RETURN jsonb_build_object(
      'full', v_full,
      'run_id', v_run,
      'skipped', false,
      'failed', true,
      'error', v_error
    );
  END;

  RETURN jsonb_build_object(
    'full', v_full,
    'run_id', v_run,
    'skipped', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_matching_scheduled(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_matching_scheduled(boolean) TO service_role;

COMMENT ON FUNCTION public.run_matching_scheduled(boolean) IS
  'Scheduled matching entry: honours nightly_matching_enabled; when the batch throws, records a matching_runs row with status ''failed'' and the error text in notes instead of raising. Not callable via the API.';

COMMENT ON COLUMN public.matching_runs.status IS
  '''running'' | ''completed'' | ''failed'' (the scheduled run caught an error; the text is in notes).';
