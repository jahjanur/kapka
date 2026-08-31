import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { env } from '../env';
import { buildRequests, buildUsers, SEED_PASSWORD } from './data';

/**
 * Loads synthetic data into the database. Local and staging only (§2).
 *
 * Destructive by design: it wipes the people-and-requests tables first, so
 * running it twice gives the same database rather than duplicates.
 * blood_compatibility is never touched — that is reference data owned by a
 * migration, and the trigger from 20260831120300000 would reject the write
 * anyway.
 */

/** bcrypt cost factor 12 (§12). */
const BCRYPT_COST = 12;

/** Tables the seed owns. Order matters: children before parents. */
const WIPE_ORDER = [
  'audit_log',
  'notification_log',
  'blood_requests',
  'donor_profiles',
  'users',
];

function assertSafeTarget(): void {
  // "No real personal data ever enters local or staging" has a mirror: no
  // synthetic data ever enters production, and no seed run ever truncates a
  // real users table.
  if (env.isProduction) {
    throw new Error(
      'Refusing to seed: NODE_ENV=production.\n' +
        'This script truncates users, donor_profiles and blood_requests.',
    );
  }

  const host = new URL(env.DATABASE_URL).hostname;
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== 'yes-i-am-sure') {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at "${host}", which is not local.\n` +
        'This script truncates tables. If you really mean it (a staging box with\n' +
        'synthetic data only), set SEED_ALLOW_REMOTE=yes-i-am-sure.',
    );
  }
}

export async function seed(client: Client): Promise<void> {
  const users = buildUsers();
  const requests = buildRequests();

  // One hash, reused. Every seeded account shares a password, and bcrypt at
  // cost 12 takes long enough that hashing 40 of them separately is a
  // noticeable wait for no benefit.
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);

  await client.query('BEGIN');
  try {
    await client.query(`TRUNCATE ${WIPE_ORDER.join(', ')} RESTART IDENTITY CASCADE`);

    const userIds = new Map<string, string>();
    for (const user of users) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, full_name, phone, is_active, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          user.email,
          passwordHash,
          user.role,
          user.fullName,
          user.phone,
          user.isActive,
          user.emailVerified,
        ],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error(`Insert returned no id for ${user.email}`);
      userIds.set(user.key, id);

      if (user.profile) {
        const { bloodType, city, lastDonationDaysAgo, isAvailable, notifyByEmail } =
          user.profile;
        await client.query(
          `INSERT INTO donor_profiles
             (user_id, blood_type, city, last_donation_date, is_available, notify_by_email)
           VALUES ($1, $2, $3,
                   CASE WHEN $4::int IS NULL THEN NULL
                        ELSE CURRENT_DATE - ($4::int * INTERVAL '1 day') END,
                   $5, $6)`,
          [id, bloodType, city, lastDonationDaysAgo, isAvailable, notifyByEmail],
        );
      }
    }

    const adminId = userIds.get('admin');
    if (!adminId) throw new Error('admin user was not created');

    for (const request of requests) {
      const requesterId = userIds.get(request.requesterKey);
      if (!requesterId) throw new Error(`unknown requester ${request.requesterKey}`);

      const moderated = request.status !== 'pending';
      await client.query(
        `INSERT INTO blood_requests
           (requester_id, blood_type, units_needed, urgency, hospital_name,
            hospital_lat, hospital_lng, city, contact_phone, note, status,
            moderated_by, moderated_at, reject_reason, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 $12, $13,
                 $14,
                 now() - ($15::int * INTERVAL '1 minute'),
                 now() - ($15::int * INTERVAL '1 minute') + INTERVAL '7 days')`,
        [
          requesterId,
          request.bloodType,
          request.unitsNeeded,
          request.urgency,
          request.hospitalName,
          request.hospitalLat,
          request.hospitalLng,
          request.city,
          request.contactPhone,
          request.note,
          request.status,
          moderated ? adminId : null,
          moderated ? new Date() : null,
          request.status === 'rejected' ? 'Hospital could not be verified.' : null,
          request.createdMinutesAgo,
        ],
      );
    }

    // The reference data must survive untouched. If this ever comes back
    // wrong, the seed has damaged something it does not own.
    const { rows } = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM blood_compatibility',
    );
    if (rows[0]?.count !== '27') {
      throw new Error(
        `blood_compatibility holds ${rows[0]?.count ?? 'unknown'} rows, expected 27. ` +
          'Run the migrations before seeding.',
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  assertSafeTarget();

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await seed(client);
    const users = buildUsers();
    const donors = users.filter((u) => u.profile !== null);
    console.log(
      `Seeded ${String(users.length)} users (${String(donors.length)} donors), ` +
        `${String(buildRequests().length)} requests.`,
    );
    console.log(`Every account's password is: ${SEED_PASSWORD}`);
    console.log('Admin: admin@seed.kapka.test');
  } finally {
    await client.end();
  }
}

// Only when run as a script. Without this, merely importing anything from
// this file would connect to a database and truncate it.
if (import.meta.url === pathToFileURL(argv[1] ?? '').href) {
  await main();
}
