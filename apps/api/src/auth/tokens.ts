import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { UserRole } from '@kapka/shared';
import { env } from '../env';

/** §12: short-lived, so a leaked access token stops working quickly. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** How long a session can go unused before the refresh token expires. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const ALGORITHM = 'HS256';
const secret = () => new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  role: UserRole;
}

export function signAccessToken(userId: string, role: UserRole): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${String(ACCESS_TOKEN_TTL_SECONDS)}s`)
    .sign(secret());
}

/**
 * Returns the claims, or null for anything wrong — expired, tampered with,
 * signed with another key, or using a different algorithm.
 *
 * The algorithm is pinned. Accepting whatever the token's own header asks for
 * is how a token signed with `alg: none` gets trusted.
 */
export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALGORITHM] });
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') return null;
    return payload as AccessTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Refresh tokens are opaque random bytes, not JWTs.
 *
 * A JWT refresh token is valid until it expires whatever the server decides,
 * which is exactly the property rotation and logout need it not to have.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What gets stored. The token itself never touches the database (§12). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}
