-- pgTAP: PR #26 review fixes (20261108120000_pr26_review_fixes).
BEGIN;
SELECT plan(14);

-- Users: O owns a public tree, D raises a dispute, C is a stranger.
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'owner@test.juthoor',    'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-000000000002', 'disputer@test.juthoor', 'authenticated', 'authenticated'),
  ('a3000000-0000-0000-0000-000000000003', 'stranger@test.juthoor', 'authenticated', 'authenticated');

INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Public tree', 'a1000000-0000-0000-0000-000000000001', true);

INSERT INTO public.persons (id, tree_id, gender, display_name_ar, display_name_en) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'M', 'حي', 'Living'),
  ('c2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'F', 'زوجة', 'Spouse');
INSERT INTO public.events (person_id, event_type, date_year) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'BIRT', 2000);

INSERT INTO public.families (id, tree_id, partner1_id, partner2_id) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002');

INSERT INTO public.person_profiles (person_id, contact_email, contact_consent)
VALUES ('c1000000-0000-0000-0000-000000000001', 'living@test.juthoor', false);

INSERT INTO public.person_identifiers (person_id, id_type, id_value)
VALUES ('c1000000-0000-0000-0000-000000000001', 'unrwa_registration', 'U-123');

CREATE TEMP TABLE t_thread (who text, id uuid);
GRANT ALL ON t_thread TO authenticated;

SET LOCAL role authenticated;

-- ── 1. trees_select no longer blocks INSERT ... RETURNING ───────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a3000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT lives_ok(
  $$ INSERT INTO public.trees (name, owner_id, is_public)
     VALUES ('Stranger tree', 'a3000000-0000-0000-0000-000000000003', false)
     RETURNING id $$,
  'a non-admin can create a tree with INSERT ... RETURNING'
);

-- ── 2. messaging: a stranger cannot join someone else''s thread ──────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
INSERT INTO t_thread SELECT 'disputer', public.open_or_create_message_thread(
  'relationship_dispute', 'd1000000-0000-0000-0000-000000000001', NULL, 'private note');

SELECT set_config('request.jwt.claims',
  '{"sub":"a3000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
INSERT INTO t_thread SELECT 'stranger', public.open_or_create_message_thread(
  'relationship_dispute', 'd1000000-0000-0000-0000-000000000001', NULL, NULL);

SELECT isnt(
  (SELECT id FROM t_thread WHERE who = 'stranger'),
  (SELECT id FROM t_thread WHERE who = 'disputer'),
  'a second user on the same dispute context gets their own thread'
);
SELECT is(
  (SELECT count(*) FROM public.messages
    WHERE thread_id = (SELECT id FROM t_thread WHERE who = 'disputer')),
  0::bigint,
  'the stranger cannot read the disputer''s messages'
);
SELECT throws_ok(
  $$ SELECT public.open_or_create_message_thread(
       'contact_relay', gen_random_uuid(), 'a2000000-0000-0000-0000-000000000002', 'hi') $$,
  'P0001', 'contact_relay not found',
  'contact_relay threads need a real relay; an arbitrary counterpart is refused'
);
SELECT throws_ok(
  $$ SELECT public.open_or_create_message_thread(
       'relationship_dispute', 'd1000000-0000-0000-0000-000000000001',
       'a2000000-0000-0000-0000-000000000002', NULL) $$,
  '42501', NULL,
  'a counterpart that does not match the context is refused'
);

-- ── 3. record ownership cannot be self-assigned ─────────────────────────────
SELECT throws_ok(
  $$ UPDATE public.profiles SET linked_person_id = 'c1000000-0000-0000-0000-000000000001'
     WHERE id = 'a3000000-0000-0000-0000-000000000003' $$,
  '42501', 'person_link_requires_claim',
  'a user cannot set their own linked_person_id'
);
SELECT is(
  public.request_person_claim('c1000000-0000-0000-0000-000000000001', NULL),
  'requested',
  'a non-owner claim becomes a pending request'
);
SELECT is(
  public.is_record_owner('c1000000-0000-0000-0000-000000000001'),
  false,
  'a pending claim does not grant record ownership'
);

SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is(
  public.review_person_claim(
    (SELECT id FROM public.person_claim_requests
      WHERE user_id = 'a3000000-0000-0000-0000-000000000003'), true),
  'approved',
  'the tree owner approves the claim'
);

-- ── 4. contact columns are column-restricted ────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT contact_email FROM public.person_profiles $$,
  '42501', NULL,
  'contact_email cannot be selected directly'
);
SELECT is(
  (SELECT contact_email FROM public.get_person_contact('c1000000-0000-0000-0000-000000000001')),
  NULL,
  'without consent a non-member gets no contact email'
);

-- ── 5. identifiers of a living person are hidden from non-members ───────────
SELECT is(
  (SELECT count(*) FROM public.person_identifiers
    WHERE person_id = 'c1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'a non-member cannot read a living person''s UNRWA number'
);

SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM public.person_identifiers
    WHERE person_id = 'c1000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the tree owner can read it'
);

-- ── 6. teardown_person_link is internal ─────────────────────────────────────
SELECT throws_ok(
  $$ SELECT public.teardown_person_link(gen_random_uuid(), 'admin') $$,
  '42501', NULL,
  'teardown_person_link cannot be called through the API'
);

SELECT * FROM finish();
ROLLBACK;
