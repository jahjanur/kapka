import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../test/database';
import { expireStaleRequests } from './expireRequests';

/**
 * Against a real Postgres, because every claim here is one: the partial index
 * this rides, the statuses it must not touch, and the audit row it writes.
 */

let db: TestDatabase;
let sequence = 0;

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.reset();
  sequence = 0;
});

/** A request with an explicit status and expiry. Days are relative to now. */
async function makeRequest(status: string, expiresInDays: number): Promise<string> {
  sequence += 1;
  const { rows: requester } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, 'x', 'Requester', 'requester') RETURNING id`,
    [`requester-${String(sequence)}@example.test`],
  );
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO blood_requests
       (requester_id, blood_type, hospital_name, city, contact_phone, status, expires_at)
     VALUES ($1, 'O-', 'City General', 'Skopje', '+389 70 000 000',
             $2::request_status, now() + ($3 || ' days')::interval)
     RETURNING id`,
    [requester[0]?.id, status, String(expiresInDays)],
  );
  return rows[0]?.id ?? '';
}

const statusOf = async (id: string): Promise<string> => {
  const { rows } = await db.pool.query<{ status: string }>(
    'SELECT status FROM blood_requests WHERE id = $1',
    [id],
  );
  return rows[0]?.status ?? '';
};

describe('the daily expiry job', () => {
  it('expires a request whose window has closed', async () => {
    const id = await makeRequest('approved', -1);
    const result = await expireStaleRequests(db.pool);

    expect(result.expired).toBe(1);
    expect(await statusOf(id)).toBe('expired');
  });

  it('expires one that was never moderated, and says how many', async () => {
    /* A pending request that lapsed is a request nobody answered. Worth
       counting separately: it is a queue that was not worked through. */
    await makeRequest('pending', -2);
    await makeRequest('approved', -2);

    const result = await expireStaleRequests(db.pool);
    expect(result.expired).toBe(2);
    expect(result.werePending).toBe(1);
  });

  it('leaves a request that is still open alone', async () => {
    const id = await makeRequest('approved', 3);
    await expireStaleRequests(db.pool);
    expect(await statusOf(id)).toBe('approved');
  });

  it('never touches a request that was already decided', async () => {
    // Fulfilled and rejected are terminal. Rewriting them to expired would
    // lose what actually happened, and they are not in the index either.
    const fulfilled = await makeRequest('fulfilled', -5);
    const rejected = await makeRequest('rejected', -5);

    await expireStaleRequests(db.pool);
    expect(await statusOf(fulfilled)).toBe('fulfilled');
    expect(await statusOf(rejected)).toBe('rejected');
  });

  it('does nothing twice', async () => {
    // A daily job runs daily. The second run must be a no-op, not a second
    // set of audit rows.
    await makeRequest('approved', -1);
    expect((await expireStaleRequests(db.pool)).expired).toBe(1);
    expect((await expireStaleRequests(db.pool)).expired).toBe(0);

    const { rows } = await db.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_log WHERE action = 'request.expire'`,
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('is quiet when there is nothing to do', async () => {
    expect(await expireStaleRequests(db.pool)).toEqual({ expired: 0, werePending: 0 });
  });

  it('records what happened, and what it was before', async () => {
    /* Without this a request changes state with nothing anywhere saying why,
       and the trail idx_audit_entity exists to serve has a hole in it. */
    const id = await makeRequest('pending', -1);
    await expireStaleRequests(db.pool);

    const { rows } = await db.pool.query<{
      actor_id: string | null;
      metadata: { previousStatus: string };
    }>(
      `SELECT actor_id, metadata FROM audit_log
       WHERE entity_id = $1 AND action = 'request.expire'`,
      [id],
    );
    expect(rows).toHaveLength(1);
    // No actor: this is the system, which is what a nullable actor_id is for.
    expect(rows[0]?.actor_id).toBeNull();
    expect(rows[0]?.metadata.previousStatus).toBe('pending');
  });

  it('can be answered by the index that was built for it', async () => {
    /*
     * idx_requests_expiry is partial — WHERE status IN ('pending','approved')
     * — and exists for this query alone. On a table of three rows Postgres
     * will always prefer a sequential scan, so seqscan is turned off for the
     * length of one transaction to ask the real question: given the choice,
     * can the planner use it? A predicate that drifted out of the index's
     * WHERE clause would answer no, and the job would be a full scan of every
     * request ever posted.
     */
    await makeRequest('approved', -1);
    const client = await db.pool.connect();
    try {
      // SET LOCAL dies with the transaction, so nothing leaks to the pool.
      await client.query('BEGIN');
      await client.query('SET LOCAL enable_seqscan = off');
      const { rows } = await client.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT id, status FROM blood_requests
         WHERE status IN ('pending', 'approved') AND expires_at <= now()`,
      );
      const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
      expect(plan).toContain('idx_requests_expiry');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
