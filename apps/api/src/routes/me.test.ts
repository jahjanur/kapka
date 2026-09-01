import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { serverFor } from '../test/http';
import { createApp } from '../app';
import { createPgAuthRepository } from '../auth/repository';
import { startTestDatabase, type TestDatabase } from '../test/database';
import { noVerificationEmail } from '../test/mail';

/**
 * The donor's own settings (§9.5).
 *
 * Against a real Postgres, because the two things worth testing here are both
 * SQL: the eligibility date, which §5.2 insists is the database's answer and
 * not the process's, and a partial update that must leave untouched columns
 * alone.
 */

let db: TestDatabase;
let app: ReturnType<typeof createApp>;
let people = 0;

const PASSWORD = 'a-long-enough-password';

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.reset();
  people = 0;
  app = createApp(
    createPgAuthRepository(db.pool),
    undefined,
    undefined,
    undefined,
    noVerificationEmail,
  );
});

const profileSchema = z.object({
  bloodType: z.string(),
  city: z.string(),
  lastDonationDate: z.string().nullable(),
  isAvailable: z.boolean(),
  notifyByEmail: z.boolean(),
  eligibleFrom: z.string().nullable(),
});

async function donor(): Promise<{ id: string; header: string }> {
  people += 1;
  const response = await request(serverFor(app))
    .post('/api/auth/register')
    .send({
      fullName: 'Ana Petrovska',
      email: `donor-${String(people)}@example.test`,
      password: PASSWORD,
      bloodType: 'O-',
      city: 'Skopje',
    });
  const body = z
    .object({ accessToken: z.string(), user: z.object({ id: z.string() }) })
    .parse(response.body);
  return { id: body.user.id, header: `Bearer ${body.accessToken}` };
}

const readProfile = async (header: string) => {
  const response = await request(serverFor(app))
    .get('/api/me')
    .set('Authorization', header);
  expect(response.status).toBe(200);
  return z.object({ donorProfile: profileSchema }).parse(response.body).donorProfile;
};

const patch = (header: string, body: object) =>
  request(serverFor(app))
    .patch('/api/me/donor-profile')
    .set('Authorization', header)
    .send(body);

describe('when a donor can give again', () => {
  it('says nothing to wait for when they have never donated', async () => {
    // NULL is "never donated", which is eligible — not "unknown" (§5.2).
    expect((await readProfile((await donor()).header)).eligibleFrom).toBeNull();
  });

  it('gives the date when they gave recently', async () => {
    const person = await donor();
    await db.pool.query(
      `UPDATE donor_profiles SET last_donation_date = CURRENT_DATE - 21 WHERE user_id = $1`,
      [person.id],
    );

    const profile = await readProfile(person.header);
    /* Both sides asked of the database. "Today" in this process is a
       different day from "today" in Postgres for some hours of every day,
       which is what made eligibility.test.ts red only before 11:00 UTC. */
    const { rows } = await db.pool.query<{ day: string }>(
      `SELECT to_char((CURRENT_DATE - 21 + INTERVAL '56 days')::date, 'YYYY-MM-DD') AS day`,
    );
    expect(profile.eligibleFrom).toBe(rows[0]?.day);
  });

  it('says nothing to wait for once the interval is up', async () => {
    const person = await donor();
    await db.pool.query(
      `UPDATE donor_profiles SET last_donation_date = CURRENT_DATE - 56 WHERE user_id = $1`,
      [person.id],
    );
    // Day 56 is inclusive: they may give again.
    expect((await readProfile(person.header)).eligibleFrom).toBeNull();
  });

  it('reports the donation date as the day it was recorded', async () => {
    // A DATE read back through toISOString() is the previous day east of UTC.
    const person = await donor();
    await db.pool.query(
      `UPDATE donor_profiles SET last_donation_date = DATE '2026-08-11' WHERE user_id = $1`,
      [person.id],
    );
    expect((await readProfile(person.header)).lastDonationDate).toBe('2026-08-11');
  });
});

describe('PATCH /api/me/donor-profile', () => {
  it('refuses an anonymous caller', async () => {
    expect(
      (
        await request(serverFor(app))
          .patch('/api/me/donor-profile')
          .send({ isAvailable: false })
      ).status,
    ).toBe(401);
  });

  it('pauses the emails without deleting anything', async () => {
    /* The pause switch is the whole reason this endpoint exists. Without it,
       stopping the emails means deleting the account (§3). */
    const person = await donor();
    const response = await patch(person.header, { isAvailable: false });

    expect(response.status).toBe(200);
    expect(
      z.object({ donorProfile: profileSchema }).parse(response.body).donorProfile
        .isAvailable,
    ).toBe(false);
    // And it survives a read, so the matching query will see it.
    expect((await readProfile(person.header)).isAvailable).toBe(false);
  });

  it('leaves every field it was not given alone', async () => {
    const person = await donor();
    await patch(person.header, { city: 'Bitola' });

    const profile = await readProfile(person.header);
    expect(profile.city).toBe('Bitola');
    expect(profile.bloodType).toBe('O-');
    expect(profile.isAvailable).toBe(true);
    expect(profile.notifyByEmail).toBe(true);
  });

  it('tells the difference between an absent date and a null one', async () => {
    /* null means "I have never donated" and absent means "do not touch it".
       COALESCE cannot express that, which is why the column has its own
       flag in the update. */
    const person = await donor();
    await patch(person.header, { lastDonationDate: '2026-08-11' });
    expect((await readProfile(person.header)).lastDonationDate).toBe('2026-08-11');

    await patch(person.header, { city: 'Ohrid' });
    expect((await readProfile(person.header)).lastDonationDate).toBe('2026-08-11');

    await patch(person.header, { lastDonationDate: null });
    expect((await readProfile(person.header)).lastDonationDate).toBeNull();
  });

  it('recomputes eligibility from the date it was just given', async () => {
    const person = await donor();
    await patch(person.header, { lastDonationDate: null });
    expect((await readProfile(person.header)).eligibleFrom).toBeNull();
  });

  it('refuses a body that changes nothing', async () => {
    const response = await patch((await donor()).header, {});
    expect(response.status).toBe(400);
  });

  it('refuses a city that is not on the list', async () => {
    // Matching is exact-string on this value; a free-text city is a donor
    // who never hears about anything (§3).
    expect((await patch((await donor()).header, { city: 'Atlantis' })).status).toBe(400);
  });

  it('refuses a field nobody may set from here', async () => {
    // strictObject: the schema rejects unknown keys rather than ignoring them.
    const response = await patch((await donor()).header, { role: 'admin' });
    expect(response.status).toBe(400);
  });

  it('answers 404 for an account with no donor profile', async () => {
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ('requester@example.test', 'x', 'R', 'requester') RETURNING id`,
    );
    const { signAccessToken } = await import('../auth/tokens');
    const token = await signAccessToken(rows[0]?.id ?? '', 'requester');

    const response = await patch(`Bearer ${token}`, { isAvailable: false });
    expect(response.status).toBe(404);
  });
});
