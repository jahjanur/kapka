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

describe('GET /api/me/notifications', () => {
  const historySchema = z.object({
    notifications: z.array(
      z.object({
        requestId: z.string(),
        bloodType: z.string(),
        hospitalName: z.string(),
        city: z.string(),
        requestStatus: z.string(),
        status: z.string(),
        createdAt: z.string(),
        sentAt: z.string().nullable(),
      }),
    ),
  });

  /** A request, and a notification row against it for `donorId`. */
  async function notified(
    donorId: string,
    over: { hospital?: string; status?: string; requestStatus?: string } = {},
  ): Promise<string> {
    const {
      hospital = 'City General',
      status = 'sent',
      requestStatus = 'approved',
    } = over;
    const { rows: requester } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, 'x', 'Requester', 'requester') RETURNING id`,
      [`req-${hospital}-${String(Math.random())}@example.test`],
    );
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO blood_requests
         (requester_id, blood_type, hospital_name, city, contact_phone, status)
       VALUES ($1, 'O-', $2, 'Skopje', '+389 70 000 000', $3::request_status)
       RETURNING id`,
      [requester[0]?.id, hospital, requestStatus],
    );
    const requestId = rows[0]?.id ?? '';
    await db.pool.query(
      `INSERT INTO notification_log (request_id, donor_id, status, sent_at)
       VALUES ($1, $2, $3::notification_status,
               CASE WHEN $3 = 'sent' THEN now() ELSE NULL END)`,
      [requestId, donorId, status],
    );
    return requestId;
  }

  const history = async (header: string) => {
    const response = await request(serverFor(app))
      .get('/api/me/notifications')
      .set('Authorization', header);
    expect(response.status).toBe(200);
    return historySchema.parse(response.body).notifications;
  };

  it('refuses an anonymous caller', async () => {
    expect((await request(serverFor(app)).get('/api/me/notifications')).status).toBe(401);
  });

  it('is empty for a donor nobody has contacted', async () => {
    expect(await history((await donor()).header)).toEqual([]);
  });

  it('lists what they were contacted about, newest first', async () => {
    const person = await donor();
    await notified(person.id, { hospital: 'Older' });
    await notified(person.id, { hospital: 'Newer' });

    const rows = await history(person.header);
    expect(rows.map((r) => r.hospitalName)).toEqual(['Newer', 'Older']);
  });

  it('shows another donor nothing of this one', async () => {
    /* Scoped in the WHERE clause. There is no shape of this query that
       returns somebody else's rows and trims them afterwards. */
    const ana = await donor();
    const bojan = await donor();
    await notified(ana.id, { hospital: "Ana's" });

    expect(await history(bojan.header)).toEqual([]);
    expect(await history(ana.header)).toHaveLength(1);
  });

  it('says what became of the request, which is what donors ask', async () => {
    const person = await donor();
    await notified(person.id, { requestStatus: 'fulfilled' });
    expect((await history(person.header))[0]?.requestStatus).toBe('fulfilled');
  });

  it('does not call a queued notification sent', async () => {
    /* Beyond the day's free-tier ceiling the row is written as queued and
       goes tomorrow (§5.3). Showing it as sent would be a list of emails the
       donor never received, presented as ones they did. */
    const person = await donor();
    await notified(person.id, { status: 'queued' });

    const row = (await history(person.header))[0];
    expect(row?.status).toBe('queued');
    expect(row?.sentAt).toBeNull();
  });

  it('keeps a failed delivery visible rather than hiding it', async () => {
    // A donor whose address bounces should be able to see that it did.
    const person = await donor();
    await notified(person.id, { status: 'failed' });
    expect((await history(person.header))[0]?.status).toBe('failed');
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
