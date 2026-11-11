-- ============================================================================
-- Follow-up: restore score_pair TABLE shape + scheduled wrapper uuid result
-- ============================================================================

DROP FUNCTION IF EXISTS public.score_pair(uuid, uuid);
CREATE OR REPLACE FUNCTION public.score_pair(p_a uuid, p_b uuid)
RETURNS TABLE(score int, breakdown jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT s.score, s.breakdown FROM public.score_pair_impl(p_a, p_b) s;
END;
$$;

REVOKE ALL ON FUNCTION public.score_pair(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.score_pair(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.score_pair(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.score_pair_impl(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.score_pair_impl(uuid, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.run_matching_scheduled(boolean);
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
BEGIN
  SELECT COALESCE(nightly_matching_enabled, false) INTO v_enabled
  FROM public.app_settings LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'nightly_matching_disabled');
  END IF;

  v_dow := EXTRACT(DOW FROM timezone('utc', now()))::int;
  v_full := COALESCE(p_force_full, false) OR (v_dow = 0);
  v_run := public.run_matching_batch(v_full);

  RETURN jsonb_build_object(
    'full', v_full,
    'run_id', v_run,
    'skipped', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_matching_scheduled(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_matching_scheduled(boolean) TO service_role;

-- ── Internal functions: never callable through the API ───────────────────────
-- The blanket loop in 20261112150000 granted authenticated EXECUTE on every
-- SECURITY DEFINER function outside a short list. These have no permission
-- check of their own (teardown_person_link, auto_link_match, the matcher, the
-- notification helpers, private-tree lookups). Every caller is itself a
-- SECURITY DEFINER function or the cron job, so revoking breaks nothing.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'teardown_person_link', 'auto_link_match',
        'run_matching_batch', 'run_matching_scheduled', 'run_eval',
        'refresh_match_features', 'refresh_match_features_batch',
        'refresh_match_block_keys', 'generate_match_candidates',
        'refresh_person_identity_groups', 'drain_overlay_refresh',
        'create_match_notification', 'create_auto_link_notification',
        'match_resolve_parents', 'match_person_owner', 'match_living_flags'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ── Contact key: no public fallback ──────────────────────────────────────────
-- 20261109220000 fell back to a hard-coded string (public in the repo) when the
-- key was blank. Fail loudly instead; 20261112150000 fills a blank key.
CREATE OR REPLACE FUNCTION public.contact_crypto_key()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT NULLIF(btrim(s.contact_crypto_key), '') INTO v_key
  FROM public.app_settings s
  LIMIT 1;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'contact_crypto_key is not configured';
  END IF;
  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.contact_crypto_key() FROM PUBLIC, anon, authenticated;
