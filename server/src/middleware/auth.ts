import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from '../routes/auth.js';

declare module 'fastify' {
  interface FastifyRequest { workspaceId: string; userId: string; userEmail: string }
}

export async function requireWorkspace(request: FastifyRequest, reply: FastifyReply) {
  const workspaceId = process.env.MAILBPOX_WORKSPACE_ID;
  if (!workspaceId) return reply.code(503).send({ error: 'Set MAILBPOX_WORKSPACE_ID to the client workspace UUID.' });

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return reply.code(401).send({ error: 'Session expired or invalid. Please log in again.' });
  }

  request.workspaceId = workspaceId;
  request.userId = payload.email;
  request.userEmail = payload.email;
}

