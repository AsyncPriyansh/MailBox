import { supabase } from '../supabase.js';
import type { Lead } from '../types.js';
import { getEmailSettings } from './emailSettings.js';
import { isSuppressed } from './suppressionService.js';
import { sendWithZeptoMail } from '../providers/zeptomail.js';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const personalize = (value: string, lead: any) => value.replace(/\{\{\s*(name|email|company|campaign|phone)\s*\}\}/gi, (_match, key: string) => escapeHtml(lead[key.toLowerCase()] || ''));

export async function listLeads(workspaceId: string): Promise<Lead[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const contacts: any[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from('contacts').select('id,full_name,primary_email,primary_phone,company,source,campaign,status,created_at,form_name,source_lead_status').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    contacts.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  const ids = contacts.map((r: any) => r.id);
  const jobs: any[] = [];
  for (let offset = 0; offset < ids.length; offset += pageSize) {
    const result = await supabase.from('email_jobs').select('contact_id,status,created_at,idempotency_key').eq('workspace_id', workspaceId).in('contact_id', ids.slice(offset, offset + pageSize)).order('created_at', { ascending: false });
    if (result.error) throw result.error;
    jobs.push(...(result.data || []));
  }
  const welcomeJobs = new Map<string, any>();
  for (const job of jobs) if (job.contact_id && job.idempotency_key?.startsWith('welcome:') && !welcomeJobs.has(job.contact_id)) welcomeJobs.set(job.contact_id, job);
  return contacts.map((r: any) => ({
    id: r.id,
    name: r.full_name || '',
    email: r.primary_email,
    phone: r.primary_phone,
    company: r.company,
    source: r.source || 'Meta Ads',
    campaign: r.campaign,
    status: r.status || 'new',
    createdAt: r.created_at,
    formName: r.form_name,
    sourceLeadStatus: r.source_lead_status,
    welcomeEmailStatus: welcomeJobs.get(r.id)?.status || null,
    welcomeEmailAt: welcomeJobs.get(r.id)?.created_at || null
  }));
}

export async function upsertLeads(rows: Array<Record<string, unknown>>, workspaceId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const id = workspaceId; if (!id) throw new Error('Workspace is missing from session.');
  const imported = rows.map(r => ({
    workspace_id: id,
    primary_email: String(r.email || '').trim().toLowerCase(),
    full_name: String(r.name || ''),
    primary_phone: r.phone ? String(r.phone).replace(/^p:/i, '') : null,
    company: r.company ? String(r.company) : null,
    source: String(r.source || 'Meta Lead Ads'),
    campaign: (r.campaign as string) || (r.campaignName as string) || (r.formName as string) || null,
    form_name: r.formName ? String(r.formName) : null,
    source_lead_status: r.sourceLeadStatus ? String(r.sourceLeadStatus) : null,
    source_updated_at: new Date().toISOString()
  })).filter(r => r.primary_email.includes('@'));

  const uniqueByEmail = new Map<string, typeof imported[number]>();
  for (const row of imported) {
    const previous = uniqueByEmail.get(row.primary_email);
    if (!previous) uniqueByEmail.set(row.primary_email, row);
    else for (const key of ['full_name','primary_phone','company','source','campaign','form_name','source_lead_status'] as const) {
      if ((previous[key] === null || previous[key] === '') && row[key] !== null && row[key] !== '') (previous as any)[key] = row[key];
    }
  }
  const data = [...uniqueByEmail.values()];
  if (!data.length) return { imported: 0 };

  const emailsToSave = data.map(r => r.primary_email);
  const { data: existing, error: readError } = await supabase.from('contacts').select('primary_email,status,full_name,primary_phone,company,campaign,form_name,source_lead_status').eq('workspace_id', id).in('primary_email', emailsToSave);
  if (readError) throw readError;
  const existingByEmail = new Map((existing || []).map((row: any) => [String(row.primary_email).toLowerCase(), row]));
  const rowsToSave = data.map(row => {
    const old: any = existingByEmail.get(row.primary_email);
    return {
      ...row,
      full_name: row.full_name || old?.full_name || '',
      primary_phone: row.primary_phone || old?.primary_phone || null,
      company: row.company || old?.company || null,
      campaign: row.campaign || old?.campaign || null,
      form_name: row.form_name || old?.form_name || null,
      source_lead_status: row.source_lead_status || old?.source_lead_status || null,
      status: old?.status || 'new'
    };
  });
  const { data: saved, error } = await supabase.from('contacts').upsert(rowsToSave, { onConflict: 'workspace_id,primary_email', ignoreDuplicates: false }).select('id,workspace_id,primary_email,full_name,primary_phone,company,campaign');
  if (error) throw error;
  const newLeads = (saved || []).filter((lead: any) => !existingByEmail.has(String(lead.primary_email).toLowerCase()));
  if (newLeads.length) {
    try {
      const settings = await getEmailSettings(id);
      let template: any = null;
      if (settings.welcomeTemplateId) {
        const result = await supabase.from('email_templates').select('id,name,subject,html_source').eq('workspace_id', id).eq('id', settings.welcomeTemplateId).maybeSingle();
        if (result.error) throw result.error;
        template = result.data;
      }
      if (template) {
        for (const lead of newLeads) {
          if (await isSuppressed(lead.primary_email, id)) continue;

          // Guard 2: Never send welcome email twice to the same email in this workspace
          const { data: alreadySentWelcome, error: sentCheckError } = await supabase
            .from('email_events')
            .select('id')
            .eq('workspace_id', id)
            .eq('email', lead.primary_email)
            .is('campaign_id', null)
            .eq('event_type', 'sent')
            .limit(1);

          if (sentCheckError) {
            console.error(`[Welcome Email] Error checking sent history for ${lead.primary_email}:`, sentCheckError);
            continue; // Production fail-safe: do not send if history check encounters an error
          }

          if (alreadySentWelcome && alreadySentWelcome.length > 0) {
            // Already received a welcome email previously in this workspace: mark job as sent and skip dispatch
            const jobId = `welcome:${lead.id}`;
            await supabase.from('email_jobs').upsert({
              campaign_id: null,
              workspace_id: id,
              contact_id: lead.id,
              idempotency_key: jobId,
              status: 'sent',
              provider: 'zeptomail',
              attempts: 1
            }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
            continue;
          }

          const leadData = {
            name: lead.full_name || lead.primary_email.split('@')[0],
            email: lead.primary_email,
            phone: lead.primary_phone || '',
            company: lead.company || '',
            campaign: lead.campaign || 'Lead form'
          };
          const jobId = `welcome:${lead.id}`;
          const subject = personalize(template.subject, leadData);
          const html = personalize(template.html_source, leadData);

          // Track in email_jobs table
          await supabase.from('email_jobs').upsert({
            campaign_id: null,
            workspace_id: id,
            contact_id: lead.id,
            idempotency_key: jobId,
            status: 'sending',
            attempts: 1
          }, { onConflict: 'idempotency_key', ignoreDuplicates: true });

          // Send welcome email immediately via ZeptoMail
          try {
            const sent = await sendWithZeptoMail({
              to: lead.primary_email,
              name: leadData.name,
              subject,
              html
            });
            const msg = (sent as any)?.data?.[0]?.message_id || null;
            await supabase.from('email_jobs').update({
              status: 'sent',
              provider: 'zeptomail',
              provider_message_id: msg,
              last_error: null
            }).eq('idempotency_key', jobId);

            await supabase.from('email_events').insert({
              workspace_id: id,
              campaign_id: null,
              email: lead.primary_email,
              event_type: 'sent',
              event_data: { provider: 'zeptomail', messageId: msg, type: 'welcome' }
            });
            console.log(`[Welcome Email] Successfully sent welcome email to ${lead.primary_email}`);
          } catch (sendErr: any) {
            console.error(`[Welcome Email] Failed sending welcome email to ${lead.primary_email}:`, sendErr.message);
            await supabase.from('email_jobs').update({
              status: 'failed',
              last_error: sendErr.message
            }).eq('idempotency_key', jobId);
          }
        }
      }
    } catch (error) {
      console.error('Could not process welcome emails for new leads:', error);
    }
  }
  return { imported: data.length };
}

export async function retryWelcomeEmail(contactId: string, workspaceId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: lead, error: leadError } = await supabase.from('contacts')
    .select('id,primary_email,full_name,primary_phone,company,campaign')
    .eq('workspace_id', workspaceId).eq('id', contactId).maybeSingle();
  if (leadError) throw leadError;
  if (!lead) throw new Error('Lead not found.');
  const jobId = `welcome:${lead.id}`;
  const { data: job, error: jobError } = await supabase.from('email_jobs')
    .select('status,attempts').eq('workspace_id', workspaceId).eq('idempotency_key', jobId).maybeSingle();
  if (jobError) throw jobError;
  if (!job || !['failed', 'bounced'].includes(job.status)) throw new Error('Only a failed welcome email can be retried.');
  if (await isSuppressed(lead.primary_email, workspaceId)) throw new Error('This address is suppressed and cannot be emailed.');
  const settings = await getEmailSettings(workspaceId);
  if (!settings.welcomeTemplateId) throw new Error('Choose a welcome template before retrying.');
  const { data: template, error: templateError } = await supabase.from('email_templates')
    .select('subject,html_source').eq('workspace_id', workspaceId).eq('id', settings.welcomeTemplateId).maybeSingle();
  if (templateError) throw templateError;
  if (!template) throw new Error('The selected welcome template is unavailable.');
  const leadData = { name: lead.full_name || lead.primary_email.split('@')[0], email: lead.primary_email, phone: lead.primary_phone || '', company: lead.company || '', campaign: lead.campaign || 'Lead form' };
  await supabase.from('email_jobs').update({ status: 'sending', attempts: (job.attempts || 0) + 1, last_error: null }).eq('idempotency_key', jobId);
  try {
    const sent = await sendWithZeptoMail({ to: lead.primary_email, name: leadData.name, subject: personalize(template.subject, leadData), html: personalize(template.html_source, leadData) });
    const messageId = (sent as any)?.data?.[0]?.message_id || null;
    await supabase.from('email_jobs').update({ status: 'sent', provider: 'zeptomail', provider_message_id: messageId, last_error: null }).eq('idempotency_key', jobId);
    await supabase.from('email_events').insert({ workspace_id: workspaceId, campaign_id: null, email: lead.primary_email, event_type: 'sent', event_data: { provider: 'zeptomail', messageId, type: 'welcome', retry: true } });
    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email delivery failed.';
    await supabase.from('email_jobs').update({ status: 'failed', last_error: message }).eq('idempotency_key', jobId);
    throw new Error(message);
  }
}
