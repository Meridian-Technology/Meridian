import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import PivotTagMultiSelect from '../PivotLab/PivotTagMultiSelect';
import { buildAdminCreateJobRequest } from './pivotComputeJobActions';
import PivotComputeJobRunStatus, { useTenantComputeJob } from './PivotComputeJobRunStatus';
import './PivotTenantSourcesPanel.scss';

const NO_FETCH_CACHE = { enabled: false };
const EMPTY_LIST = [];
const DEFAULT_COMPUTE_APPLY_POLICY = {
  trusted: false,
  autoApplyRefresh: false,
  autoApplyDiscovery: false,
  autoApplyOrigins: ['admin', 'schedule'],
  notifyAdminsEmail: true,
  maxNewSources: null,
  maxEventCreates: null,
};

// Overview endpoints return the policy directly, while the config endpoint
// returns it under `policy`. Accept both so a refetch cannot briefly reset the
// controls to defaults while the surrounding admin payload catches up.
function normalizeComputeApplyPolicy(value) {
  const policy = value?.policy || value?.computeApplyPolicy || value;
  if (!policy || typeof policy !== 'object') return null;
  return {
    ...policy,
    autoApplyOrigins: Array.isArray(policy.autoApplyOrigins)
      ? policy.autoApplyOrigins
      : DEFAULT_COMPUTE_APPLY_POLICY.autoApplyOrigins,
  };
}

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
 * sites). It sits upstream of Saved jobs. The Mini returns proposed sources,
 * jobs, and events for review here; applying the reviewed result updates the
 * city. Saved jobs become the weekly refresh mechanism — recrawl those jobs
 * with Refresh all, rather than re-running discovery for a Luma update. Rejected hosts are shown too —
 * they are the reason a second run is cheaper than the first, and hiding them
 * would make the registry look like it had simply missed things.
 */
