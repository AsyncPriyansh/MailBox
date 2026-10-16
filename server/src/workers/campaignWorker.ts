import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { supabase } from '../supabase.js';
import { sendWithZeptoMail } from '../providers/zeptomail.js';
import { isSuppressed } from '../services/suppressionService.js';

const Redis = (IORedis as any).default || IORedis;
const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null });

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function personalize(value: string, data: any) {
  return value.replace(/\{\{\s*(name|email|company|campaign|phone)\s*\}\}/gi, (_match, key: string) => escapeHtml(data[key.toLowerCase()] || ''));
}

export const campaignWorker = new Worker('mailbpox-campaigns', async job => {
  const data = job.data;
  const key = data.campaign_id ? `${data.campaign_id}:${data.email}` : `welcome:${data.contact_id}`;

  // Recheck when the job is actually sent so newly imported provider bounces also protect queued mail.
  if (supabase && await isSuppressed(data.email, data.workspace_id)) {
    await supabase.from('email_jobs').update({ status: 'suppressed', last_error: 'Skipped because the address is on the suppression list.' }).eq('idempotency_key', key);
    await supabase.from('email_events').insert({ workspace_id: data.workspace_id, campaign_id: data.campaign_id, email: data.email, event_type: 'suppressed', event_data: { reason: 'suppression_list' } });
    if (data.campaign_id) {
      const { count } = await supabase.from('email_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', data.campaign_id).in('status', ['queued', 'scheduled', 'sending']);
      if (count === 0) {
        const { count: sentCount } = await supabase.from('email_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', data.campaign_id).eq('status', 'sent');
        await supabase.from('campaigns').update({ status: 'completed', sent_count: sentCount || 0 }).eq('id', data.campaign_id);
      }
    }
    return { suppressed: true };
  }

  await supabase?.from('email_jobs').update({ status: 'sending', attempts: job.attemptsMade + 1 }).eq('idempotency_key', key);
  const sent = await sendWithZeptoMail({
    to: data.email,
    name: data.name,
    subject: personalize(data.subject, { ...data, name: data.name, email: data.email }),
    html: personalize(data.html, { ...data, name: data.name, email: data.email }),
  });
  const messageId = sent?.data?.[0]?.message_id || null;

  if (supabase) {
    await supabase.from('email_jobs').update({ status: 'sent', provider: 'zeptomail', provider_message_id: messageId, last_error: null }).eq('idempotency_key', key);
    await supabase.from('email_events').insert({ workspace_id: data.workspace_id, campaign_id: data.campaign_id, email: data.email, event_type: 'sent', event_data: { provider: 'zeptomail', messageId, type: data.campaign_id ? 'campaign' : 'welcome' } });
    if (data.campaign_id) {
      const { count } = await supabase.from('email_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', data.campaign_id).in('status', ['queued', 'scheduled', 'sending']);
      if (count === 0) {
        const { count: sentCount } = await supabase.from('email_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', data.campaign_id).eq('status', 'sent');
        await supabase.from('campaigns').update({ status: 'completed', sent_count: sentCount || 0 }).eq('id', data.campaign_id);
      }
    }
  }
  return { messageId };
}, { connection, concurrency: 5 });

campaignWorker.on('failed', (job, error) => {
  if (!job || !supabase) return;
  const data = job.data;
  void supabase.from('email_jobs').update({ status: job.attemptsMade < 3 ? 'queued' : 'failed', last_error: error.message })
    .eq('idempotency_key', data.campaign_id ? `${data.campaign_id}:${data.email}` : `welcome:${data.contact_id}`);
});
