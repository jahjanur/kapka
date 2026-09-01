import type { ApiError } from '../../lib/api';
import { errorState } from '../../lib/errorState';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';

/**
 * A failed fetch, said the same way everywhere.
 *
 * Four screens each carried their own copy of the same sentence, which was
 * fine until there was a second kind of failure to describe and it became
 * four edits. What to say lives in errorState(); this is where it is shown.
 *
 * Offline gets no retry button. Pressing it changes nothing, and offering it
 * makes a lost signal look like the reader's fault for not pressing hard
 * enough — the screen retries itself when the connection returns.
 */
export function ErrorState({
  error,
  subject,
  onRetry,
}: {
  error: ApiError;
  /** What could not be loaded: "requests", "queue", "settings". */
  subject: string;
  onRetry: () => void;
}) {
  const copy = errorState(error, subject);
  return (
    <EmptyState
      icon={copy.icon}
      headline={copy.headline}
      body={copy.body}
      {...(copy.retryable
        ? { action: <Button onClick={onRetry}>Try again</Button> }
        : {})}
    />
  );
}
