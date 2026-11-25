-- ============================================================================
-- Matching P2 (1/4): review score floor (2026-11-25)
-- ============================================================================
-- Pending pairs scoring below app_settings.review_score_floor (default 30) are
-- noise for a reviewer. They stay in public.matches, and the batch keeps
-- re-scoring every pending pair, so a pair that later scores higher shows up
-- by itself. Below the floor a pending pair is:
--   * left out of the admin review queue (admin_review_queue); the admin can
--     list the hidden pairs instead, and admin_review_hidden_count says how
--     many there are;
--   * not handed to the tree owners: resolve_match refuses the two decisions
--     that create owner hints, auto_link_match does not link it, and the
--     owners' masked card view skips it.
-- Deferred pairs are not affected: a person already looked at them.
-- auto_merge_enabled and nightly_matching_enabled are not touched.
-- ============================================================================

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS review_score_floor integer NOT NULL DEFAULT 30
    CHECK (review_score_floor BETWEEN 0 AND 100);

COMMENT ON COLUMN public.app_settings.review_score_floor IS
  'Pending matches scoring below this (AIO-100 points) are hidden from the admin review queue and never become owner hints. They stay stored and are re-scored by every batch.';

-- ── The rule, in one place ──────────────────────────────────────────────────
-- SECURITY DEFINER: the owners' card view calls it as the signed-in owner, and
-- app_settings is readable by admins only.
CREATE OR REPLACE FUNCTION public.match_below_review_floor(
  p_status public.match_status,
  p_score integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_status = 'pending'
    AND p_score < (SELECT s.review_score_floor FROM public.app_settings s LIMIT 1),
    false);
$$;

