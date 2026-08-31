import pg from 'pg';
import { env } from './env';

/**
 * One pool for the process. Postgres connections are expensive to open, and
 * Render's managed instances cap them fairly low.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export type Queryable = Pick<pg.PoolClient, 'query'>;

/**
 * Runs `work` inside a transaction, rolling back on any throw.
 *
 * Registration creates a user and a donor profile and must do both or neither
 * (§4) — a user with no profile would never match a request and would have no
 * way to say so.
 */
export async function withTransaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
  /*
   * Which pool to borrow from. Defaulting to the module-level one is right in
   * production, where there is only ever one — but it silently ignored an
   * injected pool, so a repository pointed at a test database still wrote to
   * the configured one for every transactional operation. Registration and
   * token rotation, in other words.
   */
  source: pg.Pool = pool,
): Promise<T> {
  const client = await source.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
