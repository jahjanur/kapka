import request from 'supertest';
import { serverFor } from '../test/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { createFakeAuthRepository } from './fakeRepository';
import { noVerificationEmail } from '../test/mail';
import { OAUTH_STATE_COOKIE, REFRESH_COOKIE } from './cookies';
import { statesMatch } from './google';

/**
 * Sign in with Google (§9.2).
 *
 * The exchange with Google is mocked and everything else is real: real HTTP,
 * real routing, real cookies, real account resolution. What is worth testing
 * here is not that `fetch` was called — it is who ends up signed in, and who
 * is refused.
 */
/*
 * env is a singleton computed once at import (`export const env = parseEnv()`),
 * so stubbing process.env after the fact changes nothing. A Proxy over the
 * real env leaves every other setting exactly as it is and answers only for
 * the three this file is about — `configured` is what the "not configured"
 * test flips.
 */
const config = vi.hoisted(() => ({ configured: true }));

vi.mock('../env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../env')>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get(target, property) {
        if (property === 'googleEnabled') return config.configured;
        if (property === 'GOOGLE_CLIENT_ID') return 'test-client-id';
        if (property === 'GOOGLE_CLIENT_SECRET') return 'test-client-secret';
        return Reflect.get(target, property) as unknown;
      },
    }),
  };
});

vi.mock('./google', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./google')>();
  return { ...actual, exchangeCode: vi.fn() };
});

const { exchangeCode } = await import('./google');
const mockedExchange = vi.mocked(exchangeCode);

const IDENTITY = {
  subject: 'google-subject-1',
  email: 'ana@example.com',
  emailVerified: true,
  fullName: 'Ana Petrovska',
};

let repository: ReturnType<typeof createFakeAuthRepository>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  config.configured = true;
  repository = createFakeAuthRepository();
  app = createApp(repository, undefined, undefined, undefined, noVerificationEmail);
  mockedExchange.mockReset();
  mockedExchange.mockResolvedValue(IDENTITY);
});

/** Runs the redirect the browser would follow, and returns what came back. */
async function startAndCallback(
  overrides: { state?: string; cookie?: string | null; query?: string } = {},
) {
  const start = await request(serverFor(app)).get('/api/auth/google');
  const setCookie = start.headers['set-cookie'] as unknown as string[] | undefined;
  const stateCookie = (setCookie ?? []).find((c) => c.startsWith(OAUTH_STATE_COOKIE));
  const raw = decodeURIComponent((stateCookie ?? '').split(';')[0]?.split('=')[1] ?? '');
  const handshake = raw ? (JSON.parse(raw) as { state: string }) : { state: '' };

  const state = overrides.state ?? handshake.state;
  const cookie =
    overrides.cookie === null
      ? undefined
      : (overrides.cookie ?? `${OAUTH_STATE_COOKIE}=${encodeURIComponent(raw)}`);

  const call = request(serverFor(app)).get(
    overrides.query ??
      `/api/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`,
  );
  if (cookie) call.set('Cookie', cookie);
  return { response: await call, start };
}

describe('GET /api/auth/providers', () => {
  it('offers google when it is configured', async () => {
    const response = await request(serverFor(app)).get('/api/auth/providers');
    expect(response.body).toEqual({ providers: ['google'] });
  });

  it('offers nothing when it is not', async () => {
    /* The gate reads this to decide whether to draw the button at all. A
       deployment with no credentials must draw none — a button that redirects
       to a failure is worse than no button. */
    config.configured = false;
    const response = await request(serverFor(app)).get('/api/auth/providers');
    expect(response.body).toEqual({ providers: [] });
  });
});

