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
      // 1. Record tombstone for all deleted contacts to avoid background re-import (paginated to handle >1000 contacts)
      const contactsToDelete: Array<{ primary_email: string }> = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error: fetchErr } = await supabase
          .from('contacts')
          .select('primary_email')
          .eq('workspace_id', req.workspaceId)
          .range(from, from + pageSize - 1);
        if (fetchErr) throw fetchErr;
        if (data) contactsToDelete.push(...data);
        if (!data || data.length < pageSize) break;
      }

      if (contactsToDelete.length > 0) {
        const events = contactsToDelete
          .filter(c => Boolean(c.primary_email))
          .map(c => ({
            workspace_id: req.workspaceId,
            campaign_id: null,
            email: String(c.primary_email).trim().toLowerCase(),
            event_type: 'lead_deleted',
            event_data: { deleted_at: new Date().toISOString() }
          }));
        for (let i = 0; i < events.length; i += 500) {
          const { error: insertErr } = await supabase.from('email_events').insert(events.slice(i, i + 500));
          if (insertErr) req.log.error(insertErr, 'Failed recording lead_deleted events in bulk');
        }
      }

      // 2. Remove email jobs linked to this workspace
      await supabase.from('email_jobs').delete().eq('workspace_id', req.workspaceId);
      // 3. Remove all contacts for this workspace
      const { data, error, count } = await supabase.from('contacts').delete({ count: 'exact' }).eq('workspace_id', req.workspaceId).select('id');
      if (error) throw error;
      // 4. Reset integration sync state so re-linking a sheet imports fresh rows
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
      // 1. Record tombstone for deleted contacts in chunks to avoid URL size/limit issues
      const contactsToDelete: Array<{ primary_email: string }> = [];
      const chunkSize = 500;
      for (let i = 0; i < parsed.data.ids.length; i += chunkSize) {
        const chunk = parsed.data.ids.slice(i, i + chunkSize);
        const { data, error: fetchErr } = await supabase
          .from('contacts')
          .select('primary_email')
          .eq('workspace_id', req.workspaceId)
          .in('id', chunk);
        if (fetchErr) throw fetchErr;
        if (data) contactsToDelete.push(...data);
      }

      if (contactsToDelete.length > 0) {
        const events = contactsToDelete
          .filter(c => Boolean(c.primary_email))
          .map(c => ({
            workspace_id: req.workspaceId,
            campaign_id: null,
            email: String(c.primary_email).trim().toLowerCase(),
            event_type: 'lead_deleted',
            event_data: { deleted_at: new Date().toISOString() }
          }));
        for (let i = 0; i < events.length; i += 500) {
          const { error: insertErr } = await supabase.from('email_events').insert(events.slice(i, i + 500));
          if (insertErr) req.log.error(insertErr, 'Failed recording lead_deleted events');
        }
      }

      // 2. Remove associated email jobs in chunks
      for (let i = 0; i < parsed.data.ids.length; i += chunkSize) {
        const chunk = parsed.data.ids.slice(i, i + chunkSize);
        await supabase.from('email_jobs').delete().eq('workspace_id', req.workspaceId).in('contact_id', chunk);
      }

      // 3. Delete contacts in chunks
      let totalDeleted = 0;
      for (let i = 0; i < parsed.data.ids.length; i += chunkSize) {
        const chunk = parsed.data.ids.slice(i, i + chunkSize);
        const { data, error, count } = await supabase.from('contacts').delete({ count: 'exact' }).eq('workspace_id', req.workspaceId).in('id', chunk).select('id');
        if (error) throw error;
        totalDeleted += count ?? (data?.length || 0);
      }
      return { deleted: totalDeleted };
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
