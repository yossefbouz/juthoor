-- ============================================================================
-- PR #26 review remediation (privacy, messaging, ownership, account closure)
-- ============================================================================

-- ── 1. trees_select: keep owner/public inline (INSERT…RETURNING safety) ──────
DROP POLICY IF EXISTS "trees_select" ON public.trees;
CREATE POLICY "trees_select"
  ON public.trees
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR is_public
    OR public.can_access_tree(id)
    OR public.is_admin()
  );

-- ── 2. Messaging: always verify caller is a party to the context ─────────────
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
  v_other uuid;
  v_context_id uuid := p_context_id;
  v_attachment public.person_attachments%ROWTYPE;
  v_tree_id uuid;
  v_owner uuid;
  v_relay public.contact_relay%ROWTYPE;
  v_body text;
  v_relay_found boolean := false;
  v_party_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_context_id IS NULL THEN
    RAISE EXCEPTION 'context_id required';
  END IF;

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
    v_party_ok := (v_uid = v_owner OR v_uid = v_attachment.uploaded_by OR public.is_admin());
    IF NOT v_party_ok THEN
      RAISE EXCEPTION 'Not a party to this attachment thread' USING ERRCODE = '42501';
    END IF;
    IF v_owner = v_uid THEN
      v_other := COALESCE(p_counterpart_user_id, v_attachment.uploaded_by);
    ELSE
      v_other := COALESCE(p_counterpart_user_id, v_owner);
    END IF;

  ELSIF p_context_type = 'contact_relay' THEN
    SELECT * INTO v_relay FROM public.contact_relay WHERE id = v_context_id;
    v_relay_found := FOUND;
    IF NOT v_relay_found THEN
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
      v_party_ok := (v_uid = v_relay.from_user_id OR v_uid = v_relay.to_user_id OR public.is_admin());
      IF NOT v_party_ok THEN
        RAISE EXCEPTION 'Not a contact_relay participant' USING ERRCODE = '42501';
      END IF;
      IF v_relay.from_user_id = v_uid THEN
        v_other := v_relay.to_user_id;
      ELSE
        v_other := v_relay.from_user_id;
      END IF;
    ELSIF p_counterpart_user_id IS NOT NULL THEN
      -- Creating a new relay-backed thread requires ensure_contact_relay first.
      RAISE EXCEPTION 'contact_relay not found; create relay before opening thread';
    ELSE
      RAISE EXCEPTION 'contact_relay not found; pass counterpart_user_id';
    END IF;

  ELSIF p_context_type = 'relationship_dispute' THEN
    SELECT f.tree_id INTO v_tree_id FROM public.families f WHERE f.id = v_context_id;
    IF v_tree_id IS NULL THEN
      RAISE EXCEPTION 'Family not found for dispute';
    END IF;
    SELECT t.owner_id INTO v_owner FROM public.trees t WHERE t.id = v_tree_id;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Tree owner not found';
    END IF;
    v_party_ok := (
      v_uid = v_owner
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.relationship_disputes d
        WHERE d.tree_id = v_tree_id AND d.raised_by = v_uid
      )
      OR public.can_write_tree(v_tree_id)
    );
    IF NOT v_party_ok THEN
      RAISE EXCEPTION 'Not a party to this dispute thread' USING ERRCODE = '42501';
    END IF;
    IF v_owner = v_uid THEN
      IF p_counterpart_user_id IS NULL THEN
        RAISE EXCEPTION 'counterpart_user_id required when caller is tree owner';
      END IF;
      v_other := p_counterpart_user_id;
    ELSE
      v_other := COALESCE(p_counterpart_user_id, v_owner);
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported message context';
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
  v_party boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_match_id IS NULL OR p_counterpart_user_id IS NULL OR p_counterpart_user_id = v_uid THEN
    RAISE EXCEPTION 'Invalid contact_relay parties';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.persons pa ON pa.id = m.person_a_id
    JOIN public.persons pb ON pb.id = m.person_b_id
    JOIN public.trees ta ON ta.id = pa.tree_id
    JOIN public.trees tb ON tb.id = pb.tree_id
    WHERE m.id = p_match_id
      AND (
        ta.owner_id = v_uid
        OR tb.owner_id = v_uid
        OR public.is_admin()
        OR public.can_write_tree(pa.tree_id)
        OR public.can_write_tree(pb.tree_id)
      )
  ) INTO v_party;

  IF NOT v_party THEN
    RAISE EXCEPTION 'Not a party to this match' USING ERRCODE = '42501';
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

