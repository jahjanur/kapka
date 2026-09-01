import { createApp } from './app';
import { env } from './env';
import { initSentry, installProcessHandlers } from './observability/sentry';

/* Before the app, so an error thrown while the routes are being built is
   still reported. */
const reporting = initSentry();
installProcessHandlers();

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  // Said out loud either way. Silence about error tracking is how a service
  // runs for a month with none and nobody notices.
  console.log(
    reporting
      ? `[api] error reporting on (${env.SENTRY_ENVIRONMENT || env.NODE_ENV})`
      : '[api] error reporting off — no SENTRY_DSN',
  );
});
