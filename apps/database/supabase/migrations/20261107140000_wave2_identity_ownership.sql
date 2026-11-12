-- ============================================================================
-- Wave 2 — Identity / ownership (D1 / R12 / R10) + soft-delete hook
-- ============================================================================
-- Optional living fields (person_profiles narrative columns, and later
-- person_displacement): writable by the record owner (auth.uid() linked via
-- profiles.linked_person_id) OR by a person_field_grants row (IFT Admin grant,
-- scope default 'optional_fields') OR by tree writers (can_write_tree).
-- Mandatory fields (names, gender, BIRT/DEAT, structural links) stay on the
-- existing persons / person_names / events RLS — tree writers only.
-- ============================================================================

-- ── profiles.linked_person_id (D1) ───────────────────────────────────────────
-- Canonical account ↔ person ownership link. (Older app drafts used
-- self_person_id; Wave 2 standardises on linked_person_id.)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linked_person_id uuid
    REFERENCES public.persons(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.linked_person_id IS
  'D1/R12: person record this account owns. is_record_owner(person_id) reads this. Soft-deleted profiles (deleted_at set) do not count as owners.';

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Account soft-delete marker. Auth session is signed out by the app; tree ownership transfer is a documented TODO.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_linked_person_unique
  ON public.profiles (linked_person_id)
  WHERE linked_person_id IS NOT NULL AND deleted_at IS NULL;

-- Back-compat: if self_person_id was ever added manually on a remote, leave it;
-- otherwise expose a synonym column kept in sync for degrees.ts callers that
-- still select self_person_id until types catch up.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS self_person_id uuid
    REFERENCES public.persons(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_person_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Prefer linked_person_id as source of truth; mirror into self_person_id.
  IF TG_OP = 'INSERT' THEN
    IF NEW.linked_person_id IS NOT NULL THEN
      NEW.self_person_id := NEW.linked_person_id;
    ELSIF NEW.self_person_id IS NOT NULL THEN
      NEW.linked_person_id := NEW.self_person_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.linked_person_id IS DISTINCT FROM OLD.linked_person_id THEN
    NEW.self_person_id := NEW.linked_person_id;
  ELSIF NEW.self_person_id IS DISTINCT FROM OLD.self_person_id
        AND (NEW.linked_person_id IS NULL
             OR NEW.linked_person_id IS NOT DISTINCT FROM OLD.linked_person_id) THEN
    NEW.linked_person_id := NEW.self_person_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_person_link ON public.profiles;
CREATE TRIGGER trg_profiles_sync_person_link
  BEFORE INSERT OR UPDATE OF linked_person_id, self_person_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_person_link();

-- ── is_record_owner (D1) — must exist before grant policies ───────────────────
CREATE OR REPLACE FUNCTION public.is_record_owner(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND pr.deleted_at IS NULL
      AND pr.linked_person_id = p_person_id
  );
$$;

COMMENT ON FUNCTION public.is_record_owner(uuid) IS
  'True when auth.uid() is linked to this person via profiles.linked_person_id and the profile is not soft-deleted.';

REVOKE ALL ON FUNCTION public.is_record_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_record_owner(uuid) TO authenticated;

-- ── person_field_grants (R12) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.person_field_grants (
  id               uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  person_id        uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  grantee_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scope            text NOT NULL DEFAULT 'optional_fields',
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, grantee_user_id, scope)
);

COMMENT ON TABLE public.person_field_grants IS
  'R12: IFT Admin (or record owner) grants another user the right to edit living optional fields for a person. Default scope = optional_fields. Does NOT grant mandatory-field writes.';

CREATE INDEX IF NOT EXISTS idx_person_field_grants_grantee
  ON public.person_field_grants (grantee_user_id);

ALTER TABLE public.person_field_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_field_grants_select ON public.person_field_grants;
CREATE POLICY person_field_grants_select ON public.person_field_grants FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR grantee_user_id = auth.uid()
    OR public.is_record_owner(person_id)
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_access_tree(p.tree_id)
    )
  );

DROP POLICY IF EXISTS person_field_grants_insert ON public.person_field_grants;
CREATE POLICY person_field_grants_insert ON public.person_field_grants FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_record_owner(person_id)
  );

DROP POLICY IF EXISTS person_field_grants_delete ON public.person_field_grants;
CREATE POLICY person_field_grants_delete ON public.person_field_grants FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_record_owner(person_id)
    OR granted_by = auth.uid()
  );

-- Helper: optional-field write gate (owner OR grant OR tree writer OR admin).
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
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = p_person_id AND public.can_write_tree(p.tree_id)
    );
$$;

COMMENT ON FUNCTION public.can_edit_optional_person_fields(uuid) IS
  'Optional living fields: record owner, optional_fields grant, tree writer, or admin. Mandatory fields remain tree-writer RLS only.';

REVOKE ALL ON FUNCTION public.can_edit_optional_person_fields(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_optional_person_fields(uuid) TO authenticated;

-- person_profiles write path: allow optional-field editors (not only tree writers).
DROP POLICY IF EXISTS person_profiles_insert ON public.person_profiles;
CREATE POLICY person_profiles_insert
  ON public.person_profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_optional_person_fields(person_id));

