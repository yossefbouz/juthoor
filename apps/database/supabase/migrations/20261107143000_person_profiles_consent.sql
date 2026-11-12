-- W3.4 / D3 + W3.5 / D13: contact + contribution consent on person_profiles.

ALTER TABLE public.person_profiles
  ADD COLUMN IF NOT EXISTS contact_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contribution_consent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.person_profiles.contact_consent IS
  'D3: when true, contact_email/phone may be shown to privileged/consented viewers.';
COMMENT ON COLUMN public.person_profiles.contribution_consent IS
  'D13: when false, hide achievements/contribution for living people (except owner/admin).';

-- Extend contact_relay for person-page contact requests (match_id optional).
ALTER TABLE public.contact_relay
  ALTER COLUMN match_id DROP NOT NULL;

ALTER TABLE public.contact_relay
  ADD COLUMN IF NOT EXISTS target_person_id uuid REFERENCES public.persons(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

COMMENT ON COLUMN public.contact_relay.target_person_id IS
  'Person whose contact was requested (W3.4). Null for legacy match-based relays.';

-- Participants may insert their own outgoing request (person-based).
DROP POLICY IF EXISTS contact_relay_insert_own ON public.contact_relay;
CREATE POLICY contact_relay_insert_own ON public.contact_relay
  FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid());

DROP POLICY IF EXISTS contact_relay_update_parties ON public.contact_relay;
CREATE POLICY contact_relay_update_parties ON public.contact_relay
  FOR UPDATE TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR public.is_admin())
  WITH CHECK (from_user_id = auth.uid() OR to_user_id = auth.uid() OR public.is_admin());

-- SECURITY DEFINER helper: create a contact request + notify recipient.
CREATE OR REPLACE FUNCTION public.create_contact_relay_request(
  p_target_person_id uuid,
  p_message text DEFAULT NULL
)
RETURNS public.contact_relay
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_to uuid;
  v_tree uuid;
  v_row public.contact_relay;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_target_person_id IS NULL THEN
    RAISE EXCEPTION 'target_person_id required';
  END IF;

  SELECT p.tree_id, COALESCE(p.display_name_ar, p.display_name_en, 'شخص')
    INTO v_tree, v_name
  FROM public.persons p
  WHERE p.id = p_target_person_id;
  IF v_tree IS NULL THEN
    RAISE EXCEPTION 'Person not found';
  END IF;
  IF NOT public.can_access_tree(v_tree) THEN
    RAISE EXCEPTION 'Cannot access this person';
  END IF;

  -- Prefer the user who claimed this person as self; else tree owner.
  SELECT pr.id INTO v_to
  FROM public.profiles pr
  WHERE pr.self_person_id = p_target_person_id
  LIMIT 1;

  IF v_to IS NULL THEN
    SELECT t.owner_id INTO v_to FROM public.trees t WHERE t.id = v_tree;
  END IF;

  IF v_to IS NULL THEN
    RAISE EXCEPTION 'No recipient for contact request';
  END IF;
  IF v_to = v_uid THEN
    RAISE EXCEPTION 'Cannot request contact with yourself';
  END IF;

  -- Idempotent: reuse pending row if one already exists.
  SELECT * INTO v_row
  FROM public.contact_relay
  WHERE from_user_id = v_uid
    AND target_person_id = p_target_person_id
    AND status = 'pending'
    AND revoked_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.contact_relay(
    match_id, from_user_id, to_user_id, target_person_id, status, message, expires_at
  ) VALUES (
    NULL, v_uid, v_to, p_target_person_id, 'pending',
    NULLIF(trim(COALESCE(p_message, '')), ''),
    now() + interval '30 days'
  )
  RETURNING * INTO v_row;

  INSERT INTO public.notifications(
    recipient_user_id, kind, title_ar, title_en, body_ar, body_en, link
  ) VALUES (
    v_to,
    'contact_request',
    'طلب تواصل',
    'Contact request',
    'طلب أحدهم التواصل بشأن: ' || v_name,
    'Someone requested contact regarding: ' || v_name,
    '/dashboard/requests'
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contact_relay_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_contact_relay_request(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.create_contact_relay_request IS
  'W3.4: insert a person-scoped contact_relay row and notify the claimed user or tree owner.';
