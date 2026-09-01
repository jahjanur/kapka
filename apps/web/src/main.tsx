import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* Order matters: the @font-face rules first so the browser can start fetching,
   then tokens, then the scales that reference them, then the base layer. */
import '@kapka/tokens/fonts.css';
import '@kapka/tokens/tokens.css';
import '@kapka/tokens/scale.css';
import '@kapka/tokens/global.css';

import { App } from './App';
import { ErrorBoundary } from './components';
import { initSentry } from './lib/sentry';

/* Before render, so an error thrown on the very first paint is still
   reported. A no-op without VITE_SENTRY_DSN, which is every local run. */
initSentry();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
