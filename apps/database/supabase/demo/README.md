# Local admin demo (mock data)

A local copy of Juthoor with realistic fake families, a full match-review queue
and pending identity verifications — safe to click Approve / Reject / Merge on
camera. Nothing here touches juthoor.app.

> Run it from `C:\Users\youssefbouz\ancestry\juthoor-local` — the `D:` drive is
> exFAT and pnpm cannot install there (no symlink support).

## Before recording

1. Start **Docker Desktop** and wait until it is running.
2. Start the local database:
   ```
   cd C:\Users\youssefbouz\ancestry\juthoor-local\apps\database
   npx supabase start
   ```
3. Reset the mock data (re-run any time to get a fresh, full queue):
   ```
   cd C:\Users\youssefbouz\ancestry\juthoor-local
   python -I apps/database/supabase/demo/seed_demo_mock.py
   ```
   Expected last line: `trees=8 persons=49 pending_matches=40 pending_verifications=4`
4. Start the web app:
   ```
   cd C:\Users\youssefbouz\ancestry\juthoor-local\apps\web
   pnpm dev
   ```
5. Open http://localhost:3000/login → **Password** tab → sign in with
   `admin@juthoor.local` (password is in the header of `seed_demo_mock.sql`).

## Demo path

| Step | URL | What to show |
|---|---|---|
| 1 | `/admin/review` | Queue sorted by confidence; green/grey/red field chips |
| 2 | first card (Khalil ↔ Khalil, 227) | **Merge** — deceased pair, links immediately |
| 3 | Khalil ↔ Yousef (207) | type a note "Brothers, not the same person" → **Reject** |
| 4 | Abdullah ↔ Abdallah (142, spouse ✕) | **Defer to owners** — both owners get a notification |
| 5 | Sami ↔ Sami (LIVING) | button reads "Approve (needs both owners)" — privacy rule |
| 6 | `/admin/verifications` | open **ID document** (watermarked MOCK), **Approve** Rania → she becomes editor of Omar's tree |

Tips: record in Arabic (the default) — in English the admin pages flash Arabic on
load. Don't click "Mark all read" in the bell (it shows every user's notifications).

## Staging

The same data runs on https://staging.juthoor.app, a hosted copy for the founder
and testers. There the accounts share a private password instead of the one in
`seed_demo_mock.sql`. To reset it, run the seed with `--env-file`; see
**RUN_GUIDE.md §9** for setup and redeploys.
