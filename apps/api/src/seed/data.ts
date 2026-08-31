import {
  BLOOD_TYPES,
  DONATION_INTERVAL_DAYS,
  type BloodType,
  type Urgency,
} from '@kapka/shared';

/**
 * Synthetic seed data for local and staging (§2).
 *
 * HARD RULE: no real personal data ever enters local or staging. Everything
 * here is invented. Emails use the .test TLD, which RFC 2606 reserves so it
 * can never resolve to a real mailbox — if a message somehow escapes Mailpit,
 * it has nowhere to go.
 *
 * This module is pure: it decides WHAT to insert, never talks to a database.
 * That keeps it testable without Postgres, which matters because the shape of
 * this data is what the §5.1 matching query is exercised against.
 */

/** Every seeded account shares this. Never used outside local and staging. */
export const SEED_PASSWORD = 'kapka-local-dev-password';

const DOMAIN = 'seed.kapka.test';

export interface SeedDonorProfile {
  bloodType: BloodType;
  city: string;
  /** null means never donated, which is eligible (§5.2). */
  lastDonationDaysAgo: number | null;
  isAvailable: boolean;
  notifyByEmail: boolean;
}

export interface SeedUser {
  key: string;
  email: string;
  fullName: string;
  role: 'donor' | 'requester' | 'admin';
  phone: string | null;
  isActive: boolean;
  emailVerified: boolean;
  profile: SeedDonorProfile | null;
  /** Why this row exists, for anyone reading the seeded database. */
  note: string;
}

/** Deterministic — no randomness, so every machine gets the same database. */
let counter = 0;
function nextPhone(): string {
  counter += 1;
  return `+389 70 ${String(100000 + counter).slice(0, 3)} ${String(100000 + counter).slice(3)}`;
}

function donor(
  key: string,
  fullName: string,
  profile: SeedDonorProfile,
  note: string,
  overrides: Partial<Pick<SeedUser, 'isActive' | 'emailVerified'>> = {},
): SeedUser {
  return {
    key,
    email: `${key}@${DOMAIN}`,
    fullName,
    role: 'donor',
    phone: nextPhone(),
    isActive: overrides.isActive ?? true,
    emailVerified: overrides.emailVerified ?? true,
    profile,
    note,
  };
}

/**
 * Donors who should match: verified, active, available, and eligible.
 * Skopje and Bitola carry all eight types so any request in either city has
 * compatible donors; the smaller cities carry a subset, which is what the
 * real distribution looks like.
 */
const CITY_COVERAGE: { city: string; types: readonly BloodType[] }[] = [
  { city: 'Skopje', types: BLOOD_TYPES },
  { city: 'Bitola', types: BLOOD_TYPES },
  { city: 'Tetovo', types: ['O-', 'O+', 'A-', 'A+'] },
  { city: 'Kumanovo', types: ['B-', 'B+', 'AB-', 'AB+'] },
  { city: 'Ohrid', types: ['O-', 'A+'] },
  { city: 'Prilep', types: ['O+', 'B+'] },
];

const FIRST_NAMES = [
  'Ana',
  'Marko',
  'Elena',
  'Stefan',
  'Ivana',
  'Nikola',
  'Maja',
  'Bojan',
  'Sara',
  'Filip',
  'Teodora',
  'Dimitar',
  'Katerina',
  'Vlatko',
  'Simona',
  'Goran',
];
const LAST_NAMES = [
  'Petrovska',
  'Stojanov',
  'Ilievska',
  'Trajkov',
  'Nikolovska',
  'Georgiev',
  'Angelovska',
  'Mitrev',
  'Ristovska',
  'Kostov',
  'Jovanovska',
  'Spasov',
];

