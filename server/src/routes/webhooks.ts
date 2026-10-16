import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { syncMetaLeadSheet } from '../services/sheetsSyncService.js';

const row = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  campaign: z.string().optional(),
});

export async function registerSheetWebhook(app: FastifyInstance) {
  // Webhook endpoint (for Apps Script or Zapier)
  app.post('/v1/integrations/google-sheets/sync', async (req, reply) => {
    const token = process.env.SHEETS_SYNC_TOKEN;
    if (!token || req.headers['x-sync-token'] !== token) {
      return reply.code(401).send({ error: 'Invalid sheet sync token' });
    }
    const body = z.object({ rows: z.array(row).max(5000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid sheet rows' });
    return syncMetaLeadSheet(body.data.rows, process.env.MAILBPOX_WORKSPACE_ID||'');
  });

}