describe('GET /api/auth/google', () => {
  it('sends the browser to Google with PKCE and a state', async () => {
    const response = await request(serverFor(app)).get('/api/auth/google');

    expect(response.status).toBe(302);
    const target = new URL(String(response.headers.location));
    expect(target.origin + target.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('code_challenge')).toBeTruthy();
    // The verifier itself must never leave the server.
    expect(String(response.headers.location)).not.toContain('code_verifier');
    expect(target.searchParams.get('state')).toBeTruthy();
  });

  it('carries the handshake in a Lax cookie, not a Strict one', async () => {
    /* The whole reason this is a separate cookie. Coming back from Google is
       a cross-site top-level navigation, and a Strict cookie is not sent on
       one — every sign-in would fail at the state check. */
    const response = await request(serverFor(app)).get('/api/auth/google');
    const cookie = (response.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith(OAUTH_STATE_COOKIE),
    );
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('is not there at all when google is not configured', async () => {
    config.configured = false;
    const response = await request(serverFor(app)).get('/api/auth/google');
    expect(response.status).toBe(404);
  });
});

describe('GET /api/auth/google/callback', () => {
  it('creates an account, signs it in, and sends no token in the URL', async () => {
    const { response } = await startAndCallback();

    expect(response.status).toBe(302);
    const target = String(response.headers.location);
    expect(target).toContain('/auth/callback');
    expect(target).not.toContain('error=');
    /* §12: a token in a query string ends up in history, in server logs and
       in the Referer of everything the next page loads. */
    expect(target).not.toMatch(/token|code|secret/i);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith(REFRESH_COOKIE))).toBe(true);

    const created = [...repository.users.values()][0];
    expect(created?.email).toBe('ana@example.com');
    // No password at all, rather than a hash of something nobody knows.
    expect(created?.passwordHash).toBeNull();
    expect(created?.emailVerified).toBe(true);
  });

  it('creates no donor profile, because Google knows neither', async () => {
    await startAndCallback();
    const created = [...repository.users.values()][0];
    expect(created).toBeDefined();
    // blood type and city are NOT NULL and are nobody's to invent (§4).
    expect(repository.profiles.get(created?.id ?? '')).toBeUndefined();
  });

  it('returns the same account the second time, not a second one', async () => {
    await startAndCallback();
    await startAndCallback();
    expect(repository.users.size).toBe(1);
    expect(repository.identities).toHaveLength(1);
  });

  it('links to an existing account when Google says the email is verified', async () => {
    const existing = repository.addUser({
      email: 'ana@example.com',
      passwordHash: 'a-real-bcrypt-hash',
      fullName: 'Ana Petrovska',
    });

    const { response } = await startAndCallback();

    expect(String(response.headers.location)).not.toContain('error=');
    expect(repository.users.size).toBe(1);
    expect(repository.identities[0]?.userId).toBe(existing.id);
    // The password still works — linking adds a way in, it does not replace one.
    expect(repository.users.get(existing.id)?.passwordHash).toBe('a-real-bcrypt-hash');
  });

  it('refuses to link an existing account on an unverified email', async () => {
    /*
     * The account-takeover case, and the reason emailVerified is read at all:
     * make a Google account claiming ana@example.com, never prove you read
     * that mailbox, sign in here, and be Ana (§12).
     */
    repository.addUser({
      email: 'ana@example.com',
      passwordHash: 'a-real-bcrypt-hash',
      fullName: 'Ana Petrovska',
    });
    mockedExchange.mockResolvedValue({ ...IDENTITY, emailVerified: false });

    const { response } = await startAndCallback();

    expect(String(response.headers.location)).toContain('error=unverified');
    expect(repository.identities).toHaveLength(0);
    expect(
      (response.headers['set-cookie'] as unknown as string[] | undefined)?.some((c) =>
        c.startsWith(REFRESH_COOKIE),
      ),
    ).toBeFalsy();
  });

  it('refuses a callback whose state does not match', async () => {
    const { response } = await startAndCallback({ state: 'not-the-state-we-issued' });
    expect(String(response.headers.location)).toContain('error=state');
    expect(repository.users.size).toBe(0);
  });

  it('refuses a callback with no handshake cookie', async () => {
    const { response } = await startAndCallback({ cookie: null });
    expect(String(response.headers.location)).toContain('error=expired');
    expect(repository.users.size).toBe(0);
  });

  it('sends someone who pressed cancel back without an account', async () => {
    const response = await request(serverFor(app)).get(
      '/api/auth/google/callback?error=access_denied',
    );
    expect(String(response.headers.location)).toContain('error=cancelled');
    expect(repository.users.size).toBe(0);
  });

  it('does not sign in a deactivated account', async () => {
    repository.addUser({
      email: 'ana@example.com',
      passwordHash: null,
      fullName: 'Ana Petrovska',
      isActive: false,
    });
    await startAndCallback();
    const { response } = await startAndCallback();
    expect(String(response.headers.location)).toContain('error=inactive');
  });

  it('says nothing about why the exchange failed', async () => {
    /* The token endpoint quotes the request back, client_secret included.
       Whatever went wrong, the browser is told one opaque word. */
    mockedExchange.mockRejectedValue(new Error('client_secret=super-secret is wrong'));
    const { response } = await startAndCallback();
    expect(String(response.headers.location)).toContain('error=provider');
    expect(String(response.headers.location)).not.toContain('secret');
  });
});

describe('statesMatch', () => {
  it('accepts a pair and rejects everything else', () => {
    expect(statesMatch('abc', 'abc')).toBe(true);
    expect(statesMatch('abc', 'abd')).toBe(false);
    // Length differences must be an answer, not a thrown exception.
    expect(statesMatch('abc', 'abcd')).toBe(false);
    expect(statesMatch('', '')).toBe(true);
  });
});
