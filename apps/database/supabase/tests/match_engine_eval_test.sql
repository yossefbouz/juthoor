-- pgTAP: consolidated match-engine eval — resolveParents U/X + same-gender
-- parity, and end-to-end cross-script scoring (plan §7-M1 exit, B10).
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('11100000-0000-0000-0000-000000000001', 'o1@test.juthoor', 'authenticated', 'authenticated'),
  ('22200000-0000-0000-0000-000000000002', 'o2@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id) VALUES
  ('33300000-0000-0000-0000-000000000001', 'T1', '11100000-0000-0000-0000-000000000001'),
  ('33300000-0000-0000-0000-000000000002', 'T2', '22200000-0000-0000-0000-000000000002');

-- ── U/X partner: fills the father slot by position (parity with resolveParents) ─
INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('44400000-0000-0000-0000-0000000000a1', '33300000-0000-0000-0000-000000000001', 'U'),  -- unknown-gender partner
  ('44400000-0000-0000-0000-0000000000f1', '33300000-0000-0000-0000-000000000001', 'F'),  -- F partner
  ('44400000-0000-0000-0000-0000000000c1', '33300000-0000-0000-0000-000000000001', 'M');  -- child
INSERT INTO public.families (id, tree_id, partner1_id, partner2_id) VALUES
  ('55500000-0000-0000-0000-000000000001', '33300000-0000-0000-0000-000000000001',
   '44400000-0000-0000-0000-0000000000a1', '44400000-0000-0000-0000-0000000000f1');
INSERT INTO public.family_children (family_id, child_id) VALUES
  ('55500000-0000-0000-0000-000000000001', '44400000-0000-0000-0000-0000000000c1');

SELECT is((SELECT father_id FROM public.match_resolve_parents('44400000-0000-0000-0000-0000000000c1')),
  '44400000-0000-0000-0000-0000000000a1'::uuid, 'U-gender partner1 fills the father slot by position');
SELECT is((SELECT mother_id FROM public.match_resolve_parents('44400000-0000-0000-0000-0000000000c1')),
  '44400000-0000-0000-0000-0000000000f1'::uuid, 'F partner2 fills the mother slot');

-- ── same-gender partners: partner1 -> father, partner2 -> mother ─────────────
INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('44400000-0000-0000-0000-0000000000d1', '33300000-0000-0000-0000-000000000001', 'M'),
  ('44400000-0000-0000-0000-0000000000d2', '33300000-0000-0000-0000-000000000001', 'M'),
  ('44400000-0000-0000-0000-0000000000c2', '33300000-0000-0000-0000-000000000001', 'M');
INSERT INTO public.families (id, tree_id, partner1_id, partner2_id) VALUES
  ('55500000-0000-0000-0000-000000000002', '33300000-0000-0000-0000-000000000001',
   '44400000-0000-0000-0000-0000000000d1', '44400000-0000-0000-0000-0000000000d2');
INSERT INTO public.family_children (family_id, child_id) VALUES
  ('55500000-0000-0000-0000-000000000002', '44400000-0000-0000-0000-0000000000c2');

SELECT is((SELECT father_id FROM public.match_resolve_parents('44400000-0000-0000-0000-0000000000c2')),
  '44400000-0000-0000-0000-0000000000d1'::uuid, 'same-gender: partner1 -> father');
SELECT is((SELECT mother_id FROM public.match_resolve_parents('44400000-0000-0000-0000-0000000000c2')),
  '44400000-0000-0000-0000-0000000000d2'::uuid, 'same-gender: partner2 -> mother');

-- ── end-to-end cross-script: Latin "Ibrahim" vs Arabic "ابراهيم" score-match ──
INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('66600000-0000-0000-0000-00000000000a', '33300000-0000-0000-0000-000000000001', 'M'),
  ('66600000-0000-0000-0000-00000000000b', '33300000-0000-0000-0000-000000000002', 'M');
INSERT INTO public.person_names (person_id, is_primary, given_name) VALUES
  ('66600000-0000-0000-0000-00000000000a', true, 'Ibrahim'),
  ('66600000-0000-0000-0000-00000000000b', true, 'ابراهيم');
SELECT public.refresh_match_features('66600000-0000-0000-0000-00000000000a');
SELECT public.refresh_match_features('66600000-0000-0000-0000-00000000000b');

SELECT is(
  (SELECT (breakdown->'params'->'given'->>'pts')::int FROM public.score_pair(
     '66600000-0000-0000-0000-00000000000a','66600000-0000-0000-0000-00000000000b')),
  6, 'Latin Ibrahim and Arabic ابراهيم score exactly 6 given-name pts (cross-script, AIO-100)');

SELECT finish();
ROLLBACK;
