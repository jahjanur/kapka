-- Up Migration
--
-- The schema from §3 of the development plan, in full.
--
-- Never edit a deployed schema by hand. Every change is a new migration, so
-- local, staging and production can always be derived from the same history.

-- users.email is CITEXT so "Ana@x.mk" and "ana@x.mk" are one account and the
-- UNIQUE constraint actually holds. Created here rather than relying on the
-- Docker init script, because managed Postgres (Render) never runs that.
CREATE EXTENSION IF NOT EXISTS citext;

-- ─── Enumerations ─────────────────────────────────────────────────────────
-- These mirror packages/shared/src/domain.ts and bloodType.ts. Adding a value
-- means changing both, in the same commit.
CREATE TYPE user_role AS ENUM ('donor', 'requester', 'admin');
CREATE TYPE blood_type AS ENUM ('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'fulfilled', 'expired');
CREATE TYPE urgency_level AS ENUM ('routine', 'urgent', 'critical');
CREATE TYPE notification_status AS ENUM ('queued', 'sent', 'failed', 'bounced');

-- ─── Users ────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,              -- bcrypt, cost factor 12
  role            user_role NOT NULL DEFAULT 'donor',
  full_name       TEXT NOT NULL,
  phone           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Donor profiles ───────────────────────────────────────────────────────
CREATE TABLE donor_profiles (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blood_type          blood_type NOT NULL,
  city                TEXT NOT NULL,
  last_donation_date  DATE,                            -- NULL = never donated
  is_available        BOOLEAN NOT NULL DEFAULT TRUE,   -- donor-controlled pause switch
  notify_by_email     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The index the matching query in §5.1 rides on. Partial, because an
-- unavailable donor is never a candidate and does not belong in the index.
CREATE INDEX idx_donor_match ON donor_profiles (city, blood_type)
  WHERE is_available = TRUE;

-- ─── Blood requests ───────────────────────────────────────────────────────
CREATE TABLE blood_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blood_type      blood_type NOT NULL,        -- the type the PATIENT needs
  units_needed    SMALLINT NOT NULL DEFAULT 1 CHECK (units_needed BETWEEN 1 AND 10),
  urgency         urgency_level NOT NULL DEFAULT 'urgent',
  hospital_name   TEXT NOT NULL,
  hospital_lat    NUMERIC(9, 6),
  hospital_lng    NUMERIC(9, 6),
  city            TEXT NOT NULL,
  contact_phone   TEXT NOT NULL,
  note            TEXT CHECK (char_length(note) <= 500),
  status          request_status NOT NULL DEFAULT 'pending',
  moderated_by    UUID REFERENCES users(id),
  moderated_at    TIMESTAMPTZ,
  reject_reason   TEXT,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_requests_feed ON blood_requests (status, created_at DESC);
CREATE INDEX idx_requests_city ON blood_requests (city, status);

-- ─── Compatibility matrix ─────────────────────────────────────────────────
-- Data, not code (§3). Seeded by the next migration, never written at runtime.
CREATE TABLE blood_compatibility (
  recipient_type  blood_type NOT NULL,   -- what the patient needs
  donor_type      blood_type NOT NULL,   -- who can give to them
  PRIMARY KEY (recipient_type, donor_type)
);

-- ─── Notification log ─────────────────────────────────────────────────────
CREATE TABLE notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES blood_requests(id) ON DELETE CASCADE,
  donor_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        notification_status NOT NULL DEFAULT 'queued',
  provider_id   TEXT,                          -- SendGrid message id
  error_message TEXT,
  attempts      SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ,

  -- THE guarantee against duplicate emails (§5.3). The row is inserted before
  -- SendGrid is called; a unique violation means "already notified", which is
  -- a skip, not an error.
  UNIQUE (request_id, donor_id)
);

-- ─── Audit log ────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     UUID REFERENCES users(id),
  action       TEXT NOT NULL,       -- 'request.approve', 'user.role_change', ...
  entity_type  TEXT NOT NULL,
  entity_id    UUID,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── updated_at maintenance ───────────────────────────────────────────────
-- Beyond §3, which declares updated_at columns but nothing that moves them.
-- A DEFAULT only fires on INSERT, so without this the column would say
-- "created" while claiming to say "updated" — worse than not having it.
CREATE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER donor_profiles_set_updated_at
  BEFORE UPDATE ON donor_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TRIGGER IF EXISTS donor_profiles_set_updated_at ON donor_profiles;
DROP TRIGGER IF EXISTS users_set_updated_at ON users;
DROP FUNCTION IF EXISTS set_updated_at();

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS notification_log;
DROP TABLE IF EXISTS blood_compatibility;
DROP TABLE IF EXISTS blood_requests;
DROP TABLE IF EXISTS donor_profiles;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS notification_status;
DROP TYPE IF EXISTS urgency_level;
DROP TYPE IF EXISTS request_status;
DROP TYPE IF EXISTS blood_type;
DROP TYPE IF EXISTS user_role;

-- citext is deliberately left in place: other things may depend on it, and
-- dropping an extension is not this migration's business.
