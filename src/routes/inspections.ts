import { Router, type Request, type Response } from 'express';
import { type Db, type WithId, type Document } from 'mongodb';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';
import type { Inspection } from '../contract';

function toInspection(doc: WithId<Document>): Inspection {
  const { _id, ...rest } = doc;
  return rest as Inspection;
}

export function createInspectionsRouter(db: Db): Router {
  const router = Router();
  const col = db.collection('inspections');

  // GET /api/inspections — list all inspections for the agent, optionally filter by buyerId or propertyId
  router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const filter: Record<string, string> = { agentId };

      if (typeof req.query.buyerId === 'string' && req.query.buyerId) {
        filter.buyerId = req.query.buyerId;
      }
      if (typeof req.query.propertyId === 'string' && req.query.propertyId) {
        filter.propertyId = req.query.propertyId;
      }

      const docs = await col.find(filter).sort({ scheduledAt: 1 }).toArray();
      res.json(docs.map(toInspection));
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve inspections.' });
    }
  });

  // POST /api/inspections — schedule a new inspection
  router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const body = req.body as Omit<Inspection, 'id' | 'agentId' | 'createdAt'>;

      if (!body.buyerId || typeof body.buyerId !== 'string') {
        res.status(400).json({ error: 'buyerId is required.' });
        return;
      }
      if (!body.propertyId || typeof body.propertyId !== 'string') {
        res.status(400).json({ error: 'propertyId is required.' });
        return;
      }
      if (!body.scheduledAt || typeof body.scheduledAt !== 'string') {
        res.status(400).json({ error: 'scheduledAt is required.' });
        return;
      }
      if (!body.status || !['scheduled', 'completed', 'cancelled'].includes(body.status)) {
        res.status(400).json({ error: 'status must be one of: scheduled, completed, cancelled.' });
        return;
      }

      const now = new Date().toISOString();
      const inspection: Inspection = {
        id: randomUUID(),
        agentId,
        buyerId: body.buyerId,
        propertyId: body.propertyId,
        scheduledAt: body.scheduledAt,
        status: body.status,
        createdAt: now,
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.buyerFeedback !== undefined && { buyerFeedback: body.buyerFeedback }),
      };

      await col.insertOne({ ...inspection, _id: inspection.id as unknown as import('mongodb').ObjectId });
      res.status(201).json(inspection);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create inspection.' });
    }
  });

  // PATCH /api/inspections/:id — update an inspection
  router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;
      const body = req.body as Partial<Omit<Inspection, 'id' | 'agentId' | 'createdAt'>>;

      if (body.status !== undefined && !['scheduled', 'completed', 'cancelled'].includes(body.status)) {
        res.status(400).json({ error: 'status must be one of: scheduled, completed, cancelled.' });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (body.buyerId !== undefined) updates.buyerId = body.buyerId;
      if (body.propertyId !== undefined) updates.propertyId = body.propertyId;
      if (body.scheduledAt !== undefined) updates.scheduledAt = body.scheduledAt;
      if (body.status !== undefined) updates.status = body.status;
      if (body.notes !== undefined) updates.notes = body.notes;
      if (body.buyerFeedback !== undefined) updates.buyerFeedback = body.buyerFeedback;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'No valid fields provided for update.' });
        return;
      }

      const result = await col.findOneAndUpdate(
        { id, agentId },
        { $set: updates },
        { returnDocument: 'after' }
      );

      if (!result) {
        res.status(404).json({ error: 'Inspection not found.' });
        return;
      }

      res.json(toInspection(result));
    } catch (err) {
      res.status(500).json({ error: 'Failed to update inspection.' });
    }
  });

  // DELETE /api/inspections/:id — delete an inspection
  router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;

      const result = await col.deleteOne({ id, agentId });

      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'Inspection not found.' });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete inspection.' });
    }
  });

  return router;
}
