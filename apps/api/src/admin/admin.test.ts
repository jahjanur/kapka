import request from 'supertest';
import { serverFor } from '../test/http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../app';
import { createPgAuthRepository } from '../auth/repository';
import { createPgRequestsRepository } from '../requests/repository';
import { startTestDatabase, type TestDatabase } from '../test/database';
import { dispatchNotifications } from '../notify/dispatch';
import type { Mailer, OutgoingEmail } from '../notify/mailer';
import { createPgAdminRepository } from './repository';
import { noVerificationEmail } from '../test/mail';

/**
 * Approving a request is what releases it to donors, so these are the two
 * endpoints where getting authorisation or idempotency wrong has the largest
 * consequences — and every one of them writes an audit row (§4).
 */

let db: TestDatabase;
let app: ReturnType<typeof createApp>;
let people = 0;
let mailer: Mailer & { sent: OutgoingEmail[]; failNext: boolean };

/** Records what was sent, and can be told to fail like a provider outage. */
function testMailer(): Mailer & { sent: OutgoingEmail[]; failNext: boolean } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    failNext: false,
    send(email) {
      if (this.failNext) return Promise.reject(new Error('SendGrid responded 503'));
      sent.push(email);
      return Promise.resolve({ providerId: `msg-${String(sent.length)}` });
    },
  };
}

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
  mailer = testMailer();
  app = createApp(
    createPgAuthRepository(db.pool),
    createPgRequestsRepository(db.pool),
    createPgAdminRepository(db.pool),
    // The real dispatcher, bound to this test's database and a mailer that
    // never opens a socket. Approving genuinely emails, in other words.
    (requestId) => dispatchNotifications(requestId, { db: db.pool, mailer }),
    noVerificationEmail,
  );
});

/** Registers a real account and returns its id and Authorization header. */
async function signIn(
  role: 'donor' | 'admin' = 'donor',
): Promise<{ id: string; header: string }> {
  people += 1;
  const email = `person-${String(people)}@example.test`;
  const response = await request(serverFor(app)).post('/api/auth/register').send({
    fullName: 'Test Person',
    email,
    password: PASSWORD,
    bloodType: 'O-',
    city: 'Skopje',
  });
  const body = z
    .object({ accessToken: z.string(), user: z.object({ id: z.string() }) })
    .parse(response.body);

  if (role === 'admin') {
    // Registration always creates a donor; promotion is a database fact, which
    // is exactly what requireRole reads.
    await db.pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [body.user.id]);
  }
  return { id: body.user.id, header: `Bearer ${body.accessToken}` };
}

async function pendingRequest(bloodType = 'O-'): Promise<string> {
  const requester = await signIn();
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO blood_requests
       (requester_id, blood_type, hospital_name, city, contact_phone)
     VALUES ($1, $2, 'City General', 'Skopje', '+389 70 000 000') RETURNING id`,
    [requester.id, bloodType],
  );
  return rows[0]?.id ?? '';
}

/** An eligible donor who would match an O− request in Skopje. */
async function eligibleDonor(bloodType = 'O-'): Promise<void> {
  people += 1;
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, is_active, email_verified)
     VALUES ($1, 'x', 'Donor', TRUE, TRUE) RETURNING id`,
    [`donor-${String(people)}@seed.test`],
  );
  await db.pool.query(
    `INSERT INTO donor_profiles (user_id, blood_type, city) VALUES ($1, $2, 'Skopje')`,
    [rows[0]?.id, bloodType],
  );
}

const approveSchema = z.object({
  status: z.string(),
  matchedDonors: z.number(),
  sent: z.number(),
  failed: z.number(),
  skipped: z.number(),
  queued: z.number(),
  budgetExhausted: z.boolean(),
  dailyBudgetRemaining: z.number(),
  warning: z.string().nullable(),
});
const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

async function auditRows(): Promise<
  { action: string; metadata: unknown; actor_id: string }[]
> {
  const { rows } = await db.pool.query<{
    action: string;
    metadata: unknown;
    actor_id: string;
  }>('SELECT action, metadata, actor_id FROM audit_log ORDER BY id');
  return rows;
}

