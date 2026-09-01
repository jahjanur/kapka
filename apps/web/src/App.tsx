import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { IconSprite, OfflineBanner, ToastProvider } from './components';
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
const Dashboard = lazy(() => import('./routes/Dashboard'));
const Register = lazy(() => import('./routes/Register'));
const VerifyEmail = lazy(() => import('./routes/VerifyEmail'));
const HowItWorks = lazy(() => import('./routes/HowItWorks'));
const Privacy = lazy(() => import('./routes/Privacy'));
const NotFound = lazy(() => import('./routes/NotFound'));

export function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        {/* Above the router, so a toast survives a navigation — the message
            about what just happened outlives the screen it happened on. */}
        <ToastProvider>
          <BrowserRouter>
            <ScrollToTop />
            {/* Once, for the whole app. Every <Icon> is a <use href="#kapka-…">
            pointing here, and a document without the sprite renders every
            icon blank — no error, no warning, just nothing. */}
            <IconSprite />
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            {/* Outside <main>, because it is about the device rather than the
                page, and it must not move when a route changes. */}
            <OfflineBanner />
            {/* tabIndex={-1} is what makes the skip link skip. Without it
                the browser scrolls to #main and leaves focus on <body>, so
                the next Tab starts again from the top — the link appears to
                work and does nothing for the person using it. */}
            <main id="main" tabIndex={-1}>
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
                  <Route path={PATHS.dashboard} element={<Dashboard />} />
                  <Route path={PATHS.register} element={<Register />} />
                  <Route path={PATHS.verifyEmail} element={<VerifyEmail />} />
                  <Route path={PATHS.howItWorks} element={<HowItWorks />} />
                  <Route path={PATHS.privacy} element={<Privacy />} />
                  {/* Last, so it only catches what nothing above matched. */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </main>
          </BrowserRouter>
        </ToastProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
