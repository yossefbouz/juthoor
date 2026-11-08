-- pgTAP: trees SELECT requires approved membership (finding 17).
-- Pending / rejected / revoked members must not read a private tree's
-- name or description. Owners and approved members still can.
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'owner@test.juthoor', 'authenticated', 'authenticated'),
  ('a2222222-2222-2222-2222-222222222222', 'pending@test.juthoor', 'authenticated', 'authenticated'),
  ('a3333333-3333-3333-3333-333333333333', 'approved@test.juthoor', 'authenticated', 'authenticated'),
  ('a4444444-4444-4444-4444-444444444444', 'rejected@test.juthoor', 'authenticated', 'authenticated'),
  ('a5555555-5555-5555-5555-555555555555', 'revoked@test.juthoor', 'authenticated', 'authenticated');

INSERT INTO public.trees (id, name, description, owner_id, is_public)
VALUES (
  'b1111111-1111-1111-1111-111111111111',
  'Private Family Tree',
  'Sensitive description',
  'a1111111-1111-1111-1111-111111111111',
  false
);

INSERT INTO public.tree_members (tree_id, user_id, role, status)
VALUES
  ('b1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'read_only', 'pending'),
  ('b1111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333', 'collaborator', 'approved'),
  ('b1111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444', 'read_only', 'rejected'),
  ('b1111111-1111-1111-1111-111111111111', 'a5555555-5555-5555-5555-555555555555', 'read_only', 'revoked');

SET LOCAL role authenticated;

-- Owner still sees the private tree.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
SELECT is(
  (SELECT name FROM public.trees WHERE id = 'b1111111-1111-1111-1111-111111111111'),
  'Private Family Tree',
  'owner can SELECT private tree name'
);

-- Approved collaborator still sees it.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);
SELECT is(
  (SELECT description FROM public.trees WHERE id = 'b1111111-1111-1111-1111-111111111111'),
  'Sensitive description',
  'approved collaborator can SELECT private tree description'
);

-- Pending member cannot.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
SELECT is(
  (SELECT count(*)::int FROM public.trees WHERE id = 'b1111111-1111-1111-1111-111111111111'),
  0,
  'pending member cannot SELECT private tree'
);

-- Rejected member cannot.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);
SELECT is(
  (SELECT count(*)::int FROM public.trees WHERE id = 'b1111111-1111-1111-1111-111111111111'),
  0,
  'rejected member cannot SELECT private tree'
);

-- Revoked member cannot.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true
);
SELECT is(
  (SELECT count(*)::int FROM public.trees WHERE id = 'b1111111-1111-1111-1111-111111111111'),
  0,
  'revoked member cannot SELECT private tree'
);

-- Policy still routes through can_access_tree (shape check).
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trees'
      AND policyname = 'trees_select'
      AND qual ILIKE '%can_access_tree%'
  ),
  1,
  'trees_select uses can_access_tree'
);

SELECT finish();
ROLLBACK;
