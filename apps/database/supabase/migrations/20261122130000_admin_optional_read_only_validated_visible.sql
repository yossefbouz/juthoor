-- ============================================================================
-- PR #31 review, remaining items (2026-11-22)
-- ============================================================================
--  1. A Platform Administrator no longer writes a person's optional fields
--     (D9: the administrator does not edit people). can_edit_optional_person_fields
--     loses its is_admin() branch, so the insert / update rules and the upsert
--     functions for person_profiles, person_displacement, person_identifiers and
--     person_notes no longer pass for an administrator.
--     Unchanged on purpose:
--       * reading: get_person_story, get_person_contact, person_notes_select and
--         can_view_sensitive_person_fields each name is_admin() themselves;
--       * the card check: verify_identifier / reject_identifier are their own
--         admin-only functions;
--       * the delete rules that say "OR is_admin()" (removing content), the
--         attachment upload rules and person_field_grants. Those wait for the
--         decision on which powers an administrator keeps.
--  2. A relationship marked Validated is visible to everyone who can open the
--     tree. Before, only the person who validated it, tree writers and
--     administrators could read the row, so the flag could not be shown.
-- ============================================================================

-- ── 1. Optional-field editors: no administrator branch ──────────────────────
CREATE OR REPLACE FUNCTION public.can_edit_optional_person_fields(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_record_owner(p_person_id)
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
      public.is_person_living(p_person_id)
      AND NOT public.is_person_claimed(p_person_id)
      AND EXISTS (
        SELECT 1
        FROM public.persons p
        JOIN public.trees t ON t.id = p.tree_id
        WHERE p.id = p_person_id
          AND t.owner_id = auth.uid()
      )
    );
$$;

COMMENT ON FUNCTION public.can_edit_optional_person_fields(uuid) IS
  'Who may write a person''s optional fields (D1, D9): the record owner, a grantee, a tree writer for a deceased person, or the tree owner for a living unclaimed person. Not the Platform Administrator.';

-- ── 2. Validated relationships are visible to tree viewers ──────────────────
DROP POLICY IF EXISTS relationship_disputes_select ON public.relationship_disputes;
CREATE POLICY relationship_disputes_select ON public.relationship_disputes
  FOR SELECT TO authenticated
  USING (
    raised_by = auth.uid()
    OR public.can_write_tree(tree_id)
    OR public.is_admin()
    OR (status = 'validated' AND public.can_access_tree(tree_id))
  );