DROP POLICY IF EXISTS person_profiles_update ON public.person_profiles;
CREATE POLICY person_profiles_update
  ON public.person_profiles FOR UPDATE
  TO authenticated
  USING (public.can_edit_optional_person_fields(person_id))
  WITH CHECK (public.can_edit_optional_person_fields(person_id));

DROP POLICY IF EXISTS person_profiles_delete ON public.person_profiles;
CREATE POLICY person_profiles_delete
  ON public.person_profiles FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = person_id AND public.can_write_tree(p.tree_id)
    )
  );

COMMENT ON TABLE public.person_profiles IS
  'Per-person narrative (achievements, contribution). OPTIONAL living fields: writable by record owner OR person_field_grants OR tree writers. Mandatory person data stays on persons/person_names/events (tree writers).';

-- Security-definer upsert for optional story fields (belt + suspenders vs RLS).
CREATE OR REPLACE FUNCTION public.update_person_optional_profile(
  p_person_id        uuid,
  p_achievements_ar  text DEFAULT NULL,
  p_achievements_en  text DEFAULT NULL,
  p_contribution_ar  text DEFAULT NULL,
  p_contribution_en  text DEFAULT NULL
)
RETURNS public.person_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.person_profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_edit_optional_person_fields(p_person_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.person_profiles AS pp (
    person_id, achievements_ar, achievements_en, contribution_ar, contribution_en,
    updated_at, updated_by
  )
  VALUES (
    p_person_id, p_achievements_ar, p_achievements_en, p_contribution_ar, p_contribution_en,
    now(), auth.uid()
  )
  ON CONFLICT (person_id) DO UPDATE SET
    achievements_ar = EXCLUDED.achievements_ar,
    achievements_en = EXCLUDED.achievements_en,
    contribution_ar = EXCLUDED.contribution_ar,
    contribution_en = EXCLUDED.contribution_en,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_person_optional_profile(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_person_optional_profile(uuid, text, text, text, text) TO authenticated;

-- ── R10 needs_completion ─────────────────────────────────────────────────────
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS needs_completion boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.persons.needs_completion IS
  'R10: true when mandatory fields were defaulted to Unknown or birth year / place of origin is missing at create time.';

-- ── create_person_with_primary_name: Unknown defaults + completion flag ──────
CREATE OR REPLACE FUNCTION public.create_person_with_primary_name(
  p_tree_id         uuid,
  p_gender          public.gender_type,
  p_name_type       public.name_type default 'birth',
  p_lang            text default 'ar',
  p_given_name      text default null,
  p_surname         text default null,
  p_display_name_ar text default null,
  p_display_name_en text default null,
  p_birth_year      int default null,
  p_death_year      int default null,
  p_place_of_origin_id uuid default null,
  p_is_placeholder  boolean default false
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
  v_unknown   text;
  v_needs_completion boolean := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_given   := NULLIF(btrim(COALESCE(p_given_name, '')), '');
  v_surname := NULLIF(btrim(COALESCE(p_surname, '')), '');
  v_display_ar := NULLIF(btrim(COALESCE(p_display_name_ar, '')), '');
  v_display_en := NULLIF(btrim(COALESCE(p_display_name_en, '')), '');
  v_unknown := CASE WHEN COALESCE(p_lang, 'ar') = 'en' THEN 'Unknown' ELSE 'غير معروف' END;

  -- R10: non-placeholders get Unknown defaults for blank given/surname.
  IF NOT COALESCE(p_is_placeholder, false) THEN
    IF v_given IS NULL
       AND v_display_ar IS NULL
       AND v_display_en IS NULL THEN
      v_given := v_unknown;
    END IF;
    IF v_surname IS NULL THEN
      v_surname := v_unknown;
    END IF;
    -- Flag when birth year or place is missing (mandatory set incomplete).
    IF p_birth_year IS NULL OR p_place_of_origin_id IS NULL THEN
      v_needs_completion := true;
    END IF;
  END IF;

  IF v_given IS NULL
     AND v_display_ar IS NULL
     AND v_display_en IS NULL THEN
    RAISE EXCEPTION 'At least one name (given or display) is required'
      USING ERRCODE = '22004';
  END IF;

  -- Refresh display caches when pieces were defaulted.
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
    needs_completion
  )
  VALUES (
    p_tree_id,
    p_gender,
    COALESCE(v_display_ar, p_display_name_ar),
    COALESCE(v_display_en, p_display_name_en),
    v_user_id,
    CASE WHEN p_is_placeholder THEN 'placeholder' ELSE NULL END,
    v_needs_completion
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

  IF p_birth_year IS NOT NULL OR p_place_of_origin_id IS NOT NULL THEN
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
      p_place_of_origin_id
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

  RETURN QUERY SELECT v_person_id, v_name_id;
END;
$$;

COMMENT ON FUNCTION public.create_person_with_primary_name IS
  'Atomic person + primary name + optional BIRT/DEAT. R10: blank given/surname become Unknown/غير معروف for non-placeholders; needs_completion when birth year or place missing. SECURITY INVOKER.';
