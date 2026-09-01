-- Up Migration
--
-- What lets a donor actually become verified.
--
-- users.email_verified has existed since the initial schema, and the matching
-- query in §5.1 already refuses anyone whose flag is FALSE — but nothing in
-- the system could ever set it to TRUE. Every donor who has ever registered is
-- therefore permanently outside the notification pool. This is the missing
-- half.
--
-- Modelled on refresh_tokens on purpose: the token is opaque random bytes and
-- only its SHA-256 is stored. A verification link is a bearer credential that
-- flips a flag on somebody's account, so a leaked database backup must not
-- hand over a working one.

CREATE TABLE email_verification_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- SHA-256 of the token, never the token. UNIQUE both because a collision
  -- would be a second key to an account and because it is the lookup index --
  -- every verification presents a token and needs the row for it, so no
  -- separate index on this column is needed.
  token_hash   TEXT NOT NULL UNIQUE,

  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Set when the link is spent. The row is kept rather than deleted so that a
  -- donor clicking their own link a second time can be told apart from someone
  -- presenting a token that never existed -- one of those is a person who
  -- double-tapped and deserves to be told they are confirmed.
  consumed_at  TIMESTAMPTZ,

  CHECK (expires_at > created_at)
);

-- Two readers: the resend cooldown, which wants the newest token for a user,
-- and consuming one, which invalidates that user's outstanding siblings.
CREATE INDEX idx_verification_user
  ON email_verification_tokens (user_id, created_at DESC);

-- Down Migration

DROP TABLE IF EXISTS email_verification_tokens;