function PivotTenantSourcesPanel({
  tenantKey,
  cityDisplayName,
  catalogTags = EMPTY_LIST,
  computeApplyPolicy,
  onJobsChanged,
}) {
  const { addNotification } = useNotification();
  const [statusFilter, setStatusFilter] = useState('all');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sitesExpanded, setSitesExpanded] = useState(false);
  const [options, setOptions] = useState(defaultOptions);
  const [starting, setStarting] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingComputeApply, setSavingComputeApply] = useState(false);
  const [computeApply, setComputeApply] = useState(DEFAULT_COMPUTE_APPLY_POLICY);
  const hydratedFlowRef = useRef(false);

  useEffect(() => {
    const policy = normalizeComputeApplyPolicy(computeApplyPolicy);
    if (!policy) return;
    setComputeApply((current) => ({
      ...current,
      ...policy,
    }));
  }, [computeApplyPolicy]);

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

  const handleComputeFinished = useCallback((job) => {
    refetchSources();
    onJobsChanged?.();
    addNotification({
      title: job.status === 'review-required' ? 'Discovery ready for review' : 'Discovery job finished',
      message: job.status === 'review-required'
        ? 'The Mini returned a stored result. Open review here before applying it to Curation.'
        : job.failure?.message || `The job finished with status ${job.status}.`,
      type: job.status === 'review-required' ? 'success' : 'warning',
    });
  }, [addNotification, onJobsChanged, refetchSources]);
  const discoveryCompute = useTenantComputeJob({
    tenantKey,
    kind: 'city-source-discovery',
    onFinished: handleComputeFinished,
  });
  const running = discoveryCompute.active;
  const handleDiscoveryJobUpdated = useCallback((job, meta) => {
    discoveryCompute.updateJob(job);
    if (meta?.action === 'apply' && !meta?.optimistic) {
      refetchSources();
      onJobsChanged?.();
    }
  }, [discoveryCompute, onJobsChanged, refetchSources]);

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

  const handleDiscover = useCallback(async () => {
    if (!tenantKey) return;

    setStarting(true);
    const { data, error } = await authenticatedRequest(
      '/admin/pivot/compute-jobs',
      {
        method: 'POST',
        data: {
          request: buildAdminCreateJobRequest({
            tenantKey,
            kind: 'city-source-discovery',
            options,
          }),
        },
      },
    );
    setStarting(false);

    if (error || !data?.job) {
      addNotification({
        title: 'Discovery failed to start',
        message: error || data?.message || 'Could not create the discovery job.',
        type: 'error',
      });
      return;
    }

    setOptionsOpen(false);
    discoveryCompute.trackCreated(data);
    const wakeAccepted = data?.wake?.status === 'accepted';
    addNotification({
      title: data?.created ? 'Discovery job created' : 'Discovery job already queued',
      message: wakeAccepted
        ? 'The job is stored and the Mini accepted the wake request. This panel will confirm when execution starts.'
        : 'The job is stored in the durable queue. The Mini will collect it on its next poll.',
      type: 'success',
    });
  }, [addNotification, discoveryCompute, options, tenantKey]);

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

  const updateComputeApply = useCallback(async (key, value) => {
    if (!tenantKey || savingComputeApply) return;
    const previous = computeApply;
    const next = { ...previous, [key]: value };
    setComputeApply(next);
    setSavingComputeApply(true);
    let data;
    let error;
    try {
      ({ data, error } = await authenticatedRequest(
        `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/compute-apply-config`,
        { method: 'PATCH', data: { [key]: value } },
      ));
    } catch (requestError) {
      error = requestError?.message || 'Could not update the city policy.';
    } finally {
      setSavingComputeApply(false);
    }

    if (error || !data?.success) {
      setComputeApply(previous);
      addNotification({
        title: 'Could not update auto-apply settings',
        message: error || data?.message || 'The city policy was not updated.',
        type: 'error',
      });
      return;
    }

    const policy = data?.data?.policy || data?.policy || data?.data?.computeApplyPolicy;
    if (policy) {
      setComputeApply((current) => ({ ...current, ...policy }));
    }
    addNotification({
      title: 'Auto-apply settings saved',
      message: 'The trusted compute-job policy now applies to this city.',
      type: 'success',
    });
    onJobsChanged?.();
  }, [addNotification, computeApply, onJobsChanged, savingComputeApply, tenantKey]);

  const notConfigured = Boolean(plan) && plan.runFirecrawl !== false && plan.configured === false;
  const nativeWarning = Boolean(plan) && plan.nativeWarning;

  return (
    <section className="linear-section pivot-lab__section pivot-sources" aria-labelledby="curation-sources">
      <div
        className={`pivot-sources__agent${running ? ' pivot-sources__agent--live' : ''}`}
        role="region"
        aria-labelledby="curation-sources"
      >
        <div className="pivot-sources__agent-main">
          <span className="pivot-sources__agent-orb" aria-hidden="true">
            <Icon icon={running ? 'mdi:server-network' : 'mdi:radar'} />
          </span>
          <div className="pivot-sources__agent-copy">
            <div className="pivot-sources__agent-title-row">
              <h2 id="curation-sources" className="pivot-sources__agent-title">
                Discovery agent
              </h2>
              <span className="pivot-sources__agent-city">{cityDisplayName || tenantKey}</span>
              {running ? (
                <span className="pivot-sources__agent-status pivot-sources__agent-status--live">
                  {discoveryCompute.job?.status === 'running' ? 'Running on Mini' : 'Queued for Mini'}
                </span>
              ) : (
                <span className="pivot-sources__agent-status">Idle</span>
              )}
            </div>
            <p className="pivot-sources__agent-meta">
              {running ? (
                <>
                  The request is stored in the durable queue. This page will confirm when the Mini
                  collects it, starts execution, and returns a reviewable result.
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
                Website discovery is not configured. Add the Firecrawl key or choose Native only.
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
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={handleDiscover}
              disabled={starting || running || notConfigured || !tenantKey}
              title="Create an offloaded discovery job for the Mini."
            >
              {starting ? 'Creating job…' : running ? 'Discovery queued' : 'Discover'}
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              disabled
              title="Rehearsal is temporarily unavailable while discovery is offloaded to the Mini."
            >
              Rehearse
            </button>
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

        <div className="pivot-sources__compute-apply" aria-label="Trusted compute-job apply settings">
          <div className="pivot-sources__compute-apply-heading">
            <div>
              <h3>Trusted compute jobs</h3>
              <p>
                Automatically apply Mini results only after this city is trusted. Jobs outside
                these settings remain available for manual review.
              </p>
            </div>
            {savingComputeApply ? <span className="pivot-sources__saving">Saving…</span> : null}
          </div>
          <div className="pivot-sources__compute-apply-controls">
            <label className="pivot-sources__check">
              <input
                type="checkbox"
                checked={computeApply.trusted}
                disabled={savingComputeApply || !tenantKey}
                onChange={(event) => updateComputeApply('trusted', event.target.checked)}
              />
              <span>Trusted city</span>
            </label>
            <label className="pivot-sources__check">
              <input
                type="checkbox"
                checked={computeApply.autoApplyRefresh}
                disabled={savingComputeApply || !tenantKey}
                onChange={(event) => updateComputeApply('autoApplyRefresh', event.target.checked)}
              />
              <span>Auto-apply refresh</span>
            </label>
            <label className="pivot-sources__check">
              <input
                type="checkbox"
                checked={computeApply.autoApplyDiscovery}
                disabled={savingComputeApply || !tenantKey}
                onChange={(event) => updateComputeApply('autoApplyDiscovery', event.target.checked)}
              />
              <span>Auto-apply discovery</span>
            </label>
            <label className="pivot-sources__check">
              <input
                type="checkbox"
                checked={computeApply.notifyAdminsEmail}
                disabled={savingComputeApply || !tenantKey}
                onChange={(event) => updateComputeApply('notifyAdminsEmail', event.target.checked)}
              />
              <span>Email admins on compute job results</span>
            </label>
          </div>
          <p className="pivot-sources__compute-apply-meta">
            Effective origins: {(computeApply.autoApplyOrigins || EMPTY_LIST).join(', ') || 'none'}.
            {' '}Discovery guardrails: {computeApply.maxNewSources ?? 'no new-source limit'} ·
            {' '}{computeApply.maxEventCreates ?? 'no event-create limit'}.
          </p>
        </div>

        <PivotComputeJobRunStatus
          job={discoveryCompute.job}
          wake={discoveryCompute.wake}
          error={discoveryCompute.error}
          tenantKey={tenantKey}
          onJobUpdated={handleDiscoveryJobUpdated}
        />
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

    </section>
  );
}

export default PivotTenantSourcesPanel;
