import { supabase } from '../supabase.js';

export type SuppressionEntry = { id: string; email: string; reason: 'bounce' | 'complaint' | 'manual' | 'unsubscribe'; created_at: string };

export async function isSuppressed(email: string, workspaceId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('suppression_list').select('id')
    .eq('workspace_id', workspaceId).eq('email', email.trim().toLowerCase()).limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

export async function listSuppressionEntries(workspaceId: string): Promise<SuppressionEntry[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('suppression_list')
    .select('id,email,reason,created_at').eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as SuppressionEntry[];
}

export async function addSuppressionEntry(email: string, reason: SuppressionEntry['reason'], workspaceId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.from('suppression_list')
    .upsert({ workspace_id: workspaceId, email: normalizedEmail, reason }, { onConflict: 'workspace_id,email' })
    .select('id,email,reason,created_at').single();
  if (error) throw error;
  return data as SuppressionEntry;
}

export async function removeSuppressionEntry(id: string, workspaceId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('suppression_list').delete()
    .eq('workspace_id', workspaceId).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
