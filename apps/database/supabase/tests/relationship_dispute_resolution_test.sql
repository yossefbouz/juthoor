-- pgTAP: a disputed relationship opens messaging with the tree owner, and only
-- a tree writer can resolve or dismiss it
-- (20261125100000_relationship_dispute_thread_and_resolve).
BEGIN;
SELECT plan(34);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-0000000000d5', 'owner-d5@test.juthoor',    'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-0000000000d5', 'collab-d5@test.juthoor',   'authenticated', 'authenticated'),
  ('a3000000-0000-0000-0000-0000000000d5', 'viewer-d5@test.juthoor',   'authenticated', 'authenticated'),
  ('a4000000-0000-0000-0000-0000000000d5', 'stranger-d5@test.juthoor', 'authenticated', 'authenticated'),
  ('a5000000-0000-0000-0000-0000000000d5', 'admin-d5@test.juthoor',    'authenticated', 'authenticated');

INSERT INTO public.profiles (id, is_admin) VALUES
  ('a5000000-0000-0000-0000-0000000000d5', true)
ON CONFLICT (id) DO UPDATE SET is_admin = EXCLUDED.is_admin;

-- A private tree: the owner, a collaborator (tree writer) and a read-only member.
INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('b1000000-0000-0000-0000-0000000000d5', 'Private tree D5', 'a1000000-0000-0000-0000-0000000000d5', false);

INSERT INTO public.tree_members (tree_id, user_id, role, status) VALUES
  ('b1000000-0000-0000-0000-0000000000d5', 'a2000000-0000-0000-0000-0000000000d5', 'collaborator', 'approved'),
  ('b1000000-0000-0000-0000-0000000000d5', 'a3000000-0000-0000-0000-0000000000d5', 'read_only',    'approved');

INSERT INTO public.persons (id, tree_id, gender, display_name_en, created_by) VALUES
  ('c1000000-0000-0000-0000-0000000000d5', 'b1000000-0000-0000-0000-0000000000d5', 'M', 'Father D5',
   'a1000000-0000-0000-0000-0000000000d5'),
  ('c2000000-0000-0000-0000-0000000000d5', 'b1000000-0000-0000-0000-0000000000d5', 'F', 'Mother D5',
   'a1000000-0000-0000-0000-0000000000d5'),
  ('c3000000-0000-0000-0000-0000000000d5', 'b1000000-0000-0000-0000-0000000000d5', 'M', 'Son D5',
   'a1000000-0000-0000-0000-0000000000d5');

-- Two open disputes raised by the read-only member, and a Validated flag.
INSERT INTO public.relationship_disputes (id, tree_id, person_a, person_b, relation_type, status, raised_by) VALUES
  ('d1000000-0000-0000-0000-0000000000d5', 'b1000000-0000-0000-0000-0000000000d5',
   'c3000000-0000-0000-0000-0000000000d5', 'c1000000-0000-0000-0000-0000000000d5', 'parent', 'open',
   'a3000000-0000-0000-0000-0000000000d5'),
  ('d2000000-0000-0000-0000-0000000000d5', 'b1000000-0000-0000-0000-0000000000d5',
   'c3000000-0000-0000-0000-0000000000d5', 'c2000000-0000-0000-0000-0000000000d5', 'parent', 'open',
   'a3000000-0000-0000-0000-0000000000d5'),
  ('d3000000-0000-0000-0000-0000000000d5', 'b1000000-0000-0000-0000-0000000000d5',
   'c1000000-0000-0000-0000-0000000000d5', 'c2000000-0000-0000-0000-0000000000d5', 'spouse', 'validated',
   'a1000000-0000-0000-0000-0000000000d5');

-- ── the functions themselves ────────────────────────────────────────────────
SELECT ok(
  (SELECT bool_and(p.prosecdef AND array_to_string(p.proconfig, ',') IN ('search_path=""', 'search_path='))
     FROM pg_proc p
    WHERE p.oid IN (
      'public.resolve_relationship_dispute(uuid, text)'::regprocedure,
      'public.raise_relationship_dispute(uuid, uuid, uuid, text, text)'::regprocedure)),
  'both functions pin an empty search_path');

