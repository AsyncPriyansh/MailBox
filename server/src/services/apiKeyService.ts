import crypto from 'node:crypto';
import { supabase } from '../supabase.js';

const API_KEY_PREFIX = 'mbk_live_';

export async function getOrCreateApiKey(workspaceId: string): Promise<string> {
  const configuredEnvKey = process.env.MAILBOX_API_KEY?.trim();
  
  if (supabase) {
    try {
      // 1. Check workspace_api_keys table if it exists
      const { data: tableData } = await supabase
        .from('workspace_api_keys')
        .select('key')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (tableData?.key) return tableData.key;
    } catch {
      // Table might not exist yet, fallback below
    }

    // 2. Check integration_sync_state
    const { data: syncData } = await supabase
      .from('integration_sync_state')
      .select('last_error')
      .eq('workspace_id', workspaceId)
      .eq('integration', 'api_key')
      .maybeSingle();

    if (syncData?.last_error && syncData.last_error.startsWith(API_KEY_PREFIX)) {
      return syncData.last_error;
    }

    // 3. Generate a new key and save it
    const newKey = configuredEnvKey || `${API_KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
    
    await supabase.from('integration_sync_state').upsert({
      workspace_id: workspaceId,
      integration: 'api_key',
      last_error: newKey,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,integration' });

    return newKey;
  }

  return configuredEnvKey || `${API_KEY_PREFIX}default_workspace_key`;
}

export async function regenerateApiKey(workspaceId: string): Promise<string> {
  const newKey = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;

  if (supabase) {
    try {
      await supabase.from('workspace_api_keys').upsert({
        workspace_id: workspaceId,
        key: newKey,
        name: 'CRM Integration',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' });
    } catch {}

    await supabase.from('integration_sync_state').upsert({
      workspace_id: workspaceId,
      integration: 'api_key',
      last_error: newKey,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,integration' });
  }

  return newKey;
}

export async function validateApiKey(apiKey: string): Promise<{
  valid: boolean;
  workspaceId?: string;
  workspaceName?: string;
}> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return { valid: false };

  // 1. Check env key fallback
  const envKey = process.env.MAILBOX_API_KEY?.trim();
  const defaultWorkspaceId = process.env.MAILBPOX_WORKSPACE_ID;
  if (envKey && cleanKey === envKey && defaultWorkspaceId) {
    let name = 'Default Workspace';
    if (supabase) {
      const { data } = await supabase.from('workspaces').select('name').eq('id', defaultWorkspaceId).maybeSingle();
      if (data?.name) name = data.name;
    }
    return { valid: true, workspaceId: defaultWorkspaceId, workspaceName: name };
  }

  if (!supabase) {
    return { valid: false };
  }

  // 2. Check workspace_api_keys table
  try {
    const { data: keyRow } = await supabase
      .from('workspace_api_keys')
      .select('workspace_id, workspaces(name)')
      .eq('key', cleanKey)
      .maybeSingle();

    if (keyRow?.workspace_id) {
      return {
        valid: true,
        workspaceId: keyRow.workspace_id,
        workspaceName: (keyRow.workspaces as any)?.name || 'Workspace',
      };
    }
  } catch {}

  // 3. Check integration_sync_state
  const { data: syncRow } = await supabase
    .from('integration_sync_state')
    .select('workspace_id')
    .eq('integration', 'api_key')
    .eq('last_error', cleanKey)
    .maybeSingle();

  if (syncRow?.workspace_id) {
    let name = 'Mailbox Workspace';
    const { data: ws } = await supabase.from('workspaces').select('name').eq('id', syncRow.workspace_id).maybeSingle();
    if (ws?.name) name = ws.name;
    return { valid: true, workspaceId: syncRow.workspace_id, workspaceName: name };
  }

  return { valid: false };
}
