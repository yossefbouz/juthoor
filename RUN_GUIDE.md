# Juthoor — Run Guide (every command you need)

> **Last verified: 2026-04-18.** Step 3 is fully functional end-to-end: auto-bootstrap tree, AddPerson with bilingual tooltips, AddChild with mother validation + placeholder flow, 360° view with framer-motion, GEDCOM import/export (round-trip safe, collision-free), full-tree chart via `relatives-tree`, Supabase Realtime subscription.
>
> **Test status:** 64/64 Vitest green, `tsc --noEmit` clean.

---

## 0. One-time prerequisites (skip if already done)

| Tool | Install |
|---|---|
| **Docker Desktop** | https://www.docker.com/products/docker-desktop/ |
| **Node.js 22+** | https://nodejs.org/ (check with `node -v`) |
| **pnpm** | `npm install -g pnpm` |

Open Docker Desktop once and let it finish initialising (system-tray icon turns green).

---

## 1. Start everything — cold boot from scratch

Open **three terminals** in `C:\Users\youssefbouz\ancestry\juthoor`.

### Terminal A — Supabase

```cmd
cd apps\database
npx supabase start
```

First run pulls ~2 GB of Docker images (~5-10 min). Subsequent runs take ~30-60 s.

When done you'll see a table ending with:
```
Studio: http://127.0.0.1:54323
Database: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

**Seed the 456 Palestinian villages** (one-time per fresh DB):

```cmd
cat supabase\seed_villages.sql | docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres
```

Expected output: `INSERT 0 456`.

**Sanity check** (one-liner):

```cmd
docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres -c "SELECT (SELECT count(*) FROM places) AS villages, (SELECT proname FROM pg_proc WHERE proname='create_person_with_primary_name') AS rpc;"
```

Should return `villages=456, rpc=create_person_with_primary_name`.

### Terminal B — Web app

Copy env examples and set keys (local values come from `npx supabase status`):

```cmd
copy .env.local.example apps\web\.env.local
```

Required in `apps/web/.env.local` (and root examples):

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Local: `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Service-role key. Needed for account closure (`deleteAccountAction` → Auth `admin.deleteUser` and archive-vault writes). Never prefix with `NEXT_PUBLIC_`. Never commit a real value. |

```cmd
cd apps\web
pnpm install          # first time only
pnpm dev
```

Visit http://localhost:3000.

### Terminal C — (optional) Tests & watches

```cmd
cd apps\web
pnpm test             # one-off
pnpm test:watch       # live
pnpm typecheck        # tsc --noEmit
pnpm lint             # oxlint
```

---

## 2. Create / recreate the demo user

Local Supabase auto-confirms emails, so there's no inbox step:

```cmd
curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" ^
  -H "apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"demo@juthoor.test\",\"password\":\"demo-password-1234\"}"
```

Auth confirmation mail locally is captured by **Inbucket** (Supabase CLI): open http://127.0.0.1:54324 . Product notification email is queued in `email_outbox` (admin: `/admin/email-outbox`) for a future Resend worker — Auth is not used for those.

If the user already exists you'll get `{"code":"user_already_exists",...}` — that's fine, just log in with the same credentials.

---

## 3. Click-through end-to-end (verified 2026-04-18)

### Phase 1 — Auto-bootstrap

1. http://localhost:3000/login → `demo@juthoor.test` / `demo-password-1234`
2. Click sidebar **شجرة العائلة** (or visit `/tree`)
3. App auto-creates a tree named **شجرة عائلتي** and redirects to `/tree/<id>/add-self`

### Phase 2 — Add-self + AddChild with mother validation ✅