SELECT ok(
  NOT has_function_privilege('anon', 'public.resolve_relationship_dispute(uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.raise_relationship_dispute(uuid, uuid, uuid, text, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.resolve_relationship_dispute(uuid, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.raise_relationship_dispute(uuid, uuid, uuid, text, text)', 'EXECUTE'),
  'signed-out visitors cannot call the functions; signed-in users can');

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'relationship_disputes' AND cmd = 'UPDATE'),
  0, 'there is no direct UPDATE rule on relationship_disputes');

SET LOCAL role authenticated;

-- ── as the read-only member: raising a dispute opens messaging ──────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a3000000-0000-0000-0000-0000000000d5","role":"authenticated"}', true);

SELECT is(
  (public.raise_relationship_dispute('b1000000-0000-0000-0000-0000000000d5',
     'c1000000-0000-0000-0000-0000000000d5', 'c2000000-0000-0000-0000-0000000000d5',
     'spouse', 'They were never married')).status,
  'open', 'a member who cannot write the tree raises a dispute');

SELECT is(
  (public.raise_relationship_dispute('b1000000-0000-0000-0000-0000000000d5',
     'c2000000-0000-0000-0000-0000000000d5', 'c1000000-0000-0000-0000-0000000000d5',
     'spouse', NULL)).id,
  (SELECT id FROM public.relationship_disputes
    WHERE raised_by = 'a3000000-0000-0000-0000-0000000000d5'
      AND relation_type = 'spouse' AND status = 'open'),
  'raising the same relationship again (from the other person) returns the open dispute');

SELECT is(
  public.open_or_create_message_thread('relationship_dispute',
    (SELECT id FROM public.relationship_disputes
      WHERE raised_by = 'a3000000-0000-0000-0000-0000000000d5'
        AND relation_type = 'spouse' AND status = 'open')),
  (SELECT mt.id FROM public.message_threads mt
     JOIN public.relationship_disputes d ON d.id = mt.context_id
    WHERE mt.context_type = 'relationship_dispute'
      AND d.raised_by = 'a3000000-0000-0000-0000-0000000000d5' AND d.relation_type = 'spouse'),
  'the person who raised it is taken to the thread that raising opened');

SELECT throws_ok(
  $$ SELECT public.resolve_relationship_dispute('d1000000-0000-0000-0000-0000000000d5', 'resolved') $$,
  '42501', NULL, 'the person who raised a dispute cannot resolve it without write access');

-- Blocked: no update rule, so nothing changes (checked below as the collaborator).
UPDATE public.relationship_disputes SET status = 'dismissed'
 WHERE id = 'd1000000-0000-0000-0000-0000000000d5';

SELECT is(
  (public.validate_relationship('b1000000-0000-0000-0000-0000000000d5',
     'c3000000-0000-0000-0000-0000000000d5', 'c1000000-0000-0000-0000-0000000000d5', 'parent', NULL)).status,
  'validated', 'who may validate is unchanged: anyone who can open the tree');

-- ── as a stranger to the private tree ───────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a4000000-0000-0000-0000-0000000000d5","role":"authenticated"}', true);

SELECT throws_ok(
  $$ SELECT public.raise_relationship_dispute('b1000000-0000-0000-0000-0000000000d5',
       'c1000000-0000-0000-0000-0000000000d5', 'c2000000-0000-0000-0000-0000000000d5', 'spouse', NULL) $$,
  'P0001', 'Cannot access this tree', 'a stranger cannot raise a dispute on a private tree');
SELECT throws_ok(
  $$ SELECT public.validate_relationship('b1000000-0000-0000-0000-0000000000d5',
       'c1000000-0000-0000-0000-0000000000d5', 'c2000000-0000-0000-0000-0000000000d5', 'spouse', NULL) $$,
  'P0001', 'Cannot access this tree', 'a stranger cannot validate on a private tree');
SELECT is(
  (SELECT count(*)::int FROM public.relationship_disputes
    WHERE tree_id = 'b1000000-0000-0000-0000-0000000000d5'),
  0, 'a stranger sees no dispute or Validated flag of a private tree');
