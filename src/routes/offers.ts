import { Router, type Request, type Response } from 'express';
import { type Db, type WithId, type Document } from 'mongodb';
import { randomUUID } from 'crypto';
import sgMail from '@sendgrid/mail';
import { requireAuth } from '../middleware/auth';
import type { Offer, Agent } from '../contract';

function toOffer(doc: WithId<Document>): Offer {
  const { _id, ...rest } = doc;
  return rest as Offer;
}

const VALID_STATUSES: Offer['status'][] = [
  'submitted',
  'countered',
  'accepted',
  'rejected',
  'withdrawn',
];

/**
 * Sends an email notification to the agent when an offer's status changes.
 * Uses SendGrid with a short timeout enforced via Promise.race.
 */
async function sendOfferStatusEmail(
  agentEmail: string,
  agentName: string | undefined,
  offer: Offer,
): Promise<void> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    // Misconfiguration — log a warning but don't crash the request
    console.warn('SendGrid env vars not set; skipping offer status notification.');
    return;
  }

  sgMail.setApiKey(apiKey);

  const greeting = agentName ? `Hi ${agentName}` : 'Hi there';
  const subject = `Offer status updated: ${offer.status.toUpperCase()}`;
  const text = [
    `${greeting},`,
    '',
    `An offer on property ${offer.propertyId} has been updated.`,
    '',
    `  Offer ID:   ${offer.id}`,
    `  Buyer ID:   ${offer.buyerId}`,
    `  Amount:     $${offer.amount.toLocaleString()}`,
    `  New status: ${offer.status}`,
    offer.notes ? `  Notes:      ${offer.notes}` : null,
    '',
    'Log in to BuyerFlow to view full details.',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const sendPromise = sgMail.send({ to: agentEmail, from, subject, text });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('SendGrid request timed out')), 5000),
  );

  await Promise.race([sendPromise, timeout]);
}

export function createOffersRouter(db: Db): Router {
  const router = Router();
  const offersCol = db.collection('offers');
  const agentsCol = db.collection('agents');

  // GET /api/offers — list all offers for the authenticated agent
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

      const docs = await offersCol.find(filter).sort({ createdAt: -1 }).toArray();
      res.json(docs.map(toOffer));
    } catch {
      res.status(500).json({ error: 'Failed to retrieve offers.' });
    }
  });

  // POST /api/offers — submit a new offer
  router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const body = req.body as Omit<Offer, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>;

      if (!body.buyerId || typeof body.buyerId !== 'string') {
        res.status(400).json({ error: 'buyerId is required.' });
        return;
      }
      if (!body.propertyId || typeof body.propertyId !== 'string') {
        res.status(400).json({ error: 'propertyId is required.' });
        return;
      }
      if (body.amount === undefined || typeof body.amount !== 'number' || body.amount <= 0) {
        res.status(400).json({ error: 'amount must be a positive number.' });
        return;
      }
      if (!body.status || !VALID_STATUSES.includes(body.status)) {
        res.status(400).json({
          error: `status must be one of: ${VALID_STATUSES.join(', ')}.`,
        });
        return;
      }
      if (!Array.isArray(body.conditions)) {
        res.status(400).json({ error: 'conditions must be an array.' });
        return;
      }

      const now = new Date().toISOString();
      const offer: Offer = {
        id: randomUUID(),
        agentId,
        buyerId: body.buyerId,
        propertyId: body.propertyId,
        amount: body.amount,
        status: body.status,
        conditions: body.conditions,
        createdAt: now,
        updatedAt: now,
        ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt }),
        ...(body.notes !== undefined && { notes: body.notes }),
      };

      await offersCol.insertOne({
        ...offer,
        _id: offer.id as unknown as import('mongodb').ObjectId,
      });
      res.status(201).json(offer);
    } catch {
      res.status(500).json({ error: 'Failed to create offer.' });
    }
  });

  // GET /api/offers/:id — get a single offer by ID
  router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;

      const doc = await offersCol.findOne({ id, agentId });
      if (!doc) {
        res.status(404).json({ error: 'Offer not found.' });
        return;
      }

      res.json(toOffer(doc));
    } catch {
      res.status(500).json({ error: 'Failed to retrieve offer.' });
    }
  });

  // PATCH /api/offers/:id — update offer status or details; emails agent on status change
  router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = req.agent!.agentId;
      const { id } = req.params;
      const body = req.body as Partial<Omit<Offer, 'id' | 'agentId' | 'createdAt'>>;

      if (
        body.status !== undefined &&
        !VALID_STATUSES.includes(body.status)
      ) {
        res.status(400).json({
          error: `status must be one of: ${VALID_STATUSES.join(', ')}.`,
        });
        return;
      }

      if (
        body.amount !== undefined &&
        (typeof body.amount !== 'number' || body.amount <= 0)
      ) {
        res.status(400).json({ error: 'amount must be a positive number.' });
        return;
      }

      if (body.conditions !== undefined && !Array.isArray(body.conditions)) {
        res.status(400).json({ error: 'conditions must be an array.' });
        return;
      }

      // Fetch the current offer first so we can detect a status change
      const existing = await offersCol.findOne({ id, agentId });
      if (!existing) {
        res.status(404).json({ error: 'Offer not found.' });
        return;
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (body.buyerId !== undefined) updates.buyerId = body.buyerId;
      if (body.propertyId !== undefined) updates.propertyId = body.propertyId;
      if (body.amount !== undefined) updates.amount = body.amount;
      if (body.status !== undefined) updates.status = body.status;
      if (body.conditions !== undefined) updates.conditions = body.conditions;
      if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt;
      if (body.notes !== undefined) updates.notes = body.notes;

      const result = await offersCol.findOneAndUpdate(
        { id, agentId },
        { $set: updates },
        { returnDocument: 'after' },
      );

      if (!result) {
        res.status(404).json({ error: 'Offer not found.' });
        return;
      }

      const updatedOffer = toOffer(result);

      // Fire email notification if status changed and agent has alerts enabled
      const statusChanged =
        body.status !== undefined && body.status !== existing.status;

      if (statusChanged) {
        try {
          const agentDoc = await agentsCol.findOne({ id: agentId });
          if (agentDoc && (agentDoc as unknown as Agent).notifyOnOffer) {
            await sendOfferStatusEmail(
              (agentDoc as unknown as Agent).email,
              (agentDoc as unknown as Agent).name,
              updatedOffer,
            );
          }
        } catch (emailErr) {
          // Email failure must not break the API response — log and continue
          console.error('Offer status email notification failed:', emailErr);
        }
      }

      res.json(updatedOffer);
    } catch {
      res.status(500).json({ error: 'Failed to update offer.' });
    }
  });

  return router;
}
