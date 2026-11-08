-- W3.6: relationship validate / dispute → notify tree owner (IFT Admin path).

CREATE TABLE IF NOT EXISTS public.relationship_disputes (
  id            uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tree_id       uuid NOT NULL REFERENCES public.trees(id) ON DELETE CASCADE,
  person_a      uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  person_b      uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'resolved', 'dismissed')),
  raised_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relationship_disputes_tree
  ON public.relationship_disputes (tree_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_relationship_disputes_raised
  ON public.relationship_disputes (raised_by, created_at DESC);

ALTER TABLE public.relationship_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relationship_disputes_select ON public.relationship_disputes;
CREATE POLICY relationship_disputes_select ON public.relationship_disputes
  FOR SELECT TO authenticated
  USING (
    raised_by = auth.uid()
    OR public.can_write_tree(tree_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS relationship_disputes_insert ON public.relationship_disputes;
CREATE POLICY relationship_disputes_insert ON public.relationship_disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    raised_by = auth.uid()
    AND public.can_access_tree(tree_id)
  );

DROP POLICY IF EXISTS relationship_disputes_update ON public.relationship_disputes;
CREATE POLICY relationship_disputes_update ON public.relationship_disputes
  FOR UPDATE TO authenticated
  USING (public.can_write_tree(tree_id) OR public.is_admin())
  WITH CHECK (public.can_write_tree(tree_id) OR public.is_admin());

COMMENT ON TABLE public.relationship_disputes IS
  'W3.6: disputed parent/spouse/sibling links. Raising notifies the tree owner.';

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

REVOKE ALL ON FUNCTION public.raise_relationship_dispute(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.raise_relationship_dispute(uuid, uuid, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.raise_relationship_dispute IS
  'W3.6: insert relationship_disputes row and notify the tree owner.';
