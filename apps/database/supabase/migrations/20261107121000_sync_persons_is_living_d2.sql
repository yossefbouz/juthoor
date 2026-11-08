-- W0.1 / D2: keep persons.is_living aligned with public.is_person_living (150y).
-- The people list and some admin paths still read the column; without a sync
-- it drifts from the event-based rule (default true, never updated).

CREATE OR REPLACE FUNCTION public.sync_person_is_living()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_event_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_person_id := OLD.person_id;
    v_event_type := OLD.event_type;
  ELSE
    v_person_id := NEW.person_id;
    v_event_type := NEW.event_type;
  END IF;

  IF v_person_id IS NULL OR v_event_type NOT IN ('BIRT', 'DEAT') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.persons p
     SET is_living = public.is_person_living(v_person_id)
   WHERE p.id = v_person_id
     AND p.is_living IS DISTINCT FROM public.is_person_living(v_person_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_events_sync_person_is_living ON public.events;
CREATE TRIGGER trg_events_sync_person_is_living
  AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_person_is_living();

-- One-shot backfill so existing rows match D2 before the next event write.
UPDATE public.persons p
   SET is_living = public.is_person_living(p.id)
 WHERE p.is_living IS DISTINCT FROM public.is_person_living(p.id);

COMMENT ON FUNCTION public.sync_person_is_living() IS
  'Keeps persons.is_living equal to is_person_living() (D2, 150-year cut-off) whenever BIRT/DEAT events change.';
