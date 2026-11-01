-- pgTAP: score_pair refined gate — score_pct, disagreement vetoes, cluster
-- gating, decision (plan §4, B9b).
BEGIN;
SELECT plan(13);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'o1@test.juthoor', 'authenticated', 'authenticated'),
  ('d2000000-0000-0000-0000-000000000002', 'o2@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'T1', 'd1000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000002', 'T2', 'd2000000-0000-0000-0000-000000000002');

-- 8 persons across two trees
INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('f0000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-000000000001', 'M'),  -- dupA
  ('f0000000-0000-0000-0000-0000000000a2', 'e2000000-0000-0000-0000-000000000002', 'M'),  -- dupB
  ('f0000000-0000-0000-0000-0000000000b1', 'e1000000-0000-0000-0000-000000000001', 'M'),  -- momdiffA
  ('f0000000-0000-0000-0000-0000000000b2', 'e2000000-0000-0000-0000-000000000002', 'M'),  -- momdiffB
  ('f0000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000001', 'M'),  -- livingA
  ('f0000000-0000-0000-0000-0000000000c2', 'e2000000-0000-0000-0000-000000000002', 'M'),  -- livingB (living)
  ('f0000000-0000-0000-0000-0000000000d1', 'e1000000-0000-0000-0000-000000000001', 'M'),  -- patriA
  ('f0000000-0000-0000-0000-0000000000d2', 'e2000000-0000-0000-0000-000000000002', 'M'),  -- patriB
  ('f0000000-0000-0000-0000-0000000000e1', 'e1000000-0000-0000-0000-000000000001', 'M'),  -- sparseA
  ('f0000000-0000-0000-0000-0000000000e2', 'e2000000-0000-0000-0000-000000000002', 'M');  -- sparseB

-- A rich pair carries every field the scale scores, so it clears the 90% / 76% thresholds on
-- the full scale. Death date and place are filled in only for the deceased pair.
INSERT INTO public.match_features (person_id, tree_id, gender, is_living,
  given_norm, given_phon, surname_norm, surname_phon, father_norm, father_phon,
  mother_norm, mother_phon, pgf_norm, pgf_phon, pgm_norm, pgm_phon, mgf_norm, mgf_phon, mgm_norm, mgm_phon,
  spouse_names_norm, spouse_names_phon, origin_place_id, birth_year, birth_place_id,
  death_year, death_place_id, num_children)
SELECT v.pid::uuid, v.tid::uuid, 'M', v.living,
  public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),public.normalize_arabic('خطيب'),public.arabic_phonetic('خطيب'),
  public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),public.normalize_arabic('فاطمة'),public.arabic_phonetic('فاطمة'),
  public.normalize_arabic('خليل'),public.arabic_phonetic('خليل'),public.normalize_arabic('عائشة'),public.arabic_phonetic('عائشة'),
  public.normalize_arabic('سالم'),public.arabic_phonetic('سالم'),public.normalize_arabic('زينب'),public.arabic_phonetic('زينب'),
  ARRAY[public.normalize_arabic('ليلى')], ARRAY[public.arabic_phonetic('ليلى')],
  'e1000000-0000-0000-0000-000000000001'::uuid, 1950, 'e1000000-0000-0000-0000-000000000001'::uuid,
  CASE WHEN v.dead THEN 2010 END, CASE WHEN v.dead THEN 'e1000000-0000-0000-0000-000000000001'::uuid END, 3
FROM (VALUES
  ('f0000000-0000-0000-0000-0000000000a1','e1000000-0000-0000-0000-000000000001',false,true),
  ('f0000000-0000-0000-0000-0000000000a2','e2000000-0000-0000-0000-000000000002',false,true),
  ('f0000000-0000-0000-0000-0000000000c1','e1000000-0000-0000-0000-000000000001',false,false),
  ('f0000000-0000-0000-0000-0000000000c2','e2000000-0000-0000-0000-000000000002',true,false)
) AS v(pid, tid, living, dead);

