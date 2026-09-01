import request from 'supertest';
import { serverFor } from '../test/http';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../app';
import { createFakeAuthRepository } from './fakeRepository';
import { noVerificationEmail } from '../test/mail';
import { REFRESH_COOKIE } from './cookies';
import { hashPassword } from './passwords';
import { ACCESS_TOKEN_TTL_SECONDS, verifyAccessToken } from './tokens';

const PASSWORD = 'a-long-enough-password';

const registration = {
  fullName: 'Ana Petrovska',
  email: 'ana@example.com',
  password: PASSWORD,
  bloodType: 'O-',
  city: 'Bitola',
};

let repository: ReturnType<typeof createFakeAuthRepository>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  repository = createFakeAuthRepository();
  // Registration mails a confirmation link; this file is about everything
  // else it does. See auth/verification.test.ts for the link itself.
  app = createApp(repository, undefined, undefined, undefined, noVerificationEmail);
});

/*
 * supertest types a response body as `any`. Parsing it through a schema types
 * it and asserts the shape at the same time, so a response that quietly
 * changed shape fails here rather than in the browser.
 */
const sessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number(),
  user: z.object({
    id: z.string().min(1),
    email: z.string(),
    fullName: z.string(),
    role: z.string(),
    emailVerified: z.boolean(),
  }),
});

const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().min(1),
    field: z.string().optional(),
  }),
});

const session = (response: request.Response) => sessionSchema.parse(response.body);
const errorBody = (response: request.Response) => errorSchema.parse(response.body);
const setCookies = (response: request.Response): string[] =>
  (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

/** Pulls the refresh cookie's value out of a Set-Cookie header. */
function refreshCookieFrom(response: request.Response): string | undefined {
  const cookie = setCookies(response).find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  return cookie?.split(';')[0]?.split('=')[1];
}

function refreshCookieHeader(response: request.Response): string {
  return `${REFRESH_COOKIE}=${refreshCookieFrom(response) ?? ''}`;
}

describe('POST /api/auth/register', () => {
  it('creates the account and starts a session', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    expect(response.status).toBe(201);
    const body = session(response);
    expect(body.user.email).toBe('ana@example.com');
    expect(body.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('returns an access token that verifies and carries the role', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const body = session(response);
    const claims = await verifyAccessToken(body.accessToken);
    expect(claims?.sub).toBe(body.user.id);
    expect(claims?.role).toBe('donor');
  });

  it('signs the access token for 15 minutes (§12)', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const claims = await verifyAccessToken(session(response).accessToken);
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBe(15 * 60);
  });

  it('never returns the password hash', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|password_hash|\$2[aby]\$/,
    );
  });

  it('starts unverified — verification gates notifications, not sign-in (§12)', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    expect(session(response).user.emailVerified).toBe(false);
  });

  it('rejects a duplicate email', async () => {
    await request(serverFor(app)).post('/api/auth/register').send(registration);
    const second = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    expect(second.status).toBe(409);
    expect(errorBody(second).error.code).toBe('EMAIL_TAKEN');
    expect(errorBody(second).error.field).toBe('email');
  });

  it('validates against the shared schema before touching a handler', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send({ ...registration, city: 'Atlantis' });
    expect(response.status).toBe(400);
    expect(errorBody(response).error.field).toBe('city');
  });

  it('rejects an unknown key rather than storing it', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send({ ...registration, role: 'admin' });
    expect(response.status).toBe(400);
  });
});

