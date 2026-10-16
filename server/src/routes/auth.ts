import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || 'mailbox-jwt-secret-key-32chars-minimum-prod';

export function signToken(payload: { email: string; role: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): { email: string; role: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest('base64url');
    if (expected !== signature) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/v1/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = (req.body as any) || {};
    const configuredEmail = (process.env.ADMIN_EMAIL || 'admin@metabullmedia.com').trim().toLowerCase();
    const configuredPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required.' });
    }

    if (email.trim().toLowerCase() !== configuredEmail || password !== configuredPassword) {
      return reply.code(401).send({ error: 'Invalid email or password.' });
    }

    const token = signToken({ email: configuredEmail, role: 'admin' });
    return {
      token,
      user: {
        email: configuredEmail,
        name: process.env.ADMIN_NAME || 'Metabull Media'
      }
    };
  });

  app.get('/v1/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return reply.code(401).send({ error: 'Session expired or invalid. Please log in again.' });
    }
    return {
      user: {
        email: decoded.email,
        name: process.env.ADMIN_NAME || 'Metabull Media'
      }
    };
  });
}