-- ── 3. Identity-doc storage: gate id_card / unrwa_card / family_card reads ───
DROP POLICY IF EXISTS "pa_storage_read" ON storage.objects;
CREATE POLICY "pa_storage_read" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (
    bucket_id = 'person-attachments'
    AND public.can_access_tree(((storage.foldername(storage.objects.name))[1])::uuid)
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.person_attachments pa
        WHERE pa.storage_path = storage.objects.name
          AND pa.tag IS NOT NULL
          AND pa.tag::text IN ('id_card', 'family_card', 'passport')
      )
      OR EXISTS (
        SELECT 1
        FROM public.person_attachments pa
        JOIN public.persons p ON p.id = pa.person_id
        WHERE pa.storage_path = storage.objects.name
          AND (
            public.is_admin()
            OR pa.uploaded_by = auth.uid()
            OR public.is_record_owner(pa.person_id)
            OR public.can_write_tree(p.tree_id)
          )
      )
    )
  );

-- ── 4. Sensitive field visibility (living displacement / identifiers) ────────
CREATE OR REPLACE FUNCTION public.can_view_sensitive_person_fields(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR EXISTS (
      SELECT 1 FROM public.person_field_grants g
      WHERE g.person_id = p_person_id
        AND g.grantee_user_id = auth.uid()
        AND g.scope = 'optional_fields'
    )
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = p_person_id
        AND (
          public.can_write_tree(p.tree_id)
          OR (
            NOT public.is_person_living(p_person_id)
            AND public.can_access_tree(p.tree_id)
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_sensitive_person_fields(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_sensitive_person_fields(uuid) TO authenticated;

DROP POLICY IF EXISTS person_displacement_select ON public.person_displacement;
CREATE POLICY person_displacement_select ON public.person_displacement FOR SELECT
  TO authenticated
  USING (public.can_view_sensitive_person_fields(person_id));

DROP POLICY IF EXISTS person_identifiers_select ON public.person_identifiers;
CREATE POLICY person_identifiers_select ON public.person_identifiers FOR SELECT
  TO authenticated
  USING (public.can_view_sensitive_person_fields(person_id));

-- Living optional-field writes for identifiers (D1), plus evidence same-person check
DROP POLICY IF EXISTS person_identifiers_insert ON public.person_identifiers;
CREATE POLICY person_identifiers_insert ON public.person_identifiers FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_edit_optional_person_fields(person_id)
    AND (
      evidence_attachment_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.person_attachments a
        WHERE a.id = evidence_attachment_id AND a.person_id = person_identifiers.person_id
      )
    )
  );

DROP POLICY IF EXISTS person_identifiers_update ON public.person_identifiers;
CREATE POLICY person_identifiers_update ON public.person_identifiers FOR UPDATE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id))
  WITH CHECK (
    public.can_edit_optional_person_fields(person_id)
    AND (
      evidence_attachment_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.person_attachments a
        WHERE a.id = evidence_attachment_id AND a.person_id = person_identifiers.person_id
      )
    )
  );

-- Contact columns: living rows only visible to sensitive viewers; deceased keep tree access
DROP POLICY IF EXISTS person_profiles_select ON public.person_profiles;
CREATE POLICY person_profiles_select ON public.person_profiles FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.can_view_sensitive_person_fields(person_id)
    OR (
      NOT public.is_person_living(person_id)
      AND EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
      )
    )
    OR (
      -- Living story without exposing contact: allow tree accessors but app strips contact.
      -- Prefer sensitive viewers for full row; tree accessors still need achievements when consented.
      EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
      )
    )
  );

