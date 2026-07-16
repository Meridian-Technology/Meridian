import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { useDashboard } from '../../../contexts/DashboardContext';
import {
  toIsoWeek,
  isValidIsoWeek,
  shiftIsoWeek,
  formatEventWhen,
  formatBatchWeekRange,
  resolveCurationStageWeeks,
  resolveCurationStageForWeek,
  CURATION_STAGE_META,
} from '../../../utils/pivotIsoWeek';
import IngestStatusPill from '../PivotLab/IngestStatusPill';
import PivotImportThumb from '../PivotLab/PivotImportThumb';
import PivotTagMultiSelect from '../PivotLab/PivotTagMultiSelect';
import PivotManualImportModal, {
  manualDraftToImportEntry,
} from '../PivotLab/PivotManualImportModal';
import PivotCatalogEventEditModal, {
  catalogEditDraftToOverrides,
} from '../PivotLab/PivotCatalogEventEditModal';
import PivotReadinessCard from './PivotReadinessCard';
import PivotCurationMonitorPanel from './PivotCurationMonitorPanel';
import PivotTenantPage from './PivotTenantPage';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import PivotTenantExplorePanel from './PivotTenantExplorePanel';
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
const MONITOR_EVENTS_LIMIT = 100;
const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'staged', label: 'Staged' },
  { value: 'untagged', label: 'Untagged' },
  { value: 'missing-host', label: 'Missing host' },
  { value: 'film', label: 'Film / showtimes' },
];

const PROVIDER_OPTIONS = [
  { value: 'partiful', label: 'Partiful' },
  { value: 'luma', label: 'Luma' },
  { value: 'manual-json', label: 'Manual JSON' },
];

const STRATEGY_OPTIONS = [
  { value: 'next-drop', label: 'Next drop week' },
  { value: 'current-iso', label: 'Current ISO week' },
  { value: 'explicit', label: 'Explicit (pass on run)' },
];

function formatEventTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return '—';
  return tags.join(', ');
}

