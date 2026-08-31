import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

/**
 * A real PostgreSQL, started for the test run.
 *
 * The matching query in §5.1 is the one piece of logic §13 says has
 * consequences outside the software, and it is entirely SQL — a compatibility
 * join whose direction is easy to get backwards and impossible to check by
 * reading. Testing it against a mock would only assert that the mock agrees
 * with itself.
 *
 * embedded-postgres downloads a real server binary, so this needs no Docker
 * and no service in CI. The schema comes from the actual migrations, run by
 * the actual migration tool, so a migration that does not apply fails here too.
 */
export interface TestDatabase {
  pool: pg.Pool;
  connectionString: string;
  /** Empties the tables the tests own. Reference data is left alone. */
  reset: () => Promise<void>;
  stop: () => Promise<void>;
}

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Ports are per-worker so parallel test files do not collide. */
function pickPort(): number {
  const worker = Number(process.env.VITEST_WORKER_ID ?? '1');
  return 55430 + worker;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const dataDir = mkdtempSync(join(tmpdir(), 'kapka-pg-'));
  const port = pickPort();

  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'kapka',
    password: 'kapka',
    port,
    persistent: false,
  });

  await server.initialise();
  await server.start();
  await server.createDatabase('kapka');

  const connectionString = `postgresql://kapka:kapka@localhost:${String(port)}/kapka`;

  // The real migration tool against the real migration files. A migration
  // that does not apply is a failing test rather than a surprise on deploy.
  execFileSync('npx', ['node-pg-migrate', 'up', '-m', 'migrations', '--no-check-order'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: 'pipe',
  });

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
      await server.stop();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
