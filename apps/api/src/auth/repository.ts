import type { BloodType, UserRole } from '@kapka/shared';
import type pg from 'pg';
import { pool, withTransaction } from '../db';

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

export interface VerificationRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  /** Set once the link has been spent. A spent token is not a valid one. */
  consumedAt: Date | null;
}

export interface DonorProfileRecord {
  bloodType: BloodType;
  city: string;
  lastDonationDate: string | null;
  isAvailable: boolean;
  notifyByEmail: boolean;
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
  /** Null for a requester or admin, who have no donor profile. */
  findDonorProfile(userId: string): Promise<DonorProfileRecord | null>;
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

  /** Records a freshly issued confirmation link, by hash only (§12). */
  createVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<string>;
  findVerificationToken(tokenHash: string): Promise<VerificationRecord | null>;
  /**
   * Spends the token and verifies the account, in one transaction: marks this
   * row consumed, sets users.email_verified, and consumes the user's other
   * outstanding tokens so an older link in the same mailbox stops working.
   *
   * Returns the updated user, or null if the row had already been spent — two
   * taps on the same link race here, and exactly one of them may win.
   */
  consumeVerificationToken(id: string, userId: string): Promise<UserRecord | null>;
  /** When the newest confirmation link for this user was issued. */
  lastVerificationSentAt(userId: string): Promise<Date | null>;
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

/**
 * Every query below is parameterised. No string-built SQL, no exceptions (§12).
 *
 * Takes a Pool rather than any queryable, because two of these need a
 * transaction and a transaction needs a connection of its own.
 */
export function createPgAuthRepository(db: pg.Pool = pool): AuthRepository {
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

    async findDonorProfile(userId) {
      const { rows } = await db.query<{
        blood_type: BloodType;
        city: string;
        last_donation_date: Date | null;
        is_available: boolean;
        notify_by_email: boolean;
      }>(
        `SELECT blood_type, city, last_donation_date, is_available, notify_by_email
         FROM donor_profiles WHERE user_id = $1`,
        [userId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        bloodType: row.blood_type,
        city: row.city,
        // A DATE column comes back as a Date; the API speaks ISO days.
        lastDonationDate: row.last_donation_date
          ? row.last_donation_date.toISOString().slice(0, 10)
          : null,
        isAvailable: row.is_available,
        notifyByEmail: row.notify_by_email,
      };
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
      }, db);
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
      }, db);
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

    async createVerificationToken(userId, tokenHash, expiresAt) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3) RETURNING id`,
        [userId, tokenHash, expiresAt],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('verification token insert returned no row');
      return id;
    },

    async findVerificationToken(tokenHash) {
      const { rows } = await db.query<{
        id: string;
        user_id: string;
        expires_at: Date;
        consumed_at: Date | null;
      }>(
        `SELECT id, user_id, expires_at, consumed_at
         FROM email_verification_tokens WHERE token_hash = $1`,
        [tokenHash],
      );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            userId: row.user_id,
            expiresAt: row.expires_at,
            consumedAt: row.consumed_at,
          }
        : null;
    },

    async consumeVerificationToken(id, userId) {
      return withTransaction(async (client) => {
        /* The claim and the guard in one statement. Reading the row and then
           updating it would let two concurrent taps both pass the read; this
           way the second one updates nothing and gets no row back. */
        const claimed = await client.query<{ id: string }>(
          `UPDATE email_verification_tokens SET consumed_at = now()
           WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
          [id],
        );
        if (claimed.rows.length === 0) return null;

        /* Every other outstanding link for this account stops working. A donor
           who asked for three of them has one mailbox; leaving the older two
           live is two more bearer credentials for no benefit. */
        await client.query(
          `UPDATE email_verification_tokens SET consumed_at = now()
           WHERE user_id = $1 AND consumed_at IS NULL`,
          [userId],
        );

        const { rows } = await client.query<UserRow>(
          `UPDATE users SET email_verified = TRUE
           WHERE id = $1 RETURNING ${USER_COLUMNS}`,
          [userId],
        );
        const row = rows[0];
        return row ? toUser(row) : null;
      }, db);
    },

    async lastVerificationSentAt(userId) {
      const { rows } = await db.query<{ created_at: Date }>(
        `SELECT created_at FROM email_verification_tokens
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );
      return rows[0]?.created_at ?? null;
    },
  };
}
