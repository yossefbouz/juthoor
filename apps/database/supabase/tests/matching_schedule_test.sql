-- pgTAP: scheduled matching kill switch, failure recording, stuck-run cleanup, API revoke.
BEGIN;
SELECT plan(10);

SELECT is(
  (SELECT nightly_matching_enabled FROM public.app_settings),
  true,
  'the nightly run is on by default'
);
SELECT isnt(public.run_matching_scheduled(false), NULL, 'a scheduled run returns its run id');
SELECT is(
  (SELECT count(*)::int FROM public.matching_runs WHERE status = 'completed'),
  1,
  'and is recorded as completed'
);

UPDATE public.app_settings SET nightly_matching_enabled = false;
SELECT is(public.run_matching_scheduled(false), NULL, 'with the switch off the run does nothing');
SELECT is(
  (SELECT count(*)::int FROM public.matching_runs),
  1,
  'and leaves no run behind'
);
UPDATE public.app_settings SET nightly_matching_enabled = true;

INSERT INTO public.matching_runs(run_type, status, started_at)
VALUES ('incremental', 'running', now() - interval '8 hours');
SELECT public.run_matching_scheduled(false);
SELECT is(
  (SELECT count(*)::int FROM public.matching_runs WHERE status = 'running'),
  0,
  'a run stuck for hours is closed'
);

CREATE OR REPLACE FUNCTION public.refresh_match_features_batch() RETURNS int
LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'boom'; END $f$;
SELECT is(public.run_matching_scheduled(false), NULL, 'a failing batch returns no run id');
SELECT is(
  (SELECT notes FROM public.matching_runs WHERE status = 'errored' AND notes = 'boom'),
  'boom',
  'and the failure is recorded in matching_runs'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  OR (
    SELECT count(*) FROM cron.job
    WHERE jobname IN ('juthoor_nightly_match', 'juthoor_weekly_full')
  ) = 2,
  'the nightly and weekly jobs are scheduled when pg_cron is available'
);

SET LOCAL role authenticated;
SELECT throws_ok(
  $$ SELECT public.run_matching_scheduled(false) $$,
  '42501',
  NULL,
  'an API caller cannot run the scheduled matching'
);
RESET ROLE;

SELECT finish();
ROLLBACK;
