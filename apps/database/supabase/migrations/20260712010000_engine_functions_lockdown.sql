-- Post-live-apply hardening (advisor follow-up to the M1–M3 feature apply).
--
-- Two privilege leaks combine on function creation:
--   1. Postgres grants EXECUTE on every new function to PUBLIC by default, and
--   2. Supabase's default privileges ALSO grant directly to anon/authenticated
--      (and SELECT on new views/matviews).
-- So `REVOKE … FROM anon` alone is ineffective while PUBLIC still carries the
-- right, and `REVOKE … FROM PUBLIC` alone leaves the direct role grants. Both
-- must be revoked. Lockdown policy:
--   • engine-internal functions → PUBLIC/anon/authenticated all revoked;
--     service_role re-granted explicitly (batch/cron/Vercel-fallback path);
--   • user-facing self-authorizing DEFINER RPCs → authenticated only;
--   • person_identity_groups (the linkage graph) → no client role;
--   • the two deliberately-DEFINER views → authenticated only (they self-filter
--     by auth.uid(); the advisor's security_definer_view ERROR on them is
--     ACCEPTED BY DESIGN — the admin-only matches RLS mandates a definer view,
--     and pgTAP proves the internal filter).

-- ── engine-internal: no client role may execute ──────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.enqueue_match_features_dirty(uuid)',
    'public.refresh_match_features(uuid)',
    'public.refresh_match_features_batch()',
    'public.refresh_match_block_keys(boolean)',
    'public.generate_match_candidates(int)',
    'public.run_matching_batch(boolean)',
    'public.run_eval(text)',
    'public.match_resolve_parents(uuid)',
    'public.mf_given_norm(uuid)',
    'public.mf_given_phon(uuid)',
    'public.mf_surname_norm(uuid)',
    'public.mf_surname_phon(uuid)',
    'public.match_person_owner(uuid)',
    'public.match_living_flags(uuid)',
    'public.create_match_notification(uuid, text, uuid, uuid, boolean)',
    'public.enqueue_overlay_refresh(text, uuid)',
    'public.drain_overlay_refresh()',
    'public.refresh_person_identity_groups(boolean)',
    'public.trg_mf_persons()',
    'public.trg_mf_person_id()',
    'public.trg_mf_families()',
    'public.trg_mf_family_children()',
    'public.log_match_status_transition()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- ── user-facing self-authorizing RPCs: authenticated only (never anon/PUBLIC) ─
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.score_pair(uuid, uuid)',
    'public.resolve_match(uuid, text, text)',
    'public.resolve_match_hint(uuid, boolean)',
    'public.confirm_person_link(uuid)',
    'public.reject_person_link(uuid)',
    'public.revoke_person_link(uuid)',
    'public.compute_degrees(uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- ── the linkage graph is never client-readable ───────────────────────────────
REVOKE ALL ON public.person_identity_groups FROM PUBLIC, anon, authenticated;

-- ── deliberately-DEFINER views: authenticated only ───────────────────────────
REVOKE SELECT ON public.match_review_cards   FROM anon;
REVOKE SELECT ON public.v_match_explanations FROM anon;
