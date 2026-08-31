import type { BloodType } from './bloodType';

export type Urgency = 'routine' | 'urgent' | 'critical';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'expired';

/** Mirrors the blood_requests row in §3, minus the fields the feed never sees. */
export interface BloodRequest {
  id: string;
  bloodType: BloodType;
  unitsNeeded: number;
  urgency: Urgency;
  hospitalName: string;
  city: string;
  note?: string;
  createdAt: string;
  status: RequestStatus;
}

/**
 * The canonical city list (§3). Free-text city entry silently breaks matching,
 * so the UI only ever offers these. Replace with GET /api/cities when it lands.
 */
export const CITIES = [
  'Skopje', 'Bitola', 'Kumanovo', 'Prilep', 'Tetovo',
  'Veles', 'Ohrid', 'Gostivar', 'Štip', 'Strumica',
] as const;

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/**
 * SEED DATA — stands in for GET /api/requests until the API exists.
 * Synthetic only; no real personal data ever enters local or staging (§2).
 */
export const SEED_REQUESTS: BloodRequest[] = [
  {
    id: 'r1', bloodType: 'O-', unitsNeeded: 3, urgency: 'critical',
    hospitalName: 'City General Hospital 8th September', city: 'Skopje',
    note: 'Road traffic accident, theatre is prepped and waiting on units.',
    createdAt: minutesAgo(12), status: 'approved',
  },
  {
    id: 'r2', bloodType: 'A+', unitsNeeded: 2, urgency: 'urgent',
    hospitalName: 'Clinical Hospital Dr. Trifun Panovski', city: 'Bitola',
    note: 'Scheduled surgery tomorrow morning.',
    createdAt: minutesAgo(48), status: 'approved',
  },
  {
    id: 'r3', bloodType: 'B-', unitsNeeded: 1, urgency: 'urgent',
    hospitalName: 'Clinical Hospital Tetovo', city: 'Tetovo',
    createdAt: minutesAgo(95), status: 'approved',
  },
  {
    id: 'r4', bloodType: 'AB+', unitsNeeded: 1, urgency: 'routine',
    hospitalName: 'General Hospital Ohrid', city: 'Ohrid',
    note: 'Topping up the ward reserve ahead of the weekend.',
    createdAt: minutesAgo(260), status: 'approved',
  },
  {
    id: 'r5', bloodType: 'O+', unitsNeeded: 4, urgency: 'critical',
    hospitalName: 'University Clinic of Surgery St. Naum Ohridski', city: 'Skopje',
    note: 'Post-partum haemorrhage. Any O+ donor able to come tonight.',
    createdAt: minutesAgo(6), status: 'approved',
  },
  {
    id: 'r6', bloodType: 'A-', unitsNeeded: 2, urgency: 'urgent',
    hospitalName: 'General Hospital Borka Taleski', city: 'Prilep',
    createdAt: minutesAgo(420), status: 'approved',
  },
  {
    id: 'r7', bloodType: 'B+', unitsNeeded: 1, urgency: 'routine',
    hospitalName: 'General Hospital Kumanovo', city: 'Kumanovo',
    createdAt: minutesAgo(1500), status: 'approved',
  },
];
