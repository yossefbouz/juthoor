-- pgTAP: Group A (document-right → code change) — 20261114120000_findings_group_a
BEGIN;
SELECT plan(12);

-- A1: admin write policies no longer mention is_admin on persons writes
SELECT ok(
  (
    SELECT qual NOT ILIKE '%is_admin%'
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'persons' AND policyname = 'persons_update'
  ),
  'A1 persons_update has no is_admin bypass'
);

SELECT ok(
  (
    SELECT with_check NOT ILIKE '%is_admin%'
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'persons' AND policyname = 'persons_insert'
  ),
  'A1 persons_insert has no is_admin bypass'
);

SELECT ok(
  (
    SELECT qual ILIKE '%is_admin%'
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'persons' AND policyname = 'persons_select'
  ),
  'A1 persons_select still allows is_admin read'
);

-- A5: validated in status check
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.relationship_disputes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%validated%'
  ),
  'A5 status check allows validated'
);

-- A6 / A7 columns
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'person_attachments'
      AND column_name = 'subject_given'
  ),
  'A6 subject_given'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'person_attachments'
      AND column_name = 'subject_family'
  ),
  'A6 subject_family'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'person_profiles'
      AND column_name = 'hamula_affiliation'
  ),
  'A7 hamula_affiliation'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'person_profiles'
      AND column_name = 'origin_relationship'
  ),
  'A7 origin_relationship'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'person_profiles'
      AND column_name = 'occupation'
  ),
  'A7 occupation'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'person_profiles'
      AND column_name = 'education'
  ),
  'A7 education'
);

-- A8 / A10
SELECT ok(public.unknown_place_id() IS NOT NULL, 'A8 Unknown place sentinel exists');
SELECT ok(
  (
    SELECT COALESCE(nightly_matching_enabled, false)
    FROM public.app_settings
    LIMIT 1
  ),
  'A10 nightly_matching_enabled is on'
);

SELECT * FROM finish();
ROLLBACK;
