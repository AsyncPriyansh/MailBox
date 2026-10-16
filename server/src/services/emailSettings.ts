import { supabase } from '../supabase.js';

export async function getEmailSettings(workspaceId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from('workspace_email_settings')
    .select('welcome_template_id,updated_at')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;

  let template: any = null;
  if (data?.welcome_template_id) {
    const result = await supabase.from('email_templates')
      .select('id,name,subject,preheader,updated_at')
      .eq('workspace_id', workspaceId)
      .eq('id', data.welcome_template_id)
      .maybeSingle();
    if (result.error) throw result.error;
    template = result.data;
  }
  return {
    welcomeTemplateId: data?.welcome_template_id || null,
    welcomeTemplate: template,
    provider: {
      name: 'ZeptoMail',
      configured: Boolean(process.env.ZEPTOMAIL_API_KEY && process.env.ZEPTOMAIL_FROM_EMAIL),
      sender: process.env.ZEPTOMAIL_FROM_EMAIL || null,
    },
  };
}

export async function saveWelcomeTemplate(workspaceId: string, templateId: string | null) {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (templateId) {
    const { data, error } = await supabase.from('email_templates')
      .select('id').eq('workspace_id', workspaceId).eq('id', templateId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Choose a template saved in this workspace.');
  }
  const { error } = await supabase.from('workspace_email_settings').upsert({
    workspace_id: workspaceId,
    welcome_template_id: templateId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id' });
  if (error) throw error;
  return getEmailSettings(workspaceId);
}
