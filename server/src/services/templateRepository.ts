import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const VERSIONS_FILE = path.join(DATA_DIR, 'template_versions.json');

export interface MemoryTemplate {
  id: string;
  workspace_id: string;
  name: string;
  subject: string;
  preheader: string;
  html_source: string;
  mjml_source: string | null;
  project_json: unknown | null;
  version_number: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryVersion {
  id: string;
  template_id: string;
  workspace_id: string;
  version_number: number;
  name: string;
  subject: string;
  preheader: string;
  mjml_source: string | null;
  project_json: unknown | null;
  html_source: string;
  created_at: string;
}

const memoryTemplates = new Map<string, MemoryTemplate>();
const memoryVersions = new Map<string, MemoryVersion[]>();

// Clean, neutral starter template HTML with company and contact placeholders
const GENERIC_WELCOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to {{company}}</title>
</head>
<body style="margin: 0; padding: 28px 12px; background-color: #f1f5f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2923; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="table-layout: fixed;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 14px; border: 1px solid #e1e7e3; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04);">
          <!-- Top Brand Banner -->
          <tr>
            <td style="padding: 32px 36px 20px 36px; text-align: center; border-bottom: 1px solid #f0f4f1;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <span style="display: inline-block; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; color: #176b4b; text-transform: uppercase;">{{company}}</span>
                    <div style="font-size: 12px; font-weight: 500; color: #718276; margin-top: 4px; letter-spacing: 0.02em;">Welcome &amp; Overview</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #121c16; line-height: 1.35;">Hi {{name}},</h1>
              
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.65; color: #3d4f43;">
                Thank you for reaching out to us. We have received your inquiry and our team is preparing the information you requested.
              </p>
              
              <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.65; color: #3d4f43;">
                We look forward to connecting with you shortly to understand your requirements and share relevant information about our services.
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 32px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius: 8px; background-color: #176b4b;">
                          <a href="https://example.com" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; letter-spacing: 0.01em;">
                            Learn More &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What Happens Next Section -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f7faf8; border: 1px solid #e3ece6; border-radius: 12px; margin: 0 0 28px 0;">
                <tr>
                  <td style="padding: 24px;">
                    <div style="font-size: 12px; font-weight: 800; color: #176b4b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">NEXT STEPS</div>
                    <div style="font-size: 17px; font-weight: 700; color: #121c16; margin-bottom: 18px;">What happens next?</div>

