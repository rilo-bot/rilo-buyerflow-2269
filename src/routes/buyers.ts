import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import crypto from 'crypto';
import type { Buyer, Property } from '../contract';
import { requireAuth } from '../middleware/auth';

export function createBuyersRouter(db: Db): Router {
  const router = Router();
  const buyers = db.collection('buyers');
  const properties = db.collection('properties');

  // ─── GET /api/buyers ────────────────────────────────────────────────────────
  router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const docs = await buyers.find({ agentId }).toArray();
      res.json(docs.map(docToBuyer));
    } catch (err) {
      console.error('list-buyers error:', err);
      res.status(500).json({ error: 'Failed to retrieve buyers.' });
    }
  });

  // ─── POST /api/buyers ───────────────────────────────────────────────────────
  router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const body = req.body as Omit<Buyer, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>;

      // Required field validation
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        res.status(400).json({ error: 'Buyer name is required.' });
        return;
      }
      if (typeof body.budgetMin !== 'number' || typeof body.budgetMax !== 'number') {
        res.status(400).json({ error: 'budgetMin and budgetMax are required numbers.' });
        return;
      }
      if (!Array.isArray(body.preferredSuburbs)) {
        res.status(400).json({ error: 'preferredSuburbs must be an array.' });
        return;
      }
      if (!Array.isArray(body.propertyTypes)) {
        res.status(400).json({ error: 'propertyTypes must be an array.' });
        return;
      }
      if (!Array.isArray(body.mustHaveFeatures)) {
        res.status(400).json({ error: 'mustHaveFeatures must be an array.' });
        return;
      }
      const validStatuses = ['active', 'paused', 'settled'] as const;
      if (!body.status || !validStatuses.includes(body.status)) {
        res.status(400).json({ error: 'status must be one of: active, paused, settled.' });
        return;
      }

      const now = new Date().toISOString();
      const newBuyer: Buyer = {
        id: crypto.randomUUID(),
        agentId,
        name: body.name.trim(),
        email: body.email,
        phone: body.phone,
        budgetMin: body.budgetMin,
        budgetMax: body.budgetMax,
        preferredSuburbs: body.preferredSuburbs,
        propertyTypes: body.propertyTypes,
        bedroomsMin: body.bedroomsMin,
        bathroomsMin: body.bathroomsMin,
        mustHaveFeatures: body.mustHaveFeatures,
        status: body.status,
        notes: body.notes,
        createdAt: now,
        updatedAt: now,
      };

      await buyers.insertOne({ ...newBuyer });
      res.status(201).json(newBuyer);
    } catch (err) {
      console.error('create-buyer error:', err);
      res.status(500).json({ error: 'Failed to create buyer.' });
    }
  });

  // ─── GET /api/buyers/:id ────────────────────────────────────────────────────
  router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;

      const doc = await buyers.findOne({ id, agentId });
      if (!doc) {
        res.status(404).json({ error: 'Buyer not found.' });
        return;
      }
      res.json(docToBuyer(doc));
    } catch (err) {
      console.error('get-buyer error:', err);
      res.status(500).json({ error: 'Failed to retrieve buyer.' });
    }
  });

  // ─── PATCH /api/buyers/:id ──────────────────────────────────────────────────
  router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;
      const body = req.body as Partial<Omit<Buyer, 'id' | 'agentId' | 'createdAt'>>;

      // Sanitise — strip protected fields if caller smuggles them
      const updates: Record<string, unknown> = { ...body };
      delete updates['id'];
      delete updates['agentId'];
      delete updates['createdAt'];
      delete updates['_id'];

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'No valid fields provided to update.' });
        return;
      }

      // Validate status if provided
      if (updates['status'] !== undefined) {
        const validStatuses = ['active', 'paused', 'settled'];
        if (!validStatuses.includes(updates['status'] as string)) {
          res.status(400).json({ error: 'status must be one of: active, paused, settled.' });
          return;
        }
      }

      updates['updatedAt'] = new Date().toISOString();

      const result = await buyers.findOneAndUpdate(
        { id, agentId },
        { $set: updates },
        { returnDocument: 'after' }
      );

      if (!result) {
        res.status(404).json({ error: 'Buyer not found.' });
        return;
      }

      res.json(docToBuyer(result));
    } catch (err) {
      console.error('update-buyer error:', err);
      res.status(500).json({ error: 'Failed to update buyer.' });
    }
  });

  // ─── DELETE /api/buyers/:id ─────────────────────────────────────────────────
  router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;

      const result = await buyers.deleteOne({ id, agentId });
      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'Buyer not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('delete-buyer error:', err);
      res.status(500).json({ error: 'Failed to delete buyer.' });
    }
  });

  // ─── GET /api/properties/:id/matches ────────────────────────────────────────
  // (mounted under the buyers router but exposed via the properties path in index.ts)
  // We export a separate handler to be mounted on /api/properties in index.ts.
  // This path is registered in index.ts directly; keeping it here in this module
  // for co-location, exported as a standalone function.

  return router;
}

