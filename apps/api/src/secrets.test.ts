import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { redact } from './redact';

/**
 * Secrets handling, as checks rather than conventions.
 *
 * Every failure here is one that only shows up once it has already happened:
 * a variable nobody knew to set, a credential in a log aggregator, a key
 * compiled into a bundle and served to browsers.
 */

const read = (path: string) => {
  expect(existsSync(path), `expected ${path} — is the cwd still the repo root?`).toBe(
    true,
  );
  return readFileSync(path, 'utf8');
};

describe('.env is never committed', () => {
  it('is ignored by git', () => {
    // `git check-ignore` exits non-zero when the path is NOT ignored.
    expect(() => execSync('git check-ignore -q apps/api/.env')).not.toThrow();
    expect(() => execSync('git check-ignore -q apps/web/.env')).not.toThrow();
  });

  it('has no .env tracked anywhere in the repository', () => {
    const tracked = execSync('git ls-files', { encoding: 'utf8' })
      .split('\n')
      .filter((path) => /(^|\/)\.env($|\.)/.test(path) && !path.includes('example'));
    expect(tracked).toEqual([]);
  });

  it('has never had one committed, in any commit', () => {
    // A .env removed later is still in the history, and the keys in it are
    // still compromised.
    const added = execSync('git log --all --pretty=format: --name-only --diff-filter=A', {
      encoding: 'utf8',
    })
      .split('\n')
      .filter((path) => /(^|\/)\.env($|\.)/.test(path) && !path.includes('example'));
    expect([...new Set(added)]).toEqual([]);
  });
});

describe('every variable is documented', () => {
  it('documents in .env.example exactly what the schema declares', () => {
    /*
     * A variable added to the schema but not the example means a teammate
     * pulls, starts the API, and gets a validation error naming something
     * they have never heard of. One left in the example but not the schema is
     * dead configuration that people keep setting.
     */
    const envTs = read('apps/api/src/env.ts');
    const start = envTs.indexOf('z.object({');
    const schema = envTs.slice(start, envTs.indexOf('});', start));
    const declared = [...schema.matchAll(/^ {2}([A-Z_][A-Z0-9_]*):/gm)].map(
      (m) => m[1] ?? '',
    );

    const example = read('apps/api/.env.example');
    const documented = [...example.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map(
      (m) => m[1] ?? '',
    );

    expect(declared.length).toBeGreaterThan(5);
    expect([...declared].sort()).toEqual([...documented].sort());
  });
});

describe('every variable is explained, not just listed', () => {
  it('gives each one a comment above it', () => {
    // A name and a value tell a teammate nothing about whether it is required,
    // what happens if they leave it, or what a sensible value looks like.
    const lines = read('apps/api/.env.example').split('\n');
    const undocumented: string[] = [];

    lines.forEach((line, index) => {
      const match = /^([A-Z_][A-Z0-9_]*)=/.exec(line);
      if (!match) return;
      // Walk back over blank lines to the nearest non-blank line.
      let above = index - 1;
      while (above >= 0 && lines[above]?.trim() === '') above -= 1;
      if (!lines[above]?.trimStart().startsWith('#')) undocumented.push(match[1] ?? '');
    });

    expect(undocumented).toEqual([]);
  });

  it('states a default for every variable', () => {
    const example = read('apps/api/.env.example');
    const names = [...example.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? '');
    const defaults = [...example.matchAll(/^# Default:/gm)];
    expect(defaults.length).toBe(names.length);
  });
});

describe('the browser bundle carries no secrets', () => {
  it('exposes nothing secret-shaped through a VITE_ variable', () => {
    /*
     * Vite inlines every VITE_ variable into the JavaScript it serves. A key
     * put there is not configuration, it is published — and it looks exactly
     * like the server-side variables next to it, which is what makes this an
     * easy mistake rather than a careless one.
     */
    const example = read('apps/web/.env.example');
    const names = [...example.matchAll(/^(VITE_[A-Z0-9_]*)=/gm)].map((m) => m[1] ?? '');
    const secretShaped = names.filter((name) =>
      /SECRET|PASSWORD|TOKEN|PRIVATE|CREDENTIAL|_KEY$|API_KEY|SENDGRID|DATABASE/.test(
        name,
      ),
    );
    expect(secretShaped).toEqual([]);
  });

  it('says plainly that VITE_ variables are public', () => {
    expect(read('apps/web/.env.example')).toMatch(/PUBLIC/i);
  });

  it('keeps server-side variables out of the web app entirely', () => {
    const example = read('apps/web/.env.example');
    for (const name of ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'SENDGRID_API_KEY']) {
      expect(example).not.toContain(name);
    }
  });
});

describe('redaction', () => {
  it('strips the password from a connection string but keeps the shape', () => {
    expect(redact('postgresql://kapka:sup3rs3cret@db.internal:5432/kapka')).toBe(
      'postgresql://kapka:[redacted]@db.internal:5432/kapka',
    );
  });

  it('strips a bearer token', () => {
    expect(redact('Authorization: Bearer abc123.def456.ghi789')).not.toContain('abc123');
  });

  it('strips a JWT wherever it appears', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature';
    expect(redact(`token was ${jwt} apparently`)).not.toContain('eyJzdWIiOiJ4In0');
  });

  it('strips a bcrypt hash', () => {
    const hash = '$2b$12$' + 'a'.repeat(53);
    expect(redact(`hash=${hash}`)).not.toContain('a'.repeat(53));
  });

  it('strips a SendGrid key', () => {
    expect(redact('SG.abcdefghijk.lmnopqrstuvwxyz')).toBe('[redacted-key]');
  });

  it('strips anything that named itself a secret', () => {
    expect(redact('password=hunter2')).not.toContain('hunter2');
    expect(redact('api_key: abc123xyz')).not.toContain('abc123xyz');
  });

  it('masks an email rather than removing it', () => {
    // §12 forbids logging full addresses. Which domain, and roughly which
    // account, is usually what the log was for.
    expect(redact('failed for ana.petrovska@example.com')).toBe(
      'failed for a***@example.com',
    );
  });

  it('handles an Error, keeping the message readable', () => {
    const error = new Error('connect failed for postgresql://u:p@host/db');
    const text = redact(error);
    expect(text).toContain('connect failed');
    expect(text).not.toContain('u:p@');
  });

  it('leaves ordinary text alone', () => {
    expect(redact('no matching donors in Bitola')).toBe('no matching donors in Bitola');
  });
});
