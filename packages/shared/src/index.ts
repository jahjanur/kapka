/**
 * @kapka/shared — the vocabulary and validation both sides agree on.
 *
 * One Zod schema per form, shared with the API so validation is identical on
 * both sides (§2). Import from '@kapka/shared', never from a deep path.
 */
export * from './bloodType';
export * from './cities';
export * from './domain';
export * from './errors';
export * from './schemas/enums';
export * from './schemas/common';
export * from './schemas/auth';
export * from './schemas/donorProfile';
export * from './schemas/request';
