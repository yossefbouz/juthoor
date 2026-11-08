-- ============================================================================
-- Wave 5.3 — access_log (contact fields live on person_profiles from Wave 3)
-- ----------------------------------------------------------------------------
-- Privacy policy promises logged access to sensitive views (ID docs, contact).
-- Contact email/phone + consent already exist on person_profiles
-- (20261107143000). This migration only adds the append-only access_log.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.access_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id   text NOT NULL,
  action        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_log_resource_type_check CHECK (
    resource_type IN (
      'verification_doc',
      'person_contact',
      'identity_verification'
    )
  ),
  CONSTRAINT access_log_action_check CHECK (
    action IN ('view', 'open', 'download')
  )
);

CREATE INDEX IF NOT EXISTS idx_access_log_viewer_created
  ON public.access_log (viewer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_resource
  ON public.access_log (resource_type, resource_id, created_at DESC);

COMMENT ON TABLE public.access_log IS
  'Append-only access audit for sensitive views (verification docs, person contact). Viewers insert their own rows; admins/moderators read all.';

ALTER TABLE public.access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_log_insert_own ON public.access_log;
CREATE POLICY access_log_insert_own ON public.access_log
  FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());

-- Read policy is widened in the moderator migration (is_moderator()). Until
-- then, admins can read; we recreate it there. Bootstrap with is_admin only.
DROP POLICY IF EXISTS access_log_select_staff ON public.access_log;
CREATE POLICY access_log_select_staff ON public.access_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- No UPDATE / DELETE for authenticated — append-only.

CREATE OR REPLACE FUNCTION public.log_access(
  p_resource_type text,
  p_resource_id   text,
  p_action        text DEFAULT 'view'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.access_log (viewer_id, resource_type, resource_id, action)
  VALUES (auth.uid(), p_resource_type, p_resource_id, p_action)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_access(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_access(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.log_access IS
  'Authenticated helper: append an access_log row for the current viewer.';
