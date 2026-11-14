-- Follow-up for hosts that already applied 20261114120000 before the story
-- tree-access fix and anon grant cleanup.

DROP FUNCTION IF EXISTS public.get_person_story(uuid);
CREATE OR REPLACE FUNCTION public.get_person_story(p_person_id uuid)
RETURNS TABLE (
  achievements_ar text,
  achievements_en text,
  contribution_ar text,
  contribution_en text,
  contribution_consent boolean,
  hamula_affiliation text,
  origin_relationship text,
  origin_text text,
  occupation text,
  education text,
  migration_notes text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.person_profiles%ROWTYPE;
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  SELECT pp.* INTO v_row FROM public.person_profiles pp WHERE pp.person_id = p_person_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_privileged := public.is_admin()
    OR public.is_record_owner(p_person_id)
    OR public.can_edit_optional_person_fields(p_person_id);

  IF NOT v_privileged AND NOT EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = p_person_id AND public.can_access_tree(p.tree_id)
  ) THEN
    RETURN;
  END IF;

  IF NOT (
    v_privileged
    OR COALESCE(v_row.contribution_consent, false)
    OR NOT public.is_person_living(p_person_id)
  ) THEN
    contribution_consent := COALESCE(v_row.contribution_consent, false);
    RETURN NEXT;
    RETURN;
  END IF;

  achievements_ar := v_row.achievements_ar;
  achievements_en := v_row.achievements_en;
  contribution_ar := v_row.contribution_ar;
  contribution_en := v_row.contribution_en;
  contribution_consent := COALESCE(v_row.contribution_consent, false);
  hamula_affiliation := v_row.hamula_affiliation;
  origin_relationship := v_row.origin_relationship;
  origin_text := v_row.origin_text;
  occupation := v_row.occupation;
  education := v_row.education;
  migration_notes := v_row.migration_notes;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_person_story(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_person_story(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.unknown_place_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unknown_place_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_relationship(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_relationship(uuid, uuid, uuid, text, text) TO authenticated;
