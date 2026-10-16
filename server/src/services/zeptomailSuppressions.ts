import { addSuppressionEntry, type SuppressionEntry } from './suppressionService.js';

type ProviderEntry = { email: string; reason: SuppressionEntry['reason']; created_at: string };
type ProviderSyncResult = { configured: boolean; synced: number; message?: string };

let cachedToken: { value: string; expiresAt: number } | null = null;

const apiBase = () => {
  const url = process.env.ZEPTOMAIL_SUPPRESSIONS_URL || process.env.ZEPTOMAIL_URL || 'https://api.zeptomail.in/v1.1/email';
  return url.replace(/\/v1\.1\/email\/?$/, '/v1.1').replace(/\/$/, '');
};

async function authHeader(): Promise<string | null> {
  const refreshToken = process.env.ZEPTOMAIL_REFRESH_TOKEN || process.env.ZEPTO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID || process.env.ZEPTOMAIL_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET || process.env.ZEPTOMAIL_CLIENT_SECRET;

  if (refreshToken && clientId && clientSecret) {
    if (!cachedToken || Date.now() >= cachedToken.expiresAt) {
      const params = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' });
      const accounts = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, '');
      const response = await fetch(`${accounts}/oauth/v2/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
        signal: AbortSignal.timeout(8000),
      });
      const payload = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; error?: string } | null;
      if (!response.ok || !payload?.access_token) throw new Error(`ZeptoMail OAuth refresh failed (${response.status})${payload?.error ? `: ${payload.error}` : ''}.`);
      cachedToken = { value: payload.access_token, expiresAt: Date.now() + Math.max(Number(payload.expires_in || 3600) - 120, 60) * 1000 };
    }
    return `Zoho-oauthtoken ${cachedToken.value}`;
  }

  const token = process.env.ZEPTOMAIL_OAUTH_TOKEN || process.env.ZEPTO_OAUTH_TOKEN;
  if (token) return token.startsWith('Zoho-oauthtoken ') ? token : `Zoho-oauthtoken ${token}`;
  const key = process.env.ZEPTOMAIL_SUPPRESSIONS_API_KEY;
  if (key) return key.startsWith('Zoho-enczapikey ') ? key : `Zoho-enczapikey ${key}`;
  return null;
}

function unwrapEntries(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [payload?.data, payload?.data?.suppressions, payload?.data?.values, payload?.suppressions, payload?.values]) {
    if (Array.isArray(candidate)) return candidate.map((item: any) => typeof item === 'string' ? { value: item } : item);
  }
  return [];
}

function normalizeEntry(entry: any): ProviderEntry | null {
  const email = String(entry?.email || entry?.value || entry?.values?.[0] || entry?.address || entry?.email_address || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return null;
  const category = String(entry?.category || entry?.reason || entry?.description || entry?.action || '').toLowerCase();
  const reason: ProviderEntry['reason'] = /complaint|spam|feedback/.test(category) ? 'complaint'
    : /unsubscribe|opt.?out/.test(category) ? 'unsubscribe'
    : /manual/.test(category) ? 'manual' : 'bounce';
  const created = entry?.created_at || entry?.created_time || entry?.createdTime || entry?.modified_time || entry?.modifiedTime;
  const parsed = created ? new Date(created) : new Date();
  return { email, reason, created_at: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString() };
}

export async function listZeptoSuppressions(): Promise<{ configured: boolean; entries: ProviderEntry[] }> {
  const mailAgentKey = process.env.ZEPTOMAIL_MAIL_AGENT_KEY || process.env.ZEPTOMAIL_AGENT_KEY;
  // Never fall back to an account-wide list: this workspace is linked to one Mail Agent.
  if (!mailAgentKey) return { configured: false, entries: [] };
  const authorization = await authHeader();
  if (!authorization) return { configured: false, entries: [] };
  const entries: ProviderEntry[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const params = new URLSearchParams({ limit: '500', offset: String(offset), mailagent_key: mailAgentKey });
    const response = await fetch(`${apiBase()}/suppressions/email?${params}`, {
      headers: { Authorization: authorization, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`ZeptoMail suppression sync failed (${response.status}).`);
    const page = unwrapEntries(await response.json());
    entries.push(...page.map(normalizeEntry).filter((entry: ProviderEntry | null): entry is ProviderEntry => Boolean(entry)));
    if (page.length < 500) break;
  }
  return { configured: true, entries };
}

export async function syncZeptoSuppressions(workspaceId: string): Promise<ProviderSyncResult> {
  if (!(process.env.ZEPTOMAIL_MAIL_AGENT_KEY || process.env.ZEPTOMAIL_AGENT_KEY)) {
    return { configured: false, synced: 0, message: 'Set ZEPTOMAIL_MAIL_AGENT_KEY to sync this agent only.' };
  }
  const provider = await listZeptoSuppressions();
  if (!provider.configured) return { configured: false, synced: 0, message: 'Configure ZeptoMail OAuth credentials to sync this agent.' };
  for (const entry of provider.entries) await addSuppressionEntry(entry.email, entry.reason, workspaceId);
  return { configured: true, synced: provider.entries.length };
}

async function providerRequest(method: 'POST' | 'DELETE', email: string, reason?: string) {
  const mailAgentKey = process.env.ZEPTOMAIL_MAIL_AGENT_KEY || process.env.ZEPTOMAIL_AGENT_KEY;
  if (!mailAgentKey) return { configured: false, message: 'Set ZEPTOMAIL_MAIL_AGENT_KEY to restrict changes to this agent.' };
  const authorization = await authHeader();
  if (!authorization) return { configured: false, message: 'Configure ZeptoMail OAuth credentials to sync this agent.' };
  const body: Record<string, unknown> = method === 'POST'
    ? { action: 'suppress', values: [email], description: `Added from MailBox: ${reason || 'manual'}` }
    : { values: [email] };
  if (method === 'POST' && mailAgentKey) body.mailagent_keys = [mailAgentKey];
  const response = await fetch(`${apiBase()}/suppressions/email`, {
    method, headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  const detail = await response.text();
  if ((method === 'POST' && (response.status === 409 || detail.includes('DND_101'))) || (method === 'DELETE' && (response.status === 404 || response.status === 204 || detail.includes('DND_102')))) return { configured: true };
  if (!response.ok) throw new Error(`ZeptoMail suppression ${method.toLowerCase()} failed (${response.status}).`);
  return { configured: true };
}

export const addZeptoSuppression = (email: string, reason: string) => providerRequest('POST', email, reason);
export const removeZeptoSuppression = (email: string) => providerRequest('DELETE', email);
