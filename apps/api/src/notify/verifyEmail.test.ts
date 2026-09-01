import { describe, expect, it } from 'vitest';
import { buildVerificationEmail, VERIFICATION_SUBJECT } from './verifyEmail';

/*
 * The confirmation email goes through the same three clients as the donor
 * notification, so it is held to the same rules — see the long note at the top
 * of email.test.ts for why these are assertions about markup rather than about
 * rendering. The rules themselves live in emailLayout.ts, shared by both
 * messages, which is the point: there is one place to get them right.
 */

const LINK = 'https://kapka.mk/verify-email?token=abc123';
const build = (name = 'Ana') => buildVerificationEmail(name, LINK);

describe('the markup every client has to cope with', () => {
  const { html } = build();

  it('is a whole document, in tables, with no stylesheet', () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<table');
    expect(html).not.toContain('<div');
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/<link[\s>]/i);
  });

  it('keeps the Outlook and Apple Mail workarounds', () => {
    expect(html).toContain('<!--[if mso]>');
    expect(html).toContain('<v:roundrect');
    expect(html).toContain('<w:anchorlock/>');
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain('width="600"');
    expect(html).toContain('max-width:600px');
  });
});

describe('what it has to say', () => {
  const { html, text, subject } = build();

  it('says in the subject what the tap is for', () => {
    // It arrives among forty other messages ninety seconds after registering.
    expect(subject).toBe(VERIFICATION_SUBJECT);
    expect(subject.toLowerCase()).toContain('confirm');
  });

  it('carries the link in both the button and the plain text', () => {
    // Some clients never render the HTML at all, and a confirmation email
    // whose fallback has no link is a confirmation nobody completes.
    expect(html).toContain(LINK);
    expect(text).toContain(LINK);
    expect(text).not.toContain('<');
  });

  it('says the link expires, and that ignoring it is safe', () => {
    for (const body of [html, text]) {
      expect(body).toMatch(/24 hours/);
      expect(body).toMatch(/did not register/i);
    }
  });

  it('greets the donor by name, escaped', () => {
    const { html: hostile } = build('<b>Ana</b>');
    expect(hostile).not.toContain('<b>Ana</b>');
    expect(hostile).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });

  it('carries Macedonian Cyrillic through intact', () => {
    const { html: cyrillic } = build('Марија');
    expect(cyrillic).toContain('Марија');
    expect(cyrillic).toContain('<meta charset="utf-8">');
  });

  it('leaves the recipient to the caller, like every other email here', () => {
    expect(build().to).toBe('');
  });
});