function eventMatchesFilter(event, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'draft') return event.ingestStatus === 'draft';
  if (filter === 'staged') return event.ingestStatus === 'staged';
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
  const { showOverlay } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlBatchWeek = searchParams.get('batchWeek');
  const urlFilter = searchParams.get('filter') || 'all';

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
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkTags, setBulkTags] = useState([]);
  const [busyKey, setBusyKey] = useState(null);
  const [activeRunId, setActiveRunId] = useState(null);
  const [jobFormOpen, setJobFormOpen] = useState(false);
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
  const initializedWeekRef = useRef(false);

  // Keep committed week / filter bookmarkable (preserve page=1). Drop legacy stage= param.
  useEffect(() => {
    const desiredFilter = filter && filter !== 'all' ? filter : null;
    const currentFilter = searchParams.get('filter');
    const currentWeek = searchParams.get('batchWeek');
    const pageOk = searchParams.get('page') === '1';
    const weekOk = !committedWeekValid || currentWeek === committedWeek;
    const filterOk = desiredFilter ? currentFilter === desiredFilter : !currentFilter;
    const stageCleared = !searchParams.get('stage');
    if (pageOk && weekOk && filterOk && stageCleared) return;

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', '1');
        next.delete('stage');
        if (committedWeekValid) next.set('batchWeek', committedWeek);
        if (desiredFilter) next.set('filter', desiredFilter);
        else next.delete('filter');
        return next;
      },
      { replace: true },
    );
  }, [committedWeek, committedWeekValid, filter, searchParams, setSearchParams]);

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
  }, [urlBatchWeek, urlFilter, setBatchWeek]);

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
  const performanceLoading = opsLoading && isMonitorStage && !ops?.performance;
  const performanceError = ops?.performance?.error || null;

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
  const eventsLoading = opsLoading && canPublishCatalog && !ops?.catalog;
  const eventsError = ops?.catalog?.error || null;

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

  const catalogTags = tagsResponse?.success
    ? (tagsResponse.data?.tags ?? EMPTY_LIST)
    : EMPTY_LIST;
  const activeRun = runResponse?.success ? runResponse.data?.run : null;

  const filteredEvents = useMemo(
    () => events.filter((event) => eventMatchesFilter(event, filter)),
    [events, filter],
  );

  const reviewEvents = useMemo(
    () =>
      filteredEvents.filter(
        (event) => event.ingestStatus === 'draft' || event.ingestStatus === 'staged',
      ),
    [filteredEvents],
  );

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

  // Clear selection when week/filter changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [batchWeek, filter, tenantKey]);

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

  const toggleSelected = useCallback((eventId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const toggleSelectAllReview = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === reviewEvents.length && reviewEvents.length > 0) {
        return new Set();
      }
      return new Set(reviewEvents.map((e) => e._id));
    });
  }, [reviewEvents]);

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
    setEditingJobId(null);
    setJobForm(emptyJobForm());
    setJobFormOpen(true);
  }, []);

  const openEditJob = useCallback((job) => {
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
        message: 'Partiful and Luma jobs need an explore/discover URL.',
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
    [addNotification, committedWeek, editingEvent, patchEventOverrides, refreshAll, tenantKey],
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
  const selectedStagedCount = useMemo(
    () => selectedEvents.filter((event) => event.ingestStatus === 'staged').length,
    [selectedEvents],
  );
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

  return (
    <PivotTenantPage
      title="Curation"
      tenantKey={tenantKey}
      cityDisplayName={displayCity}
    //   subtitle={stageMeta.description}
      className="pivot-tenant-curation"
      actions={
        <>
          <button
            type="button"
            className="linear-btn linear-btn--ghost pivot-tenant-kbd-btn"
            onClick={refreshAll}
            disabled={overviewLoading || (canPublishCatalog && (eventsLoading || jobsLoading))}
          >
            Refresh
            <KeybindTooltip label="Refresh" keybind="R" />
          </button>
          {canPublishCatalog ? (
            <>
              <label
                className="pivot-tenant-curation__check"
                title="When off, crawl and manual ingest assign each event to the ISO week of its start date. When on, every event is pinned to the review week."
              >
                <input
                  type="checkbox"
                  checked={forceBatchWeek}
                  onChange={(e) => setForceBatchWeek(e.target.checked)}
                />
                <span>Force into review week</span>
              </label>
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
            </>
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

      {!batchWeekValid ? (
        <p className="pivot-lab__error">Enter a valid batch week (YYYY-Www).</p>
      ) : null}

      {isMonitorStage ? (
        <PivotCurationMonitorPanel
          stage={stage}
          batchWeek={batchWeek}
          weekRangeLabel={weekRangeLabel}
          dropLabel={dropLabel}
          overview={overview}
          overviewLoading={overviewLoading}
          journey={journey}
          journeyLoading={journeyLoading}
          performanceEvents={performanceEvents}
          performanceLoading={performanceLoading}
          performanceError={performanceError}
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

      <section className="linear-section pivot-lab__section" aria-labelledby="curation-jobs">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="curation-jobs" className="linear-section__title">
              Saved jobs
            </h2>
            <p className="pivot-lab__section-hint">
              Persist Partiful/Luma explore URLs. By default each discovered event lands in the
              ISO week of its start date (one crawl can fill many weeks). Enable “Force into
              review week” to pin everything to the week above.
            </p>
          </div>
          <button type="button" className="linear-btn linear-btn--secondary" onClick={openCreateJob}>
            Add job
          </button>
        </div>

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
                  <tr key={job._id} className={job.enabled === false ? 'is-disabled' : undefined}>
                    <td>
                      <strong>{job.label}</strong>
                      {job.enabled === false ? (
                        <span className="pivot-lab__pill pivot-lab__pill--muted"> Disabled</span>
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
                              ? `${job.lastRunStats.upserted ?? 0}/${job.lastRunStats.discovered ?? 0}`
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
                            job.provider === 'manual-json' ||
                            job.enabled === false ||
                            !batchWeekValid ||
                            !weekSettled ||
                            busyKey === `job-run-${job._id}` ||
                            Boolean(runInFlight)
                          }
                          onClick={() => handleRunJob(job)}
                        >
                          {busyKey === `job-run-${job._id}` ? 'Starting…' : 'Run for week'}
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
                    setJobForm((f) => ({ ...f, defaultBatchWeekStrategy: e.target.value }))
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
      </section>

      <section className="linear-section pivot-lab__section" aria-labelledby="curation-manual">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="curation-manual" className="linear-section__title">
              Manual add
            </h2>
            <p className="pivot-lab__section-hint">
              Paste a single event URL, or open the manual form for JSON-free entry.
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
      </section>

      <section className="linear-section pivot-lab__section" aria-labelledby="curation-queue">
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="curation-queue" className="linear-section__title">
              Review queue · {batchWeek}
            </h2>
            <p className="pivot-lab__section-hint">
              Draft and staged events for this review week. Crawl/manual ingest assign by event
              date unless forced — switch weeks to review other batches from the same crawl.
            </p>
          </div>
          <label className="linear-field">
            <span className="linear-field__label">Filter</span>
            <select
              className="linear-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {stagedCount > 0 ? (
          <p
            className={`pivot-tenant-curation__release-hint${
              releaseBlockReason ? ' pivot-tenant-curation__release-hint--blocked' : ''
            }`}
            role="status"
          >
            {releaseBlockReason ||
              `${stagedCount} staged — publish to make events visible in the app feed.`}
          </p>
        ) : null}

        <div className="pivot-tenant-curation__bulk">
          <label className="pivot-tenant-curation__check">
            <input
              type="checkbox"
              checked={
                reviewEvents.length > 0 && selectedIds.size === reviewEvents.length
              }
              onChange={toggleSelectAllReview}
              disabled={!reviewEvents.length}
            />
            <span>
              Select all review ({selectedIds.size}/{reviewEvents.length})
            </span>
          </label>
          <div className="pivot-tenant-curation__bulk-tags">
            <PivotTagMultiSelect
              catalogTags={catalogTags}
              selectedSlugs={bulkTags}
              onChange={setBulkTags}
              compact
              showLabel={false}
            />
          </div>
          <div className="pivot-tenant-curation__row-actions">
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={handleBulkApplyTags}
              disabled={!selectedIds.size || busyKey === 'bulk-tags'}
            >
              {busyKey === 'bulk-tags' ? 'Applying…' : 'Apply tags'}
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={handleBulkSuggestTags}
              disabled={!selectedIds.size || busyKey === 'bulk-suggest'}
            >
              {busyKey === 'bulk-suggest' ? 'Suggesting…' : 'Suggest tags'}
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={handleBulkStage}
              disabled={!selectedIds.size || busyKey === 'bulk-stage'}
            >
              {busyKey === 'bulk-stage' ? 'Staging…' : 'Stage selected'}
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={handleBulkRelease}
              disabled={
                !selectedStagedCount ||
                releaseDisabled ||
                busyKey === 'bulk-release'
              }
              title={
                selectedStagedCount === 0
                  ? 'Select staged events to publish'
                  : releaseBlockReason || `Publish ${selectedStagedCount} selected staged event(s)`
              }
            >
              {busyKey === 'bulk-release'
                ? 'Publishing…'
                : `Publish selected (${selectedStagedCount})`}
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={handleRelease}
              disabled={releaseDisabled}
              title={releaseBlockReason || `Publish all ${stagedCount} staged event(s)`}
            >
              {releaseBusy ? 'Publishing…' : `Publish all staged (${stagedCount})`}
            </button>
          </div>
        </div>

        {eventsError ? <p className="pivot-lab__error">{eventsError}</p> : null}
        {eventsLoading ? (
          <p className="pivot-lab__empty">Loading catalog…</p>
        ) : filteredEvents.length ? (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Select</span>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Image</span>
                  </th>
                  <th scope="col">Event</th>
                  <th scope="col">Batch</th>
                  <th scope="col">Organizer</th>
                  <th scope="col">When</th>
                  <th scope="col">Tags</th>
                  <th scope="col">Status</th>
                  <th scope="col">Source</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => {
                  const selectable =
                    event.ingestStatus === 'draft' || event.ingestStatus === 'staged';
                  return (
                    <tr key={event._id}>
                      <td>
                        {selectable ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(event._id)}
                            onChange={() => toggleSelected(event._id)}
                            aria-label={`Select ${event.name}`}
                          />
                        ) : null}
                      </td>
                      <td className="pivot-lab__thumb-cell">
                        {event.externalLink || event.sourceUrl ? (
                          <a
                            className="pivot-lab__thumb-link"
                            href={event.externalLink || event.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open source listing"
                          >
                            <PivotImportThumb src={event.image} alt={event.name} />
                          </a>
                        ) : (
                          <PivotImportThumb src={event.image} alt={event.name} />
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="pivot-lab__event-name-btn"
                          onClick={() => setEditingEvent(event)}
                        >
                          {event.name}
                        </button>
                      </td>
                      <td>
                        <span className="pivot-tenant-curation__batch-pill">
                          {event.batchWeek || '—'}
                        </span>
                      </td>
                      <td>{event.organizerName || '—'}</td>
                      <td>{formatEventWhen(event.start_time)}</td>
                      <td>{formatEventTags(event.tags)}</td>
                      <td>
                        <IngestStatusPill status={event.ingestStatus} />
                      </td>
                      <td>{event.source || '—'}</td>
                      <td>
                        <div className="pivot-tenant-curation__row-actions">
                          <button
                            type="button"
                            className="linear-btn linear-btn--ghost pivot-lab__edit-btn"
                            onClick={() => setEditingEvent(event)}
                          >
                            Edit
                          </button>
                          {event.ingestStatus === 'staged' ? (
                            <button
                              type="button"
                              className="linear-btn linear-btn--primary pivot-lab__edit-btn"
                              onClick={() => handleReleaseOne(event)}
                              disabled={releaseDisabled || busyKey === `release-${event._id}`}
                              title={
                                releaseBlockReason || 'Publish this staged event to the live feed'
                              }
                            >
                              {busyKey === `release-${event._id}` ? 'Publishing…' : 'Publish'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="pivot-lab__empty">
            {events.length
              ? 'No events match this filter.'
              : 'No catalog events for this city and week yet. Run a job or add manually.'}
          </p>
        )}
      </section>
        </>
      ) : null}

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
    </PivotTenantPage>
  );
}

export default PivotTenantCurationPage;
