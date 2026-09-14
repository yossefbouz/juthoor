# Juthoor M4 / Follow-up Loop — Mission Brief

> **You are the autonomous follow-up loop for Juthoor.** Phase 1 (auth hardening +
> matching engine M0–M3) is DONE and MERGED to `main` via PR #2 (merge `c79a43d`,
> 2026-07-12) — its full audit trail lives in `docs/FIX_LOOP_BRIEF.md` +
> `docs/LOOP_STATE.md` (do not modify either). This loop finishes deployment
> readiness and starts Phase M4 (the shadow period). Work through
> `docs/M4_LOOP_STATE.md` one task per iteration until every task is **DONE** or
> **BLOCKED**. Never ask the user questions mid-run; if something is genuinely
> undecidable, mark the task BLOCKED with a precise note and move on.

## 1. Context you must know

- Live project ref `nlufpicjdeeqcgepewdg` (Postgres 17). **Already applied to live**
  (2026-07-12, verified + advisor-checked — see the LOOP_STATE.md ledger):
  `20260711000000_matches_rls_admin_only`, `20260711010000_degrees_masking`,
  `20260711030000_search_master_tree_v2_3_living_mask`,
  `20260712000000_is_person_living_revoke_anon`.
- **The M1–M3 FEATURE schema is NOT on live yet.** The deployed app will 500 on
  `/admin/review` + `/dashboard/connections` until F1 lands.
- MCP `apply_migration` stamps apply-time versions into live history (NOT the repo
  file timestamps). Record every apply in this loop's ledger. If anyone ever uses
  `supabase db push`, the repair commands are in LOOP_STATE.md's ledger — keep that
  pattern for anything you apply.
