import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The CSP, held to the page it protects.
 *
 * A hash-based script-src is only as good as the hash. Change the inline
 * theme script by a character and the browser silently refuses to run it —
 * no error anyone sees, just a white flash for every dark-mode user, on
 * production only. This recomputes the hash from the script and compares.
 */

const html = readFileSync(new URL('../index.html', import.meta.url).pathname, 'utf8');

/* Whitespace-tolerant: prettier reflows a long meta tag across lines, and a
   test that only matches one formatting of the file is a test that breaks
   the next time anyone runs the formatter. */
const csp =
  /http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/.exec(html)?.[1] ?? '';

describe('the Content Security Policy', () => {
  it('is in the document at all', () => {
    // In the HTML rather than a host header: it then applies wherever this
    // is deployed, including a preview build somebody serves locally.
    expect(csp).not.toBe('');
  });

  it('carries a hash for every inline script, or allows none at all', () => {
    /* There is no inline script in the document today — the theme one went
       with dark mode. This is the guard for the next one: an inline script
       whose hash is not in the policy does not run, and that failure is
       silent and production-only. Add the script, add the hash. */
    const script = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
    if (script === undefined) {
      expect(csp).not.toContain('sha256-');
      return;
    }

    const hash = createHash('sha256').update(script).digest('base64');
    expect(csp).toContain(`'sha256-${hash}'`);
  });

  it('does not allow arbitrary inline script', () => {
    /* 'unsafe-inline' in script-src would let any injected <script> run,
       which is most of what a CSP is for. */
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('allows the tile host the map actually asks for', () => {
    /*
     * A CSP host wildcard matches a subdomain, not the bare name, so
     * `*.tile.openstreetmap.org` does not allow `tile.openstreetmap.org` —
     * which is the URL HospitalMap builds. Every tile was refused, and a
     * refused tile is not an error anyone sees: the map just renders empty.
     * Read out of the component so the two cannot drift apart.
     */
    const map = readFileSync(
      new URL('../src/components/HospitalMap/HospitalMap.tsx', import.meta.url).pathname,
      'utf8',
    );
    const tileUrl = /L\.tileLayer\('(https:\/\/[^/']+)/.exec(map)?.[1] ?? '';
    expect(tileUrl).not.toBe('');

    const imgSrc = /img-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(imgSrc).toContain(tileUrl);
  });

  it('locks down the directives an injection would reach for', () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('leaves frame-ancestors out of the meta, where it does nothing', () => {
    /* A browser ignores frame-ancestors in a meta element and warns about it
       on every page load. Carrying it here would be a directive that looks
       like protection, is not, and trains people to ignore the console. */
    expect(csp).not.toContain('frame-ancestors');
  });

  it('carries the header-only rules in _headers instead', () => {
    const headers = readFileSync(
      new URL('../public/_headers', import.meta.url).pathname,
      'utf8',
    );
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy:');
  });

  it('lets the avatar render, which means allowing blob: images', () => {
    /* The avatar endpoint takes a bearer token and an <img src> cannot send
       one, so the client fetches the bytes and renders an object URL. Without
       blob: here the browser refuses to load it and the picture shows as a
       broken image inside the crimson disc — an upload that looks half done.
       This is the guard, because the directive reads like something tidy to
       remove. */
    const imgSrc = /img-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(imgSrc).toContain('blob:');
  });

  it('allows exactly the outside world the app actually uses', () => {
    // Map tiles, and nothing else. A new third party has to be added here,
    // which is the point.
    expect(csp).toContain('https://*.tile.openstreetmap.org');
    expect(csp).toContain("connect-src 'self'");
  });
});
