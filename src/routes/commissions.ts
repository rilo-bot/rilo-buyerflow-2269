import { Router } from 'express';
import type { Db } from 'mongodb';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';
import type { Commission } from '../contract';

export function createCommissionsRouter(db: Db): Router {
  const router = Router();
  const col = () => db.collection<Omit<Commission, 'id'> & { _id: string }>('commissions');

  // Helper: map MongoDB doc → Commission (swap _id → id, drop _id)
  function toCommission(doc: Record<string, unknown>): Commission {
    const { _id, ...rest } = doc;
    return { id: _id as string, ...rest } as Commission;
  }

  // GET /api/commissions — list all commission records for the authenticated agent
  router.get('/', requireAuth, async (req, res) => {
    try {
      const agentId = req.agent!.agentId;
      const docs = await col().find({ agentId }).toArray();
      const commissions: Commission[] = docs.map((d) =>
        toCommission(d as unknown as Record<string, unknown>)
      );
      res.json(commissions);
    } catch {
      res.status(500).json({ error: 'Failed to retrieve commissions.' });
    }
  });

  // POST /api/commissions — create a new commission record
  router.post('/', requireAuth, async (req, res) => {
    try {
      const agentId = req.agent!.agentId;
      const body = req.body as Omit<Commission, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>;

      // Required field validation
      if (!body.contractId || typeof body.contractId !== 'string') {
        res.status(400).json({ error: 'contractId is required.' });
        return;
      }
      if (!body.buyerId || typeof body.buyerId !== 'string') {
        res.status(400).json({ error: 'buyerId is required.' });
        return;
      }
      if (!body.propertyId || typeof body.propertyId !== 'string') {
        res.status(400).json({ error: 'propertyId is required.' });
        return;
      }
      if (
        body.expectedAmount === undefined ||
        body.expectedAmount === null ||
        typeof body.expectedAmount !== 'number'
      ) {
        res.status(400).json({ error: 'expectedAmount is required and must be a number.' });
        return;
      }
      if (!body.status) {
        res.status(400).json({ error: 'status is required.' });
        return;
      }
      const validStatuses = ['pending', 'partial', 'received', 'overdue'];
      if (!validStatuses.includes(body.status)) {
        res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
        return;
      }

      const now = new Date().toISOString();
      const id = randomUUID();

      const doc: Record<string, unknown> = {
        _id: id,
        agentId,
        contractId: body.contractId,
        buyerId: body.buyerId,
        propertyId: body.propertyId,
        expectedAmount: body.expectedAmount,
        status: body.status,
        createdAt: now,
        updatedAt: now,
      };

      // Optional fields
      if (body.receivedAmount !== undefined) doc.receivedAmount = body.receivedAmount;
      if (body.dueDate !== undefined) doc.dueDate = body.dueDate;
      if (body.receivedDate !== undefined) doc.receivedDate = body.receivedDate;
      if (body.notes !== undefined) doc.notes = body.notes;

      await col().insertOne(doc as Parameters<ReturnType<typeof col>['insertOne']>[0]);

      res.status(201).json(toCommission(doc));
    } catch {
      res.status(500).json({ error: 'Failed to create commission.' });
    }
  });

  // PATCH /api/commissions/:id — update commission payment status or received amount
  router.patch('/:id', requireAuth, async (req, res) => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;
      const body = req.body as Partial<Omit<Commission, 'id' | 'agentId' | 'createdAt'>>;

      // Validate status if provided
      if (body.status !== undefined) {
        const validStatuses = ['pending', 'partial', 'received', 'overdue'];
        if (!validStatuses.includes(body.status)) {
          res
            .status(400)
            .json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
          return;
        }
      }

      // Validate expectedAmount if provided
      if (body.expectedAmount !== undefined && typeof body.expectedAmount !== 'number') {
        res.status(400).json({ error: 'expectedAmount must be a number.' });
        return;
      }

      // Validate receivedAmount if provided
      if (body.receivedAmount !== undefined && typeof body.receivedAmount !== 'number') {
        res.status(400).json({ error: 'receivedAmount must be a number.' });
        return;
      }

      // Strip fields that must never be overwritten by the caller
      const { updatedAt: _u, ...safeBody } = body as Record<string, unknown>;

      const updateFields: Record<string, unknown> = {
        ...safeBody,
        updatedAt: new Date().toISOString(),
      };

      const result = await col().findOneAndUpdate(
        { _id: id as unknown as string, agentId } as Record<string, unknown>,
        { $set: updateFields },
        { returnDocument: 'after' }
      );

      if (!result) {
        res.status(404).json({ error: 'Commission not found.' });
        return;
      }

      res.json(toCommission(result as unknown as Record<string, unknown>));
    } catch {
      res.status(500).json({ error: 'Failed to update commission.' });
    }
  });

  return router;
}
