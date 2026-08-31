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