-- ── 5. Tree owner retains optional-field control until a record owner claims ─
CREATE OR REPLACE FUNCTION public.can_edit_optional_person_fields(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR EXISTS (
      SELECT 1 FROM public.person_field_grants g
      WHERE g.person_id = p_person_id
        AND g.grantee_user_id = auth.uid()
        AND g.scope = 'optional_fields'
    )
    OR (
      NOT public.is_person_living(p_person_id)
      AND EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = p_person_id
          AND public.can_write_tree(p.tree_id)
      )
    )
    OR (
      -- Living, unclaimed: IFT Admin (tree owner) may edit and grant.
      public.is_person_living(p_person_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.linked_person_id = p_person_id
          AND pr.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = p_person_id
          AND t.owner_id = auth.uid()
      )
    );
$$;

DROP POLICY IF EXISTS person_field_grants_insert ON public.person_field_grants;
CREATE POLICY person_field_grants_insert ON public.person_field_grants FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_record_owner(person_id)
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.linked_person_id = person_id AND pr.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = person_id AND t.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS person_field_grants_delete ON public.person_field_grants;
CREATE POLICY person_field_grants_delete ON public.person_field_grants FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_record_owner(person_id)
    OR granted_by = auth.uid()
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.linked_person_id = person_id AND pr.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = person_id AND t.owner_id = auth.uid()
      )
    )
  );

