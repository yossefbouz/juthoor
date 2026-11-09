# Juthoor — Step 3 Tree Builder Test Plan

> **Status as of 2026-04-17**: Phase 1–4 implemented, 55/55 unit tests green, full flow manually verified against local Supabase.

This document explains **how to run every layer of the Tree Builder locally** — for engineers running the CI suite and for non-technical reviewers who need to click through the app end-to-end.

---

## 0. Prerequisites

- **Docker Desktop** running (for local Supabase)
- **Node.js 22+** and **pnpm**
- **Git** + this repo cloned at `C:\Users\youssefbouz\ancestry\juthoor`

### One-time setup

```bash
cd C:\Users\youssefbouz\ancestry\juthoor
pnpm install
```

---

## 1. Start local Supabase

The project runs entirely against a local Supabase instance (no remote credentials needed).

```bash
cd apps/database
npx supabase start
```

This boots Postgres, Auth, Studio, and REST on ports 54321-54324. First run pulls ~2 GB of images; subsequent runs are fast. All our migrations auto-apply.

**Verify migrations applied:**

```bash
npx supabase migration list --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Expect to see `20260417140000_fix_trees_tree_members_rls_recursion` as the latest entry.

**Seed the 456 Palestinian villages** (one-time, after first `supabase start`):

```bash
# From apps/database directory
cat supabase/seed_villages.sql | docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres
```

**Sanity check:**

```bash
docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres \
  -c "SELECT count(*) FROM places WHERE is_depopulated;"
# Expect: 456
```

```bash
docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres \
  -c "SELECT proname FROM pg_proc WHERE proname='create_person_with_primary_name';"
# Expect: create_person_with_primary_name
```

---

## 2. Run the web app

```bash
cd apps/web
pnpm dev
# → http://localhost:3000
```

Confirm `.env.local` points to local Supabase (not the remote project):

```bash
cat .env.local
# Expect:
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

The remote-project credentials are backed up in `.env.local.remote-backup`.

---

## 3. Create a demo user (30 seconds)

Local Supabase auto-confirms emails, so we bypass the signup email flow:

```bash
curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@juthoor.test","password":"demo-password-1234"}'
```

---

## 4. Manual end-to-end walkthrough

Open http://localhost:3000

### 4.1 Login
1. Click **Log In** in the navbar
2. Fill **Email**: `demo@juthoor.test`, **Password**: `demo-password-1234`
3. Click **Log In** → lands on `/dashboard`

### 4.2 Auto-bootstrap of the default tree
1. Click **"شجرة العائلة"** in the sidebar (or navigate directly to `/tree`)
2. The app should **auto-create** `شجرة عائلتي` and **redirect to `/tree/[treeId]/add-self`** — you should never see an empty tree screen

### 4.3 Add-self wizard
1. You land on the bilingual Arabic/English form. Fields visible:
   - الاسم الأول (بالعربية) — with `?` hint tooltip
   - اسم العائلة (بالعربية)
   - First name (English)
   - Surname (English)
   - الجنس (M/F dropdown — X/U deliberately hidden per Step 3 decision)
   - سنة الميلاد
   - سنة الوفاة
   - القرية / المدينة الأصلية (searchable combobox over the 456 villages)
2. Hover each `?` icon → tooltip appears with bilingual description (FRS requirement)
3. Fill AR=`أحمد` / EN=`Ahmad` etc., birth year `1990`, gender `ذكر`
4. Click the village combobox → type `Jerusalem` → the seeded "Jerusalem / القدس" should appear → pick it
5. Click **حفظ**
6. You should be redirected to `/tree/[treeId]/person/[newId]` — the 360° view

### 4.4 360° view
Verify the rendered layout centred on أحمد:
- **Up:** `الأب — غير معروف — أضفه`  `الأم — غير معروفة — أضفها` (empty placeholders)
- **Centre:** `أحمد البوز` / `Ahmad Bouz` in a highlighted tile
- **Right (RTL-start):** `الأشقاء (0)` → `لا يوجد`
- **Left (RTL-end):** `الزوج/ة (0)` → `لا يوجد`
- **Down:** `الأبناء (0)` → `لم يُضَف أبناء بعد`
- Below the grid: **AddChildForm** visible (because focus is male)

Hover any person tile → Radix HoverCard pops up with year, gender badge.