- CI (`.github/workflows/integration-tests.yml`) pins supabase CLI **2.84.10** —
  newer CLIs stop auto-granting table privileges to `authenticated` (that's task
  F3's reason to exist). **Never unpin back to `latest`.**
- `apps/web/src/types/database.ts` is **HAND-maintained** — never overwrite it with
  `supabase gen types`; extend it by hand.
- Local traps (OTP 6 vs 8 digits, Mailpit sends magic-link emails not clean OTPs →
  E2E auth uses the admin API + password login, zod v4 pairing, `proxy.ts`
  middleware, Docker slowness) are documented in `docs/FIX_LOOP_BRIEF.md` §3 —
  they all still apply.

## 2. Founder decisions (recorded — do NOT re-ask)

1. **SHADOW MODE stands.** `app_settings.auto_merge_enabled` stays `false`.
   **You must never flip it.** The M4 threshold + flip happen after ≥4 weeks of
   labeled shadow data, by the founder, not by this loop.
2. **LIVE-APPLY IS PRE-AUTHORIZED** for tasks tagged `[LIVE-APPLY]` on this board
   (founder instruction 2026-07-12: "use supabase MCP … push those migrations").
   Discipline per apply: local `db reset` + full pgTAP green FIRST → MCP
   `apply_migration` → live verification (catalog + smoke) → `get_advisors(security)`
   → ledger row. Additive DDL / `CREATE OR REPLACE` / grants / policy swaps only.
   Never destructive SQL on live (the known `DELETE FROM match_paths` cache-clears
   are allowed). Never insert synthetic/test data into live.
3. **No email transport** (in-app notifications only). Do not add Resend or any
   new secret. The Vercel-cron fallback route documents `CRON_SECRET` but you never
   invent or commit a secret value.
4. Link-not-merge, living-person rules, hostile-counterpart model: unchanged
   (plan §5 of `docs/MATCHING_ENGINE_PLAN.md` is still the source of truth).

## 3. Hard guardrails

1. **Git:** work only on branch `feat/m4-followups` (create from up-to-date `main`
   if absent). Conventional commits; commit every green iteration (code + state
   file together). Push the branch; **at loop end open a PR to `main` but NEVER
   merge it** — merging is the founder's call. Never commit to `main` directly;
   never touch `deploy/*` branches.
2. **Secrets:** never hardcode keys/tokens; never print env values.
3. **SECURITY DEFINER discipline:** every new/replaced DEFINER function gets
   `SET search_path = ''` + schema-qualified references. Advisors must stay clean
   (no NEW warns you don't immediately fix) after each `[LIVE-APPLY]`.
4. Never delete or rewrite `docs/MATCHING_ENGINE_PLAN.md`, `docs/FIX_LOOP_BRIEF.md`,
   `docs/LOOP_STATE.md`, or this brief.
5. Red gates = no commit. Fix forward up to 3 focused attempts, else `git restore`,
   mark BLOCKED(one-line diagnosis), commit only the state update, move on. Never
   weaken existing tests to get green.

## 4. Verification gates (every iteration, on everything touched)

| Gate | Command | When |
|---|---|---|
| Types | `pnpm typecheck` | always |
| Lint | `pnpm lint` | always |
| Unit | `pnpm test` | always |
| DB rebuild | `npx supabase db reset` (apps/database) | any migration touched |
| pgTAP | `npx supabase test db` (apps/database) | any migration/SQL touched |
| E2E | `pnpm --filter web test:e2e` | tasks tagged `[E2E]` |
| Advisors | `get_advisors(security)` via Supabase MCP | after any `[LIVE-APPLY]` |

Baseline to preserve: typecheck 0 · lint 0/0 · 131 unit · pgTAP 183 · E2E 15 passed/2 skipped.

## 5. Iteration protocol (execute exactly this, once per iteration)

0. **Preflight:** `git status` — on `feat/m4-followups`, clean tree (create from
   `main` if absent; on the first run these two loop docs are untracked — F0
   commits them; if dirty from a crash: inspect, finish gates or restore, log it).
1. **Read state:** `docs/M4_LOOP_STATE.md`. If every task is DONE or BLOCKED →
   write the final summary at the bottom, commit, push the branch, open the PR
   (title `feat: M4 shadow-period readiness + follow-ups`; body = summary + test
   plan; do NOT merge), tell the user, and **stop the loop**.
2. **Pick ONE task:** first TODO in table order whose Deps are all DONE. Mark it
   IN_PROGRESS.
3. **Re-read the source of truth** for that task (file:line refs in its row; for
   engine work the relevant `docs/MATCHING_ENGINE_PLAN.md` section — do not
   implement from memory).
4. **Implement** the smallest complete unit satisfying the acceptance criteria.
5. **Run the gates** (§4). Iterate until green or BLOCKED per §3.5.
6. **Commit** code + updated M4_LOOP_STATE.md in one commit: `<type>: <task-id> <summary>`.
7. **Log** one row in the state file's Iteration log (same commit).
8. **Stop** this iteration (under `/loop` the next firing continues).

## 6. Tasks (acceptance criteria)

- **F0 — Bootstrap.** Branch `feat/m4-followups` off up-to-date `main`; first commit
  = these two loop docs; verify baseline gates green (typecheck/lint/unit; Docker up
  → `db reset` + pgTAP 183; record results). Confirm MCP live access (read-only).
- **F1 — `[LIVE-APPLY]` Feature schema → live.** Apply the 12 remaining migrations
  IN TIMESTAMP ORDER via MCP `apply_migration` (names = file slugs):
  `20260711020000_matching_m0_foundations`, `20260711040000_match_features_layer`,
  `20260711050000_transliterate_and_name_variants`, `20260711060000_refresh_match_features`,
  `20260711070000_score_pair`, `20260711080000_score_pair_gate`,
  `20260711090000_blocking`, `20260711100000_run_matching_batch`,
  `20260711110000_eval_harness`, `20260711120000_m3_review_surfaces`,
  `20260711130000_m3_link_rpcs`, `20260711140000_compute_degrees_same_as_hop`.
  Pre-check on live: signatures of any `CREATE OR REPLACE` targets (compute_degrees)
  still match; none of the new table/view names already exist. Post-verify: key
  objects exist (match_features, person_links, match_review_cards,
  person_identity_groups + its UNIQUE index, resolve_match/resolve_match_hint/
  revoke_person_link, run_matching_batch, run_eval); **check authenticated grants
  on the new user-facing tables actually exist on live** (notifications,
  match_hints, person_privacy_holds — the CI grants lesson; if missing, F3's grants
  fix them — note it); smoke: `SELECT public.run_eval('frs-v1-live-smoke')` is
  allowed (writes only eval_runs; eval_pairs is empty on live → metrics NULL/0 row
  is fine), `score_pair` on two NULL-feature uuids returns the missing_features
  breakdown. `get_advisors(security)` after; fix any NEW warn immediately (pattern:
  the anon-execute default-privilege issue → REVOKE from anon for engine-internal
  functions). Ledger rows with live versions.
- **F2 — `profiles.self_person_id` drift.** Introspect live (data type, FK,
  default, any trigger touching it). Write a migration that adds it locally,
  guarded so it is a NO-OP where it already exists (`ADD COLUMN IF NOT EXISTS` +
  conditional FK/index creation) — byte-faithful to live's definition. Do NOT apply
  to live (it already has it) — mark the ledger row "already-live / local-only".
  Verify `types/database.ts` MutableProfile matches reality. Local reset + pgTAP
  green; app code using self_person_id (degrees.ts, search pages) still typechecks.
- **F3 — `[LIVE-APPLY]` Explicit table GRANTs.** New migration making the schema
  privilege-self-contained (so a future CLI upgrade can't regress CI): for every
  app table whose RLS policies target `authenticated` (trees, persons, person_names,
  families, family_children, events, matches, profiles, places, person_attachments,
  match_paths, identity_verifications, tree_members, notifications, match_hints,
  person_privacy_holds, app_settings, matching_runs, place/person profiles …)
  add explicit `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated` matching
  what each table's policies actually allow; engine-internal deny-all tables
  (match_features, match_features_dirty, match_block_keys, match_block_skips,
  eval_pairs, eval_runs, merge_log, person_links, match_audit, overlay_refresh_queue)
  get NO authenticated grants. RLS remains the row gate. Decide per-table by
  reading its policies, not by guessing. Local green. **Optional proof:** flip CI
  to `version: latest` in a scratch run ONLY if cheap; otherwise keep the pin and
  note the migration as the durable fix. Apply to live (grants are idempotent).
- **F4 — `[LIVE-APPLY]` M4 scheduling (pg_cron, guarded) + Vercel fallback.**
  Migration that schedules (plan §6 Cron): `juthoor_features_nightly` (02:15),
  `juthoor_nightly_match` (`30 23 * * 1-6`, incremental), `juthoor_weekly_full`
  (`30 23 * * 0`), `juthoor_weekly_eval` — ALL inside a guard that no-ops when the
  `pg_cron` extension is unavailable (local has none; migration must still build —
  pgTAP asserts the guard no-ops locally). Note Supabase installs pg_cron in schema
  `cron` on the `postgres` DB. On live: check extension availability via MCP first;
  after apply verify `cron.job` rows exist. Then add the documented fallback:
  `/api/cron/run-matching` route (service-role client + `CRON_SECRET` header check,
  fire-and-forget a SHORT statement that kicks `run_matching_batch` — NEVER await
  the batch over HTTP), plus README/state documentation. Do not create or commit
  any secret value; the route 501s cleanly when `CRON_SECRET` is unset.
- **F5 — `[LIVE-APPLY]` Batch completion (deferred from B12).** `CREATE OR REPLACE
  run_matching_batch`: (a) also UPSERT `person_links` rows as `proposed`
  (source='system', source_match_id, state-only breakdown) for queued matches,
  never downgrading an existing confirmed/rejected/revoked link; (b) call
  `drain_overlay_refresh()` at the END of the batch (outside per-row work; plain
  refresh acceptable inside the advisory-locked batch txn only if CONCURRENTLY is
  impossible there — if so, document why); (c) keep never-clobber semantics.
  Update `run_matching_batch_test.sql` (+ overlay assertion). Local suite green,
  then live apply + advisors.
- **F6 — `[E2E]` Re-enable Playwright in CI.** Remove the `if: false` on the e2e
  job; make it actually pass in CI: supabase start (CLI 2.84.10), build, the
  admin-API+password setups from `e2e/_setups/`, browsers via
  `npx playwright install --with-deps chromium`. Acceptance: the job is green on
  this loop's PR. If a hard CI limitation appears (runner resources, ports),
  BLOCKED with the exact error + minimal repro notes.
- **F7 — `[E2E]` Replace the quarantined `private-items` spec.** Delete the
  skipped Nextbase spec and write a real Juthoor owner-flow spec in its place
  (e.g. create a tree via the real UI at `/dashboard/new`, see it on the dashboard).
  Local `test:e2e` green (suite count goes up, 0 skipped-quarantine left).

## 7. Human-only items (NOT board tasks — never attempt them)

- Enable **leaked-password protection** (Supabase dashboard → Auth).
- Deploys (`deploy/*` branches) and merging this loop's PR.
- After ≥4 weeks of shadow labels: pick the auto-link threshold from `run_eval`,
  and flip `app_settings.auto_merge_enabled` — founder only.

## 8. Definition of done

Every board task DONE (or BLOCKED with a precise unblocking note); live carries the
full engine schema + guarded schedules; all gates green (incl. E2E, incl. CI);
branch `feat/m4-followups` pushed with an OPEN (unmerged) PR; final summary written
at the bottom of `docs/M4_LOOP_STATE.md` (shipped / live-apply ledger / blocked /
what the founder does next).
