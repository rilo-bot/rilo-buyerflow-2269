import { Router } from 'express';
import type { Db } from 'mongodb';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';
import type { Contract } from '../contract';

export function createContractsRouter(db: Db): Router {
  const router = Router();
  const col = () => db.collection<Omit<Contract, 'id'> & { _id: string }>('contracts');

  // Helper: map MongoDB doc → Contract (swap _id → id, drop _id)
  function toContract(doc: Record<string, unknown>): Contract {
    const { _id, ...rest } = doc;
    return { id: _id as string, ...rest } as Contract;
  }

  // GET /api/contracts — list all contracts for the authenticated agent
  router.get('/', requireAuth, async (req, res) => {
    try {
      const agentId = req.agent!.agentId;
      const docs = await col().find({ agentId }).toArray();
      const contracts: Contract[] = docs.map((d) => toContract(d as unknown as Record<string, unknown>));
      res.json(contracts);
    } catch {
      res.status(500).json({ error: 'Failed to retrieve contracts.' });
    }
  });

  // POST /api/contracts — create a new contract
  router.post('/', requireAuth, async (req, res) => {
    try {
      const agentId = req.agent!.agentId;
      const body = req.body as Omit<Contract, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>;

      // Required field validation
      if (!body.offerId || typeof body.offerId !== 'string') {
        res.status(400).json({ error: 'offerId is required.' });
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
      if (!body.status) {
        res.status(400).json({ error: 'status is required.' });
        return;
      }
      const validStatuses = ['exchanged', 'unconditional', 'settled', 'fallen-over'];
      if (!validStatuses.includes(body.status)) {
        res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
        return;
      }
      if (body.purchasePrice === undefined || body.purchasePrice === null || typeof body.purchasePrice !== 'number') {
        res.status(400).json({ error: 'purchasePrice is required and must be a number.' });
        return;
      }

      const now = new Date().toISOString();
      const id = randomUUID();

      const doc: Record<string, unknown> = {
        _id: id,
        agentId,
        offerId: body.offerId,
        buyerId: body.buyerId,
        propertyId: body.propertyId,
        status: body.status,
        purchasePrice: body.purchasePrice,
        createdAt: now,
        updatedAt: now,
      };

      // Optional fields
      if (body.exchangeDate !== undefined) doc.exchangeDate = body.exchangeDate;
      if (body.financeDate !== undefined) doc.financeDate = body.financeDate;
      if (body.buildingInspectionDate !== undefined) doc.buildingInspectionDate = body.buildingInspectionDate;
      if (body.settlementDate !== undefined) doc.settlementDate = body.settlementDate;
      if (body.notes !== undefined) doc.notes = body.notes;

      await col().insertOne(doc as Parameters<ReturnType<typeof col>['insertOne']>[0]);

      res.status(201).json(toContract(doc));
    } catch {
      res.status(500).json({ error: 'Failed to create contract.' });
    }
  });

  // GET /api/contracts/:id — get a single contract
  router.get('/:id', requireAuth, async (req, res) => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;

      const doc = await col().findOne({ _id: id as unknown as string, agentId } as Record<string, unknown>);
      if (!doc) {
        res.status(404).json({ error: 'Contract not found.' });
        return;
      }

      res.json(toContract(doc as unknown as Record<string, unknown>));
    } catch {
      res.status(500).json({ error: 'Failed to retrieve contract.' });
    }
  });

  // PATCH /api/contracts/:id — update contract milestone dates or status
  router.patch('/:id', requireAuth, async (req, res) => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;
      const body = req.body as Partial<Omit<Contract, 'id' | 'agentId' | 'createdAt'>>;

      // Validate status if provided
      if (body.status !== undefined) {
        const validStatuses = ['exchanged', 'unconditional', 'settled', 'fallen-over'];
        if (!validStatuses.includes(body.status)) {
          res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}.` });
          return;
        }
      }

      // Validate purchasePrice if provided
      if (body.purchasePrice !== undefined && typeof body.purchasePrice !== 'number') {
        res.status(400).json({ error: 'purchasePrice must be a number.' });
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
        res.status(404).json({ error: 'Contract not found.' });
        return;
      }

      res.json(toContract(result as unknown as Record<string, unknown>));
    } catch {
      res.status(500).json({ error: 'Failed to update contract.' });
    }
  });

  return router;
}
