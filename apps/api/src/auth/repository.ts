import type {
  BloodType,
  DonorExport,
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
  /**
   * Null for an account that has only ever signed in with a provider.
   *
   * Not a hash of a random string nobody knows: that would leave a value here
   * that says the account has a password when it has none, and every check
   * against it would be a slow way of learning nothing.
   */
  passwordHash: string | null;
  role: UserRole;
  fullName: string;
  isActive: boolean;
  emailVerified: boolean;
}

export interface AvatarRecord {
  image: Buffer;
  /** Sniffed from the bytes when it was stored, never claimed by a caller. */
  contentType: string;
}

/** The providers user_identities.provider accepts. */
export type IdentityProvider = 'google';

export interface IdentityUserInput {
  email: string;
  fullName: string;
  emailVerified: boolean;
  provider: IdentityProvider;
  subject: string;
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
/**
 * Every field a profile cannot be created without.
 *
 * `| undefined` spelled out on the optional one: exactOptionalPropertyTypes
 * means an absent key and an explicit undefined are different types, and the
 * schema's `.optional()` produces the latter.
 */
export interface DonorProfileInput {
  bloodType: DonorProfileRecord['bloodType'];
  city: string;
  lastDonationDate?: string | null | undefined;
}

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
  /**
   * Writes a whole profile for an account that has none, and returns it.
   *
   * The counterpart to updateDonorProfile refusing to create one: a patch
   * cannot invent a blood type, but a caller supplying every required field
   * is not inventing anything. This is how a Google account — made with no
   * profile, because Google knows neither blood type nor city — becomes a
   * donor the matching query can actually see.
   *
   * Idempotent on the primary key: a second call replaces rather than
   * raising, so a double submit is not an error page.
   */
  createDonorProfile(
    userId: string,
    input: DonorProfileInput,
  ): Promise<DonorProfileRecord>;
  /** Everything this donor has been contacted about, newest first (§9.5). */
  listNotifications(userId: string): Promise<DonorNotification[]>;
  /** Everything held about one person, for them to take away (§12). */
  exportUserData(userId: string): Promise<DonorExport | null>;
  /**
   * Real deletion (§12). Returns false if there was nobody to delete.
   *
   * Everything of theirs goes by CASCADE — profile, sessions, verification
   * tokens, the requests they posted. The notification log is the exception
   * and keeps its rows with the donor detached; see the migration for why.
   */
  deleteUser(userId: string): Promise<boolean>;
  /** Creates the user and the donor profile in one transaction (§4). */
  createUser(input: RegisterInput): Promise<UserRecord>;

  /** Somebody's profile picture, or null if they have not set one (§9.5). */
  findAvatar(userId: string): Promise<AvatarRecord | null>;
  /** Replaces whatever was there — one picture per person, not a gallery. */
  saveAvatar(userId: string, image: Buffer, contentType: string): Promise<void>;
  /** Returns false if there was nothing to remove. */
  deleteAvatar(userId: string): Promise<boolean>;

  /**
   * The account this provider subject belongs to, if it has one (§9.2).
   *
   * Keyed on the subject, never the email — an email address can be
   * reassigned by whoever owns the domain, and a provider subject cannot.
   */
  findUserByIdentity(
    provider: IdentityProvider,
    subject: string,
  ): Promise<UserRecord | null>;

  /**
   * Attaches a provider identity to an account that already exists.
   *
   * Idempotent: two callbacks racing on the first sign-in must not make two
   * rows, and the second must not fail.
   */
  linkIdentity(
    userId: string,
    provider: IdentityProvider,
    subject: string,
  ): Promise<void>;

  /**
   * Creates an account from a provider identity, with no password and no
   * donor profile, and links the identity — one transaction, because an
   * account with neither a password nor an identity cannot be signed into by
   * anybody and would just sit there holding the email address.
   *
   * No donor profile, because Google knows neither a blood type nor a city
   * and both are NOT NULL. That is a supported state, not a gap: a requester
   * and an admin have no profile either, which is what findDonorProfile
   * returning null has always meant.
   */
  createUserFromIdentity(input: IdentityUserInput): Promise<UserRecord>;
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
  password_hash: string | null;
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

