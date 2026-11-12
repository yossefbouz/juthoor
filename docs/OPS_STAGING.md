# Ops staging checklist (Wave 2.6+)

Short pre-production checklist before collecting more real identity documents. Do not treat unchecked items as done.

Related deeper checklists:

- [Backup / DR](./OPS_BACKUP_DR.md)
- [Security audit](./OPS_SECURITY_AUDIT.md)
- [NFR checklist](../apps/web/docs/NFR_CHECKLIST.md)

## Staging Supabase project

- [ ] Dedicated staging project (separate from production), with its own URL and anon/service keys in staging env only
- [ ] Migrations applied through `apps/database/supabase/migrations` (including Wave 2 identity / displacement / access_log resource types / appeals)
- [ ] Auth redirect URLs and email templates point at the staging web origin
- [ ] Storage buckets for verification docs and person attachments exist with the same RLS intent as production
- [ ] Staff smoke: admin can open `/admin/verifications`, `/admin/appeals`, `/admin/moderators`
- [ ] Moderator smoke: can read verifications and appeals, cannot approve or resolve

## Registration / verification flow (D10 / D11)

- [ ] `/register/complete` shows PFT "Is this you?" and embedded verification
- [ ] `/verify` still works standalone (including appeal UI on rejected requests)
- [ ] Dashboard banner links unverified users to verification

## Privacy contact

- [ ] Publish a privacy contact email (site footer / privacy page) for data-subject and deletion requests
- [ ] Route that inbox to someone who can act on `deleteAccountAction` soft-deletes and tree-ownership TODOs

## Before more ID docs

- [ ] Complete [OPS_BACKUP_DR.md](./OPS_BACKUP_DR.md) restore drill line
- [ ] Complete [OPS_SECURITY_AUDIT.md](./OPS_SECURITY_AUDIT.md) named review line

Do not invent completed audits here. Leave boxes unchecked until each item is actually done.
