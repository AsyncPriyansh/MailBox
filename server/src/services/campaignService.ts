import { supabase } from '../supabase.js';
import { campaignQueue } from '../queues/campaignQueue.js';
import { isSuppressed } from './suppressionService.js';
import { sendWithZeptoMail } from '../providers/zeptomail.js';

export async function queueCampaign(input: { name: string; subject: string; html: string; leadIds: string[]; scheduledAt?: string | null; templateId?: string | null }, workspaceId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!workspaceId) throw new Error('Workspace is missing from session.');
  if (!input.name.trim() || !input.subject.trim() || !input.html.trim() || !input.leadIds.length) {
    throw new Error('Campaign name, subject, message, and recipients are required.');
  }
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) {
    throw new Error('Schedule time must be in the future.');
  }
  const { data: leads, error: leadError } = await supabase.from('contacts').select('id,full_name,primary_email,primary_phone,company,campaign').eq('workspace_id', workspaceId).in('id', input.leadIds);
  if (leadError) throw leadError;
  const eligible = [];
  for (const lead of leads || []) {
    if (!(await isSuppressed(lead.primary_email, workspaceId))) eligible.push(lead);
  }
  if (!eligible.length) throw new Error('No eligible recipients remain after suppression checks.');

  let campaign: any = null;
  const baseCampaignPayload = {
    workspace_id: workspaceId,
    name: input.name,
    subject: input.subject,
    html_source: input.html,
    status: scheduledAt ? 'scheduled' : 'sending',
    recipient_count: eligible.length,
    scheduled_at: scheduledAt?.toISOString() || null,
  };

  if (input.templateId) {
    const res = await supabase.from('campaigns').insert({ ...baseCampaignPayload, template_id: input.templateId }).select('id').single();
    if (!res.error && res.data) {
      campaign = res.data;
    } else if (['PGRST204', '23503'].includes(String((res.error as any)?.code))) {
      const fallback = await supabase.from('campaigns').insert(baseCampaignPayload).select('id').single();
      if (fallback.error) throw fallback.error;
      campaign = fallback.data;
    } else if (res.error) {
      throw res.error;
    }
  } else {
    const res = await supabase.from('campaigns').insert(baseCampaignPayload).select('id').single();
    if (res.error) throw res.error;
    campaign = res.data;
  }

  if (input.templateId) {
    try {
      await supabase.from('email_templates').update({ last_used_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('id', input.templateId);
    } catch {
      // ignore
    }
  }

  const jobs = eligible.map((lead: any) => ({
    campaign_id: campaign.id,
    workspace_id: workspaceId,
    contact_id: lead.id,
    email: lead.primary_email,
    name: lead.full_name || lead.primary_email.split('@')[0],
    phone: lead.primary_phone,
    company: lead.company,
    campaign: lead.campaign || input.name,
    subject: input.subject,
    html: input.html
  }));

  const records = jobs.map(j => ({
    campaign_id: j.campaign_id,
    workspace_id: j.workspace_id,
    contact_id: j.contact_id,
    idempotency_key: `${campaign.id}:${j.email}`,
    status: scheduledAt ? 'scheduled' : 'queued'
  }));

  const { error: jobError } = await supabase.from('email_jobs').insert(records);
  if (jobError) {
    await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaign.id);
    throw jobError;
  }

  const delay = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;

  try {
    // Attempt BullMQ enqueue with timeout in case Redis is offline
    await Promise.race([
      campaignQueue.addBulk(jobs.map(data => ({ name: 'send-campaign-email', data: { ...data, recipientCount: jobs.length }, opts: { delay } }))),
      new Promise((_, reject) => setTimeout(() => reject(new Error('REDIS_OFFLINE_TIMEOUT')), 1200))
    ]);
  } catch {
    // If Redis is offline and this is an immediate send, dispatch directly with ZeptoMail
    if (!scheduledAt) {
      console.warn('[Campaign Engine] Redis queue offline. Dispatching campaign emails directly via ZeptoMail.');
      let sentCount = 0;
      for (const job of jobs) {
        const key = `${campaign.id}:${job.email}`;
        try {
          await supabase.from('email_jobs').update({ status: 'sending', attempts: 1 }).eq('idempotency_key', key);
          const sent = await sendWithZeptoMail({
            to: job.email,
            name: job.name,
            subject: job.subject,
            html: job.html
          });
          const msg = (sent as any)?.data?.[0]?.message_id || null;
          await supabase.from('email_jobs').update({ status: 'sent', provider: 'zeptomail', provider_message_id: msg, last_error: null }).eq('idempotency_key', key);
          await supabase.from('email_events').insert({
            workspace_id: workspaceId,
            campaign_id: campaign.id,
            email: job.email,
            event_type: 'sent',
            event_data: { provider: 'zeptomail', messageId: msg, type: 'campaign' }
          });
          sentCount++;
        } catch (err: any) {
          console.error(`[Campaign Engine] Failed send to ${job.email}:`, err.message);
          await supabase.from('email_jobs').update({ status: 'failed', last_error: err.message }).eq('idempotency_key', key);
        }
      }
      await supabase.from('campaigns').update({ status: 'completed', sent_count: sentCount }).eq('id', campaign.id);
    }
  }

  return {
    campaignId: campaign.id,
    queued: scheduledAt ? 0 : jobs.length,
    scheduledRecipients: scheduledAt ? jobs.length : 0,
    suppressed: (leads || []).length - jobs.length,
    scheduledAt: scheduledAt?.toISOString() || null
  };
}
