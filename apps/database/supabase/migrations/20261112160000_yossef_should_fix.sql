-- ============================================================================
-- Yossef should-fix batch (threads, messages, admin self, paths, search, cron)
-- ============================================================================

-- ── 1. Message FKs: SET NULL so account delete does not wipe counterpart mail ─
-- participant rows stay CASCADE (PK includes user_id; removing the leavers is fine).
-- Thread pair keys + message sender must SET NULL so the thread/mail survives.

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages
  ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'message_threads'
      AND column_name = 'participant_low'
  ) THEN
    BEGIN
      ALTER TABLE public.message_threads
        DROP CONSTRAINT IF EXISTS message_threads_participant_low_fkey;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
      ALTER TABLE public.message_threads
        DROP CONSTRAINT IF EXISTS message_threads_participant_high_fkey;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    -- Discover actual constraint names
    PERFORM 1;
  END IF;
END $$;

-- Drop CASCADE fkeys on participant_low/high by scanning pg_constraint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'message_threads'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%participant_%'
  LOOP
    EXECUTE format('ALTER TABLE public.message_threads DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='message_threads' AND column_name='participant_low'
  ) THEN
    ALTER TABLE public.message_threads
      ADD CONSTRAINT message_threads_participant_low_fkey
      FOREIGN KEY (participant_low) REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.message_threads
      ADD CONSTRAINT message_threads_participant_high_fkey
      FOREIGN KEY (participant_high) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2. Repair leaked threads (>2 participants or NULL pair keys) ─────────────
-- Drop extra participants beyond the two pair keys when pair keys exist.
DELETE FROM public.message_thread_participants mtp
WHERE mtp.thread_id IN (
  SELECT thread_id FROM public.message_thread_participants
  GROUP BY thread_id HAVING count(*) > 2
)
AND EXISTS (
  SELECT 1 FROM public.message_threads mt
  WHERE mt.id = mtp.thread_id
    AND mt.participant_low IS NOT NULL
    AND mt.participant_high IS NOT NULL
)
AND mtp.user_id IS DISTINCT FROM (
  SELECT mt.participant_low FROM public.message_threads mt WHERE mt.id = mtp.thread_id
)
AND mtp.user_id IS DISTINCT FROM (
  SELECT mt.participant_high FROM public.message_threads mt WHERE mt.id = mtp.thread_id
);

-- Threads with NULL pair keys: keep earliest two participants, drop the rest.
WITH ranked AS (
  SELECT mtp.thread_id, mtp.user_id, mtp.joined_at,
         row_number() OVER (PARTITION BY mtp.thread_id ORDER BY mtp.joined_at, mtp.user_id) AS rn
  FROM public.message_thread_participants mtp
  JOIN public.message_threads mt ON mt.id = mtp.thread_id
  WHERE mt.participant_low IS NULL OR mt.participant_high IS NULL
)
DELETE FROM public.message_thread_participants mtp
USING ranked r
WHERE mtp.thread_id = r.thread_id
  AND mtp.user_id = r.user_id
  AND r.rn > 2;

-- Backfill pair keys from remaining participants where missing.
UPDATE public.message_threads mt
SET participant_low = sub.low,
    participant_high = sub.high
FROM (
  SELECT thread_id,
         (array_agg(user_id ORDER BY user_id::text))[1] AS low,
         (array_agg(user_id ORDER BY user_id::text))[2] AS high
  FROM public.message_thread_participants
  WHERE user_id IS NOT NULL
  GROUP BY thread_id
  HAVING count(*) = 2
) sub
WHERE mt.id = sub.thread_id
  AND (mt.participant_low IS NULL OR mt.participant_high IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.message_threads d
    WHERE d.context_type = mt.context_type
      AND d.context_id = mt.context_id
      AND d.participant_low = sub.low
      AND d.participant_high = sub.high
  );

-- expires_at only limits how long a request can wait for an answer. Once a
-- relay is accepted the conversation does not expire. Participants of inactive
-- relay threads are kept: the message policies below hide those messages.
UPDATE public.contact_relay
   SET expires_at = NULL
 WHERE status = 'accepted'
   AND revoked_at IS NULL
   AND expires_at IS NOT NULL;