describe('GET /api/admin/requests — the queue', () => {
  /** A pending request whose age can be set, so ordering is testable. */
  async function pendingAged(hospital: string, minutesAgo: number): Promise<string> {
    const requester = await signIn();
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO blood_requests
         (requester_id, blood_type, hospital_name, city, contact_phone, created_at)
       VALUES ($1, 'O-', $2, 'Skopje', '+389 70 000 000',
               now() - ($3 || ' minutes')::interval)
       RETURNING id`,
      [requester.id, hospital, String(minutesAgo)],
    );
    return rows[0]?.id ?? '';
  }

  const queueSchema = z.object({
    requests: z.array(
      z.object({
        id: z.string(),
        hospitalName: z.string(),
        contactPhone: z.string(),
        requesterName: z.string(),
        matchedDonors: z.number(),
      }),
    ),
  });

  const queueFor = async (header: string) => {
    const response = await request(serverFor(app))
      .get('/api/admin/requests')
      .set('Authorization', header);
    expect(response.status).toBe(200);
    return queueSchema.parse(response.body).requests;
  };

  it('refuses a donor', async () => {
    // This is the one list in the product holding unapproved requests and
    // every requester's phone number.
    const donor = await signIn('donor');
    const response = await request(serverFor(app))
      .get('/api/admin/requests')
      .set('Authorization', donor.header);
    expect(response.status).toBe(403);
  });

  it('refuses an anonymous caller', async () => {
    expect((await request(serverFor(app)).get('/api/admin/requests')).status).toBe(401);
  });

  it('lists what is waiting, oldest first', async () => {
    /* The opposite order to the public feed. A queue is worked through, and
       the one waiting longest is the one somebody is still waiting on. */
    const admin = await signIn('admin');
    const older = await pendingAged('Older', 90);
    const newer = await pendingAged('Newer', 5);

    expect((await queueFor(admin.header)).map((r) => r.id)).toEqual([older, newer]);
  });

  it('carries what an admin needs to judge it', async () => {
    const admin = await signIn('admin');
    await pendingRequest();
    const [row] = await queueFor(admin.header);
    expect(row?.contactPhone).toBe('+389 70 000 000');
    expect(row?.requesterName).toBe('Test Person');
  });

  it('drops a request the moment it is decided', async () => {
    const admin = await signIn('admin');
    const waiting = await pendingRequest();
    const decided = await pendingRequest();
    await request(serverFor(app))
      .post(`/api/admin/requests/${decided}/approve`)
      .set('Authorization', admin.header);

    expect((await queueFor(admin.header)).map((r) => r.id)).toEqual([waiting]);
  });

  it('says how many donors approving would reach', async () => {
    /* §9.6 wants that number in front of the admin BEFORE they confirm.
       Approving is irreversible and sends mail to strangers. */
    const admin = await signIn('admin');
    await eligibleDonor();
    await eligibleDonor();
    await pendingRequest();

    expect((await queueFor(admin.header))[0]?.matchedDonors).toBe(2);
  });

  it('counts nobody when nobody matches', async () => {
    const admin = await signIn('admin');
    await eligibleDonor('AB+'); // cannot give to an O− patient
    await pendingRequest('O-');
    expect((await queueFor(admin.header))[0]?.matchedDonors).toBe(0);
  });
});

describe('who may moderate', () => {
  it('refuses an anonymous caller', async () => {
    const id = await pendingRequest();
    expect(
      (await request(serverFor(app)).post(`/api/admin/requests/${id}/approve`)).status,
    ).toBe(401);
  });

  it('refuses a signed-in donor with 403', async () => {
    // Known, but not allowed. Hiding the button in React is not access
    // control (§12).
    const id = await pendingRequest();
    const donor = await signIn('donor');
    const response = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', donor.header);
    expect(response.status).toBe(403);
  });

  it('refuses an admin who was demoted after their token was issued', async () => {
    // The role comes from the database, not the 15-minute-old claim.
    const id = await pendingRequest();
    const admin = await signIn('admin');
    await db.pool.query(`UPDATE users SET role = 'donor' WHERE id = $1`, [admin.id]);
    const response = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);
    expect(response.status).toBe(403);
  });

  it('writes no audit row for a refused attempt', async () => {
    const id = await pendingRequest();
    const donor = await signIn('donor');
    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', donor.header);
    expect(await auditRows()).toEqual([]);
  });
});

describe('approving', () => {
  it('moves the request to approved and records who did it', async () => {
    const id = await pendingRequest();
    const admin = await signIn('admin');
    const response = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);

    expect(response.status).toBe(200);
    const { rows } = await db.pool.query<{
      status: string;
      moderated_by: string;
      moderated_at: Date;
    }>('SELECT status, moderated_by, moderated_at FROM blood_requests WHERE id = $1', [
      id,
    ]);
    expect(rows[0]?.status).toBe('approved');
    expect(rows[0]?.moderated_by).toBe(admin.id);
    expect(rows[0]?.moderated_at).toBeInstanceOf(Date);
  });

  it('reports how many donors it will reach (§9.6)', async () => {
    // An irreversible mass action needs a visible number before it happens.
    await eligibleDonor('O-');
    await eligibleDonor('O-');
    await eligibleDonor('AB+'); // cannot give to an O− patient
    const id = await pendingRequest('O-');
    const admin = await signIn('admin');

    const response = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);
    expect(approveSchema.parse(response.body).matchedDonors).toBe(2);
  });

  it('emails the matched donors and reports the outcome (§9.6)', async () => {
    // Not a bare success toast: sent, failed and skipped-as-duplicate.
    await eligibleDonor('O-');
    await eligibleDonor('O-');
    const id = await pendingRequest('O-');
    const admin = await signIn('admin');

    const body = approveSchema.parse(
      (
        await request(serverFor(app))
          .post(`/api/admin/requests/${id}/approve`)
          .set('Authorization', admin.header)
      ).body,
    );
    expect(body.sent).toBe(2);
    expect(body.failed).toBe(0);
    expect(mailer.sent).toHaveLength(2);
  });

  it('tells the admin in words when the budget is spent, not just a flag', async () => {
    // §5.3: warn clearly. The dashboard should have a sentence to show.
    const filler = await pendingRequest('O-');
    for (let i = 0; i < 100; i += 1) {
      people += 1;
      const { rows } = await db.pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, full_name) VALUES ($1, 'x', 'D') RETURNING id`,
        [`spent-${String(people)}@seed.test`],
      );
      await db.pool.query(
        `INSERT INTO notification_log (request_id, donor_id, status, sent_at)
         VALUES ($1, $2, 'sent', now())`,
        [filler, rows[0]?.id],
      );
    }

    await eligibleDonor('O-');
    const id = await pendingRequest('O-');
    const admin = await signIn('admin');

    const body = approveSchema.parse(
      (
        await request(serverFor(app))
          .post(`/api/admin/requests/${id}/approve`)
          .set('Authorization', admin.header)
      ).body,
    );

    expect(body.budgetExhausted).toBe(true);
    expect(body.sent).toBe(0);
    expect(body.queued).toBe(1);
    expect(body.warning).toContain('queued for tomorrow');
    // Nothing was dropped — the donor is recorded for a retry (§5.3).
    const { rows: log } = await db.pool.query<{ status: string }>(
      `SELECT status FROM notification_log WHERE request_id = $1`,
      [id],
    );
    expect(log[0]?.status).toBe('queued');
  });

  it('keeps the approval when every email fails (§5.3)', async () => {
    /*
     * A provider outage must not roll back the approval. Dispatch runs after
     * the transaction has committed, so there is nothing left to roll back —
     * the request stays approved and the failures are recorded against their
     * own notification rows for a retry.
     */
    await eligibleDonor('O-');
    const id = await pendingRequest('O-');
    const admin = await signIn('admin');
    mailer.failNext = true;

    const response = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);

    expect(response.status).toBe(200);
    expect(approveSchema.parse(response.body).failed).toBe(1);

    const { rows } = await db.pool.query<{ status: string }>(
      'SELECT status FROM blood_requests WHERE id = $1',
      [id],
    );
    expect(rows[0]?.status).toBe('approved');

    const { rows: log } = await db.pool.query<{ status: string }>(
      'SELECT status FROM notification_log',
    );
    expect(log[0]?.status).toBe('failed');
  });

  it('does not email anyone twice if approve is somehow reached again', async () => {
    await eligibleDonor('O-');
    const id = await pendingRequest('O-');
    const admin = await signIn('admin');

    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);
    // The second attempt is refused as already-moderated, so nothing is sent —
    // and even if it were reached, the unique index would stop it.
    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);

    expect(mailer.sent).toHaveLength(1);
  });

  it('writes one audit row, naming the admin and the count', async () => {
    await eligibleDonor('O-');
    const id = await pendingRequest();
    const admin = await signIn('admin');
    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('request.approve');
    expect(rows[0]?.actor_id).toBe(admin.id);
    expect(rows[0]?.metadata).toEqual({ matchedDonors: 1 });
  });

  it('puts no donor emails in the audit row (§12)', async () => {
    await eligibleDonor('O-');
    const id = await pendingRequest();
    const admin = await signIn('admin');
    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);
    expect(JSON.stringify(await auditRows())).not.toContain('@seed.test');
  });
});

