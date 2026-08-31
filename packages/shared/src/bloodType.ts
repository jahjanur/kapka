/**
 * Blood types and the ABO/Rh vocabulary.
 *
 * The compatibility matrix itself deliberately lives in the database, not
 * here (§3) — this module only covers how a type is written and announced.
 */

/** The eight types, ordered as they appear in the DB enum. */
export const BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

export type AboGroup = 'O' | 'A' | 'B' | 'AB';
export type RhSign = 'positive' | 'negative';

/** U+2212 MINUS SIGN. Visibly clearer than a hyphen at badge sizes (§6.3). */
export const MINUS = '−';

/** Split a stored type ("O-") into its group and Rh sign. */
export function parseBloodType(type: BloodType): { group: AboGroup; rh: RhSign } {
  const negative = type.endsWith('-');
  return {
    group: type.slice(0, -1) as AboGroup,
    rh: negative ? 'negative' : 'positive',
  };
}

/**
 * How a type is DISPLAYED: a real minus sign, never a hyphen.
 * Storage and API always use the ASCII form from BLOOD_TYPES.
 */
export function formatBloodType(type: BloodType): string {
  return type.replace('-', MINUS);
}

/**
 * How a type is ANNOUNCED. A screen reader must say "O negative", not
 * "O minus" and certainly not "O dash" (§10).
 */
export function announceBloodType(type: BloodType): string {
  const { group, rh } = parseBloodType(type);
  const spokenGroup = group === 'AB' ? 'A B' : group;
  return `${spokenGroup} ${rh}`;
}
