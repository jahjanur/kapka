import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth';

const valid = {
  fullName: 'Ana Petrovska',
  email: 'ana@example.com',
  password: 'a-long-enough-password',
  bloodType: 'O-' as const,
  city: 'Bitola' as const,
};

describe('registerSchema', () => {
  it('accepts a complete, valid registration', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('treats a null last donation date as "never donated", which is eligible', () => {
    // §5.2: NULL means never donated. It must be expressible and distinct
    // from the field being absent.
    expect(registerSchema.safeParse({ ...valid, lastDonationDate: null }).success).toBe(
      true,
    );
  });

  it('rejects a last donation date in the future', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const result = registerSchema.safeParse({ ...valid, lastDonationDate: tomorrow });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['lastDonationDate']);
    }
  });

  it('accepts a past last donation date', () => {
    expect(
      registerSchema.safeParse({ ...valid, lastDonationDate: '2020-01-15' }).success,
    ).toBe(true);
  });

  it('rejects unknown keys instead of silently stripping them (§4)', () => {
    // This is what stops a client setting a field it has no business setting.
    const result = registerSchema.safeParse({ ...valid, role: 'admin' });
    expect(result.success).toBe(false);
  });

  it.each([
    ['a trailing space', 'Bitola '],
    ['the wrong case', 'bitola'],
    ['Cyrillic, which is how the country writes it', 'Битола'],
    ['no diacritics', 'Bitola'],
  ])('normalises a city given with %s to the canonical spelling', (_label, city) => {
    // §3: normalise at write time. All of these must reach the database as
    // exactly "Bitola", because §5.1 matches on an exact string.
    const result = registerSchema.safeParse({ ...valid, city });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.city).toBe('Bitola');
  });

  it.each(['Atlantis', 'Belgrade', '', 'Skopje City'])(
    'still rejects %o, which is not a city on the list',
    (city) => {
      // Normalisation resolves spellings, not inventions.
      expect(registerSchema.safeParse({ ...valid, city }).success).toBe(false);
    },
  );

  it('requires a password of at least 10 characters (§9.2)', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: '1234567890' }).success).toBe(
      true,
    );
  });

  it('rejects a malformed email', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'ana@' }).success).toBe(false);
  });

  it('rejects a blood type outside the eight', () => {
    expect(registerSchema.safeParse({ ...valid, bloodType: 'C+' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts any non-empty password', () => {
    // Deliberately not the registration policy: login must never reveal the
    // rules, or hint at whether an account exists (§12).
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('still requires a password to be present', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
