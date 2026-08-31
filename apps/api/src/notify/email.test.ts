import { describe, expect, it } from 'vitest';
import { formatBloodType } from '@kapka/shared';
import { buildEmail, subjectFor, type RequestSummary } from './email';

/** What a donor actually reads: a typographic minus, not an ASCII hyphen. */
const O_NEG = formatBloodType('O-');

/*
 * Email clients are not browsers. Gmail strips <style> blocks, Outlook renders
 * through Word, and Apple Mail rewrites a light email into dark on its own.
 *
 * None of that can be checked by rendering here, so these tests encode the
 * rules those three clients impose as assertions about the markup instead. A
 * passing suite is not a substitute for opening the mail — see the note at the
 * bottom of this file — but it does mean a regression that would break Outlook
 * fails in CI rather than in somebody's inbox.
 */

const REQUEST: RequestSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  bloodType: 'O-',
  unitsNeeded: 2,
  urgency: 'critical',
  hospitalName: 'City General',
  city: 'Skopje',
};

const LINKS = {
  request: 'https://kapka.mk/requests/11111111-1111-4111-8111-111111111111',
  pauseNotifications: 'https://kapka.mk/me/notifications',
};

const build = (overrides: Partial<RequestSummary> = {}, name = 'Ana') =>
  buildEmail({ ...REQUEST, ...overrides }, name, LINKS);

describe('the markup every client has to cope with', () => {
  const { html } = build();

  it('is a whole document, not a fragment', () => {
    // Outlook.com and Gmail both wrap a fragment in their own scaffolding, and
    // what they choose is not what we would choose.
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toMatch(/<\/html>$/);
  });

  it('lays out in tables, never in divs', () => {
    expect(html).toContain('<table');
    expect(html).not.toContain('<div');
  });

  it('carries no stylesheet of any kind', () => {
    // Gmail removes <style> outright and every client removes <link>. A rule
    // that lives in either is a rule that silently does not apply.
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/<link[\s>]/i);
    expect(html).not.toMatch(/\sclass=/);
  });

  it('uses no layout property that predates 2000', () => {
    for (const banned of [
      /display:\s*flex/,
      /display:\s*grid/,
      /position:\s*(absolute|fixed)/,
    ]) {
      expect(html).not.toMatch(banned);
    }
  });

  it('is capped at 600px in both the ways clients read a width', () => {
    // The attribute is what old Outlook reads; the CSS is what everything else
    // reads. Losing either one is a broken layout in half the world.
    expect(html).toContain('width="600"');
    expect(html).toContain('max-width:600px');
  });
});

describe('Outlook, which renders through Word', () => {
  const { html } = build();

  it('gets a conditional fixed-width table, because it ignores max-width', () => {
    // Without this the card stretches to the full window on a desktop Outlook.
    expect(html).toContain('<!--[if mso]>');
    expect(html).toMatch(/\[if mso\]>\s*<table[^>]*width="600"/);
  });

  it('gets a VML button, because it drops padding on an inline-block anchor', () => {
    // Left to itself Outlook renders the call to action as bare underlined
    // text with no crimson and no box — the one element that must be obvious.
    expect(html).toContain('<v:roundrect');
    expect(html).toContain('</v:roundrect>');
    expect(html).toContain('xmlns:v="urn:schemas-microsoft-com:vml"');
    expect(html).toContain('<w:anchorlock/>');
    expect(html).toContain('href="' + LINKS.request + '"');
  });

  it('hides the VML from everyone else, and the anchor from Outlook', () => {
    // Both buttons in one client means the donor sees the call to action
    // twice; neither means they see it not at all.
    expect(html).toContain('<!--[if !mso]><!-- -->');
    expect(html).toContain('<!--<![endif]-->');
  });

  it('declares 96 DPI, or Word scales the whole email up', () => {
    expect(html).toContain('<o:PixelsPerInch>96</o:PixelsPerInch>');
  });
});

describe('Apple Mail and the clients that auto-invert', () => {
  const { html } = build();

  it('pins the colour scheme to light', () => {
    // Apple Mail and Outlook.com invert a light email on a dark device, and
    // they invert the crimson with it — a blood notification in inverted
    // teal-green is not the message.
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain('<meta name="supported-color-schemes" content="light">');
  });

  it('stops iOS resizing the text on its own', () => {
    expect(html).toContain('<meta name="x-apple-disable-message-reformatting">');
  });

  it('gives the body an explicit background', () => {
    // A transparent body shows through as whatever the client paints behind
    // it, which on iOS dark mode is black behind near-black text.
    expect(html).toMatch(/<body style="[^"]*background:#f6f7f9/);
  });
});

