import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
/* Type-only, so it is erased and does not import the API before the
   environment below is set — which the value imports must wait for. */
import type { Mailer } from '../../apps/api/src/notify/mailer';

/**
 * The API and its database, for the end-to-end tests.
 *
 * Everything here is the real thing: the real Express app with its real
 * middleware, the real migrations against a real PostgreSQL, the real
 * matching query, the real dispatch, the real email templates.
 *
 * One seam is replaced — the SMTP socket. The mailer writes each message to a
 * file instead, so a test can read what was sent and to whom. That is a
 * deliberate choice rather than a shortcut: a test that needs a mail catcher
 * running is a test that fails on a laptop where it is not, and what these
 * tests need to establish is which donors were emailed and what the message
 * said, which the file answers exactly.
 */

const API_PORT = 4100;
const PG_PORT = 55433;
const apiRoot = fileURLToPath(new URL('../../apps/api/', import.meta.url));
const stateDir = fileURLToPath(new URL('../.tmp/', import.meta.url));

mkdirSync(stateDir, { recursive: true });
const MAILBOX = join(stateDir, 'mailbox.json');
const STATE = join(stateDir, 'state.json');

const dataDir = mkdtempSync(join(tmpdir(), 'kapka-e2e-pg-'));
const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'kapka',
  password: 'kapka',
  port: PG_PORT,
  persistent: false,
});

await postgres.initialise();
await postgres.start();
await postgres.createDatabase('kapka_e2e');

const databaseUrl = `postgresql://kapka:kapka@localhost:${String(PG_PORT)}/kapka_e2e`;

// The real migration tool against the real files. A migration that does not
// apply fails the run here rather than on a deploy.
execFileSync('npx', ['node-pg-migrate', 'up', '-m', 'migrations', '--no-check-order'], {
  cwd: apiRoot,
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'pipe',
});

/* Set before the app is imported. env.ts parses at import time and the
   connection pool is built from what it finds. */
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'test';
process.env.BCRYPT_COST = '4';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.APP_BASE_URL = 'http://localhost:5173';

const { createApp } = await import('../../apps/api/src/app');
const { createVerificationSender } = await import('../../apps/api/src/auth/verification');
const { createPgAuthRepository } = await import('../../apps/api/src/auth/repository');
const { dispatchNotifications } = await import('../../apps/api/src/notify/dispatch');

writeFileSync(MAILBOX, '[]');

/** Records instead of connecting. Everything above it is the real path. */
const mailer: Mailer = {
  send(email) {
    const sent = JSON.parse(readFileSync(MAILBOX, 'utf8')) as unknown[];
    sent.push({
      to: email.to,
      subject: email.subject,
      text: email.text,
      at: new Date().toISOString(),
    });
    writeFileSync(MAILBOX, JSON.stringify(sent, null, 2));
    return Promise.resolve({ providerId: `e2e-${String(sent.length)}` });
  },
};

const repository = createPgAuthRepository();
const app = createApp(
  repository,
  undefined,
  undefined,
  (requestId) =>
    dispatchNotifications(requestId, { mailer, baseUrl: 'http://localhost:5173' }),
  createVerificationSender(repository, { mailer, baseUrl: 'http://localhost:5173' }),
);

app.listen(API_PORT, () => {
  writeFileSync(
    STATE,
    JSON.stringify({ databaseUrl, apiPort: API_PORT, mailbox: MAILBOX }, null, 2),
  );
  console.log(`e2e api ready on http://localhost:${String(API_PORT)}`);
});

async function shutdown(): Promise<never> {
  try {
    await postgres.stop();
  } catch {
    /* going away with the process anyway */
  }
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* likewise */
  }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
