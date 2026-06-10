import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  agentId: string;
  email: string;
}

// Extend Express Request so downstream handlers can access req.agent
declare global {
  namespace Express {
    interface Request {
      agent?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header.' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration: JWT secret not set.' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;
    req.agent = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token is invalid or has expired.' });
  }
}