INSERT INTO public.match_features (person_id, tree_id, gender, is_living,
  given_norm, given_phon, surname_norm, surname_phon, father_norm, father_phon,
  mother_norm, mother_phon, mgf_norm, mgf_phon, pgf_norm, pgf_phon, birth_year, birth_place_id) VALUES
  -- sparse: only a common name, birth year and birth place in common (about 43% of the scale)
  ('f0000000-0000-0000-0000-0000000000e1','e1000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),public.normalize_arabic('خطيب'),public.arabic_phonetic('خطيب'),
   public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),public.normalize_arabic('فاطمة'),public.arabic_phonetic('فاطمة'),
   public.normalize_arabic('سالم'),public.arabic_phonetic('سالم'),NULL,NULL,1950,'e1000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000e2','e2000000-0000-0000-0000-000000000002','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),public.normalize_arabic('خطيب'),public.arabic_phonetic('خطيب'),
   public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),public.normalize_arabic('فاطمة'),public.arabic_phonetic('فاطمة'),
   public.normalize_arabic('سالم'),public.arabic_phonetic('سالم'),NULL,NULL,1950,'e1000000-0000-0000-0000-000000000001'),
  -- momdiff: same given+father, DIFFERENT mother
  ('f0000000-0000-0000-0000-0000000000b1','e1000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),NULL,NULL,public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),
   public.normalize_arabic('فاطمة'),public.arabic_phonetic('فاطمة'),NULL,NULL,NULL,NULL,NULL,NULL),
  ('f0000000-0000-0000-0000-0000000000b2','e2000000-0000-0000-0000-000000000002','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),NULL,NULL,public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),
   public.normalize_arabic('ليلى'),public.arabic_phonetic('ليلى'),NULL,NULL,NULL,NULL,NULL,NULL),
  -- patriline-only: given+father+pgf, nothing else
  ('f0000000-0000-0000-0000-0000000000d1','e1000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),NULL,NULL,public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),
   NULL,NULL,NULL,NULL,public.normalize_arabic('خليل'),public.arabic_phonetic('خليل'),NULL,NULL),
  ('f0000000-0000-0000-0000-0000000000d2','e2000000-0000-0000-0000-000000000002','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),NULL,NULL,public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),
   NULL,NULL,NULL,NULL,public.normalize_arabic('خليل'),public.arabic_phonetic('خليل'),NULL,NULL);

-- 1. score_pct in (0, 1]
SELECT cmp_ok((SELECT (breakdown->'meta'->>'score_pct')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  '>', 0.0, 'score_pct is positive for a duplicate');
SELECT cmp_ok((SELECT (breakdown->'meta'->>'score_pct')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  '<=', 1.0, 'score_pct never exceeds 1.0');

-- 2. present-but-different mother → disagreement veto + review
SELECT ok((SELECT breakdown->'meta'->'vetoes' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000b1','f0000000-0000-0000-0000-0000000000b2')) @> '["mother_disagree"]',
  'present-but-different mother is vetoed');

-- 3. a rich cross-tree duplicate (both deceased) auto-links at the 90% threshold
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  'auto_link', 'rich duplicate with non-patriline corroborator auto-links');
SELECT is((SELECT (breakdown->'meta'->>'threshold')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  0.90, 'a deceased pair is judged against the 90% threshold');

-- 4. a pair with a living person auto-links too (AIO: link at 76%, then notify the owners)
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000c2')),
  'auto_link', 'a living pair auto-links when it meets the living threshold');
SELECT is((SELECT (breakdown->'meta'->>'threshold')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000c2')),
  0.76, 'a living pair is judged against the 76% threshold');
UPDATE public.app_settings SET link_threshold_living = 0.5;
SELECT is((SELECT (breakdown->'meta'->>'threshold')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000c2')),
  0.5, 'the living threshold is read from app_settings');

-- 4b. a sparse pair (name, birth year, birth place only) stays in review, even though everything
-- it has in common agrees: a missing field counts as zero on the full scale
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000e1','f0000000-0000-0000-0000-0000000000e2')),
  'review', 'a sparse pair with all of its few fields agreeing stays in review');
SELECT cmp_ok((SELECT (breakdown->'meta'->>'score_pct')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000e1','f0000000-0000-0000-0000-0000000000e2')),
  '<', 0.5, 'its score is well under half of the full scale');
SELECT is((SELECT (breakdown->'meta'->>'full_scale')::int FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000c2')),
  275, 'a living pair is scored out of 275 (no death fields)');
SELECT is((SELECT (breakdown->'meta'->>'full_scale')::int FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  325, 'a deceased pair is scored out of 325');

-- 5. patriline-only match (no non-patriline corroborator) stays review
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000d1','f0000000-0000-0000-0000-0000000000d2')),
  'review', 'patriline-only match is not enough to auto-link');

SELECT finish();
ROLLBACK;
