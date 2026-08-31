import { describe, expect, it } from 'vitest';
import {
  announceBloodType,
  BLOOD_TYPES,
  formatBloodType,
  MINUS,
  parseBloodType,
} from './bloodType';

describe('blood type vocabulary', () => {
  it('has exactly the eight types, with no duplicates', () => {
    expect(BLOOD_TYPES).toHaveLength(8);
    expect(new Set(BLOOD_TYPES).size).toBe(8);
  });

  it('splits every type into an ABO group and an Rh sign', () => {
    expect(parseBloodType('O-')).toEqual({ group: 'O', rh: 'negative' });
    expect(parseBloodType('O+')).toEqual({ group: 'O', rh: 'positive' });
    expect(parseBloodType('AB-')).toEqual({ group: 'AB', rh: 'negative' });
    expect(parseBloodType('AB+')).toEqual({ group: 'AB', rh: 'positive' });
  });

  it('displays a real minus sign, never a hyphen', () => {
    // U+2212 is visibly clearer than U+002D at badge sizes (§6.3), and the
    // two are easy to confuse in a code review — so assert on the codepoint.
    expect(MINUS).toBe('−');
    for (const type of BLOOD_TYPES) {
      expect(formatBloodType(type)).not.toContain('-');
    }
    expect(formatBloodType('O-')).toBe(`O${MINUS}`);
  });

  it('keeps the ASCII form for storage and the API', () => {
    // Display is the only place the minus sign appears. Everything that
    // crosses the wire or reaches Postgres uses the enum value verbatim.
    expect(BLOOD_TYPES.every((t) => t.includes('-') || t.includes('+'))).toBe(true);
  });

  it('announces types the way a screen reader should say them (§10)', () => {
    expect(announceBloodType('O-')).toBe('O negative');
    expect(announceBloodType('O+')).toBe('O positive');
    // "AB" read as a word is wrong; it is two letters.
    expect(announceBloodType('AB-')).toBe('A B negative');
    expect(announceBloodType('AB+')).toBe('A B positive');
  });

  it('never announces a minus or a dash', () => {
    for (const type of BLOOD_TYPES) {
      const spoken = announceBloodType(type);
      expect(spoken).not.toContain('-');
      expect(spoken).not.toContain(MINUS);
      expect(spoken).toMatch(/(positive|negative)$/);
    }
  });
});
