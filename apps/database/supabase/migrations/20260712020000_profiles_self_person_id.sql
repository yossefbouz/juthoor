-- Drift fix (F2): profiles.self_person_id exists on LIVE (added outside the
-- migration system — used by data/user/degrees.ts and the search pages for
-- "degrees from my self-person") but no committed migration created it, so a
-- fresh local `db reset` lacked the column. Reconstructed byte-faithful to the
-- live definition (introspected 2026-07-12):
--
--   self_person_id uuid NULL,
--   CONSTRAINT profiles_self_person_id_fkey FOREIGN KEY (self_person_id)
--     REFERENCES persons(id)          -- no ON DELETE action, no default,
--                                     -- no index, no trigger
--
-- Fully guarded → a NO-OP where the column/constraint already exist (live).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS self_person_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_self_person_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_self_person_id_fkey
      FOREIGN KEY (self_person_id) REFERENCES public.persons(id);
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.self_person_id IS
  'The person row this user identifies as (their own node) — anchors "degrees from me". Reconstructed from live (drift fix F2).';
