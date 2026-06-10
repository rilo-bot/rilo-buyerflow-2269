import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import crypto from 'crypto';
import type { Property } from '../contract';
import { requireAuth } from '../middleware/auth';

export function createPropertiesRouter(db: Db): Router {
  const router = Router();
  const properties = db.collection('properties');

  // ─── GET /api/properties ────────────────────────────────────────────────────
  router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const docs = await properties.find({ agentId }).toArray();
      res.json(docs.map(docToProperty));
    } catch (err) {
      console.error('list-properties error:', err);
      res.status(500).json({ error: 'Failed to retrieve properties.' });
    }
  });

  // ─── POST /api/properties ───────────────────────────────────────────────────
  router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const body = req.body as Omit<Property, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>;

      // Required field validation
      if (!body.address || typeof body.address !== 'string' || !body.address.trim()) {
        res.status(400).json({ error: 'address is required.' });
        return;
      }
      if (!body.suburb || typeof body.suburb !== 'string' || !body.suburb.trim()) {
        res.status(400).json({ error: 'suburb is required.' });
        return;
      }
      if (!body.state || typeof body.state !== 'string' || !body.state.trim()) {
        res.status(400).json({ error: 'state is required.' });
        return;
      }
      if (!body.postcode || typeof body.postcode !== 'string' || !body.postcode.trim()) {
        res.status(400).json({ error: 'postcode is required.' });
        return;
      }
      if (!body.propertyType || typeof body.propertyType !== 'string' || !body.propertyType.trim()) {
        res.status(400).json({ error: 'propertyType is required.' });
        return;
      }
      if (!Array.isArray(body.features)) {
        res.status(400).json({ error: 'features must be an array.' });
        return;
      }
      const validStatuses = ['active', 'under-offer', 'sold', 'passed-in'] as const;
      if (!body.status || !validStatuses.includes(body.status)) {
        res.status(400).json({ error: 'status must be one of: active, under-offer, sold, passed-in.' });
        return;
      }

      const now = new Date().toISOString();
      const newProperty: Property = {
        id: crypto.randomUUID(),
        agentId,
        address: body.address.trim(),
        suburb: body.suburb.trim(),
        state: body.state.trim(),
        postcode: body.postcode.trim(),
        price: body.price,
        propertyType: body.propertyType.trim(),
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        features: body.features,
        status: body.status,
        listingUrl: body.listingUrl,
        notes: body.notes,
        createdAt: now,
        updatedAt: now,
      };

      await properties.insertOne({ ...newProperty });
      res.status(201).json(newProperty);
    } catch (err) {
      console.error('create-property error:', err);
      res.status(500).json({ error: 'Failed to create property.' });
    }
  });

  // ─── GET /api/properties/:id ────────────────────────────────────────────────
  router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;

      const doc = await properties.findOne({ id, agentId });
      if (!doc) {
        res.status(404).json({ error: 'Property not found.' });
        return;
      }
      res.json(docToProperty(doc));
    } catch (err) {
      console.error('get-property error:', err);
      res.status(500).json({ error: 'Failed to retrieve property.' });
    }
  });

  // ─── PATCH /api/properties/:id ──────────────────────────────────────────────
  router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;
      const body = req.body as Partial<Omit<Property, 'id' | 'agentId' | 'createdAt'>>;

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
        const validStatuses = ['active', 'under-offer', 'sold', 'passed-in'];
        if (!validStatuses.includes(updates['status'] as string)) {
          res.status(400).json({ error: 'status must be one of: active, under-offer, sold, passed-in.' });
          return;
        }
      }

      updates['updatedAt'] = new Date().toISOString();

      const result = await properties.findOneAndUpdate(
        { id, agentId },
        { $set: updates },
        { returnDocument: 'after' }
      );

      if (!result) {
        res.status(404).json({ error: 'Property not found.' });
        return;
      }

      res.json(docToProperty(result));
    } catch (err) {
      console.error('update-property error:', err);
      res.status(500).json({ error: 'Failed to update property.' });
    }
  });

  // ─── DELETE /api/properties/:id ─────────────────────────────────────────────
  router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;

      const result = await properties.deleteOne({ id, agentId });
      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'Property not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('delete-property error:', err);
      res.status(500).json({ error: 'Failed to delete property.' });
    }
  });

  return router;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function docToProperty(doc: Record<string, unknown>): Property {
  return {
    id: doc['id'] as string,
    agentId: doc['agentId'] as string,
    address: doc['address'] as string,
    suburb: doc['suburb'] as string,
    state: doc['state'] as string,
    postcode: doc['postcode'] as string,
    price: doc['price'] as number | undefined,
    propertyType: doc['propertyType'] as string,
    bedrooms: doc['bedrooms'] as number | undefined,
    bathrooms: doc['bathrooms'] as number | undefined,
    features: (doc['features'] as string[]) ?? [],
    status: doc['status'] as Property['status'],
    listingUrl: doc['listingUrl'] as string | undefined,
    notes: doc['notes'] as string | undefined,
    createdAt: doc['createdAt'] as string,
    updatedAt: doc['updatedAt'] as string,
  };
}
