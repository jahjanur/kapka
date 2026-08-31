import { z } from 'zod';

/**
 * Permissive on purpose. Over-strict phone validation loses real users, and a
 * number that reaches a human is the whole point — the platform never dials it
 * automatically.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(6, 'That phone number looks too short.')
  .max(24, 'That phone number looks too long.')
  .regex(/^[+()\-\s\d]+$/, 'Use digits, spaces, and + ( ) - only.');

/** A date with no time component, as stored in a Postgres DATE column. */
export const dateOnlySchema = z.iso.date();

export const passwordSchema = z
  .string()
  // §9.2: length beats symbol soup. The common-password check is server-side,
  // where the list actually lives.
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.');
