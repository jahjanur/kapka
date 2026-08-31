import { z } from 'zod';
import { NOTE_MAX_LENGTH, UNITS_MAX, UNITS_MIN } from '../domain';
import { bloodTypeSchema, citySchema, urgencySchema } from './enums';
import { phoneSchema } from './common';

/** POST /api/requests — the 2-minute screen (§9.3). Every field earns its place. */
export const createRequestSchema = z.strictObject({
  /** The type the PATIENT needs, not the donor type. Getting this backwards is
      the single most common bug in this kind of system (§5.1). */
  bloodType: bloodTypeSchema,
  unitsNeeded: z.number().int().min(UNITS_MIN).max(UNITS_MAX).default(1),
  urgency: urgencySchema.default('urgent'),
  hospitalName: z.string().trim().min(2, 'Enter the hospital name.').max(200),
  hospitalLat: z.number().min(-90).max(90).nullable().optional(),
  hospitalLng: z.number().min(-180).max(180).nullable().optional(),
  city: citySchema,
  contactPhone: phoneSchema,
  note: z.string().trim().max(NOTE_MAX_LENGTH).nullable().optional(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/** GET /api/requests query filters (§4). */
export const requestFilterSchema = z.strictObject({
  city: citySchema.optional(),
  bloodType: bloodTypeSchema.optional(),
  urgency: urgencySchema.optional(),
  /** Restrict to requests this donor's own type can actually help with. */
  compatibleWithMe: z.coerce.boolean().optional(),
});

export type RequestFilterInput = z.infer<typeof requestFilterSchema>;

/** POST /api/admin/requests/:id/reject */
export const rejectRequestSchema = z.strictObject({
  reason: z.string().trim().min(4, 'Give a reason the requester can act on.').max(500),
});

export type RejectRequestInput = z.infer<typeof rejectRequestSchema>;
