import { useState, useMemo, type FormEvent } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Eye,
  History,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  LoaderCircle,
  Minus,
  Monitor,
  MousePointerClick,
  Plus,
  Save,
  Settings2,
  Smartphone,
  Trash2,
  Type,
  X,
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import {
  compileEmailHtml,
  STARTER_PRESETS,
  type TemplateBlock,
  type EmailSettings,
} from './emailCompiler';
import {
  templatesApi,
  type EmailTemplate,
  type TemplateVersion,
  type TemplateWrite,
} from '../../services/templatesApi';

type Props = {
  template?: EmailTemplate | null;
  onBack: () => void;
  onSaved: (template: EmailTemplate) => void;
};

export function TemplateStudio({ template, onBack, onSaved }: Props) {
  // Initial state setup
  const sanitizeBlockContent = (b: TemplateBlock): TemplateBlock => {
    const c = { ...b.content };
    if (typeof c.text === 'string') c.text = c.text.replace(/\u00A0/g, ' ');
    if (typeof c.description === 'string') c.description = c.description.replace(/\u00A0/g, ' ');
    if (typeof c.title === 'string') c.title = c.title.replace(/\u00A0/g, ' ');
    if (typeof c.badge === 'string') c.badge = c.badge.replace(/\u00A0/g, ' ');
    return { ...b, content: c };
  };

  // Initial state setup
  const initialData = useMemo(() => {
    if (template?.project_json && typeof template.project_json === 'object') {
      const proj = template.project_json as any;
      if (Array.isArray(proj.blocks)) {
        return {
          blocks: (proj.blocks as TemplateBlock[]).map(sanitizeBlockContent),
          settings: (proj.settings || {}) as Partial<EmailSettings>,
        };
      }
    }
    if (template?.html_source && (!template.project_json || !Array.isArray((template.project_json as any)?.blocks))) {
      return {
        blocks: [
          {
            id: 'block-raw-html',
            type: 'raw_html' as const,
            content: { html: template.html_source },
          },
        ],
        settings: {
          subject: template.subject || '',
          preheader: template.preheader || '',
        } as Partial<EmailSettings>,
        isRawHtml: true,
        rawHtmlSource: template.html_source,
      };
    }
    // Fallback to default preset
    return {
      blocks: STARTER_PRESETS.lead_welcome.blocks.map(sanitizeBlockContent),
      settings: {
        subject: template?.subject || STARTER_PRESETS.lead_welcome.subject,
        preheader: template?.preheader || STARTER_PRESETS.lead_welcome.preheader,
      } as Partial<EmailSettings>,
      isRawHtml: false,
      rawHtmlSource: '',
    };
  }, [template]);

  const [name, setName] = useState(template?.name || 'Lead Welcome & Follow-up');
  const [blocks, setBlocks] = useState<TemplateBlock[]>(initialData.blocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(initialData.blocks[0]?.id || null);
  const [settings, setSettings] = useState<EmailSettings>({
    subject: template?.subject || initialData.settings.subject || 'Thanks for connecting, {{name}}',
    preheader: template?.preheader || initialData.settings.preheader || 'We received your inquiry and our team is ready to help.',
    backgroundColor: initialData.settings.backgroundColor || '#f4f6f4',
    cardColor: initialData.settings.cardColor || '#ffffff',
    primaryColor: initialData.settings.primaryColor || '#176b4b',
    fontFamily: initialData.settings.fontFamily || "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  });

  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [editorMode, setEditorMode] = useState<'blocks' | 'html'>(initialData.isRawHtml ? 'html' : 'blocks');
  const [rawHtmlSource, setRawHtmlSource] = useState<string>(initialData.rawHtmlSource || (template?.html_source || ''));
  const [activeSidebarTab, setActiveSidebarTab] = useState<'blocks' | 'presets'>('blocks');
  const [activeInspectorTab, setActiveInspectorTab] = useState<'block' | 'settings'>('block');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Selected block lookup
  const selectedBlock = useMemo(
    () => blocks.find(b => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId]
  );

  const updateBlockContent = (id: string, patch: Record<string, any>) => {
    const sanitizedPatch = { ...patch };
    if (typeof sanitizedPatch.text === 'string') sanitizedPatch.text = sanitizedPatch.text.replace(/\u00A0/g, ' ');
    if (typeof sanitizedPatch.description === 'string') sanitizedPatch.description = sanitizedPatch.description.replace(/\u00A0/g, ' ');
    if (typeof sanitizedPatch.title === 'string') sanitizedPatch.title = sanitizedPatch.title.replace(/\u00A0/g, ' ');
    if (typeof sanitizedPatch.badge === 'string') sanitizedPatch.badge = sanitizedPatch.badge.replace(/\u00A0/g, ' ');

    setBlocks(prev =>
      prev.map(b => (b.id === id ? { ...b, content: { ...b.content, ...sanitizedPatch } } : b))
    );
    setDirty(true);
  };

  const addBlock = (type: TemplateBlock['type'], insertAtIndex?: number) => {
    const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let newBlock: TemplateBlock;

    switch (type) {
      case 'heading':
        newBlock = { id, type: 'heading', content: { text: 'New Heading', level: 'h2', align: 'left', color: '#1a241e' } };
        break;
      case 'text':
        newBlock = { id, type: 'text', content: { text: 'Type your message here. Personalize with {{name}} or {{company}}.', align: 'left', color: '#4a574f' } };
        break;
      case 'button':
        newBlock = { id, type: 'button', content: { text: 'Call to Action →', url: 'https://', align: 'center', bgColor: settings.primaryColor, textColor: '#ffffff', borderRadius: 8 } };
        break;
      case 'image':
        newBlock = { id, type: 'image', content: { url: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80', alt: 'Header Banner', align: 'center', width: '100%' } };
        break;
      case 'feature':
        newBlock = { id, type: 'feature', content: { badge: 'HIGHLIGHT', title: 'Why Choose Us', description: 'Describe your key benefit or deliverable in 1-2 compelling sentences.', bg: '#f3f8f5' } };
        break;
      case 'divider':
        newBlock = { id, type: 'divider', content: { color: '#e5eae6', margin: 20 } };
        break;
      case 'spacer':
        newBlock = { id, type: 'spacer', content: { height: 24 } };
        break;
      case 'footer':
        newBlock = { id, type: 'footer', content: { company: '{{company}}', address: 'Sent to {{email}} because you requested information from us.', unsubscribeText: 'Unsubscribe' } };
        break;
      case 'raw_html':
        newBlock = { id, type: 'raw_html', content: { html: '<div style="padding: 16px; background-color: #f7faf8; border-radius: 8px; border: 1px dashed #28744c; text-align: center;">\n  <p style="margin: 0; color: #176b4b; font-weight: 600;">Custom HTML Container</p>\n  <p style="margin: 6px 0 0; font-size: 13px; color: #536459;">Paste your custom HTML table, embed, or badge here.</p>\n</div>' } };
        break;
      default:
        return;
    }

    setBlocks(prev => {
      const idx = insertAtIndex !== undefined ? insertAtIndex : prev.length;
      const next = [...prev];
      next.splice(idx, 0, newBlock);
      return next;
    });
    setSelectedBlockId(id);
    setActiveInspectorTab('block');
    setDirty(true);
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    setBlocks(prev => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
    setDirty(true);
  };

  const duplicateBlock = (block: TemplateBlock) => {
    const clone: TemplateBlock = {
      ...block,
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: { ...block.content },
    };
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === block.id);
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
    setSelectedBlockId(clone.id);
    setDirty(true);
  };

  const deleteBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
    setDirty(true);
  };

  const applyPreset = (key: keyof typeof STARTER_PRESETS) => {
    if (dirty && !window.confirm('Apply preset? Unsaved changes in your current draft will be overwritten.')) return;
    const preset = STARTER_PRESETS[key];
    if (!preset) return;
    setName(preset.name);
    setSettings(prev => ({
      ...prev,
      subject: preset.subject,
      preheader: preset.preheader,
    }));
    setBlocks(preset.blocks);
    setSelectedBlockId(preset.blocks[0]?.id || null);
    setDirty(true);
    setNotice(`Applied preset: ${preset.name}`);
  };

  const copyMergeTag = (tag: string) => {
    navigator.clipboard.writeText(tag).then(() => {
      setNotice(`Copied ${tag} to clipboard`);
      setTimeout(() => setNotice(null), 2500);
    });
  };

  const save = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setNotice('Enter a template name.');
      return;
    }
    setSaving(true);
    try {
      const isHtml = editorMode === 'html';
      const html = isHtml ? rawHtmlSource : compileEmailHtml(blocks, settings);
      const projectJson = isHtml
        ? {
            isRawHtml: true,
            version: 2,
            blocks: [
              {
                id: 'block-raw-html',
                type: 'raw_html',
                content: { html: rawHtmlSource },
              },
            ],
            settings,
          }
        : {
            isRawHtml: false,
            blocks,
            settings,
            version: 2,
          };

      const input: TemplateWrite = {
        id: template?.id,
        name: name.trim(),
        subject: settings.subject.trim() || name.trim(),
        preheader: settings.preheader.trim(),
        html,
        projectJson,
      };
      const result = await templatesApi.save(input);
      setDirty(false);
      setNotice('Template saved successfully!');
      setTimeout(() => setNotice(null), 3000);
      onSaved(result.template);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not save template.');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async () => {
    if (!template?.id) return;
    setLoadingHistory(true);
    try {
      const res = await templatesApi.versions(template.id);
      setVersions(res.versions);
      setHistoryOpen(true);
    } catch {
      setNotice('Unable to load version history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const restoreVersion = async (v: TemplateVersion) => {
    if (!template) return;
    setSaving(true);
    try {
      const res = await templatesApi.restore(template.id, v.id);
      onSaved(res.template);
    } catch {
      setNotice('Could not restore version.');
    } finally {
      setSaving(false);
    }
  };

  // Compile live preview HTML directly without injecting any mockup data
  const previewHtml = useMemo(() => {
    return editorMode === 'html' ? rawHtmlSource : compileEmailHtml(blocks, settings);
  }, [editorMode, rawHtmlSource, blocks, settings]);

  return (
    <div className="studio-root">
      {/* ── TOP HEADER / TOOLBAR ────────────────────────────────────── */}
      <header className="studio-topbar">
        <div className="studio-topbar-left">
          <button
            type="button"
            className="studio-btn-subtle"
            onClick={() => {
              if (dirty && !window.confirm('Discard unsaved template changes?')) return;
              onBack();
            }}
          >
            <ArrowLeft size={16} /> Templates
          </button>
          <div className="studio-title-group">
            <input
              className="studio-title-input"
              value={name}
              onChange={e => {
                setName(e.target.value);
                setDirty(true);
              }}
              placeholder="Template name"
            />
            <span className={`studio-status-pill ${dirty ? 'is-dirty' : 'is-saved'}`}>
              <span className="dot" /> {dirty ? 'Unsaved changes' : 'Saved'}
            </span>
          </div>
        </div>

        {/* Mode Toggle: Visual Blocks vs Paste HTML */}
        <div className="studio-mode-toggle">
          <button
            type="button"
            className={editorMode === 'blocks' ? 'active' : ''}
            onClick={() => setEditorMode('blocks')}
          >
            <Layers size={14} /> <span>Visual Blocks</span>
          </button>
          <button
            type="button"
            className={editorMode === 'html' ? 'active' : ''}
            onClick={() => {
              if (!rawHtmlSource) {
                setRawHtmlSource(compileEmailHtml(blocks, settings));
              }
              setEditorMode('html');
            }}
          >
            <Code2 size={14} /> <span>Paste HTML</span>
          </button>
        </div>

        {/* Viewport device switcher */}
        <div className="studio-device-toggle">
          <button
            type="button"
            className={device === 'desktop' ? 'active' : ''}
            onClick={() => setDevice('desktop')}
            title="Desktop view (600px)"
          >
            <Monitor size={15} /> <span>Desktop</span>
          </button>
          <button
            type="button"
            className={device === 'mobile' ? 'active' : ''}
            onClick={() => setDevice('mobile')}
            title="Mobile preview (360px)"
          >
            <Smartphone size={15} /> <span>Mobile</span>
          </button>
        </div>

        {/* Actions */}
        <div className="studio-topbar-right">
          {template && (
            <button
              type="button"
              className="studio-btn-subtle"
              onClick={() => void openHistory()}
              disabled={loadingHistory}
            >
              <History size={15} /> Versions
            </button>
          )}

          <button
            type="button"
            className="studio-btn-subtle"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye size={15} /> Preview
          </button>

          <button
            type="button"
            className="button primary studio-save-btn"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </header>

      {/* Optional Feedback banner */}
      {notice && (
        <div className="studio-notice-bar" role="alert">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}><X size={14} /></button>
        </div>
      )}

      {/* ── 3-COLUMN WORKSPACE ────────────────────────────────────────── */}
      <div className="studio-workspace">
        {/* 1. LEFT PANEL: BLOCKS & PRESETS */}
        <aside className="studio-panel-left">
          <div className="studio-tab-row">
            <button
              type="button"
              className={`studio-tab-btn ${activeSidebarTab === 'blocks' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('blocks')}
            >
              <Layers size={14} /> Blocks
            </button>
            <button
              type="button"
              className={`studio-tab-btn ${activeSidebarTab === 'presets' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('presets')}
            >
              <LayoutTemplate size={14} /> Presets
            </button>
          </div>

          <div className="studio-panel-scroll">
            {activeSidebarTab === 'blocks' ? (
              <div className="studio-block-catalog">
                <span className="studio-section-title">CONTENT BLOCKS</span>
                <div className="studio-block-grid">
                  <button type="button" className="studio-block-card" onClick={() => addBlock('heading')}>
                    <Type size={18} />
                    <span>Heading</span>
                  </button>
                  <button type="button" className="studio-block-card" onClick={() => addBlock('text')}>
                    <AlignLeft size={18} />
                    <span>Text</span>
                  </button>
                  <button type="button" className="studio-block-card" onClick={() => addBlock('button')}>
                    <MousePointerClick size={18} />
                    <span>Button</span>
                  </button>
                  <button type="button" className="studio-block-card" onClick={() => addBlock('image')}>
                    <ImageIcon size={18} />
                    <span>Image</span>
                  </button>
                  <button type="button" className="studio-block-card" onClick={() => addBlock('feature')}>
                    <Sparkles size={18} />
                    <span>Feature Card</span>
                  </button>
                  <button type="button" className="studio-block-card" onClick={() => addBlock('divider')}>
                    <Minus size={18} />
                    <span>Divider</span>
                  </button>
                  <button type="button" className="studio-block-card" onClick={() => addBlock('spacer')}>
                    <Layers size={18} />
                    <span>Spacer</span>
                  </button>
                  <button type="button" className="studio-block-card" onClick={() => addBlock('footer')}>
                    <Settings2 size={18} />
                    <span>Footer</span>
                  </button>
                  <button type="button" className="studio-block-card" onClick={() => addBlock('raw_html')}>
                    <Code2 size={18} />
                    <span>Custom HTML</span>
                  </button>
                </div>

                <div className="studio-merge-box">
                  <span className="studio-section-title">CLICK TO COPY MERGE TAG</span>
                  <div className="studio-tags-row">
                    <button type="button" className="studio-tag-pill" onClick={() => copyMergeTag('{{name}}')}>
                      <Copy size={11} /> {'{{name}}'}
                    </button>
                    <button type="button" className="studio-tag-pill" onClick={() => copyMergeTag('{{email}}')}>
                      <Copy size={11} /> {'{{email}}'}
                    </button>
                    <button type="button" className="studio-tag-pill" onClick={() => copyMergeTag('{{company}}')}>
                      <Copy size={11} /> {'{{company}}'}
                    </button>
                    <button type="button" className="studio-tag-pill" onClick={() => copyMergeTag('{{phone}}')}>
                      <Copy size={11} /> {'{{phone}}'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="studio-presets-list">
                <span className="studio-section-title">ONE-CLICK STARTING LAYOUTS</span>
                <article className="studio-preset-card" onClick={() => applyPreset('lead_welcome')}>
                  <b>Lead Welcome & Follow-up</b>
                  <p>Warm intro, bulletproof CTA button, and clear branding for Meta Lead Ads.</p>
                  <span className="studio-preset-apply">Apply template →</span>
                </article>
                <article className="studio-preset-card" onClick={() => applyPreset('meeting_invite')}>
                  <b>Demo & Calendar Invite</b>
                  <p>High-conversion calendar booking request for sales and consultation follow-ups.</p>
                  <span className="studio-preset-apply">Apply template →</span>
                </article>
              </div>
            )}
          </div>
        </aside>

        {/* 2. CENTER CANVAS (REAL EMAIL PREVIEW OR HTML CODE EDITOR) */}
        {editorMode === 'html' ? (
          <main className="studio-html-editor-workspace">
            <div className="studio-html-pane-code">
              <div className="studio-html-pane-header">
                <span className="studio-pane-title">
                  <Code2 size={14} /> PASTE / EDIT HTML CODE
                </span>
                <span className="studio-pane-badge">Direct HTML</span>
              </div>
              <textarea
                className="studio-html-textarea"
                value={rawHtmlSource}
                onChange={e => {
                  setRawHtmlSource(e.target.value);
                  setDirty(true);
                }}
                placeholder="<!DOCTYPE html><html><head>...</head><body><table width='100%'>...</table></body></html>"
                spellCheck={false}
              />
            </div>

            <div className="studio-html-pane-preview" style={{ backgroundColor: settings.backgroundColor }}>
              <div className="studio-html-pane-header">
                <span className="studio-pane-title">
                  <Eye size={14} /> LIVE PREVIEW ({device === 'mobile' ? '360px' : '600px'})
                </span>
              </div>
              <div className="studio-html-iframe-wrap">
                <iframe
                  title="Live email HTML preview"
                  className={`studio-html-iframe ${device === 'mobile' ? 'is-mobile' : ''}`}
                  sandbox=""
                  srcDoc={previewHtml}
                />
              </div>
            </div>
          </main>
        ) : (
          <main
            className="studio-center-canvas"
            style={{ backgroundColor: settings.backgroundColor }}
            onClick={() => {
              // Clicking canvas clears selection
              setSelectedBlockId(null);
              setActiveInspectorTab('settings');
            }}
          >
            <div
              className={`studio-email-paper ${device === 'mobile' ? 'is-mobile-view' : ''}`}
            style={{ backgroundColor: settings.cardColor }}
            onClick={e => e.stopPropagation()}
          >
            {blocks.map((block, index) => {
              const isSelected = block.id === selectedBlockId;

              return (
                <div
                  key={block.id}
                  className={`studio-canvas-block ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    setSelectedBlockId(block.id);
                    setActiveInspectorTab('block');
                  }}
                >
                  {/* Floating Action Bar */}
                  {isSelected && (
                    <div className="studio-block-actions">
                      <button
                        type="button"
                        title="Move Up"
                        disabled={index === 0}
                        onClick={e => {
                          e.stopPropagation();
                          moveBlock(index, 'up');
                        }}
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        title="Move Down"
                        disabled={index === blocks.length - 1}
                        onClick={e => {
                          e.stopPropagation();
                          moveBlock(index, 'down');
                        }}
                      >
                        <ChevronDown size={13} />
                      </button>
                      <button
                        type="button"
                        title="Duplicate"
                        onClick={e => {
                          e.stopPropagation();
                          duplicateBlock(block);
                        }}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        className="is-danger"
                        onClick={e => {
                          e.stopPropagation();
                          deleteBlock(block.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}

                  {/* Block Content Render */}
                  {block.type === 'heading' && (
                    <div style={{ textAlign: block.content.align || 'left', color: block.content.color || '#1a241e' }}>
                      {block.content.level === 'h1' ? (
                        <h1 className="studio-block-h1">{String(block.content.text || '').replace(/\u00A0/g, ' ')}</h1>
                      ) : block.content.level === 'h3' ? (
                        <h3 className="studio-block-h3">{String(block.content.text || '').replace(/\u00A0/g, ' ')}</h3>
                      ) : (
                        <h2 className="studio-block-h2">{String(block.content.text || '').replace(/\u00A0/g, ' ')}</h2>
                      )}
                    </div>
                  )}

                  {block.type === 'text' && (
                    <div
                      className="studio-block-text"
                      style={{ textAlign: block.content.align || 'left', color: block.content.color || '#4a574f' }}
                    >
                      {String(block.content.text || '')
                        .replace(/\u00A0/g, ' ')
                        .split('\n')
                        .map((line, i) => (
                          <p key={i}>{line || '\u00A0'}</p>
                        ))}
                    </div>
                  )}

                  {block.type === 'button' && (
                    <div style={{ textAlign: block.content.align || 'center', padding: '8px 0' }}>
                      <span
                        className="studio-block-button-preview"
                        style={{
                          backgroundColor: block.content.bgColor || settings.primaryColor,
                          color: block.content.textColor || '#ffffff',
                          borderRadius: `${block.content.borderRadius || 8}px`,
                        }}
                      >
                        {String(block.content.text || '').replace(/\u00A0/g, ' ')}
                      </span>
                    </div>
                  )}

                  {block.type === 'image' && (
                    <div style={{ textAlign: block.content.align || 'center' }}>
                      <img
                        src={block.content.url}
                        alt={block.content.alt || ''}
                        style={{ maxWidth: block.content.width || '100%', borderRadius: 8 }}
                      />
                    </div>
                  )}

                  {block.type === 'feature' && (
                    <div
                      className="studio-block-feature"
                      style={{ backgroundColor: block.content.bg || '#f3f8f5' }}
                    >
                      {block.content.badge && <small>{String(block.content.badge).replace(/\u00A0/g, ' ')}</small>}
                      <strong>{String(block.content.title || '').replace(/\u00A0/g, ' ')}</strong>
                      <p>{String(block.content.description || '').replace(/\u00A0/g, ' ')}</p>
                    </div>
                  )}

                  {block.type === 'divider' && (
                    <hr style={{ border: 0, borderTop: `1px solid ${block.content.color || '#e5eae6'}` }} />
                  )}

                  {block.type === 'spacer' && (
                    <div
                      className="studio-block-spacer-preview"
                      style={{ height: `${block.content.height || 24}px` }}
                    >
                      <span>Spacer ({block.content.height || 24}px)</span>
                    </div>
                  )}

                  {block.type === 'footer' && (
                    <div className="studio-block-footer-preview">
                      <strong>{block.content.company}</strong>
                      <p>{block.content.address}</p>
                      <small>{block.content.unsubscribeText}</small>
                    </div>
                  )}

                  {block.type === 'raw_html' && (
                    <div className="studio-block-raw-html-preview">
                      <div dangerouslySetInnerHTML={{ __html: block.content.html || '' }} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Quick add block at bottom */}
            <div className="studio-add-dropzone">
              <button
                type="button"
                className="studio-add-btn"
                onClick={() => addBlock('text')}
              >
                <Plus size={14} /> Add text block
              </button>
              <button
                type="button"
                className="studio-add-btn"
                onClick={() => addBlock('button')}
              >
                <Plus size={14} /> Add button
              </button>
            </div>
          </div>
        </main>
      )}

        {/* 3. RIGHT PANEL: INSPECTOR & SETTINGS */}
        <aside className="studio-panel-right">
          <div className="studio-tab-row">
            <button
              type="button"
              className={`studio-tab-btn ${activeInspectorTab === 'block' ? 'active' : ''}`}
              onClick={() => setActiveInspectorTab('block')}
              disabled={!selectedBlock}
            >
              Element Style
            </button>
            <button
              type="button"
              className={`studio-tab-btn ${activeInspectorTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveInspectorTab('settings')}
            >
              Email Settings
            </button>
          </div>

          <div className="studio-panel-scroll">
            {activeInspectorTab === 'block' && selectedBlock ? (
              <div className="studio-properties-form">
                <span className="studio-section-title">
                  EDITING {selectedBlock.type.toUpperCase()}
                </span>

                {/* Heading properties */}
                {selectedBlock.type === 'heading' && (
                  <>
                    <label className="studio-field">
                      <span>Heading Text</span>
                      <input
                        value={selectedBlock.content.text || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { text: e.target.value })}
                      />
                    </label>
                    <div className="studio-field-row">
                      <label className="studio-field">
                        <span>Level</span>
                        <select
                          value={selectedBlock.content.level || 'h2'}
                          onChange={e => updateBlockContent(selectedBlock.id, { level: e.target.value })}
                        >
                          <option value="h1">H1 (Large)</option>
                          <option value="h2">H2 (Medium)</option>
                          <option value="h3">H3 (Eyebrow)</option>
                        </select>
                      </label>
                      <label className="studio-field">
                        <span>Color</span>
                        <input
                          type="color"
                          value={selectedBlock.content.color || '#1a241e'}
                          onChange={e => updateBlockContent(selectedBlock.id, { color: e.target.value })}
                        />
                      </label>
                    </div>
                    <label className="studio-field">
                      <span>Alignment</span>
                      <div className="studio-align-group">
                        <button
                          type="button"
                          className={selectedBlock.content.align === 'left' ? 'active' : ''}
                          onClick={() => updateBlockContent(selectedBlock.id, { align: 'left' })}
                        >
                          <AlignLeft size={14} />
                        </button>
                        <button
                          type="button"
                          className={selectedBlock.content.align === 'center' ? 'active' : ''}
                          onClick={() => updateBlockContent(selectedBlock.id, { align: 'center' })}
                        >
                          <AlignCenter size={14} />
                        </button>
                        <button
                          type="button"
                          className={selectedBlock.content.align === 'right' ? 'active' : ''}
                          onClick={() => updateBlockContent(selectedBlock.id, { align: 'right' })}
                        >
                          <AlignRight size={14} />
                        </button>
                      </div>
                    </label>
                  </>
                )}

                {/* Text properties */}
                {selectedBlock.type === 'text' && (
                  <>
                    <label className="studio-field">
                      <span>Paragraph Content</span>
                      <textarea
                        rows={7}
                        value={selectedBlock.content.text || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { text: e.target.value })}
                      />
                    </label>
                    <div className="studio-field-row">
                      <label className="studio-field">
                        <span>Text Color</span>
                        <input
                          type="color"
                          value={selectedBlock.content.color || '#4a574f'}
                          onChange={e => updateBlockContent(selectedBlock.id, { color: e.target.value })}
                        />
                      </label>
                      <label className="studio-field">
                        <span>Alignment</span>
                        <div className="studio-align-group">
                          <button
                            type="button"
                            className={selectedBlock.content.align === 'left' ? 'active' : ''}
                            onClick={() => updateBlockContent(selectedBlock.id, { align: 'left' })}
                          >
                            <AlignLeft size={14} />
                          </button>
                          <button
                            type="button"
                            className={selectedBlock.content.align === 'center' ? 'active' : ''}
                            onClick={() => updateBlockContent(selectedBlock.id, { align: 'center' })}
                          >
                            <AlignCenter size={14} />
                          </button>
                        </div>
                      </label>
                    </div>
                  </>
                )}

                {/* Button properties */}
                {selectedBlock.type === 'button' && (
                  <>
                    <label className="studio-field">
                      <span>Button Label</span>
                      <input
                        value={selectedBlock.content.text || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { text: e.target.value })}
                      />
                    </label>
                    <label className="studio-field">
                      <span>Destination Link URL</span>
                      <input
                        value={selectedBlock.content.url || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { url: e.target.value })}
                        placeholder="https://yourlink.com"
                      />
                    </label>
                    <div className="studio-field-row">
                      <label className="studio-field">
                        <span>Button Color</span>
                        <input
                          type="color"
                          value={selectedBlock.content.bgColor || settings.primaryColor}
                          onChange={e => updateBlockContent(selectedBlock.id, { bgColor: e.target.value })}
                        />
                      </label>
                      <label className="studio-field">
                        <span>Text Color</span>
                        <input
                          type="color"
                          value={selectedBlock.content.textColor || '#ffffff'}
                          onChange={e => updateBlockContent(selectedBlock.id, { textColor: e.target.value })}
                        />
                      </label>
                    </div>
                    <label className="studio-field">
                      <span>Corner Radius ({selectedBlock.content.borderRadius || 8}px)</span>
                      <input
                        type="range"
                        min="0"
                        max="30"
                        value={selectedBlock.content.borderRadius || 8}
                        onChange={e => updateBlockContent(selectedBlock.id, { borderRadius: Number(e.target.value) })}
                      />
                    </label>
                  </>
                )}

                {/* Image properties */}
                {selectedBlock.type === 'image' && (
                  <>
                    <label className="studio-field">
                      <span>Image URL</span>
                      <input
                        value={selectedBlock.content.url || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { url: e.target.value })}
                      />
                    </label>
                    <label className="studio-field">
                      <span>Alt Text</span>
                      <input
                        value={selectedBlock.content.alt || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { alt: e.target.value })}
                      />
                    </label>
                  </>
                )}

                {/* Feature card properties */}
                {selectedBlock.type === 'feature' && (
                  <>
                    <label className="studio-field">
                      <span>Badge / Tag</span>
                      <input
                        value={selectedBlock.content.badge || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { badge: e.target.value })}
                      />
                    </label>
                    <label className="studio-field">
                      <span>Feature Title</span>
                      <input
                        value={selectedBlock.content.title || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { title: e.target.value })}
                      />
                    </label>
                    <label className="studio-field">
                      <span>Description</span>
                      <textarea
                        rows={4}
                        value={selectedBlock.content.description || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { description: e.target.value })}
                      />
                    </label>
                  </>
                )}

                {/* Spacer properties */}
                {selectedBlock.type === 'spacer' && (
                  <label className="studio-field">
                    <span>Height ({selectedBlock.content.height || 24}px)</span>
                    <input
                      type="range"
                      min="8"
                      max="80"
                      step="4"
                      value={selectedBlock.content.height || 24}
                      onChange={e => updateBlockContent(selectedBlock.id, { height: Number(e.target.value) })}
                    />
                  </label>
                )}

                {/* Footer properties */}
                {selectedBlock.type === 'footer' && (
                  <>
                    <label className="studio-field">
                      <span>Company / Brand Line</span>
                      <input
                        value={selectedBlock.content.company || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { company: e.target.value })}
                      />
                    </label>
                    <label className="studio-field">
                      <span>Address / Notice</span>
                      <textarea
                        rows={3}
                        value={selectedBlock.content.address || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { address: e.target.value })}
                      />
                    </label>
                  </>
                )}

                {/* Raw HTML block properties */}
                {selectedBlock.type === 'raw_html' && (
                  <>
                    <label className="studio-field">
                      <span>Raw HTML Markup</span>
                      <textarea
                        rows={12}
                        className="html-code-area"
                        value={selectedBlock.content.html || ''}
                        onChange={e => updateBlockContent(selectedBlock.id, { html: e.target.value })}
                        placeholder="<table>...</table>"
                      />
                      <small>You can paste tables, styling, buttons, or custom badges directly. Supports merge tags.</small>
                    </label>
                  </>
                )}
              </div>
            ) : (
              <div className="studio-properties-form">
                <span className="studio-section-title">GLOBAL EMAIL SETTINGS</span>

                <label className="studio-field">
                  <span>Default Subject Line</span>
                  <input
                    value={settings.subject}
                    onChange={e => {
                      setSettings(s => ({ ...s, subject: e.target.value }));
                      setDirty(true);
                    }}
                    placeholder="Thanks for reaching out, {{name}}"
                  />
                  <small>Can also be customized per campaign send.</small>
                </label>

                <label className="studio-field">
                  <span>Preheader (Inbox preview text)</span>
                  <input
                    value={settings.preheader}
                    onChange={e => {
                      setSettings(s => ({ ...s, preheader: e.target.value }));
                      setDirty(true);
                    }}
                    placeholder="Brief 1-sentence teaser shown in inbox"
                  />
                </label>

                <div className="studio-field-row">
                  <label className="studio-field">
                    <span>Email Backdrop</span>
                    <input
                      type="color"
                      value={settings.backgroundColor}
                      onChange={e => {
                        setSettings(s => ({ ...s, backgroundColor: e.target.value }));
                        setDirty(true);
                      }}
                    />
                  </label>
                  <label className="studio-field">
                    <span>Card Paper</span>
                    <input
                      type="color"
                      value={settings.cardColor}
                      onChange={e => {
                        setSettings(s => ({ ...s, cardColor: e.target.value }));
                        setDirty(true);
                      }}
                    />
                  </label>
                </div>

                <label className="studio-field">
                  <span>Brand Primary Color</span>
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={e => {
                      setSettings(s => ({ ...s, primaryColor: e.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── MODALS: PREVIEW & HISTORY ─────────────────────────────────── */}
      {previewOpen && (
        <div
          className="studio-preview-overlay"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setPreviewOpen(false);
          }}
        >
          <section className="studio-preview-dialog">
            <header>
              <div>
                <b>Email Preview</b>
                {settings.subject ? <small>{settings.subject}</small> : null}
              </div>
              <button
                type="button"
                className="button secondary button-sm"
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
            </header>
            <iframe
              title="Responsive email preview"
              sandbox=""
              srcDoc={previewHtml}
            />
          </section>
        </div>
      )}

      {historyOpen && (
        <div
          className="studio-preview-overlay"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setHistoryOpen(false);
          }}
        >
          <section className="studio-history-dialog">
            <header>
              <div>
                <b>Saved Versions</b>
                <small>Restore any previous design. Restoring generates a new version.</small>
              </div>
              <button
                type="button"
                className="button secondary button-sm"
                onClick={() => setHistoryOpen(false)}
              >
                Close
              </button>
            </header>
            <div className="studio-version-list">
              {versions.map(v => (
                <article key={v.id}>
                  <span className="studio-version-number">V{v.version_number}</span>
                  <div>
                    <b>{v.name}</b>
                    <small>{v.subject}</small>
                    <small>{new Date(v.created_at).toLocaleString()}</small>
                  </div>
                  <button
                    type="button"
                    className="button secondary button-sm"
                    disabled={saving || v.version_number === template?.version_number}
                    onClick={() => void restoreVersion(v)}
                  >
                    {v.version_number === template?.version_number ? 'Current' : 'Restore'}
                  </button>
                </article>
              ))}
              {!versions.length && (
                <p style={{ textAlign: 'center', color: '#888', padding: '30px 0' }}>
                  No previous versions saved yet.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
