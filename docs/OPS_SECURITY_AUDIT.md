# Security audit checklist (pre more ID docs)

Working checklist before collecting more real identity documents in production. Do not mark items done without evidence.

## Identity verification

- [ ] Upload path uses signed URLs only (no public bucket listing)
- [ ] Storage RLS: users read/write only their own folder; staff read via `is_admin` / `is_moderator`
- [ ] Admin approve/reject requires `is_admin` (moderators are read-only on decisions)
- [ ] Appeal accept reopens verification as `pending` (does not auto-approve)
- [ ] Access log rows written when staff open verification docs

## Living-person optional fields (D1)

- [ ] Living optional fields writable only by record owner, `person_field_grants`, or admin
- [ ] Grant UI visible only to record owner / admin on living person pages
- [ ] Deceased optional fields still follow tree writer rules

## Access logging

- [ ] Resource types include contact, displacement, story, living person page, verification docs
- [ ] Logging is best-effort (failed insert does not block the view)
- [ ] Staff can SELECT `access_log`; ordinary users cannot

## Soft delete / sessions

- [ ] Soft-deleted profiles cannot keep writing via lingering sessions
- [ ] `protect_profiles_is_admin` blocks self-elevation of `is_admin` and `is_moderator`

## External / internal review

- [ ] Named reviewer (internal or external) and date: _______________
- [ ] Findings tracked with owners and due dates
- [ ] Residual risks accepted in writing by product owner

Leave boxes unchecked until each pass is real.
