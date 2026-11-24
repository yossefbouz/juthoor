-- pgTAP: matching P2 accuracy report (20261125122000_matching_p2_accuracy_report).
BEGIN;
SELECT plan(20);

-- ── fixtures: an admin, an owner, two trees, six labelled cross-tree pairs ──
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-0000000000c1', 'admin-p2a@test.juthoor', 'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-0000000000c2', 'owner-p2a@test.juthoor', 'authenticated', 'authenticated');
UPDATE public.profiles SET is_admin = (id = 'a1000000-0000-0000-0000-0000000000c1')
 WHERE id IN ('a1000000-0000-0000-0000-0000000000c1', 'a2000000-0000-0000-0000-0000000000c2');
INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('e1000000-0000-0000-0000-0000000000c1', 'T1 p2a', 'a2000000-0000-0000-0000-0000000000c2', false),
  ('e2000000-0000-0000-0000-0000000000c2', 'T2 p2a', 'a2000000-0000-0000-0000-0000000000c2', false);

INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('1e000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000c1', 'M'),
  ('2f000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-0000000000c2', 'M'),
  ('1e000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-0000000000c1', 'M'),
  ('2f000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-0000000000c2', 'M'),
  ('1e000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-0000000000c1', 'M'),
  ('2f000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-0000000000c2', 'M'),
  ('1e000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-0000000000c1', 'M'),
  ('2f000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-0000000000c2', 'M'),
  ('1e000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-0000000000c1', 'M'),
  ('2f000000-0000-0000-0000-000000000005', 'e2000000-0000-0000-0000-0000000000c2', 'M'),
  ('1e000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-0000000000c1', 'M'),
  ('2f000000-0000-0000-0000-000000000006', 'e2000000-0000-0000-0000-0000000000c2', 'M');

INSERT INTO public.person_names (person_id, is_primary, given_name, surname) VALUES
  ('1e000000-0000-0000-0000-000000000001', true, 'ابراهيم', 'الخطيب'),   -- pair 1: same person, 26
  ('2f000000-0000-0000-0000-000000000001', true, 'ابراهيم', 'الخطيب'),
  ('1e000000-0000-0000-0000-000000000002', true, 'يوسف',    'النجار'),   -- pair 2: same person, 19
  ('2f000000-0000-0000-0000-000000000002', true, 'يوسف',    'النجار'),
  ('1e000000-0000-0000-0000-000000000003', true, 'محمد',    'المصري'),   -- pair 3: namesakes, 26
  ('2f000000-0000-0000-0000-000000000003', true, 'محمد',    'المصري'),
  ('1e000000-0000-0000-0000-000000000004', true, 'حسن',     'درويش'),    -- pair 4: brothers, 0
  ('2f000000-0000-0000-0000-000000000004', true, 'خليل',    'درويش'),
  ('1e000000-0000-0000-0000-000000000005', true, 'سليم',    'حداد'),     -- pair 5: same person, 12
  ('2f000000-0000-0000-0000-000000000005', true, 'سليم',    'حداد'),
  ('1e000000-0000-0000-0000-000000000006', true, 'عمر',     'الشريف'),   -- pair 6: held out, 12
  ('2f000000-0000-0000-0000-000000000006', true, 'عمر',     'الشريف');

-- Everyone has a death event (so no pair is living); years only where noted.
INSERT INTO public.events (person_id, event_type, date_year) VALUES
  ('1e000000-0000-0000-0000-000000000001', 'BIRT', 1900), ('1e000000-0000-0000-0000-000000000001', 'DEAT', 1970),
  ('2f000000-0000-0000-0000-000000000001', 'BIRT', 1900), ('2f000000-0000-0000-0000-000000000001', 'DEAT', 1970),
  ('1e000000-0000-0000-0000-000000000002', 'BIRT', 1910), ('1e000000-0000-0000-0000-000000000002', 'DEAT', 1980),
  ('2f000000-0000-0000-0000-000000000002', 'BIRT', 1910), ('2f000000-0000-0000-0000-000000000002', 'DEAT', NULL),
  ('1e000000-0000-0000-0000-000000000003', 'BIRT', 1920), ('1e000000-0000-0000-0000-000000000003', 'DEAT', 1990),
  ('2f000000-0000-0000-0000-000000000003', 'BIRT', 1920), ('2f000000-0000-0000-0000-000000000003', 'DEAT', 1990),
  ('1e000000-0000-0000-0000-000000000004', 'BIRT', 1930), ('1e000000-0000-0000-0000-000000000004', 'DEAT', 1995),
  ('2f000000-0000-0000-0000-000000000004', 'BIRT', 1930), ('2f000000-0000-0000-0000-000000000004', 'DEAT', 1995),
  ('1e000000-0000-0000-0000-000000000005', 'DEAT', NULL),
  ('2f000000-0000-0000-0000-000000000005', 'DEAT', NULL),
  ('1e000000-0000-0000-0000-000000000006', 'DEAT', NULL),
  ('2f000000-0000-0000-0000-000000000006', 'DEAT', NULL);

