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

export const OAUTH_STATE_COOKIE = 'kapka_oauth';

/** The handshake is worthless a few minutes after it starts. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/**
 * The cookie that carries the CSRF `state` and the PKCE verifier across the
 * round trip to Google.
 *
 * SameSite=Lax, and that is the whole reason this is a separate cookie rather
 * than a second use of the refresh one. Coming back from accounts.google.com
 * is a cross-site top-level navigation, and a Strict cookie is NOT sent on
 * one — the callback would find nothing, every sign-in would fail, and the
 * failure would look like a bug in the state check rather than in the cookie.
 * Lax is exactly the case this flow is: a top-level GET arriving from
 * somewhere else.
 *
 * Path is the callback's own prefix, so it rides along with nothing else, and
 * it is httpOnly for the same reason the refresh token is: a PKCE verifier
 * readable by script is a PKCE verifier that is not doing its job.
 */
export function oauthStateCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
  };
}

/** Must match the set options apart from maxAge, or the browser keeps it. */
export function clearOauthStateCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...rest } = oauthStateCookieOptions();
  return rest;
}