SELECT throws_ok(
  $$ SELECT public.resolve_relationship_dispute('d1000000-0000-0000-0000-0000000000d5', 'dismissed') $$,
  '42501', 'Dispute not found or not permitted', 'a stranger cannot dismiss a dispute');
SELECT throws_ok(
  $$ SELECT public.resolve_relationship_dispute('d9000000-0000-0000-0000-0000000000d5', 'dismissed') $$,
  '42501', 'Dispute not found or not permitted',
  'a dispute that does not exist gives the same answer, so ids cannot be probed');
SELECT throws_ok(
  $$ SELECT public.open_or_create_message_thread('relationship_dispute',
       'd1000000-0000-0000-0000-0000000000d5') $$,
  '42501', NULL, 'a stranger cannot open a thread on someone else''s dispute');
SELECT is(
  (SELECT count(*)::int FROM public.message_threads) + (SELECT count(*)::int FROM public.messages),
  0, 'a stranger sees no dispute thread and no message');

-- ── as the Platform Administrator (reads, but does not write the tree) ──────
SELECT set_config('request.jwt.claims',
  '{"sub":"a5000000-0000-0000-0000-0000000000d5","role":"authenticated"}', true);

SELECT throws_ok(
  $$ SELECT public.resolve_relationship_dispute('d1000000-0000-0000-0000-0000000000d5', 'resolved') $$,
  '42501', NULL, 'the Platform Administrator cannot resolve a dispute in someone else''s tree');

UPDATE public.relationship_disputes SET status = 'dismissed'
 WHERE id = 'd1000000-0000-0000-0000-0000000000d5';

-- ── as the collaborator (a tree writer) ─────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-0000000000d5","role":"authenticated"}', true);

UPDATE public.relationship_disputes SET status = 'validated'
 WHERE id = 'd1000000-0000-0000-0000-0000000000d5';

SELECT is(
  (SELECT status FROM public.relationship_disputes WHERE id = 'd1000000-0000-0000-0000-0000000000d5'),
  'open', 'direct updates by the member, the administrator and the collaborator changed nothing');

SELECT throws_ok(
  $$ SELECT public.resolve_relationship_dispute('d1000000-0000-0000-0000-0000000000d5', 'validated') $$,
  '22023', NULL, 'a dispute can only be set to resolved or dismissed');

SELECT is(
  (public.resolve_relationship_dispute('d1000000-0000-0000-0000-0000000000d5', 'resolved')).status,
  'resolved', 'a collaborator resolves an open dispute');

SELECT throws_ok(
  $$ SELECT public.resolve_relationship_dispute('d1000000-0000-0000-0000-0000000000d5', 'dismissed') $$,
  '22023', 'Dispute is not open', 'a closed dispute cannot be changed again');

SELECT throws_ok(
  $$ SELECT public.open_or_create_message_thread('relationship_dispute',
       'd2000000-0000-0000-0000-0000000000d5') $$,
  '42501', NULL, 'a collaborator is not a party to the dispute thread');

-- ── as the tree owner ───────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000d5","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.relationship_disputes
    WHERE tree_id = 'b1000000-0000-0000-0000-0000000000d5' AND status = 'open'),
  2, 'the tree owner sees the open disputes of the tree');

SELECT is(
  (SELECT count(*)::int FROM public.message_threads mt
     JOIN public.relationship_disputes d ON d.id = mt.context_id
    WHERE mt.context_type = 'relationship_dispute'
      AND d.raised_by = 'a3000000-0000-0000-0000-0000000000d5' AND d.relation_type = 'spouse'),
  1, 'the tree owner is a party to the thread and sees it');

SELECT is(
  (public.resolve_relationship_dispute('d2000000-0000-0000-0000-0000000000d5', 'dismissed')).status,
  'dismissed', 'the tree owner dismisses an open dispute');

SELECT throws_ok(
  $$ SELECT public.resolve_relationship_dispute('d3000000-0000-0000-0000-0000000000d5', 'dismissed') $$,
  '22023', 'Dispute is not open', 'a Validated flag cannot be dismissed through the dispute function');

