# Backup and disaster recovery checklist

Working checklist. Leave boxes unchecked until each item is actually done.

## Database backups (Supabase)

- [ ] Production project has automated backups enabled (plan tier confirmed)
- [ ] Staging project has automated backups enabled
- [ ] Point-in-time recovery window documented (hours / days available on the plan)
- [ ] Know which roles can trigger a restore in the Supabase dashboard
- [ ] Last successful restore drill date: _______________
- [ ] Restore drill notes (who, duration, issues): _______________

## Storage objects

- [ ] `verification-docs` bucket backup / export policy known (included in project backup or separate)
- [ ] Person attachments bucket policy known
- [ ] Soft-deleted / archived identity docs retention period written down

## Application recovery

- [ ] Vercel (or host) redeploy from main works without local secrets
- [ ] Env vars inventory exists for staging and production (URL, anon, service role, site URL)
- [ ] Auth redirect URLs documented for each environment
- [ ] After restore: re-run migration status check (`supabase migration list` or dashboard)

## Data-subject / account delete

- [ ] Soft-delete path (`deleteAccountAction`) verified against a staging account
- [ ] Archive vault / hard-delete path (if enabled) has a documented operator runbook
- [ ] Privacy contact can reach whoever runs restores and deletes

Do not invent completed drills. Update this file when a restore actually happens.
