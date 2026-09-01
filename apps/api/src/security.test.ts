import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { serverFor } from '../src/test/http';
import { createApp } from './app';
import { createFakeAuthRepository } from './auth/fakeRepository';
import { noVerificationEmail } from './test/mail';
import { env } from './env';

/**
 * The headers §12 asks for, on real responses.
 *
 * The allow-list and helmet have both been configured since the app was
 * built, and neither had a test: env.test.ts checks that the origin string is
 * parsed, which is not the same as checking that a browser is told no.
 */

const app = createApp(
  createFakeAuthRepository(),
  undefined,
  undefined,
  undefined,
  noVerificationEmail,
);

const allowed = env.corsOrigins[0] ?? 'http://localhost:5173';

describe('the CORS allow-list', () => {
  it('lets a listed origin through, with credentials', async () => {
    /* Credentials matter: the refresh token rides in an httpOnly cookie, so
       a response without this header means no session survives a reload. */
    const response = await request(serverFor(app))
      .get('/api/health')
      .set('Origin', allowed);
    expect(response.headers['access-control-allow-origin']).toBe(allowed);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('tells a browser nothing about an origin that is not listed', async () => {
    /* CORS is enforced by the browser, so "refused" means the header is
       absent — there is no 403 to assert. Its absence is the whole
       mechanism. */
    const response = await request(serverFor(app))
      .get('/api/health')
      .set('Origin', 'https://not-kapka.example');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('is never a wildcard', async () => {
    // A wildcard cannot carry credentials anyway, so this would break the
    // session as well as opening the API to every page on the internet.
    const response = await request(serverFor(app))
      .get('/api/health')
      .set('Origin', allowed);
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });
});

describe('the headers helmet sets', () => {
  it('refuses to be framed', async () => {
    // Clickjacking: an attacker's page cannot put the API in an iframe.
    const response = await request(serverFor(app)).get('/api/health');
    expect(response.headers['x-frame-options']?.toLowerCase()).toBe('sameorigin');
  });

  it('does not let a browser sniff a content type', async () => {
    const response = await request(serverFor(app)).get('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not announce what it is built with', async () => {
    // x-powered-by names the framework and version to anyone scanning.
    const response = await request(serverFor(app)).get('/api/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('asks browsers to stay on HTTPS', async () => {
    const response = await request(serverFor(app)).get('/api/health');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });
});
