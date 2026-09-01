import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/browser';
import { captureError, scrubEvent, scrubUrl, sentryOptions } from './sentry';

/**
 * The verification token is the reason this file exists.
 *
 * It arrives in the URL of /verify-email, it confirms an account, and Sentry
 * attaches the page URL to every event it sends. So an unrelated error thrown
 * while that page is open would hand a live credential to a third party, and
 * nothing about that would look like a bug from the inside.
 */

describe('scrubUrl', () => {
  it('redacts the verification token from an absolute URL', () => {
    const scrubbed = scrubUrl('https://kapka.mk/verify-email?token=abc123secret');
    expect(scrubbed).not.toContain('abc123secret');
    expect(scrubbed).toContain('token=%5Bredacted%5D');
  });

  it('redacts it from a relative URL too, and keeps the path', () => {
    const scrubbed = scrubUrl('/verify-email?token=abc123secret&from=email');
    expect(scrubbed).not.toContain('abc123secret');
    expect(scrubbed).toContain('/verify-email');
    expect(scrubbed).toContain('from=email');
  });

  it('leaves a URL with nothing secret in it exactly as it was', () => {
    const url = 'https://kapka.mk/requests/9f1c?city=Skopje';
    expect(scrubUrl(url)).toBe(url);
  });

  it('drops something it cannot parse rather than guessing', () => {
    expect(scrubUrl('http://[')).toBe('[unparseable-url]');
  });
});

describe('scrubEvent', () => {
  const event = (over: Partial<ErrorEvent>): ErrorEvent =>
    ({ event_id: 'e1', ...over }) as ErrorEvent;

  it('scrubs the request URL', () => {
    const scrubbed = scrubEvent(
      event({ request: { url: 'https://kapka.mk/verify-email?token=live-token' } }),
    );
    expect(JSON.stringify(scrubbed)).not.toContain('live-token');
  });

  it('scrubs URLs inside breadcrumbs, which is where navigation lands', () => {
    const scrubbed = scrubEvent(
      event({
        breadcrumbs: [
          { category: 'navigation', data: { url: '/verify-email?token=live-token' } },
        ],
      }),
    );
    expect(JSON.stringify(scrubbed)).not.toContain('live-token');
  });

  it('drops the user, whose only field would be an address', () => {
    const scrubbed = scrubEvent(event({ user: { email: 'ana@example.com' } }));
    expect(scrubbed.user).toBeUndefined();
  });
});

describe('configuration', () => {
  const options = sentryOptions('https://k@o0.ingest.sentry.io/0', 'staging');

  it('collects nothing the SDK would otherwise gather by default', () => {
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      queryParams: false,
      urlQueryParams: false,
    });
  });

  it('names the environment it is reporting from', () => {
    expect(options.environment).toBe('staging');
  });

  it('drops the integrations that read the page', () => {
    /* Breadcrumbs record which input was focused. This form has a password
       field and a phone field, and "it only records the selector" is a
       promise from someone else's changelog. */
    const kept = options.integrations as (all: { name: string }[]) => { name: string }[];
    const names = kept([{ name: 'Breadcrumbs' }, { name: 'Dedupe' }]).map((i) => i.name);
    expect(names).toEqual(['Dedupe']);
  });

  it('routes events through the scrubber', () => {
    const result = options.beforeSend?.(
      { event_id: 'e1', request: { url: '/verify-email?token=live' } } as ErrorEvent,
      {},
    );
    expect(JSON.stringify(result)).not.toContain('token=live');
  });
});

describe('with no DSN configured', () => {
  it('capturing an error does nothing and throws nothing', () => {
    // The suite runs without VITE_SENTRY_DSN, so initSentry has never run.
    expect(() => {
      captureError(new Error('boom'));
    }).not.toThrow();
  });
});