function nameFor(index: number): string {
  const first = FIRST_NAMES[index % FIRST_NAMES.length] ?? 'Ana';
  const last = LAST_NAMES[index % LAST_NAMES.length] ?? 'Petrovska';
  return `${first} ${last}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Donors deliberately built to be EXCLUDED by the matching query, one per
 * reason. All O− in Skopje, so a single O− request in Skopje exercises every
 * exclusion branch of §5.1 at once. Without these, a query that forgot a
 * filter would still look correct against the seed.
 */
function edgeCaseDonors(): SeedUser[] {
  const base = {
    bloodType: 'O-' as const,
    city: 'Skopje',
    isAvailable: true,
    notifyByEmail: true,
  };
  return [
    donor(
      'edge-eligible-boundary',
      'Boundary Eligible',
      { ...base, lastDonationDaysAgo: DONATION_INTERVAL_DAYS },
      `donated exactly ${String(DONATION_INTERVAL_DAYS)} days ago — ELIGIBLE, the inclusive boundary`,
    ),
    donor(
      'edge-too-soon',
      'Too Soon',
      { ...base, lastDonationDaysAgo: DONATION_INTERVAL_DAYS - 1 },
      `donated ${String(DONATION_INTERVAL_DAYS - 1)} days ago — EXCLUDED, one day short`,
    ),
    donor(
      'edge-paused',
      'Paused Donor',
      { ...base, lastDonationDaysAgo: null, isAvailable: false },
      'EXCLUDED — used the availability pause switch',
    ),
    donor(
      'edge-no-email',
      'Opted Out Of Email',
      { ...base, lastDonationDaysAgo: null, notifyByEmail: false },
      'EXCLUDED — turned email notifications off',
    ),
    donor(
      'edge-unverified',
      'Unverified Address',
      { ...base, lastDonationDaysAgo: null },
      'EXCLUDED — email never verified, so the platform cannot be used to mail-bomb it (§12)',
      { emailVerified: false },
    ),
    donor(
      'edge-deactivated',
      'Deactivated Account',
      { ...base, lastDonationDaysAgo: null },
      'EXCLUDED — account deactivated',
      { isActive: false },
    ),
  ];
}

export function buildUsers(): SeedUser[] {
  counter = 0;
  const users: SeedUser[] = [];
  let index = 0;

  for (const { city, types } of CITY_COVERAGE) {
    for (const bloodType of types) {
      // Spread the eligibility history so the feed is not uniform: never
      // donated, long ago, and comfortably past the interval.
      const history = [null, 400, 90, 120, null, 200][index % 6] ?? null;
      const fullName = nameFor(index);
      users.push(
        donor(
          `${slug(city)}-${slug(bloodType)}-${String(index)}`,
          fullName,
          {
            bloodType,
            city,
            lastDonationDaysAgo: history,
            isAvailable: true,
            notifyByEmail: true,
          },
          `eligible ${bloodType} donor in ${city}`,
        ),
      );
      index += 1;
    }
  }

  users.push(...edgeCaseDonors());

  users.push({
    key: 'admin',
    email: `admin@${DOMAIN}`,
    fullName: 'Admin Moderator',
    role: 'admin',
    phone: nextPhone(),
    isActive: true,
    emailVerified: true,
    profile: null,
    note: 'the single admin — moderates the request queue (§9.6)',
  });

  users.push(
    {
      key: 'requester-one',
      email: `requester.one@${DOMAIN}`,
      fullName: 'Marija Nikolikj',
      role: 'requester',
      phone: nextPhone(),
      isActive: true,
      emailVerified: true,
      profile: null,
      note: 'posts requests, does not donate',
    },
    {
      key: 'requester-two',
      email: `requester.two@${DOMAIN}`,
      fullName: 'Aleksandar Popov',
      role: 'requester',
      phone: nextPhone(),
      isActive: true,
      emailVerified: true,
      profile: null,
      note: 'posts requests, does not donate',
    },
  );

  return users;
}

export interface SeedRequest {
  requesterKey: string;
  bloodType: BloodType;
  unitsNeeded: number;
  urgency: Urgency;
  hospitalName: string;
  hospitalLat: number | null;
  hospitalLng: number | null;
  city: string;
  contactPhone: string;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'expired';
  createdMinutesAgo: number;
  note_why: string;
}

/**
 * A handful of requests covering the states the screens have to render: the
 * public feed (approved), the moderation queue (pending), and the states §9.7
 * says must be designed rather than discovered.
 */
export function buildRequests(): SeedRequest[] {
  return [
    {
      requesterKey: 'requester-one',
      bloodType: 'O-',
      unitsNeeded: 3,
      urgency: 'critical',
      hospitalName: 'City General Hospital 8th September',
      hospitalLat: 41.9981,
      hospitalLng: 21.4254,
      city: 'Skopje',
      contactPhone: '+389 70 111 222',
      note: 'Road traffic accident, theatre is prepped and waiting on units.',
      status: 'approved',
      createdMinutesAgo: 12,
      note_why: 'the hardest type to source, in the city with full coverage',
    },
    {
      requesterKey: 'requester-two',
      bloodType: 'A+',
      unitsNeeded: 2,
      urgency: 'urgent',
      hospitalName: 'Clinical Hospital Dr. Trifun Panovski',
      hospitalLat: 41.0297,
      hospitalLng: 21.3292,
      city: 'Bitola',
      contactPhone: '+389 70 333 444',
      note: 'Scheduled surgery tomorrow morning.',
      status: 'approved',
      createdMinutesAgo: 48,
      note_why: 'a common type outside the capital',
    },
    {
      requesterKey: 'requester-one',
      bloodType: 'AB+',
      unitsNeeded: 1,
      urgency: 'routine',
      hospitalName: 'General Hospital Kumanovo',
      hospitalLat: 42.1322,
      hospitalLng: 21.7144,
      city: 'Kumanovo',
      contactPhone: '+389 70 555 666',
      note: 'Topping up the ward reserve ahead of the weekend.',
      status: 'approved',
      createdMinutesAgo: 260,
      note_why: 'universal recipient — every donor type is compatible',
    },
    {
      requesterKey: 'requester-two',
      bloodType: 'B-',
      unitsNeeded: 2,
      urgency: 'urgent',
      hospitalName: 'Clinical Hospital Tetovo',
      hospitalLat: 42.0106,
      hospitalLng: 20.9714,
      city: 'Tetovo',
      contactPhone: '+389 70 777 888',
      note: null,
      status: 'pending',
      createdMinutesAgo: 20,
      note_why: 'sits in the moderation queue (§9.6), and Tetovo has no B− donors',
    },
    {
      requesterKey: 'requester-one',
      bloodType: 'O+',
      unitsNeeded: 1,
      urgency: 'urgent',
      hospitalName: 'General Hospital Ohrid',
      hospitalLat: 41.1231,
      hospitalLng: 20.8016,
      city: 'Ohrid',
      contactPhone: '+389 70 999 000',
      note: 'Please call before travelling.',
      status: 'pending',
      createdMinutesAgo: 5,
      note_why: 'a second item for the moderation queue',
    },
    {
      requesterKey: 'requester-two',
      bloodType: 'A-',
      unitsNeeded: 1,
      urgency: 'routine',
      hospitalName: 'General Hospital Borka Taleski',
      hospitalLat: 41.3464,
      hospitalLng: 21.5544,
      city: 'Prilep',
      contactPhone: '+389 70 121 212',
      note: null,
      status: 'rejected',
      createdMinutesAgo: 2880,
      note_why: 'rejected, so the requester-facing rejection state has data',
    },
    {
      requesterKey: 'requester-one',
      bloodType: 'B+',
      unitsNeeded: 4,
      urgency: 'critical',
      hospitalName: 'University Clinic of Surgery St. Naum Ohridski',
      hospitalLat: 41.9925,
      hospitalLng: 21.4386,
      city: 'Skopje',
      contactPhone: '+389 70 343 434',
      note: 'Post-partum haemorrhage.',
      status: 'fulfilled',
      createdMinutesAgo: 5760,
      note_why: 'fulfilled, so the feed has a resolved item to filter out',
    },
  ];
}
