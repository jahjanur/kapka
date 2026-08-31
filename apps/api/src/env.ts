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
    corsOrigins: data.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    isProduction,
  };
}

export const env: Env = parseEnv();
