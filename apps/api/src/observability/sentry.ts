import * as Sentry from '@sentry/node';
import type { ErrorEvent, EventHint } from '@sentry/node';
import { env } from '../env';
import { redact } from '../redact';

/**
 * Error reporting, off by default.
 *
 * Without SENTRY_DSN nothing initialises and every function here is a no-op,
 * which is what makes it safe in tests, in CI and on a laptop: an error
 * tracker that silently reports a developer's experiments into the same
 * project as production is worse than no error tracker.
 *
 * Errors only — no tracing, no profiling. This is a small app with a small
 * budget, and the question it needs answered is "did something break", not
 * "which span was slow".
 */

let active = false;

/** Whatever context an error had that is safe to send. */
export interface ErrorContext {
  method?: string;
  /** The path, with the query string already gone — see scrubEvent. */
  route?: string;
}

/**
 * Everything leaving this process, put through the same redactor the logs use.
 *
 * §12 and the privacy notice both say what may not leave here: passwords,
 * tokens, hashes, full email addresses. An exception message is a string
 * somebody wrote under pressure, and the ones that matter most tend to be
 * thrown closest to the credentials — so the message and every stack frame's
 * text go through redact() rather than being trusted.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event };

  if (typeof scrubbed.message === 'string') {
    scrubbed.message = redact(scrubbed.message);
  }

  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((value) => ({
        ...value,
        ...(typeof value.value === 'string' ? { value: redact(value.value) } : {}),
      })),
    };
  }

  /*
   * Never sent, rather than sanitised.
   *
   * `request` would carry headers, cookies and the body — the refresh cookie,
   * the Authorization header, and a registration payload with a password in
   * it. `user` would carry an address. Nothing is captured with them attached
   * in the first place; deleting them here means a future integration that
   * starts attaching them cannot quietly start sending them too.
   */
  delete scrubbed.request;
  delete scrubbed.user;
  delete scrubbed.breadcrumbs;

  return scrubbed;
}

/** Exported whole so a test can assert the options rather than the network. */
export function sentryOptions(): Sentry.NodeOptions {
  return {
    dsn: env.SENTRY_DSN,
    /*
     * Its own variable, not NODE_ENV. Staging runs NODE_ENV=production on
     * purpose — see render.yaml — so NODE_ENV cannot tell the two apart, and
     * an alert that cannot say which environment broke is an alert nobody can
     * act on.
     */
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
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
    beforeSend: (event: ErrorEvent, _hint: EventHint) => scrubEvent(event),
  };
}

/**
 * Starts reporting, if there is somewhere to report to.
 *
 * Returns whether it did, so the caller can say so in the boot log — silence
 * about error tracking is how a service runs for a month with none.
 */
export function initSentry(): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init(sentryOptions());
  active = true;
  return true;
}

export function sentryIsActive(): boolean {
  return active;
}

/** Sends one error. Does nothing at all when Sentry was never started. */
export function captureError(error: unknown, context: ErrorContext = {}): void {
  if (!active) return;
  Sentry.withScope((scope) => {
    // Tags, not request data: a method and a route are enough to find the
    // handler, and neither can carry a donor's details.
    if (context.method) scope.setTag('http.method', context.method);
    if (context.route) scope.setTag('http.route', context.route);
    Sentry.captureException(error);
  });
}

/**
 * The two failures that never reach an Express handler.
 *
 * An unhandled rejection is usually a forgotten `await` and the process
 * survives it, so it is reported and life goes on. An uncaught exception has
 * left the process in a state nobody reasoned about, so it is reported and
 * then the process ends — Render restarts it, which is the only honest
 * response to "we do not know what is true any more".
 */
export function installProcessHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    console.error('[api] unhandled rejection:', redact(reason));
    captureError(reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[api] uncaught exception:', redact(error));
    captureError(error);
    // Give the report a moment to leave before the process does.
    void Sentry.close(2000).then(() => process.exit(1));
  });
}
