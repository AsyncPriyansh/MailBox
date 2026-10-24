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
  Clock,
  Copy,
  TrendingUp,
  ExternalLink,
  Unlink,
  Download,
  Phone,
  Building2,
  Loader2,
  LayoutTemplate,
  Monitor,
  Smartphone,
} from 'lucide-react';
import type { Lead } from './types/domain';
import { ApiError } from './services/http';
import { leadsApi } from './services/leadsApi';
import { campaignsApi, dashboardApi, welcomeEmailsApi, type WelcomeEmailRecord, type CampaignRecipient } from './services/campaignsApi';
import { parseLeadCsv, downloadLeadCsv } from './features/leads/csv';
import { templatesApi, emailSettingsApi, type EmailTemplate, type EmailSettings } from './services/templatesApi';
import { googleSheetsApi, type SheetsSyncStatus } from './services/googleSheetsApi';
import { TemplateStudio } from './features/templates/TemplateStudio';
import { LoginPage } from './features/auth/LoginPage';
import { authApi, type AuthUser } from './services/authApi';
import { LogOut } from 'lucide-react';

type UiLead = Lead & { date: string };
type CampaignAudience = 'new' | 'contacted' | 'qualified' | 'all' | 'selected';

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
  const [campaignSearchQuery, setCampaignSearchQuery] = useState('');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<'all' | 'completed' | 'scheduled' | 'sending' | 'failed'>('all');
  const [selectedCampaignDetail, setSelectedCampaignDetail] = useState<any | null>(null);
  const [detailRecipients, setDetailRecipients] = useState<CampaignRecipient[]>([]);
  const [loadingDetailRecipients, setLoadingDetailRecipients] = useState(false);
  const [campaignRecipientSearch, setCampaignRecipientSearch] = useState('');
  const [campaignRecipientPage, setCampaignRecipientPage] = useState(1);
  const [campaignRecipientPerPage, setCampaignRecipientPerPage] = useState(25);
  const [campaignModalTab, setCampaignModalTab] = useState<'template' | 'recipients' | 'overview'>('template');
  const [recipientStatusFilter, setRecipientStatusFilter] = useState<'all' | 'delivered' | 'scheduled' | 'failed'>('all');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewPersonalized, setPreviewPersonalized] = useState(true);
  const [refreshingCampaigns, setRefreshingCampaigns] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const [active, setActive] = useState<'Overview' | 'Leads' | 'Campaigns' | 'Templates' | 'Calendar' | 'Suppression list' | 'Settings'>('Leads');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All leads');
  const [overviewLeadFilter, setOverviewLeadFilter] = useState<'uncontacted' | 'all'>('uncontacted');
  const [timeRange, setTimeRange] = useState<'all' | 'today' | '7days' | '30days' | '90days' | 'year' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [campaignDateFilterEnabled, setCampaignDateFilterEnabled] = useState(false);
  const [campaignFromDate, setCampaignFromDate] = useState('');
  const [campaignToDate, setCampaignToDate] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [campaignAudience, setCampaignAudience] = useState<CampaignAudience>('new');
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
  const [clearBeforeSync, setClearBeforeSync] = useState(false);
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
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
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
  const [welcomeRecords, setWelcomeRecords] = useState<WelcomeEmailRecord[]>([]);
  const [welcomeTotalSent, setWelcomeTotalSent] = useState<number>(0);
  const [outboundTab, setOutboundTab] = useState<'campaigns' | 'welcome'>('campaigns');
  const [welcomeSearchQuery, setWelcomeSearchQuery] = useState('');
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignsPerPage, setCampaignsPerPage] = useState<number>(10);
  const [welcomePage, setWelcomePage] = useState(1);
  const [welcomePerPage, setWelcomePerPage] = useState<number>(25);

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
      const [result, dashboard, templateResult, campaignResult, sheetStatus, settingsResult, welcomeResult] = await Promise.all([
        leadsApi.list(),
        dashboardApi.stats(),
        templatesApi.list(),
        campaignsApi.list(),
        googleSheetsApi.status(),
        settingsRequest,
        welcomeEmailsApi.list().catch(() => ({ total: 0, records: [] as WelcomeEmailRecord[] }))
      ]);
      setLeads(result.leads.map(toUiLead));
      setStats(dashboard.stats);
      setRecentCampaigns(campaignResult.campaigns.length ? campaignResult.campaigns : dashboard.recentCampaigns);
      setTemplates(templateResult.templates);
      setEmailSettings(settingsResult.value);
      setEmailSettingsError(settingsResult.error);
      setSheetsStatus(sheetStatus);
      setWelcomeRecords(welcomeResult.records || []);
      setWelcomeTotalSent(welcomeResult.total || 0);
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
    const rangeStarts: Record<Exclude<typeof timeRange, 'custom'>, number> = {
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

      const leadMs = new Date(l.createdAt).getTime();
      if (timeRange === 'custom') {
        if (customStartDate) {
          const fromMs = new Date(`${customStartDate}T00:00:00`).getTime();
          if (leadMs < fromMs) return false;
        }
        if (customEndDate) {
          const toMs = new Date(`${customEndDate}T23:59:59.999`).getTime();
          if (leadMs > toMs) return false;
        }
        return true;
      }

      return leadMs >= rangeStarts[timeRange];
    });
  }, [leads, query, filter, timeRange, customStartDate, customEndDate]);

  const sortedFiltered = useMemo(() => [...filtered].sort((a, b) => {
    const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortNewestFirst ? -delta : delta;
  }), [filtered, sortNewestFirst]);
  const leadsPerPage = 25;
  const pageCount = Math.max(1, Math.ceil(sortedFiltered.length / leadsPerPage));
  const visibleLeads = sortedFiltered.slice((leadPage - 1) * leadsPerPage, leadPage * leadsPerPage);

  useEffect(() => { setLeadPage(1); }, [query, filter, timeRange, customStartDate, customEndDate]);

  const selectedRangeCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const starts: Record<Exclude<typeof timeRange, 'custom'>, number> = {
      all: Number.NEGATIVE_INFINITY,
      today: today.getTime(),
      '7days': today.getTime() - 6 * 24 * 60 * 60 * 1000,
      '30days': today.getTime() - 29 * 24 * 60 * 60 * 1000,
      '90days': today.getTime() - 89 * 24 * 60 * 60 * 1000,
      year: new Date(today.getFullYear(), 0, 1).getTime(),
    };
    if (timeRange === 'custom') {
      const fromMs = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : -Infinity;
      const toMs = customEndDate ? new Date(`${customEndDate}T23:59:59.999`).getTime() : Infinity;
      return leads.filter(lead => {
        const ms = new Date(lead.createdAt).getTime();
        return ms >= fromMs && ms <= toMs;
      }).length;
    }
    return leads.filter(lead => new Date(lead.createdAt).getTime() >= starts[timeRange]).length;
  }, [leads, timeRange, customStartDate, customEndDate]);

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
  const clearAllOldLeads = () => {
    const isSheetConnected = Boolean(sheetsStatus?.configured);
    setConfirmDialog({
      open: true,
      title: isSheetConnected ? 'Clear leads & check Google Sheet sync' : 'Delete all old leads?',
      message: isSheetConnected
        ? `⚠️ Google Sheets live sync is currently ACTIVE.\n\nYour connected sheet ("${sheetsStatus?.spreadsheetTitle || 'Google Sheet'}") will re-import these rows on the next 5-minute sync.\n\nIf you want your workspace to stay completely empty, please disconnect the Google Sheet too.`
        : `Are you sure you want to permanently delete all ${leads.length} leads in this workspace? This will clear out old records so you can start completely fresh. This action cannot be undone.`,
      confirmLabel: isSheetConnected ? 'Delete leads anyway' : 'Yes, delete old leads',
      isDestructive: true,
      onConfirm: async () => {
        setSyncingSheet(true);
        try {
          const res = await leadsApi.clearAll();
          await fetchWorkspaceData();
          setSelected([]);
          setNotice(
            isSheetConnected
              ? `Cleared ${res.deleted || leads.length} old leads. Remember to disconnect your Google Sheet if you do not want it to re-sync.`
              : `Cleared ${res.deleted || leads.length} old leads. Your workspace is ready for a fresh sheet!`
          );
        } catch (err) {
          setNotice(err instanceof Error ? err.message : 'Failed to clear old leads.');
        } finally {
          setSyncingSheet(false);
        }
      },
    });
  };

  const deleteSelectedLeads = () => {
    if (!selected.length) return;
    const isSheetConnected = Boolean(sheetsStatus?.configured);

    setConfirmDialog({
      open: true,
      title: `Delete ${selected.length} selected lead${selected.length === 1 ? '' : 's'}?`,
      message: isSheetConnected
        ? `⚠️ Google Sheets live sync is currently CONNECTED ("${sheetsStatus?.spreadsheetTitle || 'Sheet'}").\n\nIf these rows still exist in your Google Sheet, the 5-minute background poller will re-sync them into your dashboard (welcome emails will NEVER be sent again).\n\nTo remove them permanently, please disconnect the Google Sheet or delete their rows directly from the spreadsheet.`
        : `Are you sure you want to permanently delete ${selected.length} selected lead${selected.length === 1 ? '' : 's'} from this workspace? This cannot be undone.`,
      confirmLabel: isSheetConnected ? 'Delete from dashboard' : 'Delete leads',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const res = await leadsApi.deleteSelected(selected);
          await fetchWorkspaceData();
          setSelected([]);
          setNotice(
            isSheetConnected
              ? `Deleted ${res.deleted || selected.length} leads. Remember to disconnect your Google Sheet if you do not want them re-synced.`
              : `Deleted ${res.deleted || selected.length} leads.`
          );
        } catch (err) {
          setNotice(err instanceof Error ? err.message : 'Could not delete selected leads.');
        }
      },
    });
  };

  const saveGoogleSheet = async (e: FormEvent) => {
    e.preventDefault();
    setSyncingSheet(true);
    try {
      if (clearBeforeSync && leads.length > 0) {
        await leadsApi.clearAll();
      }
      const result = await googleSheetsApi.saveSheet(sheetUrl, sheetRange);
      const [status, leadResult, dashboard] = await Promise.all([
        googleSheetsApi.status(),
        leadsApi.list(),
        dashboardApi.stats(),
      ]);
      setSheetsStatus(status);
      setLeads(leadResult.leads.map(toUiLead));
      setStats(dashboard.stats);
      setSheetSetupOpen(false);
      setClearBeforeSync(false);
      setNotice(
        clearBeforeSync
          ? `Cleared old leads and connected ${result.spreadsheetTitle || 'Google Sheet'} with ${result.imported} fresh leads.`
          : `Connected ${result.spreadsheetTitle || 'Google Sheet'} and synced ${result.imported} leads.`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not connect spreadsheet.');
    } finally {
      setSyncingSheet(false);
    }
  };
  const disconnectGoogle = async () => {
    try {
      await googleSheetsApi.disconnect();
      setSheetsStatus(await googleSheetsApi.status());
      setNotice('Google Sheets disconnected.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not disconnect Google.');
    }
  };

  const handleDisconnectSheetWithConfirm = () => {
    setConfirmDialog({
      open: true,
      title: 'Disconnect Google Sheet?',
      message: 'This will stop all automatic background synchronization from this Google Sheet. You can reconnect or choose another sheet at any time.',
      confirmLabel: 'Disconnect sheet',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await googleSheetsApi.disconnect();
          const updated = await googleSheetsApi.status();
          setSheetsStatus(updated);
          setNotice('Google Sheet disconnected successfully. Auto-sync is stopped.');
        } catch (error) {
          setNotice(error instanceof Error ? error.message : 'Could not disconnect Google.');
        }
      }
    });
  };

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

  const handleProcessImportFile = (f: File) => {
    setFileName(f.name);
    setImportingCsv(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await parseCSV(String(reader.result || ''));
      } finally {
        setImportingCsv(false);
      }
    };
    reader.onerror = () => {
      setImportingCsv(false);
      setNotice('Could not read the selected file.');
    };
    reader.readAsText(f);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    handleProcessImportFile(f);
    e.target.value = '';
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

  const campaignRecipients = leads.filter(lead => {
    if (lead.status === 'unsubscribed') return false;
    if (campaignAudience === 'selected') {
      if (!selected.includes(lead.id)) return false;
    } else if (campaignAudience !== 'all' && lead.status !== campaignAudience) {
      return false;
    }

    if (campaignDateFilterEnabled) {
      const leadTime = new Date(lead.createdAt).getTime();
      if (campaignFromDate) {
        const fromMs = new Date(`${campaignFromDate}T00:00:00`).getTime();
        if (leadTime < fromMs) return false;
      }
      if (campaignToDate) {
        const toMs = new Date(`${campaignToDate}T23:59:59.999`).getTime();
        if (leadTime > toMs) return false;
      }
    }

    return true;
  });
  const activeSelectedLeadCount = leads.filter(lead => selected.includes(lead.id) && lead.status !== 'unsubscribed').length;

  const openCampaign = (
    audience: CampaignAudience = 'new',
    options?: { dateFilterEnabled?: boolean; fromDate?: string; toDate?: string }
  ) => {
    setCampaignAudience(audience);
    if (options?.dateFilterEnabled !== undefined) {
      setCampaignDateFilterEnabled(options.dateFilterEnabled);
      setCampaignFromDate(options.fromDate || '');
      setCampaignToDate(options.toDate || '');
    } else if (timeRange === 'custom' && (customStartDate || customEndDate)) {
      setCampaignDateFilterEnabled(true);
      setCampaignFromDate(customStartDate);
      setCampaignToDate(customEndDate);
    }
    setModal('campaign');
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
    if (!campaignRecipients.length) {
      setNotice('No active leads match this audience and date criteria. Choose another date range or category before sending.');
      return;
    }
    setBusy(true);
    try {
      const leadIds = campaignRecipients.map(lead => lead.id);
      const result = await campaignsApi.create({
        name: campaignName.trim(),
        subject: effectiveSubject,
        templateId: selectedTemplateId || null,
        scheduledAt: scheduleAt ? new Date(scheduleAt).toISOString() : null,
        html: finalHtml,
        leadIds,
        audienceStatus: campaignAudience,
      });
      setNotice(result.scheduledAt ? `Campaign scheduled for ${new Date(result.scheduledAt).toLocaleString()} for ${result.scheduledRecipients} leads.` : `Campaign queued for ${result.queued} leads; ${result.suppressed} suppressed.`);
      setModal(null);
      setCampaignName('');
      setSubject('');
      setMessage('');
      setEmailHtml('');
      setScheduleAt('');
      setSelectedTemplateId('');
      setCampaignDateFilterEnabled(false);
      setCampaignFromDate('');
      setCampaignToDate('');
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

  // Campaign History Helpers & Metrics
  const formatCampaignDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatRelativeTime = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.round(diffMs / (1000 * 60));
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffMs < 0) {
        const absDiffDays = Math.abs(diffDays);
        const absDiffHours = Math.abs(diffHours);
        if (absDiffDays >= 1) return `in ${absDiffDays}d`;
        if (absDiffHours >= 1) return `in ${absDiffHours}h`;
        return 'soon';
      }
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 30) return `${diffDays}d ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const campaignStats = useMemo(() => {
    const totalCampaigns = recentCampaigns.length;
    const totalSent = recentCampaigns.reduce((acc, c) => acc + (Number(c.sent_count) || 0), 0);
    const totalRecipients = recentCampaigns.reduce((acc, c) => acc + (Number(c.recipient_count) || 0), 0);
    const completedCount = recentCampaigns.filter(c => c.status === 'completed').length;
    const scheduledCount = recentCampaigns.filter(c => c.status === 'scheduled').length;
    const sendingCount = recentCampaigns.filter(c => c.status === 'sending').length;
    const failedCount = recentCampaigns.filter(c => c.status === 'failed').length;
    const deliveryRate = totalRecipients > 0 ? Math.round((totalSent / totalRecipients) * 100) : 100;

    return {
      totalCampaigns,
      totalSent,
      totalRecipients,
      completedCount,
      scheduledCount,
      sendingCount,
      failedCount,
      deliveryRate,
    };
  }, [recentCampaigns]);

  const filteredCampaigns = useMemo(() => {
    return recentCampaigns.filter(c => {
      if (campaignStatusFilter !== 'all' && c.status !== campaignStatusFilter) {
        return false;
      }
      if (campaignSearchQuery.trim()) {
        const q = campaignSearchQuery.toLowerCase();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchSubject = (c.subject || '').toLowerCase().includes(q);
        const matchId = (c.id || '').toLowerCase().includes(q);
        if (!matchName && !matchSubject && !matchId) return false;
      }
      return true;
    });
  }, [recentCampaigns, campaignStatusFilter, campaignSearchQuery]);

  const filteredWelcomeRecords = useMemo(() => {
    if (!welcomeSearchQuery.trim()) return welcomeRecords;
    const q = welcomeSearchQuery.toLowerCase();
    return welcomeRecords.filter(r =>
      (r.email || '').toLowerCase().includes(q) ||
      (r.subject || '').toLowerCase().includes(q) ||
      (r.provider || '').toLowerCase().includes(q) ||
      (r.messageId || '').toLowerCase().includes(q)
    );
  }, [welcomeRecords, welcomeSearchQuery]);

  useEffect(() => {
    setCampaignPage(1);
  }, [campaignSearchQuery, campaignStatusFilter]);

  useEffect(() => {
    setWelcomePage(1);
  }, [welcomeSearchQuery]);

  const campaignPageCount = Math.max(1, campaignsPerPage === -1 ? 1 : Math.ceil(filteredCampaigns.length / (campaignsPerPage || 10)));
  const paginatedCampaigns = useMemo(() => {
    if (campaignsPerPage === -1) return filteredCampaigns;
    const start = (campaignPage - 1) * campaignsPerPage;
    return filteredCampaigns.slice(start, start + campaignsPerPage);
  }, [filteredCampaigns, campaignPage, campaignsPerPage]);

  const welcomePageCount = Math.max(1, welcomePerPage === -1 ? 1 : Math.ceil(filteredWelcomeRecords.length / (welcomePerPage || 25)));
  const paginatedWelcomeRecords = useMemo(() => {
    if (welcomePerPage === -1) return filteredWelcomeRecords;
    const start = (welcomePage - 1) * welcomePerPage;
    return filteredWelcomeRecords.slice(start, start + welcomePerPage);
  }, [filteredWelcomeRecords, welcomePage, welcomePerPage]);

  const recipientCounts = useMemo(() => {
    let delivered = 0;
    let failed = 0;
    let scheduled = 0;
    for (const r of detailRecipients) {
      if (r.status === 'delivered' || r.status === 'completed' || r.status === 'sent') delivered++;
      else if (r.status === 'failed') failed++;
      else if (r.status === 'scheduled') scheduled++;
    }
    return { total: detailRecipients.length, delivered, failed, scheduled };
  }, [detailRecipients]);

  const filteredCampaignRecipients = useMemo(() => {
    let result = detailRecipients;
    if (recipientStatusFilter !== 'all') {
      result = result.filter(r => {
        if (recipientStatusFilter === 'delivered') return r.status === 'delivered' || r.status === 'completed' || r.status === 'sent';
        return r.status === recipientStatusFilter;
      });
    }
    if (!campaignRecipientSearch.trim()) return result;
    const q = campaignRecipientSearch.toLowerCase().trim();
    return result.filter(r =>
      r.email.toLowerCase().includes(q) ||
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.phone && r.phone.toLowerCase().includes(q)) ||
      (r.company && r.company.toLowerCase().includes(q))
    );
  }, [detailRecipients, campaignRecipientSearch, recipientStatusFilter]);

  const campaignRecipientPageCount = Math.max(1, campaignRecipientPerPage === -1 ? 1 : Math.ceil(filteredCampaignRecipients.length / (campaignRecipientPerPage || 25)));
  const paginatedCampaignRecipients = useMemo(() => {
    if (campaignRecipientPerPage === -1) return filteredCampaignRecipients;
    const start = (campaignRecipientPage - 1) * campaignRecipientPerPage;
    return filteredCampaignRecipients.slice(start, start + campaignRecipientPerPage);
  }, [filteredCampaignRecipients, campaignRecipientPage, campaignRecipientPerPage]);

  const handleExportCampaignRecipients = (campaignName: string) => {
    if (!detailRecipients.length) return;
    const header = 'Email,Name,Phone,Company,Status,Delivered At\n';
    const rows = detailRecipients.map(r =>
      `"${r.email.replace(/"/g, '""')}","${(r.name || '').replace(/"/g, '""')}","${(r.phone || '').replace(/^"|"$/g, '').replace(/"/g, '""')}","${(r.company || '').replace(/^"|"$/g, '').replace(/"/g, '""')}","${r.status}","${r.sentAt}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${campaignName.replace(/[^a-z0-9_-]/gi, '_')}_recipients.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopySubject = (subjectText: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!subjectText) return;
    void (navigator.clipboard?.writeText(subjectText) || Promise.resolve())
      .then(() => setNotice(`Copied subject to clipboard.`))
      .catch(() => setNotice('Unable to copy to clipboard.'));
  };

  const handleDuplicateCampaign = (c: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCampaignName(`${c.name} (Copy)`);
    setSubject(c.subject || '');
    if (c.template_id) {
      setSelectedTemplateId(c.template_id);
    }
    openCampaign('new');
    setNotice(`Loaded campaign settings from "${c.name}".`);
  };

  const compiledCampaignHtml = useMemo(() => {
    if (!selectedCampaignDetail?.html_source) return '';
    let html = selectedCampaignDetail.html_source;
    if (previewPersonalized) {
      const sample = detailRecipients[0] || { name: 'Soumya Ranjan', email: 'soumya@example.com', phone: '+91 98765 43210', company: 'Titan Algo' };
      const sampleName = sample.name || 'Valued Client';
      const sampleEmail = sample.email || 'client@example.com';
      const samplePhone = sample.phone ? sample.phone.replace(/^"|"$/g, '') : '+91 98765 43210';
      const sampleCompany = sample.company ? sample.company.replace(/^"|"$/g, '') : 'Enterprise';
      html = html
        .replace(/{{\s*name\s*}}/gi, sampleName)
        .replace(/{{\s*first_name\s*}}/gi, sampleName.split(' ')[0])
        .replace(/{{\s*email\s*}}/gi, sampleEmail)
        .replace(/{{\s*phone\s*}}/gi, samplePhone)
        .replace(/{{\s*company\s*}}/gi, sampleCompany);
    }
    return html;
  }, [selectedCampaignDetail?.html_source, previewPersonalized, detailRecipients]);

  const compiledCampaignSubject = useMemo(() => {
    if (!selectedCampaignDetail?.subject) return '';
    let subj = selectedCampaignDetail.subject;
    if (previewPersonalized) {
      const sample = detailRecipients[0] || { name: 'Soumya Ranjan' };
      const sampleName = sample.name || 'Valued Client';
      subj = subj
        .replace(/{{\s*name\s*}}/gi, sampleName)
        .replace(/{{\s*first_name\s*}}/gi, sampleName.split(' ')[0]);
    }
    return subj;
  }, [selectedCampaignDetail?.subject, previewPersonalized, detailRecipients]);

  const handleInspectCampaign = (c: any) => {
    setSelectedCampaignDetail(c);
    setCampaignModalTab('template');
    setRecipientStatusFilter('all');
    setCampaignRecipientSearch('');
    setCampaignRecipientPage(1);
    setDetailRecipients([]);
    setLoadingDetailRecipients(true);
    campaignsApi.recipients(c.id)
      .then(res => {
        setDetailRecipients(res.recipients || []);
        if (res.campaign) {
          setSelectedCampaignDetail((prev: any) => ({
            ...prev,
            ...res.campaign,
            html_source: res.campaign?.html_source || prev?.html_source
          }));
        }
      })
      .catch(err => {
        console.error('Failed to load campaign recipients:', err);
        setDetailRecipients([]);
      })
      .finally(() => {
        setLoadingDetailRecipients(false);
      });
  };

  const handleRefreshCampaigns = async () => {
    setRefreshingCampaigns(true);
    try {
      const [res, welcomeRes] = await Promise.all([
        campaignsApi.list(),
        welcomeEmailsApi.list().catch(() => ({ total: 0, records: [] as WelcomeEmailRecord[] }))
      ]);
      if (res.campaigns) {
        setRecentCampaigns(res.campaigns);
      }
      setWelcomeRecords(welcomeRes.records || []);
      setWelcomeTotalSent(welcomeRes.total || 0);
      setNotice('Campaigns and welcome email history updated.');
    } catch {
      setNotice('Could not refresh campaigns.');
    } finally {
      setRefreshingCampaigns(false);
    }
  };

  const welcomeTemplate = emailSettings?.welcomeTemplate || null;
  const hasMetaFormDetails = leads.some(lead => lead.formName || lead.sourceLeadStatus);
  const welcomeEmailSummary = useMemo(() => ({
    sent: leads.filter(lead => lead.welcomeEmailStatus === 'sent' || lead.welcomeEmailStatus === 'delivered').length,
    sending: leads.filter(lead => lead.welcomeEmailStatus === 'queued' || lead.welcomeEmailStatus === 'scheduled' || lead.welcomeEmailStatus === 'sending').length,
    failed: leads.filter(lead => lead.welcomeEmailStatus === 'failed' || lead.welcomeEmailStatus === 'bounced').length,
    notSent: leads.filter(lead => !lead.welcomeEmailStatus).length,
  }), [leads]);

  const conversionRate = useMemo(() => {
    if (!leads.length) return 0;
    const reached = leads.filter(l => l.status === 'contacted' || l.status === 'qualified').length;
    return Math.round((reached / leads.length) * 100);
  }, [leads]);

  const overviewFilteredLeads = useMemo(() => {
    if (overviewLeadFilter === 'uncontacted') {
      return leads.filter(l => l.status === 'new');
    }
    return leads;
  }, [leads, overviewLeadFilter]);

  const leadSourceBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      const key = l.formName || l.campaign || l.source || 'Meta Lead Ads';
      counts[key] = (counts[key] || 0) + 1;
    }
    const total = leads.length || 1;
    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [leads]);

  const welcomeSummaryPanel = (
    <div className="welcome-summary-panel">
      <div className="welcome-summary-heading">
        <span className="welcome-summary-icon"><MailCheck size={18}/></span>
        <div><h2>Welcome email</h2><p>{welcomeTemplate ? `Automatic · ${welcomeTemplate.name}` : 'Not configured'}</p></div>
        <span className={`welcome-setup-badge ${welcomeTemplate && emailSettings?.provider.configured ? 'active' : 'needs-setup'}`}>{!welcomeTemplate ? 'Setup needed' : emailSettings?.provider.configured ? 'Configured' : 'Provider setup needed'}</span>
      </div>
      <div className="welcome-summary-counts">
        <div className="welcome-count-box sent" title="Permanent log of all welcome emails dispatched in this workspace">
          <b>{welcomeTotalSent > 0 ? welcomeTotalSent : welcomeEmailSummary.sent}</b>
          <span>Total Sent</span>
        </div>
        <div className="welcome-count-box progress">
          <b>{welcomeEmailSummary.sent}</b>
          <span>In active leads</span>
        </div>
        <div className="welcome-count-box failed">
          <b>{welcomeEmailSummary.failed}</b>
          <span>Failed</span>
        </div>
        <div className="welcome-count-box notsent">
          <b>{welcomeEmailSummary.notSent}</b>
          <span>Pending</span>
        </div>
      </div>
      <p className="welcome-summary-help">
        {welcomeTemplate ? `New leads from Sheets, CSV, or form hooks receive this template automatically. Delivery is protected: each recipient is welcomed only once.` : 'Choose a saved template for automatic new-lead emails.'}
        {welcomeTotalSent > 0 ? ` All ${welcomeTotalSent} sent records are permanently preserved in your workspace history.` : ''}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <button className="welcome-action-btn" onClick={() => setActive('Templates')}>
          {welcomeTemplate ? 'Edit welcome template' : 'Set up welcome email'} <ArrowRight size={13}/>
        </button>
        {welcomeTotalSent > 0 && (
          <button
            type="button"
            className="button secondary button-sm"
            onClick={() => {
              setActive('Campaigns');
              setOutboundTab('welcome');
            }}
            title="Inspect full list of all welcome emails dispatched"
            style={{ fontWeight: 600, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <History size={13} /> View all {welcomeTotalSent} welcome records →
          </button>
        )}
      </div>
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

      {/* Apple Sidebar Navigation (Pearl / Light Canvas with Hairline & Action Blue Pills) */}
      <aside className="apple-sidebar">
        <div className="apple-sidebar-brand">
          <div className="apple-sidebar-logo">
            <Mail size={16} />
          </div>
          <span className="apple-sidebar-title">Mailbox</span>
          <span className="apple-sidebar-badge">BETA</span>
        </div>

        <div className="apple-sidebar-section-label">MAIN</div>
        <nav className="apple-sidebar-nav">
          {[
            { name: 'Overview', icon: LayoutDashboard },
            { name: 'Leads', icon: Users, count: leads.length },
            { name: 'Campaigns', icon: Send },
            { name: 'Templates', icon: FileText },
            { name: 'Calendar', icon: CalendarDays },
          ].map(item => {
            const Icon = item.icon;
            const isTabActive = active === item.name;
            return (
              <button
                key={item.name}
                onClick={() => setActive(item.name as any)}
                className={`apple-sidebar-link ${isTabActive ? 'active' : ''}`}
              >
                <Icon size={16} className="apple-sidebar-icon" />
                <span className="apple-sidebar-link-text">{item.name}</span>
                {item.count !== undefined && (
                  <span className="apple-sidebar-count">{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="apple-sidebar-separator" />
        <div className="apple-sidebar-section-label">MANAGEMENT</div>
        <nav className="apple-sidebar-nav">
          <button
            className={`apple-sidebar-link ${active === 'Suppression list' ? 'active' : ''}`}
            onClick={() => setActive('Suppression list')}
          >
            <ShieldCheck size={16} className="apple-sidebar-icon" />
            <span className="apple-sidebar-link-text">Suppression List</span>
            <span className="apple-sidebar-soon">Soon</span>
          </button>
          <button
            className={`apple-sidebar-link ${active === 'Settings' ? 'active' : ''}`}
            onClick={() => setActive('Settings')}
          >
            <Settings2 size={16} className="apple-sidebar-icon" />
            <span className="apple-sidebar-link-text">Settings</span>
          </button>
        </nav>

        <div className="apple-sidebar-footer">
          <div className="apple-sidebar-profile-card">
            <div className="apple-profile-info">
              <div className="apple-profile-avatar">
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'M'}
              </div>
              <div className="apple-profile-details">
                <span className="apple-profile-name">{currentUser?.name || 'Metabull'}</span>
                <span className="apple-profile-email">{currentUser?.email || 'admin@metabull.com'}</span>
              </div>
            </div>
            <div className="apple-profile-actions">
              <button
                className="apple-profile-btn"
                aria-label="Google Sheets settings"
                onClick={() => setSheetSetupOpen(true)}
                title="Sheets Connection"
              >
                <Settings2 size={14} />
              </button>
              <button
                className="apple-profile-btn danger"
                aria-label="Log out"
                onClick={handleLogout}
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="apple-content-stage">
        {/* Apple Topbar Header */}
        <header className="apple-topbar">
          <div className="apple-topbar-left">
            <span className="apple-breadcrumb-root">Workspace</span>
            <ChevronRight size={13} className="apple-breadcrumb-sep" />
            <h1 className="apple-breadcrumb-active">{active}</h1>
          </div>

          <div className="apple-topbar-right">
            {/* Live sync pill */}
            <span className="apple-sync-pill" title={sheetsStatus?.configured ? 'Google Sheets auto-sync active' : 'Local snapshot'}>
              <span className={`live-dot ${serviceError ? 'dot-idle' : ''}`} />
              <span>{serviceError ? 'Offline' : sheetsStatus?.configured ? 'Live Sync' : 'Ready'}</span>
            </span>

            {/* Notification Activity */}
            <div className="apple-topbar-notifications">
              <button
                className="apple-icon-btn"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen(open => !open)}
              >
                <Bell size={16} />
                {(welcomeEmailSummary.failed + welcomeEmailSummary.sending) > 0 && <span className="apple-notif-dot" />}
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div className="notification-popover-title">
                    <b>Activity Center</b>
                    <button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">
                      <X size={14} />
                    </button>
                  </div>
                  <p>{welcomeEmailSummary.failed} failed · {welcomeEmailSummary.sending} in progress</p>
                  {leads.filter(lead => lead.welcomeEmailStatus === 'failed' || lead.welcomeEmailStatus === 'bounced').slice(0, 5).map(lead => (
                    <button className="notification-item" key={lead.id} onClick={() => { setActive('Leads'); setNotificationsOpen(false); setFilter('All leads'); setQuery(lead.email); }}>
                      <span className="notification-failure-dot" />
                      <span><b>Welcome email failed</b><small>{lead.email}</small></span>
                      <ArrowRight size={13} />
                    </button>
                  ))}
                  {welcomeEmailSummary.failed === 0 && (
                    <small className="notification-empty">No delivery errors in the current workspace.</small>
                  )}
                  <button className="link-button" onClick={() => { setActive('Leads'); setNotificationsOpen(false); }}>
                    Open lead roster <ArrowRight size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Contextual Action Blue CTAs */}
            <div className="apple-topbar-actions">
              {active === 'Leads' && (
                <>
                  <button className="button-secondary-pill" onClick={() => setModal('import')}>
                    <CloudUpload size={14} />
                    <span>Import CSV</span>
                  </button>
                  <button className="button-primary" onClick={() => openCampaign()}>
                    <Plus size={15} />
                    <span>New Campaign</span>
                  </button>
                </>
              )}
              {active === 'Overview' && (
                <>
                  <button
                    className="button-secondary-pill"
                    onClick={syncGoogleSheet}
                    disabled={syncingSheet || !sheetsStatus?.configured}
                  >
                    <RefreshCw size={13} className={syncingSheet ? 'spin' : ''} />
                    <span>{syncingSheet ? 'Syncing…' : 'Sync Sheet'}</span>
                  </button>
                  <button className="button-primary" onClick={() => openCampaign()}>
                    <Plus size={15} />
                    <span>New Campaign</span>
                  </button>
                </>
              )}
              {active === 'Campaigns' && (
                <button className="button-primary" onClick={() => openCampaign()}>
                  <Plus size={15} />
                  <span>New Campaign</span>
                </button>
              )}
              {active === 'Templates' && (
                <button className="button-primary" onClick={() => { setEditingTemplate(null); setTemplateStudioOpen(true); }}>
                  <Plus size={15} />
                  <span>Create Template</span>
                </button>
              )}
              {active === 'Calendar' && (
                <button className="button-primary" onClick={() => openCampaign()}>
                  <Plus size={15} />
                  <span>Schedule Campaign</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="main">

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
            </div>

            <div className={`source-strip ${sheetsStatus?.configured ? 'is-connected' : 'is-unconnected'}`}>
              <div className="source-left">
                <div className="source-icon-wrap">
                  <div className="source-icon">
                    <FileSpreadsheet size={18} />
                  </div>
                  <span className={`source-live-indicator ${sheetsStatus?.configured ? 'active' : ''}`} />
                </div>
                <div className="source-meta">
                  <div className="source-title-row">
                    <b className="source-title">
                      {sheetsStatus?.configured ? (
                        sheetsStatus.spreadsheetUrl ? (
                          <a
                            href={sheetsStatus.spreadsheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: '#166534',
                              textDecoration: 'none',
                              fontWeight: 700
                            }}
                            title="Open currently syncing Google Sheet in new tab"
                          >
                            <FileSpreadsheet size={16} style={{ color: '#16a34a' }} />
                            <span>{sheetsStatus.spreadsheetTitle || (sheetsStatus.spreadsheetId ? `Sheet: ${sheetsStatus.spreadsheetId.slice(0, 18)}…` : 'Connected Google Sheet')}</span>
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span>{sheetsStatus.spreadsheetTitle || 'Connected Google Sheet'}</span>
                        )
                      ) : (
                        'Meta Lead Ads spreadsheet'
                      )}
                    </b>
                    <span className={`connected-pill ${sheetsStatus?.configured ? 'is-connected' : 'is-pending'}`}>
                      <i />
                      {sheetsStatus?.configured ? 'Live Sync Active' : 'Not connected'}
                    </span>
                    {sheetsStatus?.lastError && (
                      <span className="sheets-error-pill" title={sheetsStatus.lastError}>
                        <ShieldAlert size={12} /> Sync error
                      </span>
                    )}
                  </div>
                  <p className="source-subtitle">
                    {sheetsStatus?.configured ? (
                      <>
                        <span className="source-account-badge">Account: {sheetsStatus.googleEmail || 'Google'}</span>
                        <span className="source-sep">·</span>
                        <span className="source-range-badge">Tab: {sheetsStatus.range}</span>
                        <span className="source-sep">·</span>
                        <span className="source-sync-time">
                          {sheetsStatus.lastSyncedAt
                            ? `Last synced ${new Date(sheetsStatus.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : `Auto-syncs every ${sheetsStatus.intervalMinutes || 5} min`}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>Connect your Google Sheet to auto-sync leads from Meta Lead Ads into Mailbox every 5 mins.</span>
                        <span className="source-sep">·</span>
                        <span className="source-csv-note">Or continue with CSV snapshot ({fileName})</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="source-right">
                {sheetsStatus?.configured ? (
                  <div className="source-actions-group">
                    <button
                      className="button secondary button-sm sheet-action-btn"
                      disabled={syncingSheet}
                      onClick={syncGoogleSheet}
                      title="Run manual synchronization now"
                    >
                      <RefreshCw size={13} className={syncingSheet ? 'spin' : ''} />
                      {syncingSheet ? 'Syncing leads…' : 'Sync now'}
                    </button>
                    <button
                      className="button secondary button-sm sheet-action-btn"
                      onClick={() => setSheetSetupOpen(true)}
                    >
                      <Settings2 size={13} />
                      Manage sheet
                    </button>
                    <button
                      type="button"
                      className="button secondary button-sm sheet-action-btn"
                      style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                      onClick={handleDisconnectSheetWithConfirm}
                      title="Disconnect Google Sheet to stop background syncing"
                    >
                      <Unlink size={13} />
                      Disconnect
                    </button>
                    <button
                      className="button ghost button-sm sheet-action-btn"
                      onClick={() => setModal('import')}
                    >
                      <CloudUpload size={13} />
                      Import CSV
                    </button>
                    {leads.length > 0 && (
                      <button
                        className="button ghost button-sm text-destructive sheet-action-btn"
                        onClick={clearAllOldLeads}
                        title="Delete old leads from this workspace to start fresh"
                      >
                        <Trash2 size={13} />
                        Clear old leads
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="source-actions-group">
                    <button
                      className="button primary button-sm sheet-connect-cta"
                      onClick={() => setSheetSetupOpen(true)}
                    >
                      <FileSpreadsheet size={14} />
                      Connect Google Sheet
                      <ArrowRight size={13} />
                    </button>
                    <button
                      className="button secondary button-sm sheet-action-btn"
                      onClick={() => setModal('import')}
                    >
                      <CloudUpload size={13} />
                      Import CSV snapshot
                    </button>
                  </div>
                )}
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
                  <span>New {timeRange === 'all' ? 'leads' : timeRange === 'today' ? 'today' : timeRange === '7days' ? 'this week' : timeRange === '30days' ? 'this month' : timeRange === '90days' ? 'in 90 days' : timeRange === 'custom' ? 'in custom range' : 'this year'}</span>
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
                    <option value="custom">Custom date range…</option>
                  </select>
                  {timeRange === 'custom' && (
                    <div className="toolbar-custom-dates">
                      <label>
                        <span>From</span>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={e => setCustomStartDate(e.target.value)}
                          max={customEndDate || undefined}
                          title="Start date"
                        />
                      </label>
                      <label>
                        <span>To</span>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={e => setCustomEndDate(e.target.value)}
                          min={customStartDate || undefined}
                          title="End date"
                        />
                      </label>
                    </div>
                  )}
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
                  {(query || filter !== 'All leads' || timeRange !== 'all' || customStartDate || customEndDate) && (
                    <button
                      className="filter-button"
                      onClick={() => {
                        setQuery('');
                        setFilter('All leads');
                        setTimeRange('all');
                        setCustomStartDate('');
                        setCustomEndDate('');
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
                    {timeRange === 'today' ? ' (filtering today)' : timeRange === 'custom' ? ' (custom date range)' : ''}
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
                          {openLeadActions === l.id && <div className="lead-row-menu"><button onClick={() => { void navigator.clipboard?.writeText(l.email).then(() => setNotice(`Copied ${l.email}.`)).catch(() => setNotice('Clipboard access is unavailable in this browser.')); setOpenLeadActions(null); }}>Copy email</button>{['failed','bounced'].includes(l.welcomeEmailStatus || '') && <button onClick={() => { void retryWelcome(l); }}>Retry welcome email</button>}<button onClick={() => { void updateLeadStatus(l); }}>Mark {l.status === 'contacted' ? 'new' : 'contacted'}</button><button onClick={() => { setSelected([l.id]); openCampaign('selected'); setCampaignName(''); setSubject(''); setMessage(''); setEmailHtml(''); setSelectedTemplateId(''); setOpenLeadActions(null); }}>Create campaign</button></div>}
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
                          setCustomStartDate('');
                          setCustomEndDate('');
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
                        openCampaign();
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
          <section className="page">
            <div className="page-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-dot"/> SEND PLANNING</div>
                <h1>Plan your sends</h1>
                <p>Schedule a saved template for the date and time that works for your audience.</p>
              </div>
            </div>
            <div className="calendar-card">
              <div className="calendar-toolbar">
                <div>
                  <h2>{calendarMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</h2>
                  <p>{recentCampaigns.filter(c=>c.scheduled_at&&new Date(c.scheduled_at).getMonth()===calendarMonth.getMonth()&&new Date(c.scheduled_at).getFullYear()===calendarMonth.getFullYear()).length} scheduled campaigns</p>
                </div>
                <div className="calendar-controls">
                  <button className="button secondary" onClick={()=>setCalendarMonth(new Date())}>Today</button>
                  <button className="icon-button" onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1))}><ChevronLeft size={16}/></button>
                  <button className="icon-button" onClick={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1))}><ChevronRight size={16}/></button>
                </div>
              </div>
              <div className="calendar-grid">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><div className="calendar-weekday" key={day}>{day}</div>)}
                {Array.from({length:(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1).getDay()+6)%7},(_,i)=><div className="calendar-blank" key={`blank-${i}`}/>)}
                {Array.from({length:new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0).getDate()},(_,i)=>{
                  const day=i+1;
                  const date=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),day);
                  const items=recentCampaigns.filter(c=>c.scheduled_at&&new Date(c.scheduled_at).toDateString()===date.toDateString());
                  return (
                    <button className={`calendar-day ${date.toDateString()===new Date().toDateString()?'today':''}`} key={day} onClick={()=>{
                      if(date.getTime()<=Date.now()){
                        setNotice('Choose a future date to schedule this campaign.');
                        return;
                      }
                      setScheduleAt(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}T10:00`);
                      openCampaign();
                    }}>
                      <span>{day}</span>
                      {items.map(c=><small key={c.id}><Mail size={11}/>{c.name}</small>)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="scheduled-list">
              <h2>Upcoming sends</h2>
              {recentCampaigns.filter(c=>c.scheduled_at&&new Date(c.scheduled_at)>=new Date()).sort((a,b)=>new Date(a.scheduled_at).getTime()-new Date(b.scheduled_at).getTime()).map(c=>(
                <div className="scheduled-row" key={c.id}>
                  <div className="scheduled-date">
                    <b>{new Date(c.scheduled_at).toLocaleDateString('en-US',{day:'2-digit'})}</b>
                    <span>{new Date(c.scheduled_at).toLocaleDateString('en-US',{month:'short'})}</span>
                  </div>
                  <div>
                    <b>{c.name}</b>
                    <small>{c.subject} · {new Date(c.scheduled_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</small>
                  </div>
                  <span className="status contacted"><i/>{c.status}</span>
                </div>
              ))}
              {!recentCampaigns.some(c=>c.scheduled_at&&new Date(c.scheduled_at)>=new Date())&&<p className="no-scheduled">Nothing scheduled yet. Select a day on the calendar to plan your first send.</p>}
            </div>
          </section>
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
              <article className="workspace-setting-card">
                <span className="stat-icon blue"><FileSpreadsheet size={17}/></span>
                <div>
                  <h2>Google Sheets</h2>
                  <p>{sheetsStatus?.googleEmail ? `Connected · ${sheetsStatus.googleEmail}` : 'Not connected'}</p>
                  <small>
                    {sheetsStatus?.configured ? (
                      <>
                        {sheetsStatus.spreadsheetTitle ? <b>{sheetsStatus.spreadsheetTitle} · </b> : null}
                        {sheetsStatus.spreadsheetUrl ? (
                          <a href={sheetsStatus.spreadsheetUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'inherit', fontWeight: 600 }}>
                            Open Sheet <ExternalLink size={10} style={{ display: 'inline' }} />
                          </a>
                        ) : sheetsStatus.spreadsheetId}
                        {` · ${sheetsStatus.range}`}
                      </>
                    ) : 'Connect an account and choose a spreadsheet to sync leads.'}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="button secondary" onClick={() => setSheetSetupOpen(true)}>Manage</button>
                  {sheetsStatus?.configured && (
                    <button className="button secondary text-destructive" style={{ borderColor: '#fca5a5' }} onClick={handleDisconnectSheetWithConfirm}>
                      Disconnect
                    </button>
                  )}
                </div>
              </article>
              <article className="workspace-setting-card"><span className="stat-icon violet"><ShieldCheck size={17}/></span><div><h2>Suppression list</h2><p>Management coming soon</p><small>Campaign delivery protection continues to run automatically.</small></div><button className="button secondary" onClick={()=>setActive('Suppression list')}>Coming soon</button></article>
              <article className="workspace-setting-card"><span className="stat-icon blue"><Users size={17}/></span><div><h2>Signed in as</h2><p>{currentUser?.name||'Workspace admin'}</p><small>{currentUser?.email||'Administrator account'}</small></div><button className="button secondary" onClick={handleLogout}>Sign out</button></article>
            </div>
          </section>
        ) : active === 'Campaigns' ? (
          <section className="page campaigns-page">
            <div className="page-heading">
              <div>
                <h1>Campaigns</h1>
                <p>Manage, track, and monitor outbound email campaigns.</p>
              </div>
              <div className="heading-actions">
                <button
                  className="button-secondary-pill"
                  onClick={handleRefreshCampaigns}
                  disabled={refreshingCampaigns}
                  title="Refresh campaign history"
                >
                  <RefreshCw size={13} className={refreshingCampaigns ? 'spin' : ''} />
                  <span>Refresh</span>
                </button>
                <button className="button-primary" onClick={() => openCampaign()}>
                  <Plus size={15} />
                  <span>New Campaign</span>
                </button>
              </div>
            </div>

            {/* Campaign Performance KPI Grid */}
            {/* Campaign Performance KPI Grid */}
            <div className="stats-grid campaign-stats-grid">
              <div
                className={`stat-card ${outboundTab === 'campaigns' ? 'stat-card-active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setOutboundTab('campaigns')}
                title="Click to view broadcast campaigns"
              >
                <div className="stat-top">
                  <span>Broadcast Campaigns</span>
                  <span className="stat-icon">
                    <Send size={14} />
                  </span>
                </div>
                <div className="stat-value">{campaignStats.totalCampaigns}</div>
                <div className="stat-foot">
                  <span>{campaignStats.completedCount} delivered · {campaignStats.scheduledCount} scheduled</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Total Emails Sent</span>
                  <span className="stat-icon">
                    <Mail size={14} />
                  </span>
                </div>
                <div className="stat-value">{(campaignStats.totalSent + welcomeTotalSent).toLocaleString()}</div>
                <div className="stat-foot">
                  <span>{campaignStats.totalSent.toLocaleString()} broadcast · {welcomeTotalSent.toLocaleString()} automated</span>
                </div>
              </div>

              <div
                className={`stat-card ${outboundTab === 'welcome' ? 'stat-card-active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setOutboundTab('welcome')}
                title="Click to view all automated welcome email records"
              >
                <div className="stat-top">
                  <span>Welcome Emails</span>
                  <span className="stat-icon" style={{ color: '#16a34a' }}>
                    <Sparkles size={14} />
                  </span>
                </div>
                <div className="stat-value">{welcomeTotalSent.toLocaleString()}</div>
                <div className="stat-foot">
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>Permanent log · Click to view →</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Scheduled</span>
                  <span className="stat-icon">
                    <Clock size={14} />
                  </span>
                </div>
                <div className="stat-value">{campaignStats.scheduledCount}</div>
                <div className="stat-foot">
                  <span>{campaignStats.scheduledCount === 1 ? '1 upcoming campaign' : `${campaignStats.scheduledCount} upcoming campaigns`}</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  <span>Delivery Rate</span>
                  <span className="stat-icon">
                    <CheckCircle2 size={14} />
                  </span>
                </div>
                <div className="stat-value">{campaignStats.deliveryRate}%</div>
                <div className="stat-foot">
                  <span>{campaignStats.failedCount > 0 ? `${campaignStats.failedCount} failed sends` : '100% deliverability'}</span>
                </div>
              </div>
            </div>

            {/* Outbound View Switcher */}
            <div className="campaign-view-switcher">
              <button
                type="button"
                className={`view-switcher-tab ${outboundTab === 'campaigns' ? 'active' : ''}`}
                onClick={() => setOutboundTab('campaigns')}
              >
                <Send size={14} />
                <span>Broadcast Campaigns</span>
                <span className="switcher-badge">{recentCampaigns.length}</span>
              </button>
              <button
                type="button"
                className={`view-switcher-tab ${outboundTab === 'welcome' ? 'active' : ''}`}
                onClick={() => setOutboundTab('welcome')}
              >
                <Sparkles size={14} />
                <span>Automated Welcome Emails</span>
                <span className="switcher-badge highlight">{welcomeTotalSent}</span>
              </button>
            </div>

            {outboundTab === 'campaigns' ? (
              /* Main Broadcast Campaigns Table Card */
              <div className="table-card campaign-list-card">
                <div className="campaign-toolbar">
                  <div className="campaign-toolbar-left">
                    <div className="searchbox campaign-search">
                      <Search size={14} />
                      <input
                        type="text"
                        placeholder="Search campaigns..."
                        value={campaignSearchQuery}
                        onChange={e => setCampaignSearchQuery(e.target.value)}
                      />
                      {campaignSearchQuery && (
                        <button
                          className="clear-search-btn"
                          onClick={() => setCampaignSearchQuery('')}
                          aria-label="Clear search"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="campaign-filter-tabs">
                      <button
                        className={`campaign-tab ${campaignStatusFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setCampaignStatusFilter('all')}
                      >
                        All <span className="tab-badge">{recentCampaigns.length}</span>
                      </button>
                      <button
                        className={`campaign-tab ${campaignStatusFilter === 'completed' ? 'active' : ''}`}
                        onClick={() => setCampaignStatusFilter('completed')}
                      >
                        Delivered <span className="tab-badge">{campaignStats.completedCount}</span>
                      </button>
                      <button
                        className={`campaign-tab ${campaignStatusFilter === 'scheduled' ? 'active' : ''}`}
                        onClick={() => setCampaignStatusFilter('scheduled')}
                      >
                        Scheduled <span className="tab-badge">{campaignStats.scheduledCount}</span>
                      </button>
                      {(campaignStats.sendingCount > 0 || campaignStatusFilter === 'sending') && (
                        <button
                          className={`campaign-tab ${campaignStatusFilter === 'sending' ? 'active' : ''}`}
                          onClick={() => setCampaignStatusFilter('sending')}
                        >
                          Sending <span className="tab-badge">{campaignStats.sendingCount}</span>
                        </button>
                      )}
                      {(campaignStats.failedCount > 0 || campaignStatusFilter === 'failed') && (
                        <button
                          className={`campaign-tab ${campaignStatusFilter === 'failed' ? 'active' : ''}`}
                          onClick={() => setCampaignStatusFilter('failed')}
                        >
                          Failed <span className="tab-badge">{campaignStats.failedCount}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="campaign-toolbar-right">
                    {(campaignSearchQuery || campaignStatusFilter !== 'all') && (
                      <button
                        className="reset-filters-link"
                        onClick={() => {
                          setCampaignSearchQuery('');
                          setCampaignStatusFilter('all');
                        }}
                      >
                        Reset filters
                      </button>
                    )}
                    <span className="campaign-count-indicator">
                      Showing <b>{filteredCampaigns.length}</b> of {recentCampaigns.length}
                    </span>
                  </div>
                </div>

                <div className="table-wrap campaign-table-container">
                  <table className="campaign-modern-table">
                    <thead>
                      <tr>
                        <th style={{ width: '44%' }}>CAMPAIGN</th>
                        <th style={{ width: '16%' }}>AUDIENCE</th>
                        <th style={{ width: '16%' }}>STATUS</th>
                        <th style={{ width: '16%' }}>DATE</th>
                        <th style={{ width: '8%', textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCampaigns.map(c => {
                        const dateDisplay = c.scheduled_at ? c.scheduled_at : c.created_at;
                        const matchedTemplate = c.template_id ? templates.find(t => t.id === c.template_id) : null;

                        return (
                          <tr
                            key={c.id}
                            className="campaign-row"
                            onClick={() => handleInspectCampaign(c)}
                          >
                            {/* Campaign Name & Subject preview */}
                            <td>
                              <div className="campaign-primary-cell">
                                <div className="campaign-title-row">
                                  <span className="campaign-name">{c.name}</span>
                                  {matchedTemplate && (
                                    <span className="campaign-template-pill" title={`Template: ${matchedTemplate.name}`}>
                                      {matchedTemplate.name}
                                    </span>
                                  )}
                                </div>
                                <div className="campaign-subject-preview" title={c.subject}>
                                  {c.subject || 'No subject'}
                                </div>
                              </div>
                            </td>

                            {/* Audience */}
                            <td>
                              <span className="campaign-audience-text">
                                {c.recipient_count} {c.recipient_count === 1 ? 'lead' : 'leads'}
                              </span>
                            </td>

                            {/* Status */}
                            <td>
                              <span className={`apple-status-badge ${c.status}`}>
                                <span className="status-dot" />
                                {c.status === 'completed'
                                  ? 'Delivered'
                                  : c.status === 'scheduled'
                                  ? 'Scheduled'
                                  : c.status === 'sending'
                                  ? 'Sending'
                                  : c.status === 'failed'
                                  ? 'Failed'
                                  : c.status}
                              </span>
                            </td>

                            {/* Date */}
                            <td>
                              <span className="campaign-date-text">
                                {formatCampaignDate(dateDisplay)}
                              </span>
                            </td>

                            {/* Quick Action */}
                            <td style={{ textAlign: 'right' }}>
                              <div className="campaign-row-actions" onClick={e => e.stopPropagation()}>
                                <button
                                  className="campaign-view-button"
                                  title="View campaign recipients and audit logs"
                                  onClick={() => handleInspectCampaign(c)}
                                >
                                  <Users size={12} /> View ({c.recipient_count})
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Empty State when no campaigns exist */}
                  {!recentCampaigns.length && (
                    <div className="campaign-empty-banner">
                      <div className="empty-icon-circle">
                        <Send size={24} />
                      </div>
                      <h3>No campaigns created yet</h3>
                      <p>Create your first campaign to send targeted email outreach to your Meta leads via ZeptoMail.</p>
                      <button className="button primary button-sm" onClick={() => openCampaign()}>
                        <Plus size={14} /> Create your first campaign
                      </button>
                    </div>
                  )}

                  {/* Empty State when filters yield no results */}
                  {recentCampaigns.length > 0 && !filteredCampaigns.length && (
                    <div className="campaign-empty-banner">
                      <div className="empty-icon-circle">
                        <Search size={22} />
                      </div>
                      <h3>No matching campaigns found</h3>
                      <p>Try adjusting your search terms or status filter to see other campaigns.</p>
                      <button
                        className="button secondary button-sm"
                        onClick={() => {
                          setCampaignSearchQuery('');
                          setCampaignStatusFilter('all');
                        }}
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}
                </div>

                {/* Broadcast Campaigns Table Pagination Footer */}
                {filteredCampaigns.length > 0 && (
                  <div className="campaign-table-footer">
                    <div className="campaign-footer-left">
                      <span>
                        Showing{' '}
                        <b>
                          {filteredCampaigns.length
                            ? (campaignPage - 1) * (campaignsPerPage === -1 ? filteredCampaigns.length : campaignsPerPage) + 1
                            : 0}
                          –
                          {campaignsPerPage === -1
                            ? filteredCampaigns.length
                            : Math.min(campaignPage * campaignsPerPage, filteredCampaigns.length)}
                        </b>{' '}
                        of <b>{filteredCampaigns.length}</b> campaigns
                        {recentCampaigns.length !== filteredCampaigns.length && ` (filtered from ${recentCampaigns.length} total)`}
                      </span>
                      <div className="campaign-page-size-selector">
                        <span>Per page:</span>
                        <select
                          className="campaign-page-size-select"
                          value={campaignsPerPage}
                          onChange={e => {
                            setCampaignsPerPage(Number(e.target.value));
                            setCampaignPage(1);
                          }}
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={-1}>All</option>
                        </select>
                      </div>
                    </div>

                    <div className="campaign-footer-right">
                      <button
                        className="campaign-pagination-btn"
                        disabled={campaignPage <= 1}
                        onClick={() => setCampaignPage(p => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={14} /> Prev
                      </button>
                      <span className="campaign-page-indicator">
                        Page {campaignPage} of {campaignPageCount}
                      </span>
                      <button
                        className="campaign-pagination-btn"
                        disabled={campaignPage >= campaignPageCount}
                        onClick={() => setCampaignPage(p => Math.min(campaignPageCount, p + 1))}
                        aria-label="Next page"
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Automated Welcome Emails Audit Table Card */
              <div className="table-card campaign-list-card">
                <div className="campaign-toolbar">
                  <div className="campaign-toolbar-left">
                    <div className="searchbox campaign-search" style={{ width: 280 }}>
                      <Search size={14} />
                      <input
                        type="text"
                        placeholder="Search by recipient email or subject..."
                        value={welcomeSearchQuery}
                        onChange={e => setWelcomeSearchQuery(e.target.value)}
                      />
                      {welcomeSearchQuery && (
                        <button
                          className="clear-search-btn"
                          onClick={() => setWelcomeSearchQuery('')}
                          aria-label="Clear search"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="welcome-live-banner-tag">
                      <Sparkles size={13} style={{ color: '#16a34a' }} />
                      <span>Permanent Delivery Audit · Preserved even if leads are deleted</span>
                    </div>
                  </div>

                  <div className="campaign-toolbar-right">
                    {welcomeSearchQuery && (
                      <button
                        className="reset-filters-link"
                        onClick={() => setWelcomeSearchQuery('')}
                      >
                        Clear search
                      </button>
                    )}
                    <span className="campaign-count-indicator">
                      Showing <b>{filteredWelcomeRecords.length}</b> of {welcomeRecords.length} loaded ({welcomeTotalSent} total lifetime sent)
                    </span>
                  </div>
                </div>

                <div className="table-wrap campaign-table-container">
                  <table className="campaign-modern-table">
                    <thead>
                      <tr>
                        <th style={{ width: '38%' }}>RECIPIENT</th>
                        <th style={{ width: '32%' }}>AUTOMATION & SUBJECT</th>
                        <th style={{ width: '15%' }}>STATUS</th>
                        <th style={{ width: '15%' }}>DELIVERED AT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedWelcomeRecords.map(w => (
                        <tr key={w.id} className="campaign-row">
                          <td>
                            <div className="welcome-recipient-cell">
                              <span className="welcome-avatar-icon">
                                <Mail size={13} />
                              </span>
                              <span className="welcome-recipient-email" title={w.email}>
                                {w.email}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="welcome-subject-cell">
                              <span className="welcome-type-badge">
                                ⚡ Automated Welcome
                              </span>
                              <span className="campaign-subject-preview" title={w.subject}>
                                {w.subject || 'Lead Welcome & Follow-up'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="apple-status-badge completed">
                              <span className="status-dot" />
                              Delivered
                            </span>
                          </td>
                          <td>
                            <span className="campaign-date-text">
                              {formatCampaignDate(w.sentAt)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Empty State when no welcome emails sent */}
                  {!welcomeRecords.length && (
                    <div className="campaign-empty-banner">
                      <div className="empty-icon-circle">
                        <Sparkles size={24} style={{ color: '#16a34a' }} />
                      </div>
                      <h3>No welcome emails recorded yet</h3>
                      <p>When leads arrive from Google Sheets or CSV with an active Welcome Template, automated delivery records are stored permanently here.</p>
                      <button className="button primary button-sm" onClick={() => setActive('Templates')}>
                        Configure Welcome Template
                      </button>
                    </div>
                  )}

                  {/* Empty State when search matches nothing */}
                  {welcomeRecords.length > 0 && !filteredWelcomeRecords.length && (
                    <div className="campaign-empty-banner">
                      <div className="empty-icon-circle">
                        <Search size={22} />
                      </div>
                      <h3>No matching welcome email records found</h3>
                      <p>Try searching with a different email address or keyword.</p>
                      <button
                        className="button secondary button-sm"
                        onClick={() => setWelcomeSearchQuery('')}
                      >
                        Clear search
                      </button>
                    </div>
                  )}
                </div>

                {/* Welcome Emails Table Pagination Footer */}
                {filteredWelcomeRecords.length > 0 && (
                  <div className="campaign-table-footer">
                    <div className="campaign-footer-left">
                      <span>
                        Showing{' '}
                        <b>
                          {filteredWelcomeRecords.length
                            ? (welcomePage - 1) * (welcomePerPage === -1 ? filteredWelcomeRecords.length : welcomePerPage) + 1
                            : 0}
                          –
                          {welcomePerPage === -1
                            ? filteredWelcomeRecords.length
                            : Math.min(welcomePage * welcomePerPage, filteredWelcomeRecords.length)}
                        </b>{' '}
                        of <b>{filteredWelcomeRecords.length}</b> records
                        <span className="welcome-lifetime-counter">({welcomeTotalSent} lifetime sent)</span>
                      </span>
                      <div className="campaign-page-size-selector">
                        <span>Per page:</span>
                        <select
                          className="campaign-page-size-select"
                          value={welcomePerPage}
                          onChange={e => {
                            setWelcomePerPage(Number(e.target.value));
                            setWelcomePage(1);
                          }}
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={-1}>All</option>
                        </select>
                      </div>
                    </div>

                    <div className="campaign-footer-right">
                      <button
                        className="campaign-pagination-btn"
                        disabled={welcomePage <= 1}
                        onClick={() => setWelcomePage(p => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={14} /> Prev
                      </button>
                      <span className="campaign-page-indicator">
                        Page {welcomePage} of {welcomePageCount}
                      </span>
                      <button
                        className="campaign-pagination-btn"
                        disabled={welcomePage >= welcomePageCount}
                        onClick={() => setWelcomePage(p => Math.min(welcomePageCount, p + 1))}
                        aria-label="Next page"
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          /* Redesigned Impeccable Overview Hub */
          <section className="page overview-hub-page">
            {/* Apple Near-Black Hero Tile 1 (#272729) */}
            <div className="overview-hero-tile-dark">
              <div className="hero-tile-content">
                <span className="hero-tile-eyebrow">Executive Pipeline</span>
                <h1 className="hero-tile-title">{getGreeting()}, {currentUser?.name?.split(' ')[0] || 'Leader'}</h1>
                <p className="hero-tile-body">
                  <span>{stats.totalLeads} synced leads across your campaigns</span>
                  <span className="hero-bullet">·</span>
                  <span>{sheetsStatus?.configured ? 'Google Sheets live sync active' : 'Awaiting sheet connection'}</span>
                  <span className="hero-bullet">·</span>
                  <span>{stats.newLeads} leads awaiting first-touch outreach</span>
                </p>
                <div className="hero-tile-actions">
                  <button
                    className="button-primary"
                    onClick={() => openCampaign()}
                  >
                    <Plus size={15} />
                    <span>New Campaign</span>
                  </button>
                  <button
                    className="hero-link-btn"
                    onClick={() => { setActive('Leads'); setFilter('New'); }}
                  >
                    <span>View uncontacted leads</span>
                    <ArrowRight size={14} />
                  </button>
                  <button
                    className="hero-link-btn"
                    onClick={syncGoogleSheet}
                    disabled={syncingSheet || !sheetsStatus?.configured}
                  >
                    <RefreshCw size={13} className={syncingSheet ? 'spin' : ''} />
                    <span>{syncingSheet ? 'Syncing…' : 'Sync Google Sheet'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4 Executive KPI Performance Tiles */}
            <div className="overview-kpi-grid">
              {/* Tile 1: Total Volume */}
              <div className="kpi-panel" onClick={() => { setActive('Leads'); setFilter('All leads'); }}>
                <div className="kpi-panel-top">
                  <span className="kpi-label">Total Leads</span>
                  <span className="kpi-icon mint">
                    <Users size={16} />
                  </span>
                </div>
                <div className="kpi-number">{stats.totalLeads.toLocaleString()}</div>
                <div className="kpi-footer">
                  <span className="kpi-badge mint">
                    +{newThisWeek} this week
                  </span>
                  <span className="kpi-subtext">Active contacts</span>
                </div>
              </div>

              {/* Tile 2: Contacted / Conversion Velocity */}
              <div className="kpi-panel" onClick={() => { setActive('Leads'); setFilter('Contacted'); }}>
                <div className="kpi-panel-top">
                  <span className="kpi-label">Outreach Reach</span>
                  <span className="kpi-icon blue">
                    <Send size={15} />
                  </span>
                </div>
                <div className="kpi-number">{stats.contactedLeads.toLocaleString()}</div>
                <div className="kpi-footer">
                  <span className="kpi-badge blue">
                    {conversionRate}% reached
                  </span>
                  <span className="kpi-subtext">of total leads</span>
                </div>
              </div>

              {/* Tile 3: Ready to Reach (New Leads) */}
              <div className="kpi-panel" onClick={() => { setActive('Leads'); setFilter('New'); }}>
                <div className="kpi-panel-top">
                  <span className="kpi-label">Ready to Convert</span>
                  <span className="kpi-icon gold">
                    <Sparkles size={15} />
                  </span>
                </div>
                <div className="kpi-number">{stats.newLeads.toLocaleString()}</div>
                <div className="kpi-footer">
                  <span className="kpi-badge gold">
                    {stats.newLeads > 0 ? 'Action required' : 'All caught up'}
                  </span>
                  <span className="kpi-subtext">Awaiting outreach</span>
                </div>
              </div>

              {/* Tile 4: Automated Welcome Engine */}
              <div className="kpi-panel" onClick={() => { setActive('Campaigns'); setOutboundTab('welcome'); }}>
                <div className="kpi-panel-top">
                  <span className="kpi-label">Welcome Automation</span>
                  <span className="kpi-icon violet">
                    <MailCheck size={16} />
                  </span>
                </div>
                <div className="kpi-number">{(welcomeTotalSent > 0 ? welcomeTotalSent : welcomeEmailSummary.sent).toLocaleString()}</div>
                <div className="kpi-footer">
                  <span className={`kpi-badge ${welcomeTemplate ? 'mint' : 'muted'}`}>
                    {welcomeTemplate ? 'Active' : 'Off'}
                  </span>
                  <span className="kpi-subtext" title={welcomeTemplate ? welcomeTemplate.name : 'Configure automatic send'}>
                    {welcomeTemplate ? welcomeTemplate.name.slice(0, 16) : 'Not configured'}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Interactive Grid: Intake Chart & Priority Pipeline vs Operational Hub */}
            <div className="overview-cockpit-layout">
              {/* Left Column: Intake Visualizer & Priority Pipeline */}
              <div className="overview-cockpit-left">
                {/* 7-Day Lead Ingestion Chart */}
                <div className="cockpit-card lead-velocity-card">
                  <div className="cockpit-card-header">
                    <div>
                      <h2>Lead Intake Velocity</h2>
                      <p>Trailing 7-day volume from Meta Lead Ads campaigns</p>
                    </div>
                    <div className="intake-metric-pill">
                      <TrendingUp size={13} />
                      <span><b>{newThisWeek}</b> leads in past 7 days</span>
                    </div>
                  </div>

                  <div className="intake-chart-container">
                    <div className="intake-bars-track">
                      {activityDays.map((item, i) => {
                        const isMax = item.count > 0 && item.count === Math.max(...activityDays.map(x => x.count));
                        return (
                          <div key={i} className="intake-day-column" title={`${item.label}: ${item.count} leads`}>
                            {item.count > 0 ? (
                              <span className={`intake-day-count ${isMax ? 'peak' : ''}`}>
                                {item.count}
                              </span>
                            ) : (
                              <span className="intake-day-count" style={{ opacity: 0 }}>0</span>
                            )}
                            <div className="intake-bar-wrapper">
                              <div
                                className={`intake-bar-fill ${isMax ? 'peak-fill' : ''}`}
                                style={{ height: `${Math.max(item.height, item.count > 0 ? 18 : 6)}%` }}
                              />
                            </div>
                            <span className="intake-day-label">{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Priority Outreach Leads Stream */}
                <div className="cockpit-card priority-leads-card">
                  <div className="cockpit-card-header">
                    <div>
                      <h2>Priority Leads to Contact</h2>
                      <p>Prospects ready for follow-up and appointment booking</p>
                    </div>
                    <div className="cockpit-tab-pills">
                      <button
                        className={`cockpit-tab ${overviewLeadFilter === 'uncontacted' ? 'active' : ''}`}
                        onClick={() => setOverviewLeadFilter('uncontacted')}
                      >
                        Uncontacted ({stats.newLeads})
                      </button>
                      <button
                        className={`cockpit-tab ${overviewLeadFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setOverviewLeadFilter('all')}
                      >
                        Recent All ({leads.length})
                      </button>
                    </div>
                  </div>

                  <div className="priority-leads-list">
                    {overviewFilteredLeads.slice(0, 6).map(l => {
                      const isUncontacted = l.status === 'new';
                      const initialLetters = l.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || 'L';
                      return (
                        <div key={l.id} className="priority-lead-row">
                          <div className="priority-avatar">
                            {initialLetters}
                          </div>
                          <div className="priority-lead-info">
                            <div className="priority-name-line">
                              <span className="priority-name">{l.name}</span>
                              <span className={`status ${statusClass(l.status)}`}>
                                <i /> {l.status}
                              </span>
                              {l.welcomeEmailStatus && (
                                <span className={`welcome-pill-small ${l.welcomeEmailStatus}`}>
                                  <MailCheck size={10} /> {l.welcomeEmailStatus}
                                </span>
                              )}
                            </div>
                            <div className="priority-meta-line">
                              <span>{l.email}</span>
                              {l.company && (
                                <>
                                  <span className="lead-meta-dot">·</span>
                                  <span>{l.company}</span>
                                </>
                              )}
                              {l.campaign && (
                                <>
                                  <span className="lead-meta-dot">·</span>
                                  <span className="lead-campaign-tag">{l.campaign}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="priority-lead-actions">
                            <button
                              className="action-btn-quick-email"
                              onClick={() => {
                                setSelected([l.id]);
                                openCampaign('selected');
                              }}
                              title="Send personalized campaign to this lead"
                            >
                              <Send size={12} />
                              <span>Outreach</span>
                            </button>
                            {isUncontacted && (
                              <button
                                className="action-btn-mark-contacted"
                                onClick={() => void updateLeadStatus(l)}
                                title="Mark status as contacted"
                              >
                                <Check size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {!overviewFilteredLeads.length && (
                      <div className="priority-empty-state">
                        <CheckCircle2 size={24} style={{ color: 'var(--color-primary)' }} />
                        <b>All caught up</b>
                        <p>No uncontacted leads waiting. Every lead has been reached.</p>
                      </div>
                    )}
                  </div>

                  <div className="cockpit-card-footer">
                    <span>Showing priority leads from your Meta sync</span>
                    <button className="link-button" onClick={() => setActive('Leads')}>
                      View full lead directory ({leads.length}) <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Operational Infrastructure & Engine */}
              <div className="overview-cockpit-right">
                {/* Google Sheets Sync Station */}
                <div className="cockpit-card integration-pulse-card">
                  <div className="integration-pulse-header">
                    <div className="integration-title-cluster">
                      <div className="integration-icon-badge">
                        <FileSpreadsheet size={18} />
                      </div>
                      <div>
                        <h3>Google Sheets</h3>
                        <p>Meta Lead Ads live sync gateway</p>
                      </div>
                    </div>
                    <span className={`pulse-badge ${sheetsStatus?.configured ? 'connected' : 'setup-needed'}`}>
                      <i className="pulse-status-dot" /> {sheetsStatus?.configured ? 'Active' : 'Not configured'}
                    </span>
                  </div>

                  <div className="integration-pulse-body">
                    {sheetsStatus?.configured ? (
                      <>
                        <div className="integration-metrics-card">
                          <div className="pulse-metric-row">
                            <span className="metric-label">Target Sheet</span>
                            <b className="metric-value font-mono" title={sheetsStatus.spreadsheetId || ''}>
                              {sheetsStatus.spreadsheetId ? `${sheetsStatus.spreadsheetId.slice(0, 16)}...` : 'Connected'}
                            </b>
                          </div>
                          <div className="pulse-metric-row">
                            <span className="metric-label">Sheet Range</span>
                            <b className="metric-value font-mono">{sheetsStatus.range || 'Leads!A1:Z5000'}</b>
                          </div>
                          <div className="pulse-metric-row">
                            <span className="metric-label">Last Synced</span>
                            <b className="metric-value">{sheetsStatus.lastSyncedAt ? formatRelativeTime(sheetsStatus.lastSyncedAt) : 'Starting…'}</b>
                          </div>
                          <div className="pulse-metric-row">
                            <span className="metric-label">Auto-Sync</span>
                            <b className="metric-value">Every {sheetsStatus.intervalMinutes || 5} min</b>
                          </div>
                        </div>

                        <div className="pulse-actions-row">
                          <button
                            className="button primary button-sm"
                            disabled={syncingSheet}
                            onClick={syncGoogleSheet}
                          >
                            <RefreshCw size={12} className={syncingSheet ? 'spin' : ''} />
                            {syncingSheet ? 'Syncing…' : 'Sync now'}
                          </button>
                          <button
                            className="button secondary button-sm"
                            onClick={() => setSheetSetupOpen(true)}
                          >
                            <Settings2 size={12} />
                            Manage
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="integration-setup-pitch">
                        <div className="integration-pitch-icon-row">
                          <div className="pitch-service-pill">
                            <span className="meta-brand-tag">Meta Ads</span>
                            <ArrowRight size={12} className="pitch-arrow" />
                            <span className="gsheet-brand-tag">Google Sheets</span>
                            <ArrowRight size={12} className="pitch-arrow" />
                            <span className="mailbox-brand-tag">Mailbox</span>
                          </div>
                        </div>
                        <p className="pitch-description">
                          Link your Meta Lead Ads spreadsheet to automatically ingest and dispatch incoming leads every 5 minutes.
                        </p>
                        <div className="pitch-action-row">
                          <button
                            className="button primary button-sm connect-sheet-trigger"
                            onClick={() => setSheetSetupOpen(true)}
                          >
                            <FileSpreadsheet size={14} /> Connect Google Sheet
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Welcome Email Engine Card */}
                <div className="cockpit-card welcome-engine-card">
                  <div className="welcome-engine-header">
                    <div className="engine-icon-badge">
                      <MailCheck size={18} />
                    </div>
                    <div>
                      <h3>Instant Welcome Email</h3>
                      <p>Automatic first-touch outreach to new leads</p>
                    </div>
                    <span className={`engine-status-badge ${welcomeTemplate ? 'enabled' : 'disabled'}`}>
                      {welcomeTemplate ? 'Active' : 'Off'}
                    </span>
                  </div>

                  <div className="welcome-engine-body">
                    <div className="welcome-template-snippet">
                      <div className="snippet-head">
                        <span className="snippet-tag">Active Template</span>
                        <b>{welcomeTemplate ? welcomeTemplate.name : 'No automatic template selected'}</b>
                      </div>
                      <p className="snippet-subject">
                        {welcomeTemplate
                          ? `Subject: "${welcomeTemplate.subject || 'Welcome to our service'}"`
                          : 'New leads will not receive an automatic introductory email until configured.'}
                      </p>
                    </div>

                    <div className="welcome-stats-strip">
                      <div className="stat-pill-box">
                        <span className="stat-num">{welcomeTotalSent > 0 ? welcomeTotalSent : welcomeEmailSummary.sent}</span>
                        <span className="stat-lbl">Delivered</span>
                      </div>
                      <div className="stat-pill-box">
                        <span className="stat-num">{welcomeEmailSummary.sending}</span>
                        <span className="stat-lbl">In Progress</span>
                      </div>
                      <div className="stat-pill-box">
                        <span className="stat-num">{welcomeEmailSummary.failed}</span>
                        <span className="stat-lbl">Failed</span>
                      </div>
                    </div>

                    <div className="welcome-footer-action" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        className="button secondary button-sm welcome-config-btn"
                        onClick={() => setActive('Templates')}
                      >
                        {welcomeTemplate ? 'Change template' : 'Configure welcome email'}
                        <ArrowRight size={13} />
                      </button>
                      {welcomeTotalSent > 0 && (
                        <button
                          type="button"
                          className="button secondary button-sm"
                          onClick={() => {
                            setActive('Campaigns');
                            setOutboundTab('welcome');
                          }}
                          style={{ fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <History size={12} /> View all {welcomeTotalSent} records
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lead Sources Distribution Card */}
                {leadSourceBreakdown.length > 0 && (
                  <div className="cockpit-card sources-breakdown-card">
                    <div className="sources-header">
                      <div>
                        <h3>Lead Sources</h3>
                        <p>{leadSourceBreakdown.length} active Meta forms</p>
                      </div>
                    </div>
                    <div className="sources-list">
                      {leadSourceBreakdown.map((src, i) => (
                        <div key={i} className="source-breakdown-row">
                          <div className="source-info-row">
                            <span className="source-name" title={src.name}>{src.name}</span>
                            <span className="source-count">{src.count} <span className="source-pct">({src.pct}%)</span></span>
                          </div>
                          <div className="source-track">
                            <div className="source-fill" style={{ width: `${src.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
      </div>

      {/* Floating Selection Bar */}
      {selected.length > 0 && (
        <div className="selection-bar">
          <span>
            <b>{selected.length}</b> leads selected
          </span>
          <button onClick={() => openCampaign('selected')}>
            <Send size={14} /> Email selected leads <ArrowRight size={13} />
          </button>
          <button
            className="selection-delete-btn"
            onClick={deleteSelectedLeads}
            title="Delete selected leads"
          >
            <Trash2 size={13} /> Delete selected
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

      {/* Campaign Details Inspector Modal */}
      {selectedCampaignDetail && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setSelectedCampaignDetail(null);
          }}
        >
          <div className="modal campaign-detail-modal">
            {/* Spacious Header with Metadata */}
            <div className="modal-head campaign-modal-header">
              <div className="campaign-modal-title-area">
                <span className={`modal-icon ${selectedCampaignDetail.status === 'completed' ? 'mint' : selectedCampaignDetail.status === 'scheduled' ? 'blue' : 'amber'}`}>
                  {selectedCampaignDetail.status === 'scheduled' ? <CalendarDays size={20} /> : <Send size={20} />}
                </span>
                <div className="campaign-modal-title-content">
                  <div className="campaign-modal-title-row">
                    <h2>{selectedCampaignDetail.name}</h2>
                    <span className={`apple-status-badge ${selectedCampaignDetail.status === 'completed' ? 'completed' : selectedCampaignDetail.status === 'scheduled' ? 'scheduled' : selectedCampaignDetail.status}`}>
                      <span className="status-dot" />
                      {selectedCampaignDetail.status === 'completed' ? 'Delivered' : selectedCampaignDetail.status === 'scheduled' ? 'Scheduled Send' : selectedCampaignDetail.status}
                    </span>
                  </div>
                  <p className="campaign-modal-subtitle">
                    <span>Campaign ID: <code className="campaign-id-code">{selectedCampaignDetail.id.slice(0, 8)}...</code></span>
                    <span className="bullet-sep">•</span>
                    <span><b>{selectedCampaignDetail.recipient_count} targeted leads</b></span>
                    <span className="bullet-sep">•</span>
                    <span className="campaign-detail-timestamp">
                      <Clock size={12} /> {selectedCampaignDetail.scheduled_at ? `Scheduled for ${formatCampaignDate(selectedCampaignDetail.scheduled_at)}` : `Sent on ${formatCampaignDate(selectedCampaignDetail.created_at)}`}
                    </span>
                  </p>
                </div>
              </div>
              <button
                className="close-modal"
                onClick={() => setSelectedCampaignDetail(null)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="campaign-modal-tabs">
              <button
                type="button"
                className={`campaign-modal-tab-btn ${campaignModalTab === 'template' ? 'active' : ''}`}
                onClick={() => setCampaignModalTab('template')}
              >
                <LayoutTemplate size={15} />
                <span>Email Template Preview</span>
              </button>
              <button
                type="button"
                className={`campaign-modal-tab-btn ${campaignModalTab === 'recipients' ? 'active' : ''}`}
                onClick={() => setCampaignModalTab('recipients')}
              >
                <Users size={15} />
                <span>Recipients &amp; Users</span>
                <span className="tab-badge-pill">
                  {loadingDetailRecipients ? '...' : (detailRecipients.length || selectedCampaignDetail.recipient_count)}
                </span>
              </button>
              <button
                type="button"
                className={`campaign-modal-tab-btn ${campaignModalTab === 'overview' ? 'active' : ''}`}
                onClick={() => setCampaignModalTab('overview')}
              >
                <Activity size={15} />
                <span>Stats &amp; Config</span>
              </button>
            </div>

            <div className="campaign-detail-body">
              {campaignModalTab === 'template' ? (
                /* EMAIL TEMPLATE PREVIEW VIEW */
                <div className="campaign-modal-template-view">
                  {/* Template Toolbar */}
                  <div className="campaign-template-toolbar">
                    <div className="template-toolbar-subject">
                      <span className="template-subject-label">Subject:</span>
                      <span className="template-subject-value" title={compiledCampaignSubject || selectedCampaignDetail.subject}>
                        {compiledCampaignSubject || selectedCampaignDetail.subject || '(No subject provided)'}
                      </span>
                      {selectedCampaignDetail.subject && (
                        <button
                          type="button"
                          className="button secondary button-sm copy-subject-btn"
                          onClick={e => handleCopySubject(selectedCampaignDetail.subject, e)}
                          title="Copy subject line"
                        >
                          <Copy size={12} /> Copy
                        </button>
                      )}
                    </div>

                    <div className="template-toolbar-controls">
                      {/* Personalize Toggle */}
                      <button
                        type="button"
                        className={`template-toggle-btn ${previewPersonalized ? 'active' : ''}`}
                        onClick={() => setPreviewPersonalized(!previewPersonalized)}
                        title="Toggle sample lead data replacement"
                      >
                        <Sparkles size={13} />
                        <span>{previewPersonalized ? `Sample: ${detailRecipients[0]?.name || 'Soumya'}` : 'Raw {{name}}'}</span>
                      </button>

                      {/* Device Switcher */}
                      <div className="template-device-group">
                        <button
                          type="button"
                          className={`device-toggle-btn ${previewDevice === 'desktop' ? 'active' : ''}`}
                          onClick={() => setPreviewDevice('desktop')}
                          title="Desktop email view"
                        >
                          <Monitor size={13} />
                          <span>Desktop</span>
                        </button>
                        <button
                          type="button"
                          className={`device-toggle-btn ${previewDevice === 'mobile' ? 'active' : ''}`}
                          onClick={() => setPreviewDevice('mobile')}
                          title="Mobile phone view"
                        >
                          <Smartphone size={13} />
                          <span>Mobile</span>
                        </button>
                      </div>

                      {/* External Tab */}
                      {compiledCampaignHtml && (
                        <button
                          type="button"
                          className="button secondary button-sm new-tab-btn"
                          onClick={() => {
                            const w = window.open();
                            w?.document.write(compiledCampaignHtml);
                            w?.document.close();
                          }}
                          title="Open preview in new tab"
                        >
                          <ExternalLink size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Template Viewport */}
                  <div className="campaign-template-viewport-wrap">
                    <div className={`campaign-template-frame ${previewDevice === 'mobile' ? 'is-mobile' : 'is-desktop'}`}>
                      {/* Email Client Header bar */}
                      <div className="email-client-header">
                        <div className="email-client-dots">
                          <span className="dot red" />
                          <span className="dot amber" />
                          <span className="dot green" />
                        </div>
                        <div className="email-client-meta">
                          <span>To: <b>{detailRecipients[0]?.email || 'recipient@lead.com'}</b></span>
                          <span className="meta-sep">•</span>
                          <span>From: <b>ZeptoMail Verified Sender</b></span>
                        </div>
                      </div>

                      {/* Sandbox iframe */}
                      {compiledCampaignHtml ? (
                        <iframe
                          title="Campaign Email Template Preview"
                          srcDoc={compiledCampaignHtml}
                          sandbox="allow-same-origin"
                          className="campaign-template-iframe"
                        />
                      ) : (
                        <div className="campaign-template-empty">
                          <LayoutTemplate size={36} className="text-muted" />
                          <h4>No HTML template stored</h4>
                          <p>The message body for this campaign was sent without a saved HTML body.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : campaignModalTab === 'recipients' ? (
                /* RECIPIENTS VIEW */
                <div className="campaign-modal-recipients-view">
                  {/* Toolbar */}
                  <div className="campaign-recipients-toolbar">
                    <div className="campaign-recipients-toolbar-left">
                      <div className="searchbox campaign-recipient-search">
                        <Search size={14} />
                        <input
                          type="text"
                          placeholder="Search recipients by email, name, phone, or company..."
                          value={campaignRecipientSearch}
                          onChange={e => {
                            setCampaignRecipientSearch(e.target.value);
                            setCampaignRecipientPage(1);
                          }}
                        />
                        {campaignRecipientSearch && (
                          <button
                            type="button"
                            className="clear-search-btn"
                            onClick={() => {
                              setCampaignRecipientSearch('');
                              setCampaignRecipientPage(1);
                            }}
                            aria-label="Clear search"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      {/* Filter Chips */}
                      <div className="recipient-filter-chips">
                        <button
                          type="button"
                          className={`recipient-filter-chip ${recipientStatusFilter === 'all' ? 'active' : ''}`}
                          onClick={() => { setRecipientStatusFilter('all'); setCampaignRecipientPage(1); }}
                        >
                          All ({detailRecipients.length || selectedCampaignDetail.recipient_count})
                        </button>
                        <button
                          type="button"
                          className={`recipient-filter-chip ${recipientStatusFilter === 'delivered' ? 'active' : ''}`}
                          onClick={() => { setRecipientStatusFilter('delivered'); setCampaignRecipientPage(1); }}
                        >
                          <span className="chip-dot mint" /> Delivered ({recipientCounts.delivered || selectedCampaignDetail.sent_count})
                        </button>
                        {recipientCounts.failed > 0 && (
                          <button
                            type="button"
                            className={`recipient-filter-chip ${recipientStatusFilter === 'failed' ? 'active' : ''}`}
                            onClick={() => { setRecipientStatusFilter('failed'); setCampaignRecipientPage(1); }}
                          >
                            <span className="chip-dot red" /> Failed ({recipientCounts.failed})
                          </button>
                        )}
                        {recipientCounts.scheduled > 0 && (
                          <button
                            type="button"
                            className={`recipient-filter-chip ${recipientStatusFilter === 'scheduled' ? 'active' : ''}`}
                            onClick={() => { setRecipientStatusFilter('scheduled'); setCampaignRecipientPage(1); }}
                          >
                            <span className="chip-dot blue" /> Scheduled ({recipientCounts.scheduled})
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="campaign-recipients-toolbar-right">
                      {detailRecipients.length > 0 && (
                        <button
                          type="button"
                          className="button secondary button-sm export-recipients-btn"
                          title="Export recipients to CSV"
                          onClick={() => handleExportCampaignRecipients(selectedCampaignDetail.name)}
                        >
                          <Download size={13} /> Export CSV
                        </button>
                      )}
                      <span className="recipient-count-text">
                        Showing <b>{filteredCampaignRecipients.length}</b> of {detailRecipients.length || selectedCampaignDetail.recipient_count}
                      </span>
                    </div>
                  </div>

                  {/* Recipients Table Wrap */}
                  <div className="campaign-modal-table-wrap">
                    {loadingDetailRecipients ? (
                      <div className="campaign-recipients-loading">
                        <Loader2 size={26} className="spin-animate" />
                        <p>Loading recipient leads &amp; delivery statuses...</p>
                      </div>
                    ) : filteredCampaignRecipients.length > 0 ? (
                      <table className="campaign-modal-table">
                        <thead>
                          <tr>
                            <th style={{ width: '36%' }}>RECIPIENT</th>
                            <th style={{ width: '26%' }}>CONTACT INFO</th>
                            <th style={{ width: '18%' }}>DELIVERY STATUS</th>
                            <th style={{ width: '20%' }}>DELIVERED AT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedCampaignRecipients.map((r, idx) => {
                            const initial = (r.name ? r.name.charAt(0) : r.email.charAt(0)).toUpperCase();
                            const cleanPhone = r.phone ? r.phone.replace(/^"|"$/g, '').trim() : '';
                            const cleanCompany = r.company ? r.company.replace(/^"|"$/g, '').trim() : '';
                            return (
                              <tr key={`${r.email}-${idx}`} className="recipient-row">
                                <td>
                                  <div className="recipient-user-cell">
                                    <span className="recipient-user-avatar">
                                      {initial}
                                    </span>
                                    <div className="recipient-user-text">
                                      <span className="recipient-user-name">
                                        {r.name || r.email.split('@')[0]}
                                      </span>
                                      <span className="recipient-user-email" title={r.email}>
                                        {r.email}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div className="recipient-contact-info">
                                    {cleanPhone ? (
                                      <span className="recipient-chip phone" title={cleanPhone}>
                                        <Phone size={11} /> {cleanPhone}
                                      </span>
                                    ) : (
                                      <span className="text-muted">–</span>
                                    )}
                                    {cleanCompany && (
                                      <span className="recipient-chip company" title={cleanCompany}>
                                        <Building2 size={11} /> {cleanCompany}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className={`apple-status-badge ${r.status === 'delivered' ? 'completed' : r.status === 'scheduled' ? 'scheduled' : r.status === 'failed' ? 'failed' : 'sending'}`}>
                                    <span className="status-dot" />
                                    {r.status === 'delivered' ? 'Delivered' : r.status === 'scheduled' ? 'Scheduled' : r.status === 'suppressed' ? 'Suppressed' : r.status === 'failed' ? 'Failed' : r.status}
                                  </span>
                                </td>
                                <td>
                                  <span className="campaign-date-text">
                                    <Clock size={11} style={{ marginRight: 4, opacity: 0.6 }} />
                                    {formatCampaignDate(r.sentAt)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="campaign-recipients-empty">
                        <Users size={28} className="text-muted" />
                        <p>{campaignRecipientSearch || recipientStatusFilter !== 'all' ? 'No recipients match your search or filter.' : 'No recipient records found for this campaign.'}</p>
                        {(campaignRecipientSearch || recipientStatusFilter !== 'all') && (
                          <button
                            type="button"
                            className="button secondary button-sm"
                            onClick={() => {
                              setCampaignRecipientSearch('');
                              setRecipientStatusFilter('all');
                            }}
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Recipient Table Pagination Footer */}
                  {filteredCampaignRecipients.length > 0 && (
                    <div className="campaign-table-footer modal-pagination">
                      <div className="campaign-footer-left">
                        <span>
                          Showing{' '}
                          <b>
                            {(campaignRecipientPage - 1) * (campaignRecipientPerPage === -1 ? filteredCampaignRecipients.length : campaignRecipientPerPage) + 1}
                            –
                            {campaignRecipientPerPage === -1
                              ? filteredCampaignRecipients.length
                              : Math.min(campaignRecipientPage * campaignRecipientPerPage, filteredCampaignRecipients.length)}
                          </b>{' '}
                          of <b>{filteredCampaignRecipients.length}</b> recipients
                          {detailRecipients.length !== filteredCampaignRecipients.length && ` (filtered from ${detailRecipients.length} total)`}
                        </span>
                        <div className="campaign-page-size-selector">
                          <span>Per page:</span>
                          <select
                            className="campaign-page-size-select"
                            value={campaignRecipientPerPage}
                            onChange={e => {
                              setCampaignRecipientPerPage(Number(e.target.value));
                              setCampaignRecipientPage(1);
                            }}
                          >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={-1}>All</option>
                          </select>
                        </div>
                      </div>

                      <div className="campaign-footer-right">
                        <button
                          type="button"
                          className="campaign-pagination-btn"
                          disabled={campaignRecipientPage <= 1}
                          onClick={() => setCampaignRecipientPage(p => Math.max(1, p - 1))}
                          aria-label="Previous page"
                        >
                          <ChevronLeft size={14} /> Prev
                        </button>
                        <span className="campaign-page-indicator">
                          Page {campaignRecipientPage} of {campaignRecipientPageCount}
                        </span>
                        <button
                          type="button"
                          className="campaign-pagination-btn"
                          disabled={campaignRecipientPage >= campaignRecipientPageCount}
                          onClick={() => setCampaignRecipientPage(p => Math.min(campaignRecipientPageCount, p + 1))}
                          aria-label="Next page"
                        >
                          Next <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* STATS & CONFIG VIEW */
                <div className="campaign-modal-overview-view">
                  {/* 4 Stat Metric Tiles */}
                  <div className="campaign-detail-stats">
                    <div className="detail-stat-tile">
                      <span>Recipients</span>
                      <b>{selectedCampaignDetail.recipient_count}</b>
                      <small>Targeted leads</small>
                    </div>
                    <div className="detail-stat-tile">
                      <span>Delivered</span>
                      <b>{selectedCampaignDetail.sent_count}</b>
                      <small>Outreach emails</small>
                    </div>
                    <div className="detail-stat-tile">
                      <span>Completion</span>
                      <b>{selectedCampaignDetail.recipient_count > 0 ? `${Math.round((selectedCampaignDetail.sent_count / selectedCampaignDetail.recipient_count) * 100)}%` : '100%'}</b>
                      <small>ZeptoMail verified</small>
                    </div>
                    <div className="detail-stat-tile">
                      <span>Suppression</span>
                      <b>Safe</b>
                      <small>Auto protected</small>
                    </div>
                  </div>

                  {/* Subject box */}
                  <div className="campaign-detail-section">
                    <label>EMAIL SUBJECT</label>
                    <div className="campaign-subject-box">
                      <span>{selectedCampaignDetail.subject || 'No subject provided'}</span>
                      {selectedCampaignDetail.subject && (
                        <button
                          type="button"
                          className="button secondary button-sm"
                          onClick={e => handleCopySubject(selectedCampaignDetail.subject, e)}
                        >
                          <Copy size={12} /> Copy
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rendered Template Preview inside Overview */}
                  <div className="campaign-detail-section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label style={{ margin: 0 }}>EMAIL TEMPLATE DESIGN</label>
                      <button
                        type="button"
                        className="button secondary button-sm"
                        onClick={() => setCampaignModalTab('template')}
                        style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <LayoutTemplate size={12} /> Full Interactive View
                      </button>
                    </div>
                    {selectedCampaignDetail.html_source ? (
                      <div className="campaign-overview-template-preview">
                        <iframe
                          className="overview-template-iframe"
                          srcDoc={compiledCampaignHtml || selectedCampaignDetail.html_source}
                          title="Campaign Email Template Preview"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    ) : (
                      <div className="campaign-no-template-notice">
                        <span>No visual template stored for this campaign.</span>
                      </div>
                    )}
                  </div>

                  {/* Delivery Pipeline Intelligence */}
                  <div className="campaign-detail-section">
                    <label>DELIVERY CONFIGURATION</label>
                    <div className="campaign-config-card">
                      <div className="config-row">
                        <span>Dispatch Service</span>
                        <b>ZeptoMail Transactional API</b>
                      </div>
                      <div className="config-row">
                        <span>Suppression Check</span>
                        <b className="text-mint"><CheckCircle2 size={12} /> Filtered &amp; Protected</b>
                      </div>
                      {selectedCampaignDetail.scheduled_at && (
                        <div className="config-row">
                          <span>Scheduled Send Time</span>
                          <b>{formatCampaignDate(selectedCampaignDetail.scheduled_at)}</b>
                        </div>
                      )}
                      <div className="config-row">
                        <span>Created Timestamp</span>
                        <b>{formatCampaignDate(selectedCampaignDetail.created_at)}</b>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer campaign-modal-footer">
              <div className="modal-footer-info">
                <span className="text-mint">
                  <CheckCircle2 size={14} /> Dispatched via ZeptoMail Transactional API
                </span>
              </div>
              <div className="modal-footer-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setSelectedCampaignDetail(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    const c = selectedCampaignDetail;
                    setSelectedCampaignDetail(null);
                    handleDuplicateCampaign(c);
                  }}
                >
                  <Copy size={14} /> Duplicate as new campaign
                </button>
              </div>
            </div>
          </div>
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
          <div className="modal campaign-modal">
            <div className="modal-head">
              <div className="modal-title-cluster">
                <span className="modal-icon">
                  {modal === 'import' ? <FileSpreadsheet size={18} /> : <Send size={18} />}
                </span>
                <div>
                  <h2>{modal === 'import' ? 'Import Leads' : 'Create an email campaign'}</h2>
                  <p>
                    {modal === 'import'
                      ? 'Upload a CSV or TSV file to sync contacts into your workspace.'
                      : 'Personalized messages turn fresh leads into booked appointments.'}
                  </p>
                </div>
              </div>
              <button
                className="icon-btn"
                onClick={() => setModal(null)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            {modal === 'import' ? (
              <div className="import-modal-body">
                <div
                  className={`apple-dropzone ${isDraggingFile ? 'is-dragging' : ''} ${importingCsv ? 'is-uploading' : ''}`}
                  onClick={() => !importingCsv && fileRef.current?.click()}
                  onDragOver={e => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleProcessImportFile(file);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="dropzone-icon-circle">
                    {importingCsv ? (
                      <RefreshCw size={24} className="spin" />
                    ) : (
                      <CloudUpload size={24} />
                    )}
                  </div>
                  <div className="dropzone-text-group">
                    <span className="dropzone-title">
                      {importingCsv ? 'Importing contacts...' : 'Choose a CSV file or drag & drop here'}
                    </span>
                    <span className="dropzone-subtitle">
                      Supports Meta Lead Ads export, Google Sheets CSV, or CRM tables (.csv, .tsv)
                    </span>
                  </div>
                  {!importingCsv && (
                    <span className="dropzone-browse-button">
                      Browse File
                    </span>
                  )}
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,text/csv,text/tab-separated-values"
                  hidden
                  onChange={onFile}
                />

                <div className="import-features-box">
                  <div className="import-feature-item">
                    <ShieldCheck size={16} className="feature-icon" />
                    <div className="feature-text">
                      <b>Automatic duplicate detection</b>
                      <span>Existing leads with matching email addresses are updated without creating duplicate contacts.</span>
                    </div>
                  </div>
                  <div className="import-feature-item">
                    <FileSpreadsheet size={16} className="feature-icon" />
                    <div className="feature-text">
                      <b>Auto-mapped columns</b>
                      <span>Name, email, phone, campaign, form name, and lead status are recognized automatically.</span>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    className="button-secondary-pill"
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={importingCsv}
                  >
                    Cancel
                  </button>
                  <button
                    className="button-primary"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={importingCsv}
                  >
                    <CloudUpload size={15} />
                    <span>{importingCsv ? 'Importing…' : 'Select File'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={sendCampaign} className="campaign-form">
                <label>
                  <span>Email Template</span>
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
                  <span>Campaign Name</span>
                  <input
                    required
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="e.g. Lead Consultation & Welcome Outreach"
                  />
                </label>
                <label>
                  <span>Recipient Category</span>
                  <select value={campaignAudience} onChange={event => setCampaignAudience(event.target.value as CampaignAudience)}>
                    <option value="new">New leads ({leads.filter(lead => lead.status === 'new').length})</option>
                    <option value="contacted">Contacted leads ({leads.filter(lead => lead.status === 'contacted').length})</option>
                    <option value="qualified">Qualified leads ({leads.filter(lead => lead.status === 'qualified').length})</option>
                    {activeSelectedLeadCount > 0 && <option value="selected">Selected leads ({activeSelectedLeadCount})</option>}
                    <option value="all">All active leads ({leads.filter(lead => lead.status !== 'unsubscribed').length})</option>
                  </select>
                </label>

                <div className={`campaign-date-card ${campaignDateFilterEnabled ? 'active' : ''}`}>
                  <div className="campaign-date-card-head">
                    <div className="campaign-date-card-title-group">
                      <div className="campaign-date-card-icon">
                        <CalendarDays size={16} />
                      </div>
                      <div>
                        <div className="campaign-date-card-title">Filter by lead arrival date</div>
                        <div className="campaign-date-card-subtitle">
                          {campaignDateFilterEnabled ? 'Only targeting leads who joined within this timeframe' : 'Send to leads regardless of when they signed up'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={campaignDateFilterEnabled}
                      aria-label="Toggle date range filter"
                      className={`designer-toggle-switch ${campaignDateFilterEnabled ? 'active' : ''}`}
                      onClick={() => {
                        const next = !campaignDateFilterEnabled;
                        setCampaignDateFilterEnabled(next);
                        if (!next) {
                          setCampaignFromDate('');
                          setCampaignToDate('');
                        }
                      }}
                    >
                      <span className="designer-switch-knob" />
                    </button>
                  </div>

                  {campaignDateFilterEnabled && (
                    <div className="campaign-date-card-body">
                      <div className="campaign-date-presets-row">
                        <span className="presets-label">QUICK SELECT:</span>
                        <div className="campaign-date-presets">
                          <button
                            type="button"
                            className={`date-preset-chip ${campaignFromDate === new Date().toISOString().slice(0, 10) && campaignToDate === new Date().toISOString().slice(0, 10) ? 'selected' : ''}`}
                            onClick={() => {
                              const now = new Date();
                              const ymd = now.toISOString().slice(0, 10);
                              setCampaignFromDate(ymd);
                              setCampaignToDate(ymd);
                            }}
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            className="date-preset-chip"
                            onClick={() => {
                              const now = new Date();
                              const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
                              setCampaignFromDate(past.toISOString().slice(0, 10));
                              setCampaignToDate(now.toISOString().slice(0, 10));
                            }}
                          >
                            Past 7 days
                          </button>
                          <button
                            type="button"
                            className="date-preset-chip"
                            onClick={() => {
                              const now = new Date();
                              const past = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
                              setCampaignFromDate(past.toISOString().slice(0, 10));
                              setCampaignToDate(now.toISOString().slice(0, 10));
                            }}
                          >
                            Past 30 days
                          </button>
                          <button
                            type="button"
                            className="date-preset-chip"
                            onClick={() => {
                              const now = new Date();
                              const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                              setCampaignFromDate(startOfMonth.toISOString().slice(0, 10));
                              setCampaignToDate(now.toISOString().slice(0, 10));
                            }}
                          >
                            This month
                          </button>
                        </div>
                      </div>

                      <div className="campaign-date-range-row">
                        <div className="campaign-date-box">
                          <span className="date-field-label">START DATE (FROM)</span>
                          <div className="date-input-wrapper">
                            <input
                              type="date"
                              value={campaignFromDate}
                              onChange={e => setCampaignFromDate(e.target.value)}
                              max={campaignToDate || undefined}
                            />
                          </div>
                        </div>

                        <div className="date-range-separator">
                          <ArrowRight size={14} />
                        </div>

                        <div className="campaign-date-box">
                          <span className="date-field-label">END DATE (TO)</span>
                          <div className="date-input-wrapper">
                            <input
                              type="date"
                              value={campaignToDate}
                              onChange={e => setCampaignToDate(e.target.value)}
                              min={campaignFromDate || undefined}
                            />
                          </div>
                        </div>
                      </div>

                      <div className={`campaign-date-result-pill ${campaignRecipients.length === 0 ? 'empty' : 'matched'}`}>
                        <div className="pill-left">
                          <span className="pill-dot" />
                          <span>
                            {campaignFromDate || campaignToDate ? (
                              campaignRecipients.length > 0 ? (
                                <>
                                  <b>{campaignRecipients.length} {campaignRecipients.length === 1 ? 'lead matches' : 'leads match'}</b>{' '}
                                  ({campaignFromDate && campaignToDate
                                    ? `${new Date(campaignFromDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(campaignToDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                    : campaignFromDate
                                    ? `since ${new Date(campaignFromDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                    : `up to ${new Date(campaignToDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`})
                                </>
                              ) : (
                                <b>0 leads found in this date window</b>
                              )
                            ) : (
                              'Select a start and end date to filter recipients'
                            )}
                          </span>
                        </div>

                        {(campaignFromDate || campaignToDate) && (
                          <button
                            type="button"
                            className="pill-clear-btn"
                            onClick={() => {
                              setCampaignFromDate('');
                              setCampaignToDate('');
                            }}
                          >
                            Reset dates
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <label>
                  <span>{selectedTemplateId ? 'Saved Template Preview' : 'Email Body'}</span>
                  {selectedTemplateId ? (
                    <div className="campaign-template-preview">
                      <iframe title="Selected email template preview" sandbox="" srcDoc={emailHtml}/>
                      <small><CheckCircle2 size={12}/> Saved responsive design · personalized with merge tags</small>
                    </div>
                  ) : (
                    <textarea required rows={6} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Hi {{name}}, thanks for getting in touch..."/>
                  )}
                </label>

                <label className="schedule-field">
                  <span>Schedule Send (Optional)</span>
                  <input type="datetime-local" value={scheduleAt} min={new Date(Date.now()+60000).toISOString().slice(0,16)} onChange={e=>setScheduleAt(e.target.value)}/>
                  <small>Leave blank to queue and send immediately.</small>
                </label>

                <div className="recipient-preview">
                  <Users size={14} />
                  <span>Sending to:</span>
                  <b>
                    {campaignRecipients.length} {campaignAudience === 'selected' ? 'selected' : campaignAudience === 'all' ? 'active' : campaignAudience} {campaignRecipients.length === 1 ? 'lead' : 'leads'}
                    {campaignDateFilterEnabled && (campaignFromDate || campaignToDate) ? ' in date range' : ''}
                  </b>
                  <small>
                    {campaignRecipients.length === 0
                      ? '· No matching leads in this date range & status'
                      : campaignAudience === 'all'
                      ? '· unsubscribed leads are excluded'
                      : '· sender configured by workspace admin'}
                  </small>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={busy || campaignRecipients.length === 0} className="button primary">
                    <Send size={14} />
                    {busy ? 'Saving…' : scheduleAt ? 'Schedule campaign' : 'Queue campaign'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {sheetSetupOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setSheetSetupOpen(false);
          }}
        >
          <section className="modal sheet-setup-modal" role="dialog" aria-modal="true" aria-labelledby="sheet-setup-title">
            <header className="modal-head">
              <span className="modal-icon">
                <FileSpreadsheet size={18} />
              </span>
              <div>
                <h2 id="sheet-setup-title">Connect Google Sheets</h2>
                <p>Live sync leads directly from your Meta Lead Ads spreadsheet.</p>
              </div>
              <button className="icon-btn" onClick={() => setSheetSetupOpen(false)} aria-label="Close dialog">
                <X size={18} />
              </button>
            </header>

            <div className="sheet-setup-body">
              {/* Stepper indicator */}
              <div className="sheet-wizard-steps">
                <div className={`sheet-wizard-step ${sheetsStatus?.googleEmail ? 'done' : 'active'}`}>
                  <span className="step-num">{sheetsStatus?.googleEmail ? <Check size={14} /> : '1'}</span>
                  <div>
                    <b>Google Account</b>
                    <small>{sheetsStatus?.googleEmail ? 'Connected' : 'Sign in & authorize'}</small>
                  </div>
                </div>
                <div className="step-connector-line" />
                <div className={`sheet-wizard-step ${sheetsStatus?.googleEmail ? (sheetsStatus?.configured ? 'done' : 'active') : 'pending'}`}>
                  <span className="step-num">{sheetsStatus?.configured ? <Check size={14} /> : '2'}</span>
                  <div>
                    <b>Select Sheet & Range</b>
                    <small>{sheetsStatus?.configured ? 'Active & syncing' : 'Link spreadsheet'}</small>
                  </div>
                </div>
              </div>

              {!sheetsStatus?.googleEmail ? (
                <div className="sheet-step-auth-card">
                  <div className="sheet-auth-hero">
                    <div className="sheet-auth-icon-cluster">
                      <div className="sheet-logo-circle meta-circle">
                        <Users size={16} />
                      </div>
                      <span className="sync-connector-arrow">
                        <ArrowRight size={14} />
                      </span>
                      <div className="sheet-logo-circle gsheet-circle">
                        <FileSpreadsheet size={18} />
                      </div>
                      <span className="sync-connector-arrow">
                        <ArrowRight size={14} />
                      </span>
                      <div className="sheet-logo-circle mailbox-circle">
                        <MailCheck size={16} />
                      </div>
                    </div>
                    <h3>Authorize read-only access to Google Sheets</h3>
                    <p>
                      Mailbox securely connects to your Google account to read lead rows submitted through your Meta Lead Ads campaign.
                    </p>
                  </div>

                  <div className="sheet-trust-list">
                    <div className="trust-item">
                      <ShieldCheck size={15} />
                      <span><b>Read-only access:</b> We will never modify or delete your spreadsheet files.</span>
                    </div>
                    <div className="trust-item">
                      <RefreshCw size={15} />
                      <span><b>Automatic background sync:</b> New form submissions are pulled every 5 minutes.</span>
                    </div>
                  </div>

                  <button className="button primary sheet-connect-button" onClick={connectGoogle}>
                    <Mail size={16} />
                    Continue with Google
                    <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="sheet-step-config-card">
                  <div className="sheet-google-account">
                    <div className="account-avatar">
                      <CheckCircle2 size={18} />
                    </div>
                    <div className="account-details">
                      <div className="account-title-row">
                        <b>{sheetsStatus.googleEmail}</b>
                        <span className="connected-pill is-connected">
                          <i /> Ready
                        </span>
                      </div>
                      <small>Google account authorized for read-only spreadsheet access</small>
                    </div>
                    <button
                      type="button"
                      className="link-button disconnect-btn"
                      onClick={disconnectGoogle}
                      title="Switch to another Google account"
                    >
                      Change account
                    </button>
                  </div>

                  {sheetsStatus?.configured && (
                    <div className="current-sheet-status-box" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 14px', borderRadius: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Currently Synced Spreadsheet</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#14532d', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileSpreadsheet size={16} />
                          {sheetsStatus.spreadsheetUrl ? (
                            <a
                              href={sheetsStatus.spreadsheetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#166534', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title="Open this Google Sheet in new tab"
                            >
                              <span>{sheetsStatus.spreadsheetTitle || (sheetsStatus.spreadsheetId ? `${sheetsStatus.spreadsheetId.slice(0, 24)}…` : 'Google Sheet')}</span>
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span>{sheetsStatus.spreadsheetTitle || sheetsStatus.spreadsheetId}</span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#3f6212', marginTop: '3px' }}>
                          Tab: <b>{sheetsStatus.range}</b> · Auto-syncs every {sheetsStatus.intervalMinutes || 5} min
                        </div>
                      </div>
                      <button
                        type="button"
                        className="button secondary button-sm"
                        style={{ color: '#ef4444', borderColor: '#fca5a5', background: '#fff' }}
                        onClick={handleDisconnectSheetWithConfirm}
                        title="Disconnect this sheet from auto-sync"
                      >
                        <Unlink size={12} /> Disconnect
                      </button>
                    </div>
                  )}

                  <form className="sheet-config-form" onSubmit={saveGoogleSheet}>
                    <div className="form-group">
                      <label htmlFor="sheet-url-input">
                        <span>Google Sheets URL</span>
                      </label>
                      <input
                        id="sheet-url-input"
                        type="url"
                        value={sheetUrl}
                        onChange={e => setSheetUrl(e.target.value)}
                        placeholder="Paste spreadsheet link from browser address bar"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="sheet-range-input">
                        <span>Sheet Tab & Range</span>
                      </label>
                      <input
                        id="sheet-range-input"
                        value={sheetRange}
                        onChange={e => setSheetRange(e.target.value)}
                        placeholder="Leads!A1:Z5000"
                        required
                      />
                      <div className="range-hints">
                        <span className="hint-label">Suggestions:</span>
                        <button
                          type="button"
                          className="range-chip"
                          onClick={() => setSheetRange('Sheet1!A1:Z5000')}
                        >
                          Sheet1!A1:Z5000
                        </button>
                        <button
                          type="button"
                          className="range-chip"
                          onClick={() => setSheetRange('Leads!A1:Z5000')}
                        >
                          Leads!A1:Z5000
                        </button>
                        <button
                          type="button"
                          className="range-chip"
                          onClick={() => setSheetRange('Form Responses 1!A1:Z5000')}
                        >
                          Form Responses 1!A1:Z5000
                        </button>
                      </div>
                    </div>

                    {leads.length > 0 && (
                      <div className="sheet-options-panel">
                        <label className="sheet-sync-option">
                          <input
                            type="checkbox"
                            checked={clearBeforeSync}
                            onChange={e => setClearBeforeSync(e.target.checked)}
                          />
                          <div className="option-text">
                            <b>Replace existing leads ({leads.length})</b>
                            <span>Start fresh with only leads from this spreadsheet</span>
                          </div>
                        </label>
                      </div>
                    )}

                    <div className="sheet-form-actions">
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => setSheetSetupOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="button primary"
                        disabled={syncingSheet}
                      >
                        <RefreshCw size={14} className={syncingSheet ? 'spin' : ''} />
                        {syncingSheet ? 'Connecting & syncing…' : 'Save and sync now'}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </form>

                  <div className="sheet-setup-footer">
                    <span>
                      <i className="live-dot" /> Auto-syncs every {sheetsStatus.intervalMinutes || 5} minutes automatically.
                    </span>
                    <button className="link-button text-destructive" onClick={disconnectGoogle}>
                      Disconnect integration
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

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

            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.875rem', lineHeight: 1.55, whiteSpace: 'pre-line' }}>
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
