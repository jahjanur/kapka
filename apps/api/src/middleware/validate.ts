import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { zodToApiError } from '@kapka/shared';

/**
 * Validates the body against a shared schema BEFORE it reaches a handler (§4),
 * and replaces it with the parsed value so the handler sees coerced, defaulted,
 * unknown-key-free data.
 *
 * The schema is the same object the web form uses, so the two can never
 * disagree about what is valid.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(zodToApiError(result.error));
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Same, for query strings. */
export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json(zodToApiError(result.error));
      return;
    }
    // Express 5 makes req.query a getter, so the parsed value is handed on
    // via locals rather than assigned back.
    res.locals.query = result.data;
    next();
  };
}
