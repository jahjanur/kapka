import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* Order matters: tokens, then the scales that reference them, then the base
   layer that consumes both. */
import '@kapka/tokens/tokens.css';
import '@kapka/tokens/scale.css';
import '@kapka/tokens/global.css';

import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
