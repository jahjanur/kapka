-- Up Migration
--
-- Two gaps in the initial schema, found by auditing it against §4 and §12
-- rather than against itself.
--
-- Written as a new migration rather than an edit to the initial one: that
-- file is on main and may already have been applied. A deployed schema is
-- never edited, only migrated.

-- ─── 1. Users must actually be deletable (§12) ────────────────────────────
--
-- blood_requests.moderated_by and audit_log.actor_id were declared with no
-- ON DELETE clause, which defaults to NO ACTION — the foreign key REFUSES the
-- delete. §12 requires every donor to be able to delete their own data, and
-- "deletion is real deletion". As written, any admin who had moderated a
-- request, or any user with a single audit_log row, was undeletable.
--
-- SET NULL rather than CASCADE: the moderation decision and the audit trail
-- are records of what happened and must survive. What goes away is the link
-- to the person, which is exactly what anonymising an audit trail means.

ALTER TABLE blood_requests
  DROP CONSTRAINT IF EXISTS blood_requests_moderated_by_fkey;
ALTER TABLE blood_requests
  ADD CONSTRAINT blood_requests_moderated_by_fkey
  FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

-- ─── 2. Indexes for the endpoints §4 actually describes ───────────────────

-- GET /api/requests/mine — "requests I posted", newest first.
CREATE INDEX idx_requests_mine
  ON blood_requests (requester_id, created_at DESC);

-- The donor dashboard's notification history (§9.5). The UNIQUE constraint on
-- (request_id, donor_id) cannot serve this: donor_id is the second column, so
-- a lookup by donor alone cannot use it.
CREATE INDEX idx_notification_donor
  ON notification_log (donor_id, created_at DESC);

-- The daily job that flips expired requests (§3). Partial, because a request
-- that is already fulfilled, rejected or expired is never a candidate again.
CREATE INDEX idx_requests_expiry
  ON blood_requests (expires_at)
  WHERE status IN ('pending', 'approved');

-- Admin audit views: "what happened to this request", and "what happened
-- recently" (§4, GET /api/admin/stats and the moderation trail).
CREATE INDEX idx_audit_entity
  ON audit_log (entity_type, entity_id);

CREATE INDEX idx_audit_recent
  ON audit_log (created_at DESC);

-- Down Migration

DROP INDEX IF EXISTS idx_audit_recent;
DROP INDEX IF EXISTS idx_audit_entity;
DROP INDEX IF EXISTS idx_requests_expiry;
DROP INDEX IF EXISTS idx_notification_donor;
DROP INDEX IF EXISTS idx_requests_mine;

-- Back to the original behaviour: no ON DELETE clause, so the delete is
-- refused. Rolling this back reintroduces the bug above, which is what a
-- faithful down migration is supposed to do.
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id);

ALTER TABLE blood_requests
  DROP CONSTRAINT IF EXISTS blood_requests_moderated_by_fkey;
ALTER TABLE blood_requests
  ADD CONSTRAINT blood_requests_moderated_by_fkey
  FOREIGN KEY (moderated_by) REFERENCES users(id);
