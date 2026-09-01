import { Router } from 'express';
import { pool, type Queryable } from '../db';

/**
 * Two checks, because they answer different questions and want different
 * consequences.
 *
 * `/health` is **liveness**. Is this process running? Cheap, no database, never
 * fails for anything but a dead process. It is what Render's healthCheckPath
 * watches, and that matters: Render restarts a service that fails it, and
 * restarting the API because Postgres is having a moment turns a database
 * blip into a restart loop that takes the API down too.
 *
 * `/ready` is **readiness**. Can this process actually serve a request? It
 * reaches the database, because every endpoint that does anything does. This
 * is the one an uptime monitor should watch — a monitor pointed at /health
 * would have reported a green service for as long as it took somebody to
 * notice that nothing worked.
 */

/** Long enough for a healthy round trip, short enough that a monitor gets an
    answer rather than a timeout. A hung database is a down database. */
const READY_TIMEOUT_MS = 3_000;

export function createHealthRouter(
  db: Queryable = pool,
  /* Injectable so a test can prove the timeout fires without sitting there
     for three seconds. Nothing in production passes it. */
  { timeoutMs = READY_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  router.get('/ready', (_req, res) => {
    void (async () => {
      const started = Date.now();
      try {
        await withTimeout(db.query('SELECT 1'), timeoutMs);
        res.json({ status: 'ready', database: 'up', ms: Date.now() - started });
      } catch {
        /* No detail in the body. This endpoint is public — it has to be, or a
           monitor cannot watch it — and a connection error from pg names the
           host, the port and sometimes the user. 503 is the whole message; the
           reason goes to the log and to Sentry. */
        res
          .status(503)
          .json({ status: 'unavailable', database: 'down', ms: Date.now() - started });
      }
    })();
  });

  return router;
}

/** Rejects rather than hanging, so a wedged connection still gets a 503. */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`readiness check timed out after ${String(ms)}ms`));
        }, ms);
      }),
    ]);
  } finally {
    // Or the process keeps a pending timer alive for three seconds after every
    // successful check, which a monitor makes constant.
    if (timer) clearTimeout(timer);
  }
}
