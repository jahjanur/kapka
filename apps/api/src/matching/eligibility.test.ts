import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DONATION_INTERVAL_DAYS } from '@kapka/shared';
import { startTestDatabase, type TestDatabase } from '../test/database';
import { findMatchingDonors } from './repository';

/**
 * The 56-day rule (§5.2), at its boundaries, against a real PostgreSQL.
 *
 * Both sides of this get decided in SQL: the donor's date is stored relative
 * to CURRENT_DATE and the query compares against CURRENT_DATE. Computing
 * either in JavaScript would let the server's timezone decide who is
 * eligible.
 */

let db: TestDatabase;
let requestId = '';

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

let sequence = 0;

/** A donor whose last donation was `daysAgo` days ago. Negative is the future. */
async function addDonor(daysAgo: number | null): Promise<string> {
  sequence += 1;
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, is_active, email_verified)
     VALUES ($1, 'x', 'Donor', TRUE, TRUE) RETURNING id`,
    [`donor-${String(sequence)}@seed.test`],
  );
  const id = rows[0]?.id ?? '';
  await db.pool.query(
    `INSERT INTO donor_profiles (user_id, blood_type, city, last_donation_date)
     VALUES ($1, 'O-', 'Skopje',
             CASE WHEN $2::int IS NULL THEN NULL
                  ELSE CURRENT_DATE - ($2::int * INTERVAL '1 day') END)`,
    [id, daysAgo],
  );
  return id;
}

beforeEach(async () => {
  await db.reset();
  sequence += 1;
  const { rows: requester } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, 'x', 'R', 'requester') RETURNING id`,
    [`requester-${String(sequence)}@seed.test`],
  );
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO blood_requests
       (requester_id, blood_type, hospital_name, city, contact_phone, status)
     VALUES ($1, 'O-', 'City General', 'Skopje', '+389 70 000 000', 'approved')
     RETURNING id`,
    [requester[0]?.id],
  );
  requestId = rows[0]?.id ?? '';
});

async function isEligible(daysAgo: number | null): Promise<boolean> {
  const donorId = await addDonor(daysAgo);
  const matched = await findMatchingDonors(requestId, db.pool);
  return matched.some((donor) => donor.id === donorId);
}

describe('the 56-day boundary', () => {
  it('includes a donor who has never donated', async () => {
    // NULL means never donated, which is eligible (§5.2). It is not "unknown".
    expect(await isEligible(null)).toBe(true);
  });

  it(`includes a donor who last gave exactly ${String(DONATION_INTERVAL_DAYS)} days ago`, async () => {
    // The boundary is inclusive: on day 56 they may give again.
    expect(await isEligible(DONATION_INTERVAL_DAYS)).toBe(true);
  });

  it(`excludes a donor who last gave ${String(DONATION_INTERVAL_DAYS - 1)} days ago`, async () => {
    // One day short. This is the case an off-by-one would let through, and
    // letting it through means asking someone to give too soon.
    expect(await isEligible(DONATION_INTERVAL_DAYS - 1)).toBe(false);
  });

  it(`includes a donor who last gave ${String(DONATION_INTERVAL_DAYS + 1)} days ago`, async () => {
    expect(await isEligible(DONATION_INTERVAL_DAYS + 1)).toBe(true);
  });

  it('excludes a donor with a date in the future', async () => {
    /*
     * Nobody donates tomorrow. If one of these reaches the table — through
     * direct SQL, a bad import, a clock skew — the donor is not merely
     * ineligible now: last_donation_date <= CURRENT_DATE - 56 days can never
     * be true for a date that keeps being ahead of today, so they would be
     * silently invisible for as long as it stayed in the future.
     *
     * The API rejects these (registerSchema), and a trigger now stops them
     * reaching the table at all. This asserts the query's behaviour if one
     * ever did.
     */
    // A trigger refuses these, so getting one in takes a deliberate opt-in
    // inside a transaction — SET LOCAL dies with it.
    const client = await db.pool.connect();
    let donorId = '';
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL kapka.allow_future_donation_date = on');
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, full_name, is_active, email_verified)
         VALUES ('future@seed.test', 'x', 'Donor', TRUE, TRUE) RETURNING id`,
      );
      donorId = rows[0]?.id ?? '';
      await client.query(
        `INSERT INTO donor_profiles (user_id, blood_type, city, last_donation_date)
         VALUES ($1, 'O-', 'Skopje', CURRENT_DATE + INTERVAL '1 day')`,
        [donorId],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const matched = await findMatchingDonors(requestId, db.pool);
    expect(matched.some((donor) => donor.id === donorId)).toBe(false);
  });

  it('excludes a donor who gave today', async () => {
    expect(await isEligible(0)).toBe(false);
  });
});

describe('a future date cannot reach the table', () => {
  it('is refused by the database, not only by the API', async () => {
    // registerSchema rejects these, but the API is not the only way a row
    // arrives — an import, a fix-up script, a skewed clock on a bulk load.
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ('blocked@seed.test', 'x', 'D') RETURNING id`,
    );
    await expect(
      db.pool.query(
        `INSERT INTO donor_profiles (user_id, blood_type, city, last_donation_date)
         VALUES ($1, 'O-', 'Skopje', CURRENT_DATE + INTERVAL '1 day')`,
        [rows[0]?.id],
      ),
    ).rejects.toThrow(/in the future/);
  });

  it('is refused on update too, not only on insert', async () => {
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ('update@seed.test', 'x', 'D') RETURNING id`,
    );
    await db.pool.query(
      `INSERT INTO donor_profiles (user_id, blood_type, city, last_donation_date)
       VALUES ($1, 'O-', 'Skopje', NULL)`,
      [rows[0]?.id],
    );
    await expect(
      db.pool.query(
        `UPDATE donor_profiles SET last_donation_date = CURRENT_DATE + 1 WHERE user_id = $1`,
        [rows[0]?.id],
      ),
    ).rejects.toThrow(/in the future/);
  });

  it('still accepts today and every past date', async () => {
    // The guard must not catch the ordinary case of someone recording a
    // donation they made this morning.
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ('today@seed.test', 'x', 'D') RETURNING id`,
    );
    await expect(
      db.pool.query(
        `INSERT INTO donor_profiles (user_id, blood_type, city, last_donation_date)
         VALUES ($1, 'O-', 'Skopje', CURRENT_DATE)`,
        [rows[0]?.id],
      ),
    ).resolves.toBeTruthy();
  });
});

describe('who decides the date', () => {
  it('is the database, not the application clock (§5.2)', async () => {
    // The stored date and the comparison both come from CURRENT_DATE, so they
    // agree regardless of where the process runs or what its TZ is set to.
    const { rows } = await db.pool.query<{ interval_match: boolean; tz: string }>(
      `SELECT (CURRENT_DATE - INTERVAL '56 days')::date = (CURRENT_DATE - 56)::date
                AS interval_match,
              current_setting('TimeZone') AS tz`,
    );
    expect(rows[0]?.interval_match).toBe(true);
    expect(rows[0]?.tz).toBeTruthy();
  });

  it('gives the same answer whatever timezone the session claims', async () => {
    // A donor exactly on the boundary must not flip to ineligible because a
    // connection happened to be in a different zone.
    const donorId = await addDonor(DONATION_INTERVAL_DAYS);
    for (const zone of ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue']) {
      const client = await db.pool.connect();
      try {
        await client.query(`SET TIME ZONE '${zone}'`);
        const matched = await findMatchingDonors(requestId, client);
        expect(
          matched.some((d) => d.id === donorId),
          zone,
        ).toBe(true);
      } finally {
        client.release();
      }
    }
  });
});
