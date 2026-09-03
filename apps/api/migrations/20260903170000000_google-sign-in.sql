-- Sign in with Google (§9.2).
--
-- Two changes: somewhere to record that an account belongs to a provider
-- subject, and permission for an account to have no password at all.

-- Up Migration

-- An enum rather than free text, for the same reason user_role is one: the
-- set is small, closed, and known. Adding Apple later is one ALTER TYPE.
CREATE TYPE identity_provider AS ENUM ('google');

CREATE TABLE user_identities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    identity_provider NOT NULL,
  -- The provider's own immutable id for the person ("sub"). Never the email:
  -- an email can be reassigned by its domain owner, and Google says plainly
  -- that sub is the only claim safe to key an account on.
  subject     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One account per provider subject. This is the uniqueness that makes the
  -- callback idempotent: a second sign-in finds the row rather than making
  -- another user.
  UNIQUE (provider, subject),
  -- And one identity per provider per user, so an account cannot accumulate
  -- two Google logins.
  UNIQUE (user_id, provider)
);

-- The lookup on the way to deleting a user, and for showing somebody what is
-- linked to their account.
CREATE INDEX idx_user_identities_user ON user_identities (user_id);

-- A Google account has no password, and inventing one — a random string
-- nobody knows — would leave a bcrypt hash on the row that says the account
-- has a password when it does not.
--
-- There is deliberately no CHECK enforcing "at least one credential". A CHECK
-- constraint cannot see another table, and the rule spans users and
-- user_identities. It lives in the application, in the callback and in the
-- login route, which are the only two places that can create this state.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS idx_user_identities_user;
DROP TABLE IF EXISTS user_identities;
DROP TYPE IF EXISTS identity_provider;

-- Restoring NOT NULL needs a value for every account that signed up with
-- Google. This is not a hash of anything — bcrypt.compare rejects it as
-- malformed, so no password can ever match it and the account is locked
-- rather than opened by rolling back.
UPDATE users SET password_hash = 'locked:no-password' WHERE password_hash IS NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
