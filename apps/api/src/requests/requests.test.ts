import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../app';
import { createPgAuthRepository } from '../auth/repository';
import { startTestDatabase, type TestDatabase } from '../test/database';
import { createPgRequestsRepository } from './repository';

/**
 * The three request endpoints, over real HTTP against a real PostgreSQL.
 *
 * The rule this file exists for: an anonymous caller must never receive the
 * requester's phone number (§4, §12). That is enforced in the SQL — the column
 * is not selected without a viewer — so it has to be checked against a
 * database to mean anything.
 */

let db: TestDatabase;
let app: ReturnType<typeof createApp>;
let callers = 0;

const PASSWORD = 'a-long-enough-password';
const CONTACT = '+389 70 123 456';

const newRequest = {
  bloodType: 'O-',
  unitsNeeded: 2,
  urgency: 'critical',
  hospitalName: 'City General Hospital',
  hospitalLat: 41.9981,
  hospitalLng: 21.4254,
  city: 'Skopje',
  contactPhone: CONTACT,
  note: 'Road traffic accident.',
};

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.reset();
  callers = 0;
  // Both repositories point at the real database, so requester_id actually
  // references a row — and the auth SQL gets exercised alongside.
  app = createApp(createPgAuthRepository(db.pool), createPgRequestsRepository(db.pool));
});

/** Registers a real account and returns an Authorization header for it. */
async function bearer(bloodType = 'O-'): Promise<string> {
  callers += 1;
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      fullName: 'Test Caller',
      email: `caller-${String(callers)}@example.test`,
      password: PASSWORD,
      bloodType,
      city: 'Skopje',
    });
  return `Bearer ${z.object({ accessToken: z.string() }).parse(response.body).accessToken}`;
}

/** Inserts a request directly, so its status can be set. */
async function seedRequest(
  overrides: Partial<{
    bloodType: string;
    city: string;
    urgency: string;
    status: string;
  }> = {},
): Promise<string> {
  const {
    bloodType = 'O-',
    city = 'Skopje',
    urgency = 'urgent',
    status = 'approved',
  } = overrides;
  const { rows: user } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, 'x', 'R', 'requester') RETURNING id`,
    [`seed-${String(Math.random()).slice(2)}@seed.test`],
  );
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO blood_requests
       (requester_id, blood_type, units_needed, urgency, hospital_name, city, contact_phone, status)
     VALUES ($1, $2, 1, $3, 'H', $4, $5, $6) RETURNING id`,
    [user[0]?.id, bloodType, urgency, city, CONTACT, status],
  );
  return rows[0]?.id ?? '';
}

const listSchema = z.object({
  requests: z.array(z.object({ id: z.string(), city: z.string() }).loose()),
});
const detailSchema = z.object({ request: z.object({ id: z.string() }).loose() });

describe('POST /api/requests', () => {
  it('stores the request and returns it', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', await bearer())
      .send(newRequest);

    expect(response.status).toBe(201);
    const body = detailSchema.parse(response.body);
    expect(body.request.hospitalName).toBe('City General Hospital');
    // NUMERIC comes out of Postgres as a string; the API speaks numbers.
    expect(body.request.hospitalLat).toBe(41.9981);
  });

  it('lands as pending, so nothing reaches a donor before moderation (§4)', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', await bearer())
      .send(newRequest);
    expect(detailSchema.parse(response.body).request.status).toBe('pending');
  });

  it('does not let the client choose its own status', async () => {
    // createRequestSchema has no status field and rejects unknown keys, so
    // asking to be approved is a validation error rather than a shortcut past
    // the whole moderation step.
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', await bearer())
      .send({ ...newRequest, status: 'approved' });
    expect(response.status).toBe(400);
  });

  it('refuses an anonymous caller', async () => {
    const response = await request(app).post('/api/requests').send(newRequest);
    expect(response.status).toBe(401);
  });

  it('records who posted it', async () => {
    const token = await bearer();
    await request(app).post('/api/requests').set('Authorization', token).send(newRequest);
    const { rows } = await db.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM blood_requests WHERE requester_id IS NOT NULL',
    );
    expect(rows[0]?.count).toBe('1');
  });
});

