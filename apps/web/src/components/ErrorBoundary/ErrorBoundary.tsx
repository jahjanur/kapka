import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../Button/Button';
import { Container } from '../layout';
import { EmptyState } from '../EmptyState/EmptyState';
import { captureError } from '../../lib/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * The last thing between a render error and a white screen.
 *
 * There was nothing here before: a component that threw took the whole app
 * down to a blank page, and — because nothing was watching either — nobody
 * found out. A donor reading a request on a phone would have seen the page go
 * white and closed it.
 *
 * A class, because this is the one thing hooks still cannot do.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Logged as well as reported, so it is visible on a laptop where Sentry
    // is deliberately off.
    console.error('[web] render error:', error, info.componentStack);
    captureError(error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div style={{ paddingBlock: 'var(--space-16)' }}>
        <Container>
          <EmptyState
            icon="alertTriangle"
            headline="This page stopped working"
            /* Says what to do, and does not apologise twice. Reloading really
               is the whole remedy available to the reader — the report has
               already gone to us. */
            body="Something broke while drawing this screen. Reloading usually fixes it, and we have been told."
            action={
              <Button
                onClick={() => {
                  window.location.reload();
                }}
                size="lg"
              >
                Reload the page
              </Button>
            }
          />
        </Container>
      </div>
    );
  }
}