-- ── 3. Message policies: require active context ──────────────────────────────
CREATE OR REPLACE FUNCTION public.message_context_is_active(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mt public.message_threads%ROWTYPE;
  v_relay public.contact_relay%ROWTYPE;
BEGIN
  SELECT * INTO v_mt FROM public.message_threads WHERE id = p_thread_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_mt.context_type = 'contact_relay' THEN
    SELECT * INTO v_relay FROM public.contact_relay WHERE id = v_mt.context_id;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    RETURN v_relay.status = 'accepted'
      AND v_relay.revoked_at IS NULL;
  END IF;

  -- Other contexts stay open while the thread exists and pair keys are set.
  RETURN v_mt.participant_low IS NOT NULL AND v_mt.participant_high IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.message_context_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_context_is_active(uuid) TO authenticated;

DROP POLICY IF EXISTS msg_select_participant ON public.messages;
CREATE POLICY msg_select_participant ON public.messages
  FOR SELECT TO authenticated
  USING (
    (public.is_message_thread_participant(thread_id) OR public.is_admin())
    AND public.message_context_is_active(thread_id)
  );

DROP POLICY IF EXISTS msg_insert_participant ON public.messages;
CREATE POLICY msg_insert_participant ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_message_thread_participant(thread_id)
    AND public.message_context_is_active(thread_id)
  );

-- ── 4. Admin cannot verify/approve own records ───────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_identifier(
  p_person uuid,
  p_id_type text,
  p_attachment uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF public.is_record_owner(p_person) THEN
    RAISE EXCEPTION 'cannot_self_verify' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.persons p
    JOIN public.trees t ON t.id = p.tree_id
    WHERE p.id = p_person AND t.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_self_verify' USING ERRCODE = '42501';
  END IF;
  IF p_id_type NOT IN ('unrwa_registration', 'family_card_1948') THEN
    RAISE EXCEPTION 'bad_id_type' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.person_attachments a
     WHERE a.id = p_attachment
       AND a.person_id = p_person
       AND a.tag::text = public.identifier_tag_for_type(p_id_type)
  ) THEN
    RAISE EXCEPTION 'no_card_copy' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.person_identifiers
     SET verified_at = now(),
         verified_by = v_uid,
         verified_attachment_id = p_attachment,
         evidence_attachment_id = COALESCE(evidence_attachment_id, p_attachment),
         rejected_at = NULL
   WHERE person_id = p_person AND id_type = p_id_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_number' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_identifier(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_identifier(uuid, text, uuid) TO authenticated;

-- respond_person_claim: also block admin approving their own request (already blocks self)
CREATE OR REPLACE FUNCTION public.respond_person_claim(p_claim_id uuid, p_decision text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.person_claim_requests%ROWTYPE;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_decision NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT * INTO v_row FROM public.person_claim_requests WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'claim_not_pending';
  END IF;
  IF v_uid = v_row.requester_user_id THEN
    RAISE EXCEPTION 'cannot_self_approve' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO v_owner FROM public.trees WHERE id = v_row.tree_id;
  IF NOT (public.is_admin() OR v_owner = v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  -- Admin acting on a claim for a person they own / are linked to still blocked
  -- when they are the requester (above). Extra: admin must not approve claims
  -- on their own linked person as the record subject.
  IF public.is_admin() AND public.is_record_owner(v_row.person_id) THEN
    RAISE EXCEPTION 'cannot_self_approve' USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'approved' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = v_row.requester_user_id
        AND pr.linked_person_id IS NOT NULL
        AND pr.deleted_at IS NULL
        AND pr.linked_person_id IS DISTINCT FROM v_row.person_id
    ) THEN
      RAISE EXCEPTION 'requester_already_linked' USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.linked_person_id = v_row.person_id
        AND pr.deleted_at IS NULL
        AND pr.id <> v_row.requester_user_id
    ) THEN
      RAISE EXCEPTION 'already_linked' USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.person_claim_requests
     SET status = p_decision, reviewed_by = v_uid, reviewed_at = now()
   WHERE id = p_claim_id;

  IF p_decision = 'approved' THEN
    DELETE FROM public.person_field_grants g
    WHERE g.person_id = v_row.person_id
      AND EXISTS (
        SELECT 1 FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = g.person_id AND t.owner_id = g.granted_by
      )
      AND g.granted_by <> v_row.requester_user_id;

    UPDATE public.profiles
       SET linked_person_id = v_row.person_id,
           self_person_id = v_row.person_id,
           updated_at = now()
     WHERE id = v_row.requester_user_id AND deleted_at IS NULL;

    UPDATE public.person_claim_requests
       SET status = 'declined', reviewed_by = v_uid, reviewed_at = now()
     WHERE person_id = v_row.person_id AND status = 'pending' AND id <> p_claim_id;
  END IF;

  RETURN v_row.person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_person_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_person_claim(uuid, text) TO authenticated;


