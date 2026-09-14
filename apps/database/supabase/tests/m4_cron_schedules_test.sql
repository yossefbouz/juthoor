-- pgTAP: the guarded M4 pg_cron schedules (F4).
-- Must hold in BOTH worlds: where pg_cron runs (local supabase image, live) the
-- 4 juthoor_* jobs exist; where it cannot, the migration must have no-op'd
-- (no cron.job at all) rather than failed.
BEGIN;
SELECT plan(3);

CREATE FUNCTION pg_temp.juthoor_cron_jobs() RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN -1; END IF;  -- pg_cron absent
  EXECUTE 'SELECT count(*) FROM cron.job WHERE jobname LIKE ''juthoor_%''' INTO n;
  RETURN n;
END $$;

SELECT ok(
  pg_temp.juthoor_cron_jobs() IN (-1, 4),
  'guard holds: pg_cron absent (no cron.job) OR exactly the 4 juthoor_* jobs'
);

-- the three functions the jobs invoke must exist regardless of scheduling
SELECT is(
  (SELECT count(DISTINCT proname)::int FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND proname IN ('refresh_match_features_batch','run_matching_batch','run_eval')),
  3, 'the job targets (features batch, matcher, eval) all exist'
);

-- scheduling must never have flipped shadow mode
SELECT is(
  (SELECT auto_merge_enabled FROM public.app_settings LIMIT 1),
  false, 'auto_merge_enabled is still FALSE (shadow mode intact)'
);

SELECT finish();
ROLLBACK;
