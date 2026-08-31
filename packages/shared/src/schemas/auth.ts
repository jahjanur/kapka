import { z } from 'zod';
import { bloodTypeSchema, citySchema } from './enums';
import { dateOnlySchema, passwordSchema, phoneSchema } from './common';

/**
 * Registration creates the user and the donor profile in one transaction (§4),
 * so one schema covers both.
 *
 * strictObject, not object: §4 requires unknown keys to be rejected rather
 * than silently stripped.
 */
export const registerSchema = z
  .strictObject({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
    email: z.email('Enter a valid email address.'),
    password: passwordSchema,
    bloodType: bloodTypeSchema,
    city: citySchema,
    /**
     * null is meaningful and different from absent: it is the explicit
     * "I have never donated" choice, which is eligible (§5.2).
     */
    lastDonationDate: dateOnlySchema.nullable().optional(),
    phone: phoneSchema.optional(),
  })
  .refine(
    (value) => !value.lastDonationDate || value.lastDonationDate <= today(),
    { path: ['lastDonationDate'], error: 'That date is in the future.' },
  );

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.strictObject({
  email: z.email('Enter a valid email address.'),
  // Deliberately not passwordSchema: never reveal the password policy on
  // login, and never hint at whether an account exists (§12).
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
