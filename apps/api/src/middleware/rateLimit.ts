import rateLimit from 'express-rate-limit';
import { apiError } from '@kapka/shared';
import { env } from '../env';

/**
 * §12 sets 5/min on auth routes, 3/hour on request creation, 60/min elsewhere.
 *
 * Disabled outside production so the suite and local development are not
 * throttled — a shared limiter would otherwise make tests order-dependent.
 * The behaviour itself is tested by building a limiter with `enabled: true`;
 * see rateLimit.test.ts.
 */
export function limiter(
  windowMs: number,
  max: number,
  { enabled = env.isProduction } = {},
) {
  return rateLimit({
    windowMs,
    limit: max,
    /* Not `limit: 0` — in express-rate-limit v8 that means zero requests
       allowed, not unlimited, which blocks everything outside production.

       `enabled` is a parameter so a test can build a limiter that actually
       limits. Without it the only way to exercise this code was to run the
       suite as production, and the rule that matters most here — three
       requests an hour — would never have been checked at all. */
    skip: () => !enabled,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json(apiError('RATE_LIMITED', 'Too many attempts. Try again shortly.'));
    },
  });
}

/** §12's numbers, exported so a test can assert them rather than restate them. */
export const LIMITS = {
  auth: { windowMs: 60_000, max: 5 },
  /*
   * Three an hour. A posted request is not a page view: it puts work in front
   * of a human moderator and, once approved, sends mail to strangers. The
   * general 60/minute would let one person fill the moderation queue with
   * three and a half thousand requests in an hour, which is both a denial of
   * service against the admins and a way to burn the day's email budget.
   */
  createRequest: { windowMs: 60 * 60_000, max: 3 },
  general: { windowMs: 60_000, max: 60 },
} as const;

/** Brute-forcing a password, and hammering registration, both land here. */
export const authRateLimit = limiter(LIMITS.auth.windowMs, LIMITS.auth.max);

/** Posting a blood request (§12). */
export const createRequestRateLimit = limiter(
  LIMITS.createRequest.windowMs,
  LIMITS.createRequest.max,
);

/** Everything else. */
export const generalRateLimit = limiter(LIMITS.general.windowMs, LIMITS.general.max);
