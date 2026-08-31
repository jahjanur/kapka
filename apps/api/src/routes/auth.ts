import { Router } from 'express';
import { apiError, loginSchema, registerSchema } from '@kapka/shared';
import { authRateLimit } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import {
  REFRESH_COOKIE,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from '../auth/cookies';
import { hashPassword, verifyAgainstNobody, verifyPassword } from '../auth/passwords';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from '../auth/tokens';
import type { AuthRepository, UserRecord } from '../auth/repository';

interface SessionBody {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRecord['role'];
    emailVerified: boolean;
  };
}

function sessionBody(user: UserRecord, accessToken: string): SessionBody {
  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      // The client shows a "verify your email" prompt from this. Verification
      // gates notifications (§12), not sign-in.
      emailVerified: user.emailVerified,
    },
  };
}

export function createAuthRouter(repository: AuthRepository): Router {
  const router = Router();
  router.use(authRateLimit);

  /** Issues a refresh token, stores its hash, and sets the cookie. */
  async function startSession(
    userId: string,
    setCookie: (
      name: string,
      value: string,
      options: ReturnType<typeof refreshCookieOptions>,
    ) => void,
  ): Promise<void> {
    const token = generateRefreshToken();
    await repository.storeRefreshToken(
      userId,
      hashRefreshToken(token),
      refreshTokenExpiry(),
    );
    setCookie(REFRESH_COOKIE, token, refreshCookieOptions());
  }

  router.post('/auth/register', validateBody(registerSchema), async (req, res) => {
    const input = req.body as import('@kapka/shared').RegisterInput;

    const existing = await repository.findUserByEmail(input.email);
    if (existing) {
      // Registration cannot hide that an email is taken — the user has to be
      // told. Login is where enumeration matters, and it says nothing.
      res
        .status(409)
        .json(apiError('EMAIL_TAKEN', 'That email already has an account.', 'email'));
      return;
    }

    const user = await repository.createUser({
      fullName: input.fullName,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      phone: input.phone ?? null,
      bloodType: input.bloodType,
      city: input.city,
      lastDonationDate: input.lastDonationDate ?? null,
    });

    const accessToken = await signAccessToken(user.id, user.role);
    await startSession(user.id, (name, value, options) =>
      res.cookie(name, value, options),
    );
    res.status(201).json(sessionBody(user, accessToken));
  });

  router.post('/auth/login', validateBody(loginSchema), async (req, res) => {
    const { email, password } = req.body as import('@kapka/shared').LoginInput;
    const user = await repository.findUserByEmail(email);

    // One message and one status for every failure: wrong password, unknown
    // email, deactivated account. Anything more specific tells an attacker
    // which emails have accounts (§12). The dummy comparison keeps the timing
    // the same when there is no user to check against.
    const ok = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyAgainstNobody(password);

    if (!user || !ok || !user.isActive) {
      res
        .status(401)
        .json(apiError('INVALID_CREDENTIALS', 'That email and password do not match.'));
      return;
    }

    const accessToken = await signAccessToken(user.id, user.role);
    await startSession(user.id, (name, value, options) =>
      res.cookie(name, value, options),
    );
    res.json(sessionBody(user, accessToken));
  });

  router.post('/auth/refresh', async (req, res) => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const presented = cookies?.[REFRESH_COOKIE];
    if (!presented) {
      res.status(401).json(apiError('UNAUTHENTICATED', 'No session.'));
      return;
    }

    const record = await repository.findRefreshToken(hashRefreshToken(presented));
    if (!record) {
      res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      res.status(401).json(apiError('UNAUTHENTICATED', 'No session.'));
      return;
    }

    if (record.revokedAt) {
      /*
       * A revoked token was presented. The legitimate holder rotated it, so
       * whoever sent this one either copied it or is replaying an old one —
       * either way the session is not trustworthy. Revoke the whole family
       * and make everyone sign in again.
       */
      await repository.revokeAllForUser(record.userId);
      res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      res
        .status(401)
        .json(apiError('UNAUTHENTICATED', 'Session ended. Please sign in again.'));
      return;
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      await repository.revokeRefreshToken(record.id);
      res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      res
        .status(401)
        .json(apiError('UNAUTHENTICATED', 'Session expired. Please sign in again.'));
      return;
    }

    const user = await repository.findUserById(record.userId);
    if (!user?.isActive) {
      await repository.revokeAllForUser(record.userId);
      res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
      res.status(401).json(apiError('UNAUTHENTICATED', 'No session.'));
      return;
    }

    // Rotation: the presented token stops working the moment this succeeds.
    const next = generateRefreshToken();
    await repository.rotateRefreshToken(
      record.id,
      user.id,
      hashRefreshToken(next),
      refreshTokenExpiry(),
    );
    res.cookie(REFRESH_COOKIE, next, refreshCookieOptions());

    const accessToken = await signAccessToken(user.id, user.role);
    res.json(sessionBody(user, accessToken));
  });

  router.post('/auth/logout', async (req, res) => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const presented = cookies?.[REFRESH_COOKIE];

    if (presented) {
      const record = await repository.findRefreshToken(hashRefreshToken(presented));
      if (record && !record.revokedAt) await repository.revokeRefreshToken(record.id);
    }

    // Always clear and always succeed. Logging out must not be able to fail,
    // and must not report whether there was a session to end.
    res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
    res.status(204).end();
  });

  return router;
}
