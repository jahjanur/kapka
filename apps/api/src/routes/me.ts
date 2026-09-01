import { Router } from 'express';
import {
  apiError,
  donorProfilePatchSchema,
  type DonorProfilePatchInput,
} from '@kapka/shared';
import { getAuth } from '../auth/context';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import type { AuthRepository } from '../auth/repository';

/**
 * GET /api/me — the current user and their donor profile (§4).
 *
 * requireAuth confirms the account against the database, so a role change or
 * a deactivation is reflected here immediately rather than whenever the
 * 15-minute access token happens to expire.
 */
export function createMeRouter(repository: AuthRepository): Router {
  const router = Router();

  router.get('/me', requireAuth(repository), async (_req, res) => {
    const auth = getAuth(res);
    if (!auth) return; // requireAuth has already answered.

    const [user, profile] = await Promise.all([
      repository.findUserById(auth.userId),
      repository.findDonorProfile(auth.userId),
    ]);
    if (!user) return;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        emailVerified: user.emailVerified,
      },
      // Null for a requester or an admin, who never had one.
      donorProfile: profile,
    });
  });

  /**
   * PATCH /api/me/donor-profile — the donor's own settings (§9.5).
   *
   * Every field optional, at least one required, enforced by the schema. The
   * pause switch lives here: without it, stopping the emails would mean
   * deleting the account (§3), and a donor who cannot pause quietly is a
   * donor who leaves loudly.
   */
  router.patch(
    '/me/donor-profile',
    requireAuth(repository),
    validateBody(donorProfilePatchSchema),
    async (req, res) => {
      const auth = getAuth(res);
      if (!auth) return;

      const profile = await repository.updateDonorProfile(
        auth.userId,
        req.body as DonorProfilePatchInput,
      );

      if (!profile) {
        // A requester or an admin. Creating a profile here would have to
        // invent a blood type, which is the one field nobody may guess.
        res
          .status(404)
          .json(apiError('NOT_FOUND', 'This account does not have a donor profile.'));
        return;
      }

      res.json({ donorProfile: profile });
    },
  );

  return router;
}
