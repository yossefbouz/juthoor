-- pgTAP: D8 person_identifiers perfect-match short-circuit (UNRWA / family card).
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'o1@test.juthoor', 'authenticated', 'authenticated'),
  ('aa000000-0000-0000-0000-000000000002', 'o2@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id) VALUES
  ('bb000000-0000-0000-0000-000000000001', 'T1', 'aa000000-0000-0000-0000-000000000001'),
  ('bb000000-0000-0000-0000-000000000002', 'T2', 'aa000000-0000-0000-0000-000000000002');

INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('cc000000-0000-0000-0000-0000000000a1', 'bb000000-0000-0000-0000-000000000001', 'M'),
  ('cc000000-0000-0000-0000-0000000000a2', 'bb000000-0000-0000-0000-000000000002', 'M'),
  ('cc000000-0000-0000-0000-0000000000b1', 'bb000000-0000-0000-0000-000000000001', 'M'),
  ('cc000000-0000-0000-0000-0000000000b2', 'bb000000-0000-0000-0000-000000000002', 'F'),
  ('cc000000-0000-0000-0000-0000000000c1', 'bb000000-0000-0000-0000-000000000001', 'M'),
  ('cc000000-0000-0000-0000-0000000000c2', 'bb000000-0000-0000-0000-000000000002', 'M');

-- Sparse features (would not auto-link on score alone)
INSERT INTO public.match_features (person_id, tree_id, gender, is_living, given_norm, given_phon) VALUES
  ('cc000000-0000-0000-0000-0000000000a1','bb000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد')),
  ('cc000000-0000-0000-0000-0000000000a2','bb000000-0000-0000-0000-000000000002','M',false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد')),
  ('cc000000-0000-0000-0000-0000000000b1','bb000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد')),
  ('cc000000-0000-0000-0000-0000000000b2','bb000000-0000-0000-0000-000000000002','F',false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد')),
  ('cc000000-0000-0000-0000-0000000000c1','bb000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد')),
  ('cc000000-0000-0000-0000-0000000000c2','bb000000-0000-0000-0000-000000000002','M',false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد'));

-- UNRWA shared value → perfect match
INSERT INTO public.person_identifiers (person_id, id_type, id_value) VALUES
  ('cc000000-0000-0000-0000-0000000000a1', 'unrwa_registration', 'UNRWA-42'),
  ('cc000000-0000-0000-0000-0000000000a2', 'unrwa_registration', 'UNRWA-42');

SELECT is((SELECT score FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000a2')),
  100, 'shared UNRWA id short-circuits to score 100');
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000a2')),
  'auto_link', 'UNRWA perfect match is auto_link eligible');
SELECT is((SELECT breakdown->'meta'->>'identifier_match' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000a2')),
  'unrwa_registration', 'meta records UNRWA identifier_match');

-- UNRWA + gender mismatch → still score 100 but review
INSERT INTO public.person_identifiers (person_id, id_type, id_value) VALUES
  ('cc000000-0000-0000-0000-0000000000b1', 'unrwa_registration', 'UNRWA-99'),
  ('cc000000-0000-0000-0000-0000000000b2', 'unrwa_registration', 'UNRWA-99');
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000b1','cc000000-0000-0000-0000-0000000000b2')),
  'review', 'UNRWA perfect match still respects hard vetoes');
SELECT ok((SELECT breakdown->'meta'->'vetoes' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000b1','cc000000-0000-0000-0000-0000000000b2')) @> '["gender_mismatch"]',
  'gender mismatch veto present on UNRWA pair');

-- Family card: same id_value + given_norm agrees → perfect match
INSERT INTO public.person_identifiers (person_id, id_type, id_value) VALUES
  ('cc000000-0000-0000-0000-0000000000c1', 'family_card_1948', 'FC-1948-7'),
  ('cc000000-0000-0000-0000-0000000000c2', 'family_card_1948', 'FC-1948-7');
SELECT is((SELECT breakdown->'meta'->>'identifier_match' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000c1','cc000000-0000-0000-0000-0000000000c2')),
  'family_card_1948', '1948 family card short-circuits when given_norm agrees');

SELECT finish();
ROLLBACK;
