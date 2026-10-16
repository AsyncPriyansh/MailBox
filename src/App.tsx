import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  Code2,
  Eye,
  FileSpreadsheet,
  HelpCircle,
  LayoutDashboard,
  CalendarDays,
  FileText,
  History,
  Pencil,
  Mail,
  MailCheck,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Trash2,
} from 'lucide-react';
import type { Lead } from './types/domain';
import { ApiError } from './services/http';
import { leadsApi } from './services/leadsApi';
import { campaignsApi, dashboardApi } from './services/campaignsApi';
import { parseLeadCsv, downloadLeadCsv } from './features/leads/csv';
import { templatesApi, emailSettingsApi, type EmailTemplate, type EmailSettings } from './services/templatesApi';
import { googleSheetsApi, type SheetsSyncStatus } from './services/googleSheetsApi';
import { TemplateStudio } from './features/templates/TemplateStudio';
import { LoginPage } from './features/auth/LoginPage';
import { authApi, type AuthUser } from './services/authApi';
import { LogOut } from 'lucide-react';

type UiLead = Lead & { date: string };

const statusClass = (s: string) => s.toLowerCase();

const toUiLead = (lead: Lead): UiLead => ({
  ...lead,
  date: new Date(lead.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
});

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('mailbox_auth_user');
      const token = localStorage.getItem('mailbox_auth_token');
      return saved && token ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authChecking, setAuthChecking] = useState(true);

  const [leads, setLeads] = useState<UiLead[]>([]);
  const [stats, setStats] = useState({ totalLeads: 0, newLeads: 0, contactedLeads: 0 });
  const [recentCampaigns, setRecentCampaigns] = useState<any[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const [active, setActive] = useState<'Overview' | 'Leads' | 'Campaigns' | 'Templates' | 'Calendar' | 'Suppression list' | 'Settings'>('Leads');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All leads');
  const [timeRange, setTimeRange] = useState<'all' | 'today' | '7days' | '30days' | '90days' | 'year'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState<'import' | 'campaign' | null>(null);
  const [templateStudioOpen,setTemplateStudioOpen]=useState(false);
  const [templates,setTemplates]=useState<EmailTemplate[]>([]);
  const [emailSettings,setEmailSettings]=useState<EmailSettings|null>(null);
  const [emailSettingsError,setEmailSettingsError]=useState('');
  const [savingEmailSettings,setSavingEmailSettings]=useState(false);
  const [settingsNotice,setSettingsNotice]=useState('');
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const [openLeadActions,setOpenLeadActions]=useState<string|null>(null);
  const [sortNewestFirst,setSortNewestFirst]=useState(true);
  const [leadPage,setLeadPage]=useState(1);
  const [sheetsStatus,setSheetsStatus]=useState<SheetsSyncStatus|null>(null);
  const [sheetSetupOpen,setSheetSetupOpen]=useState(false);
  const [sheetUrl,setSheetUrl]=useState('');
  const [sheetRange,setSheetRange]=useState('Leads!A1:Z5000');
  const [syncingSheet,setSyncingSheet]=useState(false);
  const [emailHtml,setEmailHtml]=useState('');
  const [editingTemplate,setEditingTemplate]=useState<EmailTemplate|null>(null);
  const [pasteHtmlOpen, setPasteHtmlOpen] = useState(false);
  const [pastedHtmlCode, setPastedHtmlCode] = useState('');
  const [pastedHtmlName, setPastedHtmlName] = useState('');
  const [pastedHtmlSubject, setPastedHtmlSubject] = useState('');
  const [savingPastedHtml, setSavingPastedHtml] = useState(false);
  const [selectedTemplateId,setSelectedTemplateId]=useState('');
  const [scheduleAt,setScheduleAt]=useState('');
  const [calendarMonth,setCalendarMonth]=useState(()=>new Date());
  const [fileName, setFileName] = useState('meta-leads-october.csv');
  const [notice, setNotice] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => {
    localStorage.removeItem('mailbox_auth_token');
    localStorage.removeItem('mailbox_auth_user');
    setCurrentUser(null);
  };

  const fetchWorkspaceData = async () => {
    if (!localStorage.getItem('mailbox_auth_token')) return;
    setIsRetrying(true);
    try {
      const settingsRequest = emailSettingsApi.get().then(value => ({ value, error: '' })).catch(error => ({ value: null, error: error instanceof Error ? error.message : 'Email settings request failed.' }));
      const [result, dashboard, templateResult, campaignResult, sheetStatus, settingsResult] = await Promise.all([leadsApi.list(), dashboardApi.stats(), templatesApi.list(), campaignsApi.list(), googleSheetsApi.status(), settingsRequest]);
      setLeads(result.leads.map(toUiLead));
      setStats(dashboard.stats);
      setRecentCampaigns(campaignResult.campaigns.length?campaignResult.campaigns:dashboard.recentCampaigns);
      setTemplates(templateResult.templates);
      setEmailSettings(settingsResult.value);
      setEmailSettingsError(settingsResult.error);
      setSheetsStatus(sheetStatus);
      setServiceError('');
      setDataReady(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLogout();
        return;
      }
      setServiceError(
        error instanceof ApiError && error.status === 503
          ? error.message
          : 'Mailbox API server is offline. Check server connection.'
      );
      setDataReady(true);
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('mailbox_auth_token');
    if (!token) {
      setAuthChecking(false);
      return;
    }
    authApi.me()
      .then((res) => {
        setCurrentUser(res.user);
        void fetchWorkspaceData();
      })
      .catch(() => {
        handleLogout();
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  useEffect(()=>{const url=new URL(window.location.href);const result=url.searchParams.get('google');if(result){window.history.replaceState({},'',url.pathname);if(result==='connected'){setNotice('Google account connected. Add your spreadsheet link to finish setup.');setSheetSetupOpen(true);}else if(result==='cancelled')setNotice('Google connection was cancelled.');else setNotice('Google could not be connected. Check server OAuth settings and try again.');void googleSheetsApi.status().then(setSheetsStatus).catch(()=>{});}},[]);

  useEffect(()=>{const timer=window.setInterval(()=>{void fetchWorkspaceData();},60000);return()=>window.clearInterval(timer);},[]);

  // Keyboard shortcut: Cmd/Ctrl + K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setActive('Leads');
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const todayLeads = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return leads.filter(l => new Date(l.createdAt).getTime() >= startOfToday);
  }, [leads]);

  const filtered = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const rangeStarts: Record<typeof timeRange, number> = {
      all: Number.NEGATIVE_INFINITY,
      today: startOfToday,
      '7days': startOfToday - 6 * 24 * 60 * 60 * 1000,
      '30days': startOfToday - 29 * 24 * 60 * 60 * 1000,
      '90days': startOfToday - 89 * 24 * 60 * 60 * 1000,
      year: new Date(now.getFullYear(), 0, 1).getTime(),
    };

    return leads.filter(l => {
      const matchesQuery = `${l.name} ${l.email} ${l.phone||''} ${l.company || ''} ${l.campaign || ''} ${l.formName||''} ${l.sourceLeadStatus||''}`
        .toLowerCase()
        .includes(query.toLowerCase());
      if (!matchesQuery) return false;

      const matchesStatus = filter === 'All leads' || l.status === filter.toLowerCase();
      if (!matchesStatus) return false;

      return new Date(l.createdAt).getTime() >= rangeStarts[timeRange];
    });
  }, [leads, query, filter, timeRange]);

  const sortedFiltered = useMemo(() => [...filtered].sort((a, b) => {
    const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortNewestFirst ? -delta : delta;
  }), [filtered, sortNewestFirst]);
  const leadsPerPage = 25;
  const pageCount = Math.max(1, Math.ceil(sortedFiltered.length / leadsPerPage));
  const visibleLeads = sortedFiltered.slice((leadPage - 1) * leadsPerPage, leadPage * leadsPerPage);

  useEffect(() => { setLeadPage(1); }, [query, filter, timeRange]);

  const selectedRangeCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const starts: Record<typeof timeRange, number> = {
      all: Number.NEGATIVE_INFINITY,
      today: today.getTime(),
      '7days': today.getTime() - 6 * 24 * 60 * 60 * 1000,
      '30days': today.getTime() - 29 * 24 * 60 * 60 * 1000,
      '90days': today.getTime() - 89 * 24 * 60 * 60 * 1000,
      year: new Date(today.getFullYear(), 0, 1).getTime(),
    };
    return leads.filter(lead => new Date(lead.createdAt).getTime() >= starts[timeRange]).length;
  }, [leads, timeRange]);

  const toggle = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const toggleAll = () =>
    setSelected(s =>
      filtered.every(l => s.includes(l.id))
        ? s.filter(id => !filtered.some(l => l.id === id))
        : [...new Set([...s, ...filtered.map(l => l.id)])]
    );

  const toggleSelectToday = () => {
    const todayIds = todayLeads.map(l => l.id);
    if (!todayIds.length) return;
    const allSelected = todayIds.every(id => selected.includes(id));
    if (allSelected) {
      setSelected(s => s.filter(id => !todayIds.includes(id)));
    } else {
      setSelected(s => [...new Set([...s, ...todayIds])]);
    }
  };

  const syncGoogleSheet = async()=>{setSyncingSheet(true);try{const result=await googleSheetsApi.syncNow();const [leadResult,dashboard,sheetStatus]=await Promise.all([leadsApi.list(),dashboardApi.stats(),googleSheetsApi.status()]);setLeads(leadResult.leads.map(toUiLead));setStats(dashboard.stats);setSheetsStatus(sheetStatus);setNotice(`Google Sheet synced: ${result.imported} lead rows processed.`);}catch(error){setNotice(error instanceof Error?error.message:'Google Sheets sync failed.');}finally{setSyncingSheet(false);}};
  const connectGoogle=async()=>{try{const{authUrl}=await googleSheetsApi.connectUrl();window.location.assign(authUrl);}catch(error){setNotice(error instanceof Error?error.message:'Could not start Google connection.');}};
  const saveGoogleSheet=async(e:FormEvent)=>{e.preventDefault();setSyncingSheet(true);try{const result=await googleSheetsApi.saveSheet(sheetUrl,sheetRange);const[status,leadResult,dashboard]=await Promise.all([googleSheetsApi.status(),leadsApi.list(),dashboardApi.stats()]);setSheetsStatus(status);setLeads(leadResult.leads.map(toUiLead));setStats(dashboard.stats);setSheetSetupOpen(false);setNotice(`Connected ${result.spreadsheetTitle||'Google Sheet'} and synced ${result.imported} leads.`);}catch(error){setNotice(error instanceof Error?error.message:'Could not connect spreadsheet.');}finally{setSyncingSheet(false);}};
  const disconnectGoogle=async()=>{try{await googleSheetsApi.disconnect();setSheetsStatus(await googleSheetsApi.status());setNotice('Google Sheets disconnected.');}catch(error){setNotice(error instanceof Error?error.message:'Could not disconnect Google.');}};

  const parseCSV = async (text: string) => {
    try {
      const rows = parseLeadCsv(text);
      const result = await leadsApi.importRows(rows);
      const live = await leadsApi.list();
      setLeads(live.leads.map(toUiLead));
      setNotice(`${result.imported} leads synced from ${fileName}.`);
      setModal(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import leads.');
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => parseCSV(String(reader.result || ''));
    reader.readAsText(f);
  };

  const onTemplateSaved=(template:EmailTemplate)=>{setTemplates(current=>[template,...current.filter(item=>item.id!==template.id)]);setEditingTemplate(template);setTemplateStudioOpen(false);setNotice(`Saved “${template.name}” as version ${template.version_number}.`);};

  const handleDeleteTemplate = (template: EmailTemplate) => {
    setConfirmDialog({
      open: true,
      title: 'Delete template',
      message: `Are you sure you want to delete "${template.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete template',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await templatesApi.remove(template.id);
          setTemplates(current => current.filter(t => t.id !== template.id));
          if (emailSettings?.welcomeTemplateId === template.id) {
            await emailSettingsApi.saveWelcome(null);
            setEmailSettings(current => current ? { ...current, welcomeTemplateId: null, welcomeTemplate: null } : null);
          }
          setNotice(`Deleted template "${template.name}".`);
        } catch (err: any) {
          setNotice(err?.message || 'Failed to delete template.');
        }
      }
    });
  };

  const savePastedTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!pastedHtmlName.trim()) {
      setNotice('Please provide a name for this template.');
      return;
    }
    if (!pastedHtmlCode.trim()) {
      setNotice('Please paste your email HTML code.');
      return;
    }
    setSavingPastedHtml(true);
    try {
      const result = await templatesApi.save({
        name: pastedHtmlName.trim(),
        subject: pastedHtmlSubject.trim() || pastedHtmlName.trim(),
        preheader: '',
        html: pastedHtmlCode.trim(),
        projectJson: {
          version: 2,
          isRawHtml: true,
          blocks: [
            {
              id: `block-${Date.now()}`,
              type: 'raw_html',
              content: { html: pastedHtmlCode.trim() },
            },
          ],
          settings: {
            subject: pastedHtmlSubject.trim() || pastedHtmlName.trim(),
          },
        },
      });
      setTemplates(current => [result.template, ...current.filter(t => t.id !== result.template.id)]);
      setPasteHtmlOpen(false);
      setPastedHtmlName('');
      setPastedHtmlSubject('');
      setPastedHtmlCode('');
      setNotice(`Saved HTML template “${result.template.name}” successfully!`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not save HTML template.');
    } finally {
      setSavingPastedHtml(false);
    }
  };

  const sendCampaign = async (e: FormEvent) => {
    e.preventDefault();
    const chosenTemplate = templates.find(t => t.id === selectedTemplateId);
    const effectiveSubject = subject || chosenTemplate?.subject || campaignName || 'New Campaign Outreach';
    const finalHtml = emailHtml || chosenTemplate?.html_source || (message ? `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6">${message
      .split(/\n{2,}/)
      .map(part => `<p>${part.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
      .join('')}</div>` : '');

    if (!campaignName.trim() || !finalHtml.trim()) return;
    setBusy(true);
    try {
      const leadIds = selected.length
        ? selected
        : leads.filter(l => l.status === 'new').map(l => l.id);
      const result = await campaignsApi.create({
        name: campaignName.trim(),
        subject: effectiveSubject,
        templateId: selectedTemplateId || null,
        scheduledAt: scheduleAt ? new Date(scheduleAt).toISOString() : null,
        html: finalHtml,
        leadIds,
      });
      setNotice(result.scheduledAt ? `Campaign scheduled for ${new Date(result.scheduledAt).toLocaleString()} for ${result.scheduledRecipients} leads.` : `Campaign queued for ${result.queued} leads; ${result.suppressed} suppressed.`);
      setModal(null);
      setCampaignName('');
      setSubject('');
      setMessage('');
      setEmailHtml('');
      setScheduleAt('');
      setSelectedTemplateId('');
      void fetchWorkspaceData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to queue campaign.');
    } finally {
      setBusy(false);
    }
  };

  // Activity chart: Dynamic trailing 7 days
  const activityDays = useMemo(() => {
    const list: { label: string; count: number; height: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayLabel = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      const count = leads.filter(l => {
        const leadDate = new Date(l.createdAt);
        return leadDate.toDateString() === d.toDateString();
      }).length;
      list.push({ label: dayLabel, count, height: 0 });
    }
    const maxVal = Math.max(...list.map(x => x.count), 1);
    return list.map(item => ({
      ...item,
      height: item.count > 0 ? Math.max(Math.round((item.count / maxVal) * 100), 16) : 4,
    }));
  }, [leads]);

  // Count leads added in the last 7 days
  const newThisWeek = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return leads.filter(l => new Date(l.createdAt) >= sevenDaysAgo).length;
  }, [leads]);

  const welcomeTemplate = emailSettings?.welcomeTemplate || null;
  const hasMetaFormDetails = leads.some(lead => lead.formName || lead.sourceLeadStatus);
  const welcomeEmailSummary = useMemo(() => ({
    sent: leads.filter(lead => lead.welcomeEmailStatus === 'sent' || lead.welcomeEmailStatus === 'delivered').length,
    sending: leads.filter(lead => lead.welcomeEmailStatus === 'queued' || lead.welcomeEmailStatus === 'scheduled' || lead.welcomeEmailStatus === 'sending').length,
    failed: leads.filter(lead => lead.welcomeEmailStatus === 'failed' || lead.welcomeEmailStatus === 'bounced').length,
    notSent: leads.filter(lead => !lead.welcomeEmailStatus).length,
  }), [leads]);

  const welcomeSummaryPanel = (
    <div className="welcome-summary-panel">
      <div className="welcome-summary-heading">
        <span className="welcome-summary-icon"><MailCheck size={17}/></span>
        <div><h2>Welcome email</h2><p>{welcomeTemplate ? `Automatic · ${welcomeTemplate.name}` : 'Not configured'}</p></div>
        <span className={`welcome-setup-badge ${welcomeTemplate && emailSettings?.provider.configured ? 'active' : 'needs-setup'}`}>{!welcomeTemplate ? 'Setup needed' : emailSettings?.provider.configured ? 'Configured' : 'Provider setup needed'}</span>
      </div>
      <div className="welcome-summary-counts">
        <div><b>{welcomeEmailSummary.sent}</b><span>Sent</span></div>
        <div><b>{welcomeEmailSummary.sending}</b><span>In progress</span></div>
        <div><b>{welcomeEmailSummary.failed}</b><span>Failed</span></div>
        <div><b>{welcomeEmailSummary.notSent}</b><span>Not sent</span></div>
      </div>
      <p className="welcome-summary-help">{welcomeTemplate ? `New leads from Sheets, CSV, or the secure form hook use this template. ${emailSettings?.provider.configured ? `ZeptoMail credentials are present for ${emailSettings.provider.sender}; actual delivery is reflected per lead.` : 'Set valid ZeptoMail credentials on the server before sending.'}` : 'Choose a saved template for automatic new-lead emails.'} Counts cover all {leads.length} leads currently synced.</p>
      <button className="link-button" onClick={() => setActive('Templates')}>{welcomeTemplate ? 'Edit welcome template' : 'Set up welcome email'} <ArrowRight size={13}/></button>
    </div>
  );

  const saveWelcomeTemplate = async (templateId: string) => {
    setSavingEmailSettings(true);
    setSettingsNotice('');
    try {
      const result = await emailSettingsApi.saveWelcome(templateId || null);
      setEmailSettings(result);
      setEmailSettingsError('');
      setSettingsNotice(templateId ? 'Welcome email automation saved.' : 'Welcome email automation turned off.');
      void fetchWorkspaceData();
    } catch (error) {
      setSettingsNotice(error instanceof Error ? error.message : 'Could not save email settings. Apply migration 006 and try again.');
    } finally {
      setSavingEmailSettings(false);
    }
  };

  const updateLeadStatus = async (lead: UiLead) => {
    const status = lead.status === 'contacted' ? 'new' : 'contacted';
    try {
      await leadsApi.updateStatus(lead.id, status);
      setLeads(current => current.map(item => item.id === lead.id ? { ...item, status } : item));
      setStats(current => ({ ...current, newLeads: Math.max(0, current.newLeads + (status === 'new' ? 1 : 0) - (lead.status === 'new' ? 1 : 0)), contactedLeads: Math.max(0, current.contactedLeads + (status === 'contacted' ? 1 : 0) - (lead.status === 'contacted' ? 1 : 0)) }));
      setNotice(status === 'contacted' ? `${lead.name || lead.email} marked contacted.` : `${lead.name || lead.email} marked new.`);
      setOpenLeadActions(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update lead status.');
    }
  };

  const retryWelcome = async (lead: UiLead) => {
    try {
      await leadsApi.retryWelcome(lead.id);
      setNotice(`Welcome email sent to ${lead.email}.`);
      setOpenLeadActions(null);
      void fetchWorkspaceData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not retry welcome email.');
    }
  };

  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <div className="loading-indicator" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        onSuccess={(user) => {
          setCurrentUser(user);
          void fetchWorkspaceData();
        }}
      />
    );
  }

  if(templateStudioOpen)return <TemplateStudio template={editingTemplate} onBack={()=>setTemplateStudioOpen(false)} onSaved={onTemplateSaved}/>;

  return (
    <>
    <div className="app-shell">
      {serviceError && (
        <div className="service-banner" role="alert">
          <ShieldAlert size={16} className="service-banner-icon" />
          <span className="service-banner-text">{serviceError}</span>
          <div className="service-banner-actions">
            <button
              className="service-retry-btn"
              onClick={fetchWorkspaceData}
              disabled={isRetrying}
            >
              <RefreshCw size={12} className={isRetrying ? 'spin' : ''} />
              <span>{isRetrying ? 'Retrying…' : 'Retry'}</span>
            </button>
            <button
              className="service-dismiss-btn"
              aria-label="Dismiss banner"
              onClick={() => setServiceError('')}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Mail size={17} />
          </div>
          <span className="brand-title">Mailbox</span>
          <span className="brand-beta">BETA</span>
        </div>

        <div className="nav-label">NAVIGATION</div>
        <nav>
          {[
            { name: 'Overview', icon: LayoutDashboard },
            { name: 'Leads', icon: Users },
            { name: 'Campaigns', icon: Send },
            { name: 'Templates', icon: FileText },
            { name: 'Calendar', icon: CalendarDays },
          ].map(n => {
            const Icon = n.icon;
            const isTabActive = active === n.name;
            return (
              <button
                key={n.name}
                onClick={() => setActive(n.name as any)}
                className={`nav-item ${isTabActive ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{n.name}</span>
                {n.name === 'Leads' && <small className="nav-count">{leads.length}</small>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-separator" />
        <div className="nav-label">MANAGEMENT</div>
        <nav>
          <button
            className={`nav-item ${active === 'Suppression list' ? 'active' : ''}`}
            onClick={() => setActive('Suppression list')}
          >
            <ShieldCheck size={16} />
            <span>Suppression list</span>
            <small className="coming-soon-badge">Soon</small>
          </button>
          <button
            className={`nav-item ${active === 'Settings' ? 'active' : ''}`}
            onClick={() => setActive('Settings')}
          >
            <Settings2 size={16} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="provider-card">
            <div className="provider-icon">
              <MailCheck size={16} />
            </div>
            <div>
              <b>Sending with ZeptoMail</b>
              <small>
                <i /> Verified sender configured on server
              </small>
            </div>
            <button
              aria-label="Provider settings"
              onClick={() => setNotice('Ask your administrator to configure a verified sender address in ZeptoMail.')}
            >
              <MoreHorizontal size={15} />
            </button>
          </div>

          <div className="profile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', overflow: 'hidden' }}>
              <div className="profile-avatar">{currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'M'}</div>
              <div className="profile-info" style={{ overflow: 'hidden' }}>
                <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser?.name || 'Metabull Media'}</b>
                <small style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser?.email || 'Admin'}</small>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button aria-label="Google Sheets settings" onClick={()=>setSheetSetupOpen(true)} title="Google Sheets settings">
                <Settings2 size={15} />
              </button>
              <button aria-label="Log out" onClick={handleLogout} title="Log out" style={{ color: '#ef4444' }}>
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <b>{active}</b>
          </div>
          <div className="top-actions">
            <span className="sync-label">
              <span className={`live-dot ${serviceError ? 'dot-idle' : ''}`} />
              {serviceError ? 'Service unavailable' : 'Workspace ready'}
            </span>
            <button
              className="icon-btn"
              aria-label="Help & Information"
              onClick={() =>
                setNotice(
                  'Pipeline: Meta Lead Ads → Google Sheets / CSV → Mailbox → ZeptoMail outreach.'
                )
              }
            >
              <HelpCircle size={17} />
            </button>
            <div className="header-notifications">
              <button className="icon-btn notification" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(open => !open)}>
                <Bell size={17} />
                {(welcomeEmailSummary.failed + welcomeEmailSummary.sending) > 0 && <i />}
              </button>
              {notificationsOpen && <div className="notification-popover"><div className="notification-popover-title"><b>Email activity</b><button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={14}/></button></div><p>{welcomeEmailSummary.failed} failed · {welcomeEmailSummary.sending} in progress</p>{leads.filter(lead => lead.welcomeEmailStatus === 'failed' || lead.welcomeEmailStatus === 'bounced').slice(0, 5).map(lead => <button className="notification-item" key={lead.id} onClick={() => { setActive('Leads'); setNotificationsOpen(false); setFilter('All leads'); setQuery(lead.email); }}><span className="notification-failure-dot"/><span><b>Welcome email failed</b><small>{lead.email}</small></span><ArrowRight size={13}/></button>)}{welcomeEmailSummary.failed === 0 && <small className="notification-empty">No failed welcome emails in the loaded lead list.</small>}<button className="link-button" onClick={() => { setActive('Leads'); setNotificationsOpen(false); }}>View leads <ArrowRight size={13}/></button></div>}
            </div>
          </div>
        </header>

        {notice && (
          <div
            className="modern-notice-banner"
            role="alert"
            style={{
              position: 'fixed',
              top: '24px',
              right: '24px',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 18px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 12px 30px -4px rgba(15, 23, 42, 0.12), 0 4px 6px -2px rgba(15, 23, 42, 0.05)',
              maxWidth: '460px',
              animation: 'modal-in 0.2s ease-out'
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#ecfdf5',
              color: '#059669',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}>
              <CheckCircle2 size={18} />
            </div>
            <div style={{ flex: 1, fontSize: '0.875rem', color: '#1e293b', fontWeight: 500, lineHeight: 1.4 }}>
              {notice}
            </div>
            <button
              onClick={() => setNotice('')}
              aria-label="Dismiss message"
              style={{
                border: 'none',
                background: 'transparent',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'grid',
                placeItems: 'center',
                borderRadius: '6px',
                transition: 'color 0.15s ease'
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {!dataReady ? (
          <section className="page loading-page">
            <div className="loading-indicator" />
            <h2>Connecting to your workspace…</h2>
            <p>Loading leads and campaign activity.</p>
          </section>
        ) : active === 'Leads' ? (
          <section className="page">
            <div className="page-heading">
              <div>
                <h1>Your leads, ready to connect</h1>
                <p>
                  All Meta Lead Ads form submissions in one place. Filter your audience and send high-converting outreach.
                </p>
              </div>
              <div className="heading-actions">
                <button className="button secondary" onClick={() => setModal('import')}>
                  <CloudUpload size={15} /> Import leads
                </button>
                <button className="button primary" onClick={() => setModal('campaign')}>
                  <Plus size={16} /> New campaign
                </button>
              </div>
            </div>

            <div className="source-strip">
              <div className="source-left">
                <div className="source-icon">
                  <FileSpreadsheet size={16} />
                </div>
                <div>
                  <b>Meta Lead Ads spreadsheet</b>
                  <span>{sheetsStatus?.configured ? `${sheetsStatus.googleEmail||'Google Sheets'} · ${sheetsStatus.range}` : `CSV import · ${fileName}`}</span>
                </div>
                <span className={`connected-pill ${sheetsStatus?.configured?'is-connected':'is-pending'}`}><i />{sheetsStatus?.configured?'Google Sheets connected':'Not connected'}</span>
              </div>
              <div className="source-right">
                <span>{sheetsStatus?.lastSyncedAt?`Last sync ${new Date(sheetsStatus.lastSyncedAt).toLocaleString()}`:sheetsStatus?.configured?`Auto-sync every ${sheetsStatus.intervalMinutes} min`:'CSV snapshot only'}</span>
                {sheetsStatus?.configured&&<button className="link-button" disabled={syncingSheet} onClick={syncGoogleSheet}><RefreshCw size={13} className={syncingSheet?'spin':''}/>{syncingSheet?'Syncing…':'Sync now'}</button>}
                <button className="link-button" onClick={()=>setSheetSetupOpen(true)}>{sheetsStatus?.configured?'Manage sheet':'Connect Google Sheet'} <ArrowUpRight size={13}/></button>
                {sheetsStatus?.lastError&&<span className="sheets-error" title={sheetsStatus.lastError}>Last sync failed</span>}
                <button className="link-button" onClick={() => setModal('import')}>Import CSV <ArrowUpRight size={13} /></button>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-top">
                  <span>Total leads</span>
                  <span className="stat-icon mint">
                    <Users size={15} />
                  </span>
                </div>
                <div className="stat-value">{stats.totalLeads.toLocaleString()}</div>
                <div className="stat-foot">
                  <span>Imported contacts</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>New {timeRange === 'all' ? 'leads' : timeRange === 'today' ? 'today' : timeRange === '7days' ? 'this week' : timeRange === '30days' ? 'this month' : timeRange === '90days' ? 'in 90 days' : 'this year'}</span>
                  <span className="stat-icon blue">
                    <Sparkles size={15} />
                  </span>
                </div>
                <div className="stat-value">{(timeRange === 'all' ? leads.length : selectedRangeCount).toLocaleString()}</div>
                <div className="stat-foot">
                  <span>{timeRange === 'all' ? 'All recorded submissions' : 'Form submissions in range'}</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Contacted leads</span>
                  <span className="stat-icon violet">
                    <MailCheck size={15} />
                  </span>
                </div>
                <div className="stat-value">
                  {stats.totalLeads
                    ? Math.round((stats.contactedLeads / stats.totalLeads) * 100)
                    : 0}
                  <span className="stat-unit">%</span>
                </div>
                <div className="stat-foot">
                  <div className="progress">
                    <span
                      style={{
                        width: `${
                          stats.totalLeads
                            ? Math.min(
                                100,
                                Math.round((stats.contactedLeads / stats.totalLeads) * 100)
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <span>{stats.contactedLeads.toLocaleString()} marked contacted · not email delivery</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Ready to reach</span>
                  <span className="stat-icon gold">
                    <Send size={15} />
                  </span>
                </div>
                <div className="stat-value">{stats.newLeads.toLocaleString()}</div>
                <div className="stat-foot">
                  <span>Marked with new lead status</span>
                  <button className="inline-arrow" onClick={() => setFilter('New')}>
                    View <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>

            {welcomeSummaryPanel}

            <div className="table-card">
              <div className="table-header">
                <div>
                  <h2>
                    All leads <span className="result-count">{filtered.length}</span>
                  </h2>
                  <p>Contacts synchronized from your Meta Lead Ads.{!hasMetaFormDetails?' Import or sync the latest Meta export to fill in form and Meta status.':''}</p>
                </div>
                <div className="table-actions">
                  <label className="searchbox">
                    <Search size={14} />
                    <input
                      ref={searchInputRef}
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search name, email, phone, campaign, form…"
                    />
                    <kbd>⌘ K</kbd>
                  </label>
                  <select
                    className="filter-select"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    aria-label="Filter leads by status"
                  >
                    <option value="All leads">All statuses</option>
                    <option value="New">New</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Qualified">Qualified</option>
                    <option value="Unsubscribed">Unsubscribed</option>
                  </select>
                  <select
                    className="filter-select"
                    value={timeRange}
                    onChange={e => setTimeRange(e.target.value as typeof timeRange)}
                    aria-label="Filter leads by date"
                  >
                    <option value="all">All time</option>
                    <option value="today">Today</option>
                    <option value="7days">Past 7 days</option>
                    <option value="30days">Past 30 days</option>
                    <option value="90days">Past 90 days</option>
                    <option value="year">Year to date</option>
                  </select>
                  <button
                    type="button"
                    className="button secondary button-sm select-today-btn"
                    onClick={toggleSelectToday}
                    title="Select all leads received today"
                  >
                    <CheckSquare size={13} />
                    <span>
                      {todayLeads.length > 0 && todayLeads.every(l => selected.includes(l.id))
                        ? 'Deselect today'
                        : `Select today (${todayLeads.length})`}
                    </span>
                  </button>
                  {(query || filter !== 'All leads' || timeRange !== 'all') && (
                    <button
                      className="filter-button"
                      onClick={() => {
                        setQuery('');
                        setFilter('All leads');
                        setTimeRange('all');
                      }}
                      title="Reset all filters"
                    >
                      <X size={14} />
                      <span>Reset</span>
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`Sort by date, currently ${sortNewestFirst ? 'newest first' : 'oldest first'}`}
                    title={`Sorted ${sortNewestFirst ? 'newest first' : 'oldest first'}`}
                    onClick={() => setSortNewestFirst(value => !value)}
                  >
                    <ArrowDownUp size={15} />
                  </button>
                </div>
              </div>

              {selected.length > 0 && (
                <div className="table-selection-banner">
                  <span>
                    <b>{selected.length}</b> lead{selected.length === 1 ? '' : 's'} selected
                    {timeRange === 'today' ? ' (filtering today)' : ''}
                  </span>
                  {selected.length < filtered.length && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setSelected([...new Set([...selected, ...filtered.map(l => l.id)])])}
                    >
                      Select all {filtered.length} matching leads
                    </button>
                  )}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setSelected([])}
                  >
                    Clear selection
                  </button>
                </div>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="check-cell">
                        <input
                          type="checkbox"
                          checked={
                            filtered.length > 0 &&
                            filtered.every(l => selected.includes(l.id))
                          }
                          onChange={toggleAll}
                          aria-label="Select all leads"
                        />
                      </th>
                      <th>LEAD</th>
                      <th>SOURCE</th>
                      <th>CAMPAIGN</th>
                      <th>FORM</th>
                      <th>STATUS</th>
                      <th>META STATUS</th>
                      <th>WELCOME EMAIL</th>
                      <th>ADDED</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeads.map(l => (
                      <tr key={l.id}>
                        <td className="check-cell">
                          <input
                            type="checkbox"
                            checked={selected.includes(l.id)}
                            onChange={() => toggle(l.id)}
                            aria-label={`Select ${l.name}`}
                          />
                        </td>
                        <td>
                          <div className="lead-cell">
                            <div
                              className={`lead-avatar avatar-${
                                l.name.charCodeAt(0) % 5
                              }`}
                            >
                              {l.name
                                .split(' ')
                                .map(s => s[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div>
                              <b>{l.name}</b>
                              <span>{l.email}</span>
                              {l.phone&&<span className="lead-phone">{l.phone}</span>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="meta-source">
                            <span className="meta-glyph">f</span> Meta Ads
                          </span>
                        </td>
                        <td className="campaign-cell">{l.campaign || '—'}</td>
                        <td className="campaign-cell">{l.formName || '—'}</td>
                        <td>
                          <span className={`status ${statusClass(l.status)}`}>
                            <i />
                            {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                          </span>
                        </td>
                        <td>{l.sourceLeadStatus ? <span className="meta-lead-status">{l.sourceLeadStatus}</span> : '—'}</td>
                        <td><span className={`welcome-status ${l.welcomeEmailStatus === 'sent' || l.welcomeEmailStatus === 'delivered' ? 'sent' : l.welcomeEmailStatus === 'failed' || l.welcomeEmailStatus === 'bounced' ? 'failed' : 'pending'}`}><Mail size={12}/>{l.welcomeEmailStatus ? l.welcomeEmailStatus.charAt(0).toUpperCase() + l.welcomeEmailStatus.slice(1) : 'Not sent'}</span></td>
                        <td className="date-cell">{l.date}</td>
                        <td>
                          <button
                            className="row-more"
                            aria-label={`More options for ${l.name}`}
                            onClick={() => setOpenLeadActions(current => current === l.id ? null : l.id)}
                          >
                            <MoreHorizontal size={15} />
                          </button>
                          {openLeadActions === l.id && <div className="lead-row-menu"><button onClick={() => { void navigator.clipboard?.writeText(l.email).then(() => setNotice(`Copied ${l.email}.`)).catch(() => setNotice('Clipboard access is unavailable in this browser.')); setOpenLeadActions(null); }}>Copy email</button>{['failed','bounced'].includes(l.welcomeEmailStatus || '') && <button onClick={() => { void retryWelcome(l); }}>Retry welcome email</button>}<button onClick={() => { void updateLeadStatus(l); }}>Mark {l.status === 'contacted' ? 'new' : 'contacted'}</button><button onClick={() => { setSelected([l.id]); setModal('campaign'); setCampaignName(''); setSubject(''); setMessage(''); setEmailHtml(''); setSelectedTemplateId(''); setOpenLeadActions(null); }}>Create campaign</button></div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filtered.length === 0 && (
                  <div className="empty-state">
                    <p>No leads found matching your search</p>
                    {leads.length === 0 ? (
                      <button className="button secondary button-sm" onClick={() => setModal('import')}>
                        <CloudUpload size={13} /> Import leads CSV
                      </button>
                    ) : (
                      <button
                        className="button secondary button-sm"
                        onClick={() => {
                          setQuery('');
                          setFilter('All leads');
                          setTimeRange('all');
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="table-footer">
                <span>
                  {selected.length
                    ? `${selected.length} selected`
                    : `Showing ${sortedFiltered.length ? (leadPage - 1) * leadsPerPage + 1 : 0}–${Math.min(leadPage * leadsPerPage, sortedFiltered.length)} of ${sortedFiltered.length} matching · ${leads.length} total`}
                </span>
                <div className="pagination">
                  <button disabled={leadPage <= 1} onClick={() => setLeadPage(page => Math.max(1, page - 1))} aria-label="Previous page">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="page-num">{leadPage} / {pageCount}</span>
                  <button disabled={leadPage >= pageCount} onClick={() => setLeadPage(page => Math.min(pageCount, page + 1))} aria-label="Next page">
                    <ChevronRight size={14} />
                  </button>
                </div>
                <button className="export-button" onClick={() => downloadLeadCsv(filtered)}>
                  Export CSV <ArrowDown size={12} />
                </button>
              </div>
            </div>

            <div className="bottom-note">
              <div>
                <div className="note-icon">
                  <Activity size={15} />
                </div>
                <span>
                  <b>Lead Source Pipeline:</b> Meta Lead Ads → CSV or Google Sheets sync → ZeptoMail dispatch.
                </span>
              </div>
              <button onClick={() => setNotice('Syncing handles automatic deduplication and suppression checks.')}>
                <CircleHelp size={13} /> How syncing works
              </button>
            </div>
          </section>
        ) : active === 'Templates' ? (
          <section className="page">
            <div className="page-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-dot"/> EMAIL CONTENT</div>
                <h1>Email Templates</h1>
                <p>Create visual, responsive email layouts, save reusable versions, and launch them in automated or scheduled outreach.</p>
              </div>
              <div className="heading-actions">
                <button className="button secondary" onClick={() => setPasteHtmlOpen(true)}>
                  <Code2 size={16}/> Paste HTML
                </button>
                <button className="button primary" onClick={() => { setEditingTemplate(null); setTemplateStudioOpen(true); }}>
                  <Plus size={16}/> New template
                </button>
              </div>
            </div>

            <section className="email-settings-card" aria-labelledby="welcome-settings-title">
              <div className="email-settings-copy">
                <h2 id="welcome-settings-title">New lead welcome email</h2>
                <p>Select the saved email sent automatically when a new lead arrives. Existing leads are not emailed again.</p>
                <div className={`provider-readiness ${emailSettings?.provider.configured ? 'ready' : 'missing'}`}><span className="provider-readiness-dot" />{emailSettings?.provider.configured ? `ZeptoMail credentials present · ${emailSettings.provider.sender}` : 'ZeptoMail sender credentials are missing on the server'}</div>
                {settingsNotice && <small className="settings-notice" role="status">{settingsNotice}</small>}
                {!emailSettings && <small className="settings-notice" role="status">{emailSettingsError || 'Email settings could not be loaded.'}</small>}
              </div>
              <label className="welcome-template-select"><span>Automatic welcome template</span><select value={emailSettings?.welcomeTemplateId || ''} onChange={event => void saveWelcomeTemplate(event.target.value)} disabled={savingEmailSettings || !emailSettings}><option value="">Off — do not send automatically</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
            </section>
            <div className="stats-grid template-kpis">
              <div className="stat-card">
                <div className="stat-top">
                  <span>Saved Templates</span>
                  <div className="stat-icon mint"><FileText size={16}/></div>
                </div>
                <div className="stat-value">{templates.length}</div>
                <div className="stat-foot">Ready to use in outreach</div>
              </div>
              <div className="stat-card">
                <div className="stat-top">
                  <span>Version History</span>
                  <div className="stat-icon blue"><History size={16}/></div>
                </div>
                <div className="stat-value">{templates.reduce((sum, t) => sum + (t.version_number || 1), 0)}</div>
                <div className="stat-foot">Total saved iterations</div>
              </div>
              <div className="stat-card">
                <div className="stat-top">
                  <span>Active in Campaigns</span>
                  <div className="stat-icon violet"><MailCheck size={16}/></div>
                </div>
                <div className="stat-value">{templates.filter(t => t.last_used_at).length}</div>
                <div className="stat-foot">Engaging your leads</div>
              </div>
            </div>

            <div className="template-grid">
              {templates.map(t => (
                <article className="template-card" key={t.id}>
                  <div className="template-card-top">
                    <span className="template-preview-icon"><Mail size={20}/></span>
                    <span className={`template-version-badge ${t.id === welcomeTemplate?.id ? 'welcome-template-badge' : ''}`}>{t.id === welcomeTemplate?.id ? 'Auto welcome' : `v${t.version_number || 1}`}</span>
                  </div>
                  <h2>{t.name}</h2>
                  <div className="template-subject-pill">
                    <span className="subject-prefix">Subject</span>
                    <span className="subject-text">{t.subject || 'No subject set'}</span>
                  </div>
                  {t.preheader && (
                    <p className="template-preheader-preview">
                      <span className="preheader-label">Snippet:</span> {t.preheader}
                    </p>
                  )}
                  <div className="template-card-foot">
                    <span className="template-date">Updated {new Date(t.updated_at).toLocaleDateString()}</span>
                    <div className="template-actions-group">
                      <button className="btn-edit-tpl" onClick={() => { setEditingTemplate(t); setTemplateStudioOpen(true); }} title="Edit template">
                        <Pencil size={13}/> Edit
                      </button>
                      <button className="btn-use-tpl" onClick={() => {
                        setSelectedTemplateId(t.id);
                        if (!campaignName) setCampaignName(t.name);
                        setSubject(t.subject);
                        setEmailHtml(t.html_source);
                        setMessage('');
                        setModal('campaign');
                      }} title="Use in campaign">
                        Use <ArrowRight size={13}/>
                      </button>
                      <button
                        className="btn-delete-tpl"
                        onClick={() => void handleDeleteTemplate(t)}
                        title="Delete template"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid #fee2e2',
                          background: '#fff5f5',
                          color: '#dc2626',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {!templates.length && (
                <div className="template-empty-box">
                  <div className="empty-tpl-art">
                    <FileText size={32}/>
                  </div>
                  <h2>No templates created yet</h2>
                  <p>Design a beautiful responsive email template with our visual block editor or pick from conversion-focused starter presets.</p>
                  <div className="template-empty-actions">
                    <button className="button primary" onClick={() => { setEditingTemplate(null); setTemplateStudioOpen(true); }}>
                      <Plus size={16}/> Launch Template Studio
                    </button>
                    <button className="button secondary" onClick={() => setPasteHtmlOpen(true)}>
                      <Code2 size={16}/> Paste HTML Code
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : active === 'Calendar' ? (
          <section className="page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> SEND PLANNING</div><h1>Plan your sends</h1><p>Schedule a saved template for the date and time that works for your audience.</p></div><button className="button primary" onClick={()=>{setScheduleAt('');setModal('campaign')}}><Plus size={16}/> Schedule campaign</button></div><div className="calendar-card"><div className="calendar-toolbar"><div><h2>{calendarMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h2><p>{recentCampaigns.filter(c=>c.scheduled_at&&new Date(c.scheduled_at).getMonth()===calendarMonth.getMonth()&&new Date(c.scheduled_at).getFullYear()===calendarMonth.getFullYear()).length} scheduled campaigns</p></div><div className="calendar-controls"><button className="button secondary" onClick={()=>setCalendarMonth(new Date())}>Today</button><button className="icon-button" onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1))}><ChevronLeft size={16}/></button><button className="icon-button" onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1))}><ChevronRight size={16}/></button></div></div><div className="calendar-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><div className="calendar-weekday" key={day}>{day}</div>)}{Array.from({length:(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1).getDay()+6)%7},(_,i)=><div className="calendar-blank" key={`blank-${i}`}/>)}{Array.from({length:new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0).getDate()},(_,i)=>{const day=i+1;const date=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),day);const items=recentCampaigns.filter(c=>c.scheduled_at&&new Date(c.scheduled_at).toDateString()===date.toDateString());return <button className={`calendar-day ${date.toDateString()===new Date().toDateString()?'today':''}`} key={day} onClick={()=>{if(date.getTime()<=Date.now()){setNotice('Choose a future date to schedule this campaign.');return;}setScheduleAt(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}T10:00`);setModal('campaign')}}><span>{day}</span>{items.map(c=><small key={c.id}><Mail size={11}/>{c.name}</small>)}</button>})}</div></div><div className="scheduled-list"><h2>Upcoming sends</h2>{recentCampaigns.filter(c=>c.scheduled_at&&new Date(c.scheduled_at)>=new Date()).sort((a,b)=>new Date(a.scheduled_at).getTime()-new Date(b.scheduled_at).getTime()).map(c=><div className="scheduled-row" key={c.id}><div className="scheduled-date"><b>{new Date(c.scheduled_at).toLocaleDateString('en-US',{day:'2-digit'})}</b><span>{new Date(c.scheduled_at).toLocaleDateString('en-US',{month:'short'})}</span></div><div><b>{c.name}</b><small>{c.subject} · {new Date(c.scheduled_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</small></div><span className="status contacted"><i/>{c.status}</span></div>)}{!recentCampaigns.some(c=>c.scheduled_at&&new Date(c.scheduled_at)>=new Date())&&<p className="no-scheduled">Nothing scheduled yet. Select a day on the calendar to plan your first send.</p>}</div></section>
        ) : active === 'Suppression list' ? (
          <section className="page">
            <div className="page-heading">
              <div><h1>Suppression list</h1><p>Manage bounced, unsubscribed, and blocked addresses for this workspace.</p></div>
            </div>
            <div className="suppression-coming-soon" role="status">
              <span className="stat-icon violet"><ShieldCheck size={20}/></span>
              <div><span className="coming-soon-badge">Coming soon</span><h2>Suppression management is on the way</h2><p>This page will let you review and manage suppressed addresses. Campaign delivery protection continues to run automatically.</p></div>
            </div>
          </section>
        ) : active === 'Settings' ? (
          <section className="page">
            <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> WORKSPACE</div><h1>Settings</h1><p>Manage email automation, integrations, and workspace details.</p></div></div>
            <div className="workspace-settings-grid">
              <article className="workspace-setting-card"><span className="stat-icon mint"><MailCheck size={17}/></span><div><h2>Welcome email</h2><p>{welcomeTemplate?`Automatic · ${welcomeTemplate.name}`:'No automatic welcome template selected'}</p><small>{emailSettings?.provider.configured?`ZeptoMail sender: ${emailSettings.provider.sender}`:'ZeptoMail sender is not configured on the API.'}</small>{emailSettingsError&&<small className="settings-error">{emailSettingsError}</small>}</div><button className="button secondary" onClick={()=>setActive('Templates')}>Configure</button></article>
              <article className="workspace-setting-card"><span className="stat-icon blue"><FileSpreadsheet size={17}/></span><div><h2>Google Sheets</h2><p>{sheetsStatus?.googleEmail?`Connected · ${sheetsStatus.googleEmail}`:'Not connected'}</p><small>{sheetsStatus?.configured?`${sheetsStatus.spreadsheetId} · ${sheetsStatus.range}`:'Connect an account and choose a spreadsheet to sync leads.'}</small></div><button className="button secondary" onClick={()=>setSheetSetupOpen(true)}>Manage</button></article>
              <article className="workspace-setting-card"><span className="stat-icon violet"><ShieldCheck size={17}/></span><div><h2>Suppression list</h2><p>Management coming soon</p><small>Campaign delivery protection continues to run automatically.</small></div><button className="button secondary" onClick={()=>setActive('Suppression list')}>Coming soon</button></article>
              <article className="workspace-setting-card"><span className="stat-icon blue"><Users size={17}/></span><div><h2>Signed in as</h2><p>{currentUser?.name||'Workspace admin'}</p><small>{currentUser?.email||'Administrator account'}</small></div><button className="button secondary" onClick={handleLogout}>Sign out</button></article>
            </div>
          </section>
        ) : active === 'Campaigns' ? (
          <section className="page">
            <div className="page-heading">
              <div>
                <h1>Campaigns that convert</h1>
                <p>Deliver email outreach to your leads via ZeptoMail with automatic suppression filtering.</p>
              </div>
              <button className="button primary" onClick={() => setModal('campaign')}>
                <Plus size={16} /> New campaign
              </button>
            </div>

            <div className="table-card campaign-list">
              <div className="table-header">
                <div>
                  <h2>
                    Recent campaigns <span className="result-count">{recentCampaigns.length}</span>
                  </h2>
                  <p>Queued and delivered outreach jobs.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>CAMPAIGN</th>
                      <th>SUBJECT</th>
                      <th>STATUS</th>
                      <th>RECIPIENTS</th>
                      <th>SENT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCampaigns.map(c => (
                      <tr key={c.id}>
                        <td><b>{c.name}</b></td>
                        <td>{c.subject}</td>
                        <td>
                          <span className="status contacted">
                            <i />
                            {c.status}
                          </span>
                        </td>
                        <td>{c.recipient_count}</td>
                        <td>{c.sent_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!recentCampaigns.length && (
                  <div className="empty-state">
                    <p>No campaigns have been created yet</p>
                    <button className="button primary button-sm" onClick={() => setModal('campaign')}>
                      <Plus size={13} /> Create your first campaign
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          /* Overview View */
          <section className="page">
            <div className="page-heading">
              <div>
                <h1>{getGreeting()}, welcome back</h1>
                <p>Your Meta leads and email outreach are synced and ready for action.</p>
              </div>
              <button className="button primary" onClick={() => setModal('campaign')}>
                <Plus size={16} /> New campaign
              </button>
            </div>

            <div className="overview-layout">
              <div className="overview-main">
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-top">
                      <span>Total leads</span>
                      <span className="stat-icon mint">
                        <Users size={15} />
                      </span>
                    </div>
                    <div className="stat-value">{stats.totalLeads.toLocaleString()}</div>
                    <div className="stat-foot">
                      <span>Synchronized contacts</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-top">
                      <span>New this week</span>
                      <span className="stat-icon blue">
                        <Sparkles size={15} />
                      </span>
                    </div>
                    <div className="stat-value">{newThisWeek.toLocaleString()}</div>
                    <div className="stat-foot">
                      <span>Added in past 7 days</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-top">
                      <span>Ready to reach</span>
                      <span className="stat-icon gold">
                        <Send size={15} />
                      </span>
                    </div>
                    <div className="stat-value">{stats.newLeads.toLocaleString()}</div>
                    <div className="stat-foot">
                      <span>Current lead status: new</span>
                    </div>
                  </div>
                </div>

                <div className="chart-card">
                  <div>
                    <h2>Lead activity</h2>
                    <p>Submissions over the trailing 7 days</p>
                  </div>
                  <div className="chart">
                    <div className="chart-grid">
                      <span>Max</span>
                      <span>Mid</span>
                      <span>0</span>
                    </div>
                    <div className="bars">
                      {activityDays.map((item, i) => (
                        <div key={i} className="bar-group" title={`${item.label}: ${item.count} leads`}>
                          <div style={{ height: `${item.height}%` }} />
                          <small>{item.label}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <aside className="overview-aside">
                {welcomeSummaryPanel}
                <div className="source-card">
                  <div className="source-card-head">
                    <div className="source-icon">
                      <FileSpreadsheet size={16} />
                    </div>
                    <span className="connected-pill">
                      <i /> {serviceError ? 'Offline' : 'Workspace configured'}
                    </span>
                  </div>
                  <h3>Lead Source</h3>
                  <p>Meta Lead Ads → Google Sheets / CSV → Mailbox</p>
                  <div className="source-detail"><span>Sheet sync</span><b>{sheetsStatus?.configured?(sheetsStatus.lastSyncedAt?new Date(sheetsStatus.lastSyncedAt).toLocaleString():'Starting…'):'Setup needed'}</b></div>
                  <div className="source-detail">
                    <span>Workspace Leads</span>
                    <b>{stats.totalLeads}</b>
                  </div>
                  {sheetsStatus?.configured?<button className="text-action" disabled={syncingSheet} onClick={syncGoogleSheet}><RefreshCw size={13} className={syncingSheet?'spin':''}/>{syncingSheet?'Syncing sheet…':'Sync sheet now'} <ArrowRight size={13}/></button>:<button className="text-action" onClick={() => setModal('import')}>Import CSV leads <ArrowRight size={13}/></button>}
                </div>

                <div className="tip-card">
                  <Sparkles size={16} />
                  <b>Quick Outreach Tip</b>
                  <p>
                    Reaching Meta leads within the first 24 hours increases conversion rates by up to 391%.
                  </p>
                  <button
                    onClick={() => {
                      setActive('Leads');
                      setFilter('New');
                    }}
                  >
                    View new leads <ArrowRight size={13} />
                  </button>
                </div>
              </aside>
            </div>

            <div className="table-card overview-table">
              <div className="table-header">
                <div>
                  <h2>
                    Latest leads <span className="result-count">{Math.min(leads.length, 5)}</span>
                  </h2>
                  <p>Most recent submissions from Meta Lead Ads.</p>
                </div>
                <button className="link-button" onClick={() => setActive('Leads')}>
                  View all leads <ArrowRight size={13} />
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>LEAD</th>
                      <th>COMPANY</th>
                      <th>CAMPAIGN</th>
                      <th>STATUS</th>
                      <th>ADDED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.slice(0, 5).map(l => (
                      <tr key={l.id}>
                        <td>
                          <div className="lead-cell">
                            <div
                              className={`lead-avatar avatar-${
                                l.name.charCodeAt(0) % 5
                              }`}
                            >
                              {l.name
                                .split(' ')
                                .map(s => s[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div>
                              <b>{l.name}</b>
                              <span>{l.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="company-cell">{l.company || '—'}</td>
                        <td className="campaign-cell">{l.campaign || '—'}</td>
                        <td>
                          <span className={`status ${statusClass(l.status)}`}>
                            <i />
                            {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                          </span>
                        </td>
                        <td className="date-cell">{l.date}</td>
                      </tr>
                    ))}
                    {leads.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty-table-cell">
                          <div className="empty-table-state">
                            <FileSpreadsheet size={22} className="empty-icon" />
                            <p>No leads in this workspace yet</p>
                            <small>Import your Meta Lead Ads CSV to start connecting with prospects</small>
                            <button
                              className="button secondary button-sm"
                              onClick={() => setModal('import')}
                            >
                              <CloudUpload size={13} /> Import leads
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        <footer className="footer">
          <span>© 2026 Mailbox</span>
          <span>Fast, reliable outreach powered by ZeptoMail</span>
          <a
            href="#help"
            onClick={e => {
              e.preventDefault();
              setNotice('Contact your workspace administrator for help.');
            }}
          >
            Help &amp; support <ArrowUpRight size={11} />
          </a>
        </footer>
      </main>

      {/* Floating Selection Bar */}
      {selected.length > 0 && (
        <div className="selection-bar">
          <span>
            <b>{selected.length}</b> leads selected
          </span>
          <button onClick={() => setModal('campaign')}>
            <Send size={14} /> Email selected leads <ArrowRight size={13} />
          </button>
          <button
            className="selection-close"
            onClick={() => setSelected([])}
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Modals */}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <div>
                <span className="modal-icon">
                  {modal === 'import' ? <FileSpreadsheet size={17} /> : <Send size={17} />}
                </span>
                <h2>{modal === 'import' ? 'Import your leads' : 'Create an email campaign'}</h2>
                <p>
                  {modal === 'import'
                    ? 'Upload Meta Lead Ads CSV exports directly to your workspace.'
                    : 'Personalized messages turn fresh leads into booked appointments.'}
                </p>
              </div>
              <button
                className="close-modal"
                onClick={() => setModal(null)}
                aria-label="Close dialog"
              >
                <X size={17} />
              </button>
            </div>

            {modal === 'import' ? (
              <div className="import-body">
                <div className="sheet-connected">
                  <div className="source-icon">
                    <FileSpreadsheet size={17} />
                  </div>
                  <div>
                    <b>Meta lead spreadsheet</b>
                  <span>Upload a Meta CSV or tab-separated export here</span>
                  </div>
                  <span className={`connected-pill ${sheetsStatus?.configured?'is-connected':'is-pending'}`}><i />{sheetsStatus?.configured?'Connected':'CSV import'}</span>
                </div>

                <div className="import-divider">
                  <span>OR SELECT A CSV FILE</span>
                </div>

                <button
                  className="drop-zone"
                  onClick={() => fileRef.current?.click()}
                  type="button"
                >
                  <div className="upload-icon">
                    <CloudUpload size={20} />
                  </div>
                  <b>Choose a CSV file to import</b>
                  <span>We’ll keep campaign, form, phone, and Meta lead status details.</span>
                  <span className="browse-label">Browse files</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,text/csv,text/tab-separated-values"
                  hidden
                  onChange={onFile}
                />

                <div className="privacy-note">
                  <ShieldCheck size={14} /> We match by email to prevent duplicate contacts in your workspace.
                </div>

                <div className="modal-footer">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => {
                      setNotice('Select a CSV file to import contacts into your workspace.');
                    }}
                  >
                    <Check size={14} /> Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={sendCampaign} className="campaign-form">
                <label>
                  SAVED TEMPLATE
                  <select
                    value={selectedTemplateId}
                    onChange={e => {
                      const newId = e.target.value;
                      setSelectedTemplateId(newId);
                      const t = templates.find(item => item.id === newId);
                      if (t) {
                        if (!campaignName) setCampaignName(t.name);
                        setSubject(t.subject);
                        setEmailHtml(t.html_source);
                        setMessage('');
                      } else {
                        setEmailHtml('');
                        setMessage('');
                      }
                    }}
                  >
                    <option value="">Write a new email (plain text)</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  CAMPAIGN NAME
                  <input
                    required
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="e.g. Lead Consultation & Welcome Outreach"
                  />
                </label>
                <label>
                  {selectedTemplateId?'SAVED TEMPLATE PREVIEW':'EMAIL BODY'}
                  {selectedTemplateId?<div className="campaign-template-preview"><iframe title="Selected email template preview" sandbox="" srcDoc={emailHtml}/><small><CheckCircle2 size={12}/> Saved responsive design · personalized with merge tags</small></div>:<textarea required rows={7} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Hi {{name}}, thanks for getting in touch..."/>}
                </label>

                <label className="schedule-field">SCHEDULE SEND (OPTIONAL)<input type="datetime-local" value={scheduleAt} min={new Date(Date.now()+60000).toISOString().slice(0,16)} onChange={e=>setScheduleAt(e.target.value)}/><small>Leave blank to queue as soon as possible.</small></label>

                <div className="recipient-preview">
                  <Users size={14} />
                  <span>Sending to:</span>
                  <b>
                    {selected.length
                      ? `${selected.length} selected leads`
                      : `${leads.filter(l => l.status === 'new').length} new leads`}
                  </b>
                  <small>· sender configured by workspace admin</small>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={busy} className="button primary">
                    <Send size={14} />
                    {busy ? 'Saving…' : scheduleAt ? 'Schedule campaign' : 'Queue campaign'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {sheetSetupOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSheetSetupOpen(false);}}><section className="modal sheet-setup-modal" role="dialog" aria-modal="true" aria-labelledby="sheet-setup-title"><header className="modal-head"><span className="modal-icon"><FileSpreadsheet size={18}/></span><div><h2 id="sheet-setup-title">Connect your Google Sheet</h2><p>Authorize Google, then paste the spreadsheet Meta adds leads to.</p></div><button className="icon-btn" onClick={()=>setSheetSetupOpen(false)} aria-label="Close"><X size={18}/></button></header><div className="sheet-setup-body">{!sheetsStatus?.googleEmail?<><div className="sheet-setup-step"><span>1</span><div><b>Connect your Google account</b><small>Mailbox gets read-only access to your spreadsheets.</small></div></div><button className="button primary sheet-connect-button" onClick={connectGoogle}><Mail size={16}/> Continue with Google <ArrowRight size={15}/></button></>:<><div className="sheet-google-account"><CheckCircle2 size={17}/><div><b>{sheetsStatus.googleEmail}</b><small>Google account connected</small></div></div><form className="campaign-form" onSubmit={saveGoogleSheet}><label>Google Sheets link<input value={sheetUrl} onChange={e=>setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." required/><small>Use the sheet Meta Lead Ads is filling in. The Google account above must have access to it.</small></label><label>Tab and range<input value={sheetRange} onChange={e=>setSheetRange(e.target.value)} placeholder="Leads!A1:Z5000" required/><small>For example: Leads!A1:Z5000. The first row must include an Email column.</small></label><button className="button primary" disabled={syncingSheet}>{syncingSheet?'Connecting and syncing…':'Save sheet and sync now'} <ArrowRight size={15}/></button></form><div className="sheet-setup-footer"><span>Auto-syncs every {sheetsStatus.intervalMinutes} minutes.</span><button className="link-button" onClick={disconnectGoogle}>Disconnect Google</button></div></>}</div></section></div>}

      {/* Paste HTML Template Modal */}
      {pasteHtmlOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setPasteHtmlOpen(false);
          }}
        >
          <div className="modal paste-html-modal">
            <div className="modal-head">
              <div>
                <span className="modal-icon">
                  <Code2 size={18} />
                </span>
                <h2>Paste HTML Email Template</h2>
                <p>Import ready-to-send HTML from any external template builder or custom email markup.</p>
              </div>
              <button
                className="close-modal"
                onClick={() => setPasteHtmlOpen(false)}
                aria-label="Close dialog"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={savePastedTemplate} className="campaign-form paste-html-form">
              <label>
                TEMPLATE NAME
                <input
                  required
                  value={pastedHtmlName}
                  onChange={e => setPastedHtmlName(e.target.value)}
                  placeholder="e.g. November Lead Offer Follow-up"
                />
              </label>

              <label>
                DEFAULT EMAIL SUBJECT
                <input
                  value={pastedHtmlSubject}
                  onChange={e => setPastedHtmlSubject(e.target.value)}
                  placeholder="e.g. Exclusive preview for {{name}}"
                />
                <small>You can use merge tags like <code>{'{{name}}'}</code>, <code>{'{{company}}'}</code>.</small>
              </label>

              <label>
                PASTE YOUR HTML CODE
                <textarea
                  required
                  rows={10}
                  className="html-code-area"
                  value={pastedHtmlCode}
                  onChange={e => setPastedHtmlCode(e.target.value)}
                  placeholder="<!DOCTYPE html><html><head>...</head><body><table width='100%'>...</table></body></html>"
                />
              </label>

              {pastedHtmlCode.trim() && (
                <div className="pasted-html-preview-strip">
                  <div className="pasted-preview-label">
                    <Eye size={13} /> Live Render Preview
                  </div>
                  <div className="pasted-preview-frame">
                    <iframe
                      title="Pasted HTML Preview"
                      sandbox=""
                      srcDoc={pastedHtmlCode}
                    />
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setPasteHtmlOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={savingPastedHtml} className="button primary">
                  <Save size={14} />
                  {savingPastedHtml ? 'Saving template…' : 'Save HTML template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog && confirmDialog.open && (
        <div className="modal-backdrop" onClick={() => setConfirmDialog(null)}>
          <div
            className="modal confirm-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '440px', padding: '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: confirmDialog.isDestructive ? '#fef2f2' : '#f0fdf4',
                color: confirmDialog.isDestructive ? '#dc2626' : '#16a34a',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0
              }}>
                {confirmDialog.isDestructive ? <Trash2 size={20} /> : <CheckCircle2 size={20} />}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>
                  {confirmDialog.title}
                </h3>
              </div>
            </div>

            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.875rem', lineHeight: 1.5 }}>
              {confirmDialog.message}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setConfirmDialog(null)}
                style={{ padding: '8px 14px', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={async () => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await fn();
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  backgroundColor: confirmDialog.isDestructive ? '#dc2626' : '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px'
                }}
              >
                {confirmDialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default App;
