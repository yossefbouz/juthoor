-- pgTAP: automatic linking per the All-in-One (D4, Q3): the batch links pairs that meet the
-- 90% (deceased) / 76% (living) thresholds when auto linking is on, notifies both tree owners,
-- and an owner can revoke. Off by default; a revoked pair is never re-linked.
BEGIN;
SELECT plan(19);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a9000000-0000-0000-0000-000000000001', 'o1@test.juthoor', 'authenticated', 'authenticated'),
  ('a9000000-0000-0000-0000-000000000002', 'o2@test.juthoor', 'authenticated', 'authenticated'),
  ('a9000000-0000-0000-0000-000000000003', 'o3@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id) VALUES
  ('e9000000-0000-0000-0000-000000000001', 'T1', 'a9000000-0000-0000-0000-000000000001'),
  ('e9000000-0000-0000-0000-000000000002', 'T2', 'a9000000-0000-0000-0000-000000000002');
INSERT INTO public.places (id, name_ar) VALUES ('99000000-0000-0000-0000-000000000001', 'قرية الاختبار');

-- a deceased pair (D) and a living pair (L): same name, birth year and birth place in both trees.
INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', 'M'),
  ('d2000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-000000000002', 'M'),
  ('f1000000-0000-0000-0000-000000000003', 'e9000000-0000-0000-0000-000000000001', 'F'),
  ('f2000000-0000-0000-0000-000000000004', 'e9000000-0000-0000-0000-000000000002', 'F');
INSERT INTO public.person_names (person_id, is_primary, given_name, surname) VALUES
  ('d1000000-0000-0000-0000-000000000001', true, 'احمد', 'خطيب'),
  ('d2000000-0000-0000-0000-000000000002', true, 'احمد', 'خطيب'),
  ('f1000000-0000-0000-0000-000000000003', true, 'ليلى', 'حداد'),
  ('f2000000-0000-0000-0000-000000000004', true, 'ليلى', 'حداد');
INSERT INTO public.events (person_id, event_type, date_year, place_id) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'BIRT', 1930, '99000000-0000-0000-0000-000000000001'),
  ('d2000000-0000-0000-0000-000000000002', 'BIRT', 1930, '99000000-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000003', 'BIRT', 1990, '99000000-0000-0000-0000-000000000001'),
  ('f2000000-0000-0000-0000-000000000004', 'BIRT', 1990, '99000000-0000-0000-0000-000000000001');
INSERT INTO public.events (person_id, event_type) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'DEAT'),
  ('d2000000-0000-0000-0000-000000000002', 'DEAT');

-- 1. the switch is off by default: the batch only queues
SELECT is((SELECT auto_merge_enabled FROM public.app_settings), false, 'automatic linking is off by default');
SELECT ok(public.run_matching_batch(true) IS NOT NULL, 'batch runs with automatic linking off');
SELECT is((SELECT count(*)::int FROM public.matches WHERE status = 'pending'), 2, 'both pairs are queued as pending');
SELECT is((SELECT count(*)::int FROM public.person_links), 0, 'nothing is linked while the switch is off');

-- 2. switch on at the AIO thresholds: these pairs share only a name, birth year and birth place,
-- which is a small part of the full scale, so they stay in review
UPDATE public.app_settings SET auto_merge_enabled = true;
SELECT ok(public.run_matching_batch(true) IS NOT NULL, 'batch runs with automatic linking on at the default thresholds');
SELECT is((SELECT count(*)::int FROM public.person_links), 0, 'a sparse pair is not linked at 90% / 76% of the full scale');

-- 3. lower the thresholds for this test so the same pairs link: the rest of the file exercises the
-- linking, notification and revoke mechanics (the scoring itself is covered in score_pair_gate_test)
UPDATE public.app_settings SET link_threshold_deceased = 0.2, link_threshold_living = 0.2;
SELECT ok(public.run_matching_batch(true) IS NOT NULL, 'batch runs with automatic linking on');
SELECT is((SELECT count(*)::int FROM public.matches WHERE status = 'auto_merged'), 2,
  'the deceased pair and the living pair both auto-link');
SELECT is((SELECT count(*)::int FROM public.person_links WHERE status = 'confirmed' AND source = 'system'), 2,
  'two confirmed system links');
SELECT is((SELECT count(*)::int FROM public.notifications WHERE kind = 'connection_auto_linked'), 4,
  'both tree owners are notified for each link');
SELECT is((SELECT count(*)::int FROM public.match_hints WHERE status = 'accepted'), 4,
  'each owner sees the link on their connections page');
SELECT is((SELECT max(auto_linked) FROM public.matching_runs), 2,
  'the run records two automatic links');
SELECT ok(EXISTS (SELECT 1 FROM public.overlay_refresh_queue WHERE reason = 'auto_link'),
  'the overlay refresh is queued');

-- remember the living pair's match id (the matches table is admin-only for ordinary users)
SELECT set_config('t.living_match', (SELECT id::text FROM public.matches
  WHERE person_a_id = 'f1000000-0000-0000-0000-000000000003'), false);

-- 4. a stranger cannot revoke
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a9000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT public.revoke_auto_link(current_setting('t.living_match')::uuid) $$,
  '42501', 'not_authorized', 'a user who owns neither tree cannot revoke');

-- 5. an owner revokes the living pair's link
SELECT set_config('request.jwt.claims','{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT public.revoke_auto_link(current_setting('t.living_match')::uuid);
RESET ROLE;

SELECT is((SELECT l.status::text FROM public.person_links l
           WHERE l.person_a_id IN ('f1000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000004')),
          'revoked', 'the owner revokes the link');
SELECT is((SELECT status::text FROM public.matches
           WHERE person_a_id IN ('f1000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000004')),
          'admin_rejected', 'the revoked pair is marked rejected');
SELECT is((SELECT count(*)::int FROM public.notifications WHERE kind = 'connection_auto_linked'), 2,
  'the revoked link''s notifications are retracted');

-- 6. a revoked pair is never re-linked, and an unlinked match cannot be revoked again
SELECT ok(public.run_matching_batch(true) IS NOT NULL, 'a later batch run completes');
SELECT is((SELECT l.status::text FROM public.person_links l
           WHERE l.person_a_id IN ('f1000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000004')),
          'revoked', 'a revoked pair is not linked again');

SELECT finish();
ROLLBACK;
