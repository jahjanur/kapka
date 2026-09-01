-- Up Migration
--
-- A donor may delete their account, and §12 means it: real deletion, not a
-- flag. Everything that is theirs goes with them — the profile, the sessions,
-- the verification tokens, the requests they posted and the phone number on
-- them, all by CASCADE.
--
-- The notification log is the exception, and it is anonymised rather than
-- deleted. The row is not really about the donor: it is the record of an
-- email this system sent, and two things depend on it after they leave.
--
--   The daily budget. dispatch counts today's sent rows against SendGrid's
--   free tier before deciding how many donors to contact. Rows disappearing
--   would make that count read low, and the system would send past the
--   ceiling — silently failing to reach donors who are still here, on the
--   day somebody needed blood.
--
--   The record that an email was sent at all. "We emailed 40 donors" has to
--   stay true afterwards.
--
-- What goes is the link to the person. That is what anonymising an
-- operational log means, and it is the same reasoning as the SET NULL on
-- audit_log.actor_id and blood_requests.moderated_by.

ALTER TABLE notification_log ALTER COLUMN donor_id DROP NOT NULL;

ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_donor_id_fkey;
ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_donor_id_fkey
  FOREIGN KEY (donor_id) REFERENCES users(id) ON DELETE SET NULL;

-- UNIQUE (request_id, donor_id) is unaffected in the way that matters:
-- Postgres treats NULLs as distinct, so several anonymised rows may exist for
-- one request, while the constraint still stops a live donor being emailed
-- twice about the same one.

-- Down Migration

-- Anonymised rows have no donor to restore, so they cannot survive a column
-- that is NOT NULL again. They are deleted rather than blocking the rollback:
-- the alternative is a migration that cannot be undone on any database where
-- somebody has left.
DELETE FROM notification_log WHERE donor_id IS NULL;

ALTER TABLE notification_log
  DROP CONSTRAINT IF EXISTS notification_log_donor_id_fkey;
ALTER TABLE notification_log
  ADD CONSTRAINT notification_log_donor_id_fkey
  FOREIGN KEY (donor_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notification_log ALTER COLUMN donor_id SET NOT NULL;
