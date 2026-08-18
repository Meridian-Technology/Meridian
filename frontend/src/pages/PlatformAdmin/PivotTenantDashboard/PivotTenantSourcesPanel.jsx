import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import useAdminDashboardTheme from '../../../hooks/useAdminDashboardTheme';
import PivotTagMultiSelect from '../PivotLab/PivotTagMultiSelect';
import Popup from '../../../components/Popup/Popup';
import PivotDiscoveryConsole, {
  orbStateFor,
  formatClock,
  phaseLabel,
  OrbTint,
} from './PivotDiscoveryConsole';
import './PivotTenantSourcesPanel.scss';

const NO_FETCH_CACHE = { enabled: false };
const EMPTY_LIST = [];

/** Discovery runs in the background, so the registry is polled while one is in flight. */
const POLL_MS = 4000;
/**
 * Cadence for checking whether a run exists at all while none is known to be in
 * flight. Slow, but not never: a run can be started from another tab, by the CLI,
 * or eventually by a scheduler, and the panel should not claim the city is idle
 * just because *this* page did not start the work.
 */
const IDLE_POLL_MS = 30000;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'rejected', label: 'Rejected' },
];

const REJECTION_LABELS = {
  'no-events': 'No events on page',
  'below-threshold': 'Too few events',
  'scrape-failed': 'Scrape failed',
  'no-index-page': 'No calendar page',
  'blocked-host': 'Blocked host',
};

const FLOW_OPTIONS = [
  {
    value: 'native-then-firecrawl',
    label: 'Native, then websites',
    hint: 'Crawl Luma and Partiful natively, then Firecrawl search. Those hosts are dropped from results — search queries still cost credits.',
  },
  {
    value: 'native-only',
    label: 'Native only',
    hint: 'Luma and Partiful city indexes only — no Firecrawl search, $0 credits.',
  },
  {
    value: 'firecrawl-only',
    label: 'Websites only',
    hint: 'Firecrawl search for venue calendars; skip the native bootstrap',
  },
];

function defaultOptions() {
  return {
    tags: [],
    maxCandidates: 20,
    minEvents: 1,
    createJobs: true,
    recheckRejected: false,
    flow: 'native-then-firecrawl',
    lumaSlug: '',
    partifulSlug: '',
  };
}

