import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ThinkingOrb } from 'thinking-orbs';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { useDashboard } from '../../../contexts/DashboardContext';
import useAdminDashboardTheme from '../../../hooks/useAdminDashboardTheme';
import {
  toIsoWeek,
  isValidIsoWeek,
  shiftIsoWeek,
  formatBatchWeekRange,
  resolveCurationStageWeeks,
  resolveCurationStageForWeek,
  CURATION_STAGE_META,
} from '../../../utils/pivotIsoWeek';
import PivotTagMultiSelect from '../PivotLab/PivotTagMultiSelect';
import PivotManualImportModal, {
  manualDraftToImportEntry,
} from '../PivotLab/PivotManualImportModal';
import PivotJsonImportPanel from '../PivotLab/PivotJsonImportPanel';
import {
  buildCurationJsonExport,
  curationJsonExportFilename,
  downloadCurationJsonExport,
} from '../PivotLab/pivotJsonImportUtils';
import PivotCatalogEventEditModal, {
  catalogEditDraftToOverrides,
} from '../PivotLab/PivotCatalogEventEditModal';
import PivotReadinessCard from './PivotReadinessCard';
import PivotCurationMonitorPanel from './PivotCurationMonitorPanel';
import PivotCurationQueue from './PivotCurationQueue';
import PivotTenantSourcesPanel from './PivotTenantSourcesPanel';
import PivotDiscoveryConsole, { orbStateFor, phaseLabel, OrbTint } from './PivotDiscoveryConsole';
import Popup from '../../../components/Popup/Popup';
import PivotTenantPage from './PivotTenantPage';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import PivotTenantExplorePanel from './PivotTenantExplorePanel';
import PivotHostLiveWeekAlert, {
  formatHostCreatedCounts,
} from './PivotHostLiveWeekAlert';
import usePivotBatchWeekState from './usePivotBatchWeekState';
import usePivotTenantWeekKeybinds from './usePivotTenantWeekKeybinds';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import '../PivotLab/PivotLabPage.scss';
import './PivotTenantDashboard.scss';
import './PivotTenantCurationPage.scss';
import './PivotReadinessCard.scss';
import './PivotTenantPage.scss';

const NO_FETCH_CACHE = { enabled: false };
const EMPTY_LIST = [];
const RUN_POLL_MS = 2500;
/**
 * Cadence for noticing a batch that this page did not start — discovery chains
 * one for native sources, and another tab or the CLI can start one too.
 */
const BATCH_IDLE_POLL_MS = 30000;
const MONITOR_EVENTS_LIMIT = 100;
const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'staged', label: 'Staged' },
  { value: 'published', label: 'Published' },
  { value: 'untagged', label: 'Untagged' },
  { value: 'missing-host', label: 'Missing host' },
  { value: 'film', label: 'Film / showtimes' },
];

const HOST_CREATED_SOURCE = 'justgo';

const PROVIDER_OPTIONS = [
  { value: 'partiful', label: 'Partiful' },
  { value: 'luma', label: 'Luma' },
  { value: 'generic-site', label: 'Website (scraped)' },
  { value: 'manual-json', label: 'Manual JSON' },
];

const STRATEGY_OPTIONS = [
  { value: 'next-drop', label: 'Next drop week' },
  { value: 'current-iso', label: 'Current ISO week' },
  { value: 'explicit', label: 'Explicit (pass on run)' },
];

const PURGE_CONFIRM_TOKEN = 'PURGE';
const UNRELEASE_CONFIRM_TOKEN = 'UNRELEASE';

function isHostCreatedEvent(event) {
  return event?.source === HOST_CREATED_SOURCE;
}

function eventMatchesFilter(event, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'draft') return event.ingestStatus === 'draft';
  if (filter === 'staged') return event.ingestStatus === 'staged';
  if (filter === 'published') return event.ingestStatus === 'published';
  if (filter === 'untagged') {
    return !Array.isArray(event.tags) || event.tags.length === 0;
  }
  if (filter === 'missing-host') {
    return !event.organizerName?.trim();
  }
  if (filter === 'film') {
    return Boolean(event.movie) || (Array.isArray(event.timeSlots) && event.timeSlots.length > 0);
  }
  return true;
}

function eventMatchesSourceFilter(event, sourceFilter) {
  if (!sourceFilter || sourceFilter === 'all') return true;
  if (sourceFilter === HOST_CREATED_SOURCE) return isHostCreatedEvent(event);
  return true;
}

/** Newest host drafts first when Host-created filter is active; otherwise soft-boost them. */
function compareCurationEvents(a, b, { hostCreatedOnly = false } = {}) {
  if (hostCreatedOnly) {
    const aSubmitted = a.creatorSubmittedAt ? Date.parse(a.creatorSubmittedAt) : 0;
    const bSubmitted = b.creatorSubmittedAt ? Date.parse(b.creatorSubmittedAt) : 0;
    if (bSubmitted !== aSubmitted) return bSubmitted - aSubmitted;
    const aStart = a.start_time ? Date.parse(a.start_time) : 0;
    const bStart = b.start_time ? Date.parse(b.start_time) : 0;
    return aStart - bStart;
  }

  const aHostDraft = isHostCreatedEvent(a) && a.ingestStatus === 'draft' ? 1 : 0;
  const bHostDraft = isHostCreatedEvent(b) && b.ingestStatus === 'draft' ? 1 : 0;
  if (bHostDraft !== aHostDraft) return bHostDraft - aHostDraft;

  if (aHostDraft && bHostDraft) {
    const aSubmitted = a.creatorSubmittedAt ? Date.parse(a.creatorSubmittedAt) : 0;
    const bSubmitted = b.creatorSubmittedAt ? Date.parse(b.creatorSubmittedAt) : 0;
    if (bSubmitted !== aSubmitted) return bSubmitted - aSubmitted;
  }

  const aStart = a.start_time ? Date.parse(a.start_time) : 0;
  const bStart = b.start_time ? Date.parse(b.start_time) : 0;
  return aStart - bStart;
}

function emptyJobForm() {
  return {
    label: '',
    url: '',
    provider: 'partiful',
    defaultBatchWeekStrategy: 'next-drop',
    defaultTags: [],
    enabled: true,
  };
}

function detectProviderFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('partiful')) return 'partiful';
    if (host.includes('lu.ma') || host.includes('luma')) return 'luma';
  } catch {
    /* ignore */
  }
  return null;
}

function RunStatusPill({ status }) {
  if (!status) return <span className="pivot-lab__pill">—</span>;
  if (status === 'completed') {
    return <span className="pivot-lab__pill pivot-lab__pill--ok">Completed</span>;
  }
  if (status === 'failed') {
    return <span className="pivot-lab__pill pivot-lab__pill--warn">Failed</span>;
  }
  if (status === 'running' || status === 'queued') {
    return <span className="pivot-lab__pill pivot-lab__pill--info">{status}</span>;
  }
  return <span className="pivot-lab__pill">{status}</span>;
}

/**
 * Per-tenant Curation — mode (post-mortem / live / curate) follows the selected batch week.
 */
