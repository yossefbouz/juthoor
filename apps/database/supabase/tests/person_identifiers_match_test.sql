-- pgTAP: D8/D9 person_identifiers perfect-match short-circuit.
-- Perfect match needs shared id_value + Platform Admin verification on BOTH sides.
BEGIN;
SELECT plan(8);

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
  ('cc000000-0000-0000-0000-0000000000c2', 'bb000000-0000-0000-0000-000000000002', 'M'),
  ('cc000000-0000-0000-0000-0000000000d1', 'bb000000-0000-0000-0000-000000000001', 'M'),
  ('cc000000-0000-0000-0000-0000000000d2', 'bb000000-0000-0000-0000-000000000002', 'M');

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
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد')),
  ('cc000000-0000-0000-0000-0000000000d1','bb000000-0000-0000-0000-000000000001','M',false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد')),
  ('cc000000-0000-0000-0000-0000000000d2','bb000000-0000-0000-0000-000000000002','M',false,
   public.normalize_arabic('احمد'), public.arabic_phonetic('احمد'));

INSERT INTO public.person_attachments (
  id, person_id, kind, tag, storage_path, mime_type, size_bytes, uploaded_by
) VALUES
  ('dd000000-0000-0000-0000-0000000000e1', 'cc000000-0000-0000-0000-0000000000a1', 'document', 'id_card', 't1/e1', 'image/jpeg', 100, 'aa000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-0000000000e2', 'cc000000-0000-0000-0000-0000000000a2', 'document', 'id_card', 't2/e2', 'image/jpeg', 100, 'aa000000-0000-0000-0000-000000000002'),
  ('dd000000-0000-0000-0000-0000000000e3', 'cc000000-0000-0000-0000-0000000000b1', 'document', 'id_card', 't1/e3', 'image/jpeg', 100, 'aa000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-0000000000e4', 'cc000000-0000-0000-0000-0000000000b2', 'document', 'id_card', 't2/e4', 'image/jpeg', 100, 'aa000000-0000-0000-0000-000000000002'),
  ('dd000000-0000-0000-0000-0000000000e5', 'cc000000-0000-0000-0000-0000000000d1', 'document', 'id_card', 't1/e5', 'image/jpeg', 100, 'aa000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-0000000000e6', 'cc000000-0000-0000-0000-0000000000c1', 'document', 'family_card', 't1/e6', 'image/jpeg', 100, 'aa000000-0000-0000-0000-000000000001'),
  ('dd000000-0000-0000-0000-0000000000e7', 'cc000000-0000-0000-0000-0000000000c2', 'document', 'family_card', 't2/e7', 'image/jpeg', 100, 'aa000000-0000-0000-0000-000000000002');

-- Helper: stamp D9 verification as the migration owner (not authenticated).
CREATE OR REPLACE FUNCTION public._test_verify_id(p_person uuid, p_type text, p_att uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE public.person_identifiers
     SET verified_at = now(),
         verified_by = 'aa000000-0000-0000-0000-000000000001',
         verified_attachment_id = p_att,
         evidence_attachment_id = COALESCE(evidence_attachment_id, p_att)
   WHERE person_id = p_person AND id_type = p_type;
END $$;

-- UNRWA shared value + verified on BOTH sides → perfect match
INSERT INTO public.person_identifiers (person_id, id_type, id_value, evidence_attachment_id) VALUES
  ('cc000000-0000-0000-0000-0000000000a1', 'unrwa_registration', 'UNRWA-42', 'dd000000-0000-0000-0000-0000000000e1'),
  ('cc000000-0000-0000-0000-0000000000a2', 'unrwa_registration', 'UNRWA-42', 'dd000000-0000-0000-0000-0000000000e2');
SELECT public._test_verify_id('cc000000-0000-0000-0000-0000000000a1', 'unrwa_registration', 'dd000000-0000-0000-0000-0000000000e1');
SELECT public._test_verify_id('cc000000-0000-0000-0000-0000000000a2', 'unrwa_registration', 'dd000000-0000-0000-0000-0000000000e2');

SELECT is((SELECT score FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000a2')),
  100, 'shared UNRWA id short-circuits to score 100');
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000a2')),
  'auto_link', 'UNRWA perfect match is auto_link eligible');
SELECT is((SELECT breakdown->'meta'->>'identifier_match' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000a2')),
  'unrwa_registration', 'meta records UNRWA identifier_match');

-- Evidence without D9 verification must NOT perfect-match
INSERT INTO public.person_identifiers (person_id, id_type, id_value, evidence_attachment_id) VALUES
  ('cc000000-0000-0000-0000-0000000000d1', 'unrwa_registration', 'UNRWA-ONE', 'dd000000-0000-0000-0000-0000000000e5'),
  ('cc000000-0000-0000-0000-0000000000d2', 'unrwa_registration', 'UNRWA-ONE', NULL);
SELECT is((SELECT breakdown->'meta'->>'identifier_match' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000d1','cc000000-0000-0000-0000-0000000000d2')),
  NULL, 'UNRWA without admin verification on both sides does not short-circuit');

-- UNRWA + gender mismatch → still score 100 but review
INSERT INTO public.person_identifiers (person_id, id_type, id_value, evidence_attachment_id) VALUES
  ('cc000000-0000-0000-0000-0000000000b1', 'unrwa_registration', 'UNRWA-99', 'dd000000-0000-0000-0000-0000000000e3'),
  ('cc000000-0000-0000-0000-0000000000b2', 'unrwa_registration', 'UNRWA-99', 'dd000000-0000-0000-0000-0000000000e4');
SELECT public._test_verify_id('cc000000-0000-0000-0000-0000000000b1', 'unrwa_registration', 'dd000000-0000-0000-0000-0000000000e3');
SELECT public._test_verify_id('cc000000-0000-0000-0000-0000000000b2', 'unrwa_registration', 'dd000000-0000-0000-0000-0000000000e4');
SELECT is((SELECT breakdown->'meta'->>'decision' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000b1','cc000000-0000-0000-0000-0000000000b2')),
  'review', 'UNRWA perfect match still respects hard vetoes');
SELECT ok((SELECT breakdown->'meta'->'vetoes' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000b1','cc000000-0000-0000-0000-0000000000b2')) @> '["gender_mismatch"]',
  'gender mismatch veto present on UNRWA pair');

-- Family card: same id_value + given_norm + both verified → perfect match
INSERT INTO public.person_identifiers (person_id, id_type, id_value, evidence_attachment_id) VALUES
  ('cc000000-0000-0000-0000-0000000000c1', 'family_card_1948', 'FC-1948-7', 'dd000000-0000-0000-0000-0000000000e6'),
  ('cc000000-0000-0000-0000-0000000000c2', 'family_card_1948', 'FC-1948-7', 'dd000000-0000-0000-0000-0000000000e7');
SELECT public._test_verify_id('cc000000-0000-0000-0000-0000000000c1', 'family_card_1948', 'dd000000-0000-0000-0000-0000000000e6');
SELECT public._test_verify_id('cc000000-0000-0000-0000-0000000000c2', 'family_card_1948', 'dd000000-0000-0000-0000-0000000000e7');
SELECT is((SELECT breakdown->'meta'->>'identifier_match' FROM public.score_pair(
    'cc000000-0000-0000-0000-0000000000c1','cc000000-0000-0000-0000-0000000000c2')),
  'family_card_1948', '1948 family card short-circuits when given_norm agrees');

-- Unverified shared UNRWA with evidence still does not short-circuit (D9 gate)
SELECT is(
  public.person_identifier_verified('cc000000-0000-0000-0000-0000000000d1', 'unrwa_registration'),
  false,
  'evidence alone is not enough without admin verification'
);

SELECT finish();
ROLLBACK;