-- ── 5. compute_all_paths: do not expand past the target (cuts full enumeration)
CREATE OR REPLACE FUNCTION public.compute_all_paths(
  p_source   uuid,
  p_target   uuid,
  p_max_paths int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src_tree uuid;
  v_tgt_tree uuid;
  v_max int;
  v_paths jsonb := '[]'::jsonb;
  v_found int := 0;
  r record;
BEGIN
  IF p_source IS NULL OR p_target IS NULL OR p_source = p_target THEN
    RETURN jsonb_build_object('paths', jsonb_build_array(), 'note', 'same_person');
  END IF;

  SELECT tree_id INTO v_src_tree FROM public.persons WHERE id = p_source;
  SELECT tree_id INTO v_tgt_tree FROM public.persons WHERE id = p_target;
  IF v_src_tree IS NULL OR NOT public.can_access_tree(v_src_tree) THEN
    RETURN NULL;
  END IF;
  IF v_tgt_tree IS NULL OR NOT public.can_access_tree(v_tgt_tree) THEN
    RETURN jsonb_build_object('paths', jsonb_build_array(), 'note', 'target_inaccessible');
  END IF;

  v_max := GREATEST(1, LEAST(COALESCE(p_max_paths, 5), 5));

  FOR r IN
    WITH RECURSIVE edges AS (
      SELECT fam.partner1_id AS a, fc.child_id AS b, 'parent'::text AS rel
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner1_id IS NOT NULL
      UNION ALL
      SELECT fam.partner2_id, fc.child_id, 'parent'
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner2_id IS NOT NULL
      UNION ALL
      SELECT fc.child_id, fam.partner1_id, 'child'
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner1_id IS NOT NULL
      UNION ALL
      SELECT fc.child_id, fam.partner2_id, 'child'
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner2_id IS NOT NULL
      UNION ALL
      SELECT partner1_id, partner2_id, 'spouse' FROM public.families
        WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL
      UNION ALL
      SELECT partner2_id, partner1_id, 'spouse' FROM public.families
        WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL
      UNION ALL
      SELECT fc1.child_id, fc2.child_id, 'sibling'
        FROM public.family_children fc1
        JOIN public.family_children fc2 ON fc1.family_id = fc2.family_id
        WHERE fc1.child_id <> fc2.child_id
      UNION ALL
      SELECT person_a_id, person_b_id, 'same_as' FROM public.person_links WHERE status = 'confirmed'
      UNION ALL
      SELECT person_b_id, person_a_id, 'same_as' FROM public.person_links WHERE status = 'confirmed'
    ),
    bfs AS (
      SELECT
        p_source AS node,
        0 AS depth,
        ARRAY[p_source] AS path,
        ARRAY[]::text[] AS rels
      UNION ALL
      SELECT
        e.b,
        bfs.depth + CASE WHEN e.rel = 'same_as' THEN 0 ELSE 1 END,
        bfs.path || e.b,
        bfs.rels || e.rel
      FROM bfs
      JOIN edges e ON e.a = bfs.node
      WHERE bfs.depth < 5
        AND bfs.node IS DISTINCT FROM p_target
        AND NOT (e.b = ANY(bfs.path))
        AND cardinality(bfs.path) < 10
    )
    SELECT
      h.depth AS degrees,
      (SELECT jsonb_agg(
          jsonb_build_object(
            'person_id', pid,
            'relation', CASE WHEN idx = 1 THEN 'self' ELSE h.rels[idx - 1] END
          ) ORDER BY idx)
        FROM unnest(h.path) WITH ORDINALITY AS t(pid, idx)
      ) AS struct_path
    FROM (
      SELECT * FROM bfs WHERE node = p_target
      ORDER BY depth ASC, cardinality(path) ASC
      LIMIT v_max
    ) h
  LOOP
    v_found := v_found + 1;
    v_paths := v_paths || jsonb_build_array(
      jsonb_build_object(
        'degrees', r.degrees,
        'path', public.mask_degrees_path(p_source, r.struct_path)
      )
    );
    EXIT WHEN v_found >= v_max;
  END LOOP;

  RETURN jsonb_build_object(
    'paths', v_paths,
    'max_paths', v_max,
    'note', 'all_paths_within_graph'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compute_all_paths(uuid, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_all_paths(uuid, uuid, int) TO authenticated;

-- ── 6. (district-only search fixed in apps/web search.ts)
-- ── 7. Scheduled matching: default OFF; statement_timeout on wrapper ─────────
UPDATE public.app_settings
SET nightly_matching_enabled = false
WHERE nightly_matching_enabled IS TRUE;

ALTER TABLE public.app_settings
  ALTER COLUMN nightly_matching_enabled SET DEFAULT false;

DROP FUNCTION IF EXISTS public.run_matching_scheduled(boolean);
CREATE OR REPLACE FUNCTION public.run_matching_scheduled(p_force_full boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '15min'
AS $$
DECLARE
  v_enabled boolean;
  v_dow int;
  v_full boolean;
  v_run uuid;
BEGIN
  SELECT COALESCE(nightly_matching_enabled, false) INTO v_enabled
  FROM public.app_settings LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'nightly_matching_disabled');
  END IF;

  v_dow := EXTRACT(DOW FROM timezone('utc', now()))::int;
  v_full := COALESCE(p_force_full, false) OR (v_dow = 0);
  v_run := public.run_matching_batch(v_full);

  RETURN jsonb_build_object(
    'full', v_full,
    'run_id', v_run,
    'skipped', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_matching_scheduled(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_matching_scheduled(boolean) TO service_role;

-- ── 8. num_children: 0=0 must not score
DO $$
DECLARE
  src text;
  new_src text;
  fname text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='score_pair_impl'
  ) THEN
    fname := 'score_pair_impl';
  ELSE
    fname := 'score_pair';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname=fname
  ORDER BY p.oid DESC LIMIT 1;

  IF src IS NULL THEN
    RAISE NOTICE 'score function missing';
    RETURN;
  END IF;

  new_src := replace(
    src,
    'IF a.num_children IS NULL OR b.num_children IS NULL THEN
    p_children := 0;
  ELSIF a.num_children = b.num_children THEN
    p_children := 8;
  ELSE
    p_children := 0;
  END IF;',
    'IF a.num_children IS NULL OR b.num_children IS NULL THEN
    p_children := 0;
  ELSIF a.num_children = 0 AND b.num_children = 0 THEN
    p_children := 0;
  ELSIF a.num_children = b.num_children THEN
    p_children := 8;
  ELSE
    p_children := 0;
  END IF;'
  );

  IF new_src IS DISTINCT FROM src THEN
    EXECUTE new_src;
  ELSE
    RAISE NOTICE 'num_children block not found for patch';
  END IF;
END $$;

-- ── 9. Server-side orphaned attachment cleanup ────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_person_attachment(p_attachment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.person_attachments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.person_attachments WHERE id = p_attachment_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT (
    v_row.uploaded_by = v_uid
    OR public.is_admin()
    OR public.is_record_owner(v_row.person_id)
    OR EXISTS (
      SELECT 1 FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = v_row.person_id AND t.owner_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.person_attachments WHERE id = p_attachment_id;

  -- The caller removes the file through the Storage API with this path
  -- (deleting storage.objects rows from SQL does not remove the file).
  RETURN v_row.storage_path;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_person_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_person_attachment(uuid) TO authenticated;

-- Uploaders, record owners and admins may delete an attachment's file (the
-- original policy only allowed the tree owner). Checked through a definer
-- helper so person_attachments RLS does not hide the row from the uploader.
CREATE OR REPLACE FUNCTION public.can_delete_attachment_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.person_attachments a
      WHERE a.storage_path = p_name
        AND (a.uploaded_by = auth.uid() OR public.is_record_owner(a.person_id))
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_delete_attachment_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_attachment_object(text) TO authenticated;

DROP POLICY IF EXISTS "pa_storage_delete_uploader_or_owner" ON storage.objects;
CREATE POLICY "pa_storage_delete_uploader_or_owner" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'person-attachments'
    AND public.can_delete_attachment_object(name)
  );

-- ── 10. UNRWA registration year ──────────────────────────────────────────────
-- unrwa_registration_date is an int year. upsert_person_displacement treats 0
-- as "clear" and NULL as "keep", so no trigger is needed.
DROP TRIGGER IF EXISTS trg_clear_unrwa_reg_date_sentinel ON public.person_displacement;
DROP FUNCTION IF EXISTS public.clear_unrwa_registration_date_if_sentinel();
DROP FUNCTION IF EXISTS public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid,
  text, date, text, text, text, text, text, text, text, text, text, text, text, text
);
