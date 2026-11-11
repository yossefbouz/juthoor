-- ============================================================================
-- person_notes: free-text notes split from persons.notes (ported from PR #24)
-- ============================================================================
-- Ownership stays on #26: profiles.linked_person_id / is_record_owner /
-- can_view_sensitive_person_fields / can_edit_optional_person_fields.
-- Do NOT introduce persons.owner_user_id or person_access_grants.

CREATE TABLE IF NOT EXISTS public.person_notes (
  person_id   uuid PRIMARY KEY REFERENCES public.persons(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(btrim(body)) > 0),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.person_notes ENABLE ROW LEVEL SECURITY;

INSERT INTO public.person_notes (person_id, body)
SELECT id, notes
  FROM public.persons
 WHERE notes IS NOT NULL
   AND btrim(notes) <> ''
   AND notes <> 'placeholder'
ON CONFLICT (person_id) DO NOTHING;

UPDATE public.persons
   SET notes = NULL
 WHERE notes IS NOT NULL
   AND notes <> 'placeholder';

DROP POLICY IF EXISTS person_notes_select ON public.person_notes;
CREATE POLICY person_notes_select ON public.person_notes
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_record_owner(person_id)
    OR public.can_view_sensitive_person_fields(person_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.persons p
         WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.persons p2
         WHERE p2.id = person_id AND coalesce(p2.is_living, false)
      )
    )
  );

DROP POLICY IF EXISTS person_notes_write ON public.person_notes;
CREATE POLICY person_notes_write ON public.person_notes
  FOR ALL TO authenticated
  USING (
    public.is_record_owner(person_id)
    OR public.can_edit_optional_person_fields(person_id)
  )
  WITH CHECK (
    public.is_record_owner(person_id)
    OR public.can_edit_optional_person_fields(person_id)
  );

COMMENT ON TABLE public.person_notes IS
  'Free-text person notes (D1). Living notes gated by record owner / optional-field editors; deceased follow tree access.';

CREATE OR REPLACE FUNCTION public.upsert_person_note(p_person_id uuid, p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_body text := NULLIF(btrim(COALESCE(p_body, '')), '');
BEGIN
  IF NOT (
    public.is_record_owner(p_person_id)
    OR public.can_edit_optional_person_fields(p_person_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_body IS NULL THEN
    DELETE FROM public.person_notes WHERE person_id = p_person_id;
    RETURN;
  END IF;

  INSERT INTO public.person_notes (person_id, body, updated_by, updated_at)
  VALUES (p_person_id, v_body, auth.uid(), now())
  ON CONFLICT (person_id) DO UPDATE
    SET body = EXCLUDED.body,
        updated_by = auth.uid(),
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_person_note(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_person_note(uuid, text) TO authenticated;