1. On the `/add-self` wizard: hover any `?` icon → see bilingual Arabic/English tooltip
2. Fill AR given = `أحمد`, AR surname = `البوز`, EN given = `Ahmad`, EN surname = `Bouz`, gender `ذكر`, birth year `1990`
3. Click village combobox → type `Jerusalem` → pick **Jerusalem / القدس**
4. Submit → redirected to `/tree/<id>/person/<newId>` — the 360° view centred on Ahmad
5. Scroll to **إضافة ابن/ابنة**. Fill `كريم`, gender `ذكر`, year `2018`, leave mother blank, **do not** tick أم مؤقتة → click حفظ
6. Verify: URL unchanged, no person created (Zod schema rejects silently — the client side form won't fire the action)
7. Tick the **أم مؤقتة** checkbox → click حفظ → success toast, page refreshes with 1 spouse (`أنثى 1`) and 1 child (`كريم`)

DB check:

```cmd
docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres -c "SELECT display_name_ar, gender, notes FROM persons ORDER BY created_at;"
```

Expect Ahmad, then `أنثى 1` with `notes=placeholder`, then `كريم`.

### Phase 3 — 360° view

On `/tree/<id>/person/<personId>` you see 5 slots (Parents up, Siblings right in RTL, Spouses left, Children down, Focus center) with framer-motion `layoutId` transitions. Click any tile to recenter; hover for the bilingual summary card.

### Phase 4 — GEDCOM export + import ✅

**Export** — click **تصدير GEDCOM** (top of tree landing). Browser downloads `juthoor-tree-<id>.ged` with valid GEDCOM 5.5.1 (unique xrefs; collision-free even when some rows came from an earlier import).

**Import** — click **استيراد GEDCOM** → pick any `.ged` file up to 5 MB → Import → dialog reports counts (persons, families, events, unmatchedPlaces).

Sample fixture — save as `test.ged` and upload:

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

Expected: `personsInserted: 2, familiesInserted: 1, eventsInserted: 3, unmatchedPlaces: []`.

### Phase 5 — Full chart + Realtime ✅

1. On tree landing click **المخطط الكامل** → `/tree/<id>/chart`
2. Chart renders with SVG connector lines and tile nodes (placeholder persons get a dashed amber border)
3. Ctrl + mouse-wheel to zoom, click-and-drag to pan; `+` / `−` buttons adjust zoom in 10% steps
4. Click any node → jump to its 360° view
5. Realtime: open `/tree/<id>/person/<someone>` in two browser tabs, edit in A → after ≤ 2 s tab B refreshes automatically

---

## 4. Run just the tests (no UI)

```cmd
cd apps\web
pnpm test
```

Current coverage:

| File | Tests | Focus |
|---|---|---|
| `lib/tree/__tests__/relationships.test.ts` | 9 | 360° solver |
| `lib/tree/__tests__/zodSchemas.test.ts` | 12 | AddPerson form rules |
| `lib/tree/__tests__/inheritance.test.ts` | 13 | father-inherits-surname/village, maiden display |
| `lib/tree/__tests__/toRelativesTree.test.ts` | 7 | chart adapter |
| `lib/gedcom/__tests__/parse.test.ts` | 11 | GEDCOM → snapshot |
| `lib/gedcom/__tests__/serialize.test.ts` | 5 | snapshot → GEDCOM + round-trip |
| `lib/gedcom/__tests__/placeMatching.test.ts` | 5 | village fuzzy matching |
| `lib/gedcom/__tests__/xrefCollision.test.ts` | 2 | export xref uniqueness (regression) |
| **Total** | **64** | |

---

## 5. Useful psql one-liners

```cmd
REM Every person in every tree
docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres -c "SELECT p.display_name_ar, p.display_name_en, p.gender, p.notes, t.name AS tree FROM persons p JOIN trees t ON t.id = p.tree_id ORDER BY t.name, p.created_at;"

REM Families with both partners resolved
docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres -c "SELECT f.id, (SELECT display_name_ar FROM persons WHERE id = f.partner1_id) AS p1, (SELECT display_name_ar FROM persons WHERE id = f.partner2_id) AS p2 FROM families f;"

REM Wipe everything (careful)
docker exec -i supabase_db_nextbase-oss-starter psql -U postgres -d postgres -c "TRUNCATE family_children, events, person_names, families, persons, tree_members, trees RESTART IDENTITY CASCADE;"
```

---

## 6. Stop everything

```cmd
REM Stop dev server: Ctrl+C in its terminal

REM Stop Supabase containers (data survives in docker volumes)
cd apps\database
npx supabase stop

REM To also wipe local DB data:
npx supabase stop --no-backup
```

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `failed to inspect service: error during connect ... dockerDesktopLinuxEngine` | Docker Desktop isn't running | Launch Docker Desktop and wait for system-tray icon |
| `No claims found` after login | Session cookie lost during HMR | Log in again at `/login` |
| `infinite recursion detected in policy for relation "trees"` | Running against a DB that never got `20260417140000_fix_trees_tree_members_rls_recursion.sql` | Apply the migration. On local: `npx supabase db reset` re-applies everything. On remote: paste the SQL into Supabase SQL Editor |
| `Export ensureUserHasDefaultTree doesn't exist` | Stale HMR bundle | Hard reload (`Ctrl+Shift+R`) |
| Village combobox is empty | `seed_villages.sql` wasn't run against fresh DB | Run the psql seed command from §1 |
| Import says "Body exceeds the 5 MB limit" | GEDCOM file > 5 MB | Trim the file or raise `MAX_UPLOAD_BYTES` in `apps/web/src/app/api/tree/[treeId]/gedcom/route.ts` |
| Chart renders but nodes overlap | Relatives-tree needs at least one person as `rootPersonId` | Chart route picks the oldest person automatically; if none exist you see the "add a person first" empty state |

---

## 8. Environment toggle: local ↔ remote Supabase

`apps/web/.env.local` currently points to local. To flip to the hosted project `nlufpicjdeeqcgepewdg`:

```
NEXT_PUBLIC_SUPABASE_URL=https://nlufpicjdeeqcgepewdg.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_kg2Ms9qGwZyLk_UdygX0_g_L8Hyg9X4
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

A backup with those values lives at `apps/web/.env.local.remote-backup`.

Remote is already migrated through `20260417140000` and has 263 seeded villages. To push future migrations to remote without the Supabase CLI link, use the Management API helper pattern documented in `apps/database/README.md` (or ask me — I'll apply it with the Management API token).
