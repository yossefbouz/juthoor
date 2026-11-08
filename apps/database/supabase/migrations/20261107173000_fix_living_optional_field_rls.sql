-- ============================================================================
-- P0: Spec D1 / R12 — living optional-field write gate
-- ============================================================================
-- Bug: can_edit_optional_person_fields allowed ANY can_write_tree collaborator
-- to edit living optional fields (person_profiles story/achievements/contribution/
-- contact, person_displacement). Spec D1: for living persons, only
--   (a) record owner (is_record_owner),
--   (b) active person_field_grants row (IFT Admin / grantee with explicit grant),
--   (c) platform is_admin() for emergency.
-- Tree collaborators WITHOUT a grant: NO. IFT Admin needs an explicit grant.
-- Deceased: any can_write_tree remains OK.
-- ============================================================================

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
      -- Deceased only: any tree writer may edit optional fields.
      NOT public.is_person_living(p_person_id)
      AND EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = p_person_id
          AND public.can_write_tree(p.tree_id)
      )
    );
$$;

COMMENT ON FUNCTION public.can_edit_optional_person_fields(uuid) IS
  'D1/R12 optional living fields: record owner, optional_fields grant, or platform admin. Deceased: any can_write_tree. Living tree collaborators without a grant: denied. IFT Admin needs an explicit grant.';

REVOKE ALL ON FUNCTION public.can_edit_optional_person_fields(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_optional_person_fields(uuid) TO authenticated;

COMMENT ON TABLE public.person_profiles IS
  'Per-person narrative (achievements, contribution, contact). OPTIONAL living fields: writable by record owner OR person_field_grants OR platform admin. Deceased: any tree writer. Mandatory person data stays on persons/person_names/events (tree writers).';

COMMENT ON TABLE public.person_displacement IS
  'R13 optional displacement / identity enrichment (1:1 with persons). Writable via can_edit_optional_person_fields (living: owner/grant/admin; deceased: tree writer). UNRWA and 1948 family-card values should also be upserted into person_identifiers by the app/RPC.';

COMMENT ON FUNCTION public.update_person_optional_profile(uuid, text, text, text, text) IS
  'SECURITY DEFINER upsert for optional story fields. Gated by can_edit_optional_person_fields (D1 living rules).';

COMMENT ON FUNCTION public.upsert_person_displacement IS
  'R13 upsert for displacement fields. SECURITY DEFINER gated by can_edit_optional_person_fields (D1 living rules). Also upserts/deletes matching person_identifiers rows for UNRWA and family_card_1948.';
