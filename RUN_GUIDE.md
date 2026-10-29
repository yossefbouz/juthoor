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

---

## 9. Staging — https://staging.juthoor.app

A hosted copy of Juthoor where the founder and testers can explore the demo data (8 trees, 49 people, 40 pending matches, 4 pending verifications) without the local stack and without touching real families' data. It runs the same code as production on the same VPS, against its own Supabase project, `juthoor-staging`.

| | Production | Staging |
|---|---|---|
| URL | https://juthoor.app | https://staging.juthoor.app (noindex; `robots.txt` disallows everything) |
| Supabase project | `nlufpicjdeeqcgepewdg` | `juthoor-staging`, with its own URL and keys |
| VPS checkout | `/opt/juthoor/app` | `/opt/juthoor/staging` |
| systemd service | `juthoor`, port 3000 | `juthoor-staging`, 127.0.0.1:3001, 1 GB memory cap |
| Web settings | `apps/web/.env.local` in the checkout | the same file in the staging checkout |
| Web deploys | automatic after CI passes on `main` | manual: `scripts/staging/deploy.sh` or the **Deploy staging** workflow |
| Migrations | by hand in the SQL editor | `seed_demo_mock.py --migrate` (runs `supabase db push`) |

**Signing in.** Open https://staging.juthoor.app/login, choose the **Password** tab, and use any account listed in the header of `apps/database/supabase/demo/seed_demo_mock.sql` (start with `admin@juthoor.local`). The password is **not** the local demo password. It is `STAGING_DEMO_PASSWORD` from the maintainer's staging env file, shared privately and never committed.

**No email to real people.** Sign-up is off, so the only accounts are the `@juthoor.local` demo ones. The project also has no custom SMTP: Supabase's built-in mailer delivers only to members of the Supabase organisation and rejects every other address (`email_address_not_authorized`). Use the Password tab, because the OTP tab cannot reach `@juthoor.local`.

### 9.1 One-time setup (done 2026-10-29; repeat only to rebuild from scratch)

1. **Supabase project.** Create `juthoor-staging` in the same organisation and region as production. In its dashboard:
   - Authentication → Sign In / Providers: turn off **Allow new users to sign up**.
   - Authentication → URL Configuration: Site URL `https://staging.juthoor.app`, redirect URL `https://staging.juthoor.app/**`.
   - Leave custom SMTP off.
2. **Secrets file, outside the repo**, for example `%USERPROFILE%\.juthoor\staging.env`. Never commit it or paste it into chat:
   ```
   STAGING_SUPABASE_URL=https://<project-ref>.supabase.co
   STAGING_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   STAGING_SUPABASE_SECRET_KEY=sb_secret_...
   STAGING_DB_URL=<Connect → Session pooler string, keeping [YOUR-PASSWORD] as it is>
   STAGING_DB_PASSWORD=<the database password>
   STAGING_DEMO_PASSWORD=<a new random password for the demo accounts>
   ```
   The secret key and the database password stay on the maintainer's machine. Neither the VPS nor the web app gets them.
3. **Migrations and demo data.** From the repo root, after `pnpm install` (for the Supabase CLI) and `python -m pip install requests pillow "psycopg[binary]"`:
   ```cmd
   python -I apps/database/supabase/demo/seed_demo_mock.py --env-file %USERPROFILE%\.juthoor\staging.env --migrate
   ```
   Expected last line: `trees=8 persons=49 pending_matches=40 pending_verifications=4`. The script refuses the production project and the public local password.
4. **DNS** (Cloudflare, zone `juthoor.app`): `staging` A `80.241.218.49` and AAAA `2a02:c207:2325:285::1`, DNS only (grey cloud) like the apex. Caddy obtains the certificate itself.
5. **VPS, as root, once.** Adds the `juthoor-staging` unit, a sudoers rule that lets `juthoor` restart it, and the Caddy site. Production's unit and site block stay as they are; the Caddyfile is backed up and validated before Caddy reloads.
   ```cmd
   scp scripts/staging/setup-vps.sh yousef@80.241.218.49:/tmp/
   ssh -t yousef@80.241.218.49 "sudo bash /tmp/setup-vps.sh"
   ```
6. **Web settings on the VPS, once.** `/opt/juthoor/staging/apps/web/.env.local` (owner `juthoor`, mode 600) holds only public values. Next.js bakes them into the build, which is why staging has its own checkout:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   NEXT_PUBLIC_SITE_URL=https://staging.juthoor.app
   ```
   `deploy.sh` refuses to build if this file mentions the production project or another site URL.
7. **First build:** the web redeploy below. It clones `/opt/juthoor/staging` if it is missing.

### 9.2 Redeploy

**Web app.** Builds `origin/main`, or the branch or tag you name, restarts `juthoor-staging` and checks that it answers. From the repo root in cmd or Git Bash (PowerShell has no `<` redirection):

```cmd
ssh -i %USERPROFILE%\.ssh\juthoor_deploy juthoor@80.241.218.49 "bash -s" < scripts/staging/deploy.sh
ssh -i %USERPROFILE%\.ssh\juthoor_deploy juthoor@80.241.218.49 "bash -s -- feat/my-branch" < scripts/staging/deploy.sh
```

Or on GitHub: **Actions → Deploy staging → Run workflow**, then pick the ref.

**Database.** Run this after new migrations land on `main`, or to give testers a fresh demo. It resets only the `@juthoor.local` data:

```cmd
python -I apps/database/supabase/demo/seed_demo_mock.py --env-file %USERPROFILE%\.juthoor\staging.env --migrate
```

`--migrate` runs `supabase db push`, which applies only the migrations staging has not seen yet; they are recorded in `supabase_migrations.schema_migrations`. When a change needs both, run the database step before the web redeploy. To change the demo password, edit `STAGING_DEMO_PASSWORD` and run the seed again.

### 9.3 Troubleshooting

| Symptom | Fix |
|---|---|
| 502 from staging.juthoor.app | `juthoor-staging` is down. Redeploy (9.2), or as root run `systemctl status juthoor-staging` and `journalctl -u juthoor-staging -n 100` |
| Pages load but every Supabase call fails | Free-plan projects pause after a week of low activity (Supabase emails a warning first). Resume `juthoor-staging` from the Supabase dashboard |
| A demo account's password is rejected | Use the `STAGING_DEMO_PASSWORD` the seed last ran with; re-running the seed (9.2) resets every demo account to it |
| A second tab does not refresh live | No migration adds `persons`, `families`, `family_children` or `person_names` to the `supabase_realtime` publication, so a fresh project sends no live tree updates |
