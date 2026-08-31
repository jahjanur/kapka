import { Router } from 'express';
import { getAuth } from '../auth/context';
import { requireAuth } from '../middleware/auth';
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

  return router;
}
