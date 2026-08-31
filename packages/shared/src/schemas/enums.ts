import { z } from 'zod';
import { BLOOD_TYPES } from '../bloodType';
import { CITIES } from '../cities';
import {
  NOTIFICATION_STATUSES, REQUEST_STATUSES, URGENCIES, USER_ROLES,
} from '../domain';

/**
 * The validation side of the vocabulary. Built from the same const arrays the
 * types come from, so a schema can never accept a value the type rejects.
 */
export const bloodTypeSchema = z.enum(BLOOD_TYPES);
export const citySchema = z.enum(CITIES);
export const userRoleSchema = z.enum(USER_ROLES);
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export const urgencySchema = z.enum(URGENCIES);
export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);