                    <!-- Step 1 -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 14px;">
                      <tr>
                        <td width="36" valign="top">
                          <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #e1efe7; color: #176b4b; font-size: 12px; font-weight: 800; text-align: center; line-height: 28px;">01</div>
                        </td>
                        <td style="padding-left: 10px;" valign="middle">
                          <span style="font-size: 14px; color: #2e3d34; font-weight: 500;">Our team reviews your inquiry.</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Step 2 -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 14px;">
                      <tr>
                        <td width="36" valign="top">
                          <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #e1efe7; color: #176b4b; font-size: 12px; font-weight: 800; text-align: center; line-height: 28px;">02</div>
                        </td>
                        <td style="padding-left: 10px;" valign="middle">
                          <span style="font-size: 14px; color: #2e3d34; font-weight: 500;">We contact you to understand your requirements.</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Step 3 -->
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="36" valign="top">
                          <div style="width: 28px; height: 28px; border-radius: 50%; background-color: #e1efe7; color: #176b4b; font-size: 12px; font-weight: 800; text-align: center; line-height: 28px;">03</div>
                        </td>
                        <td style="padding-left: 10px;" valign="middle">
                          <span style="font-size: 14px; color: #2e3d34; font-weight: 500;">We provide relevant solutions and next steps.</span>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Help note & Signoff -->
              <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #506155;">
                Have questions in the meantime? Simply reply to this email.<br>We are happy to help.
              </p>

              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #2a372e;">
                Best regards,<br>
                <strong style="color: #176b4b;">The Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #f7faf8; border-top: 1px solid #e5ebe7; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #58695d;">{{company}}</p>
              <p style="margin: 0; font-size: 11px; color: #9aa89f; line-height: 1.4;">
                Sent to {{email}} because you requested information from us.<br>
                <a href="{{unsubscribe_url}}" style="color: #7a8c80; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

function saveToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const templatesList = Array.from(memoryTemplates.values());
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templatesList, null, 2), 'utf-8');

    const versionsObj: Record<string, MemoryVersion[]> = {};
    for (const [id, list] of memoryVersions.entries()) {
      versionsObj[id] = list;
    }
    fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versionsObj, null, 2), 'utf-8');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to persist template storage to disk: ${errorMsg}`);
  }
}

function loadFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(TEMPLATES_FILE)) {
      const raw = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
      const list: MemoryTemplate[] = JSON.parse(raw);
      for (const t of list) {
        // Purge invalid non-UUID or TitanAI seeded templates
        if (
          t.id === 'tpl-titan-welcome' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t.id) ||
          t.html_source.includes('TitanAI') ||
          t.html_source.includes('titanaialgo')
        ) {
          continue;
        }
        memoryTemplates.set(t.id, t);
      }
    }
    if (fs.existsSync(VERSIONS_FILE)) {
      const raw = fs.readFileSync(VERSIONS_FILE, 'utf-8');
      const map: Record<string, MemoryVersion[]> = JSON.parse(raw);
      for (const [id, versions] of Object.entries(map)) {
        if (id === 'tpl-titan-welcome' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
          continue;
        }
        memoryVersions.set(
          id,
          versions.filter(v => !v.html_source.includes('TitanAI') && !v.html_source.includes('titanaialgo'))
        );
      }
    }
  } catch (err) {
    console.warn('[templateRepository] Error reading persistent template cache:', err);
  }

  // Seed default template if empty using a valid RFC 4122 UUID
  if (memoryTemplates.size === 0) {
    const defaultId = '00000000-0000-4000-8000-000000000001';
    const now = new Date().toISOString();
    const defaultTemplate: MemoryTemplate = {
      id: defaultId,
      workspace_id: '4a371ce0-90fc-4ecf-92dd-775a5b23a6ee',
      name: 'Lead Welcome & Follow-up',
      subject: 'Thanks for connecting, {{name}}! Here is your requested info',
      preheader: 'We received your inquiry and our team is ready to help.',
      html_source: GENERIC_WELCOME_HTML,
      mjml_source: null,
      project_json: null,
      version_number: 1,
      last_used_at: null,
      created_at: now,
      updated_at: now,
    };
    memoryTemplates.set(defaultId, defaultTemplate);
    memoryVersions.set(defaultId, [
      {
        id: crypto.randomUUID(),
        template_id: defaultId,
        workspace_id: defaultTemplate.workspace_id,
        version_number: 1,
        name: defaultTemplate.name,
        subject: defaultTemplate.subject,
        preheader: defaultTemplate.preheader,
        mjml_source: null,
        project_json: null,
        html_source: defaultTemplate.html_source,
        created_at: now,
      },
    ]);
  }
  
  saveToDisk();
}

// Initial load
loadFromDisk();

export async function listTemplates(workspace: string) {
  if (supabase) {
    const { data, error } = await supabase
      .from('email_templates')
      .select('id,name,subject,preheader,html_source,mjml_source,project_json,version_number,last_used_at,created_at,updated_at')
      .eq('workspace_id', workspace)
      .order('updated_at', { ascending: false });

    if (!error) return data || [];
    if ((error as any).code !== 'PGRST205') throw error;
  }
  // Fallback to durable local store
  return Array.from(memoryTemplates.values())
    .filter(t => !workspace || t.workspace_id === workspace || t.workspace_id === 'default')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function saveTemplate(
  input: {
    id?: string;
    name: string;
    subject: string;
    preheader?: string;
    html: string;
    mjml?: string;
    projectJson?: unknown;
  },
  workspace: string
) {
  const now = new Date().toISOString();

  if (supabase) {
    try {
      if (input.id) {
        const { data: current, error: readError } = await supabase
          .from('email_templates')
          .select('version_number')
          .eq('workspace_id', workspace)
          .eq('id', input.id)
          .maybeSingle();

        if (!readError && current) {
          const version = (current.version_number || 1) + 1;
          const payload = {
            name: input.name,
            subject: input.subject,
            preheader: input.preheader || '',
            html_source: input.html,
            mjml_source: input.mjml || null,
            project_json: input.projectJson ?? null,
            version_number: version,
            updated_at: now,
          };
          const { data, error } = await supabase
            .from('email_templates')
            .update(payload)
            .eq('workspace_id', workspace)
            .eq('id', input.id)
            .select('id,name,subject,preheader,html_source,mjml_source,project_json,version_number,last_used_at,created_at,updated_at')
            .single();

          if (!error && data) {
            await supabase.from('email_template_versions').insert({
              template_id: input.id,
              workspace_id: workspace,
              version_number: version,
              name: input.name,
              subject: input.subject,
              preheader: input.preheader || '',
              mjml_source: input.mjml || null,
              project_json: input.projectJson ?? null,
              html_source: input.html,
            });
            return data;
          }
        }
      } else {
        const { data, error } = await supabase
          .from('email_templates')
          .insert({
            workspace_id: workspace,
            name: input.name,
            subject: input.subject,
            preheader: input.preheader || '',
            html_source: input.html,
            mjml_source: input.mjml || null,
            project_json: input.projectJson ?? null,
            version_number: 1,
            updated_at: now,
          })
          .select('id,name,subject,preheader,html_source,mjml_source,project_json,version_number,last_used_at,created_at,updated_at')
          .single();

        if (!error && data) {
          await supabase.from('email_template_versions').insert({
            template_id: data.id,
            workspace_id: workspace,
            version_number: 1,
            name: input.name,
            subject: input.subject,
            preheader: input.preheader || '',
            mjml_source: input.mjml || null,
            project_json: input.projectJson ?? null,
            html_source: input.html,
          });
          return data;
        }
      }
    } catch {
      // Supabase table does not exist yet (PGRST205), seamlessly fall through to persistent fallback
    }
  }

  // Durable fallback store
  const id = input.id || crypto.randomUUID();
  const existing = memoryTemplates.get(id);
  const version = existing ? existing.version_number + 1 : 1;

  const record: MemoryTemplate = {
    id,
    workspace_id: workspace || '4a371ce0-90fc-4ecf-92dd-775a5b23a6ee',
    name: input.name,
    subject: input.subject,
    preheader: input.preheader || '',
    html_source: input.html,
    mjml_source: input.mjml || null,
    project_json: input.projectJson ?? null,
    version_number: version,
    last_used_at: existing ? existing.last_used_at : null,
    created_at: existing ? existing.created_at : now,
    updated_at: now,
  };

  memoryTemplates.set(id, record);

  const versions = memoryVersions.get(id) || [];
  versions.unshift({
    id: crypto.randomUUID(),
    template_id: id,
    workspace_id: workspace,
    version_number: version,
    name: input.name,
    subject: input.subject,
    preheader: input.preheader || '',
    mjml_source: input.mjml || null,
    project_json: input.projectJson ?? null,
    html_source: input.html,
    created_at: now,
  });
  memoryVersions.set(id, versions);

  saveToDisk();

  return record;
}

export async function deleteTemplate(id: string, workspace: string) {
  if (supabase) {
    try {
      await supabase.from('email_templates').delete().eq('workspace_id', workspace).eq('id', id);
    } catch {
      // ignore
    }
  }
  memoryTemplates.delete(id);
  memoryVersions.delete(id);
  saveToDisk();
  return { deleted: true };
}

export async function listTemplateVersions(id: string, workspace: string) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('email_template_versions')
        .select('id,template_id,version_number,name,subject,preheader,mjml_source,project_json,html_source,created_at')
        .eq('workspace_id', workspace)
        .eq('template_id', id)
        .order('version_number', { ascending: false });

      if (!error && data) return data;
    } catch {
      // ignore
    }
  }
  return memoryVersions.get(id) || [];
}

export async function restoreTemplateVersion(id: string, versionId: string, workspace: string) {
  const versions = await listTemplateVersions(id, workspace);
  const v = versions.find(item => item.id === versionId);
  if (!v) throw new Error('That template version was not found.');

  return saveTemplate(
    {
      id,
      name: v.name,
      subject: v.subject,
      preheader: v.preheader,
      html: v.html_source,
      mjml: v.mjml_source || undefined,
      projectJson: v.project_json,
    },
    workspace
  );
}
