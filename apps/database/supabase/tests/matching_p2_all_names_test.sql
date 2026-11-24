-- pgTAP: matching P2, every name of a person is compared (20261125121000_matching_p2_all_names).
BEGIN;
SELECT plan(27);

-- ── fixtures: two trees, five cross-tree pairs, everyone deceased ───────────
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-0000000000b1', 'owner1-p2n@test.juthoor', 'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-0000000000b2', 'owner2-p2n@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('e1000000-0000-0000-0000-0000000000b1', 'T1 p2n', 'a1000000-0000-0000-0000-0000000000b1', false),
  ('e2000000-0000-0000-0000-0000000000b2', 'T2 p2n', 'a2000000-0000-0000-0000-0000000000b2', false);

INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('1c000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000b1', 'F'),  -- W1 birth + married surname
  ('2d000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-0000000000b2', 'F'),  -- W2 married surname only
  ('1c000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-0000000000b1', 'M'),  -- M1 Mahmoud, also known as Abu Ali
  ('2d000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-0000000000b2', 'M'),  -- M2 Abu Ali
  ('1c000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-0000000000b1', 'M'),  -- B1 brother
  ('2d000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-0000000000b2', 'M'),  -- B2 brother
  ('1c000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-0000000000b1', 'M'),  -- S1 alternate "Saleh" in Latin
  ('2d000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-0000000000b2', 'M'),  -- S2 صالح
  ('1c000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-0000000000b1', 'F'),  -- U1 placeholder alternate
  ('2d000000-0000-0000-0000-000000000005', 'e2000000-0000-0000-0000-0000000000b2', 'F'),  -- U2 placeholder alternate
  ('1c000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-0000000000b1', 'M'),  -- X1 محمد, also written Mohammad
  ('2d000000-0000-0000-0000-000000000006', 'e2000000-0000-0000-0000-0000000000b2', 'M');  -- X2 محمود, also written Mahmoud

INSERT INTO public.person_names (person_id, is_primary, name_type, given_name, surname) VALUES
  ('1c000000-0000-0000-0000-000000000001', true,  'birth',   'فاطمة',   'الخطيب'),
  ('1c000000-0000-0000-0000-000000000001', false, 'married', 'فاطمة',   'العجرمي'),
  ('2d000000-0000-0000-0000-000000000001', true,  'birth',   'فاطمة',   'Ajrami'),
  ('1c000000-0000-0000-0000-000000000002', true,  'birth',   'محمود',   'النجار'),
  ('1c000000-0000-0000-0000-000000000002', false, 'aka',     'أبو علي', NULL),
  ('2d000000-0000-0000-0000-000000000002', true,  'birth',   'ابوعلي',  'النجار'),
  ('1c000000-0000-0000-0000-000000000003', true,  'birth',   'يوسف',    'درويش'),
  ('1c000000-0000-0000-0000-000000000003', false, 'aka',     'ابو خالد', NULL),
  ('2d000000-0000-0000-0000-000000000003', true,  'birth',   'خليل',    'درويش'),
  ('2d000000-0000-0000-0000-000000000003', false, 'aka',     'ابو سامي', NULL),
  ('1c000000-0000-0000-0000-000000000004', true,  'birth',   'محمود',   'المصري'),
  ('1c000000-0000-0000-0000-000000000004', false, 'aka',     'Saleh',   'Masri'),
  ('2d000000-0000-0000-0000-000000000004', true,  'birth',   'صالح',    'المصري'),
  ('1c000000-0000-0000-0000-000000000005', true,  'birth',   'رانيا',   'حداد'),
  ('1c000000-0000-0000-0000-000000000005', false, 'aka',     'Unknown', 'Unknown'),
  ('2d000000-0000-0000-0000-000000000005', true,  'birth',   'سعاد',    'حداد'),
  ('2d000000-0000-0000-0000-000000000005', false, 'aka',     'Unknown', 'Unknown'),
  ('1c000000-0000-0000-0000-000000000006', true,  'birth',   'محمد',    'الشريف'),
  ('1c000000-0000-0000-0000-000000000006', false, 'aka',     'Mohammad', NULL),
  ('2d000000-0000-0000-0000-000000000006', true,  'birth',   'محمود',   'الشريف'),
  ('2d000000-0000-0000-0000-000000000006', false, 'aka',     'Mahmoud', NULL);

