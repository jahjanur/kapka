import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

/**
 * Starts one PostgreSQL for the entire test run.
 *
 * It used to be one per test file. That worked locally and failed on CI with
 * every test passing and the process still exiting non-zero — five servers
 * starting and stopping is five chances for a teardown error, and an error
 * outside a test fails the run without failing a test. One server has one.
 *
 * Migrations run once, into a template database. Each file then creates its
 * own database from that template, which is a file copy rather than a
 * migration run: isolation without the cost.
 */

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const PORT = 55432;
export const TEMPLATE_DATABASE = 'kapka_template';

let server: EmbeddedPostgres | null = null;
let dataDir = '';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  dataDir = mkdtempSync(join(tmpdir(), 'kapka-pg-'));

  server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'kapka',
    password: 'kapka',
    port: PORT,
    persistent: false,
  });

  await server.initialise();
  await server.start();
  await server.createDatabase(TEMPLATE_DATABASE);

  const templateUrl = `postgresql://kapka:kapka@localhost:${String(PORT)}/${TEMPLATE_DATABASE}`;

  // The real migration tool against the real migration files, once. A
  // migration that does not apply is a failed test run rather than a surprise
  // on deploy.
  execFileSync('npx', ['node-pg-migrate', 'up', '-m', 'migrations', '--no-check-order'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: templateUrl },
    stdio: 'pipe',
  });

  project.provide('postgresPort', PORT);

  return async function teardown() {
    /*
     * Nothing here may throw. A teardown error fails the whole run while every
     * test passes, which is a confusing way to learn that a temp directory was
     * already gone.
     */
    try {
      await server?.stop();
    } catch {
      // The server is going away with the process regardless.
    }
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // A leftover temp directory is the operating system's problem.
    }
  };
}

declare module 'vitest' {
  interface ProvidedContext {
    postgresPort: number;
  }
}

/** Used by the per-file helper to reach the shared server. */
export function adminConnectionString(port: number): string {
  return `postgresql://kapka:kapka@localhost:${String(port)}/postgres`;
}

export { pg };
