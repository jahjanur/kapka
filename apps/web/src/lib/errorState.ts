import type { ApiError } from './api';
import type { IconName } from '../components/Icon/Icon';

export interface ErrorStateCopy {
  icon: IconName;
  headline: string;
  body: string;
  /** False when trying again now cannot possibly work. */
  retryable: boolean;
}

/**
 * What to say about a failed request, in one place.
 *
 * Four screens had their own copy of "The connection dropped on the way.
 * Nothing is lost — try again." — which was fine until there was a second
 * kind of failure to describe, and then it was four edits. The wording of a
 * failure is not a per-screen decision.
 *
 * `subject` is the whole noun phrase, not a bare noun — "your settings",
 * "this request". Sharing a template must not flatten four sentences into
 * one that fits none of them: "we couldn't load the settings" is worse
 * English than what each screen already said, and centralising is not worth
 * a downgrade in what the reader reads.
 */
export function errorState(error: ApiError, subject: string): ErrorStateCopy {
  if (error.code === 'OFFLINE') {
    return {
      icon: 'alertCircle',
      headline: 'You are offline',
      // No retry button: pressing it changes nothing, and offering it makes
      // the failure look like the reader's fault for not pressing it enough.
      body: `We will load ${subject} as soon as you have a connection again.`,
      retryable: false,
    };
  }

  if (error.code === 'RATE_LIMITED') {
    return {
      icon: 'clock',
      headline: 'Too many attempts',
      body: 'Give it a minute and try again.',
      retryable: true,
    };
  }

  return {
    icon: 'alertTriangle',
    headline: `We couldn’t load ${subject}`,
    body: 'The connection dropped on the way. Nothing is lost — try again.',
    retryable: true,
  };
}
