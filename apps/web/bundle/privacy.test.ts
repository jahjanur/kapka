import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The privacy notice, held to the schema it describes.
 *
 * A notice is a promise about what is stored. It is written once, the
 * database keeps changing, and nothing normally connects the two — so the
 * failure mode is not a wrong sentence, it is a missing one: a table added
 * two months later that nobody thought to mention. That is the version of
 * this document that does harm, because it reads as complete.
 *
 * So every table in the migrations has to be accounted for here: either the
 * notice covers what it holds, or it is listed below as holding nothing about
 * a person, with a reason.
 */

const MIGRATIONS = new URL('../../api/migrations/', import.meta.url).pathname;
const notice = readFileSync(
  new URL('../src/routes/Privacy.tsx', import.meta.url).pathname,
  'utf8',
).toLowerCase();

/** Tables with nothing personal in them. Each needs a reason, not a shrug. */
const NOT_ABOUT_PEOPLE: Record<string, string> = {
  blood_compatibility:
    'the compatibility matrix — 27 rows of medical fact, identical for everybody',
};

/**
 * What each table holds, in words the notice has to contain. Not the column
 * names: the notice is for a donor, not a reviewer, and matching on "email"
 * or "blood type" is what checks it says the thing rather than the jargon.
 */
const MUST_MENTION: Record<string, string[]> = {
  users: ['email', 'password', 'name'],
  donor_profiles: ['blood type', 'city', 'last donated'],
  blood_requests: ['hospital', 'units', 'urgency', 'note'],
  notification_log: ['which request it was about', 'whether it was sent'],
  audit_log: ['approvals, rejections and expiries'],
  refresh_tokens: ['session'],
  email_verification_tokens: ['confirmation link'],
};

function tablesInMigrations(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(MIGRATIONS + file, 'utf8');
    for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)) {
      names.add((match[1] ?? '').toLowerCase());
    }
  }
  return [...names].sort();
}

describe('the privacy notice', () => {
  const tables = tablesInMigrations();

  it('finds the schema to check against', () => {
    expect(tables.length).toBeGreaterThan(5);
  });

  it('accounts for every table in the database', () => {
    /* The one that matters. A migration adding a table nobody mentioned
       fails here, which is the only moment anybody would think of it. */
    const unaccounted = tables.filter(
      (table) => !(table in MUST_MENTION) && !(table in NOT_ABOUT_PEOPLE),
    );
    expect(unaccounted).toEqual([]);
  });

  it.each(Object.entries(MUST_MENTION))('says what %s holds', (_table, phrases) => {
    const missing = phrases.filter((phrase) => !notice.includes(phrase.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('names every outside party the code actually talks to', () => {
    // Anything the browser or the server reaches, the reader is owed.
    for (const party of ['sendgrid', 'openstreetmap', 'google maps', 'render']) {
      expect(notice).toContain(party);
    }
  });

  it('discloses the one thing that survives deletion', () => {
    /* The notification row is kept with the donor detached. A notice that
       said "deletion is real deletion" and stopped there would be true and
       incomplete, which is the worse kind of wrong. */
    expect(notice).toContain('taken off it');
    expect(notice).toContain('no longer says to whom');
  });

  it('states the retention windows the code actually uses', () => {
    expect(notice).toContain('seven days');
    expect(notice).toContain('thirty days');
    expect(notice).toContain('twenty-four hours');
  });

  it('is reachable from registration', () => {
    const register = readFileSync(
      new URL('../src/routes/Register.tsx', import.meta.url).pathname,
      'utf8',
    );
    expect(register).toContain('PATHS.privacy');
  });
});
