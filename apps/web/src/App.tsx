import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { IconSprite } from './components';
import { ThemeProvider } from './lib/ThemeProvider';
import { SessionProvider } from './lib/SessionProvider';
import { ScrollToTop } from './lib/ScrollToTop';
import { PATHS } from './routes/paths';

/* Route-level code splitting from the start (§11) — Leaflet and the map
   screens must never reach the initial bundle. */
const Feed = lazy(() => import('./routes/Feed'));
const RequestDetail = lazy(() => import('./routes/RequestDetail'));
const PostRequest = lazy(() => import('./routes/PostRequest'));
const AdminQueue = lazy(() => import('./routes/AdminQueue'));
const Register = lazy(() => import('./routes/Register'));
const VerifyEmail = lazy(() => import('./routes/VerifyEmail'));
const HowItWorks = lazy(() => import('./routes/HowItWorks'));
const NotFound = lazy(() => import('./routes/NotFound'));

export function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <BrowserRouter>
          <ScrollToTop />
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
                <Route path={PATHS.feed} element={<Feed />} />
                {/* Before the dynamic one for readability only — React
                    Router ranks by specificity, not by source order. */}
                <Route path={PATHS.postRequest} element={<PostRequest />} />
                <Route path={PATHS.request(':id')} element={<RequestDetail />} />
                <Route path={PATHS.admin} element={<AdminQueue />} />
                <Route path={PATHS.register} element={<Register />} />
                <Route path={PATHS.verifyEmail} element={<VerifyEmail />} />
                <Route path={PATHS.howItWorks} element={<HowItWorks />} />
                {/* Last, so it only catches what nothing above matched. */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </BrowserRouter>
      </SessionProvider>
    </ThemeProvider>
  );
}
