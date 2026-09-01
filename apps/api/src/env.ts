import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail fast and loudly on a misconfigured environment. A server that boots
 * with a missing secret and only discovers it at the first login is worse
 * than one that refuses to start.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  /** Defaults to the Postgres in compose.yaml, so a fresh clone just works. */
  DATABASE_URL: z.url().default('postgresql://kapka:kapka@localhost:5432/kapka'),

  /**
   * 'smtp' points at Mailpit locally. 'sendgrid' is the only setting that can
   * reach a real inbox, and it is refused outside production below.
   */
  /**
   * bcrypt work factor. §12 sets 12 for production, and the guard below
   * refuses anything lower there. Tests turn it down because the whole suite
   * otherwise spends tens of CPU-seconds on deliberately slow hashing, which
   * starves everything else on a small CI runner.
   */
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  /**
   * Signs access tokens. Required in production — see the guard below.
   * Generate with: openssl rand -base64 48
   */
  JWT_ACCESS_SECRET: z.string().default(''),

  /**
   * Where the links in outgoing email point. The web app, not the API — a
   * confirmation link is only useful if it opens the page that can spend it.
   * Trailing slash is stripped below so callers can append a path blindly.
   */
  APP_BASE_URL: z.url().default('http://localhost:5173'),

  MAIL_TRANSPORT: z.enum(['smtp', 'sendgrid']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().default('no-reply@kapka.mk'),
  SENDGRID_API_KEY: z.string().default(''),
});

export interface Env extends z.infer<typeof envSchema> {
  /** Strict allow-list, never a wildcard (§12). */
  corsOrigins: string[];
  isProduction: boolean;
}

/**
 * Exported for tests. The guards below are the reason this is a function and
 * not a bare top-level parse — a rule nobody can exercise is a rule nobody
 * can trust.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${detail}`);
  }

  const data = parsed.data;
  const isProduction = data.NODE_ENV === 'production';

  /* ── Nobody sends real email by accident (§2) ─────────────────────────
     Development and staging use Mailpit and seed data. The realistic
     accident is a production .env copied onto a laptop, so a live key is
     refused outright rather than merely unused — being unused today is one
     careless line away from being used tomorrow.                          */
  if (!isProduction && data.SENDGRID_API_KEY !== '') {
    throw new Error(
      `Refusing to start: SENDGRID_API_KEY is set with NODE_ENV=${data.NODE_ENV}.\n` +
        'Outside production, mail goes to Mailpit (http://localhost:8025).\n' +
        'Remove the key from your .env — real donors must never be emailed from a laptop.',
    );
  }

  if (!isProduction && data.MAIL_TRANSPORT === 'sendgrid') {
    throw new Error(
      `Refusing to start: MAIL_TRANSPORT=sendgrid with NODE_ENV=${data.NODE_ENV}.\n` +
        'Use MAIL_TRANSPORT=smtp, which delivers to Mailpit.',
    );
  }

  /* §12 fixes the cost factor at 12. Anything lower is a faster offline
     attack on every password in the database. */
  if (isProduction && data.BCRYPT_COST < 12) {
    throw new Error(
      `BCRYPT_COST must be at least 12 in production, got ${String(data.BCRYPT_COST)}.`,
    );
  }

  /* A signing key that anyone can guess means anyone can mint an admin token.
     Refused outright in production rather than defaulted to something
     convenient, which is how convenient defaults reach production. */
  if (isProduction && data.JWT_ACCESS_SECRET.length < 32) {
    throw new Error(
      'JWT_ACCESS_SECRET must be set to at least 32 characters in production.\n' +
        'Generate one with: openssl rand -base64 48',
    );
  }

  /* A confirmation link pointing at a laptop is a dead link in every donor's
     inbox, and nothing in production would notice — the mail sends perfectly
     well, it just cannot be acted on. Caught at boot instead. */
  if (isProduction && new URL(data.APP_BASE_URL).hostname === 'localhost') {
    throw new Error(
      `APP_BASE_URL is still ${data.APP_BASE_URL} with NODE_ENV=production.\n` +
        'Set it to the public address of the web app — every verification link ' +
        'we email points at it.',
    );
  }

  /* The mirror of the rule above: production must not silently post real
     notifications into a mail catcher nobody reads. */
  if (
    isProduction &&
    data.MAIL_TRANSPORT === 'sendgrid' &&
    data.SENDGRID_API_KEY === ''
  ) {
    throw new Error('MAIL_TRANSPORT=sendgrid requires SENDGRID_API_KEY.');
  }

  return {
    ...data,
    /* Outside production a fixed development key keeps local runs and tests
       working without setup. It is obviously not a secret, which is the
       point — nothing signed with it should ever be trusted. */
    JWT_ACCESS_SECRET:
      data.JWT_ACCESS_SECRET ||
      (isProduction ? '' : 'kapka-development-only-signing-key-not-a-secret'),
    // Stripped once, here, so no caller has to think about whether the
    // configured value ended in a slash before appending a path.
    APP_BASE_URL: data.APP_BASE_URL.replace(/\/$/, ''),
    corsOrigins: data.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    isProduction,
  };
}

export const env: Env = parseEnv();