function formatAgo(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function SourceStatusCell({ source }) {
  if (source.status === 'qualified') {
    return <span className="pivot-lab__pill pivot-lab__pill--ok">Qualified</span>;
  }
  return (
    <span
      className="pivot-lab__pill pivot-lab__pill--muted"
      title={source.rejectedReason || undefined}
    >
      {REJECTION_LABELS[source.rejectedReason] || 'Rejected'}
    </span>
  );
}

/**
 * Autonomous source discovery for a city.
 *
 * Discovery finds and registers sources (native indexes first, then venue
 * sites). It sits upstream of Saved jobs. A qualifying scrape already returns
 * the whole page, so a run publishes those events itself and the job it creates
 * is the weekly refresh mechanism — recrawl those jobs with Refresh all, do not
 * re-run discovery expecting a Luma update. Rejected hosts are shown too —
 * they are the reason a second run is cheaper than the first, and hiding them
 * would make the registry look like it had simply missed things.
 */
function PivotTenantSourcesPanel({ tenantKey, cityDisplayName, catalogTags = EMPTY_LIST, onJobsChanged }) {
  const { addNotification } = useNotification();
  const { isDark } = useAdminDashboardTheme();
  const orbTheme = isDark ? 'dark' : 'light';
  const [statusFilter, setStatusFilter] = useState('all');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sitesExpanded, setSitesExpanded] = useState(false);
  const [options, setOptions] = useState(defaultOptions);
  const [starting, setStarting] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [consoleRunId, setConsoleRunId] = useState(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** Completion is announced once per run, whoever notices it first. */
  const notifiedRunIdRef = useRef(null);
  const previousRunRef = useRef(null);
  const hydratedFlowRef = useRef(false);

  const sourcesUrl = tenantKey
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/sources`
    : null;
  const sourcesParams = useMemo(
    () => (statusFilter === 'all' ? undefined : { status: statusFilter }),
    [statusFilter],
  );
  const {
    data: sourcesResponse,
    loading: sourcesLoading,
    error: sourcesError,
    refetch: refetchSources,
  } = useFetch(sourcesUrl, { params: sourcesParams, cache: NO_FETCH_CACHE });

  /**
   * Whether a run is in flight is the server's fact, not this component's.
   *
   * It used to be local state set when you pressed the button, which meant a
   * refresh, a second tab, or a run started from the CLI all showed an idle panel
   * while the work was actually churning. Steps are excluded: this poll only needs
   * status, phase, and counters.
   */
  const latestRunUrl = tenantKey
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/discovery-runs/latest`
    : null;
  const { data: latestRunResponse, refetch: refetchLatestRun } = useFetch(latestRunUrl, {
    cache: NO_FETCH_CACHE,
  });
  const latestRun = latestRunResponse?.success ? latestRunResponse.data?.run : null;
  const running = latestRun?.status === 'running';

  // The plan is resolved server-side so the ceiling shown here comes from the
  // same seed logic the run will use.
  const planUrl = tenantKey
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/sources/discovery-plan`
    : null;
  const planParams = useMemo(
    () => ({
      ...(options.tags.length ? { tags: options.tags.join(',') } : {}),
      maxCandidates: options.maxCandidates,
      minEvents: options.minEvents,
      flow: options.flow,
      ...(options.lumaSlug ? { lumaSlug: options.lumaSlug } : {}),
      ...(options.partifulSlug ? { partifulSlug: options.partifulSlug } : {}),
    }),
    [
      options.maxCandidates,
      options.minEvents,
      options.tags,
      options.flow,
      options.lumaSlug,
      options.partifulSlug,
    ],
  );
  const { data: planResponse } = useFetch(planUrl, {
    params: planParams,
    cache: NO_FETCH_CACHE,
  });

  const sources = sourcesResponse?.success
    ? (sourcesResponse.data?.sources ?? EMPTY_LIST)
    : EMPTY_LIST;
  const plan = planResponse?.success ? planResponse.data?.plan : null;
  const planError = planResponse && !planResponse.success ? planResponse.message : null;

  useEffect(() => {
    if (!plan || hydratedFlowRef.current) return;
    hydratedFlowRef.current = true;
    setOptions((prev) => ({
      ...prev,
      flow: plan.flow || prev.flow,
      lumaSlug: plan.lumaSlug || prev.lumaSlug,
      partifulSlug: plan.partifulSlug || prev.partifulSlug,
    }));
  }, [plan]);

  const counts = useMemo(() => {
    let qualified = 0;
    let rejected = 0;
    let events = 0;
    for (const source of sources) {
      if (source.status === 'qualified') {
        qualified += 1;
        events += source.lastEventCount || 0;
      } else {
        rejected += 1;
      }
    }
    return { qualified, rejected, events };
  }, [sources]);

  // Progress comes from the run record rather than the registry, which only gains
  // rows at the very end and so reads as "nothing happening" for most of a run.
  const runCounters = latestRun?.counters || {};
  const runCallsMade =
    (runCounters.searches || 0) + (runCounters.maps || 0) + (runCounters.scrapes || 0);
  const runElapsed = latestRun?.startedAt
    ? (latestRun.finishedAt ? Date.parse(latestRun.finishedAt) : now) -
      Date.parse(latestRun.startedAt)
    : 0;

  useEffect(() => {
    if (!latestRunUrl) return undefined;
    const timer = setInterval(
      () => {
        refetchLatestRun();
        if (running) refetchSources();
      },
      running ? POLL_MS : IDLE_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [latestRunUrl, refetchLatestRun, refetchSources, running]);

  // Only ticks while something is in flight; the elapsed clock is the one thing
  // here that has to move on its own.
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  // Newly created curation jobs only show up in Saved jobs after the parent
  // refetches, so nudge it as the registry grows.
  useEffect(() => {
    if (!running) return;
    onJobsChanged?.();
  }, [counts.qualified, onJobsChanged, running]);

  const handleDiscover = useCallback(async () => {
    if (!tenantKey) return;

    setStarting(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/sources/discover`,
      {
        method: 'POST',
        data: {
          tags: options.tags.length ? options.tags : undefined,
          maxCandidates: options.maxCandidates,
          minEvents: options.minEvents,
          createJobs: options.createJobs,
          recheckRejected: options.recheckRejected,
          flow: options.flow,
          lumaSlug: options.lumaSlug || undefined,
          partifulSlug: options.partifulSlug || undefined,
        },
      },
    );
    setStarting(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Discovery failed to start',
        message: error || data?.message || 'Could not start source discovery.',
        type: 'error',
      });
      return;
    }

    setOptionsOpen(false);
    refetchSources();
    // The run document exists before this response returns, so the banner appears
    // on the next poll without needing an optimistic guess here.
    refetchLatestRun();

    // Open the console rather than announcing the run: watching the decisions is
    // the point on an unproven city, and a toast cannot show them.
    setConsoleRunId(data.data?.runId || null);
    setConsoleOpen(true);
  }, [addNotification, options, refetchLatestRun, refetchSources, tenantKey]);

  const toggleEnabled = useCallback(
    async (source) => {
      if (!tenantKey) return;
      const { data, error } = await authenticatedRequest(
        `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/sources/${encodeURIComponent(source._id)}`,
        { method: 'PATCH', data: { enabled: source.enabled === false } },
      );
      if (error || !data?.success) {
        addNotification({
          title: 'Update failed',
          message: error || data?.message || 'Could not update source.',
          type: 'error',
        });
        return;
      }
      refetchSources();
    },
    [addNotification, refetchSources, tenantKey],
  );

  const handleSaveConfig = useCallback(async () => {
    if (!tenantKey) return;
    setSavingConfig(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/sources/discovery-config`,
      {
        method: 'PATCH',
        data: {
          flow: options.flow,
          lumaSlug: options.lumaSlug || null,
          partifulSlug: options.partifulSlug || null,
        },
      },
    );
    setSavingConfig(false);
    if (error || !data?.success) {
      addNotification({
        title: 'Could not save discovery flow',
        message: error || data?.message || 'The city flow was not updated.',
        type: 'error',
      });
      return;
    }
    addNotification({
      title: 'Discovery flow saved',
      message: 'This city will use that pipeline on the next run.',
      type: 'success',
    });
  }, [addNotification, options.flow, options.lumaSlug, options.partifulSlug, tenantKey]);

  const notConfigured = Boolean(plan) && plan.runFirecrawl !== false && plan.configured === false;
  const nativeWarning = Boolean(plan) && plan.nativeWarning;

  const handleRunFinished = useCallback(
    (run) => {
      if (!run?._id || notifiedRunIdRef.current === run._id) return;
      notifiedRunIdRef.current = run._id;

      // A rehearsal touches neither the registry nor the jobs, so refetching or
      // reporting counts would be misleading.
      if (run.rehearsal) {
        addNotification({
          title: 'Rehearsal complete',
          message: 'Nothing was fetched or saved. Add a Firecrawl key to run it for real.',
          type: 'info',
        });
        return;
      }

      refetchSources();
      onJobsChanged?.();
      addNotification({
        title: run?.aborted ? 'Discovery stopped early' : 'Discovery finished',
        message: run?.aborted
          ? run.aborted.error
          : `${run?.counters?.qualified || 0} source(s) registered and ${
              run?.counters?.eventsUpserted || 0
            } event(s) saved from ${run?.counters?.evaluated || 0} site(s) checked.`,
        type: run?.aborted ? 'warning' : 'success',
      });
    },
    [addNotification, onJobsChanged, refetchSources],
  );

  // Catches a run finishing while the console is shut, which is the common case
  // now that the panel knows about runs it did not start.
  useEffect(() => {
    const previous = previousRunRef.current;
    previousRunRef.current = latestRun ? { _id: latestRun._id, status: latestRun.status } : null;

    if (!latestRun || !previous) return;
    if (previous._id === latestRun._id && previous.status === 'running' && !running) {
      handleRunFinished(latestRun);
    }
  }, [handleRunFinished, latestRun, running]);

  const openConsole = useCallback((runIdToShow = null) => {
    setConsoleRunId(runIdToShow);
    setConsoleOpen(true);
  }, []);

  const handleRehearse = useCallback(async () => {
    if (!tenantKey) return;

    setStarting(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/sources/rehearse`,
      {
        method: 'POST',
        data: {
          tags: options.tags.length ? options.tags : undefined,
          maxCandidates: options.maxCandidates,
        },
      },
    );
    setStarting(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Rehearsal failed to start',
        message: error || data?.message || 'Could not start a rehearsal.',
        type: 'error',
      });
      return;
    }

    setOptionsOpen(false);
    refetchLatestRun();
    setConsoleRunId(data.data?.runId || null);
    setConsoleOpen(true);
  }, [addNotification, options, refetchLatestRun, tenantKey]);

  const handleStop = useCallback(async () => {
    if (!tenantKey || !latestRun?._id || !running) return;

    setStopping(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/discovery-runs/${encodeURIComponent(
        latestRun._id,
      )}/stop`,
      { method: 'POST' },
    );
    setStopping(false);

    if (error || !data?.success) {
      addNotification({
        title: 'Could not stop agent',
        message: error || data?.message || 'Stop request failed.',
        type: 'error',
      });
      return;
    }

    refetchLatestRun();
  }, [addNotification, latestRun?._id, refetchLatestRun, running, tenantKey]);

  return (
    <section className="linear-section pivot-lab__section pivot-sources" aria-labelledby="curation-sources">
      <div
        className={`pivot-sources__agent${running ? ' pivot-sources__agent--live' : ''}`}
        role="region"
        aria-labelledby="curation-sources"
      >
        <div className="pivot-sources__agent-main">
          <span className="pivot-sources__agent-orb" aria-hidden="true">
            <OrbTint />
            <ThinkingOrb
              className="pivot-orb--brand"
              state={running ? orbStateFor(latestRun, null) : 'weaving'}
              size={20}
              speed={0.45}
              theme={orbTheme}
              paused={false}
            />
          </span>
          <div className="pivot-sources__agent-copy">
            <div className="pivot-sources__agent-title-row">
              <h2 id="curation-sources" className="pivot-sources__agent-title">
                Discovery agent
              </h2>
              <span className="pivot-sources__agent-city">{cityDisplayName || tenantKey}</span>
              {running ? (
                <span className="pivot-sources__agent-status pivot-sources__agent-status--live">
                  {latestRun.rehearsal ? 'Rehearsing' : 'Running'} · {phaseLabel(latestRun.phase)}
                </span>
              ) : (
                <span className="pivot-sources__agent-status">Idle</span>
              )}
            </div>
            <p className="pivot-sources__agent-meta">
              {running ? (
                <>
                  {runCounters.qualified} qualified · {runCounters.rejected} ruled out ·{' '}
                  {formatClock(runElapsed)} elapsed
                </>
              ) : latestRun ? (
                <>
                  {latestRun.rehearsal ? 'Last rehearsal' : 'Last run'}
                  {latestRun.finishedAt ? ` ${formatAgo(latestRun.finishedAt)}` : ''}
                  {' — '}
                  {latestRun.aborted
                    ? latestRun.aborted.error
                    : latestRun.error
                      ? latestRun.error
                      : `${latestRun.counters?.qualified || 0} qualified · ${
                          latestRun.counters?.eventsUpserted || 0
                        } events saved`}
                </>
              ) : plan && !planError ? (
                <>
                  {plan.runNative && plan.runFirecrawl
                    ? 'Luma/Partiful first, then websites — search queries still cost credits'
                    : plan.runNative
                      ? 'Luma and Partiful only'
                      : 'Website search only'}
                  {plan.runFirecrawl
                    ? ` · ${plan.queries} searches · up to ${plan.maxCandidates} sites · ${plan.maxOutboundCalls} call ceiling`
                    : ' · $0 Firecrawl'}
                </>
              ) : (
                <>Finds and registers sources — native indexes first, then venue sites.</>
              )}
            </p>
            {!running ? (
              <p className="pivot-sources__cadence">
                Discovery finds sources. Recrawl this week with Refresh all on Saved
                jobs — not by running discovery again.
              </p>
            ) : null}
            {notConfigured ? (
              <p className="pivot-lab__error">
                FIRECRAWL_API_KEY is not set — rehearse for free, or add a key for a real run.
              </p>
            ) : null}
            {nativeWarning ? (
              <p className="pivot-lab__warning">
                <Icon icon="mdi:alert-outline" aria-hidden="true" style={{ marginRight: '4px' }} />
                {plan.nativeWarning}
              </p>
            ) : null}
            {planError ? <p className="pivot-lab__error">{planError}</p> : null}
          </div>
          <div className="pivot-sources__agent-actions">
            {running ? (
              <button
                type="button"
                className="linear-btn linear-btn--secondary linear-btn--icon pivot-sources__stop-btn"
                onClick={handleStop}
                disabled={stopping || !latestRun?._id}
                aria-label={stopping ? 'Stopping' : 'Stop agent'}
                title={stopping ? 'Stopping…' : 'Stop agent'}
              >
                <Icon icon={stopping ? 'mdi:loading' : 'mdi:stop'} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="linear-btn linear-btn--primary"
                onClick={handleDiscover}
                disabled={starting || running || notConfigured || !tenantKey}
                title="Find and register sources. Recrawl Luma, Partiful, and saved sites with Refresh all on Saved jobs."
              >
                {starting ? 'Starting…' : 'Discover'}
              </button>
            )}
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={handleRehearse}
              disabled={starting || running || !tenantKey}
              title="Walk the same pipeline with example hosts — no pages fetched, nothing saved, no credits"
            >
              Rehearse
            </button>
            {latestRun ? (
              <button
                type="button"
                className="linear-btn linear-btn--ghost"
                onClick={() => openConsole(latestRun._id)}
              >
                {running ? 'Watch' : 'Transcript'}
              </button>
            ) : null}
            <button
              type="button"
              className="linear-btn linear-btn--ghost"
              onClick={() => setOptionsOpen((open) => !open)}
              aria-expanded={optionsOpen}
            >
              {optionsOpen ? 'Hide' : 'Configure'}
            </button>
          </div>
        </div>

        {optionsOpen ? (
          <div className="pivot-sources__agent-options" aria-label="Discovery options">
            <div className="pivot-sources__form-grid">
              <label className="linear-field pivot-sources__form-span">
                <span className="linear-field__label">City flow</span>
                <select
                  className="linear-input"
                  value={options.flow}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, flow: e.target.value }))
                  }
                >
                  {FLOW_OPTIONS.map((flow) => (
                    <option key={flow.value} value={flow.value}>
                      {flow.label}
                    </option>
                  ))}
                </select>
                <span className="pivot-sources__hint-inline">
                  {FLOW_OPTIONS.find((flow) => flow.value === options.flow)?.hint}
                </span>
              </label>
              {options.flow !== 'firecrawl-only' ? (
                <>
                  <label className="linear-field">
                    <span className="linear-field__label">Luma slug</span>
                    <input
                      className="linear-input"
                      type="text"
                      placeholder="sf"
                      value={options.lumaSlug}
                      onChange={(e) =>
                        setOptions((prev) => ({ ...prev, lumaSlug: e.target.value }))
                      }
                    />
                  </label>
                  <label className="linear-field">
                    <span className="linear-field__label">Partiful slug</span>
                    <input
                      className="linear-input"
                      type="text"
                      placeholder="san-francisco"
                      value={options.partifulSlug}
                      onChange={(e) =>
                        setOptions((prev) => ({ ...prev, partifulSlug: e.target.value }))
                      }
                    />
                  </label>
                </>
              ) : null}
              <div className="linear-field pivot-sources__form-span">
                <span className="linear-field__label">
                  Categories{' '}
                  <span className="pivot-sources__hint-inline">(all if none selected)</span>
                </span>
                <PivotTagMultiSelect
                  catalogTags={catalogTags}
                  selectedSlugs={options.tags}
                  onChange={(tags) => setOptions((prev) => ({ ...prev, tags }))}
                  compact
                  showLabel={false}
                />
              </div>
              <label className="linear-field">
                <span className="linear-field__label">Max sites to check</span>
                <input
                  className="linear-input"
                  type="number"
                  min="1"
                  max="100"
                  value={options.maxCandidates}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      maxCandidates: Number(e.target.value) || 1,
                    }))
                  }
                />
              </label>
              <label className="linear-field">
                <span className="linear-field__label">Min events to qualify</span>
                <input
                  className="linear-input"
                  type="number"
                  min="1"
                  max="20"
                  value={options.minEvents}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      minEvents: Number(e.target.value) || 1,
                    }))
                  }
                />
              </label>
              <label className="pivot-sources__check">
                <input
                  type="checkbox"
                  checked={options.createJobs}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, createJobs: e.target.checked }))
                  }
                />
                <span>Create a saved job for each qualified source</span>
              </label>
              <label className="pivot-sources__check">
                <input
                  type="checkbox"
                  checked={options.recheckRejected}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, recheckRejected: e.target.checked }))
                  }
                />
                <span>Re-check hosts rejected previously</span>
              </label>
            </div>
            <div className="pivot-tenant-curation__row-actions">
              <button
                type="button"
                className="linear-btn linear-btn--ghost"
                onClick={() => setOptions(defaultOptions())}
              >
                Reset options
              </button>
              <button
                type="button"
                className="linear-btn linear-btn--secondary"
                onClick={handleSaveConfig}
                disabled={savingConfig || !tenantKey}
              >
                {savingConfig ? 'Saving…' : 'Save as city default'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pivot-sources__registry">
        <button
          type="button"
          className="pivot-sources__collapse-toggle"
          onClick={() => setSitesExpanded((open) => !open)}
          aria-expanded={sitesExpanded}
        >
          <span className="pivot-sources__collapse-label">
            Sites
            <span className="pivot-sources__collapse-meta">
              {counts.qualified} qualified · {counts.rejected} ruled out
              {counts.events ? ` · ${counts.events} events seen` : ''}
            </span>
          </span>
          <span className="pivot-sources__collapse-chevron" aria-hidden="true">
            {sitesExpanded ? '▾' : '▸'}
          </span>
        </button>

        {sitesExpanded ? (
          <>
            <div className="pivot-sources__toolbar">
              <label className="linear-field">
                <span className="linear-field__label">Show</span>
                <select
                  className="linear-input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="pivot-sources__counts">
                Rejected hosts are kept so later runs can skip them.
              </p>
              <button
                type="button"
                className="linear-btn linear-btn--ghost"
                onClick={refetchSources}
                disabled={sourcesLoading}
              >
                Refresh
              </button>
            </div>

            {sourcesError ? <p className="pivot-lab__error">{String(sourcesError)}</p> : null}

            {sourcesLoading && !sources.length ? (
              <p className="pivot-lab__empty">Loading sources…</p>
            ) : sources.length ? (
              <div className="pivot-lab__table-wrap">
                <table className="pivot-lab__table">
                  <thead>
                    <tr>
                      <th scope="col">Site</th>
                      <th scope="col">Provider</th>
                      <th scope="col">Status</th>
                      <th scope="col">Events</th>
                      <th scope="col">Categories</th>
                      <th scope="col">Found via</th>
                      <th scope="col">Job</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((source) => (
                      <tr
                        key={source._id}
                        className={source.enabled === false ? 'is-disabled' : undefined}
                      >
                        <td>
                          <strong>{source.label || source.host}</strong>
                          <a
                            className="pivot-sources__url"
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            title={source.url}
                          >
                            {source.host}
                          </a>
                        </td>
                        <td>{source.provider}</td>
                        <td>
                          <SourceStatusCell source={source} />
                        </td>
                        <td>
                          {source.status === 'qualified' ? source.lastEventCount || 0 : '—'}
                        </td>
                        <td>{source.seedTags?.length ? source.seedTags.join(', ') : '—'}</td>
                        <td
                          className="pivot-sources__query"
                          title={source.discoveredVia || undefined}
                        >
                          {source.discoveredVia || '—'}
                        </td>
                        <td>
                          {source.curationJobId ? (
                            <span className="pivot-lab__pill pivot-lab__pill--info">Linked</span>
                          ) : (
                            <span className="pivot-lab__pill pivot-lab__pill--muted">—</span>
                          )}
                        </td>
                        <td>
                          {source.status === 'qualified' ? (
                            <button
                              type="button"
                              className="linear-btn linear-btn--ghost pivot-lab__edit-btn"
                              onClick={() => toggleEnabled(source)}
                              title={
                                source.enabled === false
                                  ? 'Include this source in future refresh crawls'
                                  : 'Stop crawling this source without forgetting it'
                              }
                            >
                              {source.enabled === false ? 'Enable' : 'Mute'}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="pivot-lab__empty">
                No sources yet. Start discovery above — you only need the city, no URLs.
              </p>
            )}
          </>
        ) : null}
      </div>

      <Popup
        isOpen={consoleOpen}
        onClose={() => setConsoleOpen(false)}
        customClassName="pivot-discovery-popup"
      >
        <PivotDiscoveryConsole
          tenantKey={tenantKey}
          runId={consoleRunId}
          cityDisplayName={cityDisplayName}
          onFinished={handleRunFinished}
        />
      </Popup>
    </section>
  );
}

export default PivotTenantSourcesPanel;
