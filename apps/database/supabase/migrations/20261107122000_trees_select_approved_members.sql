-- Finding 17: trees SELECT leaked name/description to pending, rejected,
-- and revoked tree_members because the policy used is_tree_member(), which
-- ignores status. can_access_tree() already requires status = 'approved'
-- (or public / owner). Point trees_select at that helper so only approved
-- access can read a private tree. SECURITY DEFINER helpers bypass RLS, so
-- this does not reintroduce trees ↔ tree_members recursion.

DROP POLICY IF EXISTS "trees_select" ON public.trees;

CREATE POLICY "trees_select"
  ON public.trees
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_tree(id)
    OR public.is_admin()
  );
