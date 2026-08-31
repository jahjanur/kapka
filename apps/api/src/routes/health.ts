import { Router } from 'express';

export const healthRouter: Router = Router();

/** GET /api/health — liveness probe (§4). Cheap, unauthenticated, no DB. */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});
