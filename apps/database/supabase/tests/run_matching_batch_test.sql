-- pgTAP: the shadow-mode batch end-to-end (plan §7-M2, B12; extended by F5:
-- proposed person_links, never-downgrade, overlay drain at batch end).
BEGIN;
SELECT plan(9);

INSERT INTO auth.users (id, email, aud, role) VALUES
  ('a8000000-0000-0000-0000-000000000001', 'o1@test.juthoor', 'authenticated', 'authenticated'),
  ('a8000000-0000-0000-0000-000000000002', 'o2@test.juthoor', 'authenticated', 'authenticated');
INSERT INTO public.trees (id, name, owner_id) VALUES
  ('e8000000-0000-0000-0000-000000000001', 'T1', 'a8000000-0000-0000-0000-000000000001'),
  ('e8000000-0000-0000-0000-000000000002', 'T2', 'a8000000-0000-0000-0000-000000000002');

-- The SAME person in two trees (name only — enough to block + score).
INSERT INTO public.persons (id, tree_id, gender) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000001', 'M'),  -- pA (t1)
  ('b0000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000002', 'M');  -- pB (t2)
INSERT INTO public.person_names (person_id, is_primary, given_name, surname) VALUES
  ('a0000000-0000-0000-0000-000000000001', true, 'احمد', 'خطيب'),
  ('b0000000-0000-0000-0000-000000000002', true, 'احمد', 'خطيب');

-- 1. run the shadow batch (builds features + blocks + candidates + scores)
SELECT ok(public.run_matching_batch(true) IS NOT NULL, 'run_matching_batch completes and returns a run id');

-- 2. the cross-tree duplicate is queued as pending (shadow mode)
SELECT is(
  (SELECT status::text FROM public.matches
   WHERE person_a_id = 'a0000000-0000-0000-0000-000000000001'
     AND person_b_id = 'b0000000-0000-0000-0000-000000000002'),
  'pending', 'cross-tree duplicate is queued as pending (nothing auto-links)');

-- 3. the match carries a positive score
SELECT cmp_ok(
  (SELECT confidence_score FROM public.matches
   WHERE person_a_id = 'a0000000-0000-0000-0000-000000000001'
     AND person_b_id = 'b0000000-0000-0000-0000-000000000002'),
  '>', 0, 'the surfaced match has a positive confidence score');

-- 4. the run is recorded in matching_runs
SELECT ok(
  EXISTS (SELECT 1 FROM public.matching_runs WHERE status = 'completed' AND queued >= 1),
  'matching_runs recorded a completed run with >=1 queued match');

-- 5. (F5a) the batch also proposed the reversible same_as link
SELECT is(
  (SELECT status::text || '|' || source FROM public.person_links
   WHERE person_a_id = 'a0000000-0000-0000-0000-000000000001'
     AND person_b_id = 'b0000000-0000-0000-0000-000000000002'),
  'proposed|system', 'the batch UPSERTs a proposed system person_link for the queued pair');

-- 6. a human decision must survive a re-run (match AND link), and pending
--    overlay-refresh requests must be drained at batch end
UPDATE public.matches SET status = 'admin_approved'
  WHERE person_a_id = 'a0000000-0000-0000-0000-000000000001'
    AND person_b_id = 'b0000000-0000-0000-0000-000000000002';
UPDATE public.person_links SET status = 'confirmed'
  WHERE person_a_id = 'a0000000-0000-0000-0000-000000000001'
    AND person_b_id = 'b0000000-0000-0000-0000-000000000002';
SELECT public.enqueue_overlay_refresh('test_pending_drain', NULL);
SELECT ok(public.run_matching_batch(true) IS NOT NULL, 're-run completes');

-- 7. the human match decision is intact (never clobbered)
SELECT is(
  (SELECT status::text FROM public.matches
   WHERE person_a_id = 'a0000000-0000-0000-0000-000000000001'
     AND person_b_id = 'b0000000-0000-0000-0000-000000000002'),
  'admin_approved', 'a human decision is not clobbered by a re-run');

-- 8. (F5a) the confirmed link is never downgraded back to proposed
SELECT is(
  (SELECT status::text FROM public.person_links
   WHERE person_a_id = 'a0000000-0000-0000-0000-000000000001'
     AND person_b_id = 'b0000000-0000-0000-0000-000000000002'),
  'confirmed', 'a confirmed person_link is never downgraded by a re-run');

-- 9. (F5b) the batch drained the overlay-refresh queue
SELECT is(
  (SELECT count(*)::int FROM public.overlay_refresh_queue WHERE processed_at IS NULL),
  0, 'run_matching_batch drains pending overlay-refresh requests at batch end');

SELECT finish();
ROLLBACK;
