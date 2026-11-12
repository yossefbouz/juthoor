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
