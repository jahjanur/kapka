import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { createPgAuthRepository, type AuthRepository } from './auth/repository';
import {
  createPgRequestsRepository,
  type RequestsRepository,
} from './requests/repository';
import { createPgAdminRepository, type AdminRepository } from './admin/repository';
import { createAdminRouter } from './routes/admin';
import { createVerificationSender, type SendVerification } from './auth/verification';
import { dispatchNotifications } from './notify/dispatch';
import { createMailer } from './notify/mailer';
import type { Dispatch } from './routes/admin';
import { createAuthRouter } from './routes/auth';
import { createMeRouter } from './routes/me';
import { generalRateLimit } from './middleware/rateLimit';
import { env } from './env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { citiesRouter } from './routes/cities';
import { healthRouter } from './routes/health';
import { createRequestsRouter } from './routes/requests';

/**
 * `repository` is injectable so the endpoints can be exercised over real HTTP
 * against a fake, without a database running.
 */
export function createApp(
  repository: AuthRepository = createPgAuthRepository(),
  requests: RequestsRepository = createPgRequestsRepository(),
  admin: AdminRepository = createPgAdminRepository(),
  dispatch: Dispatch = (requestId) =>
    dispatchNotifications(requestId, { mailer: createMailer() }),
  // Bound to the same repository the routes use, so the token it writes is the
  // token they can find.
  sendVerification: SendVerification = createVerificationSender(repository),
): Express {
  const app = express();

  /*
   * What counts as the client's address.
   *
   * express-rate-limit keys on req.ip, and without this req.ip behind a
   * reverse proxy is the proxy — one bucket for the entire internet, so five
   * failed logins a minute would lock every user out at once. Trusting a
   * fixed number of hops rather than `true`: `true` walks the whole
   * X-Forwarded-For chain, and a client can write that header itself and
   * appear to be a new address on every request.
   *
   * Off entirely outside production, where there is no proxy and trusting
   * one would let a local request claim any address it liked.
   */
  app.set('trust proxy', env.isProduction ? env.TRUST_PROXY_HOPS : false);

  // §12: helmet, a strict CORS allow-list, and a real CSP.
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true, // the refresh token rides in an httpOnly cookie
    }),
  );

  // A blood request is a handful of short fields; nothing here needs a
  // megabyte of JSON, and a small cap is free protection.
  app.use(express.json({ limit: '32kb' }));

  // The refresh token arrives as an httpOnly cookie (§12), so it has to be
  // parsed before any route can read it.
  app.use(cookieParser());

  app.use('/api', healthRouter);
  app.use('/api', generalRateLimit);
  app.use('/api', createAuthRouter(repository, sendVerification));
  app.use('/api', createMeRouter(repository));
  app.use('/api', citiesRouter);
  app.use('/api', createRequestsRouter(repository, requests));
  app.use('/api', createAdminRouter(repository, admin, dispatch));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
