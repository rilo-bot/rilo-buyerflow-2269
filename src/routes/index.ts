import type { Express } from 'express';
import type { Db } from 'mongodb';
import { createAuthRouter } from './auth';
import { createBuyersRouter, createMatchesHandler } from './buyers';
import { createPropertiesRouter } from './properties';
import { createInspectionsRouter } from './inspections';
import { createOffersRouter } from './offers';
import { createContractsRouter } from './contracts';
import { createCommissionsRouter } from './commissions';
import { createDashboardRouter } from './dashboard';
import { requireAuth } from '../middleware/auth';

/**
 * Register every API route here.
 *
 * Create route modules under src/ (e.g. src/routes/tasks.ts) and call them from
 * this function. `db` is the connected MongoDB database (native driver) —
 * use `db.collection('name')` directly; there are NO schemas or models.
 *
 * The shared API contract lives in ./contract (engine-owned — DO NOT edit it).
 * Import its types so your request/response shapes match the frontend exactly.
 */
export function registerRoutes(app: Express, db: Db): void {
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/buyers', createBuyersRouter(db));

  // GET /api/properties/:id/matches — must be registered BEFORE the properties
  // CRUD router so that Express matches this specific path first.
  app.get('/api/properties/:id/matches', requireAuth, createMatchesHandler(db));

  // Properties CRUD — GET/POST /api/properties, GET/PATCH/DELETE /api/properties/:id
  app.use('/api/properties', createPropertiesRouter(db));

  // Inspections CRUD — GET/POST /api/inspections, PATCH/DELETE /api/inspections/:id
  app.use('/api/inspections', createInspectionsRouter(db));

  // Offers CRUD — GET/POST /api/offers, GET/PATCH /api/offers/:id
  app.use('/api/offers', createOffersRouter(db));

  // Contracts CRUD — GET/POST /api/contracts, GET/PATCH /api/contracts/:id
  app.use('/api/contracts', createContractsRouter(db));

  // Commissions CRUD — GET/POST /api/commissions, PATCH /api/commissions/:id
  app.use('/api/commissions', createCommissionsRouter(db));

  // Dashboard stats — GET /api/dashboard/stats
  app.use('/api/dashboard', createDashboardRouter(db));
}
