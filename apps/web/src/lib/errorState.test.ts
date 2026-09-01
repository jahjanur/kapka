import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { errorState } from './errorState';

/*
 * The wording of a failure is not a per-screen decision, and the two reasons
 * a request fails need two different answers: someone with no signal is not
 * helped by being told the server is unreachable, and their move is to wait
 * rather than to press a button.
 */

describe('what to say about a failure', () => {
  it('tells someone offline that it is their connection, not the server', () => {
    const copy = errorState(new ApiError('OFFLINE', 'You are offline.', 0), 'the queue');
    expect(copy.headline).toBe('You are offline');
    expect(copy.body).toContain('the queue');
  });

  it('offers no retry to someone offline', () => {
    /* Pressing it changes nothing, and offering it makes a lost signal look
       like the reader's fault for not pressing hard enough. */
    expect(
      errorState(new ApiError('OFFLINE', 'You are offline.', 0), 'the queue').retryable,
    ).toBe(false);
  });

  it('offers a retry when the server is the one that failed', () => {
    const copy = errorState(new ApiError('INTERNAL', 'Nope.', 500), 'the requests');
    expect(copy.retryable).toBe(true);
    expect(copy.headline).toContain('the requests');
  });

  it('says how long to wait when the answer is to wait', () => {
    const copy = errorState(new ApiError('RATE_LIMITED', 'Slow down.', 429), 'the feed');
    expect(copy.headline).toBe('Too many attempts');
    expect(copy.body).toMatch(/minute/);
  });

  it('takes the whole noun phrase, so the sentence reads', () => {
    // "We couldn't load the settings" is worse English than what the screen
    // already said. Sharing a template must not flatten the copy.
    expect(errorState(new ApiError('INTERNAL', 'x', 500), 'your settings').headline).toBe(
      'We couldn’t load your settings',
    );
    expect(errorState(new ApiError('INTERNAL', 'x', 500), 'this request').headline).toBe(
      'We couldn’t load this request',
    );
  });
});
