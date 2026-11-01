-- pgTAP: perfect-match identifiers (D8) — UNRWA card number (card copy required) and 1948
-- family-card number (given name must also agree) auto-link whatever the score.
BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a7000000-0000-0000-0000-000000000001', 'o1@test.juthoor', 'authenticated', 'authenticated'),
  ('a7000000-0000-0000-0000-000000000002', 'o2@test.juthoor', 'authenticated', 'authenticated'),
  ('a7000000-0000-0000-0000-000000000003', 'o3@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id) VALUES
  ('e7000000-0000-0000-0000-000000000001', 'T1', 'a7000000-0000-0000-0000-000000000001'),
  ('e7000000-0000-0000-0000-000000000002', 'T2', 'a7000000-0000-0000-0000-000000000002');

-- u: same UNRWA number, both with the card copy, completely different names
-- v: same UNRWA number, only one card copy
-- f: same family card, same given name, different surname
-- s: same family card, different given names (siblings)
-- g: same UNRWA number and copies, but different genders
INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('01000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'M'),
  ('01000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002', 'M'),
  ('02000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'M'),
  ('02000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002', 'M'),
  ('03000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'F'),
  ('03000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002', 'F'),
  ('04000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'M'),
  ('04000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002', 'M'),
  ('05000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'M'),
  ('05000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002', 'F');
INSERT INTO public.person_names (person_id, is_primary, given_name, surname) VALUES
  ('01000000-0000-0000-0000-000000000001', true, 'سامي', 'القاسم'),
  ('01000000-0000-0000-0000-000000000002', true, 'محمود', 'الحداد'),
  ('02000000-0000-0000-0000-000000000001', true, 'خالد', 'النمر'),
  ('02000000-0000-0000-0000-000000000002', true, 'ياسر', 'البيطار'),
  ('03000000-0000-0000-0000-000000000001', true, 'ليلى', 'سعيد'),
  ('03000000-0000-0000-0000-000000000002', true, 'ليلى', 'الخوري'),
  ('04000000-0000-0000-0000-000000000001', true, 'سمير', 'عبيد'),
  ('04000000-0000-0000-0000-000000000002', true, 'عادل', 'عبيد'),
  ('05000000-0000-0000-0000-000000000001', true, 'نبيل', 'جابر'),
  ('05000000-0000-0000-0000-000000000002', true, 'هدى', 'الصفدي');
INSERT INTO public.person_identifiers (person_id, kind, value) VALUES
  ('01000000-0000-0000-0000-000000000001', 'unrwa_card', '12-345/6'),
  ('01000000-0000-0000-0000-000000000002', 'unrwa_card', '123456'),
  ('02000000-0000-0000-0000-000000000001', 'unrwa_card', 'AB9999'),
  ('02000000-0000-0000-0000-000000000002', 'unrwa_card', 'ab-9999'),
  ('03000000-0000-0000-0000-000000000001', 'family_card_1948', 'FC-77'),
  ('03000000-0000-0000-0000-000000000002', 'family_card_1948', 'fc 77'),
  ('04000000-0000-0000-0000-000000000001', 'family_card_1948', 'FC-88'),
  ('04000000-0000-0000-0000-000000000002', 'family_card_1948', 'FC-88'),
  ('05000000-0000-0000-0000-000000000001', 'unrwa_card', 'ZZ1234'),
  ('05000000-0000-0000-0000-000000000002', 'unrwa_card', 'ZZ1234');
-- card copies: u both, v only one side, g both
INSERT INTO public.person_attachments (person_id, kind, tag, storage_path, mime_type, size_bytes)
  SELECT p, 'document', 'unrwa_card', 'x/' || p || '.pdf', 'application/pdf', 1000
  FROM unnest(ARRAY[
    '01000000-0000-0000-0000-000000000001', '01000000-0000-0000-0000-000000000002',
    '02000000-0000-0000-0000-000000000001',
    '05000000-0000-0000-0000-000000000001', '05000000-0000-0000-0000-000000000002']::uuid[]) AS p;

SELECT is((SELECT value_norm FROM public.person_identifiers WHERE person_id = '01000000-0000-0000-0000-000000000001'),
  '123456', 'the number is normalised to letters and digits');

SELECT is(public.identifier_perfect_match('01000000-0000-0000-0000-000000000001','01000000-0000-0000-0000-000000000002'),
  'unrwa_card', 'same UNRWA number with a card copy on both is a perfect match');
SELECT is(public.identifier_perfect_match('02000000-0000-0000-0000-000000000001','02000000-0000-0000-0000-000000000002'),
  NULL, 'without a card copy on both people the UNRWA number does not count');
SELECT is(public.identifier_perfect_match('03000000-0000-0000-0000-000000000001','03000000-0000-0000-0000-000000000002'),
  NULL, 'before features exist a family card cannot confirm the given name');

-- build features, then run the batch with automatic linking on
UPDATE public.app_settings SET auto_merge_enabled = true;
SELECT ok(public.run_matching_batch(true) IS NOT NULL, 'the batch runs');

SELECT is(public.identifier_perfect_match('03000000-0000-0000-0000-000000000001','03000000-0000-0000-0000-000000000002'),
  'family_card_1948', 'same family card and given name is a perfect match');
SELECT is(public.identifier_perfect_match('04000000-0000-0000-0000-000000000001','04000000-0000-0000-0000-000000000002'),
  NULL, 'siblings sharing a family card (different given names) are not a perfect match');

SELECT is((SELECT status::text FROM public.matches WHERE person_a_id = '01000000-0000-0000-0000-000000000001'),
  'auto_merged', 'a UNRWA match links even though the names share nothing');
SELECT is((SELECT status::text FROM public.matches WHERE person_a_id = '03000000-0000-0000-0000-000000000001'),
  'auto_merged', 'a family-card plus given-name match links');
SELECT isnt((SELECT status::text FROM public.matches WHERE person_a_id = '02000000-0000-0000-0000-000000000001'),
  'auto_merged', 'a UNRWA number without both card copies does not link');
SELECT isnt((SELECT status::text FROM public.matches WHERE person_a_id = '04000000-0000-0000-0000-000000000001'),
  'auto_merged', 'siblings are not linked by the family card');
SELECT is((SELECT count(*)::int FROM public.matches WHERE person_a_id = '05000000-0000-0000-0000-000000000001' AND status = 'auto_merged'),
  0, 'a gender mismatch still blocks a perfect match');

-- identifiers are private to people who can write the tree
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a7000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.person_identifiers), 0, 'a stranger cannot read identifiers');
SELECT set_config('request.jwt.claims','{"sub":"a7000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT cmp_ok((SELECT count(*)::int FROM public.person_identifiers), '>', 0, 'the tree owner reads the identifiers of their own tree');
RESET ROLE;

SELECT finish();
ROLLBACK;
