import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { IconSprite } from './components';
import { ThemeProvider } from './lib/ThemeProvider';

/* Route-level code splitting from the start (§11) — Leaflet and the map
   screens must never reach the initial bundle. */
const Feed = lazy(() => import('./routes/Feed'));

/**
 * The kitchen sink is a developer tool, not part of the product.
 *
 * Registered only in development, so it is not reachable on the deployed site
 * and its chunk is not built. A stranger browsing the design system of a
 * platform that handles health-adjacent data is a small thing, but this is a
 * product where looking like it was built by people who take that seriously
 * is the feature (§2).
 */
function developerRoutes(): ReactNode {
  if (!import.meta.env.DEV) return null;

  const KitchenSink = lazy(() => import('./routes/KitchenSink'));
  const KitchenSinkFrame = lazy(() => import('./routes/KitchenSinkFrame'));

  return (
    <>
      <Route path="/kitchen-sink" element={<KitchenSink />} />
      <Route path="/kitchen-sink/frame" element={<KitchenSinkFrame />} />
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        {/* Once, for the whole app. Every <Icon> is a <use href="#kapka-…">
            pointing here, and a document without the sprite renders every
            icon blank — no error, no warning, just nothing. */}
        <IconSprite />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <main id="main">
          {/* Route-level fallback only. Screens get shape-matched skeletons
              of their own (§9.7) — never a centred spinner on a blank page. */}
          <Suspense
            fallback={
              <div aria-live="polite" className="visually-hidden">
                Loading…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Feed />} />
              {developerRoutes()}
            </Routes>
          </Suspense>
        </main>
      </BrowserRouter>
    </ThemeProvider>
  );
}
