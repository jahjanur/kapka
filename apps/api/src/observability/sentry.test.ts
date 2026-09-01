import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { captureError, scrubEvent, sentryIsActive, sentryOptions } from './sentry';

/**
 * What may leave this process, and what may not.
 *
 * The whole point of an error tracker is that it sends things somewhere else,
 * which makes it the one dependency that can turn a bug into a privacy
 * incident. §12 and the privacy notice both name what must never travel:
 * passwords, tokens, hashes, full email addresses. Nothing checked that an
 * error report obeyed them.
 */

const event = (over: Partial<ErrorEvent> = {}): ErrorEvent =>
  ({ event_id: 'e1', ...over }) as ErrorEvent;

const withException = (message: string): ErrorEvent =>
  event({ exception: { values: [{ type: 'Error', value: message }] } });

describe('what an error report may carry', () => {
  it('redacts a JWT out of an exception message', () => {
    const scrubbed = scrubEvent(
      withException(
        'verify failed for eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.c2lnbmF0dXJl',
      ),
    );
    const value = scrubbed.exception?.values?.[0]?.value ?? '';
    expect(value).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(value).toContain('[redacted-jwt]');
  });

  it('masks an email address rather than sending it', () => {
    const value =
      scrubEvent(withException('no donor for ana.petrovska@example.com')).exception
        ?.values?.[0]?.value ?? '';
    expect(value).not.toContain('ana.petrovska@example.com');
    expect(value).toContain('@example.com');
  });

  it('redacts a password out of a connection string', () => {
    const value =
      scrubEvent(
        withException(
          'connect failed: postgresql://kapka:hunter2@db.internal:5432/kapka',
        ),
      ).exception?.values?.[0]?.value ?? '';
    expect(value).not.toContain('hunter2');
  });

  it('redacts the message field as well as the exception', () => {
    const scrubbed = scrubEvent(event({ message: 'Authorization: Bearer abc123def' }));
    expect(scrubbed.message).not.toContain('abc123def');
  });

  it('drops the request, the user and the breadcrumbs entirely', () => {
    /*
     * Not sanitised — removed. `request` would carry the refresh cookie, the
     * Authorization header and, on one endpoint, a registration body with a
     * password in it. Deleting them here means a future change that starts
     * attaching them cannot quietly start sending them.
     */
    const scrubbed = scrubEvent(
      event({
        request: {
          url: 'https://kapka.mk/verify-email?token=secret',
          cookies: { session: 'abc' },
        },
        user: { email: 'ana@example.com' },
        breadcrumbs: [{ message: 'typed into #password' }],
      }),
    );
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.breadcrumbs).toBeUndefined();
  });
});

describe('how it is configured', () => {
  it('collects nothing the SDK would otherwise gather by default', () => {
    /* Named category by category rather than with one flag: cookies carry the
       refresh token, headers carry Authorization, bodies carry a password on
       one endpoint, query parameters carry the verification token. */
    const collection = sentryOptions().dataCollection;
    expect(collection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      queryParams: false,
      urlQueryParams: false,
    });
  });

  it('sends no traces — this is error reporting, not profiling', () => {
    expect(sentryOptions().tracesSampleRate).toBe(0);
  });

  it('names an environment, so an alert can say which one broke', () => {
    // Staging runs NODE_ENV=production on purpose, so NODE_ENV alone cannot
    // tell the two apart — see the note in env.ts.
    expect(sentryOptions().environment).toBeTruthy();
  });

  it('routes every event through the scrubber', () => {
    const options = sentryOptions();
    const result = options.beforeSend?.(
      withException('token eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.sig'),
      {},
    );
    const value = (result as ErrorEvent | null)?.exception?.values?.[0]?.value ?? '';
    expect(value).toContain('[redacted-jwt]');
  });
});

describe('when there is no DSN', () => {
  it('is inactive, and capturing an error does nothing at all', () => {
    /* The suite runs with no SENTRY_DSN, which is the point: a test run must
       never report into the project production reports into. */
    expect(sentryIsActive()).toBe(false);
    expect(() => {
      captureError(new Error('boom'), { method: 'GET', route: '/api/requests' });
    }).not.toThrow();
  });
});
