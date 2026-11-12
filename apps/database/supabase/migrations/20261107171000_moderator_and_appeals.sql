-- ============================================================================
-- Wave 5.5 — moderator role + verification_appeals
-- ----------------------------------------------------------------------------
-- Moderators may READ identity_verifications (and verification-docs storage)
-- and access_log, but cannot change profiles.is_admin / is_moderator (same
-- self-elevation guard as is_admin). Appeals are a simple stub table + RLS.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_moderator boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_moderator IS
  'Platform moderator: can read identity verifications and access logs. Cannot self-elevate; set only by privileged roles.';

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT is_moderator FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_moderator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated;

COMMENT ON FUNCTION public.is_moderator() IS
  'True when the current auth.uid() has profiles.is_moderator.';

-- Extend the existing is_admin protection to also cover is_moderator.
CREATE OR REPLACE FUNCTION public.protect_profiles_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF tg_op = 'INSERT' THEN
      IF coalesce(new.is_admin, false) THEN
        RAISE EXCEPTION 'is_admin can only be set by a platform administrator'
          USING ERRCODE = '42501';
      END IF;
      IF coalesce(new.is_moderator, false) THEN
        RAISE EXCEPTION 'is_moderator can only be set by a platform administrator'
          USING ERRCODE = '42501';
      END IF;
    ELSIF tg_op = 'UPDATE' THEN
      IF new.is_admin IS DISTINCT FROM old.is_admin THEN
        RAISE EXCEPTION 'is_admin can only be changed by a platform administrator'
          USING ERRCODE = '42501';
      END IF;
      IF new.is_moderator IS DISTINCT FROM old.is_moderator THEN
        RAISE EXCEPTION 'is_moderator can only be changed by a platform administrator'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.protect_profiles_is_admin() IS
  'Blocks anon/authenticated from setting or changing profiles.is_admin or profiles.is_moderator (self-escalation guard).';

-- identity_verifications: moderators may read (not update).
DROP POLICY IF EXISTS "idv_select_own_or_admin" ON public.identity_verifications;
CREATE POLICY "idv_select_own_or_admin" ON public.identity_verifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR public.is_moderator()
  );

-- verification-docs storage: moderators may read.
DROP POLICY IF EXISTS "verif_docs_select_own_or_admin" ON storage.objects;
CREATE POLICY "verif_docs_select_own_or_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
      OR public.is_moderator()
    )
  );

-- access_log: staff (admin or moderator) can read.
DROP POLICY IF EXISTS access_log_select_staff ON public.access_log;
CREATE POLICY access_log_select_staff ON public.access_log
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_moderator());

-- ── verification_appeals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.verification_appeals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id  uuid NOT NULL REFERENCES public.identity_verifications(id) ON DELETE CASCADE,
  appellant_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason           text NOT NULL,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'accepted', 'rejected', 'withdrawn')),
  staff_note       text,
  reviewed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_appeals_status
  ON public.verification_appeals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_appeals_appellant
  ON public.verification_appeals (appellant_id, created_at DESC);

COMMENT ON TABLE public.verification_appeals IS
  'Appeal stub for rejected (or disputed) identity verifications. Appellants insert/read own; staff read all; only admins resolve.';

ALTER TABLE public.verification_appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verification_appeals_select ON public.verification_appeals;
CREATE POLICY verification_appeals_select ON public.verification_appeals
  FOR SELECT TO authenticated
  USING (
    appellant_id = auth.uid()
    OR public.is_admin()
    OR public.is_moderator()
  );

DROP POLICY IF EXISTS verification_appeals_insert_own ON public.verification_appeals;
CREATE POLICY verification_appeals_insert_own ON public.verification_appeals
  FOR INSERT TO authenticated
  WITH CHECK (
    appellant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.identity_verifications v
      WHERE v.id = verification_id AND v.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS verification_appeals_update_admin ON public.verification_appeals;
CREATE POLICY verification_appeals_update_admin ON public.verification_appeals
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