describe('what the inbox shows before anything is opened', () => {
  it('leads the subject with the urgency and the blood type', () => {
    // Roughly forty characters survive on a locked phone screen. The two
    // things that decide whether this is worth opening go in them.
    const subject = subjectFor(REQUEST);
    expect(subject.slice(0, 40)).toContain('Critical');
    expect(subject.slice(0, 40)).toContain(O_NEG);
  });

  it('never says "needed" twice in one subject', () => {
    for (const urgency of ['routine', 'urgent', 'critical'] as const) {
      const words = subjectFor({ ...REQUEST, urgency })
        .toLowerCase()
        .split(/\W+/);
      expect(words.filter((word) => word === 'needed')).toHaveLength(1);
    }
  });

  it('says which of the three urgencies it is', () => {
    expect(subjectFor({ ...REQUEST, urgency: 'routine' })).toMatch(/^Requested:/);
    expect(subjectFor({ ...REQUEST, urgency: 'urgent' })).toMatch(/^Urgent:/);
    expect(subjectFor({ ...REQUEST, urgency: 'critical' })).toMatch(/^Critical:/);
  });

  it('carries a preheader, so the preview line is not the greeting', () => {
    const { html } = build();
    expect(html).toMatch(/display:none;[^"]*max-height:0/);
    expect(html).toContain('2 units needed in Skopje. You are a match.');
    // It must sit before the visible body or the client scrapes the greeting.
    expect(html.indexOf('You are a match')).toBeLessThan(html.indexOf('<h1'));
  });
});

describe('what the email has to actually say (§5.4)', () => {
  const { html, text, subject } = build();

  it.each([
    ['the blood type', O_NEG],
    ['the hospital', 'City General'],
    ['the city', 'Skopje'],
    ['the units', '2 units'],
    ["the donor's name", 'Ana'],
  ])('names %s', (_label, value) => {
    expect(html).toContain(value);
  });

  it('links to the request and to pausing these emails', () => {
    expect(html).toContain(LINKS.request);
    expect(html).toContain(LINKS.pauseNotifications);
  });

  it('says everything again in plain text', () => {
    // Some clients, and every screen reader set to plain text, never see the
    // HTML at all. Both links have to survive the fallback.
    expect(text).toContain('City General');
    expect(text).toContain(O_NEG);
    expect(text).toContain(LINKS.request);
    expect(text).toContain(LINKS.pauseNotifications);
    expect(text).not.toContain('<');
  });

  it('counts one unit as a unit', () => {
    expect(build({ unitsNeeded: 1 }).html).toContain('1 unit ');
    expect(build({ unitsNeeded: 1 }).html).not.toContain('1 units');
  });

  it('puts the subject on the envelope', () => {
    expect(subject).toBe(subjectFor(REQUEST));
  });
});

describe('user-supplied text going into markup', () => {
  it('escapes a hospital name that contains markup', () => {
    const { html } = build({ hospitalName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a quote, which would otherwise break out of the title attribute', () => {
    const { html } = build({ hospitalName: 'St " Mary' });
    expect(html).toContain('St &quot; Mary');
  });

  it('escapes an ampersand rather than leaving a bare one', () => {
    const { html } = build({ hospitalName: 'Mother & Child' });
    expect(html).toContain('Mother &amp; Child');
    expect(html).not.toMatch(/Mother & Child/);
  });

  it('escapes a donor name too', () => {
    const { html } = build({}, '<b>Ana</b>');
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });

  it('carries Macedonian Cyrillic through intact', () => {
    const { html, text } = build({ hospitalName: 'Мајка Тереза', city: 'Скопје' });
    expect(html).toContain('Мајка Тереза');
    expect(text).toContain('Скопје');
    expect(html).toContain('<meta charset="utf-8">');
  });
});

/*
 * NOT COVERED HERE, and it cannot be: how this actually looks in Gmail,
 * Outlook and Apple Mail. That needs the mail opened in those clients, or a
 * Litmus/Email-on-Acid run. See notify/EMAIL-TESTING.md for the preview
 * fixtures and the checklist to work through.
 */
