-- pgTAP: administrators do not write optional fields, and a Validated
-- relationship is visible to tree viewers
-- (20261122130000_admin_optional_read_only_validated_visible).
BEGIN;
SELECT plan(10);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-0000000000a7', 'admin-f31@test.juthoor',  'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-0000000000a7', 'owner-f31@test.juthoor',  'authenticated', 'authenticated'),
  ('a3000000-0000-0000-0000-0000000000a7', 'viewer-f31@test.juthoor', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, is_admin) VALUES
  ('a1000000-0000-0000-0000-0000000000a7', true)
ON CONFLICT (id) DO UPDATE SET is_admin = EXCLUDED.is_admin;

INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('b1000000-0000-0000-0000-0000000000a7', 'Public tree F31', 'a2000000-0000-0000-0000-0000000000a7', true);

-- Two living people in the owner's tree; only the first has a profile row.
INSERT INTO public.persons (id, tree_id, gender, display_name_en, created_by) VALUES
  ('c1000000-0000-0000-0000-0000000000a7', 'b1000000-0000-0000-0000-0000000000a7', 'M', 'Husband F31',
   'a2000000-0000-0000-0000-0000000000a7'),
  ('c2000000-0000-0000-0000-0000000000a7', 'b1000000-0000-0000-0000-0000000000a7', 'F', 'Wife F31',
   'a2000000-0000-0000-0000-0000000000a7');

INSERT INTO public.person_profiles (person_id, occupation) VALUES
  ('c1000000-0000-0000-0000-0000000000a7', 'Teacher');

-- An open dispute, which stays private.
INSERT INTO public.relationship_disputes (tree_id, person_a, person_b, relation_type, status, raised_by) VALUES
  ('b1000000-0000-0000-0000-0000000000a7', 'c1000000-0000-0000-0000-0000000000a7',
   'c2000000-0000-0000-0000-0000000000a7', 'sibling', 'open', 'a2000000-0000-0000-0000-0000000000a7');

SET LOCAL role authenticated;

-- ── as a Platform Administrator ─────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);

SELECT is(
  public.can_edit_optional_person_fields('c1000000-0000-0000-0000-0000000000a7'),
  false, 'an administrator is not an optional-field editor');

SELECT throws_ok(
  $$ INSERT INTO public.person_profiles (person_id, occupation)
     VALUES ('c2000000-0000-0000-0000-0000000000a7', 'Added by admin') $$,
  '42501', NULL,
  'an administrator cannot add a profile row for a person in someone else''s tree');

-- Blocked by the update rule: no row matches, so nothing changes (checked below).
UPDATE public.person_profiles SET occupation = 'Changed by admin'
 WHERE person_id = 'c1000000-0000-0000-0000-0000000000a7';

SELECT is(
  (SELECT occupation FROM public.get_person_story('c1000000-0000-0000-0000-0000000000a7')),
  'Teacher', 'an administrator can still read the profile, and the update changed nothing');

-- ── as the tree owner ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);

SELECT is(
  public.can_edit_optional_person_fields('c1000000-0000-0000-0000-0000000000a7'),
  true, 'the tree owner is still an optional-field editor for a living unclaimed person');

SELECT lives_ok(
  $$ UPDATE public.person_profiles SET occupation = 'Farmer'
      WHERE person_id = 'c1000000-0000-0000-0000-0000000000a7' $$,
  'the tree owner can update the profile');

SELECT is(
  (SELECT occupation FROM public.get_person_story('c1000000-0000-0000-0000-0000000000a7')),
  'Farmer', 'the owner''s update was saved');

SELECT is(
  (public.validate_relationship('b1000000-0000-0000-0000-0000000000a7',
     'c1000000-0000-0000-0000-0000000000a7', 'c2000000-0000-0000-0000-0000000000a7', 'spouse', NULL)).status,
  'validated', 'the owner marks the relationship Validated');

-- ── as a signed-in visitor of the public tree ───────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a3000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.relationship_disputes
    WHERE tree_id = 'b1000000-0000-0000-0000-0000000000a7' AND status = 'validated'),
  1, 'a visitor of the tree can see that the relationship is Validated');
SELECT is(
  (SELECT count(*)::int FROM public.relationship_disputes
    WHERE tree_id = 'b1000000-0000-0000-0000-0000000000a7' AND status = 'open'),
  0, 'a visitor still cannot see an open dispute');

RESET role;

SELECT is(
  (SELECT count(*)::int FROM public.person_profiles
    WHERE person_id = 'c2000000-0000-0000-0000-0000000000a7'),
  0, 'no profile row was created by the administrator');

SELECT * FROM finish();
ROLLBACK;