describe('login cannot be used to find out who has an account', () => {
  /*
   * §12. The whole property is that a wrong password and an email nobody has
   * registered are indistinguishable — otherwise the login form is a
   * membership oracle, and for this product membership means "is a blood
   * donor", which is health-adjacent information about a named person.
   *
   * Asserted on the whole response rather than on the code alone, because a
   * difference anywhere — status, message, field, headers — leaks it just as
   * well as a different code would.
   */
  const registration = {
    fullName: 'Ana Petrovska',
    email: 'ana@example.com',
    password: PASSWORD,
    bloodType: 'O-',
    city: 'Bitola',
  };

  it('answers a wrong password and an unknown email identically', async () => {
    await request(serverFor(app)).post('/api/auth/register').send(registration);

    const wrongPassword = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'not-the-password' });
    const unknownEmail = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });

    expect(wrongPassword.status).toBe(unknownEmail.status);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('says the same thing to a deactivated account', async () => {
    // A third case that must not be its own answer: "your account is
    // disabled" tells a stranger the account exists.
    const created = repository.addUser({
      email: 'paused@example.com',
      passwordHash: await hashPassword(PASSWORD),
      isActive: false,
    });
    expect(created.isActive).toBe(false);

    const deactivated = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'paused@example.com', password: PASSWORD });
    const unknown = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });

    expect(deactivated.status).toBe(unknown.status);
    expect(deactivated.body).toEqual(unknown.body);
  });

  it('still tells a registering user that an email is taken', async () => {
    /* The mirror of the rule, and not a contradiction of it: registration
       cannot hide a duplicate — the person has to be told why it failed —
       and login is where enumeration is worth preventing. */
    await request(serverFor(app)).post('/api/auth/register').send(registration);
    const second = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);

    expect(second.status).toBe(409);
    expect(errorBody(second).error.code).toBe('EMAIL_TAKEN');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    repository.addUser({
      email: 'ana@example.com',
      passwordHash: await hashPassword(PASSWORD),
    });
  });

  it('returns a session for the right password', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: PASSWORD });
    expect(response.status).toBe(200);
    expect(session(response).accessToken).toBeTruthy();
  });

  it('matches the email case-insensitively, as CITEXT does', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'ANA@Example.com', password: PASSWORD });
    expect(response.status).toBe(200);
  });

  it('says exactly the same thing for a wrong password, an unknown email, and a disabled account', async () => {
    // Anything that differs between these tells an attacker which emails have
    // accounts (§12).
    repository.addUser({
      email: 'gone@example.com',
      passwordHash: await hashPassword(PASSWORD),
      isActive: false,
    });

    const wrongPassword = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'not-the-password' });
    const unknownEmail = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });
    const disabled = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'gone@example.com', password: PASSWORD });

    for (const response of [wrongPassword, unknownEmail, disabled]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual(unknownEmail.body);
    }
  });

  it('does not enforce the registration password policy on login', async () => {
    // Rejecting a short password here would reveal the rule to anyone probing.
    const response = await request(serverFor(app))
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'x' });
    expect(response.status).toBe(401);
    expect(errorBody(response).error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('the refresh cookie', () => {
  it('is httpOnly, SameSite=Strict and scoped to the auth routes (§12)', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const header = setCookies(response).find((c) => c.startsWith(REFRESH_COOKIE));
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Strict/i);
    expect(header).toMatch(/Path=\/api\/auth/i);
  });

  it('carries the token itself, which never reaches the response body', async () => {
    // §12: never store a JWT in localStorage. The client cannot read this
    // cookie at all, which is the point.
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const token = refreshCookieFrom(response);
    expect(token).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain(token ?? 'unset');
  });

  it('stores only a hash of the token, never the token', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const token = refreshCookieFrom(response) ?? '';
    const stored = [...repository.tokens.values()].map((t) => t.tokenHash);
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toBe(token);
    expect(stored[0]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new access token and rotates the refresh token', async () => {
    const registered = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const first = refreshCookieFrom(registered);

    const refreshed = await request(serverFor(app))
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookieHeader(registered));

    expect(refreshed.status).toBe(200);
    expect(session(refreshed).accessToken).toBeTruthy();
    expect(refreshCookieFrom(refreshed)).not.toBe(first);
  });

  it('stops accepting the token it just replaced', async () => {
    const registered = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const oldCookie = refreshCookieHeader(registered);
    await request(serverFor(app)).post('/api/auth/refresh').set('Cookie', oldCookie);

    const replay = await request(serverFor(app))
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
  });

  it('ends every session when a replaced token is presented again', async () => {
    /*
     * The legitimate holder already rotated this token. Whoever sent it either
     * copied it or is replaying — either way the session is not trustworthy,
     * so the whole family goes and everyone signs in again.
     */
    const registered = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const oldCookie = refreshCookieHeader(registered);
    const rotated = await request(serverFor(app))
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie);

    await request(serverFor(app)).post('/api/auth/refresh').set('Cookie', oldCookie);

    const currentStillWorks = await request(serverFor(app))
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookieHeader(rotated));
    expect(currentStillWorks.status).toBe(401);
    expect([...repository.tokens.values()].every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('refuses without a cookie', async () => {
    const response = await request(serverFor(app)).post('/api/auth/refresh');
    expect(response.status).toBe(401);
    expect(errorBody(response).error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a token that is not in the database', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=made-up`);
    expect(response.status).toBe(401);
  });

  it('refuses an expired token and revokes it', async () => {
    const registered = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    for (const record of repository.tokens.values()) {
      record.expiresAt = new Date(Date.now() - 1000);
    }
    const response = await request(serverFor(app))
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookieHeader(registered));
    expect(response.status).toBe(401);
    expect([...repository.tokens.values()][0]?.revokedAt).not.toBeNull();
  });

  it('refuses once the account is deactivated, without waiting for expiry', async () => {
    const registered = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    for (const user of repository.users.values()) user.isActive = false;

    const response = await request(serverFor(app))
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookieHeader(registered));
    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const registered = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const response = await request(serverFor(app))
      .post('/api/auth/logout')
      .set('Cookie', refreshCookieHeader(registered));

    expect(response.status).toBe(204);
    expect([...repository.tokens.values()][0]?.revokedAt).not.toBeNull();
    const cleared = setCookies(response).find((c) => c.startsWith(REFRESH_COOKIE));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  it('makes the refresh token unusable afterwards', async () => {
    const registered = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    const cookie = refreshCookieHeader(registered);
    await request(serverFor(app)).post('/api/auth/logout').set('Cookie', cookie);

    const response = await request(serverFor(app))
      .post('/api/auth/refresh')
      .set('Cookie', cookie);
    expect(response.status).toBe(401);
  });

  it('succeeds with no session, and says nothing about whether there was one', async () => {
    const response = await request(serverFor(app)).post('/api/auth/logout');
    expect(response.status).toBe(204);
  });
});
