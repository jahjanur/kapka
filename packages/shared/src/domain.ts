import type { BloodType } from './bloodType';

/**
 * The domain vocabulary, mirroring the Postgres enums in §3 exactly. Add a
 * value to a DB enum and this is where the rest of the system learns about it.
 *
 * Plain arrays and types, no zod — see the note in cities.ts. The Zod schemas
 * built from these live in schemas/enums.
 */

export const USER_ROLES = ['donor', 'requester', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'fulfilled',
  'expired',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const URGENCIES = ['routine', 'urgent', 'critical'] as const;
export type Urgency = (typeof URGENCIES)[number];

export const NOTIFICATION_STATUSES = ['queued', 'sent', 'failed', 'bounced'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Days that must pass between donations, per WHO guidance (§5.2). */
export const DONATION_INTERVAL_DAYS = 56;

/** Matches the CHECK constraint on blood_requests.note. */
export const NOTE_MAX_LENGTH = 500;

/** Matches the CHECK constraint on blood_requests.units_needed. */
export const UNITS_MIN = 1;
export const UNITS_MAX = 10;

/**
 * A request as the PUBLIC feed sees it.
 *
 * Note what is absent: the requester's contact details. §12 — contact is
 * returned only to authenticated users, and donor contact details are never
 * exposed at all.
 */
export interface PublicBloodRequest {
  id: string;
  bloodType: BloodType;
  unitsNeeded: number;
  urgency: Urgency;
  hospitalName: string;
  hospitalLat?: number | null;
  hospitalLng?: number | null;
  city: string;
  note?: string | null;
  status: RequestStatus;
  createdAt: string;
  expiresAt: string;
}

/** The extra field an authenticated viewer is allowed to see. */
export interface AuthedBloodRequest extends PublicBloodRequest {
  contactPhone: string;
}