-- ── 6. Protect linked_person_id / self_person_id; claim via RPC ─────────────
CREATE OR REPLACE FUNCTION public.protect_profiles_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND coalesce(NEW.is_admin, false) THEN
      RAISE EXCEPTION 'is_admin can only be set by a platform administrator'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'is_admin can only be changed by a platform administrator'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' AND coalesce(NEW.is_moderator, false) THEN
      RAISE EXCEPTION 'is_moderator can only be set by a platform administrator'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.is_moderator IS DISTINCT FROM OLD.is_moderator THEN
      RAISE EXCEPTION 'is_moderator can only be changed by a platform administrator'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF NEW.linked_person_id IS NOT NULL OR NEW.self_person_id IS NOT NULL THEN
        RAISE EXCEPTION 'linked_person_id can only be set via claim_linked_person'
          USING ERRCODE = '42501';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.linked_person_id IS DISTINCT FROM OLD.linked_person_id
         OR NEW.self_person_id IS DISTINCT FROM OLD.self_person_id THEN
        -- Allow clearing (release / account closure). Setting a person needs the RPC.
        IF NOT (NEW.linked_person_id IS NULL AND NEW.self_person_id IS NULL) THEN
          RAISE EXCEPTION 'linked_person_id can only be set via claim_linked_person'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_linked_person(p_person_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'person_id required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'Person not found or not accessible' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.linked_person_id = p_person_id
      AND pr.deleted_at IS NULL
      AND pr.id <> v_uid
  ) THEN
    RAISE EXCEPTION 'already_linked' USING ERRCODE = '23505';
  END IF;

  v_ok := public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.identity_verifications v
      WHERE v.user_id = v_uid AND v.status = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = p_person_id
        AND p.created_by = v_uid
        AND t.owner_id = v_uid
    );

  IF NOT v_ok THEN
    RAISE EXCEPTION 'verification_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET linked_person_id = p_person_id,
         self_person_id = p_person_id,
         updated_at = now()
   WHERE id = v_uid
     AND deleted_at IS NULL;

  RETURN p_person_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_linked_person(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_linked_person(uuid) TO authenticated;

COMMENT ON FUNCTION public.claim_linked_person(uuid) IS
  'D1: set profiles.linked_person_id. Requires approved identity verification, admin, or creating self in own tree.';

-- ── 7. Account closure FKs → ON DELETE SET NULL ─────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%ON DELETE%'
      AND c.conrelid::regclass::text IN (
        'persons', 'matches', 'person_links', 'merge_log', 'match_audit',
        'tree_members', 'person_privacy_holds'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
      r.tbl, r.conname, r.col
    );
  END LOOP;
END $$;

ALTER TABLE public.access_log
  DROP CONSTRAINT IF EXISTS access_log_viewer_id_fkey;
ALTER TABLE public.access_log
  ADD CONSTRAINT access_log_viewer_id_fkey
  FOREIGN KEY (viewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 8. teardown_person_link / compute_all_paths hardening ───────────────────
CREATE OR REPLACE FUNCTION public.teardown_person_link(p_link_id uuid, p_actor_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  l public.person_links%ROWTYPE;
BEGIN
  -- Direct EXECUTE is revoked from anon/authenticated below. Call only from
  -- revoke_person_link / revoke_auto_link (which enforce admin or tree write).
  SELECT * INTO l FROM public.person_links WHERE id = p_link_id;
  IF l.id IS NULL THEN RAISE EXCEPTION 'link_not_found' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.person_links SET status = 'revoked', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_link_id;
  INSERT INTO public.merge_log(action, person_link_id, match_id, actor_user_id, actor_role,
      before_state, after_state)
    VALUES ('revoke', p_link_id, l.source_match_id, auth.uid(), coalesce(p_actor_role, 'admin'),
            jsonb_build_object('status', l.status), jsonb_build_object('status','revoked'));

  DELETE FROM public.notifications WHERE person_link_id = p_link_id;
  UPDATE public.contact_relay SET revoked_at = now()
    WHERE match_id = l.source_match_id AND revoked_at IS NULL;

  DELETE FROM public.match_paths
    WHERE source_person_id IN (l.person_a_id, l.person_b_id)
       OR target_person_id IN (l.person_a_id, l.person_b_id);

  PERFORM public.enqueue_overlay_refresh('revoke', p_link_id);
END $$;

REVOKE ALL ON FUNCTION public.teardown_person_link(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.teardown_person_link(uuid, text) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.compute_all_paths(uuid, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_all_paths(uuid, uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_all_paths(uuid, uuid, int) TO authenticated;

-- Cap path search depth (8 → 6) and require access to both endpoints.
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
  v_row record;
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

  FOR v_row IN
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
      WHERE bfs.depth < 6
        AND NOT (e.b = ANY(bfs.path))
        AND cardinality(bfs.path) < 14
    ),
    hits AS (
      SELECT *
      FROM bfs
      WHERE node = p_target
      ORDER BY depth ASC, cardinality(path) ASC
      LIMIT v_max
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
    FROM hits h
  LOOP
    v_paths := v_paths || jsonb_build_array(
      jsonb_build_object(
        'degrees', v_row.degrees,
        'path', public.mask_degrees_path(p_source, v_row.struct_path)
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'paths', v_paths,
    'max_paths', v_max,
    'note', 'all_paths_within_graph'
  );
END;
$$;

-- ── 9. PFT links: both sides must be accessible; mask living names ──────────
CREATE OR REPLACE FUNCTION public.list_visible_pft_links()
RETURNS TABLE (
  link_id               uuid,
  person_a_id           uuid,
  person_b_id           uuid,
  tree_a_id             uuid,
  tree_b_id             uuid,
  name_a_ar             text,
  name_a_en             text,
  name_b_ar             text,
  name_b_en             text,
  canonical_person_id   uuid,
  group_id              uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    l.id AS link_id,
    l.person_a_id,
    l.person_b_id,
    pa.tree_id AS tree_a_id,
    pb.tree_id AS tree_b_id,
    CASE
      WHEN public.is_person_living(pa.id) AND NOT public.can_view_sensitive_person_fields(pa.id)
        THEN NULL
      ELSE pa.display_name_ar
    END AS name_a_ar,
    CASE
      WHEN public.is_person_living(pa.id) AND NOT public.can_view_sensitive_person_fields(pa.id)
        THEN NULL
      ELSE pa.display_name_en
    END AS name_a_en,
    CASE
      WHEN public.is_person_living(pb.id) AND NOT public.can_view_sensitive_person_fields(pb.id)
        THEN NULL
      ELSE pb.display_name_ar
    END AS name_b_ar,
    CASE
      WHEN public.is_person_living(pb.id) AND NOT public.can_view_sensitive_person_fields(pb.id)
        THEN NULL
      ELSE pb.display_name_en
    END AS name_b_en,
    COALESCE(ga.canonical_person_id, gb.canonical_person_id, l.person_a_id) AS canonical_person_id,
    COALESCE(ga.group_id, gb.group_id, l.person_a_id) AS group_id
  FROM public.person_links l
  JOIN public.persons pa ON pa.id = l.person_a_id
  JOIN public.persons pb ON pb.id = l.person_b_id
  LEFT JOIN public.person_identity_groups ga ON ga.person_id = l.person_a_id
  LEFT JOIN public.person_identity_groups gb ON gb.person_id = l.person_b_id
  WHERE l.status = 'confirmed'
    AND (
      public.is_admin()
      OR (
        public.can_access_tree(pa.tree_id)
        AND public.can_access_tree(pb.tree_id)
      )
    )
  ORDER BY COALESCE(ga.group_id, gb.group_id, l.person_a_id), l.created_at;
$$;

-- ── 10. Relationship disputes: persons must belong to the tree ──────────────
CREATE OR REPLACE FUNCTION public.raise_relationship_dispute(
  p_tree_id uuid,
  p_person_a uuid,
  p_person_b uuid,
  p_relation_type text,
  p_note text DEFAULT NULL
)
RETURNS public.relationship_disputes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_row public.relationship_disputes;
  v_a text;
  v_b text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_tree_id IS NULL OR p_person_a IS NULL OR p_person_b IS NULL THEN
    RAISE EXCEPTION 'tree_id, person_a, and person_b are required';
  END IF;
  IF NOT public.can_access_tree(p_tree_id) THEN
    RAISE EXCEPTION 'Cannot access this tree';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_a AND tree_id = p_tree_id) THEN
    RAISE EXCEPTION 'person_a does not belong to tree';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_person_b AND tree_id = p_tree_id) THEN
    RAISE EXCEPTION 'person_b does not belong to tree';
  END IF;

  SELECT owner_id INTO v_owner FROM public.trees WHERE id = p_tree_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Tree not found';
  END IF;

  SELECT COALESCE(display_name_ar, display_name_en, '?') INTO v_a
  FROM public.persons WHERE id = p_person_a;
  SELECT COALESCE(display_name_ar, display_name_en, '?') INTO v_b
  FROM public.persons WHERE id = p_person_b;

  INSERT INTO public.relationship_disputes(
    tree_id, person_a, person_b, relation_type, status, raised_by, note
  ) VALUES (
    p_tree_id, p_person_a, p_person_b,
    COALESCE(NULLIF(trim(p_relation_type), ''), 'unknown'),
    'open', v_uid, NULLIF(trim(COALESCE(p_note, '')), '')
  )
  RETURNING * INTO v_row;

  INSERT INTO public.notifications(
    recipient_user_id, kind, title_ar, title_en, body_ar, body_en, link
  ) VALUES (
    v_owner,
    'relationship_dispute',
    'نزاع على صلة قرابة',
    'Relationship dispute',
    'تم الإبلاغ عن نزاع في الصلة بين ' || COALESCE(v_a, '?') || ' و ' || COALESCE(v_b, '?'),
    'A relationship dispute was raised between ' || COALESCE(v_a, '?') || ' and ' || COALESCE(v_b, '?'),
    '/tree/' || p_tree_id::text || '/person/' || p_person_a::text
  );

  RETURN v_row;
END;
$$;

-- ── 11. Contact-relay: RPC-only writes; parties respond via helper ──────────
DROP POLICY IF EXISTS contact_relay_insert_own ON public.contact_relay;
DROP POLICY IF EXISTS contact_relay_update_parties ON public.contact_relay;

CREATE OR REPLACE FUNCTION public.respond_contact_relay(
  p_relay_id uuid,
  p_status text
)
RETURNS public.contact_relay
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.contact_relay;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_status NOT IN ('accepted', 'declined', 'revoked') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO v_row FROM public.contact_relay WHERE id = p_relay_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Relay not found';
  END IF;
  IF v_row.to_user_id <> v_uid AND v_row.from_user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not a party' USING ERRCODE = '42501';
  END IF;
  IF p_status = 'revoked' AND v_row.from_user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the requester can revoke' USING ERRCODE = '42501';
  END IF;
  IF p_status IN ('accepted', 'declined') AND v_row.to_user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the recipient can accept or decline' USING ERRCODE = '42501';
  END IF;

  UPDATE public.contact_relay
     SET status = p_status,
         responded_at = now(),
         revoked_at = CASE WHEN p_status = 'revoked' THEN now() ELSE revoked_at END
   WHERE id = p_relay_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_contact_relay(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_contact_relay(uuid, text) TO authenticated;

-- ── 12. Appeals insert cannot self-approve ──────────────────────────────────
DROP POLICY IF EXISTS verification_appeals_insert_own ON public.verification_appeals;
CREATE POLICY verification_appeals_insert_own ON public.verification_appeals
  FOR INSERT TO authenticated
  WITH CHECK (
    appellant_id = auth.uid()
    AND status = 'open'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND staff_note IS NULL
    AND EXISTS (
      SELECT 1 FROM public.identity_verifications v
      WHERE v.id = verification_id AND v.user_id = auth.uid()
    )
  );

-- ── 13. sync_person_is_living: also refresh OLD person on reparent/retype ────
CREATE OR REPLACE FUNCTION public.sync_person_is_living()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_event_type text;
  v_old_person uuid;
  v_old_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_person_id := OLD.person_id;
    v_event_type := OLD.event_type;
  ELSE
    v_person_id := NEW.person_id;
    v_event_type := NEW.event_type;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_person := OLD.person_id;
    v_old_type := OLD.event_type;
    IF v_old_person IS DISTINCT FROM v_person_id
       OR v_old_type IS DISTINCT FROM v_event_type THEN
      IF v_old_person IS NOT NULL AND v_old_type IN ('BIRT', 'DEAT') THEN
        UPDATE public.persons p
           SET is_living = public.is_person_living(v_old_person)
         WHERE p.id = v_old_person
           AND p.is_living IS DISTINCT FROM public.is_person_living(v_old_person);
      END IF;
    END IF;
  END IF;

  IF v_person_id IS NULL OR v_event_type NOT IN ('BIRT', 'DEAT') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.persons p
     SET is_living = public.is_person_living(v_person_id)
   WHERE p.id = v_person_id
     AND p.is_living IS DISTINCT FROM public.is_person_living(v_person_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 14. Displacement upsert: do not wipe identifiers when value omitted ─────
-- Recreate with same signature; empty string still clears, NULL keeps existing
-- when the displacement row already has a value. Callers that pass explicit
-- empty string clear. For RPC, treat NULL as "leave identifiers alone" when
-- the displacement columns are also null-preserving via COALESCE on update.

CREATE OR REPLACE FUNCTION public.upsert_person_displacement(
  p_person_id                      uuid,
  p_unrwa_registration_number      text DEFAULT NULL,
  p_family_card_1948_number        text DEFAULT NULL,
  p_host_country_first             text DEFAULT NULL,
  p_host_country_current           text DEFAULT NULL,
  p_refugee_status                 text DEFAULT NULL,
  p_camp_name                      text DEFAULT NULL,
  p_displacement_year              int DEFAULT NULL,
  p_displacement_wave              text DEFAULT NULL,
  p_land_property_notes            text DEFAULT NULL,
  p_oral_history                   text DEFAULT NULL,
  p_oral_history_provenance        text DEFAULT NULL,
  p_unrwa_evidence_attachment_id   uuid DEFAULT NULL
)
RETURNS public.person_displacement
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.person_displacement;
  v_unrwa text;
  v_card  text;
  v_evidence uuid;
  v_existing_evidence uuid;
  v_clear_unrwa boolean := false;
  v_clear_card boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_edit_optional_person_fields(p_person_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Convention: NULL = leave unchanged for identifier mirror; '' = clear.
  v_clear_unrwa := (p_unrwa_registration_number IS NOT NULL AND btrim(p_unrwa_registration_number) = '');
  v_clear_card := (p_family_card_1948_number IS NOT NULL AND btrim(p_family_card_1948_number) = '');
  v_unrwa := NULLIF(btrim(COALESCE(p_unrwa_registration_number, '')), '');
  v_card := NULLIF(btrim(COALESCE(p_family_card_1948_number, '')), '');

  IF p_unrwa_registration_number IS NULL THEN
    SELECT unrwa_registration_number INTO v_unrwa
    FROM public.person_displacement WHERE person_id = p_person_id;
    IF v_unrwa IS NULL THEN
      SELECT id_value INTO v_unrwa
      FROM public.person_identifiers
      WHERE person_id = p_person_id AND id_type = 'unrwa_registration';
    END IF;
  END IF;

  IF p_family_card_1948_number IS NULL THEN
    SELECT family_card_1948_number INTO v_card
    FROM public.person_displacement WHERE person_id = p_person_id;
    IF v_card IS NULL THEN
      SELECT id_value INTO v_card
      FROM public.person_identifiers
      WHERE person_id = p_person_id AND id_type = 'family_card_1948';
    END IF;
  END IF;

  IF v_clear_unrwa THEN v_unrwa := NULL; END IF;
  IF v_clear_card THEN v_card := NULL; END IF;

  v_evidence := p_unrwa_evidence_attachment_id;
  IF v_unrwa IS NOT NULL THEN
    IF v_evidence IS NULL THEN
      SELECT evidence_attachment_id INTO v_existing_evidence
      FROM public.person_identifiers
      WHERE person_id = p_person_id AND id_type = 'unrwa_registration';
      v_evidence := v_existing_evidence;
    END IF;
    IF v_evidence IS NULL THEN
      RAISE EXCEPTION 'unrwa_evidence_required' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.person_attachments a
      WHERE a.id = v_evidence AND a.person_id = p_person_id
    ) THEN
      RAISE EXCEPTION 'unrwa_evidence_person_mismatch' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.person_displacement AS d (
    person_id, unrwa_registration_number, family_card_1948_number,
    host_country_first, host_country_current, refugee_status, camp_name,
    displacement_year, displacement_wave, land_property_notes,
    oral_history, oral_history_provenance, updated_by, updated_at
  ) VALUES (
    p_person_id, v_unrwa, v_card,
    NULLIF(btrim(COALESCE(p_host_country_first, '')), ''),
    NULLIF(btrim(COALESCE(p_host_country_current, '')), ''),
    NULLIF(btrim(COALESCE(p_refugee_status, '')), ''),
    NULLIF(btrim(COALESCE(p_camp_name, '')), ''),
    p_displacement_year,
    NULLIF(btrim(COALESCE(p_displacement_wave, '')), ''),
    NULLIF(btrim(COALESCE(p_land_property_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_oral_history, '')), ''),
    NULLIF(btrim(COALESCE(p_oral_history_provenance, '')), ''),
    auth.uid(), now()
  )
  ON CONFLICT (person_id) DO UPDATE SET
    unrwa_registration_number = EXCLUDED.unrwa_registration_number,
    family_card_1948_number = EXCLUDED.family_card_1948_number,
    host_country_first = COALESCE(EXCLUDED.host_country_first, d.host_country_first),
    host_country_current = COALESCE(EXCLUDED.host_country_current, d.host_country_current),
    refugee_status = COALESCE(EXCLUDED.refugee_status, d.refugee_status),
    camp_name = COALESCE(EXCLUDED.camp_name, d.camp_name),
    displacement_year = COALESCE(EXCLUDED.displacement_year, d.displacement_year),
    displacement_wave = COALESCE(EXCLUDED.displacement_wave, d.displacement_wave),
    land_property_notes = COALESCE(EXCLUDED.land_property_notes, d.land_property_notes),
    oral_history = COALESCE(EXCLUDED.oral_history, d.oral_history),
    oral_history_provenance = COALESCE(EXCLUDED.oral_history_provenance, d.oral_history_provenance),
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING * INTO v_row;

  IF v_unrwa IS NOT NULL THEN
    INSERT INTO public.person_identifiers (person_id, id_type, id_value, evidence_attachment_id)
    VALUES (p_person_id, 'unrwa_registration', v_unrwa, v_evidence)
    ON CONFLICT (person_id, id_type) DO UPDATE SET
      id_value = EXCLUDED.id_value,
      evidence_attachment_id = COALESCE(EXCLUDED.evidence_attachment_id, public.person_identifiers.evidence_attachment_id);
  ELSIF v_clear_unrwa THEN
    DELETE FROM public.person_identifiers
    WHERE person_id = p_person_id AND id_type = 'unrwa_registration';
  END IF;

  IF v_card IS NOT NULL THEN
    INSERT INTO public.person_identifiers (person_id, id_type, id_value)
    VALUES (p_person_id, 'family_card_1948', v_card)
    ON CONFLICT (person_id, id_type) DO UPDATE SET id_value = EXCLUDED.id_value;
  ELSIF v_clear_card THEN
    DELETE FROM public.person_identifiers
    WHERE person_id = p_person_id AND id_type = 'family_card_1948';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_person_displacement(
  uuid, text, text, text, text, text, text, int, text, text, text, text, uuid
) TO authenticated;
