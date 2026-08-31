import type { NextFunction, Request, Response } from 'express';
import { apiError } from '@kapka/shared';
import { env } from '../env';

/** Every unmatched path gets the same envelope as everything else. */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json(apiError('NOT_FOUND', 'That endpoint does not exist.'));
}

/**
 * The last line of defence. Never leaks a stack trace or an internal message
 * to the client, and never logs credentials or tokens (§12).
 */
export function errorHandler(
  error: unknown, _req: Request, res: Response, _next: NextFunction,
): void {
  console.error('[api] unhandled error:', error);
  if (res.headersSent) return;
  res.status(500).json(apiError(
    'INTERNAL',
    env.isProduction
      ? 'Something went wrong on our side.'
      : `Something went wrong on our side: ${String(error)}`,
  ));
}
