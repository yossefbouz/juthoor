-- Wave 4 (W4.5): minimal messaging module.
-- Threads keyed by context (dispute / picture_link / document_link / contact_relay).
-- RLS: participants only.

DO $$ BEGIN
  CREATE TYPE public.message_context_type AS ENUM (
    'relationship_dispute',
    'picture_link',
    'document_link',
    'contact_relay'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.message_threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type public.message_context_type NOT NULL,
  context_id   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (context_type, context_id)
);

CREATE INDEX IF NOT EXISTS idx_message_threads_created
  ON public.message_threads (created_at DESC);

CREATE TABLE IF NOT EXISTS public.message_thread_participants (
  thread_id  uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_thread_participants_user
  ON public.message_thread_participants (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS public.messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_created
  ON public.messages (thread_id, created_at ASC);

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_message_thread_participant(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.message_thread_participants mtp
    WHERE mtp.thread_id = p_thread_id
      AND mtp.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_message_thread_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_message_thread_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS mt_select_participant ON public.message_threads;
CREATE POLICY mt_select_participant ON public.message_threads
  FOR SELECT TO authenticated
  USING (public.is_message_thread_participant(id) OR public.is_admin());

DROP POLICY IF EXISTS mtp_select_own ON public.message_thread_participants;
CREATE POLICY mtp_select_own ON public.message_thread_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_message_thread_participant(thread_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS msg_select_participant ON public.messages;
CREATE POLICY msg_select_participant ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_message_thread_participant(thread_id) OR public.is_admin());

DROP POLICY IF EXISTS msg_insert_participant ON public.messages;
CREATE POLICY msg_insert_participant ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_message_thread_participant(thread_id)
  );

COMMENT ON TABLE public.message_threads IS
  'W4.5 messaging threads keyed by dispute/media/contact context.';
COMMENT ON TABLE public.message_thread_participants IS
  'Participants of a message thread. RLS: participants only.';
COMMENT ON TABLE public.messages IS
  'Messages within a thread. Insert/select limited to participants.';

-- Open or create a thread for a context, ensuring caller + counterpart are participants.
CREATE OR REPLACE FUNCTION public.open_or_create_message_thread(
  p_context_type public.message_context_type,
  p_context_id uuid,
  p_counterpart_user_id uuid DEFAULT NULL,
  p_initial_body text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_thread_id uuid;
  v_other uuid := p_counterpart_user_id;
  v_context_id uuid := p_context_id;
  v_attachment public.person_attachments%ROWTYPE;
  v_tree_id uuid;
  v_owner uuid;
  v_relay public.contact_relay%ROWTYPE;
  v_body text;
  v_relay_found boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_context_id IS NULL THEN
    RAISE EXCEPTION 'context_id required';
  END IF;

  -- Resolve counterpart when not supplied.
  IF v_other IS NULL THEN
    IF p_context_type IN ('picture_link', 'document_link') THEN
      SELECT * INTO v_attachment FROM public.person_attachments WHERE id = v_context_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Attachment not found';
      END IF;
      SELECT p.tree_id INTO v_tree_id FROM public.persons p WHERE p.id = v_attachment.person_id;
      SELECT t.owner_id INTO v_owner FROM public.trees t WHERE t.id = v_tree_id;
      IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Tree owner not found';
      END IF;
      -- Counterpart is the other of (uploader, owner).
      IF v_owner = v_uid THEN
        v_other := v_attachment.uploaded_by;
      ELSE
        v_other := v_owner;
      END IF;
    ELSIF p_context_type = 'contact_relay' THEN
      SELECT * INTO v_relay FROM public.contact_relay WHERE id = v_context_id;
      v_relay_found := FOUND;
      IF NOT v_relay_found THEN
        -- Allow match_id as context: find an existing relay row for the match.
        SELECT * INTO v_relay
        FROM public.contact_relay
        WHERE match_id = v_context_id
          AND revoked_at IS NULL
          AND (from_user_id = v_uid OR to_user_id = v_uid)
        ORDER BY created_at DESC
        LIMIT 1;
        v_relay_found := FOUND;
      END IF;
      IF v_relay_found THEN
        v_context_id := v_relay.id;
        IF v_relay.from_user_id = v_uid THEN
          v_other := v_relay.to_user_id;
        ELSIF v_relay.to_user_id = v_uid THEN
          v_other := v_relay.from_user_id;
        ELSE
          RAISE EXCEPTION 'Not a contact_relay participant';
        END IF;
      ELSIF p_counterpart_user_id IS NOT NULL THEN
        v_other := p_counterpart_user_id;
      ELSE
        RAISE EXCEPTION 'contact_relay not found; pass counterpart_user_id';
      END IF;
    ELSIF p_context_type = 'relationship_dispute' THEN
      -- context_id = family_id; counterpart = tree owner (unless caller is owner).
      SELECT f.tree_id INTO v_tree_id FROM public.families f WHERE f.id = v_context_id;
      IF v_tree_id IS NULL THEN
        RAISE EXCEPTION 'Family not found for dispute';
      END IF;
      SELECT t.owner_id INTO v_owner FROM public.trees t WHERE t.id = v_tree_id;
      IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Tree owner not found';
      END IF;
      IF v_owner = v_uid THEN
        IF p_counterpart_user_id IS NULL THEN
          RAISE EXCEPTION 'counterpart_user_id required when caller is tree owner';
        END IF;
        v_other := p_counterpart_user_id;
      ELSE
        v_other := v_owner;
      END IF;
    END IF;
  END IF;

  IF v_other IS NULL OR v_other = v_uid THEN
    RAISE EXCEPTION 'A distinct counterpart is required';
  END IF;

  SELECT mt.id INTO v_thread_id
  FROM public.message_threads mt
  WHERE mt.context_type = p_context_type
    AND mt.context_id = v_context_id;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.message_threads (context_type, context_id)
    VALUES (p_context_type, v_context_id)
    RETURNING id INTO v_thread_id;
  END IF;

  INSERT INTO public.message_thread_participants (thread_id, user_id)
  VALUES (v_thread_id, v_uid)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.message_thread_participants (thread_id, user_id)
  VALUES (v_thread_id, v_other)
  ON CONFLICT DO NOTHING;

  v_body := NULLIF(btrim(COALESCE(p_initial_body, '')), '');
  IF v_body IS NOT NULL THEN
    INSERT INTO public.messages (thread_id, sender_id, body)
    VALUES (v_thread_id, v_uid, left(v_body, 4000));
  END IF;

  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_or_create_message_thread(public.message_context_type, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_or_create_message_thread(public.message_context_type, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.open_or_create_message_thread(public.message_context_type, uuid, uuid, text) IS
  'W4.5: open or create a participant-scoped message thread for a context.';

-- Ensure a contact_relay row exists for a match between two users, return its id.
CREATE OR REPLACE FUNCTION public.ensure_contact_relay(
  p_match_id uuid,
  p_counterpart_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_match_id IS NULL OR p_counterpart_user_id IS NULL OR p_counterpart_user_id = v_uid THEN
    RAISE EXCEPTION 'Invalid contact_relay parties';
  END IF;

  SELECT cr.id INTO v_id
  FROM public.contact_relay cr
  WHERE cr.match_id = p_match_id
    AND cr.revoked_at IS NULL
    AND (
      (cr.from_user_id = v_uid AND cr.to_user_id = p_counterpart_user_id)
      OR (cr.from_user_id = p_counterpart_user_id AND cr.to_user_id = v_uid)
    )
  ORDER BY cr.created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.contact_relay (match_id, from_user_id, to_user_id, expires_at)
  VALUES (p_match_id, v_uid, p_counterpart_user_id, now() + interval '30 days')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_contact_relay(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_contact_relay(uuid, uuid) TO authenticated;


-- After accepting a match hint, open a contact_relay messaging thread with the
-- counterpart tree owner (DEFINER so RLS does not hide the other tree).
CREATE OR REPLACE FUNCTION public.open_thread_from_match_hint_accept(
  p_hint_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hint public.match_hints%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_my_person uuid;
  v_other_person uuid;
  v_other_owner uuid;
  v_relay_id uuid;
  v_thread_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_hint FROM public.match_hints WHERE id = p_hint_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hint not found';
  END IF;
  IF v_hint.owner_user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not your hint';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_hint.match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- Viewer person is the match side that belongs to this owner's trees.
  SELECT p.id INTO v_my_person
  FROM public.persons p
  JOIN public.trees t ON t.id = p.tree_id
  WHERE p.id IN (v_match.person_a_id, v_match.person_b_id)
    AND t.owner_id = v_uid
  LIMIT 1;

  v_other_person := v_hint.counterpart_person_id;
  IF v_other_person IS NULL THEN
    IF v_my_person = v_match.person_a_id THEN
      v_other_person := v_match.person_b_id;
    ELSE
      v_other_person := v_match.person_a_id;
    END IF;
  END IF;

  SELECT t.owner_id INTO v_other_owner
  FROM public.persons p
  JOIN public.trees t ON t.id = p.tree_id
  WHERE p.id = v_other_person;

  IF v_other_owner IS NULL OR v_other_owner = v_uid THEN
    RAISE EXCEPTION 'No distinct counterpart owner for messaging';
  END IF;

  v_relay_id := public.ensure_contact_relay(v_hint.match_id, v_other_owner);
  v_thread_id := public.open_or_create_message_thread(
    'contact_relay'::public.message_context_type,
    v_relay_id,
    v_other_owner,
    'Contact request accepted. You can message here.'
  );
  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_thread_from_match_hint_accept(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_thread_from_match_hint_accept(uuid) TO authenticated;
