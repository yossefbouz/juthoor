-- pgTAP: PR #31 review fixes (20261122120000_pr31_reconcile).
BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-0000000000f1', 'owner-r31@test.juthoor',  'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-0000000000f2', 'collab-r31@test.juthoor', 'authenticated', 'authenticated'),
  ('a3000000-0000-0000-0000-0000000000f3', 'viewer-r31@test.juthoor', 'authenticated', 'authenticated');

INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('b1000000-0000-0000-0000-0000000000f1', 'Public tree R31', 'a1000000-0000-0000-0000-0000000000f1', true),
  ('b2000000-0000-0000-0000-0000000000f2', 'Other tree R31',  'a1000000-0000-0000-0000-0000000000f1', false);

INSERT INTO public.tree_members (tree_id, user_id, role, status) VALUES
  ('b1000000-0000-0000-0000-0000000000f1', 'a2000000-0000-0000-0000-0000000000f2', 'collaborator', 'approved');

-- Two living people in the public tree, one person in the other tree.
INSERT INTO public.persons (id, tree_id, gender, display_name_en, created_by) VALUES
  ('c1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-0000000000f1', 'M', 'Husband R31',
   'a1000000-0000-0000-0000-0000000000f1'),
  ('c2000000-0000-0000-0000-0000000000f2', 'b1000000-0000-0000-0000-0000000000f1', 'F', 'Wife R31',
   'a1000000-0000-0000-0000-0000000000f1'),
  ('c3000000-0000-0000-0000-0000000000f3', 'b2000000-0000-0000-0000-0000000000f2', 'F', 'Elsewhere R31',
   'a1000000-0000-0000-0000-0000000000f1');

INSERT INTO public.person_profiles (person_id, contribution_ar, contribution_consent, occupation) VALUES
  ('c1000000-0000-0000-0000-0000000000f1', 'نص المساهمة', true, 'Teacher');

-- ── 1. Nightly matching is off ──────────────────────────────────────────────
SELECT is(
  (SELECT nightly_matching_enabled FROM public.app_settings LIMIT 1),
  false, 'nightly matching is off');

-- ── 3. The shared "Unknown" place is not evidence ───────────────────────────
SELECT is(
  public.mf_place_pts('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 7),
  0, 'two records that both point at the Unknown place earn no place points');
SELECT is(
  public.mf_place_pts('d1000000-0000-0000-0000-0000000000f1', 'd1000000-0000-0000-0000-0000000000f1', 7),
  7, 'two records with the same real place still earn the place points');

-- ── 4. Perfect match keeps the birth-year-gap veto ──────────────────────────
SELECT is(
  position('IS DISTINCT FROM ''birth_year_gap''' IN
           pg_get_functiondef('public.score_pair_impl(uuid, uuid)'::regprocedure)),
  0, 'score_pair_impl does not filter birth_year_gap out of the perfect-match vetoes');

SET LOCAL role authenticated;

-- ── as the tree owner ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

SELECT lives_ok(
  $$ SELECT * FROM public.create_person_with_primary_name(
       p_tree_id := 'b1000000-0000-0000-0000-0000000000f1', p_gender := 'M',
       p_given_name := 'Sami', p_surname := 'Tester') $$,
  'the tree owner can add a person without an origin');

SELECT is(
  (public.validate_relationship('b1000000-0000-0000-0000-0000000000f1',
     'c1000000-0000-0000-0000-0000000000f1', 'c2000000-0000-0000-0000-0000000000f2', 'spouse', NULL)).id,
  (public.validate_relationship('b1000000-0000-0000-0000-0000000000f1',
     'c1000000-0000-0000-0000-0000000000f1', 'c2000000-0000-0000-0000-0000000000f2', 'spouse', NULL)).id,
  'validating the same relationship twice returns the same row');

SELECT throws_ok(
  $$ SELECT public.validate_relationship('b1000000-0000-0000-0000-0000000000f1',
       'c1000000-0000-0000-0000-0000000000f1', 'c3000000-0000-0000-0000-0000000000f3', 'spouse', NULL) $$,
  'P0001', 'person_b does not belong to tree',
  'a person from another tree cannot be validated in this tree');

SELECT is(
  (SELECT occupation FROM public.get_person_story('c1000000-0000-0000-0000-0000000000f1')),
  'Teacher', 'the tree owner reads a living person''s occupation');

-- ── as a collaborator ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);

SELECT lives_ok(
  $$ SELECT * FROM public.create_person_with_primary_name(
       p_tree_id := 'b1000000-0000-0000-0000-0000000000f1', p_gender := 'F',
       p_given_name := 'Lina', p_surname := 'Tester') $$,
  'a collaborator can add a living person without an origin');

-- ── as a signed-in visitor of the public tree ───────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a3000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);

SELECT is(
  (SELECT occupation FROM public.get_person_story('c1000000-0000-0000-0000-0000000000f1')),
  NULL::text, 'contribution consent does not release a living person''s occupation');
SELECT is(
  (SELECT contribution_ar FROM public.get_person_story('c1000000-0000-0000-0000-0000000000f1')),
  'نص المساهمة', 'the consented contribution text is still shown');

RESET role;

SELECT is(
  (SELECT count(*)::int
     FROM public.events e JOIN public.persons p ON p.id = e.person_id
    WHERE p.tree_id = 'b1000000-0000-0000-0000-0000000000f1'
      AND e.place_id = '00000000-0000-4000-8000-000000000001'),
  0, 'no event was created with the Unknown place');
SELECT is(
  (SELECT count(*)::int FROM public.persons
    WHERE tree_id = 'b1000000-0000-0000-0000-0000000000f1'
      AND display_name_ar IN ('Sami Tester', 'Lina Tester')
      AND needs_completion),
  2, 'both new people are flagged as needing completion');
SELECT is(
  (SELECT count(*)::int FROM public.relationship_disputes
    WHERE tree_id = 'b1000000-0000-0000-0000-0000000000f1' AND status = 'validated'),
  1, 'only one validated row exists for the relationship');

SELECT * FROM finish();
ROLLBACK;
