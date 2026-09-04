import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* The same four, in the same order, as main.tsx. A harness that styles itself
   differently from the app is a harness that photographs something nobody
   ships. */
import '@kapka/tokens/fonts.css';
import '@kapka/tokens/tokens.css';
import '@kapka/tokens/scale.css';
import '@kapka/tokens/global.css';

import { Container, IconSprite } from '../src/components';
import { SPECIMENS } from './catalogue';
import './harness.css';

/**
 * The component gallery the visual snapshots photograph.
 *
 * Deliberately not a route in the app, and not in the production build: Vite
 * builds `index.html` and nothing else, so this page exists on the dev server
 * and nowhere a donor can reach. It is test equipment, and it is kept out of
 * src/ so that it reads as such.
 *
 * ?only=<id> renders one specimen alone — for a modal, which makes the rest
 * of the document inert, and for a toast, which is positioned against the
 * viewport rather than its parent.
 */
const params = new URLSearchParams(window.location.search);
const only = params.get('only');

const showing = only
  ? SPECIMENS.filter((one) => one.id === only)
  : SPECIMENS.filter((one) => one.solo !== true);

/* The catalogue, published for the spec to read at runtime.
   The spec cannot import this file — it is TSX importing CSS modules and the
   test runner is plain Node — and a second hand-kept list beside it would go
   stale the first time somebody adds a component and forgets. */
declare global {
  interface Window {
    __SPECIMENS__: { id: string; solo: boolean }[];
  }
}
window.__SPECIMENS__ = SPECIMENS.map((one) => ({ id: one.id, solo: one.solo === true }));

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <MemoryRouter>
      <IconSprite />
      {showing.map((specimen) => (
        /* data-variant is the camera's handle on each one. The wrapper is
             what gets photographed, so its padding is the margin around the
             component in every snapshot. */
        <div
          key={specimen.id}
          data-variant={specimen.id}
          data-width={specimen.width ?? 'auto'}
          className="specimen"
        >
          {specimen.width === 'full' ? (
            <Container>{specimen.render()}</Container>
          ) : (
            specimen.render()
          )}
        </div>
      ))}
    </MemoryRouter>
  </StrictMode>,
);
