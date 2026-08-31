-- Runs once, on an empty data directory, before any migration.
--
-- Extensions have to exist before the schema in §3 can be created:
--   citext  — users.email is CITEXT, so "Ana@x.mk" and "ana@x.mk" are the
--             same account and the UNIQUE constraint actually holds.
--
-- gen_random_uuid() needs no extension on Postgres 13+; it is built in.
CREATE EXTENSION IF NOT EXISTS citext;
