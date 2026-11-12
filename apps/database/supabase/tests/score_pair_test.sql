-- pgTAP: score_pair AIO-100 core — additive lit+phon, banding, hard vetoes.
BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1111111-0000-0000-0000-000000000001', 'o1@test.juthoor', 'authenticated', 'authenticated'),
  ('a2222222-0000-0000-0000-000000000002', 'o2@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id) VALUES
  ('b1111111-0000-0000-0000-000000000001', 'T1', 'a1111111-0000-0000-0000-000000000001'),
  ('b2222222-0000-0000-0000-000000000002', 'T2', 'a2222222-0000-0000-0000-000000000002');
INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b1111111-0000-0000-0000-000000000001', 'M'),
  ('c0000000-0000-0000-0000-000000000002', 'b2222222-0000-0000-0000-000000000002', 'M'),
  ('c0000000-0000-0000-0000-000000000003', 'b1111111-0000-0000-0000-000000000001', 'M'),
  ('c0000000-0000-0000-0000-000000000004', 'b2222222-0000-0000-0000-000000000002', 'F');

INSERT INTO public.match_features (person_id, tree_id, gender, is_living,
  given_norm, given_phon, surname_norm, surname_phon, father_norm, father_phon, birth_year) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b1111111-0000-0000-0000-000000000001', 'M', false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد'),
   public.normalize_arabic('خطيب'), public.arabic_phonetic('خطيب'),
   public.normalize_arabic('محمد'), public.arabic_phonetic('محمد'), 1950),
  ('c0000000-0000-0000-0000-000000000002', 'b2222222-0000-0000-0000-000000000002', 'M', false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد'),
   public.normalize_arabic('خطيب'), public.arabic_phonetic('خطيب'),
   public.normalize_arabic('محمد'), public.arabic_phonetic('محمد'), 1950),
  ('c0000000-0000-0000-0000-000000000003', 'b1111111-0000-0000-0000-000000000001', 'M', false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد'), NULL, NULL, NULL, NULL, NULL),
  ('c0000000-0000-0000-0000-000000000004', 'b2222222-0000-0000-0000-000000000002', 'F', true,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد'), NULL, NULL, NULL, NULL, NULL);

-- 1. a true duplicate scores (given 6 + surname 6 + father 8 + birth 7 = 27)
SELECT cmp_ok((SELECT score FROM public.score_pair(
    'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002')),
  '>=', 20, 'duplicate pair scores >= 20 on AIO-100');

-- 2. literal+phonetic additive: exact given = 4+2 = 6 (not collapsed)
SELECT is((SELECT (breakdown->'params'->'given'->>'pts')::int FROM public.score_pair(
    'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002')),
  6, 'given additive lit+phon = 6');

-- 3. exact birth year = 7
SELECT is((SELECT (breakdown->'params'->'birth_year'->>'pts')::int FROM public.score_pair(
    'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002')),
  7, 'exact birth year = 7');

-- 4. same-tree hard veto
SELECT ok((SELECT breakdown->'meta'->'vetoes' FROM public.score_pair(
    'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003')) @> '["same_tree"]',
  'same-tree pair is vetoed');

-- 5. gender mismatch hard veto
SELECT ok((SELECT breakdown->'meta'->'vetoes' FROM public.score_pair(
    'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004')) @> '["gender_mismatch"]',
  'gender mismatch is vetoed');

-- 6. living person → suppression flag
SELECT is((SELECT breakdown->'meta'->>'privacy' FROM public.score_pair(
    'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004')),
  'living_suppressed', 'a living person is flagged living_suppressed');

-- 7. no spurious credit: a NULL field scores 0
SELECT is((SELECT (breakdown->'params'->'surname'->>'pts')::int FROM public.score_pair(
    'c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003')),
  0, 'NULL surname → 0 points (no spurious positive)');

SELECT finish();
ROLLBACK;
