import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest { workspaceId: string; userId: string; userEmail: string }
}

export async function requireWorkspace(request: FastifyRequest, reply: FastifyReply) {
  const workspaceId=process.env.MAILBPOX_WORKSPACE_ID;
  if(!workspaceId)return reply.code(503).send({error:'Set MAILBPOX_WORKSPACE_ID to the client workspace UUID.'});
  request.workspaceId=workspaceId;
  request.userId='single-client';
  request.userEmail='';
}
