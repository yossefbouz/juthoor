-- F3: make the schema privilege-self-contained (CI-resilience).
--
-- Until now every table's client access rode on Supabase's ALTER DEFAULT
-- PRIVILEGES (which grant ALL on new tables to anon/authenticated/service_role).
-- Newer CLI/Postgres images stopped doing that for migration-created tables,
-- which broke CI pgTAP with "permission denied for table …" until the CLI was
-- pinned (see .github/workflows/integration-tests.yml). This migration writes the
-- INTENDED grants explicitly, derived table-by-table from each table's actual RLS
-- policies (RLS remains the row-level gate — grants only decide which roles may
-- attempt an operation at all):
--   • policies target `authenticated` → grant exactly the covered commands;
--   • policies target role `public` (apply to anon too) → anon gets SELECT
--     (anon writes stay ungranted: every write qual requires auth.uid() anyway);
--   • deny-all engine tables (RLS on, no policies) → NO client grants at all:
--     eval_pairs, eval_runs, match_block_keys, match_block_skips, match_features,
--     match_features_dirty, overlay_refresh_queue;
--   • service_role (bypasses RLS; the batch/cron identity) → blanket grant.
--
-- Every grant is guarded by table existence — environments differ on the
-- Nextbase leftovers (content_blog_posts / content_blog_post_comments /
-- private_items exist locally but not on live), and this migration must be a
-- correct no-op for whichever side lacks a table.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- (table, grant to authenticated, grant to anon)
      ('trees',                      'SELECT, INSERT, UPDATE, DELETE', NULL),
      ('persons',                    'SELECT, INSERT, UPDATE, DELETE', NULL),
      ('person_names',               'SELECT, INSERT, UPDATE, DELETE', NULL),
      ('families',                   'SELECT, INSERT, UPDATE, DELETE', NULL),
      ('family_children',            'SELECT, INSERT, UPDATE, DELETE', NULL),
      ('events',                     'SELECT, INSERT, UPDATE, DELETE', NULL),
      ('places',                     'SELECT, INSERT, UPDATE, DELETE', NULL),
      ('person_profiles',            'SELECT, INSERT, UPDATE, DELETE', NULL),
      ('place_profiles',             'SELECT, INSERT, UPDATE, DELETE', 'SELECT'),
      ('matches',                    'SELECT, INSERT, UPDATE, DELETE', NULL),  -- RLS: select admin-only
      ('tree_members',               'SELECT, INSERT, UPDATE, DELETE', 'SELECT'),
      ('content_blog_posts',         'SELECT, INSERT, UPDATE, DELETE', 'SELECT'),
      ('content_blog_post_comments', 'SELECT, INSERT, UPDATE, DELETE', 'SELECT'),
      ('person_attachments',         'SELECT, INSERT, UPDATE, DELETE', 'SELECT'),
      ('private_items',              'SELECT, INSERT, UPDATE, DELETE', 'SELECT'),
      ('identity_verifications',     'SELECT, INSERT, UPDATE',         NULL),
      ('person_privacy_holds',       'SELECT, INSERT, DELETE',         NULL),
      ('notifications',              'SELECT, UPDATE',                 NULL),
      ('profiles',                   'SELECT, UPDATE',                 NULL),
      ('app_settings',               'SELECT, INSERT, UPDATE, DELETE', NULL),  -- ALL policy (admin-gated)
      ('matching_runs',              'SELECT',                         NULL),
      ('match_audit',                'SELECT',                         NULL),
      ('match_hints',                'SELECT',                         NULL),
      ('merge_log',                  'SELECT',                         NULL),
      ('person_links',               'SELECT',                         NULL),
      ('contact_relay',              'SELECT',                         NULL),
      ('match_paths',                'SELECT',                         'SELECT'),
      ('name_variants',              'SELECT',                         'SELECT')
    ) AS v(tbl, auth_privs, anon_privs)
  LOOP
    IF to_regclass('public.' || spec.tbl) IS NULL THEN
      CONTINUE;  -- table absent in this environment (Nextbase leftovers differ)
    END IF;
    EXECUTE format('GRANT %s ON public.%I TO authenticated', spec.auth_privs, spec.tbl);
    IF spec.anon_privs IS NOT NULL THEN
      EXECUTE format('GRANT %s ON public.%I TO anon', spec.anon_privs, spec.tbl);
    END IF;
  END LOOP;
END $$;
