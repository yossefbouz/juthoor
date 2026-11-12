-- pgTAP: behaviour checks for the fixes made before merging PR #26.
BEGIN;
SELECT plan(11);

-- ── 1. Internal functions are not callable by logged-in users ───────────────
SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'teardown_person_link', 'auto_link_match',
        'run_matching_batch', 'run_matching_scheduled', 'run_eval',
        'refresh_match_features', 'refresh_match_features_batch',
        'refresh_match_block_keys', 'generate_match_candidates',
        'refresh_person_identity_groups', 'drain_overlay_refresh',
        'create_match_notification', 'create_auto_link_notification',
        'match_resolve_parents', 'match_person_owner', 'match_living_flags'
      )
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'internal matching / link / notification functions are closed to authenticated'
);

-- ── 2. One displacement RPC, with an int registration year ──────────────────
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'upsert_person_displacement'),
  1,
  'exactly one upsert_person_displacement overload (no ambiguous REST calls)'
);
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'clear_unrwa_registration_date_if_sentinel'),
  0,
  'the int-vs-date sentinel trigger function is gone'
);

-- ── fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a1000000-0000-0000-0000-0000000000f1', 'owner-mf@test.juthoor',    'authenticated', 'authenticated'),
  ('a2000000-0000-0000-0000-0000000000f2', 'stranger-mf@test.juthoor', 'authenticated', 'authenticated');

INSERT INTO public.trees (id, name, owner_id, is_public) VALUES
  ('b1000000-0000-0000-0000-0000000000f1', 'Private tree', 'a1000000-0000-0000-0000-0000000000f1', false);

-- A deceased person: optional fields are editable by the tree writer.
INSERT INTO public.persons (id, tree_id, gender, display_name_ar, display_name_en) VALUES
  ('c1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-0000000000f1', 'M', 'جد', 'Grandfather');
INSERT INTO public.events (person_id, event_type, date_year) VALUES
  ('c1000000-0000-0000-0000-0000000000f1', 'DEAT', 1990);

INSERT INTO public.person_profiles (person_id, achievements_en, contribution_consent)
VALUES ('c1000000-0000-0000-0000-0000000000f1', 'Built the village school', true);

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

-- ── 3. Displacement save works; 0 clears the year, NULL keeps it ────────────
SELECT lives_ok(
  $$ SELECT public.upsert_person_displacement(
       p_person_id => 'c1000000-0000-0000-0000-0000000000f1',
       p_camp_name => 'Jalazone',
       p_unrwa_registration_date => 1951) $$,
  'the owner can save displacement data with a registration year'
);
SELECT is(
  (SELECT unrwa_registration_date FROM public.person_displacement
    WHERE person_id = 'c1000000-0000-0000-0000-0000000000f1'),
  1951,
  'the registration year is stored'
);
SELECT lives_ok(
  $$ SELECT public.upsert_person_displacement(
       p_person_id => 'c1000000-0000-0000-0000-0000000000f1',
       p_camp_name => 'Jalazone') $$,
  'a save without the year keeps it'
);
SELECT lives_ok(
  $$ SELECT public.upsert_person_displacement(
       p_person_id => 'c1000000-0000-0000-0000-0000000000f1',
       p_unrwa_registration_date => 0) $$,
  'a save with year 0 clears it'
);
SELECT is(
  (SELECT unrwa_registration_date FROM public.person_displacement
    WHERE person_id = 'c1000000-0000-0000-0000-0000000000f1'),
  NULL::int,
  'the registration year is cleared'
);

-- ── 4. Contacts change and clear on a plain UPDATE (the app no longer upserts)
UPDATE public.person_profiles SET contact_email = 'first@test.juthoor'
 WHERE person_id = 'c1000000-0000-0000-0000-0000000000f1';
UPDATE public.person_profiles SET contact_email = 'second@test.juthoor'
 WHERE person_id = 'c1000000-0000-0000-0000-0000000000f1';
SELECT is(
  (SELECT contact_email FROM public.get_person_contact('c1000000-0000-0000-0000-0000000000f1')),
  'second@test.juthoor',
  'an updated contact email replaces the old one'
);
UPDATE public.person_profiles SET contact_email = ''
 WHERE person_id = 'c1000000-0000-0000-0000-0000000000f1';
SELECT is(
  (SELECT contact_email FROM public.get_person_contact('c1000000-0000-0000-0000-0000000000f1')),
  NULL,
  'clearing the contact email removes it'
);

-- ── 5. get_person_story respects tree access ────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"a2000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*)::int FROM public.get_person_story('c1000000-0000-0000-0000-0000000000f1')),
  0,
  'a stranger gets no story from a private tree'
);

SELECT * FROM finish();
ROLLBACK;
