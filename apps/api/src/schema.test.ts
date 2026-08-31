import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A manifest of what the schema must contain (§3, §4). Checked against the up
 * sections of every migration, so it does not matter which file creates an
 * object — only that something does.
 *
 * This is a guard against silent loss: deleting a CREATE INDEX line is easy to
 * do and impossible to notice until a query gets slow in production.
 */

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Everything before "-- Down Migration"; the down section only drops things. */
function upSections(): string {
  return migrationFiles()
    .map((file) => {
      const sql = readFileSync(migrationsDir + file, 'utf8');
      const downAt = sql.indexOf('-- Down Migration');
      return downAt === -1 ? sql : sql.slice(0, downAt);
    })
    .join('\n');
}

const TABLES = [
  'users',
  'donor_profiles',
  'blood_requests',
  'blood_compatibility',
  'notification_log',
  'audit_log',
];

const ENUMS = [
  'user_role',
  'blood_type',
  'request_status',
  'urgency_level',
  'notification_status',
];

const INDEXES = [
  // §3
  'idx_donor_match',
  'idx_requests_feed',
  'idx_requests_city',
  // §4 endpoints that would otherwise sequential-scan
  'idx_requests_mine',
  'idx_notification_donor',
  'idx_requests_expiry',
  'idx_audit_entity',
  'idx_audit_recent',
];

describe('schema manifest', () => {
  const sql = upSections();

  it.each(TABLES)('creates the %s table', (table) => {
    expect(sql).toMatch(new RegExp(`CREATE TABLE ${table}\\b`));
  });

  it.each(ENUMS)('creates the %s enum', (name) => {
    expect(sql).toMatch(new RegExp(`CREATE TYPE ${name} AS ENUM`));
  });

  it.each(INDEXES)('creates the %s index', (name) => {
    expect(sql).toMatch(new RegExp(`CREATE INDEX ${name}\\b`));
  });

  it('creates the citext extension before users needs it', () => {
    // users.email is CITEXT. Managed Postgres never runs the Docker init
    // script, so the migration has to do this itself or the first production
    // deploy fails on the very first table.
    const extensionAt = sql.indexOf('CREATE EXTENSION IF NOT EXISTS citext');
    const usersAt = sql.indexOf('CREATE TABLE users');
    expect(extensionAt).toBeGreaterThanOrEqual(0);
    expect(extensionAt).toBeLessThan(usersAt);
  });

  it('names every index uniquely', () => {
    // A duplicate CREATE INDEX only fails when the migration is finally run.
    const names = [...sql.matchAll(/CREATE INDEX (\w+)/g)].map((m) => m[1]);
    expect(names).toEqual([...new Set(names)]);
  });

  it('guards duplicate notifications with a unique constraint', () => {
    // §5.3 — THE protection against emailing the same donor twice.
    expect(sql).toMatch(/UNIQUE \(request_id, donor_id\)/);
  });
});

describe('users can actually be deleted (§12)', () => {
  const sql = upSections();

  it.each([
    ['blood_requests_moderated_by_fkey', 'a moderator'],
    ['audit_log_actor_id_fkey', 'anyone with an audit entry'],
  ])('%s sets null on delete, so %s is not undeletable', (constraint) => {
    // Declared with no ON DELETE, a foreign key defaults to NO ACTION and
    // refuses the delete outright. SET NULL keeps the record and drops the
    // link to the person — which is what anonymising a trail means.
    const pattern = new RegExp(
      `ADD CONSTRAINT ${constraint}[\\s\\S]{0,160}?ON DELETE SET NULL`,
    );
    expect(sql).toMatch(pattern);
  });

  it('cascades the things that genuinely belong to the user', () => {
    // A donor profile has no meaning without its user, unlike an audit row.
    expect(sql).toMatch(
      /user_id\s+UUID PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/,
    );
  });
});
