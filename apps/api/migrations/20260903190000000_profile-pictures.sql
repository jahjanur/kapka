-- Profile pictures (§9.5).
--
-- A table of its own rather than a column on users, because every query in
-- the product that touches a user selects USER_COLUMNS — and an image on that
-- row is bytes dragged through the login path, the matching query and the
-- admin queue to be thrown away each time.

-- Up Migration

CREATE TABLE user_avatars (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- The image itself. Small by construction: the browser resizes to a square
  -- thumbnail before it ever leaves the device, and the API refuses anything
  -- past AVATAR_MAX_BYTES whatever a caller claims.
  image         BYTEA NOT NULL,
  -- Sniffed from the bytes by the API, never taken from the request's own
  -- Content-Type. It is what the image is served back as, and a caller who
  -- could choose it could choose text/html.
  content_type  TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ON DELETE CASCADE above is load-bearing, not decoration: deleteUser is a
-- single DELETE FROM users and relies entirely on cascades to take everything
-- of a person's with it (§12). A picture left behind would be exactly the kind
-- of thing a deletion is supposed to remove.

-- Down Migration

DROP TABLE IF EXISTS user_avatars;
