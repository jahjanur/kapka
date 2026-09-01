import type {
  BloodType,
  DonorNotification,
  DonorProfilePatchInput,
  NotificationStatus,
  RequestStatus,
  Urgency,
  UserRole,
} from '@kapka/shared';
import type pg from 'pg';
import { pool, withTransaction } from '../db';
import { eligibleFromSql } from '../matching/eligibility';

/** Exactly what donorProfilePatchSchema accepts — see @kapka/shared. */
export type DonorProfilePatch = DonorProfilePatchInput;

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
  /**
   * Null when they can give today, otherwise the day the interval is up.
   *
   * Computed in SQL and handed over, so no screen has to do date arithmetic
   * to answer the one question a donor opens their dashboard to ask (§5.2).
   */
  eligibleFrom: string | null;
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
  /**
   * Applies a partial update and returns the profile as it now stands.
   *
   * Null when there is no profile to update — the caller is a requester or an
   * admin, and creating one for them would invent a blood type.
   */
  updateDonorProfile(
    userId: string,
    patch: DonorProfilePatch,
  ): Promise<DonorProfileRecord | null>;
  /** Everything this donor has been contacted about, newest first (§9.5). */
  listNotifications(userId: string): Promise<DonorNotification[]>;
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

interface ProfileRow {
  blood_type: BloodType;
  city: string;
  last_donation_date: string | null;
  is_available: boolean;
  notify_by_email: boolean;
  eligible_from: string | null;
}

/* to_char, not the bare column: node-pg parses a DATE into a Date at LOCAL
   midnight, so toISOString() on it gives the previous day east of UTC. */
const PROFILE_COLUMNS = `
  blood_type, city,
  to_char(last_donation_date, 'YYYY-MM-DD') AS last_donation_date,
  is_available, notify_by_email,
  ${eligibleFromSql('last_donation_date')} AS eligible_from`;

const toProfile = (row: ProfileRow): DonorProfileRecord => ({
  bloodType: row.blood_type,
  city: row.city,
  lastDonationDate: row.last_donation_date,
  isAvailable: row.is_available,
  notifyByEmail: row.notify_by_email,
  eligibleFrom: row.eligible_from,
});

/** A donor is unlikely to read past this, and it bounds the payload (§11). */
export const NOTIFICATION_HISTORY_LIMIT = 50;

interface NotificationRow {
  request_id: string;
  blood_type: BloodType;
  urgency: Urgency;
  hospital_name: string;
  city: string;
  request_status: RequestStatus;
  status: NotificationStatus;
  created_at: Date;
  sent_at: Date | null;
}

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
      const { rows } = await db.query<ProfileRow>(
        /* to_char, not the bare column. node-pg parses a DATE into a Date at
           LOCAL midnight, so toISOString() on it gives the previous day in
           every timezone east of UTC — this returned 2026-08-10 for a
           donation recorded on the 11th. Postgres formats the day instead. */
        `SELECT ${PROFILE_COLUMNS} FROM donor_profiles WHERE user_id = $1`,
        [userId],
      );
      return rows[0] ? toProfile(rows[0]) : null;
    },

    async updateDonorProfile(userId, patch) {
      /*
       * COALESCE against the column, so an absent field keeps what is there.
       * Every value is a bound parameter and the column list is fixed in this
       * source — there is no path from a request body to the SQL text.
       *
       * lastDonationDate is the exception the COALESCE pattern cannot cover:
       * null is a real value there ("I have never donated") and is different
       * from absent, so it carries its own flag.
       */
      const { rows } = await db.query<ProfileRow>(
        `UPDATE donor_profiles SET
           blood_type   = COALESCE($2::blood_type, blood_type),
           city         = COALESCE($3::text, city),
           last_donation_date = CASE WHEN $4::boolean THEN $5::date
                                     ELSE last_donation_date END,
           is_available = COALESCE($6::boolean, is_available),
           notify_by_email = COALESCE($7::boolean, notify_by_email)
         WHERE user_id = $1
         RETURNING ${PROFILE_COLUMNS}`,
        [
          userId,
          patch.bloodType ?? null,
          patch.city ?? null,
          'lastDonationDate' in patch,
          patch.lastDonationDate ?? null,
          patch.isAvailable ?? null,
          patch.notifyByEmail ?? null,
        ],
      );
      return rows[0] ? toProfile(rows[0]) : null;
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

    async listNotifications(userId) {
      /*
       * Rides idx_notification_donor, which exists for this and until now had
       * nothing to serve: the UNIQUE (request_id, donor_id) constraint cannot
       * answer a lookup by donor alone, because donor_id is its second column.
       *
       * Scoped to the caller in the WHERE clause, not filtered afterwards.
       * This joins one donor's rows to requests; there is no shape of this
       * query that returns somebody else's and gets trimmed later.
       */
      const { rows } = await db.query<NotificationRow>(
        `SELECT nl.request_id, nl.status, nl.created_at, nl.sent_at,
                r.blood_type, r.urgency, r.hospital_name, r.city,
                r.status AS request_status
         FROM notification_log nl
         JOIN blood_requests r ON r.id = nl.request_id
         WHERE nl.donor_id = $1
         ORDER BY nl.created_at DESC
         LIMIT ${String(NOTIFICATION_HISTORY_LIMIT)}`,
        [userId],
      );

      return rows.map((row) => ({
        requestId: row.request_id,
        bloodType: row.blood_type,
        urgency: row.urgency,
        hospitalName: row.hospital_name,
        city: row.city,
        requestStatus: row.request_status,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        sentAt: row.sent_at ? row.sent_at.toISOString() : null,
      }));
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
