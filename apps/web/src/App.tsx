import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './lib/theme';

/* Route-level code splitting from the start (§11) — Leaflet and the map
   screens must never reach the initial bundle. */
const Feed = lazy(() => import('./routes/Feed'));
const KitchenSink = lazy(() => import('./routes/KitchenSink'));
const KitchenSinkFrame = lazy(() => import('./routes/KitchenSinkFrame'));

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <a className="skip-link" href="#main">Skip to content</a>
        <main id="main">
          {/* Route-level fallback only. Screens get shape-matched skeletons
              of their own (§9.7) — never a centred spinner on a blank page. */}
          <Suspense fallback={<div aria-live="polite" className="visually-hidden">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Feed />} />
              <Route path="/kitchen-sink" element={<KitchenSink />} />
              <Route path="/kitchen-sink/frame" element={<KitchenSinkFrame />} />
            </Routes>
          </Suspense>
        </main>
      </BrowserRouter>
    </ThemeProvider>
  );
}
