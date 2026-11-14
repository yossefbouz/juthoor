-- Behavior checks for Group A (beyond column/policy smoke).
BEGIN;
SELECT plan(8);

-- Fixtures
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-aaaa-4000-8000-0000000000a1', 'admin-ga@test.juthoor', 'authenticated', 'authenticated'),
  ('a2000000-aaaa-4000-8000-0000000000a2', 'owner-ga@test.juthoor', 'authenticated', 'authenticated'),
  ('a3000000-aaaa-4000-8000-0000000000a3', 'outsider-ga@test.juthoor', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, is_admin) VALUES
  ('a1000000-aaaa-4000-8000-0000000000a1', true),
  ('a2000000-aaaa-4000-8000-0000000000a2', false),
  ('a3000000-aaaa-4000-8000-0000000000a3', false)
ON CONFLICT (id) DO UPDATE SET is_admin = EXCLUDED.is_admin;

INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('b1000000-bbbb-4000-8000-0000000000b1', 'GA Tree', 'a2000000-aaaa-4000-8000-0000000000a2', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.persons (id, tree_id, gender, display_name_en) VALUES
  ('c1000000-cccc-4000-8000-0000000000c1', 'b1000000-bbbb-4000-8000-0000000000b1', 'M', 'OwnerPerson'),
  ('c2000000-cccc-4000-8000-0000000000c2', 'b1000000-bbbb-4000-8000-0000000000b1', 'F', 'RelatedPerson')
ON CONFLICT (id) DO NOTHING;

-- A1: admin cannot INSERT into another user's tree via RLS
SELECT set_config('request.jwt.claim.sub', 'a1000000-aaaa-4000-8000-0000000000a1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.persons (tree_id, gender, display_name_en)
    VALUES ('b1000000-bbbb-4000-8000-0000000000b1', 'M', 'AdminShouldFail')$$,
  '42501',
  NULL,
  'A1 admin cannot insert person into foreign tree'
);

RESET ROLE;

-- Owner can insert
SELECT set_config('request.jwt.claim.sub', 'a2000000-aaaa-4000-8000-0000000000a2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO public.persons (tree_id, gender, display_name_en)
    VALUES ('b1000000-bbbb-4000-8000-0000000000b1', 'M', 'OwnerOk')$$,
  'A1 tree owner can insert person'
);

RESET ROLE;

-- A5 validate_relationship as owner
SELECT set_config('request.jwt.claim.sub', 'a2000000-aaaa-4000-8000-0000000000a2', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (public.validate_relationship(
    'b1000000-bbbb-4000-8000-0000000000b1',
    'c1000000-cccc-4000-8000-0000000000c1',
    'c2000000-cccc-4000-8000-0000000000c2',
    'spouse',
    NULL
  )).status,
  'validated',
  'A5 validate_relationship returns validated'
);

RESET ROLE;

-- A8 unknown place
SELECT ok(public.unknown_place_id() IS NOT NULL, 'A8 unknown_place_id');

-- A10 nightly on
SELECT ok(
  (SELECT COALESCE(nightly_matching_enabled, false) FROM public.app_settings LIMIT 1),
  'A10 nightly enabled'
);

-- A6 / A7 columns present (regression if migration rolled back)
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'person_attachments' AND column_name = 'subject_given'
  ),
  'A6 subject_given still present'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'person_profiles' AND column_name = 'hamula_affiliation'
  ),
  'A7 hamula still present'
);

-- A1 select still works for admin
SELECT set_config('request.jwt.claim.sub', 'a1000000-aaaa-4000-8000-0000000000a1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  (
    SELECT count(*) > 0 FROM public.persons
    WHERE tree_id = 'b1000000-bbbb-4000-8000-0000000000b1'
  ),
  'A1 admin can still SELECT persons'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
