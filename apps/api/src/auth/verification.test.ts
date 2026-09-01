import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { serverFor } from '../test/http';
import { createApp } from '../app';
import { createFakeAuthRepository } from './fakeRepository';
import { createVerificationSender } from './verification';
import { hashVerificationToken } from './tokens';
import type { Mailer, OutgoingEmail } from '../notify/mailer';

/**
 * §12: "donors only enter the notification pool after verifying their email."
 *
 * The matching query has always refused a donor whose email_verified is FALSE.
 * Until this flow existed, nothing could ever set it to TRUE — so the rule was
 * enforced perfectly and nobody could ever satisfy it. These tests are about
 * the half that lets someone satisfy it.
 *
 * The sender is the real one, wired to a mailer that records instead of
 * connecting. That way the token under test is the token a donor would receive
 * — pulled out of the link in the email, not out of the repository.
 */

const PASSWORD = 'a-long-enough-password';
const BASE_URL = 'https://kapka.mk';

const registration = {
  fullName: 'Ana Petrovska',
  email: 'ana@example.com',
  password: PASSWORD,
  bloodType: 'O-',
  city: 'Bitola',
};

function recordingMailer(): Mailer & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    send(email) {
      sent.push(email);
      return Promise.resolve({ providerId: `msg-${String(sent.length)}` });
    },
  };
}

let repository: ReturnType<typeof createFakeAuthRepository>;
let mailer: ReturnType<typeof recordingMailer>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  repository = createFakeAuthRepository();
  mailer = recordingMailer();
  app = createApp(
    repository,
    undefined,
    undefined,
    undefined,
    createVerificationSender(repository, { mailer, baseUrl: BASE_URL }),
  );
});

