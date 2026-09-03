import { Router } from 'express';
import {
  apiError,
  deleteAccountSchema,
  donorProfilePatchSchema,
  type DeleteAccountInput,
  type DonorProfilePatchInput,
} from '@kapka/shared';
import { getAuth } from '../auth/context';
import { verifyPassword } from '../auth/passwords';
import { REFRESH_COOKIE, clearRefreshCookieOptions } from '../auth/cookies';
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
   * GET /api/me/notifications — what we have contacted this donor about (§9.5).
   *
   * Their own rows only, scoped in the query. A donor asked to give blood by
   * an automated system is owed a plain answer to "what have you sent me".
   */
  router.get('/me/notifications', requireAuth(repository), async (_req, res) => {
    const auth = getAuth(res);
    if (!auth) return;
    res.json({ notifications: await repository.listNotifications(auth.userId) });
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

  /**
   * GET /api/me/export — everything we hold about the caller (§12).
   *
   * Sent as a download rather than rendered, because the point is to have
   * the file. The shape follows the tables: an export is a record of what is
   * stored, and arranging it into a nicer story would make it a worse answer
   * to "what do you have about me".
   */
  router.get('/me/export', requireAuth(repository), async (_req, res) => {
    const auth = getAuth(res);
    if (!auth) return;

    const data = await repository.exportUserData(auth.userId);
    if (!data) return; // requireAuth already confirmed the account exists.

    const day = data.exportedAt.slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kapka-data-${day}.json"`);
    // An export is the one response that must never be cached by anything.
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(data, null, 2));
  });

  /**
   * DELETE /api/me — real deletion (§12).
   *
   * The password again, because this cannot be undone and takes the requests
   * they posted with it. One field for the person; everything, for somebody
   * holding a borrowed session.
   *
   * An account that signed up with Google has no password to re-enter, and
   * has to be deletable anyway — §12 promises deletion to everybody, and a
   * promise that cannot be kept for a whole class of account is not one. For
   * those the access token is the whole of the proof: it is fifteen minutes
   * old at most, it was issued to a browser that completed the provider's own
   * sign-in, and there is no second factor available to ask for.
   */
  router.delete(
    '/me',
    requireAuth(repository),
    validateBody(deleteAccountSchema),
    async (req, res) => {
      const auth = getAuth(res);
      if (!auth) return;

      const user = await repository.findUserById(auth.userId);
      if (!user) return;

      const { password } = req.body as DeleteAccountInput;
      if (
        user.passwordHash !== null &&
        !(await verifyPassword(password, user.passwordHash))
      ) {
        /* Not the generic login message: the caller is already authenticated
           and knows the account exists, so there is nothing to protect by
           being vague — only a person to confuse. */
        res
          .status(401)
          .json(
            apiError('INVALID_CREDENTIALS', 'That password is not right.', 'password'),
          );
        return;
      }

      await repository.deleteUser(auth.userId);

      /* The cookie goes too. Leaving it would send a token for a user who no
         longer exists on every subsequent request, and the refresh rows are
         already gone with the account. */
      res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      res.status(204).end();
    },
  );

  return router;
}
