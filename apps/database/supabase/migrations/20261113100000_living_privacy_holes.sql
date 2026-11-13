-- ============================================================================
-- Living-person privacy holes (2026-11-13)
-- ============================================================================
-- 1. Birth / death / family events of a LIVING person were readable by anyone
--    who can read the tree (every signed-in user on a public tree), including
--    full imported birth dates. The screens hid them; the API did not.
--    Now only privileged viewers read them: platform admin, the tree owner,
--    approved tree members, the record owner and optional-field grantees.
--    Events of people who are not living are unchanged.
-- 2. A tree writer could "unmask" a living person by adding a death event (or
--    a birth year 150+ years ago): is_person_living() then returns false and
--    the person's identifiers, displacement data, ID-card copies and contacts
--    open up to every reader of the tree. A trigger now lets only the tree
--    owner, the record owner, a grantee or a platform admin make that change
--    for a living person. People created in the last hour, or created by the
--    caller and not yet claimed, are exempt so adding and importing deceased
--    ancestors keeps working.
-- ============================================================================


-- ── 1. Who may read a living person's life events ───────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_person_life_events(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = p_person_id
        AND (
          t.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.tree_members tm
            WHERE tm.tree_id = t.id
              AND tm.user_id = auth.uid()
              AND tm.status = 'approved'
          )
        )
    )
    OR public.is_record_owner(p_person_id)
    OR EXISTS (
      SELECT 1 FROM public.person_field_grants g
      WHERE g.person_id = p_person_id
        AND g.grantee_user_id = auth.uid()
        AND g.scope = 'optional_fields'
    )
    OR NOT public.is_person_living(p_person_id);
$$;

COMMENT ON FUNCTION public.can_view_person_life_events(uuid) IS
  'Living people: admin, tree owner, approved member, record owner or grantee. People who are not living: true (tree access is checked by the policy).';

REVOKE ALL ON FUNCTION public.can_view_person_life_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_person_life_events(uuid) TO authenticated;

DROP POLICY IF EXISTS "events_select" ON public.events;
CREATE POLICY "events_select"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    (person_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.persons p
        WHERE p.id = person_id
          AND (public.can_access_tree(p.tree_id) OR public.is_admin())
      )
      AND public.can_view_person_life_events(person_id))
    OR
    (family_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = family_id
          AND (public.can_access_tree(f.tree_id) OR public.is_admin())
          AND (f.partner1_id IS NULL OR public.can_view_person_life_events(f.partner1_id))
          AND (f.partner2_id IS NULL OR public.can_view_person_life_events(f.partner2_id))
      ))
  );


-- ── 2. Recording a death (or a 150+ year birth) for a living person ─────────
CREATE OR REPLACE FUNCTION public.can_change_living_status(p_person_id uuid)
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
      SELECT 1
      FROM public.persons p
      JOIN public.trees t ON t.id = p.tree_id
      WHERE p.id = p_person_id AND t.owner_id = auth.uid()
    )
    -- A record still being entered (add-person form, GEDCOM import), or one
    -- the caller created themselves and nobody has claimed.
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = p_person_id
        AND NOT public.is_person_claimed(p.id)
        AND (p.created_by = auth.uid() OR p.created_at > now() - interval '1 hour')
    );
$$;

COMMENT ON FUNCTION public.can_change_living_status(uuid) IS
  'Who may record a death (or a birth 150+ years ago) for a person who is currently living.';

REVOKE ALL ON FUNCTION public.can_change_living_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_change_living_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_living_status_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only requests made by a signed-in user are checked (not cron, not the
  -- SQL editor, not service-role maintenance).
  IF auth.uid() IS NULL OR NEW.person_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only changes that would end "living": a death, or a birth 150+ years ago.
  IF NOT (
    NEW.event_type::text = 'DEAT'
    OR (NEW.event_type::text = 'BIRT'
        AND NEW.date_year IS NOT NULL
        AND NEW.date_year <= (extract(year FROM now())::int - 150))
  ) THEN
    RETURN NEW;
  END IF;

  -- BEFORE trigger: this is the state before the change.
  IF NOT public.is_person_living(NEW.person_id) THEN
    RETURN NEW;
  END IF;

  IF public.can_change_living_status(NEW.person_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'living_status_change_not_allowed'
    USING ERRCODE = '42501',
          HINT = 'Only the tree administrator or the person themselves can record a death for a living person.';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_living_status_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_events_guard_living_status ON public.events;
CREATE TRIGGER trg_events_guard_living_status
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_living_status_events();
