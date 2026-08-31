-- Up Migration
--
-- §12 requires refresh tokens to rotate. Rotation means the old token stops
-- working the moment a new one is issued, and that cannot be expressed in a
-- self-contained token — something has to remember which ones are still
-- valid. §3 has no table for it, so here is one.
--
-- The token itself is opaque random bytes, not a JWT: a JWT refresh token is
-- valid until it expires no matter what the server thinks, which is the exact
-- property rotation needs to not have.

CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- SHA-256 of the token, never the token. A leaked database backup must not
  -- hand over working sessions, for the same reason passwords are hashed.
  token_hash   TEXT NOT NULL UNIQUE,

  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Set when the token is rotated or logged out. A revoked row is kept rather
  -- than deleted: presenting one is how token theft announces itself.
  revoked_at   TIMESTAMPTZ,

  -- The token issued in its place, so a reuse can be traced to a chain.
  replaced_by  UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,

  user_agent   TEXT,
  CHECK (expires_at > created_at)
);

-- Every refresh presents a token and needs the row for it.
CREATE INDEX idx_refresh_lookup ON refresh_tokens (token_hash);

-- "Log out everywhere" and the cleanup job both scan by user and by expiry.
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id, expires_at DESC);
CREATE INDEX idx_refresh_expiry ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;

-- Down Migration

DROP TABLE IF EXISTS refresh_tokens;
