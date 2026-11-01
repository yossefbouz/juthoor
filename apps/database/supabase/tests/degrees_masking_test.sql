-- pgTAP: degrees-path masking (M0 security fix, plan §5.1).
-- Proves is_person_living() semantics and that compute_degrees() masks a living
-- interior node while revealing the caller's own source node.
BEGIN;
SELECT plan(9);

-- ── Fixtures (as the pg_prove superuser) ─────────────────────────────────────
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'viewer@test.juthoor', 'authenticated', 'authenticated');

INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Public Tree', 'a0000000-0000-0000-0000-000000000001', true);

-- self (living), interior (living), target (deceased), plus old + unknown for the unit tests
INSERT INTO public.persons (id, tree_id, gender, display_name_ar, display_name_en) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'M', 'أنا',    'Me'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'F', 'حيّة',    'LivingOne'),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'M', 'متوفى',  'DeceasedOne'),
  ('c0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000001', 'M', 'قديم',   'OldOne'),
  ('c0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000001', 'U', 'مجهول',  'UnknownOne');

INSERT INTO public.events (person_id, event_type, date_year) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'BIRT', 1980),
  ('c0000000-0000-0000-0000-000000000002', 'BIRT', 2000),
  ('c0000000-0000-0000-0000-000000000003', 'DEAT', 1990),
  ('c0000000-0000-0000-0000-000000000009', 'BIRT', 1850);

-- spouse edges: self ↔ interior ↔ target
INSERT INTO public.families (id, tree_id, partner1_id, partner2_id) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003');

-- ── is_person_living() semantics ─────────────────────────────────────────────
SELECT is(public.is_person_living('c0000000-0000-0000-0000-000000000002'), true,  'birth 2000, no death -> living');
SELECT is(public.is_person_living('c0000000-0000-0000-0000-000000000003'), false, 'has DEAT -> not living');
SELECT is(public.is_person_living('c0000000-0000-0000-0000-000000000001'), true,  'birth 1980, no death -> living');
SELECT is(public.is_person_living('c0000000-0000-0000-0000-000000000009'), false, 'birth 1850 (150+ years ago) -> not living');
SELECT is(public.is_person_living('c0000000-0000-0000-0000-000000000008'), true,  'no events -> fail toward living');

-- ── compute_degrees() masking, as the (non-admin) viewer ─────────────────────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT is(
  (public.compute_degrees('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003') ->> 'degrees')::int,
  2, 'degrees self->interior->target = 2');

SELECT is(
  (public.compute_degrees('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003') -> 'path' -> 1 ->> 'name_ar'),
  'فردٌ على المسار', 'living interior node name is redacted');

SELECT is(
  (public.compute_degrees('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003') -> 'path' -> 1 ->> 'gender'),
  NULL, 'living interior node gender is hidden');

SELECT is(
  (public.compute_degrees('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003') -> 'path' -> 0 ->> 'name_ar'),
  'أنا', 'self node revealed even though living (caller''s own node)');

SELECT finish();
ROLLBACK;