describe('rejecting', () => {
  it('records the reason', async () => {
    const id = await pendingRequest();
    const admin = await signIn('admin');
    const response = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/reject`)
      .set('Authorization', admin.header)
      .send({ reason: 'Hospital could not be verified.' });

    expect(response.status).toBe(200);
    const { rows } = await db.pool.query<{ status: string; reject_reason: string }>(
      'SELECT status, reject_reason FROM blood_requests WHERE id = $1',
      [id],
    );
    expect(rows[0]?.status).toBe('rejected');
    expect(rows[0]?.reject_reason).toBe('Hospital could not be verified.');
  });

  it('demands a reason the requester can act on', async () => {
    const id = await pendingRequest();
    const admin = await signIn('admin');
    const response = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/reject`)
      .set('Authorization', admin.header)
      .send({ reason: 'no' });
    expect(response.status).toBe(400);
  });

  it('writes an audit row carrying the reason', async () => {
    const id = await pendingRequest();
    const admin = await signIn('admin');
    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/reject`)
      .set('Authorization', admin.header)
      .send({ reason: 'Hospital could not be verified.' });

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('request.reject');
    expect(rows[0]?.metadata).toEqual({ reason: 'Hospital could not be verified.' });
  });

  it('keeps a rejected request off the public feed', async () => {
    const id = await pendingRequest();
    const admin = await signIn('admin');
    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/reject`)
      .set('Authorization', admin.header)
      .send({ reason: 'Hospital could not be verified.' });

    const feed = await request(serverFor(app)).get('/api/requests');
    expect(
      z.object({ requests: z.array(z.unknown()) }).parse(feed.body).requests,
    ).toEqual([]);
  });
});

