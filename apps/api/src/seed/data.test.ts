import { describe, expect, it } from 'vitest';
import {
  BLOOD_TYPES,
  CITIES,
  createRequestSchema,
  DONATION_INTERVAL_DAYS,
} from '@kapka/shared';
import { buildRequests, buildUsers } from './data';

const users = buildUsers();
const donors = users.filter((u) => u.profile !== null);
const requests = buildRequests();

describe('seed coverage', () => {
  it.each(BLOOD_TYPES)('includes at least one eligible %s donor', (bloodType) => {
    const matching = donors.filter(
      (d) =>
        d.profile?.bloodType === bloodType &&
        d.isActive &&
        d.emailVerified &&
        d.profile.isAvailable &&
        d.profile.notifyByEmail,
    );
    expect(matching.length).toBeGreaterThan(0);
  });

  it('spreads donors across several cities', () => {
    const cities = new Set(donors.map((d) => d.profile?.city));
    expect(cities.size).toBeGreaterThanOrEqual(5);
  });

  it('gives Skopje all eight types, so any request there has candidates', () => {
    const inSkopje = new Set(
      donors.filter((d) => d.profile?.city === 'Skopje').map((d) => d.profile?.bloodType),
    );
    for (const type of BLOOD_TYPES) expect(inSkopje).toContain(type);
  });

  it('only uses cities from the canonical list', () => {
    // A city outside CITIES would never match a request, because matching is
    // exact-string against that same list.
    for (const d of donors) {
      expect(CITIES).toContain(d.profile?.city);
    }
  });

  it('has exactly one admin', () => {
    expect(users.filter((u) => u.role === 'admin')).toHaveLength(1);
  });

  it('has requesters who are not donors', () => {
    const requesters = users.filter((u) => u.role === 'requester');
    expect(requesters.length).toBeGreaterThan(0);
    for (const r of requesters) expect(r.profile).toBeNull();
  });
});

describe('seed data is unmistakably synthetic (§2)', () => {
  it('uses only the reserved .test TLD for email', () => {
    // RFC 2606 reserves .test so it can never resolve. If a message somehow
    // escapes Mailpit, it has nowhere to go.
    for (const user of users) expect(user.email).toMatch(/@[a-z.]+\.test$/);
  });

  it('never repeats an email, which the UNIQUE constraint would reject', () => {
    const emails = users.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('is deterministic, so every machine and CI run gets the same database', () => {
    expect(buildUsers()).toEqual(buildUsers());
    expect(buildRequests()).toEqual(buildRequests());
  });
});

describe('the matching query has something to exclude', () => {
  // Without these, a query that forgot a filter would still look correct.
  const skopjeONeg = donors.filter(
    (d) => d.profile?.bloodType === 'O-' && d.profile.city === 'Skopje',
  );

  it('includes a donor at exactly the eligibility boundary', () => {
    const boundary = skopjeONeg.find(
      (d) => d.profile?.lastDonationDaysAgo === DONATION_INTERVAL_DAYS,
    );
    expect(boundary).toBeDefined();
  });

  it('includes a donor one day short of eligible', () => {
    const tooSoon = skopjeONeg.find(
      (d) => d.profile?.lastDonationDaysAgo === DONATION_INTERVAL_DAYS - 1,
    );
    expect(tooSoon).toBeDefined();
  });

  it('includes a donor who has never donated', () => {
    expect(donors.some((d) => d.profile?.lastDonationDaysAgo === null)).toBe(true);
  });

  it.each([
    [
      'paused availability',
      (d: (typeof donors)[number]) => d.profile?.isAvailable === false,
    ],
    [
      'email notifications off',
      (d: (typeof donors)[number]) => d.profile?.notifyByEmail === false,
    ],
    ['unverified email', (d: (typeof donors)[number]) => !d.emailVerified],
    ['deactivated account', (d: (typeof donors)[number]) => !d.isActive],
  ])('includes a donor excluded for %s', (_label, predicate) => {
    expect(donors.some(predicate)).toBe(true);
  });

  it('puts every exclusion case in one city and type, so one request hits them all', () => {
    const excluded = donors.filter(
      (d) =>
        !d.isActive ||
        !d.emailVerified ||
        d.profile?.isAvailable === false ||
        d.profile?.notifyByEmail === false,
    );
    expect(excluded.length).toBeGreaterThanOrEqual(4);
    for (const d of excluded) {
      expect(d.profile?.city).toBe('Skopje');
      expect(d.profile?.bloodType).toBe('O-');
    }
  });
});

describe('seed requests', () => {
  it('covers the statuses the screens have to render', () => {
    const statuses = new Set(requests.map((r) => r.status));
    // The public feed, the moderation queue, and the resolved states §9.7
    // says must be designed rather than discovered.
    expect(statuses).toContain('approved');
    expect(statuses).toContain('pending');
    expect(statuses).toContain('rejected');
    expect(statuses).toContain('fulfilled');
  });

  it('leaves items in the moderation queue', () => {
    expect(requests.filter((r) => r.status === 'pending').length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('covers every urgency level', () => {
    const urgencies = new Set(requests.map((r) => r.urgency));
    expect([...urgencies].sort()).toEqual(['critical', 'routine', 'urgent']);
  });

  it('points every request at a requester that exists', () => {
    const keys = new Set(users.map((u) => u.key));
    for (const r of requests) expect(keys).toContain(r.requesterKey);
  });

  it('would have passed the API validation the real endpoint applies', () => {
    // Seed data that the API itself would reject is a trap: it makes the app
    // look like it works on data it could never have produced.
    for (const r of requests) {
      const result = createRequestSchema.safeParse({
        bloodType: r.bloodType,
        unitsNeeded: r.unitsNeeded,
        urgency: r.urgency,
        hospitalName: r.hospitalName,
        hospitalLat: r.hospitalLat,
        hospitalLng: r.hospitalLng,
        city: r.city,
        contactPhone: r.contactPhone,
        note: r.note,
      });
      expect(result.error?.message ?? r.hospitalName).toBe(r.hospitalName);
    }
  });
});
