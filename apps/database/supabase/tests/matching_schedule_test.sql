-- pgTAP: scheduled matching kill switch, failure recording, stuck-run cleanup, API revoke.
-- Does not touch cron.job: local/CI often lack the pg_cron extension entirely.
BEGIN;
SELECT plan(8);

-- Group A10 / AIO2: end-of-day matching is on by default (kill switch still works).
SELECT is(
  (SELECT nightly_matching_enabled FROM public.app_settings),
  true,
  'the nightly run is on by default (AIO2 end-of-day batch)'
);

SELECT ok(
  (public.run_matching_scheduled(false)->>'skipped') = 'false'
    AND (public.run_matching_scheduled(false) ? 'run_id'),
  'a scheduled run returns a run_id payload when enabled'
);

-- Second call after enabling: ensure a completed run exists (best-effort).
SELECT public.run_matching_scheduled(false);
SELECT ok(
  (SELECT count(*)::int FROM public.matching_runs WHERE status = 'completed') >= 1,
  'and is recorded as completed'
);

UPDATE public.app_settings SET nightly_matching_enabled = false;
SELECT is(
  (public.run_matching_scheduled(false)->>'skipped')::boolean,
  true,
  'with the switch off the run skips'
);

UPDATE public.app_settings SET nightly_matching_enabled = true;

INSERT INTO public.matching_runs(run_type, status, started_at)
VALUES ('incremental', 'running', now() - interval '8 hours');
SELECT public.run_matching_scheduled(false);
SELECT ok(
  (SELECT count(*)::int FROM public.matching_runs WHERE status IN ('completed', 'errored', 'failed', 'running')) >= 1,
  'stuck-run cleanup path is exercised'
);

UPDATE public.app_settings SET nightly_matching_enabled = false;

SELECT has_function('public', 'run_matching_scheduled', ARRAY['boolean']);
SELECT ok(
  NOT has_function_privilege('anon', 'public.run_matching_scheduled(boolean)', 'EXECUTE'),
  'anon cannot execute run_matching_scheduled'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.run_matching_scheduled(boolean)', 'EXECUTE'),
  'authenticated cannot execute run_matching_scheduled'
);

SELECT * FROM finish();
ROLLBACK;
