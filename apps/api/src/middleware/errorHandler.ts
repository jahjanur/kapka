import type { NextFunction, Request, Response } from 'express';
import { apiError } from '@kapka/shared';
import { env } from '../env';
import { redact } from '../redact';
import { captureError } from '../observability/sentry';

/** Every unmatched path gets the same envelope as everything else. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json(apiError('NOT_FOUND', 'That endpoint does not exist.'));
}

/** body-parser's own "too big", which arrives with a status already on it. */
function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'entity.too.large'
  );
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
  /*
   * A body that was too large is not a fault, it is an answer.
   *
   * body-parser throws this with a status of its own when a request exceeds
   * the limit a route set — the profile picture endpoint being the one that
   * sets a large one. Letting it fall through to the 500 below tells somebody
   * who uploaded a big photograph that the server broke, and buries a routine
   * refusal in the error log next to the real faults.
   */
  if (isPayloadTooLarge(error)) {
    res
      .status(413)
      .json(apiError('VALIDATION_FAILED', 'That file is too large.', 'image'));
    return;
  }

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
