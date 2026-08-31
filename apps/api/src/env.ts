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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment:\n${detail}`);
}

export const env = {
  ...parsed.data,
  /** Strict allow-list, never a wildcard (§12). */
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
};
