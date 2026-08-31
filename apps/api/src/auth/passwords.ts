import bcrypt from 'bcryptjs';
import { env } from '../env';

/**
 * §12 sets this to 12, and env.ts refuses anything lower in production.
 * Deliberately slow is the entire feature — but the test suite runs hundreds
 * of these, and at cost 12 that is tens of CPU-seconds of pure hashing, enough
 * to starve everything else on a two-core runner.
 */
const COST = env.BCRYPT_COST;

/**
 * A hash of a password nobody has, compared against when the email is
 * unknown. Without it, "no such user" returns in a millisecond and "wrong
 * password" takes a hundred, which tells an attacker which emails exist
 * however carefully the response is worded (§12).
 */
const DUMMY_HASH = bcrypt.hashSync('kapka-timing-equaliser', COST);

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Burn the same time as a real check, then fail. */
export async function verifyAgainstNobody(plain: string): Promise<false> {
  await bcrypt.compare(plain, DUMMY_HASH);
  return false;
}