SELECT is(
  (public.raise_relationship_dispute('b1000000-0000-0000-0000-0000000000d5',
     'c3000000-0000-0000-0000-0000000000d5', 'c2000000-0000-0000-0000-0000000000d5',
     'parent', 'Owner note')).status,
  'open', 'the tree owner can record a dispute in their own tree');

RESET role;

-- ── what was written ────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.relationship_disputes
    WHERE raised_by = 'a3000000-0000-0000-0000-0000000000d5' AND relation_type = 'spouse'),
  1, 'raising twice left one dispute');

SELECT is(
  (SELECT array_agg(ARRAY[mt.participant_low, mt.participant_high])
     FROM public.message_threads mt
     JOIN public.relationship_disputes d ON d.id = mt.context_id
    WHERE mt.context_type = 'relationship_dispute'
      AND d.raised_by = 'a3000000-0000-0000-0000-0000000000d5' AND d.relation_type = 'spouse'),
  ARRAY[ARRAY['a1000000-0000-0000-0000-0000000000d5'::uuid, 'a3000000-0000-0000-0000-0000000000d5'::uuid]],
  'the dispute has one thread, keyed to the tree owner and the person who raised it');

SELECT is(
  (SELECT array_agg(mtp.user_id ORDER BY mtp.user_id)
     FROM public.message_thread_participants mtp
     JOIN public.message_threads mt ON mt.id = mtp.thread_id
     JOIN public.relationship_disputes d ON d.id = mt.context_id
    WHERE mt.context_type = 'relationship_dispute'
      AND d.raised_by = 'a3000000-0000-0000-0000-0000000000d5' AND d.relation_type = 'spouse'),
  ARRAY['a1000000-0000-0000-0000-0000000000d5'::uuid, 'a3000000-0000-0000-0000-0000000000d5'::uuid],
  'the thread parties are exactly the tree owner and the person who raised it');

SELECT is(
  (SELECT array_agg(m.sender_id::text || ': ' || m.body)
     FROM public.messages m
     JOIN public.message_threads mt ON mt.id = m.thread_id
     JOIN public.relationship_disputes d ON d.id = mt.context_id
    WHERE mt.context_type = 'relationship_dispute'
      AND d.raised_by = 'a3000000-0000-0000-0000-0000000000d5' AND d.relation_type = 'spouse'),
  ARRAY['a3000000-0000-0000-0000-0000000000d5: They were never married'],
  'the note is the first message, sent by the person who raised the dispute');

SELECT is(
  (SELECT count(*)::int FROM public.message_threads mt
     JOIN public.relationship_disputes d ON d.id = mt.context_id
    WHERE mt.context_type = 'relationship_dispute'
      AND d.raised_by = 'a1000000-0000-0000-0000-0000000000d5'),
  0, 'the tree owner''s own dispute opens no thread (nobody to message)');

SELECT is(
  (SELECT count(*)::int FROM public.notifications
    WHERE recipient_user_id = 'a1000000-0000-0000-0000-0000000000d5'
      AND kind = 'relationship_dispute'
      AND link = '/tree/b1000000-0000-0000-0000-0000000000d5/person/c1000000-0000-0000-0000-0000000000d5'),
  1, 'the tree owner was notified once for the dispute that was raised twice');

SELECT is(
  (SELECT array_agg(kind ORDER BY kind) FROM public.notifications
    WHERE recipient_user_id = 'a3000000-0000-0000-0000-0000000000d5'
      AND kind LIKE 'relationship_dispute_%'),
  ARRAY['relationship_dispute_dismissed', 'relationship_dispute_resolved'],
  'the person who raised the disputes was notified of the resolution and of the dismissal');

SELECT is(
  (SELECT count(*)::int FROM public.notifications
    WHERE recipient_user_id = 'a3000000-0000-0000-0000-0000000000d5'
      AND concat_ws(' ', title_ar, title_en, body_ar, body_en) ~ 'D5'),
  0, 'the notification to the person who raised it carries no person names');

SELECT * FROM finish();
ROLLBACK;
