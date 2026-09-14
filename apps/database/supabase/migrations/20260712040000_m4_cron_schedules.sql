-- F4: the M4 shadow-period schedules (plan §6 Cron), guarded.
--
-- pg_cron only works when preloaded (shared_preload_libraries) and only in the
-- database named by cron.database_name — true on Supabase live AND the local
-- supabase image, but NOT guaranteed in every environment (CI variants). The
-- whole body is therefore guarded + exception-wrapped: where pg_cron cannot run,
-- this migration is a NOTICE-and-skip no-op and the documented Vercel-cron
-- fallback (/api/cron/run-matching) takes over.
--
-- Jobs (named — pg_cron ≥1.4 upserts by name, so re-running replaces cleanly):
--   juthoor_features_nightly  15 2 * * *    drain the dirty feature queue
--   juthoor_nightly_match     30 23 * * 1-6 incremental shadow batch (Mon–Sat)
--   juthoor_weekly_full       30 23 * * 0   full rebuild + rescore (Sunday)
--   juthoor_weekly_eval       0 1 * * 1     run_eval('frs-v1') (Monday, after the full run)
--
-- All jobs run as the maintenance role inside the DB; run_matching_batch is
-- advisory-locked (key 724242) so pg_cron + the Vercel fallback can never
-- double-run. SHADOW MODE is enforced inside the batch (everything lands
-- 'pending'); these schedules only make the shadow period actually tick.

DO $cron$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_settings
    WHERE name = 'shared_preload_libraries' AND setting LIKE '%pg_cron%'
  ) THEN
    RAISE NOTICE 'pg_cron not preloaded — M4 schedules skipped (use the Vercel fallback /api/cron/run-matching)';
    RETURN;
  END IF;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    PERFORM cron.schedule('juthoor_features_nightly', '15 2 * * *',
      'SELECT public.refresh_match_features_batch()');
    PERFORM cron.schedule('juthoor_nightly_match', '30 23 * * 1-6',
      'SELECT public.run_matching_batch(false)');
    PERFORM cron.schedule('juthoor_weekly_full', '30 23 * * 0',
      'SELECT public.run_matching_batch(true)');
    PERFORM cron.schedule('juthoor_weekly_eval', '0 1 * * 1',
      'SELECT public.run_eval(''frs-v1'')');

    RAISE NOTICE 'M4 schedules installed: 4 juthoor_* pg_cron jobs';
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the migration over scheduling — the fallback route exists.
    RAISE NOTICE 'pg_cron scheduling skipped: % (use the Vercel fallback /api/cron/run-matching)', SQLERRM;
  END;
END $cron$;
