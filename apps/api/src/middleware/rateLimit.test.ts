import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { serverFor } from '../test/http';
import { limiter, LIMITS } from './rateLimit';

/**
 * §12's limits, actually exercised.
 *
 * The exported limiters skip outside production, so until `enabled` became a
 * parameter the only way to run this code was to run the suite as production
 * — which nobody was going to do, so the rule that matters most here, three
 * requests an hour, had never been checked at all.
 */

const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string().min(1) }),
});

/** A tiny app behind one limiter, so nothing else is in the way. */
function appWith(windowMs: number, max: number) {
  const app = express();
  app.use(limiter(windowMs, max, { enabled: true }));
  app.get('/thing', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('the numbers §12 sets', () => {
  it('are five a minute on auth, three an hour on posting, sixty otherwise', () => {
    // Asserted rather than restated: these are the values the middleware is
    // built from, so a change to one is a change to this line.
    expect(LIMITS.auth).toEqual({ windowMs: 60_000, max: 5 });
    expect(LIMITS.createRequest).toEqual({ windowMs: 3_600_000, max: 3 });
    expect(LIMITS.general).toEqual({ windowMs: 60_000, max: 60 });
  });
});

describe('a limiter that is switched on', () => {
  it('lets the allowance through and refuses the next one', async () => {
    const app = appWith(60_000, 3);
    for (let i = 0; i < 3; i += 1) {
      expect((await request(serverFor(app)).get('/thing')).status).toBe(200);
    }
    expect((await request(serverFor(app)).get('/thing')).status).toBe(429);
  });

  it('answers in the same error envelope as everything else', async () => {
    /* A 429 that is not the standard shape is one the client cannot show a
       person, and this is the response a requester meets on their fourth
       attempt in an hour. */
    const app = appWith(60_000, 1);
    await request(serverFor(app)).get('/thing');
    const response = await request(serverFor(app)).get('/thing');

    expect(response.status).toBe(429);
    expect(errorSchema.parse(response.body).error.code).toBe('RATE_LIMITED');
  });

  it('says how long to wait, in the standard headers', async () => {
    // draft-7: a client that wants to back off politely can.
    const app = appWith(60_000, 1);
    await request(serverFor(app)).get('/thing');
    const response = await request(serverFor(app)).get('/thing');
    expect(response.headers['retry-after']).toBeDefined();
  });
});

describe('who a limit applies to', () => {
  /*
   * express-rate-limit keys on req.ip, and behind a reverse proxy req.ip is
   * the proxy unless the app is told how many hops to trust. That is not a
   * tuning detail: without it every user on the internet shares one bucket,
   * and five failed logins in a minute lock out everybody at once.
   *
   * The app sets this from TRUST_PROXY_HOPS. These two tests are what the
   * setting is for.
   */
  function appWithProxyTrust(trust: number | false) {
    const app = express();
    app.set('trust proxy', trust);
    app.use(limiter(60_000, 1, { enabled: true }));
    app.get('/thing', (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  }

  /* One entry, which is what a single proxy in front of the app produces:
     it appends the address it accepted the connection from, and is itself
     the socket peer. Adding a second hop here would make both requests look
     like they came from that hop — my first version of this test did, and
     it failed for that reason rather than for the code's. */
  const from = (app: express.Express, client: string) =>
    request(serverFor(app)).get('/thing').set('X-Forwarded-For', client);

  it('gives two clients behind a proxy their own allowance', async () => {
    const app = appWithProxyTrust(1);
    expect((await from(app, '203.0.113.9')).status).toBe(200);
    // A different client, still within its own first request.
    expect((await from(app, '198.51.100.4')).status).toBe(200);
  });

  it('would otherwise let one client use up everybody else’s', async () => {
    /* The bug this guards against, demonstrated: with no proxy trusted both
       requests are attributed to the same address and the second is refused
       — a stranger's failed login locking out a donor. */
    const app = appWithProxyTrust(false);
    expect((await from(app, '203.0.113.9')).status).toBe(200);
    expect((await from(app, '198.51.100.4')).status).toBe(429);
  });
});

describe('a limiter that is switched off', () => {
  it('never refuses, which is why the suite is not order-dependent', async () => {
    const app = express();
    app.use(limiter(60_000, 1, { enabled: false }));
    app.get('/thing', (_req, res) => {
      res.json({ ok: true });
    });

    for (let i = 0; i < 5; i += 1) {
      expect((await request(serverFor(app)).get('/thing')).status).toBe(200);
    }
  });
});
