import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * Serves the built app for a Lighthouse run, with a stub API behind it.
 *
 * A production build with no VITE_API_URL talks to /api on its own origin, so
 * without this the audit would measure the feed's error state: fast, empty,
 * and nothing like what a donor sees. LCP against a page with no content is a
 * number that always passes and never means anything.
 *
 * The payload is a fixture rather than the seed data. It only has to be
 * representative of what the feed renders — enough cards to fill a screen —
 * and importing the seed would drag TypeScript into a script whose whole job
 * is to be dumb and fast.
 */

const DIST = new URL('../dist/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4173);

const at = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const week = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

const REQUESTS = [
  ['a1', 'O-', 'critical', 'City General Hospital 8th September', 'Skopje', 3],
  ['a2', 'A+', 'urgent', 'Clinical Hospital Dr. Trifun Panovski', 'Bitola', 2],
  ['a3', 'B-', 'urgent', 'Clinical Hospital Tetovo', 'Tetovo', 1],
  ['a4', 'AB+', 'routine', 'General Hospital Ohrid', 'Ohrid', 2],
  ['a5', 'O+', 'critical', 'University Clinic of Surgery St. Naum Ohridski', 'Skopje', 4],
  ['a6', 'A-', 'routine', 'General Hospital Borka Taleski', 'Prilep', 1],
].map(([id, bloodType, urgency, hospitalName, city, unitsNeeded], i) => ({
  id,
  bloodType,
  unitsNeeded,
  urgency,
  hospitalName,
  city,
  note: 'Scheduled surgery, units needed on site.',
  status: 'approved',
  createdAt: at((i + 1) * 17),
  expiresAt: week(),
}));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${String(PORT)}`);

  if (url.pathname.startsWith('/api/requests/')) {
    const found = REQUESTS.find((r) => r.id === url.pathname.split('/').pop());
    res.writeHead(found ? 200 : 404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        found ? { request: found } : { error: { code: 'NOT_FOUND', message: 'No.' } },
      ),
    );
    return;
  }
  if (url.pathname === '/api/requests') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ requests: REQUESTS }));
    return;
  }

  const file = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  // SPA fallback: every unknown path is a client route, which is also why
  // lhci's own static server is not enough here.
  const target = existsSync(file) && extname(file) ? file : join(DIST, 'index.html');
  const body = readFileSync(target);
  const headers = {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
  };

  /* Gzip, because every real host does. Serving raw bytes would inflate every
     size metric and slow every timing one under throttling — an audit that is
     pessimistic in a way production never is measures the wrong thing. */
  const wantsGzip = (req.headers['accept-encoding'] ?? '').includes('gzip');
  if (wantsGzip && /\.(js|css|html|svg|txt)$/.test(target)) {
    const zipped = gzipSync(body);
    res.writeHead(200, { ...headers, 'content-encoding': 'gzip' });
    res.end(zipped);
    return;
  }
  res.writeHead(200, headers);
  res.end(body);
}).listen(PORT, () => {
  console.log(`audit server on http://localhost:${String(PORT)}`);
});
