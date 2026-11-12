-- Fail if anon can EXECUTE any public SECURITY DEFINER function outside the allowlist.
BEGIN;
SELECT plan(2);

CREATE TEMP TABLE _anon_definer_exec ON COMMIT DROP AS
SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname NOT IN (
    'can_access_tree',
    'can_view_sensitive_person_fields',
    'search_master_tree',
    'list_visible_pft_links'
  );

SELECT is(
  (SELECT count(*)::int FROM _anon_definer_exec),
  0,
  'anon must not EXECUTE public SECURITY DEFINER functions outside the allowlist'
);

-- Critical surfaces from the 2026-11-11 review must stay closed to authenticated too
-- (except is_person_claimed / person_identifier_verified which stay authenticated-only).
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.contact_crypto_key()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.encrypt_contact_value(text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.decrypt_contact_value(bytea)', 'EXECUTE')
  AND NOT has_function_privilege(
    'authenticated',
    'public.upsert_optional_identifier(uuid, text, text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege('anon', 'public.is_person_claimed(uuid)', 'EXECUTE')
  AND NOT has_function_privilege(
    'anon',
    'public.person_identifier_verified(uuid, text)',
    'EXECUTE'
  ),
  'crypto helpers + upsert_optional_identifier closed to authenticated; claim/id probes closed to anon'
);

SELECT * FROM finish();
ROLLBACK;
