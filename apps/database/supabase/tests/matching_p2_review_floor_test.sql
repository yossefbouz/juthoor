-- pgTAP: matching P2 review score floor (20261125120000_matching_p2_review_floor).
BEGIN;
SELECT plan(32);

-- ── settings ────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'review_score_floor'),
  '30', 'app_settings.review_score_floor defaults to 30');
SELECT is((SELECT review_score_floor FROM public.app_settings), 30, 'and the stored floor is 30');
SELECT is((SELECT auto_merge_enabled FROM public.app_settings), false, 'automatic linking is still off');
SELECT is((SELECT nightly_matching_enabled FROM public.app_settings), false, 'nightly matching is still off');
SELECT is(
  (SELECT string_agg(column_default, ',' ORDER BY column_name) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_settings'
      AND column_name IN ('auto_merge_enabled', 'nightly_matching_enabled')),
  'false,false', 'and both switches still default to false');
SELECT throws_ok(
  $$ UPDATE public.app_settings SET review_score_floor = 101 $$,
  '23514', NULL, 'the floor must stay between 0 and 100');

-- ── fixtures: an admin, two owners, two trees, six cross-tree pairs ─────────
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-0000000000a1', 'admin-p2f@test.juthoor',  'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-0000000000a2', 'owner1-p2f@test.juthoor', 'authenticated', 'authenticated'),
  ('a3000000-0000-0000-0000-0000000000a3', 'owner2-p2f@test.juthoor', 'authenticated', 'authenticated');
UPDATE public.profiles SET is_admin = (id = 'a1000000-0000-0000-0000-0000000000a1')
 WHERE id IN ('a1000000-0000-0000-0000-0000000000a1', 'a2000000-0000-0000-0000-0000000000a2',
              'a3000000-0000-0000-0000-0000000000a3');
INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('e1000000-0000-0000-0000-0000000000a1', 'T1 p2f', 'a2000000-0000-0000-0000-0000000000a2', true),
  ('e2000000-0000-0000-0000-0000000000a2', 'T2 p2f', 'a3000000-0000-0000-0000-0000000000a3', true);
INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('1a000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000a1', 'M'),
  ('1a000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-0000000000a1', 'M'),
  ('1a000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-0000000000a1', 'M'),
  ('1a000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-0000000000a1', 'M'),
  ('1a000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-0000000000a1', 'M'),
  ('1a000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-0000000000a1', 'M'),
  ('2b000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-0000000000a2', 'M'),
  ('2b000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-0000000000a2', 'M'),
  ('2b000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-0000000000a2', 'M'),
  ('2b000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-0000000000a2', 'M'),
  ('2b000000-0000-0000-0000-000000000005', 'e2000000-0000-0000-0000-0000000000a2', 'M'),  -- living
  ('2b000000-0000-0000-0000-000000000006', 'e2000000-0000-0000-0000-0000000000a2', 'M');
-- Everyone is deceased except 2b…05.
INSERT INTO public.events (person_id, event_type)
  SELECT id, 'DEAT' FROM public.persons
   WHERE (id::text LIKE '1a000000-%' OR id::text LIKE '2b000000-%')
     AND id <> '2b000000-0000-0000-0000-000000000005';

INSERT INTO public.matches (id, person_a_id, person_b_id, confidence_score, status) VALUES
  ('c0000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-000000000001', 20, 'pending'),   -- below the floor
  ('c0000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000002', '2b000000-0000-0000-0000-000000000002', 30, 'pending'),   -- exactly at the floor
  ('c0000000-0000-0000-0000-000000000003', '1a000000-0000-0000-0000-000000000003', '2b000000-0000-0000-0000-000000000003', 60, 'pending'),
  ('c0000000-0000-0000-0000-000000000004', '1a000000-0000-0000-0000-000000000004', '2b000000-0000-0000-0000-000000000004', 10, 'deferred'),  -- already seen by a person
  ('c0000000-0000-0000-0000-000000000005', '1a000000-0000-0000-0000-000000000005', '2b000000-0000-0000-0000-000000000005', 15, 'pending'),   -- below, one side living
  ('c0000000-0000-0000-0000-000000000006', '1a000000-0000-0000-0000-000000000006', '2b000000-0000-0000-0000-000000000006', 5,  'pending');   -- below

-- ── the admin review queue ──────────────────────────────────────────────────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

SELECT is(
  ARRAY(SELECT id FROM public.admin_review_queue()),
  ARRAY['c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
        'c0000000-0000-0000-0000-000000000004']::uuid[],
  'the queue lists pending pairs at or above the floor and deferred pairs, best score first');
SELECT is(
  ARRAY(SELECT id FROM public.admin_review_queue(true)),
  ARRAY['c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005',
        'c0000000-0000-0000-0000-000000000006']::uuid[],
  'asking for the hidden pairs lists exactly the pending pairs below the floor');
SELECT is((SELECT hidden_count FROM public.admin_review_hidden_count()), 3,
  'the admin is told how many pairs are hidden');
SELECT is((SELECT review_score_floor FROM public.admin_review_hidden_count()), 30,
  'and what the floor is');
SELECT is(
  (SELECT count(DISTINCT match_id)::int FROM public.match_review_cards),
  6, 'the admin still reads every pair through the card view');

