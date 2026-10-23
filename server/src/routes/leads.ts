import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { listLeads, retryWelcomeEmail, upsertLeads } from '../services/leadRepository.js';
import { addSuppressionEntry } from '../services/suppressionService.js';

const importSchema = z.object({
  rows: z.array(
    z.object({
      name: z.string().optional(),
      email: z.string().email(),
      phone: z.string().optional(),
      company: z.string().optional(),
      campaign: z.string().optional(),
      source: z.string().optional(),
      formName: z.string().optional(),
      sourceLeadStatus: z.string().optional()
    })
  ).max(5000)
});
const statusSchema = z.object({ status: z.enum(['new', 'contacted', 'qualified', 'unsubscribed']) });
const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) });

export async function registerLeadRoutes(app: FastifyInstance) {
  app.get('/v1/leads', async (req) => ({ leads: await listLeads(req.workspaceId) }));

  app.delete('/v1/leads/all', async (req, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase is not configured.' });
    try {
      // 1. Remove email jobs linked to this workspace
      await supabase.from('email_jobs').delete().eq('workspace_id', req.workspaceId);
      // 2. Remove all contacts for this workspace
      const { data, error, count } = await supabase.from('contacts').delete({ count: 'exact' }).eq('workspace_id', req.workspaceId).select('id');
      if (error) throw error;
      // 3. Reset integration sync state so re-linking a sheet imports fresh rows
      try {
        await supabase.from('integration_sync_state').update({
          last_synced_at: null,
          last_imported: 0,
          last_error: null,
          updated_at: new Date().toISOString()
        }).eq('workspace_id', req.workspaceId).eq('integration', 'google_sheets');
      } catch {
        // ignore
      }
      return { deleted: count ?? (data?.length || 0) };
    } catch (error) {
      req.log.error(error, 'Failed to clear all leads');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not delete leads.' });
    }
  });

  app.delete('/v1/leads', async (req, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase is not configured.' });
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid lead IDs for deletion.' });
    try {
      await supabase.from('email_jobs').delete().eq('workspace_id', req.workspaceId).in('contact_id', parsed.data.ids);
      const { data, error, count } = await supabase.from('contacts').delete({ count: 'exact' }).eq('workspace_id', req.workspaceId).in('id', parsed.data.ids).select('id');
      if (error) throw error;
      return { deleted: count ?? (data?.length || 0) };
    } catch (error) {
      req.log.error(error, 'Failed to delete selected leads');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not delete selected leads.' });
    }
  });

  app.patch('/v1/leads/:id/status', async (req: any, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase is not configured.' });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid lead status.' });
    if (parsed.data.status === 'unsubscribed') {
      const { data: lead, error: leadError } = await supabase.from('contacts').select('primary_email').eq('workspace_id', req.workspaceId).eq('id', req.params.id).maybeSingle();
      if (leadError) throw leadError;
      if (!lead) return reply.code(404).send({ error: 'Lead not found.' });
      try {
        await addSuppressionEntry(lead.primary_email, 'unsubscribe', req.workspaceId);
      } catch (error) {
        req.log.error({ err: error }, 'Could not suppress unsubscribed lead');
        return reply.code(503).send({ error: 'Could not add this unsubscribe to the suppression list. The lead status was not changed.' });
      }
    }
    const { data, error } = await supabase.from('contacts').update({ status: parsed.data.status, updated_at: new Date().toISOString() }).eq('workspace_id', req.workspaceId).eq('id', req.params.id).select('id,status').maybeSingle();
    if (error) throw error;
    if (!data) return reply.code(404).send({ error: 'Lead not found.' });
    return { lead: data };
  });

  app.post('/v1/leads/:id/welcome-email/retry', async (req: any, reply) => {
    try {
      return await retryWelcomeEmail(req.params.id, req.workspaceId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Could not retry welcome email.' });
    }
  });

  app.post('/v1/leads/import', async (req, reply) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid spreadsheet rows', details: parsed.error.flatten() });
    return upsertLeads(parsed.data.rows, req.workspaceId);
  });
}
