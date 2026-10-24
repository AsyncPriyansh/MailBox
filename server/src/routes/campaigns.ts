import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { queueCampaign } from '../services/campaignService.js';

const schema = z.object({
  name: z.string().min(1).max(160),
  subject: z.string().min(1).max(250),
  html: z.string().min(1).max(500000),
  leadIds: z.array(z.string().uuid()).min(1).max(10000),
  audienceStatus: z.enum(['new', 'contacted', 'qualified', 'all', 'selected']).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  templateId: z.string().uuid().optional().nullable()
});

export async function registerCampaignRoutes(app: FastifyInstance) {
  app.get('/v1/campaigns', async (req) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase
      .from('campaigns')
      .select('id,name,subject,html_source,template_id,status,recipient_count,sent_count,scheduled_at,created_at')
      .eq('workspace_id', req.workspaceId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return { campaigns: data || [] };
  });

  app.get('/v1/campaigns/:id/recipients', async (req: any, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase is not configured.' });
    const { id } = req.params;
    const workspace = req.workspaceId;

    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .select('id, name, subject, html_source, template_id, status, recipient_count, sent_count, created_at, scheduled_at')
      .eq('id', id)
      .eq('workspace_id', workspace)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found.' });

    let htmlSource = campaign.html_source;
    if (!htmlSource && campaign.template_id) {
      try {
        const { data: tmpl } = await supabase
          .from('email_templates')
          .select('html_source')
          .eq('id', campaign.template_id)
          .maybeSingle();
        if (tmpl?.html_source) htmlSource = tmpl.html_source;
      } catch {
        // ignore fallback errors
      }
    }

    // Fetch jobs for this campaign
    const { data: jobs, error: jErr } = await supabase
      .from('email_jobs')
      .select('id, contact_id, status, idempotency_key, created_at, provider_message_id, last_error')
      .eq('campaign_id', id)
      .eq('workspace_id', workspace)
      .limit(5000);
    if (jErr) throw jErr;

    // Fetch events for this campaign
    const { data: events, error: eErr } = await supabase
      .from('email_events')
      .select('id, email, event_type, event_data, occurred_at')
      .eq('campaign_id', id)
      .eq('workspace_id', workspace)
      .limit(5000);
    if (eErr) throw eErr;

    const eventsByEmail = new Map<string, any>();
    for (const ev of events || []) {
      if (ev.email && !eventsByEmail.has(String(ev.email).toLowerCase())) {
        eventsByEmail.set(String(ev.email).toLowerCase(), ev);
      }
    }

    const jobsByEmail = new Map<string, any>();
    const contactIds = new Set<string>();
    for (const job of jobs || []) {
      if (job.contact_id) contactIds.add(job.contact_id);
      let email = null;
      if (job.idempotency_key && job.idempotency_key.includes(':')) {
        email = job.idempotency_key.substring(job.idempotency_key.indexOf(':') + 1).toLowerCase().trim();
      }
      if (email && !jobsByEmail.has(email)) {
        jobsByEmail.set(email, job);
      }
    }

    const contactsMap = new Map<string, any>();
    if (contactIds.size > 0) {
      const idsArray = Array.from(contactIds);
      for (let i = 0; i < idsArray.length; i += 500) {
        const chunk = idsArray.slice(i, i + 500);
        const { data: contactsData } = await supabase
          .from('contacts')
          .select('id, primary_email, full_name, primary_phone, company')
          .in('id', chunk);
        for (const c of contactsData || []) {
          contactsMap.set(c.id, c);
          if (c.primary_email) {
            const cEmail = String(c.primary_email).toLowerCase().trim();
            contactsMap.set(cEmail, c);
            // If job didn't have an email in key, map it by contact email
            for (const job of jobs || []) {
              if (job.contact_id === c.id && !jobsByEmail.has(cEmail)) {
                jobsByEmail.set(cEmail, job);
              }
            }
          }
        }
      }
    }

    const allEmails = new Set<string>([
      ...Array.from(eventsByEmail.keys()),
      ...Array.from(jobsByEmail.keys())
    ]);

    const recipients = Array.from(allEmails).map(email => {
      const ev = eventsByEmail.get(email);
      const job = jobsByEmail.get(email);
      const contact = contactsMap.get(email) || (job?.contact_id ? contactsMap.get(job.contact_id) : null);

      let status = 'delivered';
      if (job?.status) status = job.status;
      else if (ev?.event_type === 'sent') status = 'delivered';
      else if (ev?.event_type) status = ev.event_type;

      return {
        email,
        name: contact?.full_name || '',
        phone: contact?.primary_phone || '',
        company: contact?.company || '',
        status: status === 'completed' || status === 'sent' ? 'delivered' : status,
        sentAt: ev?.occurred_at || job?.created_at || campaign.created_at,
        error: job?.last_error || null
      };
    });

    recipients.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

    return {
      campaignId: id,
      total: recipients.length,
      recipients,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        html_source: htmlSource || null,
        template_id: campaign.template_id || null,
        status: campaign.status,
        recipient_count: campaign.recipient_count,
        sent_count: campaign.sent_count,
        scheduled_at: campaign.scheduled_at,
        created_at: campaign.created_at
      }
    };
  });

  app.get('/v1/welcome-emails', async (req) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const workspace = req.workspaceId;
    const { data, count, error } = await supabase
      .from('email_events')
      .select('id, email, event_type, event_data, occurred_at', { count: 'exact' })
      .eq('workspace_id', workspace)
      .is('campaign_id', null)
      .eq('event_type', 'sent')
      .order('occurred_at', { ascending: false })
      .limit(500);

    if (error) throw error;
    return {
      total: count || 0,
      records: (data || []).map((r: any) => ({
        id: r.id,
        email: r.email,
        status: r.event_type === 'sent' ? 'delivered' : r.event_type,
        sentAt: r.occurred_at,
        provider: r.event_data?.provider || 'zeptomail',
        messageId: r.event_data?.messageId || null,
        subject: r.event_data?.subject || 'Lead Welcome & Follow-up'
      }))
    };
  });

  app.post('/v1/campaigns', async (req, reply) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid campaign', details: parsed.error.flatten() });
    try {
      return await queueCampaign(parsed.data, req.workspaceId);
    } catch (e) {
      const error = e as { message?: unknown; code?: unknown };
      const message = typeof error?.message === 'string' ? error.message : 'Unable to queue campaign';
      req.log.error({ err: e, code: error?.code }, 'Campaign queueing failed');
      return reply.code(400).send({ error: message, code: typeof error?.code === 'string' ? error.code : undefined });
    }
  });

  app.get('/v1/dashboard/stats', async (req) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const workspace = req.workspaceId;
    const [all, newLeads, contacted, campaigns, welcomeEvents] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace).eq('status', 'new'),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace).eq('status', 'contacted'),
      supabase.from('campaigns').select('id,name,subject,status,recipient_count,sent_count,scheduled_at,created_at').eq('workspace_id', workspace).order('created_at', { ascending: false }).limit(5),
      supabase.from('email_events').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace).is('campaign_id', null).eq('event_type', 'sent')
    ]);
    for (const result of [all, newLeads, contacted, campaigns, welcomeEvents]) {
      if (result.error) throw result.error;
    }
    return {
      stats: {
        totalLeads: all.count || 0,
        newLeads: newLeads.count || 0,
        contactedLeads: contacted.count || 0,
        welcomeEmailsSent: welcomeEvents.count || 0
      },
      recentCampaigns: campaigns.data || []
    };
  });
}

