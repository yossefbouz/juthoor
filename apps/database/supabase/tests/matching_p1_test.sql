-- pgTAP: matching engine P1 fixes (20261113120000_matching_p1).
BEGIN;
SELECT plan(21);

-- ── names ───────────────────────────────────────────────────────────────────
SELECT is(public.normalize_arabic('مُحَمَّد'), 'محمد', 'short vowels and shadda are removed');
SELECT is(public.normalize_arabic('محـمد'), 'محمد', 'tatweel is removed, not turned into a space');
SELECT is(public.mf_strip_article('العجرمي'), 'عجرمي', 'the article is stripped from a surname');
SELECT is(public.mf_strip_article('ال الخطيب'), 'خطيب', '"آل" + article both stripped');
SELECT is(public.mf_strip_article('ال'), 'ال', 'a bare article is kept');
SELECT ok(public.mf_is_placeholder_name('أنثى 2'), 'app placeholder "أنثى N" is not a name');
SELECT ok(public.mf_is_placeholder_name('Female 3'), 'app placeholder "Female N" is not a name');
SELECT ok(NOT public.mf_is_placeholder_name('Fatima'), 'a real name is a name');
SELECT is(
  public.mf_name_skeleton(public.normalize_arabic(public.transliterate_to_arabic('Saleh'))),
  public.mf_name_skeleton(public.normalize_arabic(public.transliterate_to_arabic('صالح'))),
  'Saleh and صالح share a consonant skeleton');
SELECT isnt(
  public.mf_name_skeleton(public.normalize_arabic(public.transliterate_to_arabic('Ahmad'))),
  public.mf_name_skeleton(public.normalize_arabic(public.transliterate_to_arabic('Mohammad'))),
  'Ahmad and Mohammad do not');

-- ── fixtures: two owners, two trees ─────────────────────────────────────────
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-0000000000e1', 'owner1-p1@test.juthoor', 'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-0000000000e2', 'owner2-p1@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('b1000000-0000-0000-0000-0000000000e1', 'Tree one', 'a1000000-0000-0000-0000-0000000000e1', false),
  ('b2000000-0000-0000-0000-0000000000e2', 'Tree two', 'a2000000-0000-0000-0000-0000000000e2', false);

-- Deceased brothers in different trees (same surname, birth year), plus a
-- cross-script pair (Saleh / صالح) and a living pair.
INSERT INTO public.persons (id, tree_id, gender, display_name_en) VALUES
  ('c1000000-0000-0000-0000-0000000000e1', 'b1000000-0000-0000-0000-0000000000e1', 'M', 'Yousef'),
  ('c2000000-0000-0000-0000-0000000000e2', 'b2000000-0000-0000-0000-0000000000e2', 'M', 'Khalil'),
  ('c3000000-0000-0000-0000-0000000000e3', 'b1000000-0000-0000-0000-0000000000e1', 'M', 'Saleh'),
  ('c4000000-0000-0000-0000-0000000000e4', 'b2000000-0000-0000-0000-0000000000e2', 'M', 'Salih'),
  ('c5000000-0000-0000-0000-0000000000e5', 'b1000000-0000-0000-0000-0000000000e1', 'F', 'Rania'),
  ('c6000000-0000-0000-0000-0000000000e6', 'b2000000-0000-0000-0000-0000000000e2', 'F', 'Rania');
INSERT INTO public.person_names (person_id, is_primary, given_name, surname) VALUES
  ('c1000000-0000-0000-0000-0000000000e1', true, 'Yousef', 'Ajrami'),
  ('c2000000-0000-0000-0000-0000000000e2', true, 'خليل', 'العجرمي'),
  ('c3000000-0000-0000-0000-0000000000e3', true, 'Saleh', 'Masri'),
  ('c4000000-0000-0000-0000-0000000000e4', true, 'صالح', 'المصري'),
  ('c5000000-0000-0000-0000-0000000000e5', true, 'رانيا', 'الخطيب'),
  ('c6000000-0000-0000-0000-0000000000e6', true, 'رانيا', 'الخطيب');
INSERT INTO public.events (person_id, event_type, date_year) VALUES
  ('c1000000-0000-0000-0000-0000000000e1', 'BIRT', 1920), ('c1000000-0000-0000-0000-0000000000e1', 'DEAT', 1990),
  ('c2000000-0000-0000-0000-0000000000e2', 'BIRT', 1922), ('c2000000-0000-0000-0000-0000000000e2', 'DEAT', 1995),
  ('c3000000-0000-0000-0000-0000000000e3', 'BIRT', 1930), ('c3000000-0000-0000-0000-0000000000e3', 'DEAT', 2000),
  ('c4000000-0000-0000-0000-0000000000e4', 'BIRT', 1930), ('c4000000-0000-0000-0000-0000000000e4', 'DEAT', 2000),
  ('c5000000-0000-0000-0000-0000000000e5', 'BIRT', 1985),
  ('c6000000-0000-0000-0000-0000000000e6', 'BIRT', 1985);
