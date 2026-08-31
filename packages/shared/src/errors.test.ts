import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiError, zodToApiError } from './errors';

describe('the API error envelope (§4)', () => {
  it('omits field entirely when the error belongs to no field', () => {
    expect(apiError('NOT_FOUND', 'Nope.')).toEqual({
      error: { code: 'NOT_FOUND', message: 'Nope.' },
    });
  });

  it('includes field when there is one', () => {
    expect(apiError('VALIDATION_FAILED', 'Bad.', 'email')).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Bad.', field: 'email' },
    });
  });

  it('maps a Zod failure to the envelope with the offending field', () => {
    const schema = z.object({ email: z.email() });
    const result = schema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
    if (result.success) return;

    const body = zodToApiError(result.error);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.field).toBe('email');
    expect(body.error.message).toBeTruthy();
  });

  it('joins a nested path into a dotted field name', () => {
    const schema = z.object({ profile: z.object({ city: z.string() }) });
    const result = schema.safeParse({ profile: { city: 42 } });
    if (result.success) throw new Error('expected the parse to fail');
    expect(zodToApiError(result.error).error.field).toBe('profile.city');
  });
});
