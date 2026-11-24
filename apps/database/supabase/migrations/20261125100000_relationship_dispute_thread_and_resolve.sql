-- Validation of relationships (status sheet row 5): a disputed relationship
-- "contacts the IFT Administrator and opens messaging", and the IFT
-- Administrator (the tree owner or a collaborator) can close the dispute.
--
--  1. raise_relationship_dispute opens (or reuses) a message thread between
--     the person who raised the dispute and the tree owner. Raising the same
--     relationship again while the first dispute is still open returns that
--     dispute and its thread instead of creating a second one.
--  2. resolve_relationship_dispute: someone who can write the tree marks an
--     open dispute resolved or dismissed; the person who raised it is notified.
--  3. Disputes are changed through that function only: the direct UPDATE rule
--     on relationship_disputes is removed (it let the Platform Administrator,
--     who cannot write the tree, change a dispute, and let a tree writer
--     rewrite any column, including someone else's Validated flag).
--
-- Who may validate or dispute is unchanged: anyone who can open the tree.
-- No enum value is added: the 'relationship_dispute' message context exists
-- since 20261107161000 and open_or_create_message_thread already accepts a
-- dispute id (20261109170000).

-- ── 1. Raising a dispute opens the thread with the tree owner ───────────────
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
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text := COALESCE(NULLIF(trim(p_relation_type), ''), 'unknown');
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
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

  -- The same person disputing the same relationship again (from either
  -- person's page) continues the open dispute.
  SELECT * INTO v_row
    FROM public.relationship_disputes d
   WHERE d.tree_id = p_tree_id
     AND d.relation_type = v_type
     AND d.status = 'open'
     AND d.raised_by = v_uid
     AND (
       (d.person_a = p_person_a AND d.person_b = p_person_b)
       OR (d.person_a = p_person_b AND d.person_b = p_person_a)
     )
   ORDER BY d.created_at
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT COALESCE(display_name_ar, display_name_en, '?') INTO v_a
    FROM public.persons WHERE id = p_person_a;
    SELECT COALESCE(display_name_ar, display_name_en, '?') INTO v_b
    FROM public.persons WHERE id = p_person_b;

    INSERT INTO public.relationship_disputes(
      tree_id, person_a, person_b, relation_type, status, raised_by, note
    ) VALUES (
      p_tree_id, p_person_a, p_person_b, v_type, 'open', v_uid, v_note
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
  END IF;

  -- Open messaging with the IFT Administrator. The note becomes the first
  -- message; the thread never carries the two people's names. A tree owner
  -- disputing a link in their own tree has nobody to message.
  IF v_owner <> v_uid THEN
    PERFORM public.open_or_create_message_thread(
      'relationship_dispute'::public.message_context_type,
      v_row.id,
      v_owner,
      v_note
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.raise_relationship_dispute(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_relationship_dispute(uuid, uuid, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.raise_relationship_dispute(uuid, uuid, uuid, text, text) IS
  'AIO2 4.X.1.1.8: record a disputed relationship, notify the tree owner and open a message thread between the person who raised it and the tree owner.';

-- ── 2. The IFT Administrator resolves or dismisses an open dispute ──────────
CREATE OR REPLACE FUNCTION public.resolve_relationship_dispute(
  p_dispute_id uuid,
  p_status text
)
RETURNS public.relationship_disputes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.relationship_disputes;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION 'status must be resolved or dismissed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
    FROM public.relationship_disputes
   WHERE id = p_dispute_id
     FOR UPDATE;
  -- One answer for a dispute that does not exist and for one in a tree the
  -- caller cannot write, so a dispute id cannot be probed.
  IF NOT FOUND OR NOT public.can_write_tree(v_row.tree_id) THEN
    RAISE EXCEPTION 'Dispute not found or not permitted' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'open' THEN
    RAISE EXCEPTION 'Dispute is not open' USING ERRCODE = '22023';
  END IF;

  UPDATE public.relationship_disputes
     SET status = p_status
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  -- Tell the person who raised it. No names: that person may be a visitor
  -- of a public tree who does not see living people's details.
  IF v_row.raised_by <> v_uid THEN
    INSERT INTO public.notifications(
      recipient_user_id, kind, title_ar, title_en, body_ar, body_en, link
    ) VALUES (
      v_row.raised_by,
      'relationship_dispute_' || p_status,
      CASE p_status WHEN 'resolved' THEN 'تمت معالجة اعتراضك' ELSE 'تم رفض اعتراضك' END,
      CASE p_status WHEN 'resolved' THEN 'Your dispute was resolved' ELSE 'Your dispute was dismissed' END,
      CASE p_status
        WHEN 'resolved' THEN 'عالج مسؤول الشجرة اعتراضك على صلة القرابة.'
        ELSE 'رفض مسؤول الشجرة اعتراضك على صلة القرابة.'
      END,
      CASE p_status
        WHEN 'resolved' THEN 'The tree administrator resolved your relationship dispute.'
        ELSE 'The tree administrator dismissed your relationship dispute.'
      END,
      '/tree/' || v_row.tree_id::text || '/person/' || v_row.person_a::text
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_relationship_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_relationship_dispute(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.resolve_relationship_dispute(uuid, text) IS
  'A tree writer (can_write_tree) marks an open relationship dispute resolved or dismissed; the person who raised it is notified.';

-- ── 3. Disputes change through resolve_relationship_dispute only ────────────
DROP POLICY IF EXISTS relationship_disputes_update ON public.relationship_disputes;
