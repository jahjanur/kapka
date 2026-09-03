import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env';

/**
 * Sign in with Google, as an OpenID Connect authorization-code flow with
 * PKCE (§9.2, §12).
 *
 * Server-side and redirect-based, not Google's in-page SDK. Three reasons,
 * and the first two are not preferences:
 *
 *  - The web app ships a CSP with `connect-src 'self'` and a script-src hash
 *    pin (apps/web/index.html), and bundle/privacy.test.ts asserts that no
 *    third-party origin is referenced anywhere. Loading gsi/client would
 *    require unpicking all of that.
 *  - A redirect the API issues is not governed by the document's CSP at all,
 *    so `form-action 'self'` stays intact.
 *  - The client secret and the code exchange never leave the server.
 *
 * The endpoints are pinned as constants rather than read from Google's
 * discovery document at boot. They have not moved in a decade, and a network
 * call on the startup path is a way for the API to fail to start when Google
 * is having a bad morning.
 */
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/* Cached across requests: it holds the fetched signing keys and refetches
   them only when it meets a key id it does not know, which is what makes
   verification a local operation rather than a call to Google per sign-in. */
const jwks = createRemoteJWKSet(new URL(JWKS_URI));

export interface GoogleIdentity {
  /** Google's immutable id for the person. The only claim safe to key on. */
  subject: string;
  email: string;
  /**
   * Whether GOOGLE says the address is verified — not whether we do.
   *
   * This is the whole of the account-linking decision. An unverified claim
   * means somebody typed an address into a Google account without proving
   * they read its mail, and honouring it would hand them any Kapka account
   * with that email (§12).
   */
  emailVerified: boolean;
  fullName: string;
}

/** The half of the handshake that has to survive the round trip to Google. */
export interface OAuthHandshake {
  state: string;
  codeVerifier: string;
}

/** 256 bits, URL-safe — the shape PKCE and `state` both want. */
const randomUrlSafe = () => randomBytes(32).toString('base64url');

export function beginHandshake(): OAuthHandshake {
  return { state: randomUrlSafe(), codeVerifier: randomUrlSafe() };
}

/**
 * Constant-time comparison, because `state` is a secret being checked against
 * one an attacker supplies, and `===` on strings leaks its answer in how long
 * it takes to give it.
 */
export function statesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which is itself the answer —
  // so the lengths are compared first and separately.
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Where the browser is sent back to. Must match the console entry exactly. */
export function redirectUri(): string {
  return `${env.API_BASE_URL}/api/auth/google/callback`;
}

/** The URL to send the browser to, with the challenge derived from PKCE. */
export function authorizationUrl(handshake: OAuthHandshake): string {
  const challenge = createHash('sha256')
    .update(handshake.codeVerifier)
    .digest('base64url');

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state: handshake.state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    /* Ask Google to show the account chooser rather than silently reusing
       whichever account the browser is already signed into — on a shared
       phone that is how one donor ends up in another's account. */
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges the one-time code for an ID token, and verifies it.
 *
 * The verification is the security boundary of this whole feature: signature
 * against Google's published keys, issuer, audience, and expiry. A token that
 * fails any of those is somebody else's, and this throws rather than
 * returning something a caller might use half of.
 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<GoogleIdentity> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(),
    }),
  });

  if (!response.ok) {
    /* The body quotes the request back, client_secret included. It is never
       logged and never returned — the caller turns this into one opaque
       failure for the browser. */
    throw new Error(`google token exchange failed with ${String(response.status)}`);
  }

  const body = (await response.json()) as { id_token?: unknown };
  if (typeof body.id_token !== 'string') {
    throw new Error('google token response carried no id_token');
  }

  const { payload } = await jwtVerify(body.id_token, jwks, {
    issuer: ISSUERS,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const { sub, email, email_verified: verified, name } = payload;
  if (typeof sub !== 'string' || typeof email !== 'string') {
    throw new Error('google id_token was missing sub or email');
  }

  return {
    subject: sub,
    email,
    /* Google sends this as a boolean, but has historically sent the string
       "true" as well, and a truthy check on the string "false" is how an
       unverified address gets treated as a verified one. */
    emailVerified: verified === true || verified === 'true',
    /* Not every Google account has a name on it. Falling back to the local
       part beats storing an empty string in a NOT NULL column. */
    fullName:
      typeof name === 'string' && name.trim() !== ''
        ? name.trim()
        : (email.split('@')[0] ?? 'Donor'),
  };
}