function PivotTenantCurationPage({ tenantKey, cityDisplayName }) {
  const { addNotification } = useNotification();
  const { isDark } = useAdminDashboardTheme();
  const orbTheme = isDark ? 'dark' : 'light';
  const { showOverlay } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlBatchWeek = searchParams.get('batchWeek');
  const urlFilter = searchParams.get('filter') || 'all';
  const urlSource = searchParams.get('source') || 'all';
  const urlEventId = searchParams.get('eventId');

  const {
    batchWeek,
    committedWeek,
    setBatchWeek,
    batchWeekValid,
    committedWeekValid,
    weekSettled,
  } = usePivotBatchWeekState(
    isValidIsoWeek(urlBatchWeek) ? urlBatchWeek.trim() : toIsoWeek(),
  );
  /** When true, crawl/manual ingest pins every event into `batchWeek` instead of the event's start date. */
  const [forceBatchWeek, setForceBatchWeek] = useState(false);
  const [filter, setFilter] = useState(
    FILTER_OPTIONS.some((opt) => opt.value === urlFilter) ? urlFilter : 'all',
  );
  /** Separate from status/QA filter so notify deep links can use filter=draft&source=justgo. */
  const [sourceFilter, setSourceFilter] = useState(
    urlSource === HOST_CREATED_SOURCE ? HOST_CREATED_SOURCE : 'all',
  );
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkTags, setBulkTags] = useState([]);
  const [busyKey, setBusyKey] = useState(null);
  const [activeRunId, setActiveRunId] = useState(null);
  const [batchConsoleOpen, setBatchConsoleOpen] = useState(false);
  const [batchStarting, setBatchStarting] = useState(false);
  /** Completion is announced once per batch, however this page notices it. */
  const batchNotifiedRef = useRef(null);
  const previousBatchRef = useRef(null);
  const [jobFormOpen, setJobFormOpen] = useState(false);
  const [jobsExpanded, setJobsExpanded] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [jobForm, setJobForm] = useState(emptyJobForm);
  const [manualImportOpen, setManualImportOpen] = useState(false);
  const [manualImportSticky, setManualImportSticky] = useState({
    organizerName: '',
    location: '',
    scheduleMode: 'single',
    startTimeLocal: '',
    endTimeLocal: '',
    timeSlots: [],
    tags: [],
    movie: null,
  });
  const [manualImportPublishLoading, setManualImportPublishLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [tagSuggestLoadingKey, setTagSuggestLoadingKey] = useState(null);
  const [urlImportValue, setUrlImportValue] = useState('');
  const [urlImportLoading, setUrlImportLoading] = useState(false);
  /** Shown when a bulk stage lands events outside the selected review week. */
  const [stageLandHint, setStageLandHint] = useState(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [purgingCatalog, setPurgingCatalog] = useState(false);
  const [purgingOutOfWeek, setPurgingOutOfWeek] = useState(false);
  const initializedWeekRef = useRef(false);
  const openedEventIdRef = useRef(null);

  // Keep committed week / filter / source bookmarkable (preserve page=1). Drop legacy stage= param.
  useEffect(() => {
    const desiredFilter = filter && filter !== 'all' ? filter : null;
    const desiredSource =
      sourceFilter === HOST_CREATED_SOURCE ? HOST_CREATED_SOURCE : null;
    const currentFilter = searchParams.get('filter');
    const currentSource = searchParams.get('source');
    const currentWeek = searchParams.get('batchWeek');
    const pageOk = searchParams.get('page') === '1';
    const weekOk = !committedWeekValid || currentWeek === committedWeek;
    const filterOk = desiredFilter ? currentFilter === desiredFilter : !currentFilter;
    const sourceOk = desiredSource ? currentSource === desiredSource : !currentSource;
    const stageCleared = !searchParams.get('stage');
    if (pageOk && weekOk && filterOk && sourceOk && stageCleared) return;

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', '1');
        next.delete('stage');
        if (committedWeekValid) next.set('batchWeek', committedWeek);
        if (desiredFilter) next.set('filter', desiredFilter);
        else next.delete('filter');
        if (desiredSource) next.set('source', desiredSource);
        else next.delete('source');
        return next;
      },
      { replace: true },
    );
  }, [committedWeek, committedWeekValid, filter, sourceFilter, searchParams, setSearchParams]);

  useEffect(() => {
    setStageLandHint(null);
  }, [committedWeek, forceBatchWeek]);

  // Sync from deep links when the URL changes externally.
  useEffect(() => {
    if (isValidIsoWeek(urlBatchWeek)) {
      const trimmed = urlBatchWeek.trim();
      setBatchWeek((current) => (current === trimmed ? current : trimmed), {
        immediate: true,
      });
    }
    if (FILTER_OPTIONS.some((opt) => opt.value === urlFilter)) {
      setFilter((current) => (current === urlFilter ? current : urlFilter));
    }
    const nextSource = urlSource === HOST_CREATED_SOURCE ? HOST_CREATED_SOURCE : 'all';
    setSourceFilter((current) => (current === nextSource ? current : nextSource));
  }, [urlBatchWeek, urlFilter, urlSource, setBatchWeek]);

  const opsParams = useMemo(
    () => ({
      batchWeek: committedWeek,
      include: 'curation',
      performanceLimit: MONITOR_EVENTS_LIMIT,
    }),
    [committedWeek],
  );
  const opsUrl =
    tenantKey && committedWeekValid
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/ops`
      : null;
  const {
    data: opsResponse,
    loading: opsLoading,
    error: opsError,
    refetch: refetchOps,
  } = useFetch(opsUrl, { params: opsParams, cache: NO_FETCH_CACHE });

  const ops = opsResponse?.success ? opsResponse.data : null;
  const opsDropSchedule = ops?.dropSchedule;

  const stageWeeks = useMemo(() => {
    if (ops?.anchors?.liveWeek) {
      return {
        liveWeek: ops.anchors.liveWeek,
        curateWeek: ops.anchors.curateWeek,
        postMortemWeek: ops.anchors.postMortemWeek,
        currentWeek: ops.anchors.currentWeek,
        dropPending: Boolean(ops.anchors.dropPending),
      };
    }
    return resolveCurationStageWeeks(new Date(), opsDropSchedule?.nextDropAt || null);
  }, [ops?.anchors, opsDropSchedule?.nextDropAt]);

  const dropDayOfWeek = ops?.weekRange?.dropDayOfWeek ?? opsDropSchedule?.dayOfWeek ?? 4;
  const dropTimeZone = ops?.weekRange?.timeZone ?? opsDropSchedule?.timezone ?? 'UTC';

  const stage = ops?.stage || resolveCurationStageForWeek(committedWeek, stageWeeks);
  const isReleaseWindow =
    Boolean(stageWeeks.dropPending) && committedWeek === stageWeeks.curateWeek;
  const isMonitorStage = stage === 'live' || stage === 'post-mortem';
  const canPublishCatalog = stage === 'curate' || isReleaseWindow || stage === 'live';
  const stageMeta =
    isReleaseWindow && stage === 'curate'
      ? CURATION_STAGE_META.curate
      : stage === 'live' && canPublishCatalog
        ? {
            ...CURATION_STAGE_META.live,
            description: 'Current drop cycle — stage and release events to the live feed.',
          }
        : CURATION_STAGE_META[stage] || CURATION_STAGE_META.curate;

  // Default to the drop-cycle live batch once anchors are known (unless URL set a week).
  useEffect(() => {
    if (initializedWeekRef.current) return;
    if (isValidIsoWeek(urlBatchWeek)) {
      initializedWeekRef.current = true;
      return;
    }
    if (!ops?.anchors?.liveWeek) return;
    initializedWeekRef.current = true;
    if (isValidIsoWeek(ops.anchors.liveWeek)) {
      setBatchWeek(ops.anchors.liveWeek, { immediate: true });
    }
  }, [ops?.anchors?.liveWeek, urlBatchWeek, setBatchWeek]);

  const overview = ops?.overview && !ops.overview.error ? ops.overview : null;
  const drop = overview?.dropSchedule || opsDropSchedule;
  const statusCounts = overview?.kpis?.eventCountsByStatus;
  const hostCreatedCounts = overview?.kpis?.hostCreatedCounts || {
    hostDraft: overview?.kpis?.hostDraft ?? 0,
    hostStaged: overview?.kpis?.hostStaged ?? 0,
    hostPublished: overview?.kpis?.hostPublished ?? 0,
  };
  const hostLiveWeekAlert = overview?.hostLiveWeekAlert || null;
  const weekRangeLabel =
    ops?.weekRange?.label ||
    (batchWeekValid
      ? formatBatchWeekRange(batchWeek, {
          dropDayOfWeek,
          timeZone: dropTimeZone,
        })
      : '—');
  const dropLabel = drop?.nextDropFormatted || null;
  const overviewLoading = opsLoading;

  const performanceEvents =
    ops?.performance && !ops.performance.error
      ? (ops.performance.events ?? EMPTY_LIST)
      : EMPTY_LIST;

  const journey = ops?.journey && !ops.journey.error ? ops.journey : null;
  const journeyLoading = opsLoading && isMonitorStage && !ops?.journey;

  const jobs =
    ops?.jobs && !ops.jobs.error ? (ops.jobs.jobs ?? EMPTY_LIST) : EMPTY_LIST;
  const jobsLoading = opsLoading && canPublishCatalog && !ops?.jobs;
  const jobsError = ops?.jobs?.error || opsError || null;

  const events =
    ops?.catalog && !ops.catalog.error
      ? (ops.catalog.events ?? EMPTY_LIST)
      : EMPTY_LIST;
  const eventsLoading = opsLoading && committedWeekValid && !ops?.catalog;
  const eventsError = ops?.catalog?.error || null;
  const outOfWeekCount = ops?.catalog?.outOfWeekCount ?? 0;

  const {
    data: tagsResponse,
    refetch: refetchTags,
  } = useFetch('/admin/pivot/tags', { cache: NO_FETCH_CACHE });

  const readiness =
    ops?.readiness && !ops.readiness.error ? ops.readiness : null;
  const readinessLoading = opsLoading && canPublishCatalog && !ops?.readiness;

  const runUrl =
    tenantKey && activeRunId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-runs/${encodeURIComponent(activeRunId)}`
      : null;
  const {
    data: runResponse,
    refetch: refetchRun,
  } = useFetch(runUrl, { cache: NO_FETCH_CACHE });

  /**
   * Whether a batch is in flight is the server's fact, not this page's, so a
   * refresh or a second tab still shows it. Steps are excluded: this only needs
   * status and counters.
   */
  const latestBatchUrl = tenantKey
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-batches/latest`
    : null;
  const { data: latestBatchResponse, refetch: refetchLatestBatch } = useFetch(latestBatchUrl, {
    cache: NO_FETCH_CACHE,
  });
  const latestBatch = latestBatchResponse?.success ? latestBatchResponse.data?.run : null;
  const batchRunning = latestBatch?.status === 'running';

  const catalogTags = tagsResponse?.success
    ? (tagsResponse.data?.tags ?? EMPTY_LIST)
    : EMPTY_LIST;
  const activeRun = runResponse?.success ? runResponse.data?.run : null;

  const hostCreatedCount = useMemo(
    () => events.filter((event) => isHostCreatedEvent(event)).length,
    [events],
  );

  /** What a batch would actually crawl — mirrors the server's own selection. */
  const runnableJobCount = useMemo(
    () =>
      jobs.filter(
        (job) => job.enabled !== false && job.provider !== 'manual-json' && Boolean(job.url),
      ).length,
    [jobs],
  );

  const filteredEvents = useMemo(() => {
    const hostCreatedOnly = sourceFilter === HOST_CREATED_SOURCE;
    return events
      .filter(
        (event) =>
          eventMatchesFilter(event, filter) && eventMatchesSourceFilter(event, sourceFilter),
      )
      .slice()
      .sort((a, b) => compareCurationEvents(a, b, { hostCreatedOnly }));
  }, [events, filter, sourceFilter]);

  const performanceById = useMemo(() => {
    const map = new Map();
    for (const row of performanceEvents) {
      if (row?.eventId) map.set(String(row.eventId), row);
    }
    return map;
  }, [performanceEvents]);

  const publishedCount = useMemo(
    () => events.filter((e) => e.ingestStatus === 'published').length,
    [events],
  );
  const stagedCount = useMemo(
    () => events.filter((e) => e.ingestStatus === 'staged').length,
    [events],
  );
  const draftCount = useMemo(
    () => events.filter((e) => e.ingestStatus === 'draft').length,
    [events],
  );

  // Open catalog edit drawer from notify deep links (?eventId=…).
  useEffect(() => {
    if (!urlEventId || eventsLoading || !events.length) return;
    if (openedEventIdRef.current === urlEventId) return;
    const match = events.find((event) => String(event._id) === String(urlEventId));
    if (!match) return;
    openedEventIdRef.current = urlEventId;
    setEditingEvent(match);
  }, [urlEventId, events, eventsLoading]);

  // Poll active run until terminal.
  useEffect(() => {
    if (!activeRunId || !activeRun) return undefined;
    const status = activeRun.status;
    if (status === 'completed' || status === 'failed') {
      refetchOps();
      return undefined;
    }
    const timer = setInterval(() => {
      refetchRun();
    }, RUN_POLL_MS);
    return () => clearInterval(timer);
  }, [activeRun, activeRunId, refetchOps, refetchRun]);

  // Poll the batch faster while it runs, but never stop entirely — one can be
  // started from another tab or chained by a discovery run.
  useEffect(() => {
    if (!latestBatchUrl) return undefined;
    const timer = setInterval(
      () => {
        refetchLatestBatch();
        if (batchRunning) refetchOps();
      },
      batchRunning ? RUN_POLL_MS : BATCH_IDLE_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [batchRunning, latestBatchUrl, refetchLatestBatch, refetchOps]);

  useEffect(() => {
    const previous = previousBatchRef.current;
    previousBatchRef.current = latestBatch;

    if (!latestBatch || !previous) return;
    if (previous._id !== latestBatch._id || previous.status !== 'running' || batchRunning) return;
    if (batchNotifiedRef.current === latestBatch._id) return;
    batchNotifiedRef.current = latestBatch._id;

    refetchOps();
    const saved = latestBatch.counters?.eventsUpserted || 0;
    addNotification({
      title: latestBatch.aborted ? 'Refresh stopped early' : 'Refresh complete',
      message: latestBatch.aborted
        ? latestBatch.aborted.error
        : `${saved} event(s) saved from ${latestBatch.counters?.jobsRun || 0} source(s).`,
      type: latestBatch.aborted ? 'warning' : 'success',
    });
  }, [addNotification, batchRunning, latestBatch, refetchOps]);

  // Clear selection when week/filter changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [batchWeek, filter, sourceFilter, tenantKey]);

  const stepBatchWeek = useCallback(
    (delta) => {
      setBatchWeek((current) => {
        const next = shiftIsoWeek(current, delta);
        return next || current;
      });
    },
    [setBatchWeek],
  );

  const refreshAll = useCallback(() => {
    refetchOps();
    if (activeRunId) refetchRun();
  }, [activeRunId, refetchOps, refetchRun]);

  const handleJsonStaged = useCallback(
    (result) => {
      refreshAll();
      setStageLandHint(null);

      const counts = result?.batchWeekCounts || {};
      const weeks = Object.keys(counts).sort();
      if (!weeks.length) return;

      const inReviewWeek = counts[committedWeek] || 0;
      const totalStaged = weeks.reduce((sum, week) => sum + (counts[week] || 0), 0);

      if (forceBatchWeek || inReviewWeek === totalStaged) {
        return;
      }

      if (weeks.length === 1) {
        const landedWeek = weeks[0];
        setBatchWeek(landedWeek, { immediate: true });
        addNotification({
          title: 'Review week switched',
          message: `${totalStaged} event(s) staged into ${landedWeek} by start date — switched the review queue to that week.`,
          type: 'info',
        });
        return;
      }

      setStageLandHint({ batchWeekCounts: counts, totalStaged });
      addNotification({
        title: 'Events staged in other weeks',
        message: `${totalStaged} event(s) landed by start date (${weeks
          .map((week) => `${week} (${counts[week]})`)
          .join(', ')}). Switch the batch week above to review them, or enable “Force into review week”.`,
        type: 'warning',
      });
    },
    [addNotification, committedWeek, forceBatchWeek, refreshAll, setBatchWeek],
  );

  const keybindsEnabled =
    batchWeekValid &&
    !manualImportOpen &&
    !editingEvent &&
    !jobFormOpen;

  const { keyboardNavActive } = usePivotTenantWeekKeybinds({
    enabled: keybindsEnabled,
    onStepWeek: stepBatchWeek,
    onRefresh: refreshAll,
  });

  const selectedEvents = useMemo(
    () => events.filter((e) => selectedIds.has(e._id)),
    [events, selectedIds],
  );

  const buildTagSuggestPayload = useCallback(
    (fields) => ({
      name: fields.name?.trim() || undefined,
      description: fields.description?.trim() || undefined,
      location: fields.location?.trim() || undefined,
      hostName: fields.organizerName?.trim() || fields.hostName?.trim() || undefined,
      sourceTags: fields.sourceTags || undefined,
    }),
    [],
  );

  const requestSuggestedTags = useCallback(async (payload) => {
    const { data, error } = await authenticatedRequest('/admin/pivot/ingest/suggest-tags', {
      method: 'POST',
      data: { event: payload },
    });
    if (error || !data?.success) {
      return {
        error: error || data?.message || 'Could not suggest tags.',
        code: data?.code,
      };
    }
    return { tags: data.data?.tags || [] };
  }, []);

  const openCreateJob = useCallback(() => {
    setJobsExpanded(true);
    setEditingJobId(null);
    setJobForm(emptyJobForm());
    setJobFormOpen(true);
  }, []);

  const openEditJob = useCallback((job) => {
    setJobsExpanded(true);
    setEditingJobId(job._id);
    setJobForm({
      label: job.label || '',
      url: job.url || '',
      provider: job.provider || 'partiful',
      defaultBatchWeekStrategy: job.defaultBatchWeekStrategy || 'next-drop',
      defaultTags: Array.isArray(job.defaultTags) ? [...job.defaultTags] : [],
      enabled: job.enabled !== false,
    });
    setJobFormOpen(true);
  }, []);

  const handleSaveJob = useCallback(async () => {
    if (!tenantKey) return;
    const label = jobForm.label.trim();
    if (!label) {
      addNotification({
        title: 'Label required',
        message: 'Give the job a short label.',
        type: 'warning',
      });
      return;
    }

    let provider = jobForm.provider;
    const url = jobForm.url.trim();
    if (!provider && url) {
      provider = detectProviderFromUrl(url) || 'partiful';
    }
    if (provider !== 'manual-json' && !url) {
      addNotification({
        title: 'URL required',
        message: 'Partiful, Luma, and website jobs all need a listing URL.',
        type: 'warning',
      });
      return;
    }

    setBusyKey(editingJobId ? `job-save-${editingJobId}` : 'job-create');
    const body = {
      label,
      url: url || undefined,
      provider,
      defaultBatchWeekStrategy: jobForm.defaultBatchWeekStrategy,
      defaultTags: jobForm.defaultTags,
      enabled: jobForm.enabled,
    };

    const path = editingJobId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-jobs/${encodeURIComponent(editingJobId)}`
      : `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-jobs`;

    const { data, error } = await authenticatedRequest(path, {
      method: editingJobId ? 'PATCH' : 'POST',
      data: body,
    });
    setBusyKey(null);

    if (error || !data?.success) {
      addNotification({
        title: editingJobId ? 'Update failed' : 'Create failed',
        message: error || data?.message || 'Could not save curation job.',
        type: 'error',
      });
      return;
    }

    setJobFormOpen(false);
    setEditingJobId(null);
    refetchOps();
    addNotification({
      title: editingJobId ? 'Job updated' : 'Job saved',
      message: `${data.data?.job?.label || label} is ready to run.`,
      type: 'success',
    });
  }, [addNotification, editingJobId, jobForm, refetchOps, tenantKey]);

  const handleDeleteJob = useCallback(
    async (job) => {
      if (!tenantKey || !job?._id) return;
      if (!window.confirm(`Delete saved job “${job.label}”?`)) return;

      setBusyKey(`job-delete-${job._id}`);
      const { data, error } = await authenticatedRequest(
        `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-jobs/${encodeURIComponent(job._id)}`,
        { method: 'DELETE' },
      );
      setBusyKey(null);

      if (error || !data?.success) {
        addNotification({
          title: 'Delete failed',
          message: error || data?.message || 'Could not delete job.',
          type: 'error',
        });
        return;
      }
      refetchOps();
      addNotification({ title: 'Job deleted', type: 'success' });
    },
    [addNotification, refetchOps, tenantKey],
  );

  const handleRunJob = useCallback(
    async (job) => {
      if (!tenantKey || !job?._id || !batchWeekValid || !weekSettled) return;
      if (job.provider === 'manual-json') {
        addNotification({
          title: 'Not crawlable',
          message: 'Manual JSON jobs cannot be crawled — use Manual add instead.',
          type: 'warning',
        });
        return;
      }

      setBusyKey(`job-run-${job._id}`);
      const { data, error } = await authenticatedRequest(
        `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-jobs/${encodeURIComponent(job._id)}/run`,
        {
          method: 'POST',
          data: {
            batchWeek: committedWeek,
            forceBatchWeek,
          },
        },
      );
      setBusyKey(null);

      if (error || !data?.success) {
        addNotification({
          title: 'Run failed',
          message: error || data?.message || 'Could not start crawl run.',
          type: 'error',
        });
        return;
      }

      const run = data.data?.run;
      setActiveRunId(run?._id || null);
      refetchOps();
      addNotification({
        title: 'Crawl started',
        message: forceBatchWeek
          ? `Running “${job.label}” — all events forced into ${committedWeek}.`
          : `Running “${job.label}” — events land in the week of their start date (may span multiple weeks).`,
        type: 'success',
      });
    },
    [
      addNotification,
      committedWeek,
      batchWeekValid,
      forceBatchWeek,
      refetchOps,
      tenantKey,
      weekSettled,
    ],
  );

  /**
   * Refresh every enabled job in one orchestrated run.
   *
   * The alternative is clicking Run on each job and waiting for it, which does
   * not scale past a handful of sources and gives no single place to watch. The
   * orchestrator also holds one rate-limit budget across the whole city rather
   * than letting each job hit the wall independently.
   */
  const handleRunAllJobs = useCallback(async () => {
    if (!tenantKey || !batchWeekValid || !weekSettled) return;

    setBatchStarting(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-batches`,
      {
        method: 'POST',
        data: { batchWeek: committedWeek, forceBatchWeek },
      },
    );
    setBatchStarting(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Refresh failed',
        message: error || data?.message || 'Could not start the refresh.',
        type: 'error',
      });
      return;
    }

    refetchLatestBatch();
    setBatchConsoleOpen(true);
    addNotification({
      title: 'Refresh started',
      message: `Crawling ${data.data?.jobs ?? 0} source(s) in the background.`,
      type: 'success',
    });
  }, [
    addNotification,
    batchWeekValid,
    committedWeek,
    forceBatchWeek,
    refetchLatestBatch,
    tenantKey,
    weekSettled,
  ]);

  const releaseStagedEvents = useCallback(
    async ({ eventIds = null, count, confirmMessage, busy = 'release' } = {}) => {
      if (!tenantKey || !batchWeekValid || !weekSettled) return false;
      const releaseCount = count ?? (eventIds?.length || stagedCount);
      if (releaseCount === 0) {
        addNotification({
          title: 'Nothing to release',
          message: 'Stage events for this week before releasing to the live feed.',
          type: 'warning',
        });
        return false;
      }
      if (
        !window.confirm(
          confirmMessage ||
            `Release ${releaseCount} staged event(s) for ${committedWeek} to the live feed?`,
        )
      ) {
        return false;
      }

      setBusyKey(busy);
      const { data, error } = await authenticatedRequest(
        `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/batches/${encodeURIComponent(committedWeek)}/release`,
        {
          method: 'POST',
          data: eventIds?.length ? { eventIds } : {},
        },
      );
      setBusyKey(null);

      if (error || !data?.success) {
        addNotification({
          title: 'Release failed',
          message: error || data?.message || 'Could not release batch.',
          type: 'error',
        });
        return false;
      }

      refreshAll();
      setSelectedIds(new Set());
      addNotification({
        title: 'Published',
        message: `${data.data?.releasedCount ?? 0} event(s) are now live for ${committedWeek}.`,
        type: 'success',
      });
      return true;
    },
    [
      addNotification,
      batchWeekValid,
      committedWeek,
      refreshAll,
      stagedCount,
      tenantKey,
      weekSettled,
    ],
  );

  const handleRelease = useCallback(
    () => releaseStagedEvents({ count: stagedCount }),
    [releaseStagedEvents, stagedCount],
  );

  const handleBulkRelease = useCallback(async () => {
    const staged = selectedEvents.filter((event) => event.ingestStatus === 'staged');
    if (!staged.length) {
      addNotification({
        title: 'No staged events selected',
        message: 'Select staged events to publish, or use Publish all staged.',
        type: 'warning',
      });
      return;
    }
    await releaseStagedEvents({
      eventIds: staged.map((event) => event._id),
      count: staged.length,
      confirmMessage: `Publish ${staged.length} selected staged event(s) for ${committedWeek} to the live feed?`,
      busy: 'bulk-release',
    });
  }, [addNotification, committedWeek, releaseStagedEvents, selectedEvents]);

  const handleReleaseOne = useCallback(
    async (event) => {
      if (!event || event.ingestStatus !== 'staged') return;
      await releaseStagedEvents({
        eventIds: [event._id],
        count: 1,
        confirmMessage: `Publish “${event.name}” to the live feed?`,
        busy: `release-${event._id}`,
      });
    },
    [releaseStagedEvents],
  );

  const unreleaseEvents = useCallback(
    async ({ eventIds, count, confirmMessage, busy = 'unrelease', skipConfirm = false } = {}) => {
      if (!tenantKey || !batchWeekValid || !weekSettled) return false;
      const ids = Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
      const releaseCount = count ?? ids.length;
      if (!ids.length || releaseCount === 0) {
        addNotification({
          title: 'Nothing to unpublish',
          message: 'Select published events to pull out of the live feed.',
          type: 'warning',
        });
        return false;
      }
      if (
        !skipConfirm &&
        !window.confirm(
          confirmMessage ||
            `Unpublish ${releaseCount} event(s) for ${committedWeek}? People who already swiped may keep their intent.`,
        )
      ) {
        return false;
      }

      setBusyKey(busy);
      const { data, error } = await authenticatedRequest(
        `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/batches/${encodeURIComponent(committedWeek)}/unrelease`,
        {
          method: 'POST',
          data: {
            confirm: UNRELEASE_CONFIRM_TOKEN,
            eventIds: ids,
          },
        },
      );
      setBusyKey(null);

      if (error || !data?.success) {
        addNotification({
          title: 'Unpublish failed',
          message: error || data?.message || 'Could not unpublish events.',
          type: 'error',
        });
        return false;
      }

      refreshAll();
      setSelectedIds(new Set());
      addNotification({
        title: 'Unpublished',
        message: `${data.data?.unreleasedCount ?? releaseCount} event(s) are staged again for ${committedWeek}.`,
        type: 'success',
      });
      return true;
    },
    [
      addNotification,
      batchWeekValid,
      committedWeek,
      refreshAll,
      tenantKey,
      weekSettled,
    ],
  );

  const handleUnpublishOne = useCallback(
    async (event) => {
      if (!event || event.ingestStatus !== 'published') return;
      await unreleaseEvents({
        eventIds: [event._id],
        count: 1,
        confirmMessage: `Unpublish “${event.name}” from the live feed? People who already swiped may keep their intent.`,
        busy: `unrelease-${event._id}`,
      });
    },
    [unreleaseEvents],
  );

  const handleBulkUnpublish = useCallback(async () => {
    const published = selectedEvents.filter((event) => event.ingestStatus === 'published');
    if (!published.length) {
      addNotification({
        title: 'No published events selected',
        message: 'Select published events to pull out of the live feed.',
        type: 'warning',
      });
      return;
    }
    await unreleaseEvents({
      eventIds: published.map((event) => event._id),
      count: published.length,
      confirmMessage: `Unpublish ${published.length} selected event(s) for ${committedWeek}? People who already swiped may keep their intent.`,
      busy: 'bulk-unrelease',
    });
  }, [addNotification, committedWeek, selectedEvents, unreleaseEvents]);

  const patchEventOverrides = useCallback(
    async (eventId, overrides) => {
      const { data, error } = await authenticatedRequest(
        `/admin/pivot/ingest/${eventId}`,
        {
          method: 'PATCH',
          data: { tenantKey, overrides },
        },
      );
      if (error || !data?.success) {
        return { error: error || data?.message || 'Update failed.', code: data?.code };
      }
      return { event: data.data?.event };
    },
    [tenantKey],
  );

  const handleBulkStage = useCallback(async () => {
    const drafts = selectedEvents.filter((e) => e.ingestStatus === 'draft');
    if (!drafts.length) {
      addNotification({
        title: 'No drafts selected',
        message: 'Select draft events to stage.',
        type: 'warning',
      });
      return;
    }

    setBusyKey('bulk-stage');
    let ok = 0;
    let failed = 0;
    for (const event of drafts) {
      const result = await patchEventOverrides(event._id, { ingestStatus: 'staged' });
      if (result.error) failed += 1;
      else ok += 1;
    }
    setBusyKey(null);
    refreshAll();
    setSelectedIds(new Set());
    addNotification({
      title: failed ? 'Partial stage' : 'Staged',
      message: `${ok} staged${failed ? `, ${failed} failed` : ''}.`,
      type: failed ? 'warning' : 'success',
    });
  }, [addNotification, patchEventOverrides, refreshAll, selectedEvents]);

  const handleBulkApplyTags = useCallback(async () => {
    if (!bulkTags.length) {
      addNotification({
        title: 'Pick tags',
        message: 'Choose at least one tag to apply.',
        type: 'warning',
      });
      return;
    }
    if (!selectedEvents.length) {
      addNotification({
        title: 'Nothing selected',
        message: 'Select events in the review queue.',
        type: 'warning',
      });
      return;
    }

    setBusyKey('bulk-tags');
    let ok = 0;
    let failed = 0;
    for (const event of selectedEvents) {
      const result = await patchEventOverrides(event._id, { tags: bulkTags });
      if (result.error) failed += 1;
      else ok += 1;
    }
    setBusyKey(null);
    refreshAll();
    addNotification({
      title: failed ? 'Partial tag update' : 'Tags applied',
      message: `${ok} updated${failed ? `, ${failed} failed` : ''}.`,
      type: failed ? 'warning' : 'success',
    });
  }, [addNotification, bulkTags, patchEventOverrides, refreshAll, selectedEvents]);

  const handleBulkSuggestTags = useCallback(async () => {
    if (!selectedEvents.length) {
      addNotification({
        title: 'Nothing selected',
        message: 'Select events to suggest tags for.',
        type: 'warning',
      });
      return;
    }

    setBusyKey('bulk-suggest');
    let ok = 0;
    let failed = 0;
    for (const event of selectedEvents) {
      const suggest = await requestSuggestedTags(
        buildTagSuggestPayload({
          name: event.name,
          description: event.description,
          location: event.location,
          organizerName: event.organizerName,
        }),
      );
      if (suggest.error || !suggest.tags?.length) {
        failed += 1;
        continue;
      }
      const result = await patchEventOverrides(event._id, { tags: suggest.tags });
      if (result.error) failed += 1;
      else ok += 1;
    }
    setBusyKey(null);
    refreshAll();
    addNotification({
      title: failed ? 'Partial suggest' : 'Tags suggested',
      message: `${ok} updated${failed ? `, ${failed} skipped/failed` : ''}.`,
      type: failed ? 'warning' : 'success',
    });
  }, [
    addNotification,
    buildTagSuggestPayload,
    patchEventOverrides,
    refreshAll,
    requestSuggestedTags,
    selectedEvents,
  ]);

  const handleSaveCatalogEdit = useCallback(
    async (draft) => {
      if (!editingEvent || !tenantKey) return false;
      setEditSaving(true);
      const wantsPublish = draft.ingestStatus === 'published';
      const wasStaged = editingEvent.ingestStatus === 'staged';
      const wasPublished = editingEvent.ingestStatus === 'published';
      const wantsUnpublish = wasPublished && !wantsPublish;
      const overrides = catalogEditDraftToOverrides(draft);

      if (wasStaged && wantsPublish) {
        if (!draft.tags?.length) {
          setEditSaving(false);
          addNotification({
            title: 'Tags required',
            message: 'Select at least one catalog tag before publishing.',
            type: 'warning',
          });
          return false;
        }
        const { ingestStatus: _ingestStatus, ...metadataOverrides } = overrides;
        const result = await patchEventOverrides(editingEvent._id, metadataOverrides);
        if (result.error) {
          setEditSaving(false);
          addNotification({
            title: 'Update failed',
            message: result.error,
            type: 'error',
          });
          return false;
        }
        const batchWeekForRelease = editingEvent.batchWeek || committedWeek;
        const { data, error } = await authenticatedRequest(
          `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/batches/${encodeURIComponent(batchWeekForRelease)}/release`,
          { method: 'POST', data: { eventIds: [editingEvent._id] } },
        );
        setEditSaving(false);
        if (error || !data?.success) {
          addNotification({
            title: 'Publish failed',
            message: error || data?.message || 'Could not publish event.',
            type: 'error',
          });
          return false;
        }
        setEditingEvent(null);
        refreshAll();
        addNotification({
          title: 'Published',
          message: `${editingEvent.name} is now live.`,
          type: 'success',
        });
        return true;
      }

      if (wantsUnpublish) {
        const { ingestStatus: _ingestStatus, ...metadataOverrides } = overrides;
        const result = await patchEventOverrides(editingEvent._id, metadataOverrides);
        if (result.error) {
          setEditSaving(false);
          addNotification({
            title: 'Update failed',
            message: result.error,
            type: 'error',
          });
          return false;
        }
        const unpublished = await unreleaseEvents({
          eventIds: [editingEvent._id],
          count: 1,
          busy: `unrelease-${editingEvent._id}`,
          skipConfirm: true,
        });
        setEditSaving(false);
        if (!unpublished) return false;
        setEditingEvent(null);
        return true;
      }

      const result = await patchEventOverrides(editingEvent._id, overrides);
      setEditSaving(false);
      if (result.error) {
        addNotification({
          title: 'Update failed',
          message: result.error,
          type: 'error',
        });
        return false;
      }
      setEditingEvent(null);
      refreshAll();
      addNotification({ title: 'Updated', message: 'Catalog event saved.', type: 'success' });
      return true;
    },
    [addNotification, committedWeek, editingEvent, patchEventOverrides, refreshAll, tenantKey, unreleaseEvents],
  );

  const suggestTagsForEdit = useCallback(
    async (draft, patchDraft) => {
      setTagSuggestLoadingKey('edit');
      const result = await requestSuggestedTags(
        buildTagSuggestPayload({
          name: draft.name,
          description: draft.description,
          location: draft.location,
          organizerName: draft.organizerName,
        }),
      );
      setTagSuggestLoadingKey(null);
      if (result.error) {
        addNotification({
          title: 'Tag suggestion failed',
          message: result.error,
          type: 'error',
        });
        return;
      }
      patchDraft?.({ tags: result.tags });
    },
    [addNotification, buildTagSuggestPayload, requestSuggestedTags],
  );

  const suggestTagsForManualImport = useCallback(
    async (draft, patchDraft) => {
      setTagSuggestLoadingKey('manual-import');
      const result = await requestSuggestedTags(
        buildTagSuggestPayload({
          name: draft.name,
          description: draft.description,
          location: draft.location,
          organizerName: draft.organizerName,
        }),
      );
      setTagSuggestLoadingKey(null);
      if (result.error) {
        addNotification({
          title: 'Tag suggestion failed',
          message: result.error,
          type: 'error',
        });
        return;
      }
      patchDraft?.({ tags: result.tags });
    },
    [addNotification, buildTagSuggestPayload, requestSuggestedTags],
  );

  const handlePublishManualImport = useCallback(
    async (draft) => {
      if (!tenantKey) return false;
      // Flush pending week so ingest targets the week shown in the picker.
      setBatchWeek(batchWeek, { immediate: true });
      setManualImportPublishLoading(true);
      const entry = manualDraftToImportEntry(draft);
      const { data, error } = await authenticatedRequest('/admin/pivot/ingest', {
        method: 'POST',
        data: {
          tenantKey,
          batchWeek,
          forceBatchWeek,
          overrides: {
            hostName: entry.draft.hostName,
            name: entry.draft.name,
            location: entry.draft.location,
            start_time: entry.draft.start_time,
            end_time: entry.draft.end_time || undefined,
            description: entry.draft.description || undefined,
            image: entry.draft.image || undefined,
            source: 'manual',
            sourceUrl: entry.draft.sourceUrl || undefined,
            tags: entry.draft.tags,
            ...(entry.draft.timeSlots?.length ? { timeSlots: entry.draft.timeSlots } : {}),
            ...(entry.draft.movie ? { movie: entry.draft.movie } : {}),
          },
        },
      });
      setManualImportPublishLoading(false);

      if (error || !data?.success) {
        addNotification({
          title: 'Stage failed',
          message: error || data?.message || 'Could not stage event.',
          type: 'error',
        });
        return false;
      }

      const landedWeek = data.data?.batchWeek || data.data?.event?.batchWeek || batchWeek;
      refreshAll();
      addNotification({
        title: 'Staged',
        message: `${data.data?.event?.name || entry.draft.name} added for ${landedWeek}${
          forceBatchWeek ? ' (forced)' : ''
        }.`,
        type: 'success',
      });
      return true;
    },
    [addNotification, batchWeek, forceBatchWeek, refreshAll, setBatchWeek, tenantKey],
  );

  const handleUrlImport = useCallback(async () => {
    const url = urlImportValue.trim();
    if (!url || !tenantKey || !batchWeekValid) return;

    setBatchWeek(batchWeek, { immediate: true });
    setUrlImportLoading(true);
    const preview = await authenticatedRequest('/admin/pivot/ingest/preview', {
      method: 'POST',
      data: { url, tenantKey },
    });

    if (preview.error || !preview.data?.success) {
      setUrlImportLoading(false);
      addNotification({
        title: 'Preview failed',
        message: preview.error || preview.data?.message || 'Could not preview URL.',
        type: 'error',
      });
      return;
    }

    const mode = preview.data.data?.mode;
    if (mode === 'batch') {
      // Prefer saving as a job for explore URLs.
      const provider =
        preview.data.data?.provider || detectProviderFromUrl(url) || 'partiful';
      setJobForm({
        ...emptyJobForm(),
        label: preview.data.data?.listLabel || `${provider} explore`,
        url,
        provider,
      });
      setJobFormOpen(true);
      setEditingJobId(null);
      setUrlImportLoading(false);
      addNotification({
        title: 'Explore link detected',
        message: 'Save it as a crawl job, then Run for this week.',
        type: 'info',
      });
      return;
    }

    const draft = preview.data.data?.draft || {};
    if (!bulkTags.length) {
      setUrlImportLoading(false);
      addNotification({
        title: 'Tags required',
        message:
          'Pick tags in the review bulk bar (or use Manual form), then import the URL again.',
        type: 'warning',
      });
      return;
    }

    const { data, error } = await authenticatedRequest('/admin/pivot/ingest', {
      method: 'POST',
      data: {
        tenantKey,
        url,
        batchWeek,
        forceBatchWeek,
        overrides: {
          hostName: draft.hostName,
          name: draft.name,
          location: draft.location,
          start_time: draft.start_time,
          end_time: draft.end_time || undefined,
          description: draft.description || undefined,
          image: draft.image || undefined,
          source: draft.source,
          sourceUrl: draft.sourceUrl || url,
          tags: bulkTags,
        },
      },
    });
    setUrlImportLoading(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Import failed',
        message: error || data?.message || 'Could not import event.',
        type: 'error',
      });
      return;
    }

    const landedWeek = data.data?.batchWeek || data.data?.event?.batchWeek || batchWeek;
    setUrlImportValue('');
    refreshAll();
    addNotification({
      title: 'Staged',
      message: `${data.data?.event?.name || draft.name || 'Event'} added for ${landedWeek}${
        forceBatchWeek ? ' (forced)' : ''
      }.`,
      type: 'success',
    });
  }, [
    addNotification,
    batchWeek,
    batchWeekValid,
    bulkTags,
    forceBatchWeek,
    refreshAll,
    setBatchWeek,
    tenantKey,
    urlImportValue,
  ]);

  const displayCity = overview?.cityDisplayName || cityDisplayName || tenantKey;

  const handleExportCatalogJson = useCallback(() => {
    const selected = events.filter((event) => selectedIds.has(event._id));
    const payload = buildCurationJsonExport({
      events: selected.length ? selected : events,
      tenantKey,
      batchWeek: committedWeek,
      cityLabel: displayCity,
    });
    if (!payload.events.length) {
      addNotification({
        title: 'Nothing to export',
        message: 'This week has no catalog events to write as JSON.',
        type: 'info',
      });
      return;
    }
    downloadCurationJsonExport(
      payload,
      curationJsonExportFilename({ tenantKey, batchWeek: committedWeek }),
    );
    addNotification({
      title: 'Catalog exported',
      message: `${payload.events.length} event(s) from ${committedWeek}. Load the file in JSON import on the other Curation panel.`,
      type: 'success',
    });
  }, [addNotification, committedWeek, displayCity, events, selectedIds, tenantKey]);

  const focusHostCreatedReview = useCallback(() => {
    setFilter('draft');
    setSourceFilter(HOST_CREATED_SOURCE);
    const queue = document.getElementById('curation-queue');
    if (queue?.scrollIntoView) {
      queue.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);
  const runInFlight =
    activeRun && (activeRun.status === 'queued' || activeRun.status === 'running');
  const releaseBusy =
    busyKey === 'release' ||
    busyKey === 'bulk-release' ||
    (typeof busyKey === 'string' && busyKey.startsWith('release-'));
  const releaseDisabled =
    !batchWeekValid ||
    !weekSettled ||
    stagedCount === 0 ||
    releaseBusy ||
    Boolean(runInFlight);
  const releaseBlockReason = useMemo(() => {
    if (stagedCount === 0) return null;
    if (!weekSettled) return 'Updating week… release will be available in a moment.';
    if (runInFlight) return 'Wait for the crawl to finish before publishing staged events.';
    return null;
  }, [runInFlight, stagedCount, weekSettled]);

  const openExplorePreview = useCallback(() => {
    if (!tenantKey || !committedWeekValid) return;
    showOverlay(
      <PivotTenantExplorePanel
        tenantKey={tenantKey}
        batchWeek={committedWeek}
        cityDisplayName={displayCity}
        weekRangeLabel={weekRangeLabel}
      />,
    );
  }, [
    committedWeek,
    committedWeekValid,
    displayCity,
    showOverlay,
    tenantKey,
    weekRangeLabel,
  ]);

  const closePurgePopup = useCallback(() => {
    if (purgingCatalog || purgingOutOfWeek) return;
    setPurgeOpen(false);
    setPurgeConfirm('');
  }, [purgingCatalog, purgingOutOfWeek]);

  const handlePurgeCatalog = useCallback(async () => {
    if (!tenantKey || !committedWeekValid || !weekSettled) return;

    if (purgeConfirm.trim() !== PURGE_CONFIRM_TOKEN) {
      addNotification({
        title: 'Confirmation required',
        message: `Type ${PURGE_CONFIRM_TOKEN} to delete catalog data.`,
        type: 'error',
      });
      return;
    }

    setPurgingCatalog(true);
    const { data, error } = await authenticatedRequest('/admin/pivot/dev/purge-catalog', {
      method: 'POST',
      data: {
        confirm: PURGE_CONFIRM_TOKEN,
        tenantKey,
        batchWeek: committedWeek,
        clearSnapshots: true,
      },
    });
    setPurgingCatalog(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Purge failed',
        message: error || data?.message || 'Could not purge pivot catalog data.',
        type: 'error',
      });
      return;
    }

    const totals = data.data?.totals || {};
    setPurgeConfirm('');
    setPurgeOpen(false);
    refreshAll();
    addNotification({
      title: 'Catalog purged',
      message: `Removed ${totals.events ?? 0} events, ${totals.intents ?? 0} intents, and ${totals.feedback ?? 0} feedback rows for ${committedWeek}.`,
      type: 'success',
    });
  }, [
    addNotification,
    committedWeek,
    committedWeekValid,
    purgeConfirm,
    refreshAll,
    tenantKey,
    weekSettled,
  ]);

  const handlePurgeOutOfWeek = useCallback(async () => {
    if (!tenantKey || !committedWeekValid || !weekSettled || outOfWeekCount === 0) return;

    setPurgingOutOfWeek(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/catalog/purge-out-of-week`,
      {
        method: 'POST',
        data: { batchWeek: committedWeek },
      },
    );
    setPurgingOutOfWeek(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Purge failed',
        message: error || data?.message || 'Could not purge out-of-range catalog events.',
        type: 'error',
      });
      return;
    }

    const deleted = data.data?.deleted || {};
    setPurgeOpen(false);
    setPurgeConfirm('');
    refreshAll();
    addNotification({
      title: 'Out-of-range events purged',
      message: `Removed ${deleted.events ?? 0} event(s) outside ${weekRangeLabel}.`,
      type: 'success',
    });
  }, [
    addNotification,
    committedWeek,
    committedWeekValid,
    outOfWeekCount,
    refreshAll,
    tenantKey,
    weekRangeLabel,
    weekSettled,
  ]);

  const handleDeleteEvent = useCallback(
    async (event) => {
      if (!tenantKey || !event?._id) return;

      if (
        !window.confirm(
          `Permanently delete “${event.name}” (${event.batchWeek || 'no batch week'})? Related intents and feedback for this event will also be removed. This cannot be undone.`,
        )
      ) {
        return;
      }

      setBusyKey(`delete-${event._id}`);
      const { data, error } = await authenticatedRequest(
        `/admin/pivot/ingest/${encodeURIComponent(event._id)}`,
        {
          method: 'DELETE',
          data: { tenantKey },
        },
      );
      setBusyKey(null);

      if (error || !data?.success) {
        addNotification({
          title: 'Delete failed',
          message: error || data?.message || 'Could not delete catalog event.',
          type: 'error',
        });
        return;
      }

      setSelectedIds((prev) => {
        if (!prev.has(event._id)) return prev;
        const next = new Set(prev);
        next.delete(event._id);
        return next;
      });
      if (editingEvent?._id === event._id) {
        setEditingEvent(null);
      }
      refreshAll();
      addNotification({
        title: 'Event deleted',
        message: `${event.name} was removed from the catalog.`,
        type: 'success',
      });
    },
    [addNotification, editingEvent, refreshAll, tenantKey],
  );

  return (
    <PivotTenantPage
      title="Curation"
      tenantKey={tenantKey}
      cityDisplayName={displayCity}
    //   subtitle={stageMeta.description}
      className="pivot-tenant-curation"
      actions={
        <>
          {tenantKey && committedWeekValid ? (
            <button
              type="button"
              className="linear-btn linear-btn--ghost pivot-tenant-curation__purge-trigger"
              onClick={() => setPurgeOpen(true)}
            >
              Purge
            </button>
          ) : null}
          <button
            type="button"
            className="linear-btn linear-btn--ghost pivot-tenant-kbd-btn"
            onClick={refreshAll}
            disabled={overviewLoading || eventsLoading || (canPublishCatalog && jobsLoading)}
          >
            Refresh
            <KeybindTooltip label="Refresh" keybind="R" />
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={handleExportCatalogJson}
            disabled={!events.length}
            title={
              selectedIds.size
                ? `Export ${selectedIds.size} selected event(s) for another Curation panel`
                : `Export all ${events.length} event(s) in ${committedWeek} for another Curation panel`
            }
          >
            {selectedIds.size ? `Export JSON (${selectedIds.size})` : 'Export JSON'}
          </button>
          {canPublishCatalog ? (
            <label
              className="pivot-tenant-curation__check"
              title="Off by default: crawl and manual ingest assign each event to the ISO week of its start date. Turn on only to pin every event into the selected review week."
            >
              <input
                type="checkbox"
                checked={forceBatchWeek}
                onChange={(e) => setForceBatchWeek(e.target.checked)}
              />
              <span>Force into review week</span>
            </label>
          ) : null}
          {committedWeekValid ? (
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={handleRelease}
              disabled={releaseDisabled}
              title={
                stagedCount === 0
                  ? 'Stage events before publishing'
                  : `Publish all ${stagedCount} staged event(s)`
              }
            >
              {releaseBusy ? 'Publishing…' : `Publish week (${stagedCount})`}
            </button>
          ) : null}
        </>
      }
    >
      <aside className="pivot-tenant-curation__batch-banner" aria-label="Batch dates">
        <div className="pivot-tenant-curation__batch-banner-main">
          <p className="pivot-tenant-curation__drop-label">
            <span className={`pivot-tenant-curation__mode-pill pivot-tenant-curation__mode-pill--${stage}`}>
              {stageMeta.label}
            </span>
          </p>
          <p className="pivot-tenant-curation__batch-week">{batchWeek}</p>
          <p className="pivot-tenant-curation__batch-dates">{weekRangeLabel}</p>
          {dropLabel ? (
            <p className="pivot-tenant-curation__batch-drop">Drop · {dropLabel}</p>
          ) : null}
          <p className="pivot-tenant-curation__batch-anchors">
            {stageWeeks.dropPending && stageWeeks.curateWeek !== stageWeeks.liveWeek ? (
              <>
                Live <strong>{stageWeeks.liveWeek}</strong>
                {' · '}
                Next drop <strong>{stageWeeks.curateWeek}</strong>
              </>
            ) : (
              <>
                Live <strong>{stageWeeks.liveWeek}</strong>
              </>
            )}
          </p>
          {overview ? (
            <p className="pivot-host-created-counts pivot-tenant-curation__host-counts">
              <span className="pivot-host-created-counts__label">Host-created</span>
              <span>{formatHostCreatedCounts(hostCreatedCounts)}</span>
            </p>
          ) : null}
        </div>
        <div className="pivot-tenant-curation__batch-banner-actions">
          <PivotBatchWeekPicker
            batchWeek={batchWeek}
            onChange={setBatchWeek}
            keyboardNavActive={keyboardNavActive}
            anchors={stageWeeks}
            dropDayOfWeek={dropDayOfWeek}
            timeZone={dropTimeZone}
            showLabel={false}
            pending={!weekSettled}
          />
          {batchWeekValid && committedWeekValid ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary pivot-tenant-curation__explore-preview-btn"
              onClick={openExplorePreview}
              title={`Preview the mobile Explore tab for ${committedWeek}`}
            >
              Explore preview
            </button>
          ) : null}
        </div>
      </aside>

      <PivotHostLiveWeekAlert
        alert={hostLiveWeekAlert}
        onReviewClick={focusHostCreatedReview}
      />

      {!batchWeekValid ? (
        <p className="pivot-lab__error">Enter a valid batch week (YYYY-Www).</p>
      ) : null}

      {isMonitorStage ? (
        <PivotCurationMonitorPanel
          stage={stage}
          overview={overview}
          overviewLoading={overviewLoading}
          journey={journey}
          journeyLoading={journeyLoading}
        />
      ) : null}

      {canPublishCatalog ? (
        <>
      <aside className="pivot-tenant-curation__drop" aria-label="Drop and week status">
        <div>
          <p className="pivot-tenant-curation__drop-label">Next drop</p>
          <p className="pivot-tenant-curation__drop-value">
            {drop?.nextDropFormatted || drop?.nextDropAt || '—'}
          </p>
        </div>
        <div className="pivot-tenant-curation__drop-meta">
          <span>
            Drop week <strong>{drop?.batchWeek || '—'}</strong>
          </span>
          <span>
            Target <strong>{batchWeek}</strong>
          </span>
          <span>
            <strong>{draftCount}</strong> draft · <strong>{stagedCount}</strong> staged ·{' '}
            <strong>{publishedCount}</strong> published
            {statusCounts?.other ? ` · ${statusCounts.other} other` : ''}
          </span>
          <span className="pivot-host-created-counts" title="Just Go Creator listings this week">
            <span className="pivot-host-created-counts__label">Host-created</span>
            <span>{formatHostCreatedCounts(hostCreatedCounts)}</span>
          </span>
        </div>
      </aside>

      <PivotReadinessCard
        readiness={readiness}
        loading={readinessLoading}
      />

      {activeRun ? (
        <div
          className={`pivot-tenant-curation__run-banner pivot-tenant-curation__run-banner--${activeRun.status}`}
          role="status"
        >
          <div>
            <strong>Crawl {activeRun.status}</strong>
            {activeRun.forceBatchWeek ? (
              <span> · forced into {activeRun.batchWeek}</span>
            ) : (
              <span> · by event date</span>
            )}
            {activeRun.stats ? (
              <span>
                {' '}
                · discovered {activeRun.stats.discovered ?? 0}, upserted{' '}
                {activeRun.stats.upserted ?? 0}, skipped {activeRun.stats.skipped ?? 0}, failed{' '}
                {activeRun.stats.failed ?? 0}
              </span>
            ) : null}
            {activeRun.stats?.byBatchWeek &&
            Object.keys(activeRun.stats.byBatchWeek).length > 0 ? (
              <span className="pivot-tenant-curation__run-msg">
                {' '}
                · weeks{' '}
                {Object.keys(activeRun.stats.byBatchWeek)
                  .sort()
                  .map((w) => `${w} (${activeRun.stats.byBatchWeek[w]})`)
                  .join(', ')}
              </span>
            ) : null}
            {activeRun.stats?.message ? (
              <span className="pivot-tenant-curation__run-msg"> — {activeRun.stats.message}</span>
            ) : null}
            {activeRun.error ? (
              <span className="pivot-tenant-curation__run-msg"> — {activeRun.error}</span>
            ) : null}
          </div>
          {(activeRun.status === 'completed' || activeRun.status === 'failed') && (
            <button
              type="button"
              className="linear-btn linear-btn--ghost"
              onClick={() => setActiveRunId(null)}
            >
              Dismiss
            </button>
          )}
        </div>
      ) : null}

      {/* Upstream of Saved jobs: discovery finds sources; Refresh all recrawls them. */}
      <PivotTenantSourcesPanel
        tenantKey={tenantKey}
        cityDisplayName={displayCity}
        catalogTags={catalogTags}
        onJobsChanged={refetchOps}
      />

      <section className="linear-section pivot-lab__section" aria-labelledby="curation-jobs">
        <div className="pivot-tenant-curation__collapse-bar">
          <button
            type="button"
            className="pivot-tenant-curation__collapse-toggle"
            onClick={() => setJobsExpanded((open) => !open)}
            aria-expanded={jobsExpanded}
          >
            <span className="pivot-tenant-curation__collapse-label">
              <span id="curation-jobs">Saved jobs · {committedWeek}</span>
              <span className="pivot-tenant-curation__collapse-meta">
                {jobsLoading
                  ? 'Loading…'
                  : `${jobs.length} job${jobs.length === 1 ? '' : 's'} · ${
                      runnableJobCount || 0
                    } runnable`}
              </span>
            </span>
            <span className="pivot-tenant-curation__collapse-chevron" aria-hidden="true">
              {jobsExpanded ? '▾' : '▸'}
            </span>
          </button>
          <div className="pivot-tenant-curation__jobs-actions">
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              disabled={
                batchStarting
                || batchRunning
                || !batchWeekValid
                || !weekSettled
                || Boolean(runInFlight)
                || !runnableJobCount
              }
              onClick={handleRunAllJobs}
              title="Recrawl saved jobs for this week. Discovery above finds new sources — it is not the weekly refresh."
            >
              {batchStarting
                ? 'Starting…'
                : batchRunning
                  ? 'Refreshing…'
                  : `Refresh all ${runnableJobCount || ''}`.trim()}
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={openCreateJob}
            >
              Add job
            </button>
          </div>
        </div>

        {jobsExpanded ? (
          <>
            <p className="pivot-lab__section-hint pivot-tenant-curation__collapse-hint">
              Weekly refresh: recrawl saved jobs for this week's catalog. Discovery above
              finds new sources — do not re-run it just to refresh Luma. “Run for week”
              targets <strong>{committedWeek}</strong>. By default each event lands in the ISO
              week of its start date. Enable “Force into review week” to pin everything to{' '}
              {committedWeek}.
            </p>

            {latestBatch ? (
              <div
                className={`pivot-tenant-curation__batch${
                  latestBatch.aborted ? ' pivot-tenant-curation__batch--warn' : ''
                }`}
              >
                <span className="pivot-tenant-curation__batch-orb" aria-hidden="true">
                  <OrbTint />
                  <ThinkingOrb
                    className="pivot-orb--brand"
                    state={orbStateFor(latestBatch, null)}
                    size={20}
                    theme={orbTheme}
                    paused={!batchRunning}
                  />
                </span>
                <span className="pivot-tenant-curation__batch-text">
                  {batchRunning ? (
                    <>
                      <strong>{phaseLabel(latestBatch.phase)}</strong>
                      {' — '}
                      {latestBatch.counters?.jobsRun || 0} of {latestBatch.plan?.jobs || 0}{' '}
                      source(s), {latestBatch.counters?.eventsUpserted || 0} event(s) saved
                    </>
                  ) : (
                    <>
                      <strong>Last refresh</strong>
                      {' — '}
                      {latestBatch.aborted
                        ? latestBatch.aborted.error
                        : `${latestBatch.counters?.eventsUpserted || 0} event(s) saved from ${
                            latestBatch.counters?.jobsRun || 0
                          } source(s)`}
                    </>
                  )}
                </span>
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost"
                  onClick={() => setBatchConsoleOpen(true)}
                >
                  {batchRunning ? 'Watch' : 'View'}
                </button>
              </div>
            ) : null}

            {jobsError ? <p className="pivot-lab__error">{jobsError}</p> : null}
            {jobsLoading ? (
              <p className="pivot-lab__empty">Loading jobs…</p>
            ) : jobs.length ? (
              <div className="pivot-lab__table-wrap">
                <table className="pivot-lab__table">
                  <thead>
                    <tr>
                      <th scope="col">Label</th>
                      <th scope="col">Provider</th>
                      <th scope="col">URL</th>
                      <th scope="col">Strategy</th>
                      <th scope="col">Last run</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr
                        key={job._id}
                        className={job.enabled === false ? 'is-disabled' : undefined}
                      >
                        <td>
                          <strong>{job.label}</strong>
                          {job.enabled === false ? (
                            <span className="pivot-lab__pill pivot-lab__pill--muted">
                              {' '}
                              Disabled
                            </span>
                          ) : null}
                        </td>
                        <td>{job.provider}</td>
                        <td className="pivot-tenant-curation__url-cell">
                          {job.url ? (
                            <a href={job.url} target="_blank" rel="noreferrer">
                              {job.url}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{job.defaultBatchWeekStrategy || 'next-drop'}</td>
                        <td>
                          {job.lastRunStatus ? (
                            <>
                              <RunStatusPill status={job.lastRunStatus} />{' '}
                              <span className="pivot-tenant-curation__muted">
                                {job.lastRunStats
                                  ? `${job.lastRunStats.upserted ?? 0}/${
                                      job.lastRunStats.discovered ?? 0
                                    }`
                                  : ''}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div className="pivot-tenant-curation__row-actions">
                            <button
                              type="button"
                              className="linear-btn linear-btn--primary"
                              disabled={
                                job.provider === 'manual-json'
                                || job.enabled === false
                                || !batchWeekValid
                                || !weekSettled
                                || busyKey === `job-run-${job._id}`
                                || Boolean(runInFlight)
                              }
                              onClick={() => handleRunJob(job)}
                            >
                              {busyKey === `job-run-${job._id}`
                                ? 'Starting…'
                                : `Run for ${committedWeek}`}
                            </button>
                            <button
                              type="button"
                              className="linear-btn linear-btn--ghost"
                              onClick={() => openEditJob(job)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="linear-btn linear-btn--ghost"
                              disabled={busyKey === `job-delete-${job._id}`}
                              onClick={() => handleDeleteJob(job)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="pivot-lab__empty">
                No saved jobs yet. Add a Partiful or Luma explore URL to crawl into this week.
              </p>
            )}

            {jobFormOpen ? (
              <div className="pivot-tenant-curation__job-form" role="region" aria-label="Job form">
                <h3 className="pivot-tenant-curation__job-form-title">
                  {editingJobId ? 'Edit job' : 'New job'}
                </h3>
                <div className="pivot-tenant-curation__job-form-grid">
                  <label className="linear-field">
                    <span className="linear-field__label">Label</span>
                    <input
                      className="linear-input"
                      value={jobForm.label}
                      onChange={(e) => setJobForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="Brooklyn Partiful explore"
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Provider</span>
                    <select
                      className="linear-input"
                      value={jobForm.provider}
                      onChange={(e) => setJobForm((f) => ({ ...f, provider: e.target.value }))}
                    >
                      {PROVIDER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="linear-field pivot-tenant-curation__job-form-span">
                    <span className="linear-field__label">URL</span>
                    <input
                      className="linear-input"
                      value={jobForm.url}
                      onChange={(e) => {
                        const nextUrl = e.target.value;
                        const detected = detectProviderFromUrl(nextUrl);
                        setJobForm((f) => ({
                          ...f,
                          url: nextUrl,
                          provider: detected || f.provider,
                        }));
                      }}
                      placeholder="https://partiful.com/explore/…"
                      disabled={jobForm.provider === 'manual-json'}
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Week strategy</span>
                    <select
                      className="linear-input"
                      value={jobForm.defaultBatchWeekStrategy}
                      onChange={(e) =>
                        setJobForm((f) => ({
                          ...f,
                          defaultBatchWeekStrategy: e.target.value,
                        }))
                      }
                    >
                      {STRATEGY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="linear-field pivot-tenant-curation__check">
                    <input
                      type="checkbox"
                      checked={jobForm.enabled}
                      onChange={(e) => setJobForm((f) => ({ ...f, enabled: e.target.checked }))}
                    />
                    <span>Enabled</span>
                  </label>
                  <div className="linear-field pivot-tenant-curation__job-form-span">
                    <span className="linear-field__label">Default tags</span>
                    <PivotTagMultiSelect
                      catalogTags={catalogTags}
                      selectedSlugs={jobForm.defaultTags}
                      onChange={(tags) => setJobForm((f) => ({ ...f, defaultTags: tags }))}
                      compact
                      showLabel={false}
                    />
                  </div>
                </div>
                <div className="pivot-tenant-curation__row-actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--primary"
                    onClick={handleSaveJob}
                    disabled={Boolean(busyKey?.startsWith('job-'))}
                  >
                    {busyKey === 'job-create' || busyKey?.startsWith('job-save-')
                      ? 'Saving…'
                      : 'Save job'}
                  </button>
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost"
                    onClick={() => {
                      setJobFormOpen(false);
                      setEditingJobId(null);
                    }}
                  >
                    Cancel
                  </button>
                  {!catalogTags.length ? (
                    <button
                      type="button"
                      className="linear-btn linear-btn--ghost"
                      onClick={async () => {
                        await authenticatedRequest('/admin/pivot/tags/seed', {
                          method: 'POST',
                          data: {},
                        });
                        refetchTags();
                      }}
                    >
                      Seed tag catalog
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="linear-section pivot-lab__section" aria-labelledby="curation-manual">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="curation-manual" className="linear-section__title">
              Manual add · {committedWeek}
            </h2>
            <p className="pivot-lab__section-hint">
              Import tools for the current batch week: paste a single event URL, load a catalog JSON
              export from another Curation panel, import agent JSON, or open the manual form.
              Unless “Force into review week” is on, events land in the week of their start date.
            </p>
          </div>
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={() => setManualImportOpen(true)}
          >
            Manual form
          </button>
        </div>
        <div className="pivot-tenant-curation__url-row">
          <input
            className="linear-input"
            value={urlImportValue}
            onChange={(e) => setUrlImportValue(e.target.value)}
            placeholder="https://partiful.com/e/… or explore URL"
            aria-label="Event or explore URL"
          />
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={handleUrlImport}
            disabled={!urlImportValue.trim() || urlImportLoading || !batchWeekValid}
          >
            {urlImportLoading ? 'Working…' : 'Import URL'}
          </button>
        </div>
        <PivotJsonImportPanel
          tenantKey={tenantKey}
          batchWeek={committedWeek}
          forceBatchWeek={forceBatchWeek}
          disabled={!committedWeekValid || !weekSettled || !tenantKey}
          mode="stage"
          onBeforeStage={() => setBatchWeek(committedWeek, { immediate: true })}
          onStaged={handleJsonStaged}
        />
      </section>

      {stageLandHint ? (
        <div
          className="pivot-tenant-curation__run-banner pivot-tenant-curation__run-banner--failed"
          role="status"
        >
          <div>
            <strong>Staged events are in other batch weeks</strong>
            <span className="pivot-tenant-curation__run-msg">
              {' '}
              {stageLandHint.totalStaged} event(s) landed by start date:{' '}
              {Object.keys(stageLandHint.batchWeekCounts)
                .sort()
                .map((week) => (
                  <button
                    key={week}
                    type="button"
                    className="linear-btn linear-btn--ghost pivot-tenant-curation__week-link"
                    onClick={() => {
                      setBatchWeek(week, { immediate: true });
                      setStageLandHint(null);
                    }}
                  >
                    {week} ({stageLandHint.batchWeekCounts[week]})
                  </button>
                ))}
              . Enable “Force into review week” before staging to pin everything to {committedWeek}.
            </span>
          </div>
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={() => setStageLandHint(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
        </>
      ) : null}

      {committedWeekValid ? (
        <PivotCurationQueue
          batchWeek={batchWeek}
          events={filteredEvents}
          eventsLoading={eventsLoading}
          eventsError={eventsError}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          filter={filter}
          onFilterChange={setFilter}
          filterOptions={FILTER_OPTIONS}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          hostCreatedCount={hostCreatedCount}
          catalogTags={catalogTags}
          bulkTags={bulkTags}
          onBulkTagsChange={setBulkTags}
          showPerformance={isMonitorStage}
          performanceById={performanceById}
          busyKey={busyKey}
          releaseDisabled={releaseDisabled}
          releaseBlockReason={releaseBlockReason}
          onEdit={setEditingEvent}
          onPublish={handleReleaseOne}
          onUnpublish={handleUnpublishOne}
          onDelete={handleDeleteEvent}
          onBulkStage={handleBulkStage}
          onBulkPublish={handleBulkRelease}
          onBulkUnpublish={handleBulkUnpublish}
          onBulkApplyTags={handleBulkApplyTags}
          onBulkSuggestTags={handleBulkSuggestTags}
          emptyLabel={
            events.length
              ? 'No events match this filter.'
              : 'No catalog events for this city and week yet. Run a job or add manually.'
          }
        />
      ) : null}


      <Popup
        isOpen={purgeOpen}
        onClose={closePurgePopup}
        customClassName="pivot-curation-purge-popup"
        disableOutsideClick={purgingCatalog || purgingOutOfWeek}
      >
        <div className="pivot-curation-purge">
          <h2 className="pivot-curation-purge__title">Purge catalog week</h2>
          <p className="pivot-curation-purge__lead">
            Permanently deletes catalog events, attendee intents, event feedback, analytics, and the
            stored weekly snapshot for <strong>{displayCity}</strong> ·{' '}
            <strong>{committedWeek}</strong>. Referral codes and interview notes are kept. This
            cannot be undone.
          </p>
          {outOfWeekCount > 0 ? (
            <p className="pivot-curation-purge__lead pivot-curation-purge__lead--warn">
              <strong>{outOfWeekCount}</strong> event(s) in {committedWeek} have start dates outside{' '}
              {weekRangeLabel} — often from forcing into the review week. You can purge those
              without touching in-range events.
            </p>
          ) : null}
          <label className="linear-field">
            <span className="linear-field__label">Type {PURGE_CONFIRM_TOKEN} to confirm</span>
            <input
              className="linear-input"
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder={PURGE_CONFIRM_TOKEN}
              autoComplete="off"
              disabled={purgingCatalog || purgingOutOfWeek}
            />
          </label>
          <div className="pivot-curation-purge__actions">
            <button
              type="button"
              className="linear-btn linear-btn--ghost"
              onClick={closePurgePopup}
              disabled={purgingCatalog || purgingOutOfWeek}
            >
              Cancel
            </button>
            <button
              type="button"
              className="linear-btn pivot-lab__purge-btn"
              onClick={handlePurgeOutOfWeek}
              disabled={
                purgingOutOfWeek ||
                purgingCatalog ||
                !weekSettled ||
                outOfWeekCount === 0
              }
              title={
                outOfWeekCount === 0
                  ? `No events outside ${weekRangeLabel}`
                  : `Delete ${outOfWeekCount} event(s) outside ${weekRangeLabel}`
              }
            >
              {purgingOutOfWeek
                ? 'Purging…'
                : `Out of range (${outOfWeekCount})`}
            </button>
            <button
              type="button"
              className="linear-btn pivot-lab__purge-btn"
              onClick={handlePurgeCatalog}
              disabled={
                purgingCatalog ||
                purgingOutOfWeek ||
                !weekSettled ||
                purgeConfirm.trim() !== PURGE_CONFIRM_TOKEN
              }
            >
              {purgingCatalog
                ? 'Purging…'
                : `Purge ${committedWeek}`}
            </button>
          </div>
        </div>
      </Popup>

      <PivotCatalogEventEditModal
        open={Boolean(editingEvent)}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        catalogTags={catalogTags}
        cityLabel={displayCity}
        batchWeek={batchWeek}
        onSave={handleSaveCatalogEdit}
        saving={editSaving}
        onSuggestTags={suggestTagsForEdit}
        tagSuggestLoading={tagSuggestLoadingKey === 'edit'}
      />

      <PivotManualImportModal
        open={manualImportOpen}
        onClose={() => setManualImportOpen(false)}
        catalogTags={catalogTags}
        cityLabel={displayCity}
        batchWeek={batchWeek}
        selectedTenantKey={tenantKey}
        stickyDefaults={manualImportSticky}
        onStickyChange={setManualImportSticky}
        onAddToBatch={() => {
          addNotification({
            title: 'Use Stage',
            message: 'On the tenant Curation page, stage events directly with Stage.',
            type: 'info',
          });
        }}
        onPublish={handlePublishManualImport}
        publishLoading={manualImportPublishLoading}
        onSuggestTags={suggestTagsForManualImport}
        tagSuggestLoading={tagSuggestLoadingKey === 'manual-import'}
      />

      <Popup
        isOpen={batchConsoleOpen}
        onClose={() => setBatchConsoleOpen(false)}
        customClassName="pivot-discovery-popup"
      >
        <PivotDiscoveryConsole
          tenantKey={tenantKey}
          kind="curation-batch"
          cityDisplayName={displayCity}
          handleClose={() => setBatchConsoleOpen(false)}
        />
      </Popup>
    </PivotTenantPage>
  );
}

export default PivotTenantCurationPage;
