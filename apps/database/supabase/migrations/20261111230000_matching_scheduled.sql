-- ============================================================================
-- Nightly matching schedule hardening (ported from PR #25, aligned to #26)
-- ============================================================================
-- run_matching_batch already exists. This adds a kill switch, a scheduled wrapper
-- that records failures, and Mon-Sat incremental + Sunday full pg_cron jobs.
-- Auto-merge stays off until app_settings.auto_merge_enabled is flipped.

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS nightly_matching_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.app_settings.nightly_matching_enabled IS
  'Kill switch for run_matching_scheduled. Independent of auto_merge_enabled.';

CREATE OR REPLACE FUNCTION public.run_matching_scheduled(p_full boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enabled boolean;
  v_run uuid;
BEGIN
  SELECT nightly_matching_enabled INTO v_enabled FROM public.app_settings LIMIT 1;
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN NULL;
  END IF;

  UPDATE public.matching_runs
     SET status = 'errored',
         finished_at = now(),
         errored = errored + 1,
         notes = coalesce(notes || ' ', '') || 'never finished'
   WHERE status = 'running'
     AND started_at < now() - interval '6 hours';

  BEGIN
    v_run := public.run_matching_batch(p_full);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.matching_runs(run_type, status, finished_at, errored, notes)
      VALUES (
        CASE WHEN p_full THEN 'full' ELSE 'incremental' END,
        'errored',
        now(),
        1,
        left(SQLERRM, 500)
      );
    RETURN NULL;
  END;

  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION public.run_matching_scheduled(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_matching_scheduled(boolean) FROM anon, authenticated;

COMMENT ON FUNCTION public.run_matching_scheduled(boolean) IS
  'Scheduled matching entry: honours nightly_matching_enabled, closes stuck runs, records batch failures. Not callable via the API.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('juthoor-matching-nightly');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('juthoor_nightly_match');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('juthoor_weekly_full');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'juthoor_nightly_match',
      '30 23 * * 1-6',
      $cron$SELECT public.run_matching_scheduled(false)$cron$
    );
    PERFORM cron.schedule(
      'juthoor_weekly_full',
      '30 23 * * 0',
      $cron$SELECT public.run_matching_scheduled(true)$cron$
    );
    RAISE NOTICE 'Scheduled juthoor_nightly_match + juthoor_weekly_full via pg_cron.';
  ELSE
    RAISE NOTICE 'pg_cron not installed; schedule run_matching_scheduled() externally.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'matching schedule skipped: %', SQLERRM;
END $$;
