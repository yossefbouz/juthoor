-- Account closure: keep genealogy for audit; never cascade-delete trees with the Auth user.
-- Archive vault owner receives every tree the closed account owned.

-- ── Safety: trees must not vanish when an Auth user is deleted ───────────────
ALTER TABLE public.trees
  DROP CONSTRAINT IF EXISTS trees_owner_id_fkey;

ALTER TABLE public.trees
  ADD CONSTRAINT trees_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT trees_owner_id_fkey ON public.trees IS
  'RESTRICT so closing an Auth user cannot wipe family trees. Transfer ownership to the archive vault first.';

-- ── Archive metadata on trees ────────────────────────────────────────────────
ALTER TABLE public.trees
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_from_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trees.is_archived IS
  'True when the former owner closed their account and the tree was moved into the archive vault.';
COMMENT ON COLUMN public.trees.archived_from_user_id IS
  'Former owner Auth user id (kept for audit after that Auth user is deleted).';

CREATE INDEX IF NOT EXISTS idx_trees_archived
  ON public.trees (is_archived, archived_at)
  WHERE is_archived = true;

-- ── Closure audit log (survives Auth user deletion) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.account_closure_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  former_user_id uuid NOT NULL,
  former_email text NULL,
  trees_archived integer NOT NULL DEFAULT 0,
  closed_at timestamptz NOT NULL DEFAULT now(),
  notes text NULL
);

CREATE INDEX IF NOT EXISTS idx_account_closure_former
  ON public.account_closure_log (former_user_id);

ALTER TABLE public.account_closure_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_closure_log_admin_select ON public.account_closure_log;
CREATE POLICY account_closure_log_admin_select
  ON public.account_closure_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.account_closure_log IS
  'Audit trail of closed accounts. Trees stay in Postgres under the archive vault owner.';

-- ── System archive Auth user + profile ───────────────────────────────────────
-- Fixed UUID so app code can transfer ownership without a lookup race.
-- Password is a random bcrypt hash; this account is never used for interactive login.

DO $$
DECLARE
  v_archive_id uuid := 'a0000000-0000-4000-8000-0000000000a1';
  v_instance_id uuid;
BEGIN
  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_archive_id) THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    ) VALUES (
      v_instance_id,
      v_archive_id,
      'authenticated',
      'authenticated',
      'archive-vault@juthoor.internal',
      crypt(gen_random_uuid()::text || gen_random_uuid()::text, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"juthoor_system":"archive_vault"}'::jsonb,
      '{"full_name":"Juthoor Archive Vault"}'::jsonb,
      now(),
      now(),
      false,
      false
    );
  END IF;

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  SELECT
    v_archive_id,
    v_archive_id,
    jsonb_build_object('sub', v_archive_id::text, 'email', 'archive-vault@juthoor.internal'),
    'email',
    v_archive_id::text,
    now(),
    now(),
    now()
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = v_archive_id AND provider = 'email'
  );

  INSERT INTO public.profiles (
    id,
    display_name,
    display_name_ar,
    is_admin,
    created_at,
    updated_at
  )
  VALUES (
    v_archive_id,
    'Juthoor Archive Vault',
    'خزينة أرشيف الجذور',
    false,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        display_name_ar = EXCLUDED.display_name_ar,
        updated_at = now();
END $$;

-- Helper constant for RPCs / docs
CREATE OR REPLACE FUNCTION public.archive_vault_user_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 'a0000000-0000-4000-8000-0000000000a1'::uuid;
$$;

REVOKE ALL ON FUNCTION public.archive_vault_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_vault_user_id() TO authenticated, service_role;

COMMENT ON FUNCTION public.archive_vault_user_id() IS
  'Stable Auth user id that owns trees after an account is closed (audit vault).';