### 4.5 Add a child (FRS rule 11: mother required)
1. Scroll to `إضافة ابن/ابنة`
2. Fill name=`سامي`, gender=`ذكر`, birth year=`2020`
3. Leave **mother empty** → click حفظ → red validation error: `"يجب ربط كل ابن بأم"`
4. Tick the `أم مؤقتة` checkbox → click حفظ → a placeholder `أنثى 1` is created + linked as Ahmad's wife + linked as Sami's mother
5. Reload; the 360° view now shows Sami in the **Children** slot grouped under أنثى 1

### 4.6 GEDCOM export
1. Back on `/tree/[treeId]` click **تصدير GEDCOM** (top-right)
2. A file `juthoor-tree-<id>.ged` downloads
3. Open it — should be valid GEDCOM 7.0 with `0 HEAD`, `2 VERS 7.0`, `1 SCHMA`, … `0 TRLR` and all your persons/families

### 4.7 GEDCOM import
1. Click **استيراد GEDCOM** → dialog opens
2. Upload any `.ged` file (try re-uploading the one you just exported, or a fixture below)
3. Preview dialog shows counts → click **استيراد**
4. Toast reports "تم استيراد X شخصًا و Y عائلة"
5. Person list refreshes with the new rows

**Fixture for a quick test:**

```
0 HEAD
1 SOUR Juthoor
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Fatima /Qasim/
1 SEX F
1 BIRT
2 DATE 1950
2 PLAC Jerusalem
0 @I2@ INDI
1 NAME Sami /Bouz/
1 SEX M
1 BIRT
2 DATE 1975
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 MARR
2 DATE 1972
0 TRLR
```

Save as `test.ged`, upload through the dialog. Expect: `personsInserted: 2, familiesInserted: 1, eventsInserted: 3, unmatchedPlaces: []`.

---

## 5. Automated test suite

From `apps/web/`:

```bash
# Unit tests (Vitest)
pnpm test
# Expect: Test Files 7 passed, Tests 55 passed

# TypeScript (no runtime errors)
pnpm typecheck
# Expect: silent success

# Linter
pnpm lint
```

### What the 55 unit tests cover

| Test file | Focus | Count |
|---|---|---|
| `lib/tree/__tests__/relationships.test.ts` | 360° neighbour solver — parents/siblings/spouses/childrenByFamily across multi-spouse, placeholder-mother, solo-parent, orphan cases | 9 |
| `lib/tree/__tests__/zodSchemas.test.ts` | AddPerson Zod rules — AR or EN name required, year bounds, death≥birth, UUID validation, M/F-only gender, mother required | 12 |
| `lib/tree/__tests__/inheritance.test.ts` | Surname/village auto-inherit from father, maiden-name display for women, placeholder number scoping | 13 |
| `lib/gedcom/__tests__/parse.test.ts` | GEDCOM 5.5.1/7.0 → snapshot (nuclear, multi-spouse, Arabic UTF-8, error cases) | 11 |
| `lib/gedcom/__tests__/serialize.test.ts` | Snapshot → GEDCOM including **round-trip** (parse → serialize → parse) | 5 |
| `lib/gedcom/__tests__/placeMatching.test.ts` | AR/EN exact + substring match, multi-segment "Jerusalem, Palestine", graceful undefined | 5 |

---

## 6. Database snapshots (what to check with `psql`)

```bash
docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres -c "
SELECT p.display_name_ar, p.display_name_en, p.gender, p.gedcom_xref,
       (SELECT string_agg(given_name || ' /' || COALESCE(surname,'') || '/', ', ')
        FROM person_names WHERE person_id = p.id) as names,
       (SELECT string_agg(event_type || ':' || COALESCE(date_year::text,''), ', ')
        FROM events WHERE person_id = p.id) as events
FROM persons p ORDER BY p.created_at;"
```

---

## 7. Known issues / residual warnings

- React 19 peer-dep warnings from `@radix-ui/react-aspect-ratio@1.1.3`, `rooks`, and `react-no-ssr` — pre-existing, not caused by Step 3.
- `element.ref` deprecation warnings — pre-existing nextbase-starter pattern inside some Radix components. Doesn't affect behaviour.
- `preview_fill` MCP tool sets DOM `.value` but doesn't dispatch change events, so tests that automate the form via that tool must dispatch `input`+`change` manually (see `window.location.reload()` pattern in the verified flow).

---

## 8. Quickly stop everything

```bash
# Stop web dev server — Ctrl+C in its shell
# Stop Supabase
cd apps/database
npx supabase stop
# Data is backed up in docker volumes; next `start` restores it.
```
