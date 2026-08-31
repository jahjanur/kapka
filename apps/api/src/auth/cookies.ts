import type { CookieOptions } from 'express';
import { env } from '../env';
import { REFRESH_TOKEN_TTL_SECONDS } from './tokens';

export const REFRESH_COOKIE = 'kapka_refresh';

/**
 * §12: httpOnly, Secure, SameSite=Strict.
 *
 * httpOnly     — JavaScript cannot read it, so an XSS bug cannot steal the
 *                session. This is why the refresh token is not in
 *                localStorage.
 * sameSite     — strict, so no cross-site request carries it.
 * secure       — off in local development only, because localhost is http.
 * path         — scoped to the auth routes. The cookie is not sent with every
 *                request to the API, only to the endpoints that use it.
 */
export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

/** Must match the set options apart from maxAge, or the browser keeps it. */
export function clearRefreshCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...rest } = refreshCookieOptions();
  return rest;
}
