import type { NextFunction, Request, Response } from 'express';
import { apiError } from '@kapka/shared';
import { env } from '../env';
import { redact } from '../redact';
import { captureError } from '../observability/sentry';

/** Every unmatched path gets the same envelope as everything else. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json(apiError('NOT_FOUND', 'That endpoint does not exist.'));
}

/**
 * The last line of defence. Never leaks a stack trace or an internal message
 * to the client, and never logs credentials or tokens (§12).
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Redacted, because an error thrown near a connection string, an
  // Authorization header or a user record would otherwise put the secret
  // straight into the log (§12).
  console.error('[api] unhandled error:', redact(error));

  /* Reported with the method and the route and nothing else. Not the query
     string, which carries the email-verification token, and not the body,
     which on one endpoint is a password. A no-op unless SENTRY_DSN is set. */
  captureError(error, { method: req.method, route: req.path });
  if (res.headersSent) return;
  res
    .status(500)
    .json(
      apiError(
        'INTERNAL',
        env.isProduction
          ? 'Something went wrong on our side.'
          : `Something went wrong on our side: ${redact(error)}`,
      ),
    );
}