-- ── owners ──────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
SELECT is(
  ARRAY(SELECT match_id FROM public.match_review_cards ORDER BY confidence_score DESC),
  ARRAY['c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
        'c0000000-0000-0000-0000-000000000004']::uuid[],
  'an owner''s card view leaves out the pending pairs below the floor');
SELECT is((SELECT count(*)::int FROM public.admin_review_queue()), 0,
  'a non-admin gets nothing from the review queue');
SELECT is((SELECT count(*)::int FROM public.admin_review_queue(true)), 0,
  'nor from the hidden list');
SELECT is((SELECT hidden_count FROM public.admin_review_hidden_count()), 0,
  'nor a hidden count');

-- ── hidden pairs do not become owner hints ──────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT public.resolve_match('c0000000-0000-0000-0000-000000000001', 'defer') $$,
  '22023', 'below_review_floor', 'a pair below the floor cannot be deferred to the owners');
SELECT throws_ok(
  $$ SELECT public.resolve_match('c0000000-0000-0000-0000-000000000005', 'approve') $$,
  '22023', 'below_review_floor', 'nor approved towards the owners when a living person is involved');
SELECT lives_ok(
  $$ SELECT public.resolve_match('c0000000-0000-0000-0000-000000000006', 'reject', 'noise') $$,
  'a hidden pair can still be rejected');

RESET role;

SELECT is((SELECT count(*)::int FROM public.match_hints
            WHERE match_id::text LIKE 'c0000000-0000-0000-0000-00000000000%'),
  0, 'no owner hint was created for any pair');
SELECT is(
  (SELECT count(*)::int FROM public.matches
    WHERE id IN ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005')
      AND status = 'pending'),
  2, 'the hidden pairs stay stored as pending');
SELECT is((SELECT status::text FROM public.matches WHERE id = 'c0000000-0000-0000-0000-000000000006'),
  'admin_rejected', 'and the rejected one is recorded as rejected');

-- ── a later re-score brings a pair back ─────────────────────────────────────
-- The batch re-scores every pending pair; this stands in for a higher new score.
UPDATE public.matches SET confidence_score = 45 WHERE id = 'c0000000-0000-0000-0000-000000000001';

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SELECT is(
  ARRAY(SELECT id FROM public.admin_review_queue()),
  ARRAY['c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004']::uuid[],
  'a pair that now scores above the floor is back in the queue');
SELECT is((SELECT hidden_count FROM public.admin_review_hidden_count()), 1,
  'and no longer counted as hidden');
SELECT lives_ok(
  $$ SELECT public.resolve_match('c0000000-0000-0000-0000-000000000001', 'defer') $$,
  'and can now be deferred to the owners');
RESET role;
SELECT is((SELECT count(*)::int FROM public.match_hints WHERE match_id = 'c0000000-0000-0000-0000-000000000001'),
  2, 'which creates the two owner hints');

-- ── the floor is a setting ──────────────────────────────────────────────────
UPDATE public.app_settings SET review_score_floor = 10;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SELECT is((SELECT hidden_count FROM public.admin_review_hidden_count()), 0,
  'lowering the floor to 10 un-hides the pair scoring 15');
SELECT ok(
  EXISTS (SELECT 1 FROM public.admin_review_queue() WHERE id = 'c0000000-0000-0000-0000-000000000005'),
  'which is listed in the queue again');
RESET role;

-- ── automatic linking never takes a pair below the floor ────────────────────
UPDATE public.app_settings SET review_score_floor = 30;
INSERT INTO public.matches (id, person_a_id, person_b_id, confidence_score, status) VALUES
  ('c0000000-0000-0000-0000-000000000007', '1a000000-0000-0000-0000-000000000006', '2b000000-0000-0000-0000-000000000001', 29, 'pending');
SELECT is(public.auto_link_match('c0000000-0000-0000-0000-000000000007'), NULL::uuid,
  'auto_link_match refuses a pending pair below the floor');
SELECT is(
  (SELECT count(*)::int FROM public.match_hints WHERE match_id = 'c0000000-0000-0000-0000-000000000007')
  + (SELECT count(*)::int FROM public.person_links
      WHERE person_a_id = '1a000000-0000-0000-0000-000000000006'
        AND person_b_id = '2b000000-0000-0000-0000-000000000001'),
  0, 'and creates no hint and no link for it');
UPDATE public.matches SET confidence_score = 30 WHERE id = 'c0000000-0000-0000-0000-000000000007';
SELECT isnt(public.auto_link_match('c0000000-0000-0000-0000-000000000007'), NULL::uuid,
  'the same pair at the floor is linked as before (the refusal above was the floor)');

-- ── grants ──────────────────────────────────────────────────────────────────
SELECT ok(
  NOT has_function_privilege('anon', 'public.admin_review_queue(boolean, integer, integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_review_hidden_count()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.match_below_review_floor(public.match_status, integer)', 'EXECUTE'),
  'anon cannot call the review-floor functions');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.auto_link_match(uuid)', 'EXECUTE'),
  'auto_link_match is still closed to signed-in users');

SELECT * FROM finish();
ROLLBACK;
