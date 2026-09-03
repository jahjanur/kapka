import request from 'supertest';
import { serverFor } from '../test/http';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createFakeAuthRepository } from '../auth/fakeRepository';
import { noVerificationEmail } from '../test/mail';
import { signAccessToken } from '../auth/tokens';
import { AVATAR_MAX_BYTES } from '../media/avatar';

/** Real headers on each, because the header is the whole of the check. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

let repository: ReturnType<typeof createFakeAuthRepository>;
let app: ReturnType<typeof createApp>;
let token: string;

beforeEach(async () => {
  repository = createFakeAuthRepository();
  app = createApp(repository, undefined, undefined, undefined, noVerificationEmail);
  const user = repository.addUser({
    email: 'ana@example.com',
    passwordHash: 'hash',
    fullName: 'Ana Petrovska',
  });
  token = await signAccessToken(user.id, user.role);
});

const put = (body: Buffer, type = 'image/jpeg') =>
  request(serverFor(app))
    .put('/api/me/avatar')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', type)
    .send(body);

describe('PUT /api/me/avatar', () => {
  it.each([
    ['a JPEG', JPEG, 'image/jpeg'],
    ['a PNG', PNG, 'image/png'],
    ['a WebP', WEBP, 'image/webp'],
  ])('stores %s under the type its bytes say it is', async (_name, bytes, expected) => {
    const response = await put(bytes);
    expect(response.status).toBe(204);
    expect([...repository.avatars.values()][0]?.contentType).toBe(expected);
  });

  it('refuses an SVG however it is labelled', async () => {
    /*
     * The one that matters. An SVG is a document that can carry script, so
     * storing one and serving it back from our own origin is stored XSS
     * (§12) — and it arrives labelled image/svg+xml, or image/png, or
     * anything else the caller fancies. The label is not consulted.
     */
    const response = await put(SVG, 'image/png');
    expect(response.status).toBe(415);
    expect(repository.avatars.size).toBe(0);
  });

  it('believes the bytes, not the Content-Type', async () => {
    // A real JPEG announced as something else is still a JPEG.
    const response = await put(JPEG, 'application/octet-stream');
    expect(response.status).toBe(204);
    expect([...repository.avatars.values()][0]?.contentType).toBe('image/jpeg');
  });

  it('refuses an empty body', async () => {
    const response = await put(Buffer.alloc(0));
    expect(response.status).toBe(415);
  });

  it('refuses more bytes than it will hold', async () => {
    const tooBig = Buffer.concat([JPEG, Buffer.alloc(AVATAR_MAX_BYTES + 1)]);
    const response = await put(tooBig);
    expect(response.status).toBe(413);
    expect(repository.avatars.size).toBe(0);
  });

  it('replaces the picture rather than collecting them', async () => {
    await put(JPEG);
    await put(PNG, 'image/png');
    expect(repository.avatars.size).toBe(1);
    expect([...repository.avatars.values()][0]?.contentType).toBe('image/png');
  });

  it('is not open to somebody without a session', async () => {
    const response = await request(serverFor(app))
      .put('/api/me/avatar')
      .set('Content-Type', 'image/jpeg')
      .send(JPEG);
    expect(response.status).toBe(401);
  });
});

describe('GET /api/me/avatar', () => {
  it('gives the picture back with the type it was stored under', async () => {
    await put(PNG, 'image/png');
    const response = await request(serverFor(app))
      .get('/api/me/avatar')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    /* A shared cache holding one donor's face, keyed on a URL every donor
       shares, is a way to serve it to the wrong one. */
    expect(response.headers['cache-control']).toContain('private');
  });

  it('says plainly when there is none', async () => {
    const response = await request(serverFor(app))
      .get('/api/me/avatar')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(404);
  });

  it('is nobody else\u2019s business', async () => {
    await put(JPEG);
    const response = await request(serverFor(app)).get('/api/me/avatar');
    // §12: a photograph identifies somebody more surely than a phone number,
    // and the phone number is already behind a session.
    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/me/avatar', () => {
  it('takes it down', async () => {
    await put(JPEG);
    const response = await request(serverFor(app))
      .delete('/api/me/avatar')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(204);
    expect(repository.avatars.size).toBe(0);
  });

  it('succeeds when there was nothing there', async () => {
    // Asking for it to be gone when it already is has succeeded.
    const response = await request(serverFor(app))
      .delete('/api/me/avatar')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(204);
  });
});
