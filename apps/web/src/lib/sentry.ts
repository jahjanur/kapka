import * as Sentry from '@sentry/browser';
import type { BrowserOptions, ErrorEvent } from '@sentry/browser';

/**
 * Browser error reporting, off unless a DSN is configured.
 *
 * Off by default: without VITE_SENTRY_DSN nothing loads at all. That keeps a
 * developer's experiments and every test run out of the project production
 * reports into, which is the difference between an alert meaning something and
 * an alert being ignored.
 *
 * Imported statically, after trying it the other way. A dynamic import keeps
 * the SDK out of the entry, but it also defeats tree-shaking: the whole
 * namespace comes down as one chunk, and measured it was 178kB gzipped
 * against 29kB for the static, tree-shaken import. Deferring six times the
 * bytes is not a saving for a donor on 3G, it is a delay — and errors thrown
 * during load, the ones a boundary exists for, would have been the ones it
 * missed.
 *
 * @sentry/browser rather than @sentry/react, because the boundary here is
 * hand-written and none of the React bindings are used.
 *
 * The cost is real and the budget must see it. A build with no DSN
 * tree-shakes the SDK away entirely, so CI — which has none — would have
 * measured the app without it. perf:budget therefore builds with a
 * placeholder DSN; see the note in that script.
 */

/**
 * Query parameters that must never reach an error tracker.
 *
 * `token` is the email-verification token. It arrives in the URL of
 * /verify-email, it is a bearer credential for confirming an account, and
 * Sentry attaches the page URL to every event — so without this, one unrelated
 * error thrown while that page is open hands the token to a third party.
 */
const SECRET_PARAMS = ['token'];

/** Replaces the value of any secret parameter, leaving the shape readable. */
export function scrubUrl(url: string): string {
  try {
    // Relative URLs need a base; the base is discarded with the result.
    const parsed = new URL(url, 'https://kapka.invalid');
    let touched = false;
    for (const name of SECRET_PARAMS) {
      if (parsed.searchParams.has(name)) {
        parsed.searchParams.set(name, '[redacted]');
        touched = true;
      }
    }
    if (!touched) return url;
    return url.startsWith('http')
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    /* Not a URL we can parse. Returning it unchanged would be a guess about
       something we have just failed to understand, so drop it instead. */
    return '[unparseable-url]';
  }
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event };

  if (scrubbed.request?.url) {
    scrubbed.request = { ...scrubbed.request, url: scrubUrl(scrubbed.request.url) };
  }

  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((crumb) => {
      const url: unknown = crumb.data?.url;
      if (typeof url !== 'string') return crumb;
      return { ...crumb, data: { ...crumb.data, url: scrubUrl(url) } };
    });
  }

  // A donor's address is never something an error report needs.
  delete scrubbed.user;

  return scrubbed;
}

export function sentryOptions(dsn: string, environment: string): BrowserOptions {
  return {
    dsn,
    environment,
    /*
     * Nothing, from every category the SDK knows how to collect.
     *
     * This replaces the deprecated `sendDefaultPii: false`, and it is stricter
     * than that flag was: cookies carry the refresh token, request headers
     * carry Authorization, request bodies carry a password on one endpoint,
     * and query parameters carry the email-verification token. Naming each one
     * means a future SDK that adds a category defaults it on and we notice,
     * rather than a single flag quietly changing meaning.
     */
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      queryParams: false,
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    /*
     * The default integrations minus the ones that read the page.
     *
     * Breadcrumbs record that an input was focused, never what was typed —
     * but this app has a password field and a phone field, and "never" is a
     * thing to enforce rather than to rely on.
     */
    integrations: (defaults) =>
      defaults.filter(
        (integration) =>
          integration.name !== 'Breadcrumbs' && integration.name !== 'CaptureConsole',
      ),
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
  };
}

let active = false;

export function initSentry(): boolean {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return false;
  Sentry.init(
    sentryOptions(dsn, (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) || 'unknown'),
  );
  active = true;
  return true;
}

/** Reports one error. Silent when Sentry was never started. */
export function captureError(error: unknown): void {
  if (!active) return;
  Sentry.captureException(error);
}
