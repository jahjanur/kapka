import { z } from 'zod';
import { BLOOD_TYPES } from '../bloodType';
import { CITIES, normaliseCity } from '../cities';
import {
  NOTIFICATION_STATUSES,
  REQUEST_STATUSES,
  URGENCIES,
  USER_ROLES,
} from '../domain';

/**
 * The validation side of the vocabulary. Built from the same const arrays the
 * types come from, so a schema can never accept a value the type rejects.
 */
export const bloodTypeSchema = z.enum(BLOOD_TYPES);
/**
 * Normalises before validating (§3): trims, transliterates Cyrillic and folds
 * diacritics, then matches the canonical list. What reaches the database is
 * always one of CITIES, whatever the client sent.
 *
 * Unrecognised input is passed through untouched so the error names what was
 * actually sent rather than a mangled version of it.
 */
export const citySchema = z.preprocess(
  (value) => (typeof value === 'string' ? (normaliseCity(value) ?? value) : value),
  z.enum(CITIES),
);
export const userRoleSchema = z.enum(USER_ROLES);
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export const urgencySchema = z.enum(URGENCIES);
export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);
