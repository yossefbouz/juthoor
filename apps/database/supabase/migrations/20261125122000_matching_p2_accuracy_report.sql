-- ============================================================================
-- Matching P2 (3/4): precision and recall per score threshold (2026-11-25)
-- ============================================================================
-- Uses the labelled pairs of the evaluation harness (public.eval_pairs, label
-- 'match' = same person, 'non_match' = not the same). For every threshold from
-- 0 to 100 it says what would happen if every pair scoring at or above the
-- threshold were treated as the same person:
--   precision = right ones among the pairs at or above the threshold
--   recall    = same-person pairs found, out of all labelled same-person pairs
-- The people in the labelled pairs get their match features rebuilt first, so
-- the numbers describe today's records and today's scorer (score_pair_impl,
-- the one the batch uses). Nothing is seeded here. See docs/MATCHING_ACCURACY.md.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_accuracy_report(p_holdout boolean DEFAULT false)
RETURNS TABLE (
  threshold integer,
  true_positives integer,
  false_positives integer,
  false_negatives integer,
  true_negatives integer,
  "precision" numeric,
  recall numeric
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A caller coming through the API as a user (role authenticated or anon) must
  -- be an admin. The SQL editor and the service role are let through. The role
  -- setting is the caller's: SECURITY DEFINER does not change it.
  IF NOT public.is_admin()
     AND COALESCE(current_setting('role', true), '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM public.refresh_match_features(x.pid)
    FROM (SELECT ep.person_a_id AS pid FROM public.eval_pairs ep
           WHERE ep.is_holdout = COALESCE(p_holdout, false)
          UNION
          SELECT ep.person_b_id FROM public.eval_pairs ep
           WHERE ep.is_holdout = COALESCE(p_holdout, false)) x;

  RETURN QUERY
  WITH scored AS MATERIALIZED (
    SELECT ep.label AS lbl,
           (SELECT s.score FROM public.score_pair_impl(ep.person_a_id, ep.person_b_id) s) AS sc
    FROM public.eval_pairs ep
    WHERE ep.is_holdout = COALESCE(p_holdout, false)
  ),
  counts AS (
    SELECT t.th,
           (count(*) FILTER (WHERE s.lbl = 'match'     AND s.sc >= t.th))::integer AS tp,
           (count(*) FILTER (WHERE s.lbl = 'non_match' AND s.sc >= t.th))::integer AS fp,
           (count(*) FILTER (WHERE s.lbl = 'match'     AND s.sc <  t.th))::integer AS fn,
           (count(*) FILTER (WHERE s.lbl = 'non_match' AND s.sc <  t.th))::integer AS tn
    FROM generate_series(0, 100) AS t(th)
    LEFT JOIN scored s ON true
    GROUP BY t.th
  )
  SELECT c.th, c.tp, c.fp, c.fn, c.tn,
         CASE WHEN c.tp + c.fp = 0 THEN NULL ELSE round(c.tp::numeric / (c.tp + c.fp), 4) END,
         CASE WHEN c.tp + c.fn = 0 THEN NULL ELSE round(c.tp::numeric / (c.tp + c.fn), 4) END
  FROM counts c
  ORDER BY c.th;
END;
$$;

REVOKE ALL ON FUNCTION public.match_accuracy_report(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_accuracy_report(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.match_accuracy_report(boolean) IS
  'Admin only. Precision and recall of the matching score at every threshold 0..100, measured on the labelled pairs in eval_pairs (p_holdout picks the held-out pairs instead of the tuning pairs). precision is NULL when no pair reaches the threshold.';
