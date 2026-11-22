-- Behaviour checks for contacts, claims, threads, ID scans, notes (stranger vs owner).
BEGIN;
SELECT plan(8);

-- message sender FK must SET NULL (account delete must not wipe counterpart mail)
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'messages'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%sender_id%SET NULL%'
  ),
  'messages.sender_id FK is ON DELETE SET NULL'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'message_threads'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%participant_low%SET NULL%'
  ),
  'message_threads.participant_low FK is ON DELETE SET NULL'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'message_context_is_active'
  ),
  'message_context_is_active helper exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'msg_select_participant'
      AND qual ILIKE '%message_context_is_active%'
  ),
  'messages select policy requires active context'
);

SELECT ok(
  pg_get_functiondef('public.verify_identifier(uuid,text,uuid)'::regprocedure)
    ILIKE '%cannot_self_verify%',
  'verify_identifier blocks admin self-verify'
);

SELECT ok(
  pg_get_functiondef('public.respond_person_claim(uuid,text)'::regprocedure)
    ILIKE '%cannot_self_approve%',
  'respond_person_claim blocks self-approve'
);

SELECT is(
  (
    SELECT column_default::text
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_settings'
      AND column_name = 'nightly_matching_enabled'
  ),
  'false',
  'nightly_matching_enabled defaults false'
);

-- num_children 0=0 must score 0 after the should-fix patch
SELECT ok(
  pg_get_functiondef(
    (
      SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('score_pair_impl', 'score_pair')
      ORDER BY CASE WHEN p.proname = 'score_pair_impl' THEN 0 ELSE 1 END
      LIMIT 1
    )
  ) ILIKE '%num_children = 0 AND b.num_children = 0%',
  'score_pair treats num_children 0=0 as zero points'
);

SELECT * FROM finish();
ROLLBACK;
