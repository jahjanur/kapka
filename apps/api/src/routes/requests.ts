import { Router } from 'express';
import { apiError, createRequestSchema, requestFilterSchema } from '@kapka/shared';
import { validateBody, validateQuery } from '../middleware/validate';

export const requestsRouter: Router = Router();

/**
 * The request endpoints are wired to their shared schemas but not yet backed
 * by a database — the schema in §3 and the matching query in §5.1 are the next
 * piece of work.
 *
 * They are mounted rather than omitted so the validation contract is live and
 * testable now: a malformed body gets the real 400 envelope, and only a valid
 * one reaches the unimplemented handler.
 */

requestsRouter.get('/requests', validateQuery(requestFilterSchema), (_req, res) => {
  res
    .status(501)
    .json(
      apiError(
        'NOT_IMPLEMENTED',
        'The public feed is not connected to the database yet.',
      ),
    );
});

requestsRouter.post('/requests', validateBody(createRequestSchema), (_req, res) => {
  res
    .status(501)
    .json(
      apiError(
        'NOT_IMPLEMENTED',
        'Creating a request is not connected to the database yet.',
      ),
    );
});
