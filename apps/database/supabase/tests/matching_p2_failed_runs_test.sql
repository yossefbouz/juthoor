-- pgTAP: matching P2, a failed scheduled run leaves a record (20261125123000_matching_p2_failed_runs).
BEGIN;
SELECT plan(14);

SELECT is((SELECT nightly_matching_enabled FROM public.app_settings), false,
  'nightly matching is off by default');
SELECT is((SELECT auto_merge_enabled FROM public.app_settings), false,
  'automatic linking is off by default');

-- ── switch off: nothing runs, nothing is recorded ───────────────────────────
CREATE TEMP TABLE _before AS SELECT count(*)::int AS n FROM public.matching_runs;
SELECT is((public.run_matching_scheduled(true) ->> 'skipped')::boolean, true,
  'with the switch off the scheduled run skips');
SELECT is((SELECT count(*)::int FROM public.matching_runs), (SELECT n FROM _before),
  'and records nothing');

-- ── switch on (this transaction only): a good run is unchanged ──────────────
UPDATE public.app_settings SET nightly_matching_enabled = true;
CREATE TEMP TABLE _good AS SELECT public.run_matching_scheduled(true) AS r;
SELECT ok(
  (SELECT NOT (r ? 'failed') AND (r ->> 'skipped') = 'false' FROM _good),
  'a run that succeeds reports no failure');
SELECT is((SELECT count(*)::int FROM public.matching_runs WHERE status = 'failed'), 0,
  'and leaves no failed row');

-- ── the batch throws ────────────────────────────────────────────────────────
-- Stand-in batch for the rest of this transaction: it starts a run row like the
-- real one, then fails.
CREATE OR REPLACE FUNCTION public.run_matching_batch(p_full boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run uuid;
BEGIN
  INSERT INTO public.matching_runs(run_type, status)
    VALUES (CASE WHEN p_full THEN 'full' ELSE 'incremental' END, 'running')
    RETURNING id INTO v_run;
  RAISE EXCEPTION 'boom in the batch' USING ERRCODE = 'P0001';
END $$;

CREATE TEMP TABLE _bad AS SELECT public.run_matching_scheduled(true) AS r;

SELECT is((SELECT (r ->> 'failed')::boolean FROM _bad), true,
  'the scheduled run does not raise; it reports the failure');
SELECT is((SELECT count(*)::int FROM public.matching_runs WHERE status = 'failed'), 1,
  'and leaves one matching_runs row with status failed');
SELECT ok(
  (SELECT notes LIKE '%boom in the batch%' FROM public.matching_runs WHERE status = 'failed'),
  'with the error text in notes');
SELECT ok(
  (SELECT notes LIKE '%P0001%' FROM public.matching_runs WHERE status = 'failed'),
  'and the error code');
SELECT ok(
  (SELECT finished_at IS NOT NULL AND errored = 1 AND run_type = 'full'
     FROM public.matching_runs WHERE status = 'failed'),
  'the row is closed (finished_at), counts one error and keeps the run type');
SELECT is(
  (SELECT (r ->> 'run_id')::uuid FROM _bad),
  (SELECT id FROM public.matching_runs WHERE status = 'failed'),
  'the returned run_id is the failed row');
SELECT is((SELECT count(*)::int FROM public.matching_runs WHERE status = 'running'), 0,
  'the half-finished running row of the failed batch is not left behind');

-- ── still not callable through the API ──────────────────────────────────────
SELECT ok(
  NOT has_function_privilege('anon', 'public.run_matching_scheduled(boolean)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.run_matching_scheduled(boolean)', 'EXECUTE'),
  'anon and signed-in users cannot run the scheduled matcher');

SELECT * FROM finish();
ROLLBACK;