INSERT INTO public.events (person_id, event_type, date_year)
  SELECT id, 'BIRT', 1925 FROM public.persons
   WHERE id::text LIKE '1c000000-%' OR id::text LIKE '2d000000-%';
INSERT INTO public.events (person_id, event_type)
  SELECT id, 'DEAT' FROM public.persons
   WHERE id::text LIKE '1c000000-%' OR id::text LIKE '2d000000-%';

SELECT public.refresh_match_features(id) FROM public.persons
 WHERE id::text LIKE '1c000000-%' OR id::text LIKE '2d000000-%';

-- ── features hold every name, built with the P1 rules ───────────────────────
SELECT is(
  (SELECT cardinality(surname_norms) FROM public.match_features
    WHERE person_id = '1c000000-0000-0000-0000-000000000001'),
  2, 'both surnames of a person are kept');
SELECT ok(
  (SELECT surname_norms @> ARRAY['خطيب', 'عجرمي'] FROM public.match_features
    WHERE person_id = '1c000000-0000-0000-0000-000000000001'),
  'with the article stripped from each');
SELECT is(
  (SELECT surname_norm FROM public.match_features
    WHERE person_id = '1c000000-0000-0000-0000-000000000001'),
  'خطيب', 'the single-value column still holds the primary surname');
SELECT ok(
  (SELECT given_norms @> ARRAY['محمود', 'ابوعلي'] FROM public.match_features
    WHERE person_id = '1c000000-0000-0000-0000-000000000002'),
  'both given names are kept, spaces ignored');
SELECT is(
  (SELECT cardinality(surname_norms) FROM public.match_features
    WHERE person_id = '1c000000-0000-0000-0000-000000000002'),
  1, 'a name row without a surname adds no surname');
SELECT is(
  (SELECT cardinality(given_norms) FROM public.match_features
    WHERE person_id = '1c000000-0000-0000-0000-000000000005'),
  1, 'a placeholder alternate ("Unknown") is not kept as a given name');
SELECT is(
  (SELECT cardinality(surname_norms) FROM public.match_features
    WHERE person_id = '1c000000-0000-0000-0000-000000000005'),
  1, 'nor as a surname');
SELECT is(
  (SELECT ARRAY[cardinality(given_skel_latin), cardinality(given_skel_native)] FROM public.match_features
    WHERE person_id = '1c000000-0000-0000-0000-000000000004'),
  ARRAY[1, 1], 'consonant skeletons are kept per script (one Latin name, one Arabic name)');

