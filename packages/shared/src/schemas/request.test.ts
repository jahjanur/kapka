import { describe, expect, it } from 'vitest';
import { NOTE_MAX_LENGTH, UNITS_MAX, UNITS_MIN } from '../domain';
import { createRequestSchema, rejectRequestSchema } from './request';

const valid = {
  bloodType: 'O-' as const,
  hospitalName: 'City General Hospital',
  city: 'Skopje' as const,
  contactPhone: '+389 70 123 456',
};

describe('createRequestSchema', () => {
  it('applies the same defaults the database column does', () => {
    const result = createRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.unitsNeeded).toBe(1);
    expect(result.data.urgency).toBe('urgent');
  });

  it.each([
    ['below the minimum', UNITS_MIN - 1],
    ['above the maximum', UNITS_MAX + 1],
    ['fractional', 1.5],
  ])('rejects a unit count %s', (_label, unitsNeeded) => {
    expect(createRequestSchema.safeParse({ ...valid, unitsNeeded }).success).toBe(false);
  });

  it('accepts the boundary unit counts', () => {
    for (const unitsNeeded of [UNITS_MIN, UNITS_MAX]) {
      expect(createRequestSchema.safeParse({ ...valid, unitsNeeded }).success).toBe(true);
    }
  });

  it('caps the note at the length the CHECK constraint allows', () => {
    const atLimit = 'x'.repeat(NOTE_MAX_LENGTH);
    const overLimit = 'x'.repeat(NOTE_MAX_LENGTH + 1);
    expect(createRequestSchema.safeParse({ ...valid, note: atLimit }).success).toBe(true);
    expect(createRequestSchema.safeParse({ ...valid, note: overLimit }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys', () => {
    expect(createRequestSchema.safeParse({ ...valid, status: 'approved' }).success).toBe(
      false,
    );
  });

  it('rejects coordinates outside the globe', () => {
    expect(createRequestSchema.safeParse({ ...valid, hospitalLat: 91 }).success).toBe(
      false,
    );
    expect(createRequestSchema.safeParse({ ...valid, hospitalLng: -181 }).success).toBe(
      false,
    );
    expect(
      createRequestSchema.safeParse({ ...valid, hospitalLat: 41.99, hospitalLng: 21.42 })
        .success,
    ).toBe(true);
  });

  it.each(['', 'abc', 'not a phone'])('rejects the unusable phone %o', (contactPhone) => {
    expect(createRequestSchema.safeParse({ ...valid, contactPhone }).success).toBe(false);
  });

  it('accepts the phone formats people actually type', () => {
    for (const contactPhone of ['+389 70 123 456', '070123456', '(02) 3123-456']) {
      expect(createRequestSchema.safeParse({ ...valid, contactPhone }).success).toBe(
        true,
      );
    }
  });
});

describe('rejectRequestSchema', () => {
  it('demands a reason the requester can act on', () => {
    expect(rejectRequestSchema.safeParse({ reason: 'no' }).success).toBe(false);
    expect(
      rejectRequestSchema.safeParse({ reason: 'Hospital could not be verified.' })
        .success,
    ).toBe(true);
  });
});
