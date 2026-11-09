-- Privacy / claim / messaging surfaces for PR #26 re-review
BEGIN;
SELECT plan(12);

SELECT has_function('public', 'is_person_claimed', ARRAY['uuid']);
SELECT has_function('public', 'get_person_contact', ARRAY['uuid']);
SELECT has_function('public', 'request_person_claim', ARRAY['uuid']);
SELECT has_function('public', 'respond_person_claim', ARRAY['uuid', 'text']);

SELECT ok(
  to_regclass('public.person_claim_requests') IS NOT NULL,
  'person_claim_requests table exists'
);

SELECT ok(
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'access_log' AND column_name = 'viewer_id') = 'YES',
  'access_log.viewer_id is nullable'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'message_threads' AND column_name = 'participant_low'
  ),
  'message_threads.participant_low exists'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'message_threads' AND column_name = 'participant_high'
  ),
  'message_threads.participant_high exists'
);

SELECT ok(public.mf_is_placeholder_name('Unknown'), 'Unknown is placeholder');
SELECT ok(public.mf_is_placeholder_name('غير معروف'), 'Arabic unknown is placeholder');
SELECT ok(NOT public.mf_is_placeholder_name('أحمد'), 'real Arabic name is not placeholder');

SELECT ok(
  NOT has_function_privilege('anon', 'public.score_pair(uuid,uuid)', 'execute'),
  'anon cannot execute score_pair'
);

SELECT * FROM finish();
ROLLBACK;
