import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

/** A minimal valid environment; every field has a default. */
const base = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

describe('environment defaults', () => {
  it('points at the Postgres and Mailpit from compose.yaml out of the box', () => {
    const env = parseEnv(base);
    expect(env.DATABASE_URL).toBe('postgresql://kapka:kapka@localhost:5432/kapka');
    expect(env.SMTP_HOST).toBe('localhost');
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.MAIL_TRANSPORT).toBe('smtp');
  });

  it('splits the CORS allow-list and trims it', () => {
    const env = parseEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.corsOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects a malformed database URL rather than failing at first query', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: 'not a url' })).toThrow(
      /Invalid environment/,
    );
  });
});

describe('the access token signing key', () => {
  it('is refused in production when missing or too short', () => {
    // A guessable signing key means anyone can mint an admin token.
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      parseEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/at least 32 characters/);
  });

  it('falls back to an obviously fake key outside production', () => {
    // Local runs and tests work with no setup, and nothing signed with it
    // could be mistaken for a real secret.
    expect(parseEnv(base).JWT_ACCESS_SECRET).toContain('not-a-secret');
  });
});

describe('the bcrypt work factor', () => {
  it('defaults to the 12 that §12 requires', () => {
    expect(parseEnv(base).BCRYPT_COST).toBe(12);
  });

  it('refuses anything weaker in production', () => {
    // Lowering it is a faster offline attack on every password in the
    // database. Tests may turn it down; production may not.
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'x'.repeat(48),
        BCRYPT_COST: '4',
      }),
    ).toThrow(/at least 12 in production/);
  });

  it('allows a lower cost outside production, which is why the suite is fast', () => {
    expect(parseEnv({ ...base, BCRYPT_COST: '4' }).BCRYPT_COST).toBe(4);
  });
});

describe('nobody sends real email by accident (§2)', () => {
  it.each(['development', 'test'])(
    'refuses to start with a SendGrid key when NODE_ENV=%s',
    (NODE_ENV) => {
      // The realistic accident: a production .env copied onto a laptop.
      expect(() =>
        parseEnv({ ...base, NODE_ENV, SENDGRID_API_KEY: 'SG.real-key' }),
      ).toThrow(/Refusing to start/);
    },
  );

  it('refuses the sendgrid transport outside production', () => {
    expect(() => parseEnv({ ...base, MAIL_TRANSPORT: 'sendgrid' })).toThrow(
      /Refusing to start/,
    );
  });

  it('names Mailpit in the error, so the fix is obvious', () => {
    expect(() => parseEnv({ ...base, SENDGRID_API_KEY: 'SG.x' })).toThrow(
      /localhost:8025/,
    );
  });

  it('allows an empty key, which is the normal local state', () => {
    expect(() => parseEnv({ ...base, SENDGRID_API_KEY: '' })).not.toThrow();
  });

  it('allows SendGrid in production, where it belongs', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      MAIL_TRANSPORT: 'sendgrid',
      SENDGRID_API_KEY: 'SG.x',
      JWT_ACCESS_SECRET: 'x'.repeat(48),
    });
    expect(env.MAIL_TRANSPORT).toBe('sendgrid');
  });

  it('refuses the sendgrid transport in production with no key', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        MAIL_TRANSPORT: 'sendgrid',
        JWT_ACCESS_SECRET: 'x'.repeat(48),
      }),
    ).toThrow(/requires SENDGRID_API_KEY/);
  });
});