/**
 * Handler for GET /api/properties/:id/matches
 * Finds all active buyers for the agent whose criteria match the given property.
 */
export function createMatchesHandler(db: Db) {
  const buyers = db.collection('buyers');
  const properties = db.collection('properties');

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id: propertyId } = req.params;

      // Fetch the property — must belong to this agent
      const propDoc = await properties.findOne({ id: propertyId, agentId });
      if (!propDoc) {
        res.status(404).json({ error: 'Property not found.' });
        return;
      }

      const property = propDoc as unknown as Property;

      // Fetch all active buyers for this agent
      const activeBuyers = await buyers.find({ agentId, status: 'active' }).toArray();

      const matched = activeBuyers.filter((doc) => {
        const buyer = docToBuyer(doc);
        return buyerMatchesProperty(buyer, property);
      });

      res.json(matched.map(docToBuyer));
    } catch (err) {
      console.error('match-buyers error:', err);
      res.status(500).json({ error: 'Failed to match buyers to property.' });
    }
  };
}

// ─── Matching logic ────────────────────────────────────────────────────────────

function buyerMatchesProperty(buyer: Buyer, property: Property): boolean {
  // Budget: property price must be within buyer's budget (if price is set)
  if (property.price !== undefined) {
    if (property.price < buyer.budgetMin || property.price > buyer.budgetMax) {
      return false;
    }
  }

  // Property type: buyer's list must include the property's type
  if (
    buyer.propertyTypes.length > 0 &&
    !buyer.propertyTypes
      .map((t) => t.toLowerCase())
      .includes(property.propertyType.toLowerCase())
  ) {
    return false;
  }

  // Preferred suburbs: if buyer has a preference list, suburb must be in it
  if (
    buyer.preferredSuburbs.length > 0 &&
    !buyer.preferredSuburbs
      .map((s) => s.toLowerCase())
      .includes(property.suburb.toLowerCase())
  ) {
    return false;
  }

  // Bedrooms: property must have at least buyer's minimum
  if (buyer.bedroomsMin !== undefined && buyer.bedroomsMin > 0) {
    if (property.bedrooms === undefined || property.bedrooms < buyer.bedroomsMin) {
      return false;
    }
  }

  // Bathrooms: property must have at least buyer's minimum
  if (buyer.bathroomsMin !== undefined && buyer.bathroomsMin > 0) {
    if (property.bathrooms === undefined || property.bathrooms < buyer.bathroomsMin) {
      return false;
    }
  }

  // Must-have features: all required features must be present on the property
  if (buyer.mustHaveFeatures.length > 0) {
    const propertyFeatureLower = property.features.map((f) => f.toLowerCase());
    const allPresent = buyer.mustHaveFeatures.every((f) =>
      propertyFeatureLower.includes(f.toLowerCase())
    );
    if (!allPresent) {
      return false;
    }
  }

  return true;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function docToBuyer(doc: Record<string, unknown>): Buyer {
  return {
    id: doc['id'] as string,
    agentId: doc['agentId'] as string,
    name: doc['name'] as string,
    email: doc['email'] as string | undefined,
    phone: doc['phone'] as string | undefined,
    budgetMin: doc['budgetMin'] as number,
    budgetMax: doc['budgetMax'] as number,
    preferredSuburbs: (doc['preferredSuburbs'] as string[]) ?? [],
    propertyTypes: (doc['propertyTypes'] as string[]) ?? [],
    bedroomsMin: doc['bedroomsMin'] as number | undefined,
    bathroomsMin: doc['bathroomsMin'] as number | undefined,
    mustHaveFeatures: (doc['mustHaveFeatures'] as string[]) ?? [],
    status: doc['status'] as Buyer['status'],
    notes: doc['notes'] as string | undefined,
    createdAt: doc['createdAt'] as string,
    updatedAt: doc['updatedAt'] as string,
  };
}
