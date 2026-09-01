import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createHealthRouter } from './health';
import type { Queryable } from '../db';

/**
 * The two probes, and the difference between them.
 *
 * Worth testing because the distinction is invisible until it matters:
 * /health passed for as long as the process was alive, which meant an uptime
 * monitor pointed at it would have reported a green service with a dead
 * database underneath. No fake here is a substitute for the real query; what
 * these check is that the endpoint reaches the database at all, and what it
 * does when the database will not answer.
 */

/** A database that answers, or does not, on demand. */
const stub = (behaviour: () => Promise<unknown>): Queryable =>
  ({ query: behaviour }) as unknown as Queryable;

const serve = (db: Queryable, options?: { timeoutMs?: number }) => {
  const app = express();
  app.use('/api', createHealthRouter(db, options));
  return app;
};

const up = stub(() => Promise.resolve({ rows: [{ '?column?': 1 }] }));
const down = stub(() => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.4:5432')));
const hung = stub(() => new Promise(() => undefined));

describe('GET /api/health — liveness', () => {
  it('is 200 while the process is alive', async () => {
    const response = await request(serve(up)).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('stays 200 even when the database is unreachable', async () => {
    /*
     * The load-bearing one. Render restarts a service that fails its health
     * check, so if liveness touched the database, a Postgres blip would
     * restart the API — turning a database problem into an API outage and a
     * restart loop. Liveness must not care.
     */
    const response = await request(serve(down)).get('/api/health');
    expect(response.status).toBe(200);
  });
});

describe('GET /api/ready — readiness', () => {
  it('is 200 when the database answers', async () => {
    const response = await request(serve(up)).get('/api/ready');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ready', database: 'up' });
  });

  it('is 503 when the database refuses', async () => {
    const response = await request(serve(down)).get('/api/ready');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'unavailable', database: 'down' });
  });

  it('is 503 rather than hanging when the database never answers', async () => {
    // 20ms rather than the real three seconds. Without the timeout this
    // request would never return, and a monitor would see a hung connection
    // instead of an outage.
    const response = await request(serve(hung, { timeoutMs: 20 })).get('/api/ready');
    expect(response.status).toBe(503);
  });

  it('never says why', async () => {
    /* This endpoint is public — it has to be, or a monitor cannot watch it.
       pg's connection errors name the host, the port and sometimes the user,
       and none of that belongs in an unauthenticated response. */
    const response = await request(serve(down)).get('/api/ready');
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('ECONNREFUSED');
    expect(body).not.toContain('10.0.0.4');
    expect(body).not.toContain('5432');
  });
});
