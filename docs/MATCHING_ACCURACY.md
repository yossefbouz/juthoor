# Measuring matching accuracy

How to find out how often the matching score is right, before changing a
threshold or switching on automatic linking.

You need two things: a list of pairs a person has judged ("labelled pairs"), and
the report that scores them.

## 1. Add labelled pairs

A labelled pair is two people from different trees plus a verdict:

- `match`: they are the same person
- `non_match`: they are two different people

Labelled pairs live in the table `public.eval_pairs`. Add them in the Supabase
SQL editor. The smaller person id always goes first, so let `LEAST` / `GREATEST`
order them:

```sql
INSERT INTO public.eval_pairs (person_a_id, person_b_id, label, source, notes)
VALUES (
  LEAST('<person id 1>'::uuid, '<person id 2>'::uuid),
  GREATEST('<person id 1>'::uuid, '<person id 2>'::uuid),
  'match',                     -- or 'non_match'
  'hand_labelled',
  'Same man: both trees give the same wife and children'
);
```

To turn the decisions already taken in the review queue into labels:

```sql
INSERT INTO public.eval_pairs (person_a_id, person_b_id, label, source)
SELECT person_a_id, person_b_id,
       CASE status WHEN 'admin_approved' THEN 'match' ELSE 'non_match' END,
       'review_decision'
FROM public.matches
WHERE status IN ('admin_approved', 'admin_rejected')
ON CONFLICT (person_a_id, person_b_id) DO NOTHING;
```

Things to keep in mind:

- Label what is true, not what the engine said. A pair is only useful if someone
  checked it.
- Include hard cases: brothers, namesakes from the same village, the same person
  written in Arabic in one tree and in Latin letters in the other, a woman under
  her birth surname and her married surname.
- Pairs taken from the review queue are only pairs the engine already found, so
  they cannot show what it misses. Add some same-person pairs you know about
  from outside the queue.
- With fewer than about 50 pairs of each kind the percentages move a lot when
  one pair changes. Treat them as a rough guide.
- To set pairs aside as a final check that was never used for tuning, add them
  with `is_holdout = true` and report them separately (below).
- Deleting a person deletes their labelled pairs.

## 2. Run the report

```sql
SELECT * FROM public.match_accuracy_report();
```

Admins only: it works in the SQL editor and for a signed-in admin through the
API (`rpc('match_accuracy_report')`); anyone else is refused. It first rebuilds
the match features of the people in the labelled pairs, then scores every pair
with the same scorer the matching batch uses.

For the held-out pairs: `SELECT * FROM public.match_accuracy_report(true);`

For just the thresholds in use (review floor 30, living 76, deceased 90):

```sql
SELECT * FROM public.match_accuracy_report() WHERE threshold IN (30, 76, 90);
```

## 3. Read the result

There is one row per threshold from 0 to 100. Each row answers: "if every pair
scoring at or above this threshold were treated as the same person, what would
happen?"

| column | meaning |
| --- | --- |
| `threshold` | the score being tried |
| `true_positives` | same-person pairs at or above the threshold (found, correctly) |
| `false_positives` | different-people pairs at or above it (would be wrongly joined) |
| `false_negatives` | same-person pairs below it (missed) |
| `true_negatives` | different-people pairs below it (correctly left alone) |
| `precision` | of the pairs at or above the threshold, the share that really are the same person. Empty when no pair reaches the threshold |
| `recall` | of all the same-person pairs, the share at or above the threshold |

Example: five labelled pairs score 26, 19 and 12 (same person) and 26 and 0
(different people). At threshold 13 two same-person pairs and one
different-people pair are at or above it, so precision is 2 of 3 = 0.6667 and
recall is 2 of 3 = 0.6667. At threshold 20 it is 1 of 2 = 0.5 and 1 of 3 =
0.3333.

Raising a threshold normally raises precision and lowers recall. A wrong
automatic link joins two families, a missed one only waits in the review queue,
so for automatic linking look for the lowest threshold whose precision is at
least 0.99 (the bar set in `MATCHING_ENGINE_PLAN.md`), and check it on the
held-out pairs too.

The report looks at the score only. The engine's automatic-link decision is
stricter: it also needs no veto (for example different given names or a
mother's name that disagrees) and agreement in at least two groups of fields.

## What this does not do

It changes no setting. `auto_merge_enabled` and `nightly_matching_enabled` stay
as they are; the thresholds (`link_threshold_deceased`, `link_threshold_living`,
`review_score_floor` in `public.app_settings`) are changed by hand after reading
the report.
