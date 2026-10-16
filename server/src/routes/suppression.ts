import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addSuppressionEntry, listSuppressionEntries, removeSuppressionEntry } from '../services/suppressionService.js';
import { addZeptoSuppression, removeZeptoSuppression, syncZeptoSuppressions } from '../services/zeptomailSuppressions.js';

const createSchema = z.object({
  email: z.string().trim().email().max(320),
  reason: z.enum(['manual', 'unsubscribe', 'bounce', 'complaint']).default('manual'),
});

export async function registerSuppressionRoutes(app: FastifyInstance) {
  app.get('/v1/suppression', async (req, reply) => {
    try {
      let providerSync: { configured: boolean; synced: number; message?: string } = { configured: false, synced: 0 };
      let providerError: string | undefined;
      try { providerSync = await syncZeptoSuppressions(req.workspaceId); }
      catch (error) {
        providerError = error instanceof Error ? error.message : 'ZeptoMail suppression sync failed.';
        req.log.warn({ err: error }, 'ZeptoMail suppression sync failed; returning the local list');
      }
      return { entries: await listSuppressionEntries(req.workspaceId), source: providerSync.configured ? 'zeptomail+local' : 'local', providerSync, providerError };
    } catch (error) {
      const dbError = error as { code?: string };
      if (dbError.code === 'PGRST205' || dbError.code === '42P01') {
        return reply.code(503).send({ error: 'Suppression list storage is missing. Apply the database schema migration, then retry.' });
      }
      req.log.error({ err: error }, 'Could not load suppression list');
      return reply.code(503).send({ error: 'Could not load the suppression list.' });
    }
  });

  app.post('/v1/suppression', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter a valid email address and suppression reason.' });
    try {
      const entry = await addSuppressionEntry(parsed.data.email, parsed.data.reason, req.workspaceId);
      try {
        const provider = await addZeptoSuppression(entry.email, entry.reason);
        return { entry, syncedToZepto: provider.configured, providerSyncError: provider.configured ? null : provider.message || 'ZeptoMail agent sync is not configured.' };
      } catch (error) {
        req.log.warn({ err: error }, 'Suppression saved locally but not synced to ZeptoMail');
        return { entry, syncedToZepto: false, providerSyncError: error instanceof Error ? error.message : 'ZeptoMail sync failed.' };
      }
    } catch (error) {
      req.log.error({ err: error }, 'Could not add suppression entry');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not add this address.' });
    }
  });

  app.delete('/v1/suppression/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!z.string().uuid().safeParse(id).success) return reply.code(400).send({ error: 'Invalid suppression entry.' });
    try {
      const current = (await listSuppressionEntries(req.workspaceId)).find(entry => entry.id === id);
      if (!current) return reply.code(404).send({ error: 'Suppression entry not found.' });
      let syncedToZepto = false;
      let providerSyncMessage: string | undefined;
      try {
        const provider = await removeZeptoSuppression(current.email);
        syncedToZepto = provider.configured;
        providerSyncMessage = provider.message;
      }
      catch (error) {
        req.log.error({ err: error }, 'Could not remove suppression from ZeptoMail; local entry was retained');
        return reply.code(502).send({ error: error instanceof Error ? error.message : 'Could not remove this address from ZeptoMail.' });
      }
      const removed = await removeSuppressionEntry(id, req.workspaceId);
      return removed ? { removed: true, syncedToZepto, providerSyncMessage } : reply.code(404).send({ error: 'Suppression entry not found.' });
    } catch (error) {
      req.log.error({ err: error }, 'Could not remove suppression entry');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not remove this address.' });
    }
  });
}