describe('GET /api/requests — hiding contact details', () => {
  beforeEach(async () => {
    await seedRequest();
  });

  it('gives an anonymous caller no contact phone at all', async () => {
    /*
     * §4 returns the requester's contact only to authenticated users, and §12
     * says contact details are never in a public response. The field must be
     * absent rather than empty — an empty string still tells a scraper the
     * shape of what it is missing, and a serialisation change could fill it.
     */
    const response = await request(app).get('/api/requests');
    expect(response.status).toBe(200);
    const [first] = listSchema.parse(response.body).requests;
    expect(first).toBeDefined();
    expect(first).not.toHaveProperty('contactPhone');
    expect(JSON.stringify(response.body)).not.toContain('389 70 123 456');
  });

  it('gives a signed-in caller the contact phone', async () => {
    const response = await request(app)
      .get('/api/requests')
      .set('Authorization', await bearer());
    const [first] = listSchema.parse(response.body).requests;
    expect(first?.contactPhone).toBe(CONTACT);
  });

  it('treats an invalid token as anonymous rather than failing', async () => {
    // A stale token in someone's browser must not break a public page.
    const response = await request(app)
      .get('/api/requests')
      .set('Authorization', 'Bearer rubbish');
    expect(response.status).toBe(200);
    expect(listSchema.parse(response.body).requests[0]).not.toHaveProperty(
      'contactPhone',
    );
  });
});

describe('the contact column is never even read', () => {
  /*
   * The response check above passes whether the column is filtered out in SQL
   * or dropped by the mapper afterwards — the mapper builds the public shape
   * either way. That is two layers of defence, which is good, but it means
   * the outer one hides whether the inner one works.
   *
   * These assert the inner layer directly: for an anonymous caller the column
   * is not in the query at all, so no later change to serialisation can leak
   * what was never fetched.
   */
  function recordingDb() {
    const statements: string[] = [];
    return {
      statements,
      query: (text: string, values?: unknown[]) => {
        statements.push(text);
        return db.pool.query(text, values as never);
      },
    };
  }

  it('leaves contact_phone out of the feed query for an anonymous caller', async () => {
    const recorder = recordingDb();
    const repository = createPgRequestsRepository(recorder as never);
    await repository.list({}, null);
    expect(recorder.statements.join('\n')).not.toContain('contact_phone');
  });

  it('includes it for a signed-in caller', async () => {
    const recorder = recordingDb();
    const repository = createPgRequestsRepository(recorder as never);
    await repository.list({}, { userId: '00000000-0000-4000-8000-000000000000' });
    expect(recorder.statements.join('\n')).toContain('contact_phone');
  });

  it('leaves it out of the detail query too', async () => {
    const recorder = recordingDb();
    const repository = createPgRequestsRepository(recorder as never);
    await repository.findById('00000000-0000-4000-8000-000000000000', null);
    expect(recorder.statements.join('\n')).not.toContain('contact_phone');
  });
});

describe('GET /api/requests — what the feed shows', () => {
  it('shows approved requests only', async () => {
    await seedRequest({ status: 'approved' });
    for (const status of ['pending', 'rejected', 'fulfilled', 'expired']) {
      await seedRequest({ status });
    }
    const response = await request(app).get('/api/requests');
    expect(listSchema.parse(response.body).requests).toHaveLength(1);
  });

  it('hides a request that has expired', async () => {
    // §3 gives requests an expiry so the feed does not fill with stale ones.
    const id = await seedRequest();
    await db.pool.query(
      `UPDATE blood_requests SET expires_at = now() - INTERVAL '1 day' WHERE id = $1`,
      [id],
    );
    expect(
      listSchema.parse((await request(app).get('/api/requests')).body).requests,
    ).toEqual([]);
  });

  it.each([
    ['city', 'city=Bitola', { city: 'Bitola' }],
    ['blood type', 'bloodType=A%2B', { bloodType: 'A+' }],
    ['urgency', 'urgency=critical', { urgency: 'critical' }],
  ])('filters by %s', async (_label, query, matching) => {
    await seedRequest(matching);
    await seedRequest({ city: 'Ohrid', bloodType: 'B-', urgency: 'routine' });
    const response = await request(app).get(`/api/requests?${query}`);
    expect(listSchema.parse(response.body).requests).toHaveLength(1);
  });

  it('newest first', async () => {
    const older = await seedRequest({ city: 'Bitola' });
    await db.pool.query(
      `UPDATE blood_requests SET created_at = now() - INTERVAL '1 hour' WHERE id = $1`,
      [older],
    );
    const newer = await seedRequest({ city: 'Ohrid' });
    const { requests } = listSchema.parse((await request(app).get('/api/requests')).body);
    expect(requests[0]?.id).toBe(newer);
  });
});