    async createDonorProfile(userId, input) {
      /* ON CONFLICT rather than an existence check: two submits arriving
         together would both pass the check and the second would raise on the
         primary key. The upsert makes the race a no-op instead. */
      const { rows } = await db.query<ProfileRow>(
        `INSERT INTO donor_profiles (user_id, blood_type, city, last_donation_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           blood_type = EXCLUDED.blood_type,
           city = EXCLUDED.city,
           last_donation_date = EXCLUDED.last_donation_date
         RETURNING ${PROFILE_COLUMNS}`,
        [userId, input.bloodType, input.city, input.lastDonationDate ?? null],
      );
      const row = rows[0];
      if (!row) throw new Error('donor profile insert returned no row');
      return toProfile(row);
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

    async findAvatar(userId) {
      const { rows } = await db.query<{ image: Buffer; content_type: string }>(
        'SELECT image, content_type FROM user_avatars WHERE user_id = $1',
        [userId],
      );
      const row = rows[0];
      return row ? { image: row.image, contentType: row.content_type } : null;
    },

    async saveAvatar(userId, image, contentType) {
      /* Upsert, because setting a picture when you already have one is the
         ordinary case and two round trips to discover that would be one too
         many. */
      await db.query(
        `INSERT INTO user_avatars (user_id, image, content_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id)
         DO UPDATE SET image = EXCLUDED.image,
                       content_type = EXCLUDED.content_type,
                       updated_at = now()`,
        [userId, image, contentType],
      );
    },

    async deleteAvatar(userId) {
      const { rowCount } = await db.query('DELETE FROM user_avatars WHERE user_id = $1', [
        userId,
      ]);
      return (rowCount ?? 0) > 0;
    },

    async findUserByIdentity(provider, subject) {
      const { rows } = await db.query<UserRow>(
        `SELECT ${USER_COLUMNS.split(', ')
          .map((column) => `u.${column}`)
          .join(', ')}
           FROM users u
           JOIN user_identities i ON i.user_id = u.id
          WHERE i.provider = $1 AND i.subject = $2`,
        [provider, subject],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },

    async linkIdentity(userId, provider, subject) {
      /* Idempotent by the table's own UNIQUE (user_id, provider): two tabs
         finishing the same first sign-in race here, and the loser must be a
         no-op rather than a 500. */
      await db.query(
        `INSERT INTO user_identities (user_id, provider, subject)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, provider) DO NOTHING`,
        [userId, provider, subject],
      );
    },

    async createUserFromIdentity(input) {
      return withTransaction(async (client) => {
        const { rows } = await client.query<UserRow>(
          `INSERT INTO users (email, password_hash, full_name, role, email_verified)
           VALUES ($1, NULL, $2, 'donor', $3)
           RETURNING ${USER_COLUMNS}`,
          [input.email, input.fullName, input.emailVerified],
        );
        const row = rows[0];
        if (!row) throw new Error('user insert returned no row');

        await client.query(
          `INSERT INTO user_identities (user_id, provider, subject) VALUES ($1, $2, $3)`,
          [row.id, input.provider, input.subject],
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

    async exportUserData(userId) {
      /*
       * Four reads, all scoped to this user, inside one transaction so the
       * export is a single moment rather than a smear across four of them.
       * Notably absent: password_hash. An export is what we hold about a
       * person, not a head start on cracking their password.
       */
      return withTransaction(async (client) => {
        const { rows: users } = await client.query<{
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          role: UserRole;
          email_verified: boolean;
          created_at: Date;
        }>(
          `SELECT id, email, full_name, phone, role, email_verified, created_at
           FROM users WHERE id = $1`,
          [userId],
        );
        const user = users[0];
        if (!user) return null;

        const { rows: profiles } = await client.query<ProfileRow>(
          `SELECT ${PROFILE_COLUMNS} FROM donor_profiles WHERE user_id = $1`,
          [userId],
        );

        const { rows: requests } = await client.query<{
          id: string;
          blood_type: BloodType;
          units_needed: number;
          urgency: Urgency;
          hospital_name: string;
          city: string;
          contact_phone: string;
          note: string | null;
          status: RequestStatus;
          created_at: Date;
        }>(
          `SELECT id, blood_type, units_needed, urgency, hospital_name, city,
                  contact_phone, note, status, created_at
           FROM blood_requests WHERE requester_id = $1
           ORDER BY created_at DESC`,
          [userId],
        );

        const { rows: notifications } = await client.query<{
          request_id: string;
          hospital_name: string;
          city: string;
          status: NotificationStatus;
          created_at: Date;
          sent_at: Date | null;
        }>(
          `SELECT nl.request_id, nl.status, nl.created_at, nl.sent_at,
                  r.hospital_name, r.city
           FROM notification_log nl
           JOIN blood_requests r ON r.id = nl.request_id
           WHERE nl.donor_id = $1
           ORDER BY nl.created_at DESC`,
          [userId],
        );

        const profile = profiles[0];
        return {
          exportedAt: new Date().toISOString(),
          account: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            phone: user.phone,
            role: user.role,
            emailVerified: user.email_verified,
            createdAt: user.created_at.toISOString(),
          },
          donorProfile: profile
            ? {
                bloodType: profile.blood_type,
                city: profile.city,
                lastDonationDate: profile.last_donation_date,
                isAvailable: profile.is_available,
                notifyByEmail: profile.notify_by_email,
              }
            : null,
          requests: requests.map((row) => ({
            id: row.id,
            bloodType: row.blood_type,
            unitsNeeded: row.units_needed,
            urgency: row.urgency,
            hospitalName: row.hospital_name,
            city: row.city,
            contactPhone: row.contact_phone,
            note: row.note,
            status: row.status,
            createdAt: row.created_at.toISOString(),
          })),
          notifications: notifications.map((row) => ({
            requestId: row.request_id,
            hospitalName: row.hospital_name,
            city: row.city,
            status: row.status,
            createdAt: row.created_at.toISOString(),
            sentAt: row.sent_at ? row.sent_at.toISOString() : null,
          })),
        };
      }, db);
    },

    async deleteUser(userId) {
      /* One statement. Every other table either cascades from here or has
         already been told to null its reference — putting the list of what
         to clean up in application code would be a second copy of the
         schema's own answer, free to fall behind it. */
      const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [userId]);
      return (rowCount ?? 0) > 0;
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
