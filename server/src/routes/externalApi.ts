import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { validateApiKey, getOrCreateApiKey, regenerateApiKey } from '../services/apiKeyService.js';
import { sendWithZeptoMail } from '../providers/zeptomail.js';
import { supabase } from '../supabase.js';
import { isSuppressed } from '../services/suppressionService.js';

function extractApiKey(req: FastifyRequest): string {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function personalize(text: string, vars: Record<string, any>) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gi, (match, key: string) => {
    const lower = key.toLowerCase();
    return vars[lower] !== undefined ? escapeHtml(vars[lower]) : match;
  });
}

const sendEmailSchema = z.object({
  to: z.string().email(),
  name: z.string().optional(),
  subject: z.string().optional(),
  html: z.string().optional(),
  template_id: z.string().uuid().optional(),
  variables: z.record(z.string(), z.any()).optional(),
  lead_id: z.string().optional(),
});

export async function registerExternalApiRoutes(app: FastifyInstance) {
  // ── Public API Verification Endpoint ──────────────────────────────────────────
  app.get('/v1/api/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return reply.code(401).send({
        valid: false,
        error: 'Missing API key. Provide via x-api-key header or Bearer token.',
      });
    }

    const result = await validateApiKey(apiKey);
    if (!result.valid || !result.workspaceId) {
      return reply.code(401).send({
        valid: false,
        error: 'Invalid API key.',
      });
    }

    return {
      valid: true,
      service: 'MailBox',
      workspaceId: result.workspaceId,
      workspaceName: result.workspaceName,
      sender: process.env.ZEPTOMAIL_FROM_EMAIL || null,
      senderName: process.env.ZEPTOMAIL_FROM_NAME || 'MailBox',
    };
  });

  // ── Fetch Workspace Templates for External Integration ────────────────────────
  app.get('/v1/api/templates', async (req: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(req);
    const result = await validateApiKey(apiKey);
    if (!result.valid || !result.workspaceId) {
      return reply.code(401).send({ error: 'Invalid API key.' });
    }

    if (!supabase) {
      return reply.code(503).send({ error: 'Database not available.' });
    }

    const { data, error } = await supabase
      .from('email_templates')
      .select('id, name, subject, preheader, updated_at')
      .eq('workspace_id', result.workspaceId)
      .order('updated_at', { ascending: false });

    if (error) {
      return reply.code(500).send({ error: error.message });
    }

    return { templates: data || [] };
  });

  // ── Send Email Endpoint (Synchronous Dispatch via ZeptoMail) ─────────────────
  app.post('/v1/api/send-email', async (req: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(req);
    const authResult = await validateApiKey(apiKey);
    if (!authResult.valid || !authResult.workspaceId) {
      return reply.code(401).send({ success: false, error: 'Invalid or missing API key.' });
    }

    const parseResult = sendEmailSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
    }

    const { to, name, template_id, variables } = parseResult.data;
    let subject = parseResult.data.subject || '';
    let html = parseResult.data.html || '';

    // If template_id provided, load the template
    if (template_id && supabase) {
      const { data: template, error: tmplErr } = await supabase
        .from('email_templates')
        .select('name, subject, html_source')
        .eq('workspace_id', authResult.workspaceId)
        .eq('id', template_id)
        .maybeSingle();

      if (tmplErr || !template) {
        return reply.code(404).send({ success: false, error: 'Email template not found in this workspace.' });
      }

      if (!subject) subject = template.subject;
      if (!html) html = template.html_source;
    }

    if (!subject.trim()) {
      return reply.code(400).send({ success: false, error: 'Subject is required.' });
    }
    if (!html.trim()) {
      return reply.code(400).send({ success: false, error: 'Email content (HTML) is required.' });
    }

    // Merge personalization variables
    const vars: Record<string, any> = {
      name: name || '',
      email: to,
      ...(variables || {}),
    };

    const finalSubject = personalize(subject, vars);
    const finalHtml = personalize(html, vars);

    // Check suppression list if database is connected
    if (supabase && await isSuppressed(to, authResult.workspaceId)) {
      return reply.code(400).send({
        success: false,
        error: `Email address ${to} is on the suppression list (bounced or unsubscribed).`,
        suppressed: true,
      });
    }

    try {
      const sent = await sendWithZeptoMail({
        to,
        name: name || to.split('@')[0],
        subject: finalSubject,
        html: finalHtml,
      });

      const messageId = sent?.data?.[0]?.message_id || `mb_${Date.now()}`;

      // Log event in database for analytics
      if (supabase) {
        const idempotencyKey = `crm_dispatch:${authResult.workspaceId}:${to}:${Date.now()}`;
        try {
          await supabase.from('email_jobs').insert({
            workspace_id: authResult.workspaceId,
            idempotency_key: idempotencyKey,
            status: 'sent',
            provider: 'zeptomail',
            provider_message_id: messageId,
            created_at: new Date().toISOString(),
          });

          await supabase.from('email_events').insert({
            workspace_id: authResult.workspaceId,
            email: to,
            event_type: 'sent',
            event_data: {
              source: 'crm_getaipilot',
              messageId,
              subject: finalSubject,
            },
            occurred_at: new Date().toISOString(),
          });
        } catch (logErr) {
          req.log.warn({ err: logErr }, 'Could not log email event to database');
        }
      }

      return {
        success: true,
        messageId,
        to,
        subject: finalSubject,
      };
    } catch (err: any) {
      req.log.error({ err }, 'Failed to dispatch email via ZeptoMail');
      return reply.code(500).send({
        success: false,
        error: err.message || 'Failed to dispatch email via provider.',
      });
    }
  });

  // ── Settings API Key Route (Protected by workspace session) ───────────────────
  app.get('/v1/settings/api-key', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.workspaceId) {
      return reply.code(401).send({ error: 'Workspace authentication required.' });
    }
    const key = await getOrCreateApiKey(req.workspaceId);
    return { apiKey: key, workspaceId: req.workspaceId };
  });

  app.post('/v1/settings/api-key/regenerate', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.workspaceId) {
      return reply.code(401).send({ error: 'Workspace authentication required.' });
    }
    const newKey = await regenerateApiKey(req.workspaceId);
    return { apiKey: newKey, workspaceId: req.workspaceId };
  });
}
