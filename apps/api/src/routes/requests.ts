import { Router } from 'express';
import { apiError, createRequestSchema, requestFilterSchema } from '@kapka/shared';
import { validateBody, validateQuery } from '../middleware/validate';
import { optionalAuth, requireAuth } from '../middleware/auth';
import type { AuthRepository } from '../auth/repository';

/**
 * The request endpoints are wired to their shared schemas and their
 * authorisation, but not yet backed by a database — §3's schema and the
 * matching query in §5.1 are the next piece of work.
 *
 * They are mounted rather than omitted so both contracts are live and testable
 * now: an unauthorised caller is refused before validation, a malformed body
 * gets the real 400 envelope, and only a valid authorised request reaches the
 * unimplemented handler.
 */
export function createRequestsRouter(repository: AuthRepository): Router {
  const router = Router();

  router.get(
    '/requests',
    // Public, but a signed-in caller sees the requester's contact details
    // (§4), so the identity is attached when there is one and the route
    // continues quietly when there is not.
    optionalAuth(),
    validateQuery(requestFilterSchema),
    (_req, res) => {
      res
        .status(501)
        .json(
          apiError(
            'NOT_IMPLEMENTED',
            'The public feed is not connected to the database yet.',
          ),
        );
    },
  );

  router.post(
    '/requests',
    // Anyone signed in may post a request. Checked against the database, so a
    // deactivated account cannot post with a token that has not expired yet.
    requireAuth(repository),
    validateBody(createRequestSchema),
    (_req, res) => {
      res
        .status(501)
        .json(
          apiError(
            'NOT_IMPLEMENTED',
            'Creating a request is not connected to the database yet.',
          ),
        );
    },
  );

  return router;
}