describe('GET /api/requests?compatibleWithMe', () => {
  // Registering creates the donor profile too, which is what the filter reads.
  const signInAsDonorWithType = (bloodType: string) => bearer(bloodType);

  it('shows an O− donor every request, because O− can give to anyone', async () => {
    for (const bloodType of ['O-', 'A+', 'B-', 'AB+']) await seedRequest({ bloodType });
    const response = await request(app)
      .get('/api/requests?compatibleWithMe=true')
      .set('Authorization', await signInAsDonorWithType('O-'));
    expect(listSchema.parse(response.body).requests).toHaveLength(4);
  });

  it('shows an AB+ donor only the AB+ request', async () => {
    // The mirror case. Reversing the compatibility join would swap these two
    // results exactly, and both would still look plausible.
    for (const bloodType of ['O-', 'A+', 'B-', 'AB+']) await seedRequest({ bloodType });
    const response = await request(app)
      .get('/api/requests?compatibleWithMe=true')
      .set('Authorization', await signInAsDonorWithType('AB+'));
    const { requests } = listSchema.parse(response.body);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.bloodType).toBe('AB+');
  });

  it('refuses the filter to an anonymous caller, who has no blood type', async () => {
    await seedRequest();
    const response = await request(app).get('/api/requests?compatibleWithMe=true');
    expect(response.status).toBe(401);
  });
});

describe('GET /api/requests/:id', () => {
  it('returns the request with its hospital coordinates (§9.4)', async () => {
    const token = await bearer();
    const created = await request(app)
      .post('/api/requests')
      .set('Authorization', token)
      .send(newRequest);
    const id = detailSchema.parse(created.body).request.id;
    await db.pool.query(`UPDATE blood_requests SET status = 'approved' WHERE id = $1`, [
      id,
    ]);

    const response = await request(app).get(`/api/requests/${id}`);
    expect(response.status).toBe(200);
    const body = detailSchema.parse(response.body);
    expect(body.request.hospitalLat).toBe(41.9981);
    expect(body.request.hospitalLng).toBe(21.4254);
  });

  it('hides the contact phone from an anonymous caller here too', async () => {
    const id = await seedRequest();
    const response = await request(app).get(`/api/requests/${id}`);
    expect(detailSchema.parse(response.body).request).not.toHaveProperty('contactPhone');
    expect(JSON.stringify(response.body)).not.toContain('389 70 123 456');
  });

  it('gives it to a signed-in caller', async () => {
    const id = await seedRequest();
    const response = await request(app)
      .get(`/api/requests/${id}`)
      .set('Authorization', await bearer());
    expect(detailSchema.parse(response.body).request.contactPhone).toBe(CONTACT);
  });

  it('answers the same way for a pending request as for one that does not exist', async () => {
    // A pending request is not public, and a different answer would confirm
    // that it exists.
    const pending = await seedRequest({ status: 'pending' });
    const real = await request(app).get(`/api/requests/${pending}`);
    const missing = await request(app).get(
      '/api/requests/00000000-0000-4000-8000-000000000000',
    );
    expect(real.status).toBe(404);
    expect(real.body).toEqual(missing.body);
  });

  it('treats a malformed id as not found rather than erroring', async () => {
    // blood_requests.id is a uuid column; handing Postgres a bad one raises,
    // which would surface as a 500 for what is really a bad link.
    const response = await request(app).get('/api/requests/not-a-uuid');
    expect(response.status).toBe(404);
  });
});