INSERT INTO public.eval_pairs (person_a_id, person_b_id, label, is_holdout, source) VALUES
  ('1e000000-0000-0000-0000-000000000001', '2f000000-0000-0000-0000-000000000001', 'match',     false, 'fixture'),
  ('1e000000-0000-0000-0000-000000000002', '2f000000-0000-0000-0000-000000000002', 'match',     false, 'fixture'),
  ('1e000000-0000-0000-0000-000000000003', '2f000000-0000-0000-0000-000000000003', 'non_match', false, 'fixture'),
  ('1e000000-0000-0000-0000-000000000004', '2f000000-0000-0000-0000-000000000004', 'non_match', false, 'fixture'),
  ('1e000000-0000-0000-0000-000000000005', '2f000000-0000-0000-0000-000000000005', 'match',     false, 'fixture'),
  ('1e000000-0000-0000-0000-000000000006', '2f000000-0000-0000-0000-000000000006', 'match',     true,  'fixture');

-- ── the report (no signed-in user here: this is the SQL editor's position) ──
-- It rebuilds the features of the labelled people itself.
CREATE TEMP TABLE _report AS SELECT * FROM public.match_accuracy_report();
CREATE TEMP TABLE _holdout AS SELECT * FROM public.match_accuracy_report(true);

SELECT is(
  ARRAY(SELECT (SELECT s.score FROM public.score_pair_impl(ep.person_a_id, ep.person_b_id) s)
          FROM public.eval_pairs ep ORDER BY ep.person_a_id),
  ARRAY[26, 19, 26, 0, 12, 12],
  'the six labelled pairs score 26, 19, 26, 0, 12 and 12');

SELECT is((SELECT count(*)::int FROM _report), 101, 'one row per threshold from 0 to 100');
SELECT is(
  (SELECT ARRAY[true_positives, false_positives, false_negatives, true_negatives] FROM _report WHERE threshold = 0),
  ARRAY[3, 2, 0, 0], 'threshold 0: every pair is called a match (3 right, 2 wrong)');
SELECT is((SELECT "precision" FROM _report WHERE threshold = 0), 0.6::numeric, 'threshold 0: precision 0.6');
SELECT is((SELECT recall FROM _report WHERE threshold = 0), 1::numeric, 'threshold 0: recall 1');

SELECT is(
  (SELECT ARRAY[true_positives, false_positives, false_negatives, true_negatives] FROM _report WHERE threshold = 12),
  ARRAY[3, 1, 0, 1], 'threshold 12: the brothers drop out');
SELECT is((SELECT "precision" FROM _report WHERE threshold = 12), 0.75::numeric, 'threshold 12: precision 0.75');
SELECT is((SELECT recall FROM _report WHERE threshold = 12), 1::numeric, 'threshold 12: recall 1');

SELECT is(
  (SELECT ARRAY[true_positives, false_positives, false_negatives, true_negatives] FROM _report WHERE threshold = 13),
  ARRAY[2, 1, 1, 1], 'threshold 13: the names-only match is missed');
SELECT is((SELECT "precision" FROM _report WHERE threshold = 13), 0.6667::numeric, 'threshold 13: precision 0.6667');
SELECT is((SELECT recall FROM _report WHERE threshold = 13), 0.6667::numeric, 'threshold 13: recall 0.6667');

SELECT is(
  (SELECT ARRAY[true_positives, false_positives, false_negatives, true_negatives] FROM _report WHERE threshold = 20),
  ARRAY[1, 1, 2, 1], 'threshold 20: one true match and the namesakes remain');
SELECT is((SELECT "precision" FROM _report WHERE threshold = 20), 0.5::numeric, 'threshold 20: precision 0.5');
SELECT is((SELECT recall FROM _report WHERE threshold = 20), 0.3333::numeric, 'threshold 20: recall 0.3333');

SELECT is(
  (SELECT ARRAY[true_positives, false_positives, false_negatives, true_negatives] FROM _report WHERE threshold = 27),
  ARRAY[0, 0, 3, 2], 'threshold 27: nothing reaches the threshold');
SELECT ok(
  (SELECT "precision" IS NULL AND recall = 0 FROM _report WHERE threshold = 27),
  'threshold 27: precision is empty (no pair called a match), recall 0');

SELECT is(
  (SELECT ARRAY[true_positives, false_positives, false_negatives, true_negatives] FROM _holdout WHERE threshold = 12),
  ARRAY[1, 0, 0, 0], 'the held-out pair is reported separately, not mixed into the main numbers');

-- ── admin only ──────────────────────────────────────────────────────────────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT * FROM public.match_accuracy_report() $$,
  '42501', 'not_authorized', 'a signed-in user who is not an admin is refused');

SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
SELECT is(
  (SELECT "precision" FROM public.match_accuracy_report() WHERE threshold = 12),
  0.75::numeric, 'an admin gets the report through the API');
RESET role;

SELECT ok(
  NOT has_function_privilege('anon', 'public.match_accuracy_report(boolean)', 'EXECUTE'),
  'anon cannot call the report');

SELECT * FROM finish();
ROLLBACK;
