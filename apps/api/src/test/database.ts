import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { TEMPLATE_DATABASE } from './globalSetup';

/**
 * A database of this test file's own, on the server started once in
 * globalSetup.
 *
 * Created from a template that already has the migrations applied, so this is
 * a file copy rather than a migration run — isolation between files without
 * paying for the schema each time.
 */
export interface TestDatabase {
  pool: pg.Pool;
  connectionString: string;
  /** Empties the tables the tests own. Reference data is left alone. */
  reset: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const port = inject('postgresPort');
  const name = `kapka_${randomBytes(6).toString('hex')}`;
  const base = `postgresql://kapka:kapka@localhost:${String(port)}`;

  // CREATE DATABASE cannot run inside a transaction, so it gets its own
  // short-lived client rather than the pool.
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DATABASE}`);
  } finally {
    await admin.end();
  }

  const connectionString = `${base}/${name}`;
  const pool = new pg.Pool({ connectionString, max: 4 });

  return {
    pool,
    connectionString,
    async reset() {
      // blood_compatibility is reference data owned by a migration, and its
      // trigger would reject the write anyway.
      await pool.query(
        'TRUNCATE refresh_tokens, audit_log, notification_log, blood_requests, donor_profiles, users RESTART IDENTITY CASCADE',
      );
    },
    async stop() {
      await pool.end();
      // Dropping is optional — the whole server goes at the end of the run —
      // but it keeps a long run from accumulating dozens of databases.
      const cleanup = new pg.Client({ connectionString: `${base}/postgres` });
      try {
        await cleanup.connect();
        await cleanup.query(`DROP DATABASE IF EXISTS ${name}`);
      } catch {
        // Not worth failing a run over.
      } finally {
        await cleanup.end().catch(() => undefined);
      }
    },
  };
}
