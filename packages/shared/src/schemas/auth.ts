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
  .refine((value) => !value.lastDonationDate || value.lastDonationDate <= today(), {
    path: ['lastDonationDate'],
    error: 'That date is in the future.',
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.strictObject({
  email: z.email('Enter a valid email address.'),
  // Deliberately not passwordSchema: never reveal the password policy on
  // login, and never hint at whether an account exists (§12).
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * The token out of a confirmation link, on its way back to the API (§12).
 *
 * The web app posts this rather than the email linking straight at the API:
 * corporate mail scanners follow links in mail before the recipient does, and
 * a GET that spends the token would be spent by the scanner. A form post from
 * the page a person opened is not something a link-follower does.
 *
 * Length is capped because the token is 32 random bytes in base64url — 43
 * characters. Anything near the cap is not one of ours.
 */
export const verifyEmailSchema = z.strictObject({
  token: z.string().min(1, 'That confirmation link is missing its token.').max(200),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