describe('moderating twice', () => {
  it('refuses a second approval with 409', async () => {
    /*
     * Two admins working the queue at the same moment. Without the status
     * guard this would approve twice, write two audit rows, and later send two
     * rounds of email to the same donors.
     */
    const id = await pendingRequest();
    const admin = await signIn('admin');
    const first = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);
    const second = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(errorSchema.parse(second.body).error.code).toBe('ALREADY_MODERATED');
  });

  it('leaves exactly one audit row behind', async () => {
    const id = await pendingRequest();
    const admin = await signIn('admin');
    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);
    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);
    expect(await auditRows()).toHaveLength(1);
  });

  it('refuses to reject something already approved', async () => {
    const id = await pendingRequest();
    const admin = await signIn('admin');
    await request(serverFor(app))
      .post(`/api/admin/requests/${id}/approve`)
      .set('Authorization', admin.header);
    const response = await request(serverFor(app))
      .post(`/api/admin/requests/${id}/reject`)
      .set('Authorization', admin.header)
      .send({ reason: 'Changed my mind about this one.' });
    expect(response.status).toBe(409);
    expect(errorSchema.parse(response.body).error.message).toMatch(/approved/);
  });

  it('survives two approvals racing each other', async () => {
    // The UPDATE ... WHERE status = 'pending' is the lock, so one wins.
    const id = await pendingRequest();
    const admin = await signIn('admin');
    const [a, b] = await Promise.all([
      request(serverFor(app))
        .post(`/api/admin/requests/${id}/approve`)
        .set('Authorization', admin.header),
      request(serverFor(app))
        .post(`/api/admin/requests/${id}/approve`)
        .set('Authorization', admin.header),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await auditRows()).toHaveLength(1);
  });
});

describe('requests that are not there', () => {
  it('answers 404 for an id that does not exist', async () => {
    const admin = await signIn('admin');
    const response = await request(serverFor(app))
      .post('/api/admin/requests/00000000-0000-4000-8000-000000000000/approve')
      .set('Authorization', admin.header);
    expect(response.status).toBe(404);
  });

  it('answers 404 for a malformed id rather than erroring', async () => {
    const admin = await signIn('admin');
    const response = await request(serverFor(app))
      .post('/api/admin/requests/not-a-uuid/approve')
      .set('Authorization', admin.header);
    expect(response.status).toBe(404);
  });
});