const userSchema = z.object({
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

/** The nth email that went out, or a failure naming what was missing. */
function sentEmail(index: number): OutgoingEmail {
  const email = mailer.sent[index];
  if (!email) throw new Error(`no email was sent at position ${String(index)}`);
  return email;
}

/** The link a donor would tap, as it appears in the mail they received. */
function linkFrom(email: OutgoingEmail): URL {
  const found = /https:\/\/\S+/.exec(email.text);
  if (!found) throw new Error('the email carried no link');
  return new URL(found[0]);
}

function tokenFrom(email: OutgoingEmail): string {
  const token = linkFrom(email).searchParams.get('token');
  if (!token) throw new Error('the link carried no token');
  return token;
}

/** Registers, and hands back the session and the token that was mailed. */
async function registerDonor(): Promise<{ accessToken: string; token: string }> {
  const response = await request(serverFor(app))
    .post('/api/auth/register')
    .send(registration);
  expect(response.status).toBe(201);
  const accessToken = (response.body as { accessToken: string }).accessToken;
  const email = mailer.sent.at(-1);
  if (!email) throw new Error('registration sent no confirmation email');
  return { accessToken, token: tokenFrom(email) };
}

const verify = (token: string) =>
  request(serverFor(app)).post('/api/auth/verify-email').send({ token });

const resend = (accessToken?: string) => {
  const call = request(serverFor(app)).post('/api/auth/verify-email/resend');
  return accessToken ? call.set('Authorization', `Bearer ${accessToken}`) : call;
};

describe('the confirmation email registration sends', () => {
  it('goes to the address that was registered, once', async () => {
    await registerDonor();
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe('ana@example.com');
  });

  it('links at the web app, not at the API', async () => {
    // A link into the API would be a GET that spends the token, and corporate
    // mail scanners follow links before the recipient does.
    const { token } = await registerDonor();
    const link = linkFrom(sentEmail(0));
    expect(link.origin).toBe(BASE_URL);
    expect(link.pathname).toBe('/verify-email');
    expect(link.searchParams.get('token')).toBe(token);
  });

  it('stores the hash of the token and never the token (§12)', async () => {
    const { token } = await registerDonor();
    const stored = [...repository.verifications.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(hashVerificationToken(token));
    expect(stored[0]?.tokenHash).not.toBe(token);
  });

  it('leaves the donor unverified until the link is opened', async () => {
    await registerDonor();
    expect([...repository.users.values()][0]?.emailVerified).toBe(false);
  });

  it('still registers the donor when the mail cannot be sent', async () => {
    /* A provider outage must not throw away a completed registration. The
       account exists, the password is right, and another link can be asked
       for — failing the request would lose all of that. */
    const failing: Mailer = {
      send: () => Promise.reject(new Error('SendGrid responded 503')),
    };
    app = createApp(
      repository,
      undefined,
      undefined,
      undefined,
      createVerificationSender(repository, { mailer: failing, baseUrl: BASE_URL }),
    );

    const response = await request(serverFor(app))
      .post('/api/auth/register')
      .send(registration);
    expect(response.status).toBe(201);
    expect(repository.users.size).toBe(1);
  });
});

describe('POST /api/auth/verify-email', () => {
  it('verifies the account and says so', async () => {
    const { token } = await registerDonor();
    const response = await verify(token);

    expect(response.status).toBe(200);
    expect(userSchema.parse(response.body).user.emailVerified).toBe(true);
    expect([...repository.users.values()][0]?.emailVerified).toBe(true);
  });

  it('needs no session — the link is opened wherever the mail was read', async () => {
    // A donor reading their mail on a phone is not signed in in that browser,
    // and a confirmation that only works in the tab you registered from is a
    // confirmation most people never complete.
    const { token } = await registerDonor();
    expect((await verify(token)).status).toBe(200);
  });

  it('treats a second tap on the same link as a success', async () => {
    const { token } = await registerDonor();
    await verify(token);

    const second = await verify(token);
    expect(second.status).toBe(200);
    expect(userSchema.parse(second.body).user.emailVerified).toBe(true);
  });

  it('refuses a token nobody was ever sent', async () => {
    await registerDonor();
    const response = await verify('not-a-real-token');
    expect(response.status).toBe(400);
    expect(errorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses an expired one, and says that is what happened', async () => {
    const { token } = await registerDonor();
    // Age the token rather than the clock: what matters is that the row is
    // past its expiry, however it got there.
    for (const record of repository.verifications.values()) {
      record.expiresAt = new Date(Date.now() - 1000);
    }

    const response = await verify(token);
    expect(response.status).toBe(400);
    expect(errorSchema.parse(response.body).error.message).toMatch(/expired/i);
  });

  it('rejects a body with no token at all', async () => {
    const response = await request(serverFor(app))
      .post('/api/auth/verify-email')
      .send({});
    expect(response.status).toBe(400);
    expect(errorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('never returns anything but the public user', async () => {
    const { token } = await registerDonor();
    const response = await verify(token);
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|password_hash|\$2[aby]\$|tokenHash/,
    );
  });

  it('spends every outstanding link for that donor, not only the one used', async () => {
    /* A donor who asked twice has one mailbox. Leaving the older link live is
       a second bearer credential for no benefit. */
    const { accessToken } = await registerDonor();
    for (const record of repository.verifications.values()) {
      record.createdAt = new Date(Date.now() - 10 * 60 * 1000);
    }
    await resend(accessToken);
    expect(mailer.sent).toHaveLength(2);

    const newest = tokenFrom(sentEmail(1));
    await verify(newest);

    const outstanding = [...repository.verifications.values()].filter(
      (record) => !record.consumedAt,
    );
    expect(outstanding).toHaveLength(0);
  });
});

describe('POST /api/auth/verify-email/resend', () => {
  it('refuses a caller with no session', async () => {
    // Taking an address in the body instead would be both an account
    // enumerator and a way to send Kapka-branded mail to strangers.
    await registerDonor();
    expect((await resend()).status).toBe(401);
  });

  it('sends another link, with a token of its own', async () => {
    const { accessToken, token } = await registerDonor();
    for (const record of repository.verifications.values()) {
      record.createdAt = new Date(Date.now() - 10 * 60 * 1000);
    }

    const response = await resend(accessToken);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: true, emailVerified: false });
    expect(mailer.sent).toHaveLength(2);
    expect(tokenFrom(sentEmail(1))).not.toBe(token);
  });

  it('refuses a second one straight away, per account', async () => {
    /* The per-IP limiter cannot cover this: the thing being protected is
       somebody else's inbox, and a hundred requests from a hundred addresses
       for one account is a mail bomb every one of them would wave through. */
    const { accessToken } = await registerDonor();
    const response = await resend(accessToken);

    expect(response.status).toBe(429);
    expect(errorSchema.parse(response.body).error.code).toBe('RATE_LIMITED');
    expect(mailer.sent).toHaveLength(1);
  });

  it('sends nothing to an address that is already confirmed', async () => {
    const { accessToken, token } = await registerDonor();
    await verify(token);
    for (const record of repository.verifications.values()) {
      record.createdAt = new Date(Date.now() - 10 * 60 * 1000);
    }

    const response = await resend(accessToken);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: false, emailVerified: true });
    expect(mailer.sent).toHaveLength(1);
  });
});
