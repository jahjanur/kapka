import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BLOOD_TYPES, parseBloodType, type BloodType } from '@kapka/shared';
import { startTestDatabase, type TestDatabase } from '../test/database';
import { findMatchingDonors } from './repository';
import {
  COMPATIBILITY_TABLE,
  INVALID_PAIRS,
  VALID_PAIRS,
  type CompatibilityPair,
} from './compatibilityTable';

/**
 * §13's P0 test: all 64 (recipient, donor) pairs against a hand-written table,
 * 27 valid and 37 invalid, run through the real matching query on a real
 * PostgreSQL.
 *
 * Each pair is its own case, so a failure names the exact pair rather than
 * reporting that two sets differ.
 */

let db: TestDatabase;

/** One eligible donor per type, and one request per type, in one city. */
const donorByType = new Map<BloodType, string>();
const requestByType = new Map<BloodType, string>();

beforeAll(async () => {
  db = await startTestDatabase();
  await db.reset();

  let n = 0;
  for (const type of BLOOD_TYPES) {
    n += 1;
    const { rows: user } = await db.pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, is_active, email_verified)
       VALUES ($1, 'x', $2, TRUE, TRUE) RETURNING id`,
      [`donor-${String(n)}@seed.test`, `Donor ${type}`],
    );
    const donorId = user[0]?.id ?? '';
    await db.pool.query(
      `INSERT INTO donor_profiles (user_id, blood_type, city, last_donation_date)
       VALUES ($1, $2, 'Skopje', NULL)`,
      [donorId, type],
    );
    donorByType.set(type, donorId);
  }

  const { rows: requester } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ('requester@seed.test', 'x', 'R', 'requester') RETURNING id`,
  );
  for (const type of BLOOD_TYPES) {
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO blood_requests
         (requester_id, blood_type, hospital_name, city, contact_phone, status)
       VALUES ($1, $2, 'City General', 'Skopje', '+389 70 000 000', 'approved')
       RETURNING id`,
      [requester[0]?.id, type],
    );
    requestByType.set(type, rows[0]?.id ?? '');
  }
}, 120_000);

afterAll(async () => {
  await db.stop();
});

describe('all 64 pairs, through the query, against the hand-written table', () => {
  it.each(COMPATIBILITY_TABLE)(
    'a patient needing $recipient $compatible from a $donor donor',
    async ({ recipient, donor, compatible }: CompatibilityPair) => {
      const requestId = requestByType.get(recipient) ?? '';
      const donorId = donorByType.get(donor);
      const matched = await findMatchingDonors(requestId, db.pool);
      expect(matched.some((m) => m.id === donorId)).toBe(compatible);
    },
  );
});

describe('the split §13 names', () => {
  it('is 27 valid and 37 invalid', () => {
    expect(VALID_PAIRS).toHaveLength(27);
    expect(INVALID_PAIRS).toHaveLength(37);
    expect(COMPATIBILITY_TABLE).toHaveLength(64);
  });

  it('returns exactly 27 matches across every request', async () => {
    // The same total, counted from the database instead of the table.
    let total = 0;
    for (const type of BLOOD_TYPES) {
      const matched = await findMatchingDonors(requestByType.get(type) ?? '', db.pool);
      total += matched.length;
    }
    expect(total).toBe(27);
  });
});

describe('three independent statements of the same truth', () => {
  it('the table agrees with the matrix seeded by the migration', async () => {
    // Written by hand, versus written into a migration. If they disagree, one
    // of them is wrong and neither can be trusted until it is settled.
    const { rows } = await db.pool.query<{ recipient_type: string; donor_type: string }>(
      'SELECT recipient_type, donor_type FROM blood_compatibility',
    );
    const seeded = new Set(rows.map((r) => `${r.recipient_type}>${r.donor_type}`));
    const handWritten = new Set(VALID_PAIRS.map((p) => `${p.recipient}>${p.donor}`));

    expect([...seeded].sort()).toEqual([...handWritten].sort());
  });

  it('the table agrees with the ABO/Rh rule derived from first principles', () => {
    // A third derivation. Any single mistake shows up as a disagreement
    // between two of the three rather than passing quietly in all of them.
    const aboDonors = {
      O: ['O'],
      A: ['A', 'O'],
      B: ['B', 'O'],
      AB: ['A', 'B', 'AB', 'O'],
    };
    const disagreements = COMPATIBILITY_TABLE.filter(
      ({ recipient, donor, compatible }) => {
        const r = parseBloodType(recipient);
        const d = parseBloodType(donor);
        const byRule =
          aboDonors[r.group].includes(d.group) &&
          (r.rh === 'positive' || d.rh === 'negative');
        return byRule !== compatible;
      },
    );
    expect(disagreements).toEqual([]);
  });
});

describe('the reference points §5.1 gives by name', () => {
  it('a patient needing O− can receive from O− only', async () => {
    const matched = await findMatchingDonors(requestByType.get('O-') ?? '', db.pool);
    expect(matched.map((m) => m.bloodType)).toEqual(['O-']);
  });

  it('a patient needing AB+ can receive from all eight', async () => {
    const matched = await findMatchingDonors(requestByType.get('AB+') ?? '', db.pool);
    expect(matched.map((m) => m.bloodType).sort()).toEqual([...BLOOD_TYPES].sort());
  });

  it('an O− donor can give to all eight', async () => {
    const oNegative = donorByType.get('O-');
    let reached = 0;
    for (const type of BLOOD_TYPES) {
      const matched = await findMatchingDonors(requestByType.get(type) ?? '', db.pool);
      if (matched.some((m) => m.id === oNegative)) reached += 1;
    }
    expect(reached).toBe(8);
  });

  it('an AB+ donor can give only to AB+', async () => {
    // The mirror of the O− case, and the one that flips first if the join is
    // reversed.
    const abPositive = donorByType.get('AB+');
    const reached: BloodType[] = [];
    for (const type of BLOOD_TYPES) {
      const matched = await findMatchingDonors(requestByType.get(type) ?? '', db.pool);
      if (matched.some((m) => m.id === abPositive)) reached.push(type);
    }
    expect(reached).toEqual(['AB+']);
  });
});
