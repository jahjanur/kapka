import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CITIES, ERROR_CODES } from '@kapka/shared';
import { createApp } from './app';
import { createFakeAuthRepository } from './auth/fakeRepository';
import { createFakeRequestsRepository } from './requests/fakeRepository';
import { hashPassword } from './auth/passwords';

const repository = createFakeAuthRepository();
const app = createApp(repository, createFakeRequestsRepository());

/** Signs in and returns an Authorization header value. */
async function bearer(): Promise<string> {
  const email = `caller-${String(repository.users.size)}@example.test`;
  repository.addUser({
    email,
    passwordHash: await hashPassword('a-long-enough-password'),
  });
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'a-long-enough-password' });
  const body = z.object({ accessToken: z.string() }).parse(response.body);
  return `Bearer ${body.accessToken}`;
}

/**
 * The envelope every endpoint must return (§4), as a runtime check rather
 * than a cast — a cast would make the shape assertions vacuously true.
 */
const errorEnvelope = z.strictObject({
  error: z.strictObject({
    code: z.enum(ERROR_CODES),
    message: z.string().min(1),
    field: z.string().optional(),
  }),
});

/**
 * The envelope's own inferred type, not the shared ApiErrorBody. Zod's
 * .optional() widens `field` to `string | undefined`, which under
 * exactOptionalPropertyTypes is genuinely looser than the contract's
 * `field?: string` — the contract never assigns undefined, and it stays the
 * stricter of the two.
 */
type ErrorEnvelope = z.infer<typeof errorEnvelope>;

/** Parses the body as an error envelope, failing the test if it is not one. */
function expectErrorBody(body: unknown): ErrorEnvelope {
  const parsed = errorEnvelope.safeParse(body);
  expect(parsed.error?.message ?? 'valid envelope').toBe('valid envelope');
  if (!parsed.success) throw new Error('unreachable');
  return parsed.data;
}

describe('GET /api/health', () => {
  it('answers without touching anything downstream', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    const body = z.object({ status: z.string() }).parse(response.body);
    expect(body.status).toBe('ok');
  });
});

describe('GET /api/cities', () => {
  it('serves exactly the canonical list from @kapka/shared', async () => {
    // The dropdown and the validator read the same constant. If this ever
    // drifts, a donor silently stops matching requests in their own city.
    const response = await request(app).get('/api/cities');
    expect(response.status).toBe(200);
    const body = z.object({ cities: z.array(z.string()) }).parse(response.body);
    expect(body.cities).toEqual([...CITIES]);
  });
});

describe('POST /api/requests authorisation', () => {
  const valid = {
    bloodType: 'O-',
    hospitalName: 'City General Hospital',
    city: 'Skopje',
    contactPhone: '+389 70 123 456',
  };

  it('refuses an anonymous caller', async () => {
    const response = await request(app).post('/api/requests').send(valid);
    expect(response.status).toBe(401);
    expect(expectErrorBody(response.body).error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a made-up token', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', 'Bearer not-a-real-token')
      .send(valid);
    expect(response.status).toBe(401);
  });

  it('checks authorisation before validating the body', async () => {
    // An unauthorised caller should not learn which fields the schema wants.
    const response = await request(app).post('/api/requests').send({ nonsense: true });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/requests validation', () => {
  const valid = {
    bloodType: 'O-',
    hospitalName: 'City General Hospital',
    city: 'Skopje',
    contactPhone: '+389 70 123 456',
  };

  it('rejects a blood type outside the eight, naming the field', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', await bearer())
      .send({ ...valid, bloodType: 'Z+' });
    expect(response.status).toBe(400);
    const body = expectErrorBody(response.body);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.field).toBe('bloodType');
  });

  it('rejects an unknown key rather than ignoring it', async () => {
    // The mass-assignment guard: a client cannot smuggle in a field the
    // schema does not declare.
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', await bearer())
      .send({ ...valid, isAdmin: true });
    expect(response.status).toBe(400);
    expect(expectErrorBody(response.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('normalises a city rather than rejecting a different spelling', async () => {
    // "bitola " and "Битола" are the same city. §3 asks for them to be
    // normalised at write time, not refused.
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', await bearer())
      .send({ ...valid, city: 'bitola ' });
    expect(response.status).toBe(201);
  });

  it('rejects a city that is not on the list at all', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', await bearer())
      .send({ ...valid, city: 'Atlantis' });
    expect(response.status).toBe(400);
    expect(expectErrorBody(response.body).error.field).toBe('city');
  });

  it('lets a valid body through to the handler', async () => {
    const response = await request(app)
      .post('/api/requests')
      .set('Authorization', await bearer())
      .send(valid);
    expect(response.status).toBe(201);
  });
});

describe('error envelope consistency (§4)', () => {
  it('uses the same shape for an unknown path', async () => {
    const response = await request(app).get('/api/definitely-not-a-route');
    expect(response.status).toBe(404);
    expect(expectErrorBody(response.body).error.code).toBe('NOT_FOUND');
  });

  it('never returns a bare string or an unwrapped error', async () => {
    for (const path of ['/api/definitely-not-a-route', '/api/requests']) {
      const response = await request(app).get(path);
      if (response.status >= 400) expectErrorBody(response.body);
    }
  });
});
