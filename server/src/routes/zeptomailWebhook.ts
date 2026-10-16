import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { addSuppressionEntry } from '../services/suppressionService.js';
import { addZeptoSuppression } from '../services/zeptomailSuppressions.js';
import { supabase } from '../supabase.js';

type NormalizedEvent = {
  status: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed' | 'deferred';
  bounceType?: string | null;
  emails: string[];
  messageId: string | null;
  raw: unknown;
};

const asArray = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
const text = (value: any): string => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);

function extractAddresses(value: any): string[] {
  if (typeof value === 'string') return value.includes('@') ? [value] : [];
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(extractAddresses);
  if (typeof value === 'object') return [value.email, value.recipient, value.address, value.email_address?.address,
    value.emailAddress?.address, value.email_address, value.emailAddress].flatMap(extractAddresses);
  return [];
}

function extractEmails(event: any): string[] {
  const values = [event.contact_email, event.recipient_email, event.recipient, event.email, event.to,
    event.email_address, event.emailAddress];
  for (const message of asArray(event.event_message)) {
    const info = message?.email_info || message?.emailInfo || {};
    values.push(info.to);
  }
  for (const item of asArray(event.data)) values.push(item.contact_email, item.email, item.recipient_email, item.recipient, item.to);
  return [...new Set(values.flatMap(extractAddresses).map(email => email.trim().toLowerCase()).filter(email => /^\S+@\S+\.\S+$/.test(email)))];
}

function normalize(payload: any): NormalizedEvent[] {
  const rootEvents = Array.isArray(payload?.events) ? payload.events : [payload];
  return rootEvents.flatMap((event: any) => {
    const action = [event?.event_type, event?.event, event?.event_name, event?.action, event?.actionType,
      event?.bounce_type, event?.bounceType, ...asArray(event?.event_message).map(message => message?.event_data)]
      .map(text).join(' ').toLowerCase();
    const status: NormalizedEvent['status'] = /complaint|spam|feedback.?loop|fbl.?compliant/.test(action) ? 'complained'
      : /bounce/.test(action) ? 'bounced'
      : /open/.test(action) ? 'opened'
      : /click/.test(action) ? 'clicked'
      : /defer/.test(action) ? 'deferred'
      : /fail/.test(action) ? 'failed' : 'delivered';
    const details = Array.isArray(event?.data) ? event.data : [event];
    return details.map((detail: any) => {
      const combined = { ...event, ...detail, data: undefined };
      const message = asArray(combined.event_message)[0] || {};
      const info = message.email_info || message.emailInfo || {};
      return {
        status,
        bounceType: combined.bounce_type || combined.bounceType || event?.actionType || null,
        emails: extractEmails(combined),
        messageId: String(combined.message_id || combined.messageId || combined.request_id || message.request_id || info.email_reference || info.client_reference || '').trim() || null,
        raw: combined,
      };
    });
  });
}

function validToken(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function registerZeptoMailWebhook(app: FastifyInstance) {
  // Zoho's Verify button checks that the callback URL responds with HTTP 200.
  // Keep this read-only probe open; event delivery remains token-protected below.
  app.get('/v1/webhooks/zeptomail', async () => ({ status: 'ready', provider: 'zeptomail' }));

  app.post('/v1/webhooks/zeptomail', async (req, reply) => {
    const expectedToken = process.env.ZEPTOMAIL_WEBHOOK_TOKEN;
    if (!expectedToken) return reply.code(503).send({ error: 'ZeptoMail webhook token is not configured.' });
    if (!validToken(req.headers['x-zeptomail-webhook-token'] as string | undefined, expectedToken)) {
      return reply.code(401).send({ error: 'Invalid webhook token.' });
    }
    if (!supabase) return reply.code(503).send({ error: 'Supabase is not configured.' });
    const workspaceId = process.env.MAILBPOX_WORKSPACE_ID;
    if (!workspaceId) return reply.code(503).send({ error: 'Workspace is not configured.' });

    const payload = (req.body || {}) as any;
    try {
      const { data: log, error } = await supabase.from('webhook_logs').insert({
        workspace_id: workspaceId, provider: 'zeptomail', raw_payload: payload, signature_valid: true, processed: false,
      }).select('id').single();
      if (error) throw error;
      (req as any).zeptoWebhookLogId = log.id;
    } catch (error) {
      req.log.error({ err: error }, 'Could not persist ZeptoMail webhook payload');
      return reply.code(503).send({ error: 'Could not record this delivery event. Apply the webhook log migration and retry.' });
    }

    let processed = 0;
    for (const event of normalize(payload)) {
      if (!event.emails.length) continue;
      for (const email of event.emails) {
        if (event.status === 'complained' && !email.endsWith('@zylker.com')) {
          await addSuppressionEntry(email, 'complaint', workspaceId);
          // Provider mirroring is best-effort; the local block is already active.
          try { await addZeptoSuppression(email, 'complaint'); }
          catch (error) { req.log.warn({ err: error, email }, 'Complaint blocked locally but could not sync to ZeptoMail'); }
        }

        let job: { id: string; campaign_id: string | null; contact_id: string | null } | null = null;
        if (event.messageId) {
          const matched = await supabase.from('email_jobs').select('id,campaign_id,contact_id')
            .eq('workspace_id', workspaceId).eq('provider_message_id', event.messageId).maybeSingle();
          if (matched.error) throw matched.error;
          job = matched.data;
        }
        if (!job) {
          const contact = await supabase.from('contacts').select('id').eq('workspace_id', workspaceId).eq('primary_email', email).maybeSingle();
          if (contact.error) throw contact.error;
          if (contact.data) {
            const latest = await supabase.from('email_jobs').select('id,campaign_id,contact_id')
              .eq('workspace_id', workspaceId).eq('contact_id', contact.data.id)
              .order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (latest.error) throw latest.error;
            job = latest.data;
          }
        }
        const jobStatus = event.status === 'bounced' ? 'bounced' : event.status === 'failed' ? 'failed' : event.status === 'delivered' ? 'delivered' : null;
        if (job && jobStatus) {
          const details = event.raw as any;
          const reason = details.bounce_reason || details.bounce_code || details.reason || null;
          const updated = await supabase.from('email_jobs').update({ status: jobStatus, ...(reason ? { last_error: String(reason) } : {}) })
            .eq('workspace_id', workspaceId).eq('id', job.id);
          if (updated.error) throw updated.error;
        }
        const inserted = await supabase.from('email_events').insert({
          workspace_id: workspaceId, campaign_id: job?.campaign_id || null, email,
          event_type: event.status === 'bounced' ? 'bounce' : event.status === 'complained' ? 'complaint' : event.status,
          event_data: { provider: 'zeptomail', messageId: event.messageId, bounceType: event.bounceType, payload: event.raw },
        });
        if (inserted.error) throw inserted.error;
        processed++;
      }
    }
    await supabase.from('webhook_logs').update({ processed: true }).eq('id', (req as any).zeptoWebhookLogId).eq('workspace_id', workspaceId);
    return { received: true, processed };
  });
}
