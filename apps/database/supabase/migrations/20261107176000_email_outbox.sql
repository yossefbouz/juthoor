-- ============================================================================
-- Email notification path (minimal): email_outbox queue
-- ----------------------------------------------------------------------------
-- In-app `notifications` rows stay the source of truth. Each insert also
-- enqueues a row here for a future worker (Resend, SES, …).
--
-- Local Auth email (signup / magic link) already goes through Supabase's
-- built-in SMTP. With `supabase start`, that is Inbucket in this project:
--   http://127.0.0.1:55124
-- Custom product emails are NOT sent by Auth — they wait in this outbox
-- until a worker drains `status = 'pending'`. Do not put Resend API keys
-- in the web client; the worker should use a server-only secret.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id                  uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  notification_id     uuid NULL REFERENCES public.notifications(id) ON DELETE SET NULL,
  recipient_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind                text NOT NULL,
  to_email            text NULL,
  subject             text NOT NULL,
  body_text           text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  provider            text NULL,
  error               text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_status_created
  ON public.email_outbox (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_recipient
  ON public.email_outbox (recipient_user_id, created_at DESC);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_outbox_admin_select ON public.email_outbox;
CREATE POLICY email_outbox_admin_select ON public.email_outbox
  FOR SELECT TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.email_outbox IS
  'Future email worker queue. Enqueued when notifications are inserted. Local Auth mail uses Inbucket (supabase start → :55124); product email waits here until Resend (or similar) is wired server-side.';

COMMENT ON COLUMN public.email_outbox.provider IS
  'Set by the worker when sent (e.g. resend). Null while pending. Never store API keys here.';

-- Enqueue on every notifications insert (SECURITY DEFINER RPCs insert those).
CREATE OR REPLACE FUNCTION public.enqueue_email_outbox_from_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
  v_subject text;
  v_body text;
BEGIN
  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.recipient_user_id;

  v_subject := COALESCE(NEW.title_en, NEW.title_ar, NEW.kind);
  v_body := trim(both FROM concat_ws(
    E'\n\n',
    COALESCE(NEW.body_en, NEW.body_ar, ''),
    CASE WHEN NEW.link IS NOT NULL THEN 'Link: ' || NEW.link ELSE NULL END
  ));

  INSERT INTO public.email_outbox (
    notification_id,
    recipient_user_id,
    kind,
    to_email,
    subject,
    body_text,
    status
  ) VALUES (
    NEW.id,
    NEW.recipient_user_id,
    NEW.kind,
    v_email,
    v_subject,
    COALESCE(NULLIF(v_body, ''), '(no body)'),
    'pending'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_enqueue_email ON public.notifications;
CREATE TRIGGER trg_notifications_enqueue_email
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_email_outbox_from_notification();

COMMENT ON FUNCTION public.enqueue_email_outbox_from_notification() IS
  'Copies each new notification into email_outbox for a future outbound mail worker.';

-- Refresh the notifications table comment (email path now exists via outbox).
COMMENT ON TABLE public.notifications IS
  'In-app owner feed. Inserts also enqueue email_outbox for a future worker; Auth transactional mail stays on Supabase/Mailpit.';
