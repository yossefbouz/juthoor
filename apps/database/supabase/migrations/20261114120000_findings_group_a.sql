-- ============================================================================
-- Group A (AIO2): document is right → change the code
-- ============================================================================
--  A1  Platform Admin does not write people/trees (D9). Keep admin on SELECT.
--  A4  Perfect-match / UNRWA: birth_year_gap is a weighted-path veto only.
--  A5  Relationship validate → status 'validated'.
--  A6  Picture four-part subject name (7.1.1).
--  A7  Origin enrichment: hamula, origin link, origin text, occupation,
--      education, migration notes.
--  A8  R10: missing place/origin defaults to the Unknown VCC sentinel.
-- A10  Nightly matching enabled by default (doc end-of-day batch).
--  A2  Living gate 76 raw points — already on main (matching_p1). No change.
--  A3  Birth-year >15 veto — already correct. No change.
-- ============================================================================

-- ── A1: strip is_admin() from core tree WRITE policies ───────────────────────
DROP POLICY IF EXISTS "persons_insert" ON public.persons;
CREATE POLICY "persons_insert"
  ON public.persons FOR INSERT TO authenticated
  WITH CHECK (public.can_write_tree(tree_id));

DROP POLICY IF EXISTS "persons_update" ON public.persons;
CREATE POLICY "persons_update"
  ON public.persons FOR UPDATE TO authenticated
  USING (public.can_write_tree(tree_id));

DROP POLICY IF EXISTS "persons_delete" ON public.persons;
CREATE POLICY "persons_delete"
  ON public.persons FOR DELETE TO authenticated
  USING (public.can_write_tree(tree_id));

DROP POLICY IF EXISTS "person_names_insert" ON public.person_names;
CREATE POLICY "person_names_insert"
  ON public.person_names FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS "person_names_update" ON public.person_names;
CREATE POLICY "person_names_update"
  ON public.person_names FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS "person_names_delete" ON public.person_names;
CREATE POLICY "person_names_delete"
  ON public.person_names FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS "families_insert" ON public.families;
CREATE POLICY "families_insert"
  ON public.families FOR INSERT TO authenticated
  WITH CHECK (public.can_write_tree(tree_id));

DROP POLICY IF EXISTS "families_update" ON public.families;
CREATE POLICY "families_update"
  ON public.families FOR UPDATE TO authenticated
  USING (public.can_write_tree(tree_id));

DROP POLICY IF EXISTS "families_delete" ON public.families;
CREATE POLICY "families_delete"
  ON public.families FOR DELETE TO authenticated
  USING (public.can_write_tree(tree_id));

DROP POLICY IF EXISTS "family_children_insert" ON public.family_children;
CREATE POLICY "family_children_insert"
  ON public.family_children FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id AND public.can_write_tree(f.tree_id)
    )
  );

DROP POLICY IF EXISTS "family_children_update" ON public.family_children;
CREATE POLICY "family_children_update"
  ON public.family_children FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id AND public.can_write_tree(f.tree_id)
    )
  );

DROP POLICY IF EXISTS "family_children_delete" ON public.family_children;
CREATE POLICY "family_children_delete"
  ON public.family_children FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id AND public.can_write_tree(f.tree_id)
    )
  );

DROP POLICY IF EXISTS "events_insert" ON public.events;
CREATE POLICY "events_insert"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    (person_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    ))
    OR
    (family_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id AND public.can_write_tree(f.tree_id)
    ))
  );

DROP POLICY IF EXISTS "events_update" ON public.events;
CREATE POLICY "events_update"
  ON public.events FOR UPDATE TO authenticated
  USING (
    (person_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    ))
    OR
    (family_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id AND public.can_write_tree(f.tree_id)
    ))
  );

DROP POLICY IF EXISTS "events_delete" ON public.events;
CREATE POLICY "events_delete"
  ON public.events FOR DELETE TO authenticated
  USING (
    (person_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    ))
    OR
    (family_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id AND public.can_write_tree(f.tree_id)
    ))
  );