SELECT public.refresh_match_features(id) FROM public.persons
 WHERE id IN ('c1000000-0000-0000-0000-0000000000e1', 'c2000000-0000-0000-0000-0000000000e2',
              'c3000000-0000-0000-0000-0000000000e3', 'c4000000-0000-0000-0000-0000000000e4',
              'c5000000-0000-0000-0000-0000000000e5', 'c6000000-0000-0000-0000-0000000000e6');

-- ── scoring ─────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT (breakdown->'params'->'surname'->>'pts')::int FROM public.score_pair_impl(
     'c1000000-0000-0000-0000-0000000000e1', 'c2000000-0000-0000-0000-0000000000e2')),
  6, '"Ajrami" and "العجرمي" score the full surname points');
SELECT ok(
  (SELECT breakdown->'meta'->'vetoes' ? 'given_disagree' FROM public.score_pair_impl(
     'c1000000-0000-0000-0000-0000000000e1', 'c2000000-0000-0000-0000-0000000000e2')),
  'brothers with different first names are vetoed (given_disagree)');
SELECT is(
  (SELECT (breakdown->'params'->'given'->>'pts')::int FROM public.score_pair_impl(
     'c3000000-0000-0000-0000-0000000000e3', 'c4000000-0000-0000-0000-0000000000e4')),
  2, 'Saleh (Latin) and صالح (Arabic) earn phonetic-level first-name points');
SELECT ok(
  NOT (SELECT breakdown->'meta'->'vetoes' ? 'given_disagree' FROM public.score_pair_impl(
     'c3000000-0000-0000-0000-0000000000e3', 'c4000000-0000-0000-0000-0000000000e4')),
  'and are not vetoed');
SELECT is(
  (SELECT (breakdown->'meta'->>'gate_score')::numeric FROM public.score_pair_impl(
     'c5000000-0000-0000-0000-0000000000e5', 'c6000000-0000-0000-0000-0000000000e6')),
  76::numeric, 'the living gate is 76 raw points, not 76% of 86');

-- ── hints ───────────────────────────────────────────────────────────────────
INSERT INTO public.matches (id, person_a_id, person_b_id, confidence_score, status) VALUES
  ('d1000000-0000-0000-0000-0000000000e1', 'c1000000-0000-0000-0000-0000000000e1', 'c2000000-0000-0000-0000-0000000000e2', 50, 'admin_rejected'),
  ('d2000000-0000-0000-0000-0000000000e2', 'c3000000-0000-0000-0000-0000000000e3', 'c4000000-0000-0000-0000-0000000000e4', 60, 'deferred');
INSERT INTO public.match_hints (id, match_id, owner_user_id, counterpart_person_id, status) VALUES
  ('e1000000-0000-0000-0000-0000000000e1', 'd1000000-0000-0000-0000-0000000000e1', 'a1000000-0000-0000-0000-0000000000e1', 'c2000000-0000-0000-0000-0000000000e2', 'pending'),
  ('e2000000-0000-0000-0000-0000000000e2', 'd2000000-0000-0000-0000-0000000000e2', 'a1000000-0000-0000-0000-0000000000e1', 'c4000000-0000-0000-0000-0000000000e4', 'accepted'),
  ('e3000000-0000-0000-0000-0000000000e3', 'd2000000-0000-0000-0000-0000000000e2', 'a2000000-0000-0000-0000-0000000000e2', 'c3000000-0000-0000-0000-0000000000e3', 'pending');
INSERT INTO public.contact_relay (id, match_id, from_user_id, to_user_id, status, expires_at) VALUES
  ('f1000000-0000-0000-0000-0000000000e1', 'd2000000-0000-0000-0000-0000000000e2',
   'a1000000-0000-0000-0000-0000000000e1', 'a2000000-0000-0000-0000-0000000000e2', 'accepted', NULL);

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT public.resolve_match_hint('e1000000-0000-0000-0000-0000000000e1', true) $$,
  '22023', 'match_not_open',
  'a hint on an admin-rejected match cannot re-confirm the link');
SELECT throws_ok(
  $$ SELECT public.resolve_match_hint('e2000000-0000-0000-0000-0000000000e2', true) $$,
  '22023', 'hint_not_pending',
  'an already-decided hint cannot be decided again');
SELECT is(
  public.open_thread_from_match_hint_accept('e2000000-0000-0000-0000-0000000000e2'),
  NULL::uuid,
  'no conversation opens while the other owner has not accepted');

SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
SELECT lives_ok(
  $$ SELECT public.resolve_match_hint('e3000000-0000-0000-0000-0000000000e3', false) $$,
  'the other owner declines');
RESET role;
SELECT isnt(
  (SELECT revoked_at FROM public.contact_relay WHERE id = 'f1000000-0000-0000-0000-0000000000e1'),
  NULL, 'the decline closes the contact relay for that match');
SELECT is(
  (SELECT status FROM public.contact_relay WHERE id = 'f1000000-0000-0000-0000-0000000000e1'),
  'declined', 'and marks it declined');

SELECT * FROM finish();
ROLLBACK;
