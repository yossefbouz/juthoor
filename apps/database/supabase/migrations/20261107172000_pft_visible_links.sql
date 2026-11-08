-- ============================================================================
-- Wave 5.1 — Palestinian Family Tree viewer RPC
-- ----------------------------------------------------------------------------
-- person_links remain admin-only under base RLS. Authenticated users who can
-- see at least one side of a CONFIRMED link get a masked pair list for the
-- read-only PFT page (identity groups they participate in).
-- ============================================================================

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
    pa.display_name_ar AS name_a_ar,
    pa.display_name_en AS name_a_en,
    pb.display_name_ar AS name_b_ar,
    pb.display_name_en AS name_b_en,
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
      OR public.can_access_tree(pa.tree_id)
      OR public.can_access_tree(pb.tree_id)
    )
  ORDER BY COALESCE(ga.group_id, gb.group_id, l.person_a_id), l.created_at;
$$;

REVOKE ALL ON FUNCTION public.list_visible_pft_links() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_visible_pft_links() TO authenticated;

COMMENT ON FUNCTION public.list_visible_pft_links() IS
  'PFT overlay for the current user: confirmed person_links where at least one person is in an accessible tree. SECURITY DEFINER; does not grant cross-tree person reads beyond names on the linked pair.';
