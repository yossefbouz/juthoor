-- pgTAP: living people's life events are private, and only privileged users
-- can record a death for a living person (20261113120000_living_privacy_holes).
BEGIN;
SELECT plan(11);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-0000000000e1', 'owner-lp@test.juthoor',    'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-0000000000e2', 'member-lp@test.juthoor',   'authenticated', 'authenticated'),
  ('a3000000-0000-0000-0000-0000000000e3', 'collab-lp@test.juthoor',   'authenticated', 'authenticated'),
  ('a4000000-0000-0000-0000-0000000000e4', 'stranger-lp@test.juthoor', 'authenticated', 'authenticated');

INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('b1000000-0000-0000-0000-0000000000e1', 'Public family tree', 'a1000000-0000-0000-0000-0000000000e1', true);

INSERT INTO public.tree_members (tree_id, user_id, role, status) VALUES
  ('b1000000-0000-0000-0000-0000000000e1', 'a2000000-0000-0000-0000-0000000000e2', 'read_only',    'approved'),
  ('b1000000-0000-0000-0000-0000000000e1', 'a3000000-0000-0000-0000-0000000000e3', 'collaborator', 'approved');

-- A living person (born 1990) entered by the owner two days ago, and a deceased one.
INSERT INTO public.persons (id, tree_id, gender, display_name_ar, display_name_en, created_by, created_at) VALUES
  ('c1000000-0000-0000-0000-0000000000e1', 'b1000000-0000-0000-0000-0000000000e1', 'F', 'حية', 'Living',
   'a1000000-0000-0000-0000-0000000000e1', now() - interval '2 days'),
  ('c2000000-0000-0000-0000-0000000000e2', 'b1000000-0000-0000-0000-0000000000e1', 'M', 'متوفى', 'Deceased',
   'a1000000-0000-0000-0000-0000000000e1', now() - interval '2 days');
INSERT INTO public.events (person_id, event_type, date_year) VALUES
  ('c1000000-0000-0000-0000-0000000000e1', 'BIRT', 1990),
  ('c2000000-0000-0000-0000-0000000000e2', 'BIRT', 1900),
  ('c2000000-0000-0000-0000-0000000000e2', 'DEAT', 1970);

SET LOCAL role authenticated;

-- ── 1. Reading life events ──────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a4000000-0000-0000-0000-0000000000e4","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM public.events WHERE person_id = 'c1000000-0000-0000-0000-0000000000e1'),
  0, 'a stranger cannot read a living person''s birth event on a public tree');
SELECT is(
  (SELECT count(*)::int FROM public.events WHERE person_id = 'c2000000-0000-0000-0000-0000000000e2'),
  2, 'a stranger can still read a deceased person''s events');

SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM public.events WHERE person_id = 'c1000000-0000-0000-0000-0000000000e1'),
  1, 'an approved member can read a living person''s birth event');

SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM public.events WHERE person_id = 'c1000000-0000-0000-0000-0000000000e1'),
  1, 'the tree owner can read a living person''s birth event');

-- ── 2. Recording a death for a living person ────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a3000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
SELECT throws_ok(
  $$ INSERT INTO public.events (person_id, event_type) VALUES ('c1000000-0000-0000-0000-0000000000e1', 'DEAT') $$,
  '42501', 'living_status_change_not_allowed',
  'a collaborator cannot add a death event to someone else''s living person');
SELECT throws_ok(
  $$ UPDATE public.events SET date_year = 1850
      WHERE person_id = 'c1000000-0000-0000-0000-0000000000e1' AND event_type = 'BIRT' $$,
  '42501', 'living_status_change_not_allowed',
  'a collaborator cannot move a living person''s birth year 150+ years back');
SELECT is(
  public.is_person_living('c1000000-0000-0000-0000-0000000000e1'),
  true, 'the person is still living after the blocked attempts');

-- A collaborator can still add a deceased ancestor they are entering now.
SELECT lives_ok(
  $$ INSERT INTO public.persons (id, tree_id, gender, display_name_ar, display_name_en, created_by)
     VALUES ('c3000000-0000-0000-0000-0000000000e3', 'b1000000-0000-0000-0000-0000000000e1', 'M',
             'جد', 'Ancestor', 'a3000000-0000-0000-0000-0000000000e3') $$,
  'a collaborator can enter a new ancestor');
SELECT lives_ok(
  $$ INSERT INTO public.events (person_id, event_type, date_year)
     VALUES ('c3000000-0000-0000-0000-0000000000e3', 'DEAT', 1948) $$,
  'a collaborator can record a death for a person they just entered');

SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
SELECT lives_ok(
  $$ INSERT INTO public.events (person_id, event_type, date_year)
     VALUES ('c1000000-0000-0000-0000-0000000000e1', 'DEAT', 2025) $$,
  'the tree owner can record a death for a living person');
SELECT is(
  public.is_person_living('c1000000-0000-0000-0000-0000000000e1'),
  false, 'after the owner records the death the person is no longer living');

SELECT * FROM finish();
ROLLBACK;
