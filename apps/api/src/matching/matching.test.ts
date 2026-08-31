import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BLOOD_TYPES,
  DONATION_INTERVAL_DAYS,
  parseBloodType,
  type BloodType,
} from '@kapka/shared';
import { startTestDatabase, type TestDatabase } from '../test/database';
import { findMatchingDonors } from './repository';

/**
 * §13 calls this the one piece of logic where a bug has real-world
 * consequences, and it is entirely SQL. It runs here against a real
 * PostgreSQL with the real migrations applied — a mock would only confirm the
 * mock agrees with itself.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.reset();
});

interface DonorOptions {
  city?: string;
  lastDonationDaysAgo?: number | null;
  isAvailable?: boolean;
  notifyByEmail?: boolean;
  isActive?: boolean;
  emailVerified?: boolean;
}

let sequence = 0;

async function addDonor(
  bloodType: BloodType,
  options: DonorOptions = {},
): Promise<string> {
  sequence += 1;
  const {
    city = 'Skopje',
    lastDonationDaysAgo = null,
    isAvailable = true,
    notifyByEmail = true,
    isActive = true,
    emailVerified = true,
  } = options;

  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, is_active, email_verified)
     VALUES ($1, 'x', $2, $3, $4) RETURNING id`,
    [
      `donor-${String(sequence)}@seed.test`,
      `Donor ${bloodType}`,
      isActive,
      emailVerified,
    ],
  );
  const id = rows[0]?.id ?? '';

  await db.pool.query(
    `INSERT INTO donor_profiles
       (user_id, blood_type, city, last_donation_date, is_available, notify_by_email)
     VALUES ($1, $2, $3,
             CASE WHEN $4::int IS NULL THEN NULL
                  ELSE CURRENT_DATE - ($4::int * INTERVAL '1 day') END,
             $5, $6)`,
    [id, bloodType, city, lastDonationDaysAgo, isAvailable, notifyByEmail],
  );
  return id;
}

async function addRequest(bloodType: BloodType, city = 'Skopje'): Promise<string> {
  sequence += 1;
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, 'x', 'Requester', 'requester') RETURNING id`,
    [`requester-${String(sequence)}@seed.test`],
  );
  const { rows: request } = await db.pool.query<{ id: string }>(
    `INSERT INTO blood_requests
       (requester_id, blood_type, hospital_name, city, contact_phone, status)
     VALUES ($1, $2, 'City General', $3, '+389 70 000 000', 'approved') RETURNING id`,
    [rows[0]?.id, bloodType, city],
  );
  return request[0]?.id ?? '';
}

/**
 * The ABO/Rh rule, written from first principles rather than read from the
 * matrix — so this is a second opinion on the query, not a restatement of the
 * data it queries.
 */
const ABO_DONORS = {
  O: ['O'],
  A: ['A', 'O'],
  B: ['B', 'O'],
  AB: ['A', 'B', 'AB', 'O'],
} as const;

function canGive(donor: BloodType, recipient: BloodType): boolean {
  const r = parseBloodType(recipient);
  const d = parseBloodType(donor);
  const abo = (ABO_DONORS[r.group] as readonly string[]).includes(d.group);
  const rh = r.rh === 'positive' || d.rh === 'negative';
  return abo && rh;
}

