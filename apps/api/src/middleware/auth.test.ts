import express from 'express';
import request from 'supertest';
import { serverFor } from '../test/http';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../app';
import { getAuth } from '../auth/context';
import { createFakeAuthRepository } from '../auth/fakeRepository';
import { hashPassword } from '../auth/passwords';
import { signAccessToken } from '../auth/tokens';
import { optionalAuth, requireAuth, requireRole } from './auth';

let repository: ReturnType<typeof createFakeAuthRepository>;

beforeEach(() => {
  repository = createFakeAuthRepository();
});

/** A minimal app so each guard is tested on its own, not through a route. */
function appWith(middleware: express.RequestHandler) {
  const app = express();
  app.get('/probe', middleware, (_req, res) => {
    res.json({ auth: getAuth(res) });
  });
  return app;
}

const bodySchema = z.object({
  auth: z
    .object({ userId: z.string(), role: z.string(), emailVerified: z.boolean() })
    .nullable(),
});

describe('requireAuth', () => {
  it.each([
    ['no Authorization header', undefined],
    ['the wrong scheme', 'Basic abc'],
    ['a bearer with nothing after it', 'Bearer'],
    ['a token that is not a JWT', 'Bearer not-a-jwt'],
    [
      'a token signed with another key',
      'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.wrong',
    ],
  ])('refuses %s', async (_label, header) => {
    const app = appWith(requireAuth(repository));
    const call = request(serverFor(app)).get('/probe');
    if (header) void call.set('Authorization', header);
    const response = await call;
    expect(response.status).toBe(401);
  });

  it('accepts a valid token and records who the caller is', async () => {
    const user = repository.addUser({
      email: 'ana@example.test',
      passwordHash: await hashPassword('a-long-enough-password'),
    });
    const token = await signAccessToken(user.id, 'donor');

    const response = await request(serverFor(appWith(requireAuth(repository))))
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(bodySchema.parse(response.body).auth?.userId).toBe(user.id);
  });

  it('refuses a deactivated account holding a token that has not expired', async () => {
    // The token is still perfectly valid. The account is not.
    const user = repository.addUser({
      email: 'gone@example.test',
      passwordHash: 'x',
      isActive: false,
    });
    const token = await signAccessToken(user.id, 'donor');

    const response = await request(serverFor(appWith(requireAuth(repository))))
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it('refuses a token for a user that no longer exists', async () => {
    const token = await signAccessToken('deleted-user', 'donor');
    const response = await request(serverFor(appWith(requireAuth(repository))))
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
  });
});

describe('requireRole', () => {
  it('works mounted on its own, with no other guard before it', async () => {
    /*
     * A regression guard. requireRole used to read a context that only
     * requireAuth set, so mounting it alone produced a route that refused
     * everyone — an ordering requirement nothing enforced and nothing
     * reported.
     */
    const admin = repository.addUser({
      email: 'admin@example.test',
      passwordHash: 'x',
      role: 'admin',
    });
    const token = await signAccessToken(admin.id, 'admin');

    const response = await request(serverFor(appWith(requireRole(repository, 'admin'))))
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
  });

  it('refuses a role that is not on the list, with 403 rather than 401', async () => {
    // The caller is known; they simply may not do this.
    const donor = repository.addUser({ email: 'd@example.test', passwordHash: 'x' });
    const token = await signAccessToken(donor.id, 'donor');

    const response = await request(serverFor(appWith(requireRole(repository, 'admin'))))
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(
      z.object({ error: z.object({ code: z.string() }) }).parse(response.body).error.code,
    ).toBe('FORBIDDEN');
  });

  it('believes the database, not the role written into the token', async () => {
    /*
     * The whole point of §12's "checked server-side on every route". This
     * token says admin and was signed by us, so it verifies. The account was
     * demoted afterwards. On this system an admin action emails every matching
     * donor, so honouring a fifteen-minute-old claim is not acceptable.
     */
    const user = repository.addUser({
      email: 'demoted@example.test',
      passwordHash: 'x',
      role: 'admin',
    });
    const adminToken = await signAccessToken(user.id, 'admin');

    const before = await request(serverFor(appWith(requireRole(repository, 'admin'))))
      .get('/probe')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(before.status).toBe(200);

    user.role = 'donor';

    const after = await request(serverFor(appWith(requireRole(repository, 'admin'))))
      .get('/probe')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(after.status).toBe(403);
  });

  it('reports the role from the database, not from the token', async () => {
    const user = repository.addUser({
      email: 'promoted@example.test',
      passwordHash: 'x',
      role: 'admin',
    });
    // Token minted while they were a donor; the database says admin now.
    const staleToken = await signAccessToken(user.id, 'donor');

    const response = await request(serverFor(appWith(requireRole(repository, 'admin'))))
      .get('/probe')
      .set('Authorization', `Bearer ${staleToken}`);
    expect(response.status).toBe(200);
    expect(bodySchema.parse(response.body).auth?.role).toBe('admin');
  });

  it('accepts any of several roles', async () => {
    const requester = repository.addUser({
      email: 'r@example.test',
      passwordHash: 'x',
      role: 'requester',
    });
    const token = await signAccessToken(requester.id, 'requester');

    const response = await request(
      serverFor(appWith(requireRole(repository, 'requester', 'admin'))),
    )
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
  });
});

describe('optionalAuth', () => {
  it('lets an anonymous caller through', async () => {
    const response = await request(serverFor(appWith(optionalAuth()))).get('/probe');
    expect(response.status).toBe(200);
    expect(bodySchema.parse(response.body).auth).toBeNull();
  });

  it('treats a bad token as no token rather than an error', async () => {
    // This runs on the public feed. A stale token in a browser must not turn
    // a public page into a failure.
    const response = await request(serverFor(appWith(optionalAuth())))
      .get('/probe')
      .set('Authorization', 'Bearer rubbish');
    expect(response.status).toBe(200);
    expect(bodySchema.parse(response.body).auth).toBeNull();
  });

  it('attaches the caller when the token is good', async () => {
    const user = repository.addUser({ email: 'a@example.test', passwordHash: 'x' });
    const token = await signAccessToken(user.id, 'donor');
    const response = await request(serverFor(appWith(optionalAuth())))
      .get('/probe')
      .set('Authorization', `Bearer ${token}`);
    expect(bodySchema.parse(response.body).auth?.userId).toBe(user.id);
  });
});

describe('GET /api/me', () => {
  const registration = {
    fullName: 'Ana Petrovska',
    email: 'ana@example.com',
    password: 'a-long-enough-password',
    bloodType: 'O-',
    city: 'Bitola',
  };

  it('refuses an anonymous caller', async () => {
    const response = await request(serverFor(createApp(repository))).get('/api/me');
    expect(response.status).toBe(401);
  });

  it('returns the user and their donor profile', async () => {
    const app = createApp(repository);
    const registered = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const token = z
      .object({ accessToken: z.string() })
      .parse(registered.body).accessToken;

    const response = await request(serverFor(app))
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    const body = z
      .object({
        user: z.object({
          email: z.string(),
          role: z.string(),
          emailVerified: z.boolean(),
        }),
        donorProfile: z.object({ bloodType: z.string(), city: z.string() }).nullable(),
      })
      .parse(response.body);

    expect(response.status).toBe(200);
    expect(body.user.email).toBe('ana@example.com');
    expect(body.donorProfile?.bloodType).toBe('O-');
    expect(body.donorProfile?.city).toBe('Bitola');
  });

  it('never returns the password hash', async () => {
    const app = createApp(repository);
    const registered = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const token = z
      .object({ accessToken: z.string() })
      .parse(registered.body).accessToken;
    const response = await request(serverFor(app))
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|password_hash|\$2[aby]\$/,
    );
  });

  it('returns a null profile for someone who is not a donor', async () => {
    const admin = repository.addUser({
      email: 'admin@example.test',
      passwordHash: 'x',
      role: 'admin',
    });
    const token = await signAccessToken(admin.id, 'admin');
    const response = await request(serverFor(createApp(repository)))
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    expect(
      z.object({ donorProfile: z.null() }).parse(response.body).donorProfile,
    ).toBeNull();
  });
});