COMMENT ON POLICY "persons_update" ON public.persons IS
  'D9 / Group A1: writes need tree write rights only. Platform Admin keeps SELECT.';

-- ── A4: perfect-match ignores birth_year_gap (D8 hard checks only) ───────────
-- Doc: perfect-match hard checks are gender / same tree / privacy hold.
-- Weighted path still vetoes birth_year_gap; perfect-match filters it out.
DO $a4$
DECLARE
  src text;
  new_src text;
  fname text;
  old_frag text := $f$IF v_id_match IS NOT NULL THEN
    IF coalesce(array_length(v_vetoes,1),0) = 0 THEN
      v_decision := 'auto_link';
      v_score := 100;
    ELSE
      v_decision := 'review';
      v_score := 100;
    END IF;$f$;
  new_frag text := $f$IF v_id_match IS NOT NULL THEN
    -- D8/Group A4: birth_year_gap does not block perfect-match auto_link.
    IF coalesce(array_length(ARRAY(
         SELECT u FROM unnest(v_vetoes) AS u WHERE u IS DISTINCT FROM 'birth_year_gap'
       ),1),0) = 0 THEN
      v_decision := 'auto_link';
      v_score := 100;
    ELSE
      v_decision := 'review';
      v_score := 100;
    END IF;$f$;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'score_pair_impl'
  ) THEN
    fname := 'score_pair_impl';
  ELSE
    fname := 'score_pair';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = fname
  ORDER BY p.oid DESC LIMIT 1;

  IF src IS NULL THEN
    RAISE NOTICE 'score function missing; skip A4 patch';
    RETURN;
  END IF;

  IF position('IS DISTINCT FROM ''birth_year_gap''' IN src) > 0
     OR position('IS DISTINCT FROM ''birth_year_gap''' IN replace(src, '''', '''''')) > 0 THEN
    RAISE NOTICE 'A4 already applied';
    RETURN;
  END IF;

  -- Tolerate both single-quoted forms from pg_get_functiondef.
  new_src := replace(src, old_frag, new_frag);
  IF new_src = src THEN
    -- Some dumps use different spacing; try a compact match on the decision only.
    new_src := regexp_replace(
      src,
      'IF v_id_match IS NOT NULL THEN[[:space:]]+IF coalesce\(array_length\(v_vetoes,1\),0\) = 0 THEN[[:space:]]+v_decision := ''auto_link'';[[:space:]]+v_score := 100;[[:space:]]+ELSE[[:space:]]+v_decision := ''review'';[[:space:]]+v_score := 100;[[:space:]]+END IF;',
      new_frag,
      'n'
    );
  END IF;

  IF new_src IS DISTINCT FROM src THEN
    EXECUTE new_src;
  ELSE
    RAISE EXCEPTION 'A4 score_pair patch did not match perfect-match decision block';
  END IF;
END
$a4$;

-- ── A5: validated relationship status + RPC ──────────────────────────────────
ALTER TABLE public.relationship_disputes
  DROP CONSTRAINT IF EXISTS relationship_disputes_status_check;

ALTER TABLE public.relationship_disputes
  ADD CONSTRAINT relationship_disputes_status_check
  CHECK (status IN ('open', 'resolved', 'dismissed', 'validated'));

CREATE OR REPLACE FUNCTION public.validate_relationship(
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
  v_row public.relationship_disputes;
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

  INSERT INTO public.relationship_disputes(
    tree_id, person_a, person_b, relation_type, status, raised_by, note
  ) VALUES (
    p_tree_id, p_person_a, p_person_b,
    COALESCE(NULLIF(trim(p_relation_type), ''), 'unknown'),
    'validated', v_uid, NULLIF(trim(COALESCE(p_note, '')), '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_relationship(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_relationship(uuid, uuid, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.validate_relationship IS
  'AIO2 4.X.1.1.8: flag a relationship Validated (Group A5).';

-- ── A6: four-part subject name on picture attachments ───────────────────────
ALTER TABLE public.person_attachments
  ADD COLUMN IF NOT EXISTS subject_given text,
  ADD COLUMN IF NOT EXISTS subject_father text,
  ADD COLUMN IF NOT EXISTS subject_grandfather text,
  ADD COLUMN IF NOT EXISTS subject_family text;

COMMENT ON COLUMN public.person_attachments.subject_given IS
  'AIO2 7.1.1 First Name of the pictured individual.';
COMMENT ON COLUMN public.person_attachments.subject_father IS
  'AIO2 7.1.1 Father''s Name.';
COMMENT ON COLUMN public.person_attachments.subject_grandfather IS
  'AIO2 7.1.1 Grandfather''s Name.';
COMMENT ON COLUMN public.person_attachments.subject_family IS
  'AIO2 7.1.1 Family Name.';

-- ── A7: origin / life enrichment on person_profiles ──────────────────────────
ALTER TABLE public.person_profiles
  ADD COLUMN IF NOT EXISTS hamula_affiliation text,
  ADD COLUMN IF NOT EXISTS origin_relationship text
    CHECK (
      origin_relationship IS NULL
      OR origin_relationship IN ('born_there', 'descended', 'married_into')
    ),
  ADD COLUMN IF NOT EXISTS origin_text text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS education text,
  ADD COLUMN IF NOT EXISTS migration_notes text;

COMMENT ON COLUMN public.person_profiles.hamula_affiliation IS
  'AIO2 Table 17: clan / hamula within the origin VCC (optional living field).';
COMMENT ON COLUMN public.person_profiles.origin_relationship IS
  'AIO2: born_there | descended | married_into.';
COMMENT ON COLUMN public.person_profiles.origin_text IS
  'AIO2 Origin free text; defaults to Unknown when missing at create.';
COMMENT ON COLUMN public.person_profiles.occupation IS
  'AIO2 Table 16 occupation / profession.';
COMMENT ON COLUMN public.person_profiles.education IS
  'AIO2 Table 16 education.';
COMMENT ON COLUMN public.person_profiles.migration_notes IS
  'AIO2 Table 16 migration summary (from/to/date narrative).';

-- ── A8: Unknown place sentinel + create_person defaults ──────────────────────
INSERT INTO public.places (id, name_ar, name_en, place_type, country)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'غير معروف',
  'Unknown',
  'village',
  'فلسطين'
)
ON CONFLICT (id) DO NOTHING;

-- Also match by bilingual Unknown name if a different id already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.places
    WHERE id = '00000000-0000-4000-8000-000000000001'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.places
    WHERE name_en = 'Unknown' AND name_ar = 'غير معروف'
  ) THEN
    INSERT INTO public.places (name_ar, name_en, place_type, country)
    VALUES ('غير معروف', 'Unknown', 'village', 'فلسطين');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.unknown_place_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT id FROM public.places
  WHERE id = '00000000-0000-4000-8000-000000000001'
     OR (name_en = 'Unknown' AND name_ar = 'غير معروف')
  ORDER BY CASE WHEN id = '00000000-0000-4000-8000-000000000001' THEN 0 ELSE 1 END
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.unknown_place_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unknown_place_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_person_with_primary_name(
  p_tree_id            uuid,
  p_gender             public.gender_type,
  p_name_type          public.name_type default 'birth',
  p_lang               text default 'ar',
  p_given_name         text default null,
  p_surname            text default null,
  p_display_name_ar    text default null,
  p_display_name_en    text default null,
  p_birth_year         int default null,
  p_death_year         int default null,
  p_place_of_origin_id uuid default null,
  p_is_placeholder     boolean default false,
  p_father_given_ar    text default null,
  p_father_surname_ar  text default null,
  p_mother_given_ar    text default null,
  p_mother_maiden_ar   text default null,
  p_father_given_en    text default null,
  p_father_surname_en  text default null,
  p_mother_given_en    text default null,
  p_mother_maiden_en   text default null
)
RETURNS TABLE (
  person_id uuid,
  name_id   uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_name_id   uuid;
  v_user_id   uuid;
  v_given     text;
  v_surname   text;
  v_display_ar text;
  v_display_en text;
  v_unknown_ar text := 'غير معروف';
  v_unknown_en text := 'Unknown';
  v_unknown   text;
  v_needs_completion boolean := false;
  v_father_given_ar   text;
  v_father_surname_ar text;
  v_mother_given_ar   text;
  v_mother_maiden_ar  text;
  v_father_given_en   text;
  v_father_surname_en text;
  v_mother_given_en   text;
  v_mother_maiden_en  text;
  v_place_id uuid;
  v_origin_defaulted boolean := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_given   := NULLIF(btrim(COALESCE(p_given_name, '')), '');
  v_surname := NULLIF(btrim(COALESCE(p_surname, '')), '');
  v_display_ar := NULLIF(btrim(COALESCE(p_display_name_ar, '')), '');
  v_display_en := NULLIF(btrim(COALESCE(p_display_name_en, '')), '');
  v_unknown := CASE WHEN COALESCE(p_lang, 'ar') = 'en' THEN v_unknown_en ELSE v_unknown_ar END;

  v_father_given_ar   := NULLIF(btrim(COALESCE(p_father_given_ar, '')), '');
  v_father_surname_ar := NULLIF(btrim(COALESCE(p_father_surname_ar, '')), '');
  v_mother_given_ar   := NULLIF(btrim(COALESCE(p_mother_given_ar, '')), '');
  v_mother_maiden_ar  := NULLIF(btrim(COALESCE(p_mother_maiden_ar, '')), '');
  v_father_given_en   := NULLIF(btrim(COALESCE(p_father_given_en, '')), '');
  v_father_surname_en := NULLIF(btrim(COALESCE(p_father_surname_en, '')), '');
  v_mother_given_en   := NULLIF(btrim(COALESCE(p_mother_given_en, '')), '');
  v_mother_maiden_en  := NULLIF(btrim(COALESCE(p_mother_maiden_en, '')), '');

  IF NOT COALESCE(p_is_placeholder, false) THEN
    IF v_given IS NULL
       AND v_display_ar IS NULL
       AND v_display_en IS NULL THEN
      v_given := v_unknown;
      v_needs_completion := true;
    END IF;
    IF v_surname IS NULL THEN
      v_surname := v_unknown;
      v_needs_completion := true;
    END IF;

    IF v_father_given_ar IS NULL AND v_father_given_en IS NULL THEN
      v_father_given_ar := v_unknown_ar;
      v_needs_completion := true;
    END IF;
    IF v_father_surname_ar IS NULL AND v_father_surname_en IS NULL THEN
      v_father_surname_ar := v_unknown_ar;
      v_needs_completion := true;
    END IF;
    IF v_mother_given_ar IS NULL AND v_mother_given_en IS NULL THEN
      v_mother_given_ar := v_unknown_ar;
      v_needs_completion := true;
    END IF;
    IF v_mother_maiden_ar IS NULL AND v_mother_maiden_en IS NULL THEN
      v_mother_maiden_ar := v_unknown_ar;
      v_needs_completion := true;
    END IF;

    IF v_father_given_en IS NULL AND v_father_given_ar = v_unknown_ar THEN
      v_father_given_en := v_unknown_en;
    END IF;
    IF v_father_surname_en IS NULL AND v_father_surname_ar = v_unknown_ar THEN
      v_father_surname_en := v_unknown_en;
    END IF;
    IF v_mother_given_en IS NULL AND v_mother_given_ar = v_unknown_ar THEN
      v_mother_given_en := v_unknown_en;
    END IF;
    IF v_mother_maiden_en IS NULL AND v_mother_maiden_ar = v_unknown_ar THEN
      v_mother_maiden_en := v_unknown_en;
    END IF;

    -- R10 / A8: missing place → Unknown VCC; still flag for completion.
    IF p_place_of_origin_id IS NULL THEN
      v_place_id := public.unknown_place_id();
      v_origin_defaulted := true;
      v_needs_completion := true;
    ELSE
      v_place_id := p_place_of_origin_id;
    END IF;
    IF p_birth_year IS NULL THEN
      v_needs_completion := true;
    END IF;
  ELSE
    v_place_id := p_place_of_origin_id;
  END IF;

  IF v_given IS NULL
     AND v_display_ar IS NULL
     AND v_display_en IS NULL THEN
    RAISE EXCEPTION 'At least one name (given or display) is required'
      USING ERRCODE = '22004';
  END IF;

  IF v_display_ar IS NULL AND (v_given IS NOT NULL OR v_surname IS NOT NULL)
     AND COALESCE(p_lang, 'ar') = 'ar' THEN
    v_display_ar := NULLIF(btrim(CONCAT_WS(' ', v_given, v_surname)), '');
  END IF;
  IF v_display_en IS NULL AND (v_given IS NOT NULL OR v_surname IS NOT NULL)
     AND COALESCE(p_lang, 'ar') = 'en' THEN
    v_display_en := NULLIF(btrim(CONCAT_WS(' ', v_given, v_surname)), '');
  END IF;

  INSERT INTO public.persons (
    tree_id,
    gender,
    display_name_ar,
    display_name_en,
    created_by,
    notes,
    needs_completion,
    father_given_ar,
    father_surname_ar,
    mother_given_ar,
    mother_maiden_ar,
    father_given_en,
    father_surname_en,
    mother_given_en,
    mother_maiden_en
  )
  VALUES (
    p_tree_id,
    p_gender,
    COALESCE(v_display_ar, p_display_name_ar),
    COALESCE(v_display_en, p_display_name_en),
    v_user_id,
    CASE WHEN p_is_placeholder THEN 'placeholder' ELSE NULL END,
    v_needs_completion,
    v_father_given_ar,
    v_father_surname_ar,
    v_mother_given_ar,
    v_mother_maiden_ar,
    v_father_given_en,
    v_father_surname_en,
    v_mother_given_en,
    v_mother_maiden_en
  )
  RETURNING id INTO v_person_id;

  INSERT INTO public.person_names (
    person_id,
    name_type,
    is_primary,
    lang,
    given_name,
    surname
  )
  VALUES (
    v_person_id,
    p_name_type,
    true,
    p_lang,
    v_given,
    v_surname
  )
  RETURNING id INTO v_name_id;

  IF p_birth_year IS NOT NULL OR v_place_id IS NOT NULL THEN
    INSERT INTO public.events (
      person_id,
      event_type,
      date_year,
      place_id
    )
    VALUES (
      v_person_id,
      'BIRT',
      p_birth_year,
      v_place_id
    );
  END IF;

  IF p_death_year IS NOT NULL THEN
    INSERT INTO public.events (
      person_id,
      event_type,
      date_year
    )
    VALUES (
      v_person_id,
      'DEAT',
      p_death_year
    );
  END IF;

  -- Seed origin_text = Unknown when place was defaulted (A7/A8).
  IF v_origin_defaulted THEN
    INSERT INTO public.person_profiles (person_id, origin_text, updated_by)
    VALUES (v_person_id, v_unknown_en, v_user_id)
    ON CONFLICT (person_id) DO UPDATE
      SET origin_text = COALESCE(public.person_profiles.origin_text, EXCLUDED.origin_text),
          updated_at = now(),
          updated_by = EXCLUDED.updated_by;
  END IF;

  RETURN QUERY SELECT v_person_id, v_name_id;
END;
$$;

COMMENT ON FUNCTION public.create_person_with_primary_name IS
  'Atomic person + primary name + BIRT/DEAT. R10/A8: blank names and missing place default to Unknown; needs_completion flagged. SECURITY INVOKER.';

-- ── A7 read path: extend get_person_story with origin enrichment ─────────────
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

  -- Same tree-access rule as pr28_reconcile (strangers on private trees get nothing).
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

-- Managers may UPDATE the new columns (table UPDATE already granted).

-- ── A10: nightly matching on by default ──────────────────────────────────────
UPDATE public.app_settings
SET nightly_matching_enabled = true
WHERE nightly_matching_enabled IS DISTINCT FROM true;

ALTER TABLE public.app_settings
  ALTER COLUMN nightly_matching_enabled SET DEFAULT true;
