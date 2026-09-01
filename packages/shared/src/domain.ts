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

/**
 * How this request relates to the donor who is looking at it.
 *
 * Computed by the API against blood_compatibility — the same table the
 * matching query in §5.1 reads to decide who gets emailed. It is deliberately
 * not derivable in the browser: a second copy of a medical rule is free to
 * drift from the one that actually sends the emails, and the direction of the
 * comparison is the single most common bug in this kind of system (§3).
 */
export interface DonorFit {
  /** The donor's own type, so the answer can name it rather than assert it. */
  bloodType: BloodType;
  /** Their type is on the donor side of the matrix for this patient. */
  compatible: boolean;
  /**
   * Null when they can give today. Otherwise the date the 56-day interval is
   * up — a banner that says "you can help" to somebody three weeks past a
   * donation sends them to a hospital that will turn them away.
   */
  eligibleFrom: string | null;
}

/**
 * One row of the moderation queue (§9.6).
 *
 * matchedDonors is the reach: how many donors approving this would email,
 * right now. §9.6 wants that number in front of the admin BEFORE they
 * confirm, because approving is irreversible and sends mail to strangers.
 */
export interface ModerationQueueItem extends AuthedBloodRequest {
  /** Who posted it. An admin judging legitimacy needs to know. */
  requesterName: string;
  matchedDonors: number;
}

/** The extra fields an authenticated viewer is allowed to see. */
export interface AuthedBloodRequest extends PublicBloodRequest {
  contactPhone: string;
  /** Absent unless the viewer is a donor: nobody else has a type on file. */
  fit?: DonorFit;
}
