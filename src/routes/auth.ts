import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import sgMail from '@sendgrid/mail';
import type { Agent } from '../contract';
import { requireAuth, type AuthPayload } from '../middleware/auth';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SEND_TIMEOUT_MS = 8_000;

export function createAuthRouter(db: Db): Router {
  const router = Router();
  const agents = db.collection<Omit<Agent, 'id'> & { _id?: unknown }>('agents');
  const otpCodes = db.collection('otp_codes');

  // ─── POST /api/auth/request-code ─────────────────────────────────────────
  router.post('/request-code', async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Upsert agent so the record exists before sign-in
    const now = new Date().toISOString();
    await agents.updateOne(
      { email: normalizedEmail },
      {
        $setOnInsert: {
          id: crypto.randomUUID(),
          email: normalizedEmail,
          notifyOnOffer: false,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    // Generate a 6-digit code
    const code = String(Math.floor(100_000 + crypto.randomInt(900_000))).padStart(6, '0');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    // Store the code (delete any previous codes for this email first)
    await otpCodes.deleteMany({ email: normalizedEmail });
    await otpCodes.insertOne({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      code,
      expiresAt,
      createdAt: now,
    });

    // Send via SendGrid
    const apiKey = process.env.EMAIL_API_KEY;
    const fromAddress = process.env.EMAIL_FROM;
    if (!apiKey || !fromAddress) {
      res.status(500).json({ error: 'Could not send the code, please try again.' });
      return;
    }

    sgMail.setApiKey(apiKey);

    const sendWithTimeout = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('SendGrid request timed out')),
        SEND_TIMEOUT_MS
      );
      sgMail
        .send({
          to: normalizedEmail,
          from: fromAddress,
          subject: 'Your BuyerFlow sign-in code',
          text: `Your sign-in code is: ${code}\n\nThis code expires in 10 minutes.`,
          html: `<p>Your BuyerFlow sign-in code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`,
        })
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });

    try {
      await sendWithTimeout;
    } catch (err) {
      console.error('Failed to send OTP email:', (err as Error).message);
      res.status(500).json({ error: 'Could not send the code, please try again.' });
      return;
    }

    res.json({ ok: true });
  });

  // ─── POST /api/auth/verify-code ───────────────────────────────────────────
  router.post('/verify-code', async (req: Request, res: Response): Promise<void> => {
    const { email, code } = req.body as { email?: string; code?: string };
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'A valid email address is required.' });
      return;
    }
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'A verification code is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const otpRecord = await otpCodes.findOne({ email: normalizedEmail });
    if (!otpRecord) {
      res.status(400).json({ error: 'No code was requested for this email address.' });
      return;
    }

    if (new Date(otpRecord.expiresAt as string) < new Date()) {
      await otpCodes.deleteMany({ email: normalizedEmail });
      res.status(400).json({ error: 'The code has expired. Please request a new one.' });
      return;
    }

    if (otpRecord.code !== code.trim()) {
      res.status(400).json({ error: 'The code is incorrect. Please try again.' });
      return;
    }

    // Invalidate the used code
    await otpCodes.deleteMany({ email: normalizedEmail });

    // Fetch or re-fetch the agent record
    const agentDoc = await agents.findOne({ email: normalizedEmail });
    if (!agentDoc) {
      res.status(500).json({ error: 'Agent record not found. Please try again.' });
      return;
    }

    // Build the public Agent shape
    const agent: Agent = docToAgent(agentDoc);

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'Server misconfiguration: JWT secret not set.' });
      return;
    }

    const payload: AuthPayload = { agentId: agent.id, email: agent.email };
    const token = jwt.sign(payload, secret, { expiresIn: '30d' });

    res.json({ token, user: agent });
  });

  // ─── GET /api/auth/me ─────────────────────────────────────────────────────
  router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const { agentId } = req.agent!;
    const agentDoc = await agents.findOne({ id: agentId });
    if (!agentDoc) {
      res.status(404).json({ error: 'Agent not found.' });
      return;
    }
    res.json(docToAgent(agentDoc));
  });

  // ─── PATCH /api/auth/me ───────────────────────────────────────────────────
  router.patch('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const { agentId } = req.agent!;

    // Strip out fields callers must not set
    const updates = req.body as Partial<Omit<Agent, 'id' | 'createdAt'>>;
    const { ...safeUpdates } = updates;
    // Prevent overriding protected fields just in case body smuggles them
    delete (safeUpdates as Record<string, unknown>)['id'];
    delete (safeUpdates as Record<string, unknown>)['createdAt'];

    if (Object.keys(safeUpdates).length === 0) {
      res.status(400).json({ error: 'No valid fields provided to update.' });
      return;
    }

    safeUpdates.updatedAt = new Date().toISOString() as never;

    const result = await agents.findOneAndUpdate(
      { id: agentId },
      { $set: safeUpdates },
      { returnDocument: 'after' }
    );

    if (!result) {
      res.status(404).json({ error: 'Agent not found.' });
      return;
    }

    res.json(docToAgent(result));
  });

  return router;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function docToAgent(doc: Record<string, unknown>): Agent {
  return {
    id: doc['id'] as string,
    email: doc['email'] as string,
    name: doc['name'] as string | undefined,
    phone: doc['phone'] as string | undefined,
    agency: doc['agency'] as string | undefined,
    notifyOnOffer: Boolean(doc['notifyOnOffer']),
    createdAt: doc['createdAt'] as string,
  };
}
