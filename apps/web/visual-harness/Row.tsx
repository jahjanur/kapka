import type { ReactNode } from 'react';
import { Cluster } from '../src/components';

/**
 * A row of things, for specimens that show a whole set at once.
 *
 * In a file of its own so the catalogue exports only its list. A module that
 * exports both a component and something else breaks Fast Refresh, and the
 * harness is a page somebody edits with the browser open.
 */
export function Row({ children }: { children: ReactNode }) {
  return (
    <Cluster gap={2} align="center">
      {children}
    </Cluster>
  );
}