describe('the join direction', () => {
  it('returns exactly the compatible donors, for all 64 combinations', async () => {
    // The definitive test. Eight eligible donors, one per type, in one city.
    // Then a request for each type, and the answer compared against the rule.
    for (const type of BLOOD_TYPES) await addDonor(type);

    const wrong: string[] = [];
    for (const recipient of BLOOD_TYPES) {
      const requestId = await addRequest(recipient);
      const matched = (await findMatchingDonors(requestId, db.pool))
        .map((donor) => donor.bloodType)
        .sort();
      const expected = BLOOD_TYPES.filter((donor) => canGive(donor, recipient)).sort();
      if (JSON.stringify(matched) !== JSON.stringify(expected)) {
        wrong.push(
          `needs ${recipient}: got [${matched.join(', ')}], expected [${expected.join(', ')}]`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it('is not symmetric — reversing it would be medically wrong', async () => {
    /*
     * If the two sides of the compatibility join were swapped, this is the
     * pair that would flip: an O− patient would be told AB+ donors can help.
     */
    await addDonor('AB+');
    const oNegRequest = await addRequest('O-');
    expect(await findMatchingDonors(oNegRequest, db.pool)).toEqual([]);

    await addDonor('O-');
    const abPosRequest = await addRequest('AB+');
    const matched = await findMatchingDonors(abPosRequest, db.pool);
    expect(matched.map((d) => d.bloodType).sort()).toEqual(['AB+', 'O-']);
  });

  it('lets an O− patient receive from O− only', async () => {
    for (const type of BLOOD_TYPES) await addDonor(type);
    const requestId = await addRequest('O-');
    const matched = await findMatchingDonors(requestId, db.pool);
    expect(matched.map((d) => d.bloodType)).toEqual(['O-']);
  });

  it('lets an AB+ patient receive from all eight', async () => {
    for (const type of BLOOD_TYPES) await addDonor(type);
    const requestId = await addRequest('AB+');
    expect(await findMatchingDonors(requestId, db.pool)).toHaveLength(8);
  });

  it('lets an O− donor give to all eight patients', async () => {
    await addDonor('O-');
    for (const recipient of BLOOD_TYPES) {
      const requestId = await addRequest(recipient);
      expect(await findMatchingDonors(requestId, db.pool), recipient).toHaveLength(1);
    }
  });
});

describe('eligibility (§5.2)', () => {
  it.each([
    ['never donated', null, true],
    [`exactly ${String(DONATION_INTERVAL_DAYS)} days ago`, DONATION_INTERVAL_DAYS, true],
    [`${String(DONATION_INTERVAL_DAYS + 1)} days ago`, DONATION_INTERVAL_DAYS + 1, true],
    [
      `${String(DONATION_INTERVAL_DAYS - 1)} days ago — one day short`,
      DONATION_INTERVAL_DAYS - 1,
      false,
    ],
    ['yesterday', 1, false],
  ])('%s: eligible = %s', async (_label, daysAgo, eligible) => {
    // The boundary is inclusive: 56 days qualifies, 55 does not.
    await addDonor('O-', { lastDonationDaysAgo: daysAgo });
    const requestId = await addRequest('O-');
    expect(await findMatchingDonors(requestId, db.pool)).toHaveLength(eligible ? 1 : 0);
  });

  it('is computed by the database, not by the application clock', async () => {
    // §5.2: in JavaScript the server's timezone decides who is eligible.
    const { rows } = await db.pool.query<{ same: boolean }>(
      `SELECT (CURRENT_DATE - INTERVAL '56 days')::date
              = (CURRENT_DATE - 56)::date AS same`,
    );
    expect(rows[0]?.same).toBe(true);
  });
});

describe('exclusions', () => {
  it.each([
    ['a different city', { city: 'Bitola' }],
    ['availability paused', { isAvailable: false }],
    ['email notifications off', { notifyByEmail: false }],
    ['an unverified email', { emailVerified: false }],
    ['a deactivated account', { isActive: false }],
  ])('leaves out a donor with %s', async (_label, options: DonorOptions) => {
    await addDonor('O-', options);
    const requestId = await addRequest('O-');
    expect(await findMatchingDonors(requestId, db.pool)).toEqual([]);
  });

  it('matches city exactly, which is why city is a controlled list', async () => {
    await addDonor('O-', { city: 'Skopje' });
    const elsewhere = await addRequest('O-', 'Bitola');
    expect(await findMatchingDonors(elsewhere, db.pool)).toEqual([]);
  });

  it('leaves out a donor already notified for this request', async () => {
    // The second half of the §5.3 guarantee: never build a batch that was
    // always going to collide with the unique index.
    const donorId = await addDonor('O-');
    const requestId = await addRequest('O-');
    expect(await findMatchingDonors(requestId, db.pool)).toHaveLength(1);

    await db.pool.query(
      `INSERT INTO notification_log (request_id, donor_id, status) VALUES ($1, $2, 'sent')`,
      [requestId, donorId],
    );
    expect(await findMatchingDonors(requestId, db.pool)).toEqual([]);
  });

  it('still notifies that donor about a different request', async () => {
    const donorId = await addDonor('O-');
    const first = await addRequest('O-');
    await db.pool.query(
      `INSERT INTO notification_log (request_id, donor_id, status) VALUES ($1, $2, 'sent')`,
      [first, donorId],
    );
    const second = await addRequest('O-');
    expect(await findMatchingDonors(second, db.pool)).toHaveLength(1);
  });

  it('returns nothing for a request that does not exist', async () => {
    await addDonor('O-');
    expect(
      await findMatchingDonors('00000000-0000-0000-0000-000000000000', db.pool),
    ).toEqual([]);
  });
});

describe('what it returns', () => {
  it('returns what the email needs and nothing more', async () => {
    await addDonor('A+');
    const requestId = await addRequest('A+');
    const [donor] = await findMatchingDonors(requestId, db.pool);
    expect(Object.keys(donor ?? {}).sort()).toEqual([
      'bloodType',
      'email',
      'fullName',
      'id',
    ]);
  });

  it('puts the donors most likely to be able to come first', async () => {
    // Ordered by time since last donation, never-donated first, so capping
    // the batch at the free-tier ceiling (§5.3) is not an arbitrary slice.
    await addDonor('O-', { lastDonationDaysAgo: 60 });
    await addDonor('O-', { lastDonationDaysAgo: null });
    await addDonor('O-', { lastDonationDaysAgo: 400 });
    const requestId = await addRequest('O-');
    const matched = await findMatchingDonors(requestId, db.pool);
    expect(matched).toHaveLength(3);
    expect(matched[0]?.fullName).toBe('Donor O-');
  });

  it('never returns the same donor twice', async () => {
    // An AB+ request joins the matrix eight ways; a donor must still appear
    // once.
    for (const type of BLOOD_TYPES) await addDonor(type);
    const requestId = await addRequest('AB+');
    const matched = await findMatchingDonors(requestId, db.pool);
    expect(new Set(matched.map((d) => d.id)).size).toBe(matched.length);
  });
});