REVOKE ALL ON FUNCTION public.match_below_review_floor(public.match_status, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_below_review_floor(public.match_status, integer)
  TO authenticated, service_role;

-- ── Admin review queue ──────────────────────────────────────────────────────
-- SECURITY INVOKER: public.matches is readable by admins only (RLS), so anyone
-- else gets no rows.
--   p_hidden = false: the queue (pending at or above the floor, plus deferred).
--   p_hidden = true:  only the pending pairs hidden by the floor.
CREATE OR REPLACE FUNCTION public.admin_review_queue(
  p_hidden boolean DEFAULT false,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  person_a_id uuid,
  person_b_id uuid,
  confidence_score integer,
  status public.match_status,
  score_breakdown jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT m.id, m.person_a_id, m.person_b_id, m.confidence_score, m.status,
         m.score_breakdown, m.created_at
  FROM public.matches m
  WHERE m.status IN ('pending', 'deferred')
    AND public.match_below_review_floor(m.status, m.confidence_score) = COALESCE(p_hidden, false)
  ORDER BY m.confidence_score DESC, m.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.admin_review_queue(boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_queue(boolean, integer, integer)
  TO authenticated, service_role;

-- How many pairs the floor hides, and the floor itself (one row). SECURITY
-- INVOKER: a non-admin reads neither table, so gets 0 and NULL.
CREATE OR REPLACE FUNCTION public.admin_review_hidden_count()
RETURNS TABLE (hidden_count integer, review_score_floor integer)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT count(*)::integer FROM public.matches m
           WHERE public.match_below_review_floor(m.status, m.confidence_score)),
         (SELECT s.review_score_floor FROM public.app_settings s LIMIT 1);
$$;

REVOKE ALL ON FUNCTION public.admin_review_hidden_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_hidden_count() TO authenticated, service_role;

-- ── resolve_match: body of 20260711130000 plus the floor check ──────────────
CREATE OR REPLACE FUNCTION public.resolve_match(p_match_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.matches%ROWTYPE;
  v_one boolean; v_both boolean;
  v_owner_a uuid; v_owner_b uuid;
  v_link uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approve','reject','defer') THEN
    RAISE EXCEPTION 'invalid_decision:%', p_decision USING ERRCODE = '22023';
  END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT one_living, both_living INTO v_one, v_both FROM public.match_living_flags(p_match_id);
  v_owner_a := public.match_person_owner(m.person_a_id);
  v_owner_b := public.match_person_owner(m.person_b_id);

  -- A pending pair below the review floor is not handed to the tree owners.
  -- These are the two decisions that create owner hints (a both-living pair
  -- never reaches owners, and a reject is always possible).
  IF public.match_below_review_floor(m.status, m.confidence_score) AND NOT v_both
     AND (p_decision = 'defer' OR (p_decision = 'approve' AND v_one)) THEN
    RAISE EXCEPTION 'below_review_floor' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'reject' THEN
    -- note first so the AFTER UPDATE OF status trigger captures it in match_audit.
    UPDATE public.matches SET notes = p_note WHERE id = p_match_id;
    UPDATE public.matches SET status = 'admin_rejected', reviewed_by = auth.uid(), reviewed_at = now()
      WHERE id = p_match_id;
    UPDATE public.person_links SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
      WHERE person_a_id = m.person_a_id AND person_b_id = m.person_b_id AND status = 'proposed';
    RETURN;
  END IF;

  IF p_decision = 'defer' THEN
    UPDATE public.matches SET notes = p_note WHERE id = p_match_id;
    UPDATE public.matches SET status = 'deferred', reviewed_by = auth.uid(), reviewed_at = now()
      WHERE id = p_match_id;
    -- living↔living never reaches owners (§5.2); otherwise hand to owner hints.
    IF NOT v_both THEN
      INSERT INTO public.match_hints(match_id, owner_user_id, counterpart_person_id)
        VALUES (p_match_id, v_owner_a, m.person_b_id), (p_match_id, v_owner_b, m.person_a_id)
        ON CONFLICT (match_id, owner_user_id) DO NOTHING;
      PERFORM public.create_match_notification(v_owner_a, 'connection_review', p_match_id, NULL, v_one);
      PERFORM public.create_match_notification(v_owner_b, 'connection_review', p_match_id, NULL, v_one);
    END IF;
    RETURN;
  END IF;

  -- p_decision = 'approve'
  UPDATE public.matches SET notes = p_note WHERE id = p_match_id;
  UPDATE public.matches SET status = 'admin_approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_match_id;

  IF v_one THEN
    -- a living person is involved → NEVER fuse on admin authority; require dual-owner
    -- confirmation. Create a proposed link; both-living stays admin-only (no owners).
    INSERT INTO public.person_links(person_a_id, person_b_id, status, link_type,
        source_match_id, confidence_score, source)
      VALUES (m.person_a_id, m.person_b_id, 'proposed', 'same_as', p_match_id, m.confidence_score, 'admin')
      ON CONFLICT (person_a_id, person_b_id) DO UPDATE SET source_match_id = EXCLUDED.source_match_id
      RETURNING id INTO v_link;
    INSERT INTO public.merge_log(action, person_link_id, match_id, actor_user_id, actor_role, after_state)
      VALUES ('link', v_link, p_match_id, auth.uid(), 'admin',
              jsonb_build_object('status','proposed','reason','living_requires_dual_owner'));
    IF NOT v_both THEN
      INSERT INTO public.match_hints(match_id, owner_user_id, counterpart_person_id)
        VALUES (p_match_id, v_owner_a, m.person_b_id), (p_match_id, v_owner_b, m.person_a_id)
        ON CONFLICT (match_id, owner_user_id) DO NOTHING;
      PERFORM public.create_match_notification(v_owner_a, 'connection_review', p_match_id, v_link, true);
      PERFORM public.create_match_notification(v_owner_b, 'connection_review', p_match_id, v_link, true);
    END IF;
  ELSE
    -- both deceased → an admin may fuse directly.
    INSERT INTO public.person_links(person_a_id, person_b_id, status, link_type,
        source_match_id, confidence_score, source, reviewed_by, reviewed_at)
      VALUES (m.person_a_id, m.person_b_id, 'confirmed', 'same_as', p_match_id, m.confidence_score,
              'admin', auth.uid(), now())
      ON CONFLICT (person_a_id, person_b_id) DO UPDATE
        SET status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(),
            source_match_id = EXCLUDED.source_match_id
      RETURNING id INTO v_link;
    INSERT INTO public.merge_log(action, person_link_id, match_id, actor_user_id, actor_role, after_state)
      VALUES ('confirm', v_link, p_match_id, auth.uid(), 'admin', jsonb_build_object('status','confirmed'));
    PERFORM public.enqueue_overlay_refresh('admin_confirm', v_link);
    PERFORM public.create_match_notification(v_owner_a, 'connection_confirmed', p_match_id, v_link, false);
    PERFORM public.create_match_notification(v_owner_b, 'connection_confirmed', p_match_id, v_link, false);
  END IF;
END $$;

-- ── auto_link_match: body of 20261107175000 plus the floor check ────────────
CREATE OR REPLACE FUNCTION public.auto_link_match(p_match_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.matches%ROWTYPE;
  v_link uuid;
  v_owner_a uuid; v_owner_b uuid;
  v_id_match text;
  v_id_evidence boolean;
BEGIN
  -- only a still-pending match can auto-link: a human decision or an earlier link wins.
  SELECT * INTO m FROM public.matches WHERE id = p_match_id AND status = 'pending';
  IF m.id IS NULL THEN RETURN NULL; END IF;

  -- A pair below the review floor is never linked or shown to the owners.
  IF public.match_below_review_floor(m.status, m.confidence_score) THEN RETURN NULL; END IF;

  v_id_match := m.score_breakdown -> 'meta' ->> 'identifier_match';
  v_id_evidence := COALESCE((m.score_breakdown -> 'meta' ->> 'identifier_evidence')::boolean, false);

  -- D8: UNRWA perfect-match is not eligible for auto-link without card evidence.
  IF v_id_match = 'unrwa_registration' AND NOT v_id_evidence THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.person_links(person_a_id, person_b_id, status, link_type,
      source_match_id, confidence_score, source, reviewed_at)
    VALUES (m.person_a_id, m.person_b_id, 'confirmed', 'same_as', m.id, m.confidence_score, 'system', now())
    ON CONFLICT (person_a_id, person_b_id) DO NOTHING
    RETURNING id INTO v_link;
  -- a link already exists for this pair (confirmed, or revoked by a person): leave it alone.
  IF v_link IS NULL THEN RETURN NULL; END IF;

  UPDATE public.matches SET status = 'auto_merged', reviewed_at = now() WHERE id = m.id;
  INSERT INTO public.merge_log(action, person_link_id, match_id, actor_role, after_state)
    VALUES ('confirm', v_link, m.id, 'system',
            jsonb_build_object('status', 'confirmed', 'via', 'auto_link'));
  PERFORM public.enqueue_overlay_refresh('auto_link', v_link);

  v_owner_a := public.match_person_owner(m.person_a_id);
  v_owner_b := public.match_person_owner(m.person_b_id);
  INSERT INTO public.match_hints(match_id, owner_user_id, counterpart_person_id, status)
    VALUES (m.id, v_owner_a, m.person_b_id, 'accepted'), (m.id, v_owner_b, m.person_a_id, 'accepted')
    ON CONFLICT (match_id, owner_user_id) DO NOTHING;
  PERFORM public.create_auto_link_notification(v_owner_a, m.id, v_link);
  IF v_owner_b IS DISTINCT FROM v_owner_a THEN
    PERFORM public.create_auto_link_notification(v_owner_b, m.id, v_link);
  END IF;
  RETURN v_link;
END $$;

-- ── match_review_cards: definition of 20260711120000 plus one filter ────────
-- The owners' only read onto a match. A pending pair below the review floor is
-- shown to admins only.
CREATE OR REPLACE VIEW public.match_review_cards
WITH (security_invoker = false, security_barrier = true) AS
WITH perspectives AS (
  SELECT m.id AS match_id, m.confidence_score, m.status, m.score_breakdown,
         m.created_at, m.updated_at,
         m.person_a_id AS viewer_person_id, m.person_b_id AS counterpart_person_id
  FROM public.matches m
  UNION ALL
  SELECT m.id, m.confidence_score, m.status, m.score_breakdown,
         m.created_at, m.updated_at,
         m.person_b_id, m.person_a_id
  FROM public.matches m
),
base AS (
  SELECT p.*,
         vp.tree_id AS viewer_tree_id,
         vp.display_name_ar AS viewer_name_ar,
         vp.display_name_en AS viewer_name_en,
         cp.display_name_ar AS cp_name_ar,
         cp.display_name_en AS cp_name_en,
         ct.is_public       AS cp_tree_public,
         public.is_person_living(p.viewer_person_id)     AS viewer_living,
         public.is_person_living(p.counterpart_person_id) AS cp_living,
         cf.birth_year      AS cp_birth_year,
         cpl.name_ar        AS cp_place_ar,
         cpl.name_en        AS cp_place_en
  FROM perspectives p
  JOIN public.persons vp ON vp.id = p.viewer_person_id
  JOIN public.persons cp ON cp.id = p.counterpart_person_id
  JOIN public.trees   vt ON vt.id = vp.tree_id
  JOIN public.trees   ct ON ct.id = cp.tree_id
  LEFT JOIN public.match_features cf ON cf.person_id = p.counterpart_person_id
  LEFT JOIN public.places cpl ON cpl.id = COALESCE(cf.origin_place_id, cf.birth_place_id)
  WHERE public.is_admin()
     OR (public.can_write_tree(vt.id)
         AND NOT public.match_below_review_floor(p.status, p.confidence_score))
)
SELECT
  b.match_id, b.confidence_score, b.status, b.created_at, b.updated_at,
  b.viewer_person_id, b.viewer_name_ar, b.viewer_name_en,
  b.counterpart_person_id,
  b.cp_living AS counterpart_is_living,
  (b.viewer_living OR b.cp_living) AS living_involved,
  -- reveal counterparty detail only for a deceased public person AND only when
  -- neither side is living.
  (NOT b.cp_living AND b.cp_tree_public AND NOT b.viewer_living) AS counterpart_revealed,
  CASE WHEN (NOT b.cp_living AND b.cp_tree_public AND NOT b.viewer_living)
       THEN FALSE ELSE TRUE END AS counterpart_masked,
  CASE WHEN (NOT b.cp_living AND b.cp_tree_public AND NOT b.viewer_living)
       THEN left(COALESCE(b.cp_name_en, b.cp_name_ar, '?'), 1) || '.' END AS counterpart_initials,
  CASE WHEN (NOT b.cp_living AND b.cp_tree_public AND NOT b.viewer_living)
       THEN b.cp_place_ar END AS counterpart_district_ar,
  CASE WHEN (NOT b.cp_living AND b.cp_tree_public AND NOT b.viewer_living)
       THEN b.cp_place_en END AS counterpart_district_en,
  CASE WHEN (NOT b.cp_living AND b.cp_tree_public AND NOT b.viewer_living) AND b.cp_birth_year IS NOT NULL
       THEN (b.cp_birth_year / 10) * 10 END AS counterpart_decade,
  CASE WHEN (NOT b.cp_living AND b.cp_tree_public AND NOT b.viewer_living)
       THEN left(COALESCE(b.cp_name_en, b.cp_name_ar, '?'), 1) || '. '
            || COALESCE(b.cp_place_ar, '')
            || COALESCE(' — ' || ((b.cp_birth_year / 10) * 10)::text || 's', '')
       ELSE 'فردٌ محجوب' END AS counterpart_label_ar,
  CASE WHEN (NOT b.cp_living AND b.cp_tree_public AND NOT b.viewer_living)
       THEN left(COALESCE(b.cp_name_en, b.cp_name_ar, '?'), 1) || '. '
            || COALESCE(b.cp_place_en, b.cp_place_ar, '')
            || COALESCE(' — ' || ((b.cp_birth_year / 10) * 10)::text || 's', '')
       ELSE 'Hidden relative' END AS counterpart_label_en,
  -- field agreement suppressed entirely when a living person is involved.
  CASE WHEN (b.viewer_living OR b.cp_living) THEN NULL
       ELSE public.match_field_agreement(b.score_breakdown) END AS field_agreement
FROM base b;
