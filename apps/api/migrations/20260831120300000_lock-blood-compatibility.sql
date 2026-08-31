-- Up Migration
--
-- "Seeded once via migration, never edited at runtime" (§3) was a convention
-- with nothing behind it — the API connects as the table's owner and could
-- INSERT, UPDATE or DELETE these rows as freely as any other.
--
-- A GRANT cannot express this: table owners bypass privileges, and giving the
-- API its own restricted role is a deployment change, not a schema one. A
-- trigger works regardless of which role connects.
--
-- Migrations that legitimately need to change the matrix opt in explicitly:
--
--   SET LOCAL kapka.allow_compatibility_write = 'on';
--
-- SET LOCAL, so the permission dies with the transaction and cannot leak into
-- the connection pool.

CREATE FUNCTION block_compatibility_writes() RETURNS TRIGGER AS $$
BEGIN
  IF coalesce(current_setting('kapka.allow_compatibility_write', true), 'off') <> 'on' THEN
    RAISE EXCEPTION
      'blood_compatibility is seeded by migration and never edited at runtime.'
      USING HINT = 'In a migration, first: SET LOCAL kapka.allow_compatibility_write = ''on'';';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blood_compatibility_is_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON blood_compatibility
  FOR EACH ROW EXECUTE FUNCTION block_compatibility_writes();

-- TRUNCATE is not a row-level operation, so it needs its own statement-level
-- trigger — otherwise the one hole left open is the one that empties the
-- whole table at once.
CREATE TRIGGER blood_compatibility_no_truncate
  BEFORE TRUNCATE ON blood_compatibility
  FOR EACH STATEMENT EXECUTE FUNCTION block_compatibility_writes();

-- Down Migration

DROP TRIGGER IF EXISTS blood_compatibility_no_truncate ON blood_compatibility;
DROP TRIGGER IF EXISTS blood_compatibility_is_read_only ON blood_compatibility;
DROP FUNCTION IF EXISTS block_compatibility_writes();
