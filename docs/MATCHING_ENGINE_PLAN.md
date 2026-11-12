# Juthoor Matching Engine — Final Implementation Plan

*Lead-architect synthesis of seven expert memos (scoring, architecture, blocking, features, merge, review-UX, evaluation) and three adversarial reviews (privacy/political, Supabase feasibility, matching correctness). Written for the founder + a small dev team. Output target: the actual shipped stack — Supabase Postgres + Next.js 16 on Vercel. No Python, no Redis, no separate API server in v1.*

---

## 0. How the reviews changed this plan (read this first)

Three independent adversarial reviews stress-tested the draft. All three **confirmed** the draft's safety posture (link-not-merge, shadow mode, the ≥99% precision gate, the admin-only `matches` RLS fix) is the right backbone — but each surfaced **blocking** holes the draft did not cover. Every one is folded in below; the headline changes are:

1. **Deanonymization via the degrees path (privacy — BLOCKING).** The *already-shipped* `compute_degrees` RPC returns fully-named, gender-tagged interior path nodes for **any** target, including living people in private/locked trees, and `search/page.tsx` ships that named chain to the client for every result. The draft's Mother Tree overlay would turn `same_as` links into zero-cost hops that **broadcast those named chains across family boundaries** — a clean deanonymization channel against living Palestinians in the occupied territories. **Fix pulled forward into Phase M0/M1:** mask interior path nodes for living / non-permissioned trees *before* any cross-tree hop is enabled. This is a live hole the engine would amplify, not create.

