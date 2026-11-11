-- pgTAP: the base public.matches table is admin-only (M0 security fix, plan §5.4).
-- Proves a non-admin authenticated user — even the OWNER of a PUBLIC tree that
-- contains a matched person (the exact leak vector of the old policy) — reads
-- zero rows, while an admin reads the row.
BEGIN;
SELECT plan(4);

-- ── Fixtures (run as the pg_prove superuser, which bypasses RLS) ────────────
-- Two users; the on_auth_user_created trigger auto-creates their profiles rows.
INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@test.juthoor', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'owner@test.juthoor', 'authenticated', 'authenticated');

UPDATE public.profiles SET is_admin = true  WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET is_admin = false WHERE id = '22222222-2222-2222-2222-222222222222';

-- A PUBLIC tree owned by the non-admin — under the old policy can_access_tree()
-- was true for everyone here, which is what leaked the match.
INSERT INTO public.trees (id, name, owner_id, is_public)
VALUES ('33333333-3333-3333-3333-333333333333', 'Test Tree', '22222222-2222-2222-2222-222222222222', true);

INSERT INTO public.persons (id, tree_id, gender)
VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'M'),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'F');

INSERT INTO public.matches (person_a_id, person_b_id, confidence_score, status)
VALUES ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', 470, 'pending');

-- ── Act as the NON-admin public-tree owner ─────────────────────────────────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.matches),
  0,
  'non-admin public-tree owner reads 0 rows from matches (leak closed)'
);

-- ── Act as an admin ────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.matches
    WHERE person_a_id = '44444444-4444-4444-4444-444444444444'
      AND person_b_id = '55555555-5555-5555-5555-555555555555'),
  1,
  'admin reads the match row'
);

-- ── Policy shape ───────────────────────────────────────────────────────────
RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matches'
      AND policyname = 'matches_select'),
  0,
  'the leaky matches_select policy is gone'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matches'
      AND policyname = 'matches_select_admin_only'),
  1,
  'the admin-only matches_select_admin_only policy exists'
);

SELECT finish();
ROLLBACK;
