import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { apiError, type UserRole } from '@kapka/shared';
import { setAuth } from '../auth/context';
import { verifyAccessToken } from '../auth/tokens';
import type { AuthRepository } from '../auth/repository';

/** Pulls the token out of `Authorization: Bearer <token>`. */
function bearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Verifies the token, then confirms the account against the database.
 *
 * Every guard here is self-sufficient: none of them depends on another
 * running first. An earlier version had requireRole read a context that only
 * requireAuth set, so mounting requireRole on its own produced a route that
 * refused everyone — a silent ordering requirement that nothing enforced.
 *
 * The database lookup is a primary-key read, and it is what makes a
 * deactivated account or a changed role take effect immediately rather than
 * whenever the 15-minute access token happens to expire. On this system an
 * admin action emails every matching donor, so a stale role is not something
 * to be relaxed about.
 */
async function authenticate(
  repository: AuthRepository,
  req: Request,
  res: Response,
): Promise<{ userId: string; role: UserRole; emailVerified: boolean } | null> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json(apiError('UNAUTHENTICATED', 'Sign in to continue.'));
    return null;
  }

  const claims = await verifyAccessToken(token);
  if (!claims) {
    // One message for expired, tampered with, wrongly signed, or using another
    // algorithm. The client's move is the same in every case.
    res.status(401).json(apiError('UNAUTHENTICATED', 'Your session has expired.'));
    return null;
  }

  const user = await repository.findUserById(claims.sub);
  if (!user?.isActive) {
    res.status(401).json(apiError('UNAUTHENTICATED', 'Your session has expired.'));
    return null;
  }

  return { userId: user.id, role: user.role, emailVerified: user.emailVerified };
}

/** Requires a signed-in, active account. Any role. */
export function requireAuth(repository: AuthRepository): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = await authenticate(repository, req, res);
    if (!auth) return;
    setAuth(res, auth);
    next();
  };
}

/**
 * Requires one of `roles`, checked against the database rather than the
 * token's claim.
 *
 * Hiding the button in React is not access control (§12).
 */
export function requireRole(
  repository: AuthRepository,
  ...roles: UserRole[]
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = await authenticate(repository, req, res);
    if (!auth) return;

    if (!roles.includes(auth.role)) {
      // 403, not 404: the caller is known, and pretending the route does not
      // exist would only confuse a legitimate user who lost a permission.
      res.status(403).json(apiError('FORBIDDEN', 'You do not have access to that.'));
      return;
    }

    setAuth(res, auth);
    next();
  };
}

/**
 * Attaches the caller when there is a valid token, and continues quietly when
 * there is not.
 *
 * For endpoints that serve everyone but show more to a signed-in user — the
 * public feed returns the requester's contact details only to authenticated
 * callers (§4). A bad token is treated as no token: this must never be a way
 * to turn a public page into an error.
 *
 * Token-only, with no database read, because it runs on the busiest public
 * route and being wrong about a role here shows one extra phone number rather
 * than granting a permission.
 */
export function optionalAuth(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (token) {
      const claims = await verifyAccessToken(token);
      if (claims)
        setAuth(res, { userId: claims.sub, role: claims.role, emailVerified: false });
    }
    next();
  };
}
