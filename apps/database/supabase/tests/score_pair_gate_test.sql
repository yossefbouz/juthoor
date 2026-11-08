-- pgTAP: score_pair AIO-100 gate — score_pct, disagreement vetoes, cluster
-- gating, raw-point thresholds 90/76 (D4/Q3).
BEGIN;
SELECT plan(13);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'o1@test.juthoor', 'authenticated', 'authenticated'),
  ('d2000000-0000-0000-0000-000000000002', 'o2@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'T1', 'd1000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000002', 'T2', 'd2000000-0000-0000-0000-000000000002');

INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('f0000000-0000-0000-0000-0000000000a1', 'e1000000-0000-0000-0000-000000000001', 'M'),
  ('f0000000-0000-0000-0000-0000000000a2', 'e2000000-0000-0000-0000-000000000002', 'M'),
  ('f0000000-0000-0000-0000-0000000000b1', 'e1000000-0000-0000-0000-000000000001', 'M'),
  ('f0000000-0000-0000-0000-0000000000b2', 'e2000000-0000-0000-0000-000000000002', 'M'),
  ('f0000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000001', 'M'),
  ('f0000000-0000-0000-0000-0000000000c2', 'e2000000-0000-0000-0000-000000000002', 'M'),
  ('f0000000-0000-0000-0000-0000000000d1', 'e1000000-0000-0000-0000-000000000001', 'M'),
  ('f0000000-0000-0000-0000-0000000000d2', 'e2000000-0000-0000-0000-000000000002', 'M'),
  ('f0000000-0000-0000-0000-0000000000e1', 'e1000000-0000-0000-0000-000000000001', 'M'),
  ('f0000000-0000-0000-0000-0000000000e2', 'e2000000-0000-0000-0000-000000000002', 'M');

-- Rich pair: every AIO-100 field agrees (incl. spouse given+surname). Max score 100.
INSERT INTO public.match_features (person_id, tree_id, gender, is_living,
  given_norm, given_phon, surname_norm, surname_phon, father_norm, father_phon,
  mother_norm, mother_phon, pgf_norm, pgf_phon, mgf_norm, mgf_phon,
  spouse_names_norm, spouse_names_phon, spouse_surnames_norm, spouse_surnames_phon,
  origin_place_id, birth_year, birth_place_id,
  death_year, death_place_id, num_children)
SELECT v.pid::uuid, v.tid::uuid, 'M', v.living,
  public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),public.normalize_arabic('خطيب'),public.arabic_phonetic('خطيب'),
  public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),public.normalize_arabic('فاطمة'),public.arabic_phonetic('فاطمة'),
  public.normalize_arabic('خليل'),public.arabic_phonetic('خليل'),
  public.normalize_arabic('سالم'),public.arabic_phonetic('سالم'),
  ARRAY[public.normalize_arabic('ليلى')], ARRAY[public.arabic_phonetic('ليلى')],
  ARRAY[public.normalize_arabic('حداد')], ARRAY[public.arabic_phonetic('حداد')],
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
  ('f0000000-0000-0000-0000-0000000000e1','e1000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),public.normalize_arabic('خطيب'),public.arabic_phonetic('خطيب'),
   public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),public.normalize_arabic('فاطمة'),public.arabic_phonetic('فاطمة'),
   public.normalize_arabic('سالم'),public.arabic_phonetic('سالم'),NULL,NULL,1950,'e1000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000e2','e2000000-0000-0000-0000-000000000002','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),public.normalize_arabic('خطيب'),public.arabic_phonetic('خطيب'),
   public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),public.normalize_arabic('فاطمة'),public.arabic_phonetic('فاطمة'),
   public.normalize_arabic('سالم'),public.arabic_phonetic('سالم'),NULL,NULL,1950,'e1000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000b1','e1000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),NULL,NULL,public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),
   public.normalize_arabic('فاطمة'),public.arabic_phonetic('فاطمة'),NULL,NULL,NULL,NULL,NULL,NULL),
  ('f0000000-0000-0000-0000-0000000000b2','e2000000-0000-0000-0000-000000000002','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),NULL,NULL,public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),
   public.normalize_arabic('ليلى'),public.arabic_phonetic('ليلى'),NULL,NULL,NULL,NULL,NULL,NULL),
  ('f0000000-0000-0000-0000-0000000000d1','e1000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),NULL,NULL,public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),
   NULL,NULL,NULL,NULL,public.normalize_arabic('خليل'),public.arabic_phonetic('خليل'),NULL,NULL),
  ('f0000000-0000-0000-0000-0000000000d2','e2000000-0000-0000-0000-000000000002','M',false,
   public.normalize_arabic('احمد'),public.arabic_phonetic('احمد'),NULL,NULL,public.normalize_arabic('محمد'),public.arabic_phonetic('محمد'),
   NULL,NULL,NULL,NULL,public.normalize_arabic('خليل'),public.arabic_phonetic('خليل'),NULL,NULL);

-- 1. score_pct in (0, 1] and perfect agreement hits 100
SELECT cmp_ok((SELECT (breakdown->'meta'->>'score_pct')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  '>', 0.0, 'score_pct is positive for a duplicate');
SELECT is((SELECT score FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  100, 'perfect AIO-100 agreement scores exactly 100');

-- 2. present-but-different mother → disagreement veto + review
SELECT ok((SELECT breakdown->'meta'->'vetoes' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000b1','f0000000-0000-0000-0000-0000000000b2')) @> '["mother_disagree"]',
  'present-but-different mother is vetoed');

-- 3. rich deceased duplicate auto-links at raw threshold 90
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  'auto_link', 'rich duplicate with non-patriline corroborator auto-links');
SELECT is((SELECT (breakdown->'meta'->>'threshold')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  90::numeric, 'a deceased pair is judged against the raw 90-point threshold');

-- 4. living pair uses raw threshold 76
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000c2')),
  'auto_link', 'a living pair auto-links when it meets the living threshold');
SELECT is((SELECT (breakdown->'meta'->>'threshold')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000c2')),
  76::numeric, 'a living pair is judged against the raw 76-point threshold');
UPDATE public.app_settings SET link_threshold_living = 50;
SELECT is((SELECT (breakdown->'meta'->>'threshold')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000c2')),
  50::numeric, 'the living threshold is read from app_settings');

-- 4b. sparse pair stays in review; living pairs rescale to 86
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000e1','f0000000-0000-0000-0000-0000000000e2')),
  'review', 'a sparse pair with all of its few fields agreeing stays in review');
SELECT cmp_ok((SELECT (breakdown->'meta'->>'score_pct')::numeric FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000e1','f0000000-0000-0000-0000-0000000000e2')),
  '<=', 0.6, 'its score stays well below the auto-link band on the AIO-100 scale');
SELECT is((SELECT (breakdown->'meta'->>'full_scale')::int FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000c2')),
  86, 'living pairs use full_scale 86 (death fields excluded)');
SELECT is((SELECT (breakdown->'meta'->>'full_scale')::int FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-0000000000a2')),
  100, 'deceased pairs use full_scale 100');

-- 5. patriline-only match stays review
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'f0000000-0000-0000-0000-0000000000d1','f0000000-0000-0000-0000-0000000000d2')),
  'review', 'patriline-only match is not enough to auto-link');

SELECT finish();
ROLLBACK;
