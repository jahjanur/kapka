import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { citiesRouter } from './routes/cities';
import { healthRouter } from './routes/health';
import { requestsRouter } from './routes/requests';

export function createApp(): Express {
  const app = express();

  // §12: helmet, a strict CORS allow-list, and a real CSP.
  app.use(helmet());
  app.use(cors({
    origin: env.corsOrigins,
    credentials: true,   // the refresh token rides in an httpOnly cookie
  }));

  // A blood request is a handful of short fields; nothing here needs a
  // megabyte of JSON, and a small cap is free protection.
  app.use(express.json({ limit: '32kb' }));

  app.use('/api', healthRouter);
  app.use('/api', citiesRouter);
  app.use('/api', requestsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
