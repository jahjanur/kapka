import type { BloodType, UserRole } from '@kapka/shared';
import { pool, withTransaction, type Queryable } from '../db';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  fullName: string;
  isActive: boolean;
  emailVerified: boolean;
}

export interface RefreshRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  bloodType: BloodType;
  city: string;
  lastDonationDate: string | null;
}

/**
 * The database operations auth needs, as an interface.
 *
 * Routes take one of these rather than reaching for a pool, so the endpoints
 * can be exercised over real HTTP against a fake — which is what makes the
 * behaviour testable while no Postgres is running.
 */
export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  /** Creates the user and the donor profile in one transaction (§4). */
  createUser(input: RegisterInput): Promise<UserRecord>;
  storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<string>;
  findRefreshToken(tokenHash: string): Promise<RefreshRecord | null>;
  /** Revokes `oldId` and issues a replacement, linked for traceability. */
  rotateRefreshToken(
    oldId: string,
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<string>;
  revokeRefreshToken(id: string): Promise<void>;
  /** Used when a revoked token is presented — see the reuse note in routes. */
  revokeAllForUser(userId: string): Promise<void>;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  full_name: string;
  is_active: boolean;
  email_verified: boolean;
}

const toUser = (row: UserRow): UserRecord => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  role: row.role,
  fullName: row.full_name,
  isActive: row.is_active,
  emailVerified: row.email_verified,
});

const USER_COLUMNS =
  'id, email, password_hash, role, full_name, is_active, email_verified';

/** Every query below is parameterised. No string-built SQL, no exceptions (§12). */
export function createPgAuthRepository(db: Queryable = pool): AuthRepository {
  return {
    async findUserByEmail(email) {
      // email is CITEXT, so this is already case-insensitive in the database.
      const { rows } = await db.query<UserRow>(
        `SELECT ${USER_COLUMNS} FROM users WHERE email = $1`,
        [email],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },

    async findUserById(id) {
      const { rows } = await db.query<UserRow>(
        `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
        [id],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },

    async createUser(input) {
      return withTransaction(async (client) => {
        const { rows } = await client.query<UserRow>(
          `INSERT INTO users (email, password_hash, full_name, phone, role)
           VALUES ($1, $2, $3, $4, 'donor')
           RETURNING ${USER_COLUMNS}`,
          [input.email, input.passwordHash, input.fullName, input.phone],
        );
        const row = rows[0];
        if (!row) throw new Error('user insert returned no row');

        await client.query(
          `INSERT INTO donor_profiles (user_id, blood_type, city, last_donation_date)
           VALUES ($1, $2, $3, $4)`,
          [row.id, input.bloodType, input.city, input.lastDonationDate],
        );
        return toUser(row);
      });
    },

    async storeRefreshToken(userId, tokenHash, expiresAt) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3) RETURNING id`,
        [userId, tokenHash, expiresAt],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('refresh token insert returned no row');
      return id;
    },

    async findRefreshToken(tokenHash) {
      const { rows } = await db.query<{
        id: string;
        user_id: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        `SELECT id, user_id, expires_at, revoked_at
         FROM refresh_tokens WHERE token_hash = $1`,
        [tokenHash],
      );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            userId: row.user_id,
            expiresAt: row.expires_at,
            revokedAt: row.revoked_at,
          }
        : null;
    },

    async rotateRefreshToken(oldId, userId, tokenHash, expiresAt) {
      return withTransaction(async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3) RETURNING id`,
          [userId, tokenHash, expiresAt],
        );
        const id = rows[0]?.id;
        if (!id) throw new Error('refresh token insert returned no row');

        await client.query(
          `UPDATE refresh_tokens
           SET revoked_at = now(), replaced_by = $2
           WHERE id = $1 AND revoked_at IS NULL`,
          [oldId, id],
        );
        return id;
      });
    },

    async revokeRefreshToken(id) {
      await db.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE id = $1 AND revoked_at IS NULL`,
        [id],
      );
    },

    async revokeAllForUser(userId) {
      await db.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
    },
  };
}
