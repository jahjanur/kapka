import type { PublicBloodRequest } from '@kapka/shared';

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const expiryFor = (createdAt: string) =>
  new Date(new Date(createdAt).getTime() + 7 * 86_400_000).toISOString();

const row = (
  r: Omit<PublicBloodRequest, 'expiresAt' | 'status'>,
): PublicBloodRequest => ({ ...r, status: 'approved', expiresAt: expiryFor(r.createdAt) });

/**
 * SEED DATA — stands in for GET /api/requests until the endpoint is backed by
 * a database. Typed as PublicBloodRequest so it cannot drift from the contract
 * the API will actually return.
 *
 * Synthetic only. No real personal data ever enters local or staging (§2).
 */
export const SEED_REQUESTS: PublicBloodRequest[] = [
  row({
    id: 'r1', bloodType: 'O-', unitsNeeded: 3, urgency: 'critical',
    hospitalName: 'City General Hospital 8th September', city: 'Skopje',
    note: 'Road traffic accident, theatre is prepped and waiting on units.',
    createdAt: minutesAgo(12),
  }),
  row({
    id: 'r2', bloodType: 'A+', unitsNeeded: 2, urgency: 'urgent',
    hospitalName: 'Clinical Hospital Dr. Trifun Panovski', city: 'Bitola',
    note: 'Scheduled surgery tomorrow morning.',
    createdAt: minutesAgo(48),
  }),
  row({
    id: 'r3', bloodType: 'B-', unitsNeeded: 1, urgency: 'urgent',
    hospitalName: 'Clinical Hospital Tetovo', city: 'Tetovo',
    createdAt: minutesAgo(95),
  }),
  row({
    id: 'r4', bloodType: 'AB+', unitsNeeded: 1, urgency: 'routine',
    hospitalName: 'General Hospital Ohrid', city: 'Ohrid',
    note: 'Topping up the ward reserve ahead of the weekend.',
    createdAt: minutesAgo(260),
  }),
  row({
    id: 'r5', bloodType: 'O+', unitsNeeded: 4, urgency: 'critical',
    hospitalName: 'University Clinic of Surgery St. Naum Ohridski', city: 'Skopje',
    note: 'Post-partum haemorrhage. Any O+ donor able to come tonight.',
    createdAt: minutesAgo(6),
  }),
  row({
    id: 'r6', bloodType: 'A-', unitsNeeded: 2, urgency: 'urgent',
    hospitalName: 'General Hospital Borka Taleski', city: 'Prilep',
    createdAt: minutesAgo(420),
  }),
  row({
    id: 'r7', bloodType: 'B+', unitsNeeded: 1, urgency: 'routine',
    hospitalName: 'General Hospital Kumanovo', city: 'Kumanovo',
    createdAt: minutesAgo(1500),
  }),
];
