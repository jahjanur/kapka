import { Router } from 'express';
import { CITIES } from '@kapka/shared';

export const citiesRouter: Router = Router();

/**
 * GET /api/cities — the canonical list for the select (§4).
 *
 * Served from @kapka/shared, the same constant the web app validates against,
 * so the dropdown and the API can never disagree about what a valid city is.
 */
citiesRouter.get('/cities', (_req, res) => {
  res.json({ cities: CITIES });
});