-- ── scoring: the best match across names ────────────────────────────────────
SELECT is(
  (SELECT (breakdown->'params'->'surname'->>'pts')::int FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001')),
  6, 'a married surname kept as an alternate matches the other tree''s primary surname (article and script ignored)');
SELECT is(
  (SELECT (breakdown->'params'->'given'->>'pts')::int FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001')),
  6, 'and her given name still scores in full');
SELECT is(
  (SELECT (breakdown->'params'->'given'->>'pts')::int FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000002', '2d000000-0000-0000-0000-000000000002')),
  6, 'an alternate given name matches the other tree''s primary given name');
SELECT ok(
  NOT (SELECT breakdown->'meta'->'vetoes' ? 'given_disagree' FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000002', '2d000000-0000-0000-0000-000000000002')),
  'so given_disagree is not raised although the primary given names differ');
SELECT is(
  (SELECT (breakdown->'params'->'given'->>'pts')::int FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000004', '2d000000-0000-0000-0000-000000000004')),
  2, 'an alternate in Latin letters earns the cross-script points against an Arabic name');
SELECT ok(
  NOT (SELECT breakdown->'meta'->'vetoes' ? 'given_disagree' FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000004', '2d000000-0000-0000-0000-000000000004')),
  'and is not vetoed');
SELECT is(
  (SELECT (breakdown->'params'->'given'->>'pts')::int FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000003', '2d000000-0000-0000-0000-000000000003')),
  0, 'brothers whose names never match score no given-name points');
SELECT ok(
  (SELECT breakdown->'meta'->'vetoes' ? 'given_disagree' FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000003', '2d000000-0000-0000-0000-000000000003')),
  'and given_disagree is raised when no pair of names matches');
SELECT is(
  (SELECT score FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000003', '2d000000-0000-0000-0000-000000000003')),
  0, 'with its 20-point penalty (surname 6 + birth year 7, minus 20, floored at 0)');
SELECT ok(
  (SELECT breakdown->'meta'->'vetoes' ? 'given_disagree' FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000005', '2d000000-0000-0000-0000-000000000005')),
  'a placeholder shared by both people is not a matching name');

-- Brothers محمد and محمود, each also written in Latin letters. Their consonant
-- skeletons are equal, so a Latin spelling of one against the Arabic spelling
-- of the other would pass as a cross-script match.
SELECT is(
  (SELECT ARRAY[cardinality(given_norms), cardinality(given_skel_latin)] FROM public.match_features
    WHERE person_id = '1c000000-0000-0000-0000-000000000006'),
  ARRAY[1, 0], 'a Latin spelling of the person''s own Arabic name is not kept as another name');
SELECT is(
  (SELECT (breakdown->'params'->'given'->>'pts')::int FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000006', '2d000000-0000-0000-0000-000000000006')),
  0, 'so brothers with different Arabic names, both also written in Latin letters, score no given-name points');
SELECT ok(
  (SELECT breakdown->'meta'->'vetoes' ? 'given_disagree' FROM public.score_pair_impl(
     '1c000000-0000-0000-0000-000000000006', '2d000000-0000-0000-0000-000000000006')),
  'and are still vetoed (given_disagree)');

-- ── blocking: the name pass sees the alternates ─────────────────────────────
SELECT public.refresh_match_block_keys(true);
SELECT is(
  (SELECT count(*)::int FROM public.match_block_keys
    WHERE person_id = '1c000000-0000-0000-0000-000000000001' AND pass = 1),
  2, 'the given+surname pass has one key per surname of the person');
SELECT is(
  (SELECT count(*)::int FROM public.match_block_keys
    WHERE person_id = '1c000000-0000-0000-0000-000000000002' AND pass = 1),
  2, 'and one per given name');
SELECT ok(
  EXISTS (SELECT 1 FROM public.match_block_keys k1
            JOIN public.match_block_keys k2 ON k2.pass = k1.pass AND k2.block_key = k1.block_key
           WHERE k1.pass = 1
             AND k1.person_id = '1c000000-0000-0000-0000-000000000001'
             AND k2.person_id = '2d000000-0000-0000-0000-000000000001'),
  'the woman and her record under the married surname share a name-pass key');
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.match_block_keys k1
                JOIN public.match_block_keys k2 ON k2.pass = k1.pass AND k2.block_key = k1.block_key
               WHERE k1.pass <> 1
                 AND k1.person_id = '1c000000-0000-0000-0000-000000000001'
                 AND k2.person_id = '2d000000-0000-0000-0000-000000000001'),
  'and no other pass would have paired them');
SELECT ok(
  EXISTS (SELECT 1 FROM public.generate_match_candidates()
           WHERE person_a_id = '1c000000-0000-0000-0000-000000000001'
             AND person_b_id = '2d000000-0000-0000-0000-000000000001'),
  'so the pair is now a candidate');
SELECT ok(
  EXISTS (SELECT 1 FROM public.generate_match_candidates()
           WHERE person_a_id = '1c000000-0000-0000-0000-000000000002'
             AND person_b_id = '2d000000-0000-0000-0000-000000000002'),
  'and so is the pair that shares only an alternate given name with the surname');

SELECT * FROM finish();
ROLLBACK;
