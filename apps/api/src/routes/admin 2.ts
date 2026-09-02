import { Router } from 'express';
import { z } from 'zod';
import { apiError, rejectRequestSchema, type RejectRequestInput } from '@kapka/shared';
import { getAuth } from '../auth/context';
import { requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import type { AdminRepository, ModerationOutcome } from '../admin/repository';
import type { AuthRepository } from '../auth/repository';

/**
 * Admin moderation (§4). Approving a request is what releases it to donors,
 * so both of these are admin-only, checked against the database rather than
 * the token's role claim — see requireRole.
 */
export function createAdminRouter(auth: AuthRepository, admin: AdminRepository): Router {
  const router = Router();

  /** Shared by both endpoints: the answers that are not a success. */
  function answerFailure(
    outcome: ModerationOutcome,
    res: Parameters<typeof getAuth>[0],
  ): boolean {
    if (outcome.kind === 'not-found') {
      res.status(404).json(apiError('NOT_FOUND', 'That request does not exist.'));
      return true;
    }
    if (outcome.kind === 'already-moderated') {
      // 409, not 400: the request is fine, the world moved. Two admins
      // working the queue at once land here, and it tells them what happened.
      res
        .status(409)
        .json(
          apiError('ALREADY_MODERATED', `That request was already ${outcome.status}.`),
        );
      return true;
    }
    return false;
  }

  function requestId(value: unknown): string | null {
    // blood_requests.id is a uuid column; Postgres raises on a malformed one.
    const parsed = z.uuid().safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  router.post(
    '/admin/requests/:id/approve',
    requireRole(auth, 'admin'),
    async (req, res) => {
      const caller = getAuth(res);
      const id = requestId(req.params.id);
      if (!caller) return;
      if (!id) {
        res.status(404).json(apiError('NOT_FOUND', 'That request does not exist.'));
        return;
      }

      const outcome = await admin.approve(id, caller.userId);
      if (answerFailure(outcome, res)) return;
      if (outcome.kind !== 'approved') return;

      /*
       * The donors are counted, not emailed. Dispatch (§5.3) is the next piece:
       * the notification_log insert, the SendGrid call, the batch cap and the
       * daily ceiling. Returning the count now is what §9.6 needs in front of
       * the admin, and makes it obvious when dispatch is wired that the number
       * should match what was sent.
       */
      res.json({
        status: 'approved',
        matchedDonors: outcome.matchedDonors.length,
        notificationsSent: 0,
        dispatchPending: true,
      });
    },
  );

  router.post(
    '/admin/requests/:id/reject',
    requireRole(auth, 'admin'),
    validateBody(rejectRequestSchema),
    async (req, res) => {
      const caller = getAuth(res);
      const id = requestId(req.params.id);
      if (!caller) return;
      if (!id) {
        res.status(404).json(apiError('NOT_FOUND', 'That request does not exist.'));
        return;
      }

      const { reason } = req.body as RejectRequestInput;
      const outcome = await admin.reject(id, caller.userId, reason);
      if (answerFailure(outcome, res)) return;

      res.json({ status: 'rejected' });
    },
  );

  return router;
}
