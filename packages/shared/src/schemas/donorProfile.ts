import { z } from 'zod';
import { bloodTypeSchema, citySchema } from './enums';
import { dateOnlySchema } from './common';

/** PATCH /api/me/donor-profile — every field optional, at least one required. */
export const donorProfilePatchSchema = z
  .strictObject({
    bloodType: bloodTypeSchema.optional(),
    city: citySchema.optional(),
    lastDonationDate: dateOnlySchema.nullable().optional(),
    /** The donor's pause switch. Without it, stopping emails means deleting
        the account (§3). */
    isAvailable: z.boolean().optional(),
    notifyByEmail: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    error: 'Nothing to update.',
  });

export type DonorProfilePatchInput = z.infer<typeof donorProfilePatchSchema>;

/**
 * PUT /api/me/donor-profile — the whole profile, for an account that does not
 * have one yet.
 *
 * Separate from the PATCH above rather than making it an upsert, and the
 * difference is the reason PATCH refuses to create: blood type and city are
 * NOT NULL and nobody may guess either. A PATCH carries some fields, so it
 * can only ever update; a PUT carries all of them, so it can create.
 *
 * The case this exists for is a Google sign-in, which makes an account with
 * no profile because Google knows neither field. Before this, that account
 * could never become a donor at all.
 */
export const donorProfilePutSchema = z.strictObject({
  bloodType: bloodTypeSchema,
  city: citySchema,
  lastDonationDate: dateOnlySchema.nullable().optional(),
});

export type DonorProfilePutInput = z.infer<typeof donorProfilePutSchema>;
