import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** What the stack process wrote once it was listening. */
interface StackState {
  databaseUrl: string;
  apiPort: number;
  mailbox: string;
}

const statePath = fileURLToPath(new URL('../.tmp/state.json', import.meta.url));

export function state(): StackState {
  return JSON.parse(readFileSync(statePath, 'utf8')) as StackState;
}

export interface SentEmail {
  to: string;
  subject: string;
  text: string;
  at: string;
}

/** Everything the API has "sent" so far. */
export function mailbox(): SentEmail[] {
  return JSON.parse(readFileSync(state().mailbox, 'utf8')) as SentEmail[];
}

/**
 * A connection to the same database the API is using.
 *
 * Tests reach for this to set up what cannot be done through the interface —
 * promoting somebody to admin, mostly, because registration only ever creates
 * donors and there is no screen that changes a role. Assertions prefer the
 * browser: the point of these tests is what a person sees.
 */
export async function withDb<T>(work: (db: pg.Pool) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: state().databaseUrl, max: 2 });
  try {
    return await work(pool);
  } finally {
    await pool.end();
  }
}

/** Registration always creates a donor; a role is a database fact (§12). */
export async function promoteToAdmin(email: string): Promise<void> {
  await withDb(async (db) => {
    const { rowCount } = await db.query(
      `UPDATE users SET role = 'admin' WHERE email = $1`,
      [email],
    );
    if (rowCount === 0) throw new Error(`no user to promote: ${email}`);
  });
}

/**
 * A donor in the pool.
 *
 * Defaults to one who matches — verified, active, available, never donated —
 * so a test only states the way its donor differs from that.
 */
export interface DonorOptions {
  bloodType: string;
  city: string;
  verified?: boolean;
  available?: boolean;
}

export async function makeDonor(email: string, options: DonorOptions): Promise<void> {
  const { bloodType, city, verified = true, available = true } = options;
  await withDb(async (db) => {
    /* password_hash is not a hash and is not meant to be: these donors exist
       to receive mail, never to sign in. A test that needs a working password
       registers through the browser, which is the only thing that should ever
       be writing that column. */
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, is_active, email_verified)
       VALUES ($1, 'not-a-hash', $2, TRUE, $3) RETURNING id`,
      [email, `Donor ${email.split('@')[0] ?? ''}`, verified],
    );
    await db.query(
      `INSERT INTO donor_profiles (user_id, blood_type, city, is_available)
       VALUES ($1, $2::blood_type, $3, $4)`,
      [rows[0]?.id, bloodType, city, available],
    );
  });
}

/**
 * Empties a city of donors before one is seeded into it.
 *
 * The approving test asserts an exact number — "Email 1 donor now?" — and an
 * exact number is only true if nothing else is in that city. Both viewport
 * projects run against one database, and a retry runs a third time, so
 * without this the second run counts the first run's donor and the assertion
 * turns into a flake that looks like a bug.
 */
export async function clearDonorsIn(city: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `DELETE FROM users WHERE id IN (SELECT user_id FROM donor_profiles WHERE city = $1)`,
      [city],
    );
  });
}

/**
 * Registers through the real API rather than the browser.
 *
 * Used for the person who posts a request, who is not the subject of the test
 * that needs them — driving a second account through the form would be
 * re-testing registration inside a test about approval, and would leave the
 * browser signed in as the wrong person.
 */
export async function registerViaApi(email: string): Promise<string> {
  const response = await fetch(
    `http://localhost:${String(state().apiPort)}/api/auth/register`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'a-long-enough-password',
        fullName: 'Marko Requester',
        bloodType: 'A+',
        city: 'Skopje',
      }),
    },
  );
  if (!response.ok) throw new Error(`register failed: ${String(response.status)}`);
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

/** Posts a request, which lands pending — nothing else can put one in the queue. */
export async function postRequest(
  token: string,
  input: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(
    `http://localhost:${String(state().apiPort)}/api/requests`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw new Error(`post request failed: ${String(response.status)}`);
  const body = (await response.json()) as { request: { id: string } };
  return body.request.id;
}

/** A unique address per test, so runs do not collide on the users table. */
export const uniqueEmail = (label: string): string =>
  `${label}-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@example.test`;
