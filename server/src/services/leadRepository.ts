import { supabase } from '../supabase.js';
import type { Lead } from '../types.js';
import { listTemplates } from './templateRepository.js';
import { isSuppressed } from './suppressionService.js';
import { sendWithZeptoMail } from '../providers/zeptomail.js';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const personalize = (value: string, lead: any) => value.replace(/\{\{\s*(name|email|company|campaign|phone)\s*\}\}/gi, (_match, key: string) => escapeHtml(lead[key.toLowerCase()] || ''));

export async function listLeads(workspaceId: string): Promise<Lead[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('contacts').select('id,full_name,primary_email,primary_phone,company,source,campaign,status,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  const contacts = data || [];
  const ids = contacts.map((r: any) => r.id);
  const jobsResult = ids.length ? await supabase.from('email_jobs').select('contact_id,status,created_at,idempotency_key').eq('workspace_id', workspaceId).in('contact_id', ids).order('created_at', { ascending: false }) : { data: [], error: null };
  if (jobsResult.error) throw jobsResult.error;
  const welcomeJobs = new Map<string, any>();
  for (const job of jobsResult.data || []) if (job.contact_id && job.idempotency_key?.startsWith('welcome:') && !welcomeJobs.has(job.contact_id)) welcomeJobs.set(job.contact_id, job);
  return contacts.map((r: any) => ({ id: r.id, name: r.full_name || '', email: r.primary_email, phone: r.primary_phone, company: r.company, source: r.source || 'Spreadsheet', campaign: r.campaign, status: r.status || 'new', createdAt: r.created_at, welcomeEmailStatus: welcomeJobs.get(r.id)?.status || null, welcomeEmailAt: welcomeJobs.get(r.id)?.created_at || null }));
}

export async function upsertLeads(rows: Array<Record<string, unknown>>, workspaceId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const id = workspaceId; if (!id) throw new Error('Workspace is missing from session.');
  const data = rows.map(r => ({ workspace_id: id, primary_email: String(r.email || '').trim().toLowerCase(), full_name: String(r.name || ''), primary_phone: r.phone ? String(r.phone) : null, company: r.company ? String(r.company) : null, source: String(r.source || 'Meta Lead Ads'), campaign: r.campaign ? String(r.campaign) : null, source_updated_at: new Date().toISOString() })).filter(r => r.primary_email.includes('@'));
  if (!data.length) return { imported: 0 };
  const emails = data.map(r => r.primary_email);
  const { data: existing, error: readError } = await supabase.from('contacts').select('primary_email,status,full_name,primary_phone,company,campaign').eq('workspace_id', id).in('primary_email', emails);
  if (readError) throw readError;
  const existingByEmail = new Map((existing || []).map((row: any) => [String(row.primary_email).toLowerCase(), row]));
  const rowsToSave = data.map(row => { const old: any = existingByEmail.get(row.primary_email); return { ...row, full_name: row.full_name || old?.full_name || '', primary_phone: row.primary_phone || old?.primary_phone || null, company: row.company || old?.company || null, campaign: row.campaign || old?.campaign || null, status: old?.status || 'new' }; });
  const { data: saved, error } = await supabase.from('contacts').upsert(rowsToSave, { onConflict: 'workspace_id,primary_email', ignoreDuplicates: false }).select('id,workspace_id,primary_email,full_name,primary_phone,company,campaign'); if (error) throw error;
  const newLeads = (saved || []).filter((lead: any) => !existingByEmail.has(String(lead.primary_email).toLowerCase()));
  if (newLeads.length) {
    try {
      const templates = await listTemplates(id);
      const template = templates.find((item: any) => /welcome/i.test(item.name));
      if (template) {
        for (const lead of newLeads) {
          if (await isSuppressed(lead.primary_email, id)) continue;
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
