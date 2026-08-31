import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* Order matters: tokens, then the scales that reference them, then the base
   layer that consumes both. */
import './styles/tokens.css';
import './styles/scale.css';
import './styles/global.css';

import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
