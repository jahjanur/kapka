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
    });
    expect(env.MAIL_TRANSPORT).toBe('sendgrid');
  });

  it('refuses the sendgrid transport in production with no key', () => {
    expect(() =>
      parseEnv({ NODE_ENV: 'production', MAIL_TRANSPORT: 'sendgrid' }),
    ).toThrow(/requires SENDGRID_API_KEY/);
  });
});
