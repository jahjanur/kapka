import rateLimit from 'express-rate-limit';
import { apiError } from '@kapka/shared';
import { env } from '../env';

/**
 * §12 sets 5/min on auth routes, 3/hour on request creation, 60/min elsewhere.
 *
 * Disabled outside production so the test suite and local development are not
 * throttled — the limits are the thing being configured, not the thing being
 * tested, and a shared limiter would make tests order-dependent.
 */
function limiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    limit: max,
    /* Not `limit: 0` — in express-rate-limit v8 that means zero requests
       allowed, not unlimited, which blocks everything outside production. */
    skip: () => !env.isProduction,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json(apiError('RATE_LIMITED', 'Too many attempts. Try again shortly.'));
    },
  });
}

/** Brute-forcing a password, and hammering registration, both land here. */
export const authRateLimit = limiter(60_000, 5);

/** Everything else. */
export const generalRateLimit = limiter(60_000, 60);
