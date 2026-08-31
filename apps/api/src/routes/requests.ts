import { Router } from 'express';
import { z } from 'zod';
import {
  apiError,
  createRequestSchema,
  requestFilterSchema,
  type CreateRequestInput,
  type RequestFilterInput,
} from '@kapka/shared';
import { getAuth } from '../auth/context';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import type { AuthRepository } from '../auth/repository';
import type { RequestsRepository, Viewer } from '../requests/repository';

/** null for an anonymous caller, which is what hides contact details. */
function viewerFrom(res: Parameters<typeof getAuth>[0]): Viewer | null {
  const auth = getAuth(res);
  return auth ? { userId: auth.userId } : null;
}

export function createRequestsRouter(
  auth: AuthRepository,
  requests: RequestsRepository,
): Router {
  const router = Router();

  /**
   * POST /api/requests — anyone signed in may post one.
   *
   * It lands as `pending`. Nothing reaches a donor until an admin approves it
   * (§4), which is why the client cannot choose the status: createRequestSchema
   * has no status field and rejects unknown keys.
   */
  router.post(
    '/requests',
    requireAuth(auth),
    validateBody(createRequestSchema),
    async (req, res) => {
      const caller = getAuth(res);
      if (!caller) return;
      const created = await requests.create(
        req.body as CreateRequestInput,
        caller.userId,
      );
      res.status(201).json({ request: created });
    },
  );

  /**
   * GET /api/requests — the public feed.
   *
   * Open to everyone, but a signed-in caller gets the requester's contact
   * details and an anonymous one does not (§4). The distinction is made in the
   * SQL: the column is not selected at all without a viewer.
   */
  router.get(
    '/requests',
    optionalAuth(),
    validateQuery(requestFilterSchema),
    async (_req, res) => {
      const filters = res.locals.query as RequestFilterInput;
      const viewer = viewerFrom(res);

      // "Requests I could help with" needs to know the caller's blood type.
      if (filters.compatibleWithMe === true && !viewer) {
        res
          .status(401)
          .json(
            apiError('UNAUTHENTICATED', 'Sign in to see requests you can help with.'),
          );
        return;
      }

      res.json({ requests: await requests.list(filters, viewer) });
    },
  );

  /** GET /api/requests/:id — detail, including the hospital coordinates (§9.4). */
  router.get('/requests/:id', optionalAuth(), async (req, res) => {
    // Checked before it reaches the query: blood_requests.id is a uuid column,
    // and handing Postgres a malformed one raises rather than returning
    // nothing, which would surface as a 500 for what is really a bad link.
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json(apiError('NOT_FOUND', 'That request does not exist.'));
      return;
    }

    const found = await requests.findById(id.data, viewerFrom(res));
    if (!found) {
      // Same answer for "no such request" and "not approved yet". A pending
      // request is not public, and saying so would leak that it exists.
      res.status(404).json(apiError('NOT_FOUND', 'That request does not exist.'));
      return;
    }
    res.json({ request: found });
  });

  return router;
}
