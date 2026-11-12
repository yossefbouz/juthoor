-- pgTAP: the compute_degrees same_as zero-cost hop + masking + re-isolation
-- (B19, plan §5.1 / §7-M3 exit).
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'o1@t.juthoor', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'o2@t.juthoor', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'o3@t.juthoor', 'authenticated', 'authenticated');

-- Two PRIVATE trees: owner1 cannot see owner2's tree and vice-versa.
INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'T1', '11111111-1111-1111-1111-111111111111', false),
  ('e0000000-0000-0000-0000-000000000002', 'T2', '22222222-2222-2222-2222-222222222222', false);

-- A (owner1's tree)  ~same_as~  B (owner2's tree),  B is a parent of C (owner2's tree).
INSERT INTO public.persons (id, tree_id, gender, display_name_ar, display_name_en) VALUES
  ('10000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-000000000001', 'M', 'أ', 'Ayman'),
  ('20000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-000000000002', 'M', 'ب', 'Bilal'),
  ('20000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-000000000002', 'M', 'ج', 'Camal');

INSERT INTO public.families (id, tree_id, partner1_id) VALUES
  ('f0000000-0000-0000-0000-0000000000f1', 'e0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000b1');
INSERT INTO public.family_children (family_id, child_id) VALUES
  ('f0000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000c1');

-- a CONFIRMED same_as link A<->B (fixed id so revoke can target it without needing
-- to SELECT the admin-only person_links table).
INSERT INTO public.person_links (id, person_a_id, person_b_id, status) VALUES
  ('a1a1a1a1-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000b1', 'confirmed');

-- ── owner1's perspective ────────────────────────────────────────────────────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1. A→(same_as, 0)→B→(parent, 1)→C  ⇒ degree 1
SELECT is(
  (public.compute_degrees('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000c1')->>'degrees')::int,
  1, 'same_as hop makes B''s child reachable from A at degree 1');

-- 2. the boundary node B (in a tree owner1 cannot access) is NAME-masked
SELECT is(
  (SELECT elem->>'name_en'
     FROM jsonb_array_elements(
       public.compute_degrees('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000c1')->'path') elem
     WHERE elem->>'relation' = 'same_as' LIMIT 1),
  'Hidden relative', 'the same_as boundary node is name-masked for a non-accessing viewer (§5.1)');

-- 3. the path carries the same_as relation marker
SELECT ok(
  EXISTS(SELECT 1 FROM jsonb_array_elements(
    public.compute_degrees('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000c1')->'path') elem
    WHERE elem->>'relation' = 'same_as'),
  'match_paths / degrees path carries a same_as relation marker');

-- ── source-access guard: a stranger cannot probe degrees into a private source ─
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
-- 4.
SELECT ok(
  public.compute_degrees('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000c1') IS NULL,
  'a viewer who cannot access the SOURCE gets NULL (no cross-tree probing)');

-- ── owner2's within-tree degree still works (no hop needed) ──────────────────
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
-- 6 (run before revoke, independent of the link)
SELECT is(
  (public.compute_degrees('20000000-0000-0000-0000-0000000000b1','20000000-0000-0000-0000-0000000000c1')->>'degrees')::int,
  1, 'a normal within-tree parent→child degree still resolves to 1');

-- ── revoke re-isolation: after the link is revoked the cross-tree path is gone ─
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
-- revoke_person_link is admin-only (D9). Tear down as the test superuser via teardown_person_link.
RESET ROLE;
SELECT public.teardown_person_link('a1a1a1a1-1111-1111-1111-111111111111', 'admin');
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
-- 5.
SELECT ok(
  public.compute_degrees('10000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000c1') IS NULL,
  'after revoke, A can no longer reach C — the tree is re-isolated');

SELECT finish();
ROLLBACK;
