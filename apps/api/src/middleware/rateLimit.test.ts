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
