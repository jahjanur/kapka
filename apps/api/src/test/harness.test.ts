import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from './database';

let db: TestDatabase;

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

describe('the migrations apply to a real Postgres', () => {
  it('creates every table', async () => {
    const { rows } = await db.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const table of [
      'users',
      'donor_profiles',
      'blood_requests',
      'blood_compatibility',
      'notification_log',
      'audit_log',
      'refresh_tokens',
    ]) {
      expect(tables, table).toContain(table);
    }
  });

  it('seeded exactly the 27 compatibility pairs', async () => {
    const { rows } = await db.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM blood_compatibility',
    );
    expect(rows[0]?.count).toBe('27');
  });

  it('made the compatibility matrix read-only outside migrations', async () => {
    // The guard added in 20260831120300000. Until now it had never run.
    await expect(
      db.pool.query("INSERT INTO blood_compatibility VALUES ('O-', 'AB+')"),
    ).rejects.toThrow(/never edited at runtime/);
  });

  it('enforces the duplicate-notification guarantee', async () => {
    // UNIQUE (request_id, donor_id) — §5.3's protection against emailing the
    // same donor twice for one request.
    const { rows } = await db.pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'notification_log' AND indexdef LIKE '%UNIQUE%'`,
    );
    expect(rows.some((r) => /request_id.*donor_id/.test(r.indexdef))).toBe(true);
  });
});

describe('the schema enforces what it claims', () => {
  it('rejects a unit count outside the CHECK constraint', async () => {
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ('check@seed.test', 'x', 'A') RETURNING id`,
    );
    await expect(
      db.pool.query(
        `INSERT INTO blood_requests (requester_id, blood_type, units_needed, hospital_name, city, contact_phone)
         VALUES ($1, 'O-', 99, 'H', 'Skopje', '+389')`,
        [rows[0]?.id],
      ),
    ).rejects.toThrow(/units_needed/);
  });

  it('treats email as case-insensitive, because it is CITEXT', async () => {
    // "Ana@x" and "ana@x" are one account, which is what makes the UNIQUE
    // constraint mean anything.
    await db.pool.query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ('Ana@Example.test','x','A')`,
    );
    await expect(
      db.pool.query(
        `INSERT INTO users (email, password_hash, full_name) VALUES ('ana@example.test','x','B')`,
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('lets a user be deleted even after moderating a request (§12)', async () => {
    // blood_requests.moderated_by is ON DELETE SET NULL. With the default
    // NO ACTION this delete would be refused and a data-deletion request
    // would fail.
    const { rows: admin } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ('admin@seed.test','x','Admin','admin') RETURNING id`,
    );
    const { rows: requester } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ('req@seed.test','x','R') RETURNING id`,
    );
    await db.pool.query(
      `INSERT INTO blood_requests (requester_id, blood_type, hospital_name, city, contact_phone, moderated_by)
       VALUES ($1,'O-','H','Skopje','+389',$2)`,
      [requester[0]?.id, admin[0]?.id],
    );
    await expect(
      db.pool.query('DELETE FROM users WHERE id = $1', [admin[0]?.id]),
    ).resolves.toBeTruthy();
  });

  it('stops the same donor being logged twice for one request (§5.3)', async () => {
    const { rows: user } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ('dup@seed.test','x','D') RETURNING id`,
    );
    const { rows: request } = await db.pool.query<{ id: string }>(
      `INSERT INTO blood_requests (requester_id, blood_type, hospital_name, city, contact_phone)
       VALUES ($1,'O-','H','Skopje','+389') RETURNING id`,
      [user[0]?.id],
    );
    const insert = () =>
      db.pool.query(
        `INSERT INTO notification_log (request_id, donor_id) VALUES ($1,$2)`,
        [request[0]?.id, user[0]?.id],
      );
    await expect(insert()).resolves.toBeTruthy();
    await expect(insert()).rejects.toThrow(/duplicate key/);
  });
});

describe('the seed script runs against a real schema', () => {
  it('loads donors covering every blood type, and the matching query finds them', async () => {
    // The seed's INSERTs had never met a database either. Running it here
    // checks the SQL and gives the matching query realistic data at once.
    const { seed } = await import('../seed/run');
    const client = await db.pool.connect();
    try {
      await seed(client);
    } finally {
      client.release();
    }

    const { rows } = await db.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM donor_profiles',
    );
    expect(Number(rows[0]?.count)).toBeGreaterThan(30);

    const { rows: types } = await db.pool.query<{ blood_type: string }>(
      'SELECT DISTINCT blood_type FROM donor_profiles ORDER BY blood_type',
    );
    expect(types).toHaveLength(8);

    const { rows: request } = await db.pool.query<{ id: string }>(
      `SELECT id FROM blood_requests WHERE blood_type = 'O-' AND city = 'Skopje' LIMIT 1`,
    );
    const { findMatchingDonors } = await import('../matching/repository');
    const matched = await findMatchingDonors(request[0]?.id ?? '', db.pool);

    // Skopje's O− donors include one at exactly the 56-day boundary and five
    // built to be excluded — see the seed's edge cases.
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.every((d) => d.bloodType === 'O-')).toBe(true);
  });
});
