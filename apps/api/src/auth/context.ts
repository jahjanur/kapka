import type { Response } from 'express';
import type { UserRole } from '@kapka/shared';

/** Who the current request is acting as, once a token has been verified. */
export interface AuthContext {
  userId: string;
  /** From the database, not the token — see requireRole. */
  role: UserRole;
  emailVerified: boolean;
}

const KEY = 'auth';

/**
 * Carried on res.locals rather than by augmenting Express's Request type.
 * A global augmentation would make `req.auth` look available on every route,
 * including the ones with no authentication at all.
 */
export function setAuth(res: Response, auth: AuthContext): void {
  res.locals[KEY] = auth;
}

export function getAuth(res: Response): AuthContext | null {
  const value: unknown = res.locals[KEY];
  return isAuthContext(value) ? value : null;
}

function isAuthContext(value: unknown): value is AuthContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AuthContext).userId === 'string' &&
    typeof (value as AuthContext).role === 'string'
  );
}