2. **Living-person protection was far too narrow (privacy — BLOCKING).** The draft only blocked auto-*link* for living people; it still wrote a match row, queued it, and **notified both owners** — and the notification itself (plus the card's district + decade) is the leak. **Fix:** living↔living matches are now *admin-only, with zero owner notification and zero identifying detail*; "living person involved" is a first-class auditable state (`meta.privacy:'living_suppressed'`); residence/current-location is treated as the single highest-sensitivity field.

3. **Cross-script names are unmatched, defeating the headline goal (correctness — BLOCKING).** Verified: the shipped search only handles Ibrahim/Ibraheem/**Abraham** because the *client* transliterates Latin→Arabic before Postgres; `normalize_arabic`/`arabic_phonetic` only work on text already in Arabic script. A Postgres-only batch therefore systematically **misses the single most important class of true matches** (diaspora trees in mixed scripts). **Fix:** script-folding (Latin→Arabic transliteration) becomes a first-class feature-layer step, with a dedicated cross-script blocking pass and a cross-script holdout that gates the recall claim.

4. **Correlated features over-inflate confidence on same-village namesakes (correctness — BLOCKING).** Literal+phonetic on the same string double-counts; the patriline {self, father, paternal-grandfather} is one correlated cluster, not three independent fields. **Fix:** collapse literal+phonetic to `max + small exact bonus`; require **≥2 independent evidence *clusters*** (patriline counts as one) with at least one *non-patriline* corroborator before auto-link is even eligible.

5. **No disconfirming evidence (correctness — BLOCKING).** With `missing=0` and no negative weights, present-and-*contradictory* scored identically to absent. **Fix:** explicit disagreement handling — present-but-different mother / spouse / birth-year-beyond-band / village now **veto to review** (the deterministic stand-in for Fellegi-Sunter's *u*-probability).

6. **Feasibility blockers (Supabase — BLOCKING).** (a) `match_paths`, `compute_degrees`, `search_master_tree`, and the Arabic functions are **live-only and uncommitted** — "zero churn / reuse as-is" was false; M0's dump-and-commit must capture *all* of them. (b) The incremental watermark keyed on `persons.updated_at` **silently misses** birth-year/name/child-link edits (those child tables have no `updated_at`); the dirty-queue must be the sole probe source. (c) The CI accuracy gate is hard-gated to the upstream template repo and has **no pgTAP step**, so it never runs.

7. **Threat model now assumes a hostile counterpart owner.** A confirmed link grants **no** cross-tree read; relay tokens are revocable/rate-limited; an owner can place a **"do-not-match" privacy hold** that the matcher honors as a hard veto; either side can decline contact without revealing they declined.

8. **`score_breakdown` is itself dense cross-tree PII** (privacy + correctness improvement, adopted). The durable row now stores only per-field **state + points + similarity scalars** — never raw counterparty names/emails/places. Raw values are re-derived on demand by `score_pair` for the admin card, shrinking the blast radius of any breach.

A standing note for the founder: the live schema comment says *"Score ≥ 450 auto-merges."* This plan **deliberately deviates** from that literal default — it auto-*confirms a reversible link*, never auto-*destroys a row*, and only after precision is proven. State this deviation explicitly when approving.

---

## 1. Executive Summary (plain language)

Juthoor's mission is to reunite a scattered people by stitching thousands of separately-built family trees into one **Mother Tree**. The **Matching Engine** is the machinery that finds, every night, where a person in one family's tree is *the same human being* as a person in another family's tree — even when one branch of the diaspora spells him **Ibrahim**, another **Ibraheem**, and a third **Abraham**.

In plain terms, each night the engine:

1. Looks only at people who changed recently (plus a weekly full sweep).
2. For each, cheaply finds a short list of plausible "could this be the same person?" candidates in *other* trees (this is **blocking** — it avoids comparing all 15M people against all 15M people).
3. Scores each candidate pair against a fixed 25-field scorecard the founder designed (name, father, mother, spouse, four grandparents, birthplace, birth year, etc.), producing a number and a **plain-language explanation** of why.
4. Records the result in the existing `matches` table with a full, **privacy-minimized** breakdown.
5. Surfaces strong-but-not-certain matches to a **daily admin review queue**, and (only once we have proven the engine is accurate) auto-links the near-certain ones — except where a living person is involved, which is always handled by humans.
6. **Notifies both family-tree owners** when their trees connect — *unless* the connection touches a living person, in which case it stays silent and admin-only.

**The Mother Tree payoff:** when two trees are confirmed to share a person, we draw a reversible "same person" link between them rather than destructively fusing them. The Mother Tree is the *graph overlay* formed by all those links — every family keeps its own tree intact and owned, but degrees-of-separation, search, and the unified chart can now cross family boundaries. One Palestinian in Chile and another in Jordan discover they are third cousins through a great-grandfather from the same depopulated village — **without either of them being able to enumerate the living relatives of the other.**

---

## 2. The Single Biggest Design Decision (founder must approve)

Three linked recommendations sit at the heart of this plan. **They are the founder's to approve or override. Everything downstream depends on them.**

### Recommendation A — Deterministic FRS scorecard for v1; true Fellegi-Sunter (Splink) is a documented v2

We ship the founder's **fixed 25-parameter additive scorecard** (with the correctness corrections below: correlated-feature collapse, evidence-cluster gating, and disagreement penalties), implemented as one explainable PL/pgSQL function. We do **not** build EM-learned Fellegi-Sunter (Splink) now.

- **Why:** True Fellegi-Sunter needs per-field *m* (agree-given-match) and *u* (agree-given-non-match) probabilities, learned from thousands of labeled match/non-match decisions. **We have zero labeled data at launch.** The deterministic scorecard needs none, matches the founder's spec, and — critically — is **fully explainable** to a family owner whose tree just connected ("father's name matches phonetically +10, village exact +25, birth year within 2 years +22"). Explainability is a hard trust requirement, not a nice-to-have.
- **The v2 path is built-in, not bolted-on:** the admin review queue we build *is* the labeling pipeline. Every approve/reject/defer decision becomes a labeled example; the per-field state vector we store from day one *is* the feature log. Once a few thousand labels accumulate, a Python+Splink pass can be A/B-tested against v1. Only then does adding a Python host pay for itself.
- **Terminology note:** the brief calls this "FRS," but every memo agrees it is a *fixed additive weighted model*, not classic Fellegi-Sunter. We adopt the founder's terminology while being explicit in the docs that v1 is deterministic — and we add the deterministic *correlation* and *disagreement* corrections that a naive additive sum lacks (§4).

### Recommendation B — LINK, do not destructively merge

When the engine decides two records are the same person, it **never deletes or repoints a `persons` row.** It writes a reversible `same_as` identity edge into a new `person_links` table. The Mother Tree is rendered as a read-side graph overlay over the untouched per-family trees.

- **Why:** A wrong fuse of two unrelated Palestinian families is the deepest trust violation this product can commit, and a destructive merge is effectively irreversible (it rewrites another family's tree and can cascade-delete their data). A link is reversible with one click, preserves each family's ownership, and is *enough* to power cross-tree degrees, search, and a unified chart. Destructive merge buys almost nothing in v1 except risk. It remains available as a deliberate, admin-only, audited **Phase E+** capability — never automatic.
- **A confirmed link grants NO automatic cross-tree read.** It enables degree/overlay computation **under the masking rules of §4/§5 only**. Reading the counterpart family's `persons` still requires the existing `request_tree_access` flow. Owners never see the counterpart owner's identity, email, or self-person.
- **Resolution of a conflict:** the FRS spec literally says "auto-merge at 450." We satisfy its *intent* (one shared person across trees, automatic at high confidence) with the safe, reversible realization: auto-**confirm a link**, never auto-**destroy a row** — and even that only after Recommendation C's gate is met.

### Recommendation C — SHADOW MODE: auto-merge is OFF until precision is proven

The engine ships with **auto-merge disabled**. For an initial period (target ≥4 weeks), *every* match — regardless of score — lands as `status='pending'` in the daily admin queue. Nothing touches the live Mother Tree automatically.

- **Auto-link (the strongest automatic action, and still non-destructive) turns on only when measured precision in the ≥-threshold band hits the agreed bar:** **≥99%** precision on shadow-labeled real data, **plus ≥95% F1 and ≥95% Arabic-variant recall on a frozen gold set that includes cross-script pairs**, plus a minimum labeled-pair count in the band. A single config row (`app_settings.auto_merge_enabled`) flips it — no redeploy — and can re-freeze it instantly if precision drifts.
- **Why:** the founder's 450 cutoff is an untested hypothesis. The cost of errors is wildly asymmetric: a *missed* match just waits in the admin queue (cheap, recoverable); a *wrong auto-merge* fuses two real families and can expose a living person across trees (a real safety risk in occupied territories). Precision-first gating is the only posture consistent with the project's trust and safety filters.
- **Conflict resolution noted:** the merge memo proposed ≥98% precision; the evaluation memo proposed ≥99%. **We adopt the stricter ≥99%** in the ≥-threshold band as the gate. Stricter is the right default given the asymmetric cost.

**Founder decision required on all three.** The rest of this plan assumes A + B + C are approved.

---

## 3. End-to-End Pipeline (in words)

```
                         ┌─────────────────────────────────────────────────────────┐
                         │   NIGHTLY BATCH  (pg_cron ~02:30 Asia/Gaza, in Postgres)  │
                         └─────────────────────────────────────────────────────────┘

  [persons / person_names / families / family_children / events / places / profiles]
                              │
                              │  (1) FEATURE VIEW — refresh dirty-queued persons only
                              ▼      (probe set driven by match_features_dirty, NOT persons.updated_at)
        ┌───────────────────────────────────────────────┐
        │  match_features  (1 row per person)            │   derived once, not per-pair:
        │  self/father/mother/spouse/4 grandparents      │   SCRIPT-FOLDED (Latin→Arabic) then
        │  + child_count, birth/death year+place, email  │   normalized + phonetic; placeholders
        │  + is_living, privacy_hold                     │   NULLed; RLS deny-all
        └───────────────────────────────────────────────┘
                              │
                              │  (2) BLOCKING — turn O(n²) into a near-linear pass
                              ▼
        ┌───────────────────────────────────────────────┐
        │  match_block_keys  (7 passes incl. cross-script│   candidate pairs =
        │  + non-name anchor passes) →                   │   collisions, CROSS-tree only,
        │  generate_match_candidates()                   │   a<b, skew-capped, anti-join matches,
        │  honors privacy_hold as exclusion              │   already-decided pairs skipped
        └───────────────────────────────────────────────┘
                              │   stream of (person_a_id, person_b_id) candidate pairs
                              │
                              │  (3) PAIRWISE SCORING — the one authoritative scorer
                              ▼
        ┌───────────────────────────────────────────────┐
        │  score_pair(a,b) → (score int, breakdown jsonb)│   25 FRS params, literal+phonetic
        │  reuses normalize_arabic / arabic_phonetic     │   COLLAPSED, evidence-cluster gate,
        │  on the script-folded form                     │   DISAGREEMENT vetoes, missing=0,
        │                                                │   score_pct vs max_attainable,
        │                                                │   living-person suppression flag
        └───────────────────────────────────────────────┘
                              │  UPSERT (ON CONFLICT, never clobber human decisions)
                              │  breakdown persists STATE+points only — NO raw a/b PII
                              ▼
        ┌───────────────────────────────────────────────┐
        │  matches  (confidence_score, status,           │
        │  score_breakdown jsonb)  +  person_links(proposed)
        └───────────────────────────────────────────────┘
                  │                                  │
   SHADOW MODE:   │ everything → status='pending'    │  (once precision proven)
   admin reviews  │                                  │  score≥threshold & gates pass &
   EVERYTHING     │  living↔living → ADMIN-ONLY,     │  NOT living → auto-CONFIRM link
                  │  NO owner notify, NO detail      │  (reversible); else stays review
                  ▼                                  ▼
        ┌────────────────────┐            ┌─────────────────────────────┐
        │ /admin/review queue│            │ notify BOTH tree owners      │
        │ Merge/Reject/Defer │───────────▶│ (in-app + relay email)       │
        │ writes match_audit │  defer →   │ living → SILENT / no detail   │
        └────────────────────┘  owner     └─────────────────────────────┘
                  │             hints (masked)            │
                  │  confirmed links                      │
                  ▼                                       ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  person_identity_groups (union-find over CONFIRMED edges)     │
        │  → THE MOTHER TREE: compute_degrees & chart cross tree bounds │
        │  *** interior path nodes MASKED for living / non-permissioned │
        │      trees; revoke tears down the hop AND re-masks/auto-expires│
        │      any notification or relay token that referenced it       │
        └─────────────────────────────────────────────────────────────┘

   Feedback loop: every admin/owner decision → eval_pairs label (tagged with the
   emitting blocking pass + score_at_decision) → weekly run_eval() → PR curve,
   precision-by-band drift alarm, cross-script recall → tune threshold (one constant)
```

**One-line summary:** *feature view (script-folded) → blocking (incl. cross-script + non-name anchors) → pairwise scoring (collapsed, cluster-gated, disagreement-vetoed) → `matches` + proposed `person_links` (PII-minimized) → shadow review (living = silent/admin-only) → notify owners → masked Mother Tree overlay → decisions feed evaluation → tune.*

---

## 4. The FRS Scorecard (concrete)

### Wave 1 shipped: AIO-100 v1 (supersedes the draft 25-param / ~343 table below)

Migration `20261107130000_matching_aio_100.sql` replaces the scorer with the All-in-One **22-field / 100-point** table (`meta.version = 'aio-100-v1'`):

| Field | Points |
|-------|-------:|
| First Name + Phonetic First | 4 + 2 |
| Family Name + Phonetic Family | 4 + 2 |
| Father + Phonetic Father | 6 + 2 |
| Mother + Phonetic Mother | 6 + 2 |
| Paternal Grandfather + Phonetic | 6 + 2 |
| Maternal Grandfather + Phonetic | 6 + 2 |
| Date of Birth / Place of Birth | 7 / 7 |
| Date of Death / Place of Death | 7 / 7 |
| Spouse First + Phonetic | 4 + 2 |
| Spouse Family + Phonetic | 8 + 2 |
| Number of Children | 8 |
| Village/City/Clan (origin) | 4 |
| **TOTAL** | **100** |

Literal and phonetic are **separate additive** fields (no collapse). Paternal/maternal grandmother and email are **omitted** from the sum. Missing = 0. Auto-link eligibility uses **raw points**: ≥90 both deceased, ≥76 either living (still gated by vetoes + ≥2 evidence clusters with a non-patriline corroborator). `app_settings.auto_merge_enabled` remains **DEFAULT false** (shadow mode). UNRWA / 1948 family-card rows in `person_identifiers` short-circuit to score 100 (hard vetoes still apply). Nightly `run_matching_batch` is scheduled via `pg_cron` when the extension is available (see `apps/database/supabase/README.md`).

The historical 25-parameter draft table below is retained for provenance only.

---

A pair's `confidence_score` = sum of awarded points across 25 parameters, **after the correlated-feature collapse and with disagreement handling applied**. **Every parameter contributes 0 (never spuriously positive) if either side's value is NULL or sourced from a placeholder.** Literal-name and numeric fields earn *partial* credit; phonetic, exact-place, and email fields are all-or-nothing.

| # | Parameter | Weight | Comparison rule | Partial credit | Missing-data rule |
|---|-----------|-------:|-----------------|----------------|-------------------|
| 1 | Name (given) | 10 | exact on `normalize_arabic` (of script-folded form) → 10 | `similarity ≥ 0.45` → `round(10·sim)` | either NULL → 0, `state:'missing'` |
| 2 | Phonetic Name | 10 | `arabic_phonetic` equal → 10 | none | NULL → 0 |
| 3 | Surname | 10 | exact norm → 10 | trigram partial | NULL → 0 |
| 4 | Phonetic Surname | 10 | phonetic equal → 10 | none | NULL → 0 |
| 5 | Father's Name | 10 | exact norm → 10 | trigram partial | NULL → 0 |
| 6 | Phonetic Father's Name | 10 | phonetic equal → 10 | none | NULL → 0 |
| 7 | Origin (birthplace) | 10 | same `place_id` → 10; same district → 5 | district half-credit | NULL → 0 |
| 8 | Mother's Name *(maiden)* | 20 | exact norm → 20 | trigram partial | NULL → 0 |
| 9 | Phonetic Mother's Name | 20 | phonetic equal → 20 | none | NULL → 0 |
| 10 | Spouse's Name | 25 | exact norm, **any spouse vs any spouse** → 25 | trigram partial | NULL → 0 |
| 11 | Phonetic Spouse's Name | 25 | phonetic equal (any/any) → 25 | none | NULL → 0 |
| 12 | Paternal Grandfather | 25 | exact norm → 25 | trigram partial | NULL → 0 |
| 13 | Paternal Grandfather Phonetic | 25 | phonetic → 25 | none | NULL → 0 |
| 14 | Paternal Grandmother *(maiden)* | 25 | exact norm → 25 | trigram partial | NULL → 0 |
| 15 | Paternal Grandmother Phonetic | 25 | phonetic → 25 | none | NULL → 0 |
| 16 | Maternal Grandfather | 25 | exact norm → 25 | trigram partial | NULL → 0 |
| 17 | Maternal Grandfather Phonetic | 25 | phonetic → 25 | none | NULL → 0 |
| 18 | Maternal Grandmother *(maiden)* | 25 | exact norm → 25 | trigram partial | NULL → 0 |
| 19 | Maternal Grandmother Phonetic | 25 | phonetic → 25 | none | NULL → 0 |
| 20 | Number of Children | 15 | Δ-band: 0→15, 1→9, 2→4.5, ≥3→0 | banded | either NULL → 0 (see weak/asymmetric note) |
| 21 | Date of Birth | 25 | \|Δyear\|: 0→25, 1-2→90%, 3-5→60%, 6-10→30%, >10→**veto** | banded | either NULL → 0 |
| 22 | Place of Birth | 25 | same `place_id` → 25; same district → 12 | district half | NULL → 0 |
| 23 | Date of Death | 25 | \|Δyear\| band (as #21) | banded | either NULL → 0 |
| 24 | Place of Death | 25 | same `place_id` → 25; same district → 12 | district half | NULL → 0 |
| 25 | Email Address | 25 | exact (case-folded) → 25 | none | either NULL → 0 |

**Sum of nominal weights = 505.** (Params 1 "Origin" and 22 "Place of Birth" both derive from the same BIRT event at different weights — kept exactly as the founder specified.)

### Correlated-feature collapse (correctness BLOCKING fix #1)

A naive additive sum double-counts correlated evidence and over-confidently fuses same-village namesakes. Two corrections apply **before** the score is finalized:

1. **Literal + phonetic collapse.** For each name field that has both a literal and a phonetic parameter (given/surname/father and all four grandparents, mother, spouse), award **`max(literal_pts, phonetic_pts)` + a small fixed bonus** (e.g. +2) when the literal form is an *exact* match — **not the sum**. Exact-vs-phonetic on the same string is one piece of evidence, not two. This removes the most egregious double count and barely changes ranking.
2. **Evidence clusters, not parameters.** The patrilineal chain {self-given, father, paternal-grandfather} is **one correlated cluster** (two unrelated cousins in one village routinely share the whole chain). Distinct evidence clusters are: **patriline**, **maternal line** (mother, maternal grandparents), **spouse**, and **non-name anchors** (birth year+place, DOB+DOD, email).

### Calibration & gates (the conservatism layer)

Additive score alone is **not** sufficient to auto-link. The following gates apply on top:

- **`max_attainable`** is computed *per pair* = sum of the weights of the **evidence clusters** present on *both* sides (after the literal+phonetic collapse), **not** raw parameters. **`score_pct = score / max_attainable`.** Computing the denominator over clusters stops `score_pct` from being trivially `1.0` on a patriline-only match.
- **Auto-link requires ALL of:**
  1. `confidence_score ≥ threshold` (initial *surfacing* hypothesis **450**, but the *auto-link* threshold is whatever the PR curve dictates — see §4 note below);
  2. `score_pct ≥ 0.78`;
  3. **≥ 2 independent evidence clusters agree**, and at least **one of them is NOT the patriline** (i.e. corroboration from maternal line, spouse, or a non-name anchor is mandatory);
  4. a minimum count of **discriminating non-name fields** present-on-both (so a sparse name-only pair can never qualify regardless of `score_pct`).
- **Hard vetoes — cap at `review`, never auto-link, regardless of additive score:**
  1. Gender M vs F mismatch.
  2. Both birth years present and `|Δ| > 15` (and the >10y band in #21/#23 contributes 0).
  3. Same `tree_id` (matching is strictly cross-tree).
  4. Fewer than 2 independent evidence clusters, OR no non-patriline corroborator.
  5. **DISAGREEMENT vetoes (correctness BLOCKING fix #2):** present-on-both-but-**different** on any high-information discriminator caps at review — specifically a present-but-different **mother**, present-but-different **spouse**, present-but-different **village/origin**, present-but-different **maternal grandparents**, or birth-year beyond the band. Present-and-contradictory must never score the same as absent.
  6. **Either person is living** (`is_person_living()` true): never auto-link; route per §5 (admin-only, silent).
  7. **Either person carries a `privacy_hold`** (owner opted out of cross-tree matching): hard veto — the pair is not even surfaced.
- The threshold and `score_pct` floor live as **single named constants in `app_settings`** — tune them from the admin queue's approve/reject labels. **Tune the threshold before ever retuning individual weights.**

> **The founder-named 450 is a *surfacing* threshold, not an auto-link threshold.** It is explicitly **not permitted** to gate auto-link until the PR curve (Phase M4) confirms the lowest score whose measured band precision ≥ 99% on holdout. Before claiming any precision number we calibrate score→probability (isotonic/Platt on accumulating labels) so the gate is stated in precision terms, not raw points.

> **Number-of-Children (param 20) is weak and asymmetric.** `num_children` is derived from `family_children` and is structurally incomplete on diaspora branches (only emigrated children are recorded). Award on match, but **never let a child-count Δ contribute to a veto**, and **exclude it from the `score_pct` denominator** so its near-universal unreliability does not dilute the calibrated fraction.

### `score_breakdown` JSONB contract (versioned, explainable, PII-minimized)

The durable row stores **state + points + similarity scalars only — never raw counterparty names, emails, or place values.** Raw values are re-derived on demand by `score_pair` for the admin card (which already re-derives them), shrinking the blast radius of any service-role/admin compromise.

```jsonc
{
  "meta": { "version": "frs-v1", "score": 470, "max_attainable": 555,
            "score_pct": 0.847, "decision": "review",
            "vetoes": ["spouse_disagree"], "privacy": "living_suppressed",
            "clusters_agreed": ["patriline", "spouse"], "blocking_pass": [1,4] },
  "params": {
    "name":       { "w": 10, "pts": 12, "state": "exact" },          /* collapsed: max+bonus */
    "father":     { "w": 10, "pts": 6,  "state": "partial", "sim": 0.62 },
    "origin":     { "w": 10, "pts": 5,  "state": "place_district" },
    "spouse":     { "w": 25, "pts": 0,  "state": "disagree" },        /* present-but-different → veto */
    "birth_year": { "w": 25, "pts": 22, "state": "year_band", "delta": 2 },
    "email":      { "w": 25, "pts": 0,  "state": "missing" }
    /* …all 25 params; every field carries one of state: exact|partial|disagree|missing … */
  }
}
```

- `meta.version` lets a future v2 scorer coexist.
- `meta.privacy` makes living-person suppression **auditable and testable**.
- `meta.blocking_pass` records which pass(es) emitted the pair, so v2 training can de-bias the blocker's selection bias.
- The per-field `state` distinguishes **agree / partial / disagree / missing** — `disagree` counts feed the auto-link gate.
- Raw values are **absent from the persisted row**; the admin card calls `score_pair` to render them live.

---

## 5. Living-Person & Cross-Tree Privacy Policy (first-class, non-negotiable)

This section is promoted to top-level because two of the three blocking privacy findings live here. It applies to **every** code path that touches matches, degrees, notifications, or the overlay.

### 5.1 Degrees-path masking (BLOCKING — pulled into M0/M1)

The shipped `compute_degrees` / `computeDegreesTo` returns `{person_id, name_ar, name_en, gender, relation}` for **every** interior node, and `search/page.tsx` ships it to the client for **every** result including locked/private trees. Before any cross-tree `same_as` hop is enabled:

1. For any path node whose tree is **not accessible** to `auth.uid()` **OR** for which `is_person_living()` is true, return **only** `{relation label}` and replace `name_ar`/`name_en`/`gender` with a redacted token (`"فردٌ على المسار / Hidden relative"`). Never emit names or gender for living or non-permissioned interior nodes.
2. Across a `same_as` boundary, reveal only the **degree number** and the **two visible endpoints**; do not reveal the named chain unless the viewer `can_access_tree` of each interior node.
3. **Residence / current-location / immigration place is the highest-sensitivity field** — above name. A living person's current residence, EMIG/IMMI place, or precise origin is **never** revealed to a non-permissioned party via a notification, owner hint, or degree path.
4. pgTAP: a non-permissioned viewer requesting degrees through a living person in a private tree gets a **redacted** path.

### 5.2 Living-person handling (BLOCKING — narrow carve-out replaced)

`is_person_living()` returns true when there is no DEAT and birth implies < 100y, and **fails *toward* living when the birth year is unknown** (fail-safe to privacy).

- **Living ↔ living match:** do **not** notify either owner; do **not** create an owner hint; route to **admin-only** review with the match flagged `meta.privacy:'living_suppressed'`. (Optionally suppress entirely until at least one side opts in — founder decision #4.)
- **Any match touching a living person** that is surfaced at all: owner-facing notifications carry **zero identifying detail** — no district, no decade, no initials — only *"a possible connection is under review; no action needed."* The district+decade in `match_review_cards` is withheld whenever either side is living.
- **Living persons never auto-link**, ever, even at score 505 — always dual-owner confirmation (and never with a silent owner notification).

### 5.3 Hostile-counterpart threat model

We assume the counterpart tree owner **may be hostile, an informant, or a coerced/compromised account.**

- A confirmed `same_as` link grants **no** automatic read into the counterpart tree; cross-tree person reads still require `request_tree_access`.
- Owners never see the counterpart owner's identity, email, or self-person — only the masked `match_review_cards`.
- The `contact_relay` token is **revocable and rate-limited**; the email body carries only a relay deep link, **never** the other owner's address. Either side can decline contact **without revealing they declined**.
- **Privacy hold:** any tree owner can mark a person "do not match / do not surface across trees." The matcher honors it as a **hard veto** (the pair is never emitted by blocking, §4 veto 7).

### 5.4 `matches` RLS and breakdown minimization

- The leaky `matches_select` policy (verified at `20260416120001_juthoor_rls_policies.sql:388-398` — returns the full row incl. counterparty id + entire `score_breakdown` to anyone who `can_access_tree` of *either* side, and `can_access_tree` is true for any public tree) is replaced in M0 with **admin-only** direct SELECT.
- The **only** owner-facing read path is the `security_invoker` `match_review_cards` view — never the base table.
- Because `score_breakdown` stores **no raw counterparty values** (§4), even an admin-account or service-role compromise does not expose the diaspora linkage graph's field-level PII at rest.

### 5.5 Adjacent leaks the engine builds on (companion tasks, scheduled with M0/M3)

- `compute_degrees` masking (§5.1) — *live hole, M0/M1.*
- Public-tree search already surfaces a **living** person's name + birth year + village of origin (`getTreePeoplePage` returns `birthYear`/`birthPlaceAr`/`isLiving`; `SearchResult` has no `is_living` gate). A companion task masks living-person birth-year/origin in public-tree results so the engine is not built on a leaky base.

---

## 6. Data Model Additions (precise)

**Caution — the draft's "output tables already exist, zero churn" premise was FALSE.** Verified: `match_paths`, `compute_degrees`, `search_master_tree`, `normalize_arabic`, and `arabic_phonetic` are **live-only and not in any committed migration**. M0 must dump-and-commit *all* of them before anything builds. `matches` (with `CHECK (person_a_id < person_b_id)`, `UNIQUE(person_a_id, person_b_id)`, `score_breakdown jsonb`) is reused as-is. New objects:

### New tables

| Object | Purpose | Key columns |
|--------|---------|-------------|
| `match_features` | One feature row per person (the comparison vector) | PK `person_id`; `tree_id`, `gender`, `is_living`, `privacy_hold bool`, `is_anchor`; **script-folded** `given_norm/phon`, `surname_norm/phon`, `father_norm/phon`, `mother_norm/phon`; `spouse_names_norm text[]`, `spouse_names_phon text[]`; `pgf/pgm/mgf/mgm` (`_norm`,`_phon`); `num_children`, `birth_year`, `birth_place_id`, `death_year`, `death_place_id`, `origin_place_id`, `email`; `features_updated_at` |
| `match_features_dirty` | Recompute queue — **the SOLE source of the incremental probe set** | PK `person_id`; `enqueued_at` |
| `match_block_keys` | Materialized blocking keys (rebuilt nightly) | PK `(person_id, pass, block_key)`; `tree_id`, `pass smallint`, `refreshed_at` |
| `match_block_skips` | Skew audit (capped buckets) — **alert on cap so recall loss is visible** | `pass`, `block_key`, `member_count`, `skipped_at` |
| `person_links` | The reversible identity edge (Mother Tree) | `person_a_id<person_b_id` + UNIQUE; `link_type` default `'same_as'`; `status` ∈ `proposed/confirmed/rejected/revoked`; `source_match_id → matches`, `confidence_score`, `source`, `reviewed_by`, `reviewed_at`, `score_breakdown jsonb` (state-only) |
| `merge_log` | Append-only audit/undo | `action` ∈ `link/confirm/reject/revoke/merge/unmerge`; actor, `before_state`/`after_state jsonb`; UNIQUE `idempotency_key` |
| `matching_runs` | Batch observability | `run_type`, timestamps, `watermark_from/to`, `persons_probed`, `pairs_compared`, `auto_linked`, `queued`, `living_suppressed`, `errored`, `status` |
| `notifications` | In-app feed to owners | `recipient_user_id`, `kind`, `match_id`/`person_link_id`, `title_ar/en`, `body_ar/en`, `link`, `read_at` |
| `contact_relay` | Anonymity relay for emails (revocable, rate-limited) | `match_id`, `from_user_id`, `to_user_id`, `token uuid`, `expires_at`, `revoked_at` |
| `match_audit` | Immutable review-decision log | `match_id`, `actor_user_id`, `actor_role`, `decision`, `previous_status`, `new_status`, `note`, `score_at_decision`, `blocking_pass` |
| `match_hints` | Owner-facing **masked** accept/reject queue | `match_id → matches`, `owner_user_id`, `counterpart_person_id`, `status hint_status`, UNIQUE`(match_id, owner_user_id)` |
| `app_settings` | Single-row runtime config | `auto_merge_enabled bool DEFAULT false`, `auto_merge_threshold int DEFAULT 450`, `score_pct_floor numeric DEFAULT 0.78` |
| `name_variants` | Arabic equivalence dictionary (data, not code) — seeded but **not the cross-script normalizer** | `canonical`, `variant`, `kind` |
| `person_privacy_holds` | Owner "do-not-match" holds (drives the §4 veto 7) | `person_id`, `set_by`, `set_at`, `reason` |
| `eval_pairs`, `eval_runs`, `eval_results` | Gold set + metrics | `eval_pairs(person_a_id<person_b_id, label, variant_tags text[], is_holdout, is_cross_script bool, source, emitting_pass smallint[], notes)` |

> **Resolution (table vs materialized view for features):** we adopt the **maintained table**, not a matview. A matview's `REFRESH … CONCURRENTLY` rebuilds *every* row (every 7-hop grandparent walk) on each refresh — O(N) work for a handful of edits — and cannot carry the `is_anchor`/`privacy_hold` flags, per-row incremental refresh, or deny-all RLS we need. `match_block_keys` is likewise a table for the same reasons.

### New views

- `person_identity_groups` (**materialized**) — union-find over **confirmed** `person_links` → `(person_id, canonical_person_id, group_id)`. **A `CREATE UNIQUE INDEX … (person_id)` is part of the matview DDL** (required for `REFRESH … CONCURRENTLY`). Refreshed `CONCURRENTLY` at end of batch and **on a deferred queue on revoke — never synchronously inside an admin's request path** (a full rebuild can take seconds). This *is* the Mother Tree overlay.
- `match_review_cards` (`security_invoker=on`, SECURITY BARRIER) — per-`auth.uid()` projection: viewer's own person in full; **masked** counterparty card (initials + district + decade **only for deceased public persons**; fully redacted *"فردٌ محجوب / Hidden relative"* when living or private-tree); `score_breakdown` reduced to per-field **agree/disagree/missing booleans** (no raw weights, no counterparty values, no residence/origin for living).
- `v_match_explanations` — flattens `score_breakdown` into human sentences for the admin report and notifications (deceased-public only; suppressed for living).

### Functions / RPCs

- `transliterate_to_arabic(txt)` — **NEW, cross-script BLOCKING fix.** Detects Latin-script names and folds them to Arabic (port `toArabic`/buckwalter + the fallback table from `lib/search/phonetic.ts`, or precompute in the TS write-path and persist `*_arabic` columns). Every name/phonetic comparison and every block key runs on the **script-folded** form.
- `refresh_match_features(p_person_id uuid)` — recompute one feature row; applies `transliterate_to_arabic` → `normalize_arabic`/`arabic_phonetic`. Mirrors `lib/tree/relationships.ts:resolveParents` M→father/F→mother/partner1-fallback **exactly** (incl. U/X and same-gender-partner cases).
- `refresh_match_features_batch()` — drain the dirty queue; full rebuild = `SELECT refresh_match_features(id) FROM persons`.
- `enqueue_match_features_dirty(p_person_id uuid)` — enqueue person + transitive dependents (children/grandchildren/spouses).
- `refresh_match_block_keys(p_full bool)` — TRUNCATE+repopulate the 7 passes; incremental variant drains the dirty set, not `persons.updated_at`.
- `generate_match_candidates(p_max_block_size int DEFAULT 1000)` — emit DISTINCT cross-tree `(a<b)` pairs, **per-pass and global pair caps**, intersection sub-blocking for hot buckets, anti-joined against `matches`, **excluding `privacy_hold` persons**.
- `name_score(...)`, `year_band_pts(delta, w)`, `cluster_gate(...)` — immutable helpers (all bands/constants in one place).
- **`score_pair(p_a uuid, p_b uuid) RETURNS TABLE(score int, breakdown jsonb)`** — SECURITY DEFINER, `SET search_path=''`. The **single authoritative scorer** used by the batch *and* the eval harness so they can never diverge. Applies the literal+phonetic collapse, cluster gate, disagreement vetoes, living-person flag, and PII-minimized breakdown.
- `run_matching_batch(p_full bool DEFAULT false)` — the orchestrator (advisory-locked with a **documented constant lock key**, chunked ~500/tx, **`SET LOCAL statement_timeout = 0` mandatory**, watermarked from `matching_runs`, resumable).
- `run_eval(engine_version text) RETURNS uuid` — scores `eval_pairs` via `score_pair`, sweeps the PR curve, computes precision/recall/F1 + `arabic_variant_recall` + **`cross_script_recall`** (on the cross-script holdout slice).
- `confirm_person_link / reject_person_link / revoke_person_link(p_link_id)` — reversible state transitions + `merge_log` + notify. **Revoke is transactionally complete:** (a) tears down the zero-cost hop in `compute_degrees`/`match_paths` immediately, (b) re-masks any path exposed via the link, (c) auto-expires/retracts any notification or relay token that referenced it, (d) queues the matview refresh.
- `resolve_match(p_match_id, p_decision, p_note)` (admin) and `resolve_match_hint(p_hint_id, p_accept)` (owner) — atomic status-flip + `match_audit` + notify, re-checking `is_admin()`/ownership internally.
- `is_person_living(p_person_id)` — true when no DEAT and birth implies < 100y; **defaults to living when unknown**.

### Triggers, indexes, extensions, jobs

- **Triggers:** `AFTER INSERT/UPDATE/DELETE` on `persons, person_names, families, family_children, events, profiles, person_privacy_holds` → `enqueue_match_features_dirty(affected person + transitive dependents)`. **These triggers are the SOLE source of the probe set** — *not* `persons.updated_at`, which is not bumped by child-table edits (verified: `person_names`/`events`/`family_children` have no `updated_at`). `AFTER UPDATE` on `matches` → status-transition log into `match_audit`.
- **Indexes:** `match_block_keys(pass, block_key, tree_id, person_id)` (collision self-join); GIN trigram on `match_block_keys.block_key WHERE pass=7`; unique `(person_id)` on `person_identity_groups`; `person_names(person_id, name_type, is_primary)`; btree on `match_features(tree_id)`, `(birth_year)`, `(origin_place_id)`, partial `WHERE is_anchor`, partial `WHERE privacy_hold`. (Existing GIN trigram indexes back the `similarity()` partial-credit calls.)
- **Extensions:** `fuzzystrmatch`; `pg_trgm` (already enabled); `pg_cron` — **note Supabase installs `pg_cron` into schema `cron` against the `postgres` DB, not `extensions`**; confirm the install form on the current plan. A pg_cron job runs in-DB and is **still subject to the role `statement_timeout`** — hence the mandatory `SET LOCAL statement_timeout = 0` + per-chunk COMMIT in `run_matching_batch`.
- **Cron:** `juthoor_features_nightly` (~02:15), `juthoor_nightly_match` (`'30 23 * * 1-6'` → incremental), `juthoor_weekly_full` (`'30 23 * * 0'` → full), `juthoor_weekly_eval`. Vercel-cron route `/api/cron/run-matching` (service-role + `CRON_SECRET`) is a documented fallback that must only **fire-and-forget** a short statement to kick `run_matching_batch` — **never await the batch over HTTP** (Vercel Hobby cron is daily-only; Pro has its own function timeout). The advisory lock ensures pg_cron + Vercel cron cannot double-run.
- **SECURITY DEFINER discipline:** *every* new SECURITY DEFINER function (`score_pair`, `refresh_match_features`, `generate_match_candidates`, `run_matching_batch`, `run_eval`, the link RPCs) must `SET search_path = ''` and fully schema-qualify, matching the live `normalize_arabic_lock_search_path` fix. **"`get_advisors(security)` returns clean" is a per-phase exit check.**

> **Hard dependency to land first:** dump (`pg_get_functiondef` / `pg_dump --schema-only`) and commit **all** live-only objects — `normalize_arabic`, `arabic_phonetic` (+ any phonetic generated columns on `person_names`), `search_master_tree`, `compute_degrees`, **and `match_paths` + its indexes/RLS** — before anything else. A fresh environment cannot build otherwise. Verify whether `person_names` already has generated phonetic columns; if so, blocking reads them instead of recomputing.

---

## 7. Phased Build Plan (M0 → M4)

Sequenced so something **demoable ships in Phase M2** (shadow matches visible in an admin queue), and the dangerous auto-link ships **last (Phase M4)**, behind proven precision. **The two live privacy holes (degrees masking, living suppression) are pulled forward into M0/M1.**

---

### Phase M0 — Foundations & safety fixes *(≈ 4–6 days)*

**Goal:** Land the hard dependencies and close the known live privacy holes *before any matching logic exists.*

**Deliverables / tasks**
- Migration: dump + commit **all** live-only objects — `normalize_arabic`, `arabic_phonetic` (+ phonetic generated columns), `search_master_tree`, `compute_degrees`, **`match_paths` + indexes/RLS** — so the schema is buildable from scratch.
- Migration `..._review_security_fix.sql`: **DROP the leaky `matches_select` RLS policy**; replace with **admin-only** direct SELECT. Add `is_person_living()` (fail-safe to living).
- Migration `..._degrees_masking.sql` + `computeDegreesTo` hardening: mask interior path nodes for living / non-permissioned trees (§5.1). **This closes a live deanonymization hole and must not wait for M3.**
- Migration: `app_settings` single-row config (`auto_merge_enabled=false`, `auto_merge_threshold=450`, `score_pct_floor=0.78`).
- Migration: `matching_runs`, `person_privacy_holds`.
- **CI fix:** remove/correct the `if: github.repository == 'imbhargav5/...'` guard in `.github/workflows/integration-tests.yml` so the job runs on the Juthoor fork, and add a `supabase test db` pgTAP step (the workflow already runs `supabase start`).
- Confirm `pg_cron` availability/schema on the current plan; document the Vercel-cron fallback.

**Exit criteria**
- pgTAP: a non-admin owner `SELECT * FROM matches` returns **0 rows**.
- pgTAP: a non-permissioned viewer requesting degrees through a **living** person in a private tree gets a **redacted** path (names/gender/residence stripped).
- Schema builds clean on a fresh `supabase db reset` from migrations only, **including `match_paths` and all four live functions.**
- `app_settings` row exists, defaults verified.
- The pgTAP CI job is **green on a PR** (not merely "tests exist").

---

### Phase M1 — Feature layer & the scorer *(≈ 2–2.5 weeks)*

**Goal:** Build the per-person, **script-folded** feature vector and the one authoritative scorer; lock both with tests. **No batch yet.**

**Deliverables / tasks**
- `match_features` + `match_features_dirty` tables (deny-all RLS, service-role only).
- `transliterate_to_arabic` (cross-script fold) + `refresh_match_features` / `_batch` / `enqueue_match_features_dirty` + the derivation triggers on **all** six source tables (the dirty queue is the sole probe source). **Parity test** of SQL-derived father/mother vs `resolveParents`, explicitly covering **U/X gender and same-gender-partner** cases, not just clean M+F.
- `name_variants` dictionary, seeded from `FALLBACK_LATIN_TO_ARABIC` (as a *supplement*, not the cross-script normalizer).
- Helpers `name_score`, `year_band_pts`, `cluster_gate`.
- **`score_pair(a,b)`** — the 25-parameter scorecard with literal+phonetic **collapse**, **evidence-cluster** gate, **disagreement vetoes**, `score_pct` over clusters, living-person flag, PII-minimized breakdown (`meta.version='frs-v1'`).
- Synthetic eval fixture migration: 3–4 cross-tree duplicate families **including a Latin-script-vs-Arabic-script Ibrahim/Abraham pair**, two genuinely distinct محمد المصري, a maiden/married-name trap, a placeholder-mother family, a same-village same-patriline namesake (must NOT auto-link), a present-but-different-spouse pair (disagreement veto).
- pgTAP `match_engine_test.sql` + Vitest `phonetic.test.ts`; wired into the now-running CI with committed **`arabic_variant_recall` AND `cross_script_recall`** floors as gates.

**Exit criteria**
- Every labeled fixture pair scores in its expected band; placeholders produce **zero** false credit; the same-village namesake is **capped at review**; the different-spouse pair is **vetoed**.
- `score_pair` parity: known pairs score identically each run (refactor-safe), incl. U/X cases.
- CI fails if `arabic_variant_recall` **or** `cross_script_recall` on the fixture drops below floor.
- `get_advisors(security)` clean for all new functions.

---

### Phase M2 — Blocking & the shadow batch *(≈ 2 weeks)* — **FIRST DEMO**

**Goal:** Generate candidates at scale and run the full nightly batch **in shadow mode** — matches appear, nothing auto-acts.

**Deliverables / tasks**
- `match_block_keys` + `match_block_skips` tables and collision/trigram indexes.
- `refresh_match_block_keys` — **7 passes**: P1 phonetic given+surname, P2 phonetic surname+birth-decade, P3 phonetic given+origin place, P4 phonetic father+origin place, P5 origin place+birth-decade, P6 full-name trigram ≥0.45, **P7 cross-script: transliterated-phonetic given+surname** — plus at least one **non-name anchor** pass (e.g. `birth_decade + origin_place_id`, or `origin_place_id + paternal-grandfather phonetic`) so a mangled/cross-script given name is still caught. Excludes placeholders and `privacy_hold` at ingest.
- `generate_match_candidates` with `MAX_BLOCK_SIZE=1000`, **per-pass and global pair caps**, intersection sub-blocking for hot buckets, cross-tree + `a<b`, anti-join against `matches`, alert on every capped block.
- `run_matching_batch(p_full)`: advisory-locked single-flight (documented lock key); resolve watermark from `matching_runs`; **`SET LOCAL statement_timeout = 0`**; chunk ~500/tx with COMMIT between chunks; for each candidate call `score_pair`; UPSERT into `matches` `ON CONFLICT … DO UPDATE … WHERE matches.status='pending'` (**a human-rejected pair is sticky until revoked — documented**); **shadow mode forces `status='pending'` for all**; **living↔living flagged `living_suppressed`, no owner hint**; write `person_links(status='proposed')`; update `matching_runs` counters.
- `pg_cron` schedules wired (fire-and-forget Vercel fallback).
- `match_eval` schema + `run_eval`; establish the **baseline PR curve** and a candidate threshold; **measure actual `pairs_compared` on real data** before declaring the off-peak-window exit met.

**Exit criteria**
- A full nightly run completes inside the off-peak window on current data; `matching_runs` shows the queued / living-suppressed split (all "review" in shadow).
- Candidate count is in the expected ~0.5–2M-at-100k range; no bucket exceeds the cap un-logged; `EXPLAIN ANALYZE` budget for the hottest block documented.
- **Demo:** matches are queryable with full (state-only) `score_breakdown`.

---

### Phase M3 — Review surfaces, notifications & the Mother Tree overlay *(≈ 2.5–3 weeks)*

**Goal:** Humans can review every match; owners get notified (subject to §5); confirmed links render as the masked Mother Tree. Still no auto-link.

**Deliverables / tasks**
- `match_audit`, `notifications`, `contact_relay`, `match_hints`, `match_review_cards` view, `person_identity_groups` matview (with unique index), `v_match_explanations`.
- RPCs: `resolve_match`, `resolve_match_hint`, `confirm/reject/revoke_person_link` (each atomic: status-flip + `match_audit`/`merge_log` + notify; **revoke fully tears down the hop, re-masks paths, expires tokens/notifications, queues matview refresh** per §6).
- Server actions `data/admin/review.ts` and `data/user/hints.ts`, on `authActionClient` with `is_admin()` guard — forked from the existing requests inbox. A **"set privacy hold"** owner action.
- `/admin/review` page + `ReviewQueueClient.tsx`: server `is_admin()` guard + redirect; A-vs-B side-by-side (RTL, A on the right); `score_breakdown` rendered as per-field **agree/disagree/missing chips** (`AgreeChip.tsx`) — raw values fetched live via `score_pair`, never from the stored row; degrees path via `DegreesDialog`/`PathGraph` (**masked** per §5.1); Merge/Reject/Defer; read-only "recent auto-links" tab; living-involved matches clearly badged `living_suppressed`.
- `/dashboard/connections` page + `ConnectionsClient.tsx` (6th `DiscoveryTabs` lane): **masked** counterparty cards, Accept/Reject, `DegreeChip`. **A fuse needs BOTH owners (or an admin); living-person links require dual-owner confirmation regardless of score; living↔living shows no detail.**
- `NotificationBell` (mirrors `pendingRequestsCount` sidebar-badge pattern).
- Supabase Edge Function `notify-match` (Deno + Resend, `RESEND_API_KEY` in Edge secrets only, validated at startup) — **best-effort**; in-app notification is the source of truth; a Vercel-cron daily digest sweeps failed sends. Email body carries only a relay deep link, **never** the other owner's address, **never** any detail for a living-involved match.
- Extend `compute_degrees` so **confirmed** `same_as` edges are zero-cost hops **under the §5.1 masking rules**; `match_paths.path_json` gains a `relation:'same_as'` marker.

**Exit criteria**
- pgTAP/E2E: non-admin owner sees only a **masked** card for a living counterparty; admin sees full detail (re-derived live); a living↔living match produces **no owner notification and no identifying detail**.
- Confirming a link makes two trees connect in the chart and in `compute_degrees`; **revoking** splits them back, re-masks the path, and expires any token/notification (test asserts no cached `path_json` still bridges them).
- Both owners receive an in-app notification on confirm (deceased-only detail); email best-effort, relay link only.
- Playwright E2E covers Merge/Reject/Defer, owner Accept/Reject, the **hostile-counterpart worst case** (confirmed link grants no cross-tree read; declined contact is not disclosed), and the privacy-hold veto.

---

### Phase M4 — Evaluation, drift watch & gated auto-LINK *(≥ 4 weeks shadow, then flip)*

**Goal:** Prove precision on real data — including the cross-script class — then turn on auto-confirm of a reversible link (never a destructive merge, never for living persons).

**Deliverables / tasks**
- Run ≥4 weeks of shadow mode; every admin/owner decision writes a label into `eval_pairs` (`admin_positive`/`admin_negative`), **tagged with the emitting blocking pass and `score_at_decision`** to de-bias v2 training.
- `/admin/matches/metrics` dashboard (Server Action over `eval_runs`): PR curve, precision-at-threshold, `arabic_variant_recall` + **`cross_script_recall`** trends, **reject-rate-by-band drift alarm**.
- Weekly `run_eval` via `pg_cron`. **Holdout discipline:** freeze a slice of `eval_pairs` (**including hand-labeled cross-script, heavy-transcription-divergence, and Ottoman/Mandate/Hebrew-script pairs**) never used for tuning; report gate metrics on the holdout. Version `engine_version` per run.
- **Recall blind-spot guard:** the recall harness must measure recall on **dissimilar-but-true** pairs (cross-script, heavy transcription divergence) — *not* by sampling among string-similar pairs (that measures the net's precision, not its recall). Periodically inject a random sample of high-similarity *non-surfaced* pairs as audit pairs, clearly tagged.
- Calibrate score→probability; tune `auto_merge_threshold` (and `score_pct` floor) from the curve — pick the **lowest score whose band precision ≥ 99% on holdout**; do **not** retune individual weights first.
- When gates pass (**≥99% band precision on shadow-labeled data + ≥95% F1 + ≥95% `arabic_variant_recall` + a documented `cross_script_recall` floor on holdout, with a minimum labeled-pair count in the band**), flip `app_settings.auto_merge_enabled=true`. `run_matching_batch` then auto-sets `person_links.status='confirmed'` for qualifying pairs (all §4 vetoes still apply; **living-person carve-out absolute**), writes `merge_log`, sets the match to a new `linked` status, notifies both owners (deceased-only detail) with an undo link.

**Exit criteria**
- Documented PR curve and chosen threshold with the recall sacrificed, on holdout data **incl. the cross-script slice** (auto-link gated on holdout recall, not just precision).
- Auto-link enabled only with the gate met and the kill-switch (`app_settings`) verified to instantly re-freeze.
- A spot-audited sample of auto-confirmed links shows ≥99% correct; every one is reversible via `merge_log` and revoke fully re-isolates the trees.

---

### Phase E+ (optional, never automatic) — Admin-initiated destructive merge & v2 Splink

Only on explicit founder decision: admin-only, audited true merge with survivorship rules (canonical chosen by admin; events deduped by `(event_type, date_year, place_id)`; attachments unioned), fully restorable from `merge_log`. **v2 Splink** unlocks once the queue has produced a few thousand labels: a Python+Splink pass re-scores the *same* blocker-emitted candidates and is A/B-tested against v1 before any trust is transferred — using the **pass-tagged, de-biased** labels so v2 does not inherit v1's cross-script blind spot. This is the *only* point at which adding a Python host is justified.

---

## 8. How to Start THIS WEEK

1. **Confirm the three big decisions (A/B/C) with the founder** and get written sign-off on *link-not-merge* + *shadow mode*, **explicitly noting the deviation from the live "Score ≥ 450 auto-merges" schema comment.** Everything else depends on this. *(½ day, founder.)*
2. **Dump and commit ALL live-only objects** — `normalize_arabic`, `arabic_phonetic` (+ phonetic columns), `search_master_tree`, `compute_degrees`, **`match_paths`** — as the first migration; the schema must build from scratch. *(1 day.)*
3. **Ship the RLS security fix** (`matches_select` → admin-only) + `is_person_living()` + the pgTAP test proving a non-admin owner reads 0 rows from `matches`. *(1 day.)*
4. **Ship the degrees-path masking fix** + pgTAP proving a non-permissioned viewer gets a redacted path through a living person in a private tree. *This closes a live deanonymization hole and must not wait.* *(1–1.5 days.)*
5. **Fix CI** (remove the upstream-repo guard, add the `supabase test db` pgTAP step) and **land `app_settings`** + `matching_runs` + `person_privacy_holds`. *(1 day.)*
6. **Scaffold `score_pair` + `transliterate_to_arabic` + the synthetic eval fixture (incl. a cross-script pair) + pgTAP/Vitest in CI** with the `arabic_variant_recall` AND `cross_script_recall` floors — even a stub `score_pair` so the harness and the explainability contract exist before the full scorecard. *(2 days.)*

By end of week: a buildable-from-scratch schema, **two live privacy holes closed (matches RLS + degrees masking)**, a CI gate that actually runs, the auto-merge kill-switch in place, and the test/labeling scaffolding the whole engine will be validated against.

---

## 9. Top Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Wrong auto-merge fuses two unrelated families** — esp. same-village same-patriline namesakes (محمد أحمد bin X) accumulating name+father+PGF fast. The deepest trust violation. | Critical | Link-not-merge (reversible); shadow mode until ≥99% band precision; literal+phonetic **collapse**; **≥2 independent clusters incl. a non-patriline corroborator**; **disagreement vetoes** (mother/spouse/village/birth-year); `score_pct` over clusters; hard vetoes (gender, \|Δbirth\|>15, same-tree); `app_settings` kill-switch; full state-only `score_breakdown` + `merge_log` for instant undo. |
| 2 | **Deanonymization via the degrees path** — shipped `compute_degrees` emits named, gendered interior nodes for any target incl. living people in private trees; the overlay broadcasts them cross-tree. | Critical | §5.1 masking pulled into **M0/M1**: interior nodes for living/non-permissioned trees return redacted token only; cross-`same_as` discloses degree + endpoints only; residence/origin never revealed; pgTAP gate. |
| 3 | **Living-person cross-tree exposure via the match/notification itself** — even a masked card + "your tree connected" notice can confirm an identity to a hostile/coerced counterpart. | Critical | Living↔living → admin-only, **no owner notification, zero detail**; any living-involved match → notifications carry no district/decade/initials; `is_person_living()` fails toward privacy; living **never auto-link**; `meta.privacy:'living_suppressed'` auditable. |
| 4 | **Cross-script true matches systematically missed** (Ibrahim/Abraham Latin vs ابراهيم Arabic) — defeats the >95% goal; no scorecard tuning recovers a pair blocking never emits. | Critical | `transliterate_to_arabic` script-fold in the feature layer; dedicated cross-script blocking pass (P7) + non-name anchor pass; cross-script holdout + `cross_script_recall` CI floor; auto-link gated on holdout recall. |
| 5 | **Incremental staleness bug** — child-table edits (birth year, maiden name, child link) don't bump `persons.updated_at`, silently skipping changed persons and passing the anti-stale guard. | High | Dirty-queue is the **sole** probe source; triggers on all six source tables enqueue affected + dependents; guard = "`match_features_dirty` non-empty after refresh → abort"; weekly full sweep + `count(persons)==count(match_features)` assertion. |
| 6 | **`score_breakdown` is dense cross-tree PII at rest** — one admin/service-role compromise exposes the diaspora linkage graph. | High | Persist **state + points + scalars only**, never raw a/b names/emails/places; re-derive on demand via `score_pair`; admin-only RLS; owner reads only via `match_review_cards`. |
| 7 | **Hostile counterpart owner** gains cross-tree read or a real-world contact on a confirmed link. | High | Link grants **no** auto cross-tree read; relay tokens revocable + rate-limited; owner identities never exposed; **privacy hold** hard-veto; decline-without-disclosure; worst case tested in E2E. |
| 8 | **Blocking miss = unrecoverable false negative** that silently caps accuracy. | High | 7 orthogonal passes incl. cross-script + non-name anchors; trigram safety net (tune 0.45 from the recall harness, not by assertion); recall measured on **dissimilar-but-true** pairs, not string-similar samples. |
| 9 | **Skewed buckets** explode the candidate set / time out the run. | High | `MAX_BLOCK_SIZE=1000` + **per-pass and global pair caps** + intersection sub-blocking; `match_block_skips` audit **with cap alerts**; blocking in-Postgres (no Vercel timeout); `SET LOCAL statement_timeout=0` + per-chunk COMMIT. |
| 10 | **O(n²) / statement-timeout** as data grows. | High | Mandatory blocking before scoring; incremental probe from the dirty queue; chunked ~500/tx commits, resumable via `matching_runs`; advisory single-flight lock (documented key) so pg_cron + Vercel fallback can't double-run. |
| 11 | **Father/mother slotting drifts** between SQL and `resolveParents` (U/X & same-gender partners shift up to 50 pts + wrong grandparent walks). | High | Implement M→father/F→mother/partner1-fallback **verbatim**; parity test explicitly covering U/X and same-gender-partner cases. |
| 12 | **CI accuracy gate never runs** (job hard-gated to the upstream template repo; no pgTAP step). | High | M0 removes the repo guard and adds `supabase test db`; "pgTAP green on a PR" is the M1 exit gate. |
| 13 | **Live-only objects uncommitted** — fresh build breaks before any matching code runs. | High | M0 dumps + commits all of `normalize_arabic`, `arabic_phonetic`, `search_master_tree`, `compute_degrees`, `match_paths`; fresh `db reset` is an M0 exit criterion. |
| 14 | **Admin queue becomes a rubber-stamping firehose.** | Medium | Sort by `confidence_score DESC`, paginate, agree/disagree/missing chips, "defer band" to owner hints, server-side filters; track decision latency via `match_audit`. |
| 15 | **Feedback labels biased to what blocking surfaced** (recall blind spot inherited by v2). | Medium | Inject random high-similarity non-surfaced audit pairs (tagged); keep synthetic known-true pairs as a fixed recall anchor; tag every label with emitting pass + score. |
| 16 | **Overfitting the threshold to the gold set.** | Medium | Frozen holdout (incl. cross-script) never used for tuning; gate metrics reported on holdout; `engine_version` per `run_eval`. |
| 17 | **`pg_cron` plan-gated / wrong schema.** | Medium | M0 asserts the install (Supabase uses schema `cron`/`postgres` DB); trigger-agnostic design falls back to fire-and-forget Vercel-cron / GitHub Actions kicking `run_matching_batch`. |
| 18 | **Email transport adds a secret + failure mode.** | Medium | `RESEND_API_KEY` in Edge secrets only, validated at startup; in-app notification is source of truth; daily digest sweeps unsent; no detail for living-involved matches. |
| 19 | **`num_children` near-universally undercounted** on diaspora branches. | Medium | Treat as weak/asymmetric: award on match, never let Δ veto, **exclude from `score_pct` denominator**. |
| 20 | **Public-tree search already leaks living-person name+birth-year+origin** — engine builds on a leaky base. | Medium | Companion task masks living-person birth-year/origin in public-tree results (scheduled with M0/M3). |

---

## 10. Open Decisions the Founder Must Make

1. **Approve A/B/C?** Deterministic FRS for v1 (Splink as v2); **link-not-merge**; **shadow mode with auto-merge OFF**. *Note explicitly:* this **deviates from the live "Score ≥ 450 auto-merges" schema comment** — we auto-*confirm a reversible link*, never auto-*destroy a row*. *(If the founder insists on literal destructive auto-merge at 450 on day one, this plan does not support it — the objection is on trust/safety grounds.)*
2. **Auto-link precision gate:** confirm **≥99%** band precision (+ ≥95% F1 / ≥95% Arabic-variant recall **and a cross-script recall floor** on holdout) as the bar, plus the **minimum shadow duration** (recommend ≥4 weeks) and **minimum labeled-pair count** in the ≥-threshold band before flipping the switch.
3. **Initial threshold:** keep **450** as the starting *surfacing* hypothesis (with `score_pct ≥ 0.78`, ≥2 clusters incl. a non-patriline corroborator), replaced for *auto-link* by the value the PR curve dictates — confirm we tune the *threshold constant* before touching weights.
4. **Living-person policy:** confirm the absolute rule is **not just "never auto-link" but "never auto-NOTIFY across trees about a living person."** Decide: living↔living matches routed to **admin-only with no owner notification**, or **suppressed entirely** until at least one side opts in.
5. **Owner authority & hostile-counterpart model:** confirm a cross-tree fuse requires **both** owners (or an admin override); owners never see each other's PII or identity (masked card only); a confirmed link grants **no** cross-tree read; owners can set a **do-not-match privacy hold**.
6. **Notification transport:** approve adding **Resend** (a new secret + Edge Function) for email, or defer email and ship in-app notifications only for v1.
7. **Destructive merge (Phase E+):** decide whether admin-initiated true merge is on the roadmap at all, or whether `same_as` links are the permanent representation of the Mother Tree.
8. **Threshold/weight & kill-switch ownership:** who signs off on flipping `auto_merge_enabled` and on any future weight changes — founder, a designated admin, or a two-person rule?
