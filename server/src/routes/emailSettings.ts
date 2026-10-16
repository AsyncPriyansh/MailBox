import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getEmailSettings, saveWelcomeTemplate } from '../services/emailSettings.js';

const schema = z.object({ welcomeTemplateId: z.string().uuid().nullable() });

export async function registerEmailSettingsRoutes(app: FastifyInstance) {
  app.get('/v1/settings/email', async (req, reply) => {
    try {
      return await getEmailSettings(req.workspaceId);
    } catch (error) {
      const dbError = error as { code?: string; message?: string };
      if (dbError.code === 'PGRST205' || dbError.code === '42P01') {
        return reply.code(503).send({ error: 'Welcome-email settings storage is missing. Apply migration 006_workspace_email_settings.sql, then restart the API.' });
      }
      req.log.error({ err: error }, 'Could not load email settings');
      return reply.code(503).send({ error: 'Could not load welcome-email settings. Check the API and database connection.' });
    }
  });
  app.put('/v1/settings/email', async (req, reply) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Select a valid welcome email template.' });
    try {
      return await saveWelcomeTemplate(req.workspaceId, parsed.data.welcomeTemplateId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not save email settings.' });
    }
  });
}
