import type { ZodError } from 'zod';

/**
 * The one error shape every endpoint returns (§4):
 *   { "error": { "code": "...", "message": "...", "field": "..." } }
 *
 * Formatting lives here rather than in the API so the web app can rely on the
 * exact shape it will receive, and both sides change together.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'EMAIL_TAKEN',
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'DONOR_NOT_ELIGIBLE',
  'RATE_LIMITED',
  'ALREADY_MODERATED',
  'REQUEST_EXPIRED',
  'EMAIL_BUDGET_EXHAUSTED',
  'NOT_IMPLEMENTED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** The offending field, where the error belongs to one. */
    field?: string;
  };
}

export function apiError(code: ErrorCode, message: string, field?: string): ApiErrorBody {
  return { error: field ? { code, message, field } : { code, message } };
}

/**
 * Turns a Zod failure into the envelope. Reports the first issue only — the
 * form highlights every field itself from its own parse, and a wall of API
 * messages helps nobody.
 */
export function zodToApiError(error: ZodError): ApiErrorBody {
  const issue = error.issues[0];
  if (!issue) return apiError('VALIDATION_FAILED', 'The request body is invalid.');
  const field = issue.path.map(String).join('.') || undefined;
  return apiError('VALIDATION_FAILED', issue.message, field);
}
