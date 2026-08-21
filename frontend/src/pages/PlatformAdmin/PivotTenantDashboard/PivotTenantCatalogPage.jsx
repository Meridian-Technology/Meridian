import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import postRequest from '../../../utils/postRequest';
import { useNotification } from '../../../NotificationContext';
import {
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
} from '../../../components/PivotOps';
import PivotTenantPage from './PivotTenantPage';
import {
  CatalogBackfillBar,
  CatalogMergeForm,
  CatalogProposals,
  CatalogUnlinkedTable,
} from './PivotTenantCatalogOps';
import './PivotTenantCatalogPage.scss';
import './PivotTenantPage.scss';

/**
 * Locked Task 0.3: city Catalog on the tenant shell.
 * `/platform-admin/pivot/:tenantKey?page=4`
 */
export const PIVOT_TENANT_CATALOG_PAGE = 4;

const NO_FETCH_CACHE = { enabled: false };
const SEARCH_DEBOUNCE_MS = 280;
const LIST_LIMIT = 100;

const CLAIM_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unclaimed', label: 'Unclaimed' },
  { id: 'claimed', label: 'Claimed' },
  { id: 'pending', label: 'Pending' },
];

const SOURCE_FILTERS = [
  { id: 'all', label: 'All sources' },
  { id: 'luma', label: 'Luma' },
  { id: 'partiful', label: 'Partiful' },
  { id: 'generic-site', label: 'Site' },
  { id: 'justgo', label: 'Just Go' },
  { id: 'manual', label: 'Manual' },
];

const SORT_OPTIONS = [
  { id: 'events', label: 'Events' },
  { id: 'weeks', label: 'Weeks' },
  { id: 'name', label: 'Name' },
];

const CLAIM_IDS = new Set(CLAIM_FILTERS.map((row) => row.id));
const SOURCE_IDS = new Set(SOURCE_FILTERS.map((row) => row.id));
const SORT_IDS = new Set(SORT_OPTIONS.map((row) => row.id));

const VIEW_FILTERS = [
  { id: 'all', label: 'Organizers' },
  { id: 'unlinked', label: 'Unlinked' },
  { id: 'ambiguous', label: 'Ambiguous' },
];
const VIEW_IDS = new Set(VIEW_FILTERS.map((row) => row.id));

const PROVIDER_LABEL = {
  luma: 'Luma',
  partiful: 'Partiful',
  'generic-site': 'Site',
  justgo: 'Just Go',
  manual: 'Manual',
};

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function parseClaimStatus(value) {
  const id = String(value || '').trim().toLowerCase();
  return CLAIM_IDS.has(id) ? id : 'all';
}

function parseSource(value) {
  const id = String(value || '').trim().toLowerCase();
  return SOURCE_IDS.has(id) ? id : 'all';
}

function parseSort(value) {
  const id = String(value || '').trim().toLowerCase();
  return SORT_IDS.has(id) ? id : 'events';
}

function parseViewFilter(value) {
  const id = String(value || '').trim().toLowerCase();
  return VIEW_IDS.has(id) ? id : 'all';
}

function claimTone(claimStatus) {
  if (claimStatus === 'claimed') return 'ok';
  if (claimStatus === 'pending') return 'warn';
  return 'muted';
}

function providerLabel(provider) {
  return PROVIDER_LABEL[provider] || provider;
}

export function catalogCurationHref(tenantKey, event) {
  const params = new URLSearchParams({ page: '1' });
  if (event?.batchWeek) params.set('batchWeek', event.batchWeek);
  if (event?.id) params.set('eventId', event.id);
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params.toString()}`;
}

function formatEventStart(event) {
  const slots = Array.isArray(event?.timeSlots)
    ? event.timeSlots.filter((slot) => slot?.start_time)
    : [];
  if (slots.length > 1) {
    return `${slots.length} showtimes`;
  }
  const start = event?.start_time || event?.start || slots[0]?.start_time;
  if (!start) return '—';
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function eventNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function clusterEventsByName(events) {
  const clusters = [];
  const index = new Map();
  for (const event of events || []) {
    const key = eventNameKey(event.name) || event.id;
    if (!index.has(key)) {
      const cluster = { key, events: [] };
      index.set(key, cluster);
      clusters.push(cluster);
    }
    index.get(key).events.push(event);
  }
  return clusters;
}

function groupEventsByWeek(events) {
  const groups = [];
  const index = new Map();
  for (const event of events || []) {
    const week = event.batchWeek || 'No week';
    if (!index.has(week)) {
      const group = { week, events: [] };
      index.set(week, group);
      groups.push(group);
    }
    index.get(week).events.push(event);
  }
  return groups;
}

function CatalogOrganizerDetail({
  tenantKey,
  payload,
  loading,
  error,
  onBack,
  onCollapseShowtimes,
  collapseBusyKey,
}) {
  const organizer = payload?.organizer;
  const audience = payload?.audience;
  const weekGroups = useMemo(
    () => groupEventsByWeek(payload?.events),
    [payload?.events],
  );

  return (
    <PivotOpsSection
      title={organizer?.canonicalName || 'Organizer'}
      titleId="pivot-catalog-organizer-detail"
      description="Events across every drop week. Audience is a live query, not a weekly rollup."
      actions={
        <button
          type="button"
          className="linear-btn linear-btn--ghost linear-btn--sm"
          onClick={onBack}
        >
          Back to list
        </button>
      }
    >
      {error ? (
        <p className="pivot-lab__error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !organizer ? (
        <p className="pivot-lab__empty">Loading organizer…</p>
      ) : null}
      {organizer ? (
        <>
          <div className="pivot-tenant-catalog__detail-head">
            <div className="pivot-tenant-catalog__identity">
              {organizer.imageUrl ? (
                <img
                  className="pivot-tenant-catalog__avatar pivot-tenant-catalog__avatar--lg"
                  src={organizer.imageUrl}
                  alt=""
                />
              ) : (
                <span
                  className="pivot-tenant-catalog__avatar pivot-tenant-catalog__avatar--lg is-fallback"
                  aria-hidden
                >
                  {(organizer.canonicalName || '?').slice(0, 1)}
                </span>
              )}
              <div className="pivot-tenant-catalog__names">
                <span
                  className={`pivot-tenant-catalog__claim pivot-tenant-catalog__claim--${claimTone(
                    organizer.claimStatus,
                  )}`}
                >
                  {organizer.claimStatus || 'unclaimed'}
                </span>
                {organizer.providers?.length ? (
                  <span className="pivot-tenant-catalog__providers">
                    {organizer.providers.map(providerLabel).join(' · ')}
                  </span>
                ) : (
                  <span className="pivot-tenant-catalog__muted">Name only</span>
                )}
              </div>
            </div>
          </div>

          <PivotOpsMetricGrid>
            <PivotOpsMetric
              label="Interested"
              value={audience?.interested ?? '—'}
              hint="unique users"
            />
            <PivotOpsMetric
              label="Registered"
              value={audience?.registered ?? '—'}
              hint="unique users"
            />
            <PivotOpsMetric
              label="Passed"
              value={audience?.passed ?? '—'}
              hint="unique users"
            />
            <PivotOpsMetric
              label="External opens"
              value={audience?.externalOpens ?? '—'}
              hint="ticket-link opens"
            />
            <PivotOpsMetric
              label="Repeat users"
              value={audience?.repeatUsers ?? '—'}
              hint="on 2+ events"
            />
          </PivotOpsMetricGrid>

          <div className="pivot-tenant-catalog__identities">
            <h3 className="pivot-tenant-catalog__subhead">Identities</h3>
            {organizer.identities?.length ? (
              <ul className="pivot-tenant-catalog__identity-list">
                {organizer.identities.map((identity, index) => (
                  <li
                    key={`${identity.provider || 'id'}-${identity.externalId || identity.profileUrl || index}`}
                  >
                    <span className="pivot-tenant-catalog__name">
                      {providerLabel(identity.provider)}
                    </span>
                    {identity.name ? (
                      <span className="pivot-tenant-catalog__muted"> · {identity.name}</span>
                    ) : null}
                    {identity.profileUrl ? (
                      <>
                        {' '}
                        <a
                          className="pivot-tenant-catalog__ext"
                          href={identity.profileUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          profile
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pivot-lab__empty">No structured identities on this organizer.</p>
            )}
          </div>

          <div className="pivot-tenant-catalog__weeks">
            <h3 className="pivot-tenant-catalog__subhead">Events</h3>
            {!weekGroups.length ? (
              <p className="pivot-lab__empty">No linked events yet.</p>
            ) : (
              weekGroups.map((group) => (
                <section key={group.week} className="pivot-tenant-catalog__week">
                  <h4 className="pivot-tenant-catalog__week-title">{group.week}</h4>
                  <ul className="pivot-tenant-catalog__event-list">
                    {clusterEventsByName(group.events).flatMap((cluster) =>
                      cluster.events.map((event, index) => {
                        const canCollapse = cluster.events.length > 1 && index === 0;
                        const collapsing = collapseBusyKey === cluster.key;
                        return (
                          <li key={event.id} className="pivot-tenant-catalog__event">
                            <div className="pivot-tenant-catalog__event-copy">
                              <Link
                                className="pivot-tenant-catalog__event-link"
                                to={catalogCurationHref(tenantKey, event)}
                              >
                                {event.name || 'Untitled event'}
                              </Link>
                              <span className="pivot-tenant-catalog__muted">
                                {formatEventStart(event)}
                                {event.source ? ` · ${providerLabel(event.source)}` : ''}
                                {event.ingestStatus ? ` · ${event.ingestStatus}` : ''}
                              </span>
                            </div>
                            <div className="pivot-tenant-catalog__event-aside">
                              {canCollapse ? (
                                <button
                                  type="button"
                                  className="linear-btn linear-btn--ghost linear-btn--sm"
                                  disabled={collapsing}
                                  onClick={() => onCollapseShowtimes?.(cluster.events)}
                                >
                                  {collapsing
                                    ? 'Collapsing…'
                                    : `Collapse ${cluster.events.length} nights`}
                                </button>
                              ) : null}
                              <span className="pivot-tenant-catalog__muted">
                                {event.intentStats?.interested ?? 0} interested
                              </span>
                            </div>
                          </li>
                        );
                      }),
                    )}
                  </ul>
                </section>
              ))
            )}
          </div>
        </>
      ) : null}
    </PivotOpsSection>
  );
}

function ChipRow({ label, options, value, onChange }) {
  return (
    <div className="pivot-tenant-catalog__chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`pivot-tenant-catalog__chip${
            value === option.id ? ' pivot-tenant-catalog__chip--active' : ''
          }`}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * City-wide organizer catalog (Task 4.2 list + 4.3 detail + 4.4 leftovers).
 * Not week-gated. Audience is live on the dossier only.
 */
function PivotTenantCatalogPage({ tenantKey, cityDisplayName }) {
  const { addNotification } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const organizerId = String(searchParams.get('organizerId') || '').trim();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [claimStatus, setClaimStatus] = useState(() =>
    parseClaimStatus(searchParams.get('claimStatus')),
  );
  const [source, setSource] = useState(() => parseSource(searchParams.get('source')));
  const [sort, setSort] = useState(() => parseSort(searchParams.get('sort')));
  const [viewFilter, setViewFilter] = useState(() =>
    parseViewFilter(searchParams.get('filter')),
  );
  const [offset, setOffset] = useState(0);
  const [forceBackfill, setForceBackfill] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillError, setBackfillError] = useState('');
  const [mergeBusy, setMergeBusy] = useState(false);
  const [collapseBusyKey, setCollapseBusyKey] = useState(null);
  const [dismissedProposals, setDismissedProposals] = useState(() => new Set());

  const debouncedQuery = useDebouncedValue(searchQuery.trim(), SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQuery, claimStatus, source, sort, viewFilter]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    const setOrDelete = (key, value, blank) => {
      const current = next.get(key);
      if (!value || value === blank) {
        if (current != null) {
          next.delete(key);
          changed = true;
        }
        return;
      }
      if (current !== value) {
        next.set(key, value);
        changed = true;
      }
    };

    if (next.get('page') !== String(PIVOT_TENANT_CATALOG_PAGE)) {
      next.set('page', String(PIVOT_TENANT_CATALOG_PAGE));
      changed = true;
    }
    setOrDelete('q', debouncedQuery, '');
    setOrDelete('claimStatus', claimStatus, 'all');
    setOrDelete('source', source, 'all');
    setOrDelete('sort', sort, 'events');
    setOrDelete('filter', viewFilter, 'all');

    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [claimStatus, debouncedQuery, searchParams, setSearchParams, sort, source, viewFilter]);

  const listParams = useMemo(() => {
    const params = {
      sort,
      limit: LIST_LIMIT,
      offset: viewFilter === 'all' ? offset : 0,
    };
    if (debouncedQuery) params.q = debouncedQuery;
    if (claimStatus !== 'all') params.claimStatus = claimStatus;
    if (source !== 'all') params.source = source;
    return params;
  }, [claimStatus, debouncedQuery, offset, sort, source, viewFilter]);

  const listUrl =
    tenantKey && !organizerId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/organizers`
      : null;
  const detailUrl =
    tenantKey && organizerId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/organizers/${encodeURIComponent(organizerId)}`
      : null;

  const { data: listResponse, loading, error, refetch: refetchList } = useFetch(listUrl, {
    params: listParams,
    cache: NO_FETCH_CACHE,
  });
  const {
    data: detailResponse,
    loading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useFetch(detailUrl, { cache: NO_FETCH_CACHE });

  const unlinkedParams = useMemo(() => {
    const params = { limit: LIST_LIMIT, offset: viewFilter === 'all' ? 0 : offset };
    if (viewFilter === 'ambiguous') params.kind = 'ambiguous';
    return params;
  }, [offset, viewFilter]);
  const unlinkedUrl =
    tenantKey && !organizerId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/organizers/unlinked`
      : null;
  const {
    data: unlinkedResponse,
    loading: unlinkedLoading,
    error: unlinkedError,
    refetch: refetchUnlinked,
  } = useFetch(unlinkedUrl, {
    params: unlinkedParams,
    cache: NO_FETCH_CACHE,
  });

  const payload = listResponse?.success ? listResponse.data : null;
  const organizers = payload?.organizers || [];
  const total = payload?.total ?? 0;
  const listMessage =
    error ||
    (listResponse && !listResponse.success
      ? listResponse.message || 'Unable to load organizers.'
      : null);

  const hasFilters = Boolean(debouncedQuery || claimStatus !== 'all' || source !== 'all');

  const handleClaimChange = useCallback((next) => {
    setClaimStatus(parseClaimStatus(next));
  }, []);
  const handleSourceChange = useCallback((next) => {
    setSource(parseSource(next));
  }, []);
  const handleViewChange = useCallback((next) => {
    setViewFilter(parseViewFilter(next));
  }, []);

  const unlinkedPayload = unlinkedResponse?.success ? unlinkedResponse.data : null;
  const unlinkedEvents = unlinkedPayload?.events || [];
  const lastBackfill = payload?.lastBackfill || unlinkedPayload?.lastBackfill || null;
  const proposals = unlinkedPayload?.proposals || [];
  const leftoverCount = unlinkedPayload?.leftover ?? 0;
  const ambiguousCount = unlinkedPayload?.ambiguous ?? 0;
  const unlinkedTotal = unlinkedPayload?.total ?? 0;
  const showingUnlinked = viewFilter === 'unlinked' || viewFilter === 'ambiguous';
  const pageTotal = showingUnlinked ? unlinkedTotal : total;
  const pageLength = showingUnlinked ? unlinkedEvents.length : organizers.length;
  const pageLoading = showingUnlinked ? unlinkedLoading : loading;
  const rangeStart = pageTotal === 0 ? 0 : offset + 1;
  const rangeEnd = offset + pageLength;
  const canPrev = offset > 0;
  const canNext = rangeEnd < pageTotal;
  const unlinkedMessage =
    unlinkedError ||
    (unlinkedResponse && !unlinkedResponse.success
      ? unlinkedResponse.message || 'Unable to load unlinked events.'
      : null);

  const refreshCatalog = useCallback(() => {
    refetchList();
    refetchUnlinked();
  }, [refetchList, refetchUnlinked]);

  const handleBackfill = useCallback(async () => {
    if (!tenantKey || backfillBusy) return;
    setBackfillBusy(true);
    setBackfillError('');
    const result = await postRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/organizers/backfill`,
      { force: forceBackfill },
    );
    setBackfillBusy(false);
    if (result?.error) {
      setBackfillError(result.error);
      addNotification({
        title: 'Backfill failed',
        message: result.error,
        type: 'error',
      });
      return;
    }
    const run = result?.data?.lastBackfill || result?.data || {};
    addNotification({
      title: 'Backfill finished',
      message: `${run.linked || 0} linked · ${run.ambiguous || 0} ambiguous · ${run.unlinked || 0} unlinked`,
      type: 'success',
    });
    refreshCatalog();
  }, [addNotification, backfillBusy, forceBackfill, refreshCatalog, tenantKey]);

  const handleMerge = useCallback(
    async ({ sourceOrganizerId, targetOrganizerId }) => {
      if (!tenantKey || mergeBusy) return;
      if (
        !window.confirm(
          'Merge the source organizer into the target? Events will be rewritten and the source retired.',
        )
      ) {
        return;
      }
      setMergeBusy(true);
      const result = await postRequest(
        `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/organizers/${encodeURIComponent(targetOrganizerId)}/merge`,
        { sourceOrganizerId },
      );
      setMergeBusy(false);
      if (result?.error) {
        addNotification({
          title: 'Merge failed',
          message: result.error,
          type: 'error',
        });
        return;
      }
      addNotification({
        title: 'Organizers merged',
        message: `${result?.data?.eventsRewritten || 0} event(s) rewritten`,
        type: 'success',
      });
      refreshCatalog();
    },
    [addNotification, mergeBusy, refreshCatalog, tenantKey],
  );

  const handleProposalMerge = useCallback(
    (proposal) => {
      handleMerge({
        sourceOrganizerId: proposal.a?.organizerId,
        targetOrganizerId: proposal.b?.organizerId,
      });
    },
    [handleMerge],
  );

  const handleCollapseShowtimes = useCallback(
    async (events) => {
      if (!tenantKey || collapseBusyKey || !Array.isArray(events) || events.length < 2) return;
      if (
        !window.confirm(
          `Collapse ${events.length} nights of “${events[0]?.name || 'this event'}” into one listing with showtimes? Extra catalog rows will be removed.`,
        )
      ) {
        return;
      }

      const key = eventNameKey(events[0]?.name) || events[0]?.id;
      setCollapseBusyKey(key);
      const result = await postRequest('/admin/pivot/ingest/collapse-showtimes', {
        tenantKey,
        eventIds: events.map((event) => event.id),
      });
      setCollapseBusyKey(null);

      if (result?.error) {
        addNotification({
          title: 'Could not collapse showtimes',
          message: result.error,
          type: 'error',
        });
        return;
      }

      refetchDetail();
      addNotification({
        title: 'Collapsed into showtimes',
        message: `${result?.data?.event?.name || events[0]?.name} now has ${result?.data?.showtimeCount ?? events.length} showtimes.`,
        type: 'success',
      });
    },
    [addNotification, collapseBusyKey, refetchDetail, tenantKey],
  );

  const openOrganizer = useCallback(
    (id) => {
      const next = new URLSearchParams(searchParams);
      next.set('page', String(PIVOT_TENANT_CATALOG_PAGE));
      next.set('organizerId', id);
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const closeOrganizer = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(PIVOT_TENANT_CATALOG_PAGE));
    next.delete('organizerId');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const detailPayload = detailResponse?.success ? detailResponse.data : null;
  const detailMessage =
    detailError ||
    (detailResponse && !detailResponse.success
      ? detailResponse.message || 'Unable to load organizer.'
      : null);

  return (
    <PivotTenantPage
      title="Catalog"
      tenantKey={tenantKey}
      cityDisplayName={cityDisplayName}
      className="pivot-tenant-catalog"
    >
      {organizerId ? (
        <CatalogOrganizerDetail
          tenantKey={tenantKey}
          payload={detailPayload}
          loading={detailLoading}
          error={detailMessage}
          onBack={closeOrganizer}
          onCollapseShowtimes={handleCollapseShowtimes}
          collapseBusyKey={collapseBusyKey}
        />
      ) : null}
      {organizerId ? null : (
      <PivotOpsSection
        title={
          viewFilter === 'ambiguous'
            ? 'Ambiguous hosts'
            : viewFilter === 'unlinked'
              ? 'Unlinked events'
              : 'Organizers'
        }
        titleId="pivot-catalog-organizers"
        description="Every creator in this city, across all drop weeks. Curation stays the week release queue."
        actions={
          showingUnlinked ? null : (
            <label className="linear-field pivot-tenant-catalog__sort">
              <span className="linear-field__label">Sort</span>
              <select
                className="linear-input"
                value={sort}
                onChange={(event) => setSort(parseSort(event.target.value))}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      >
        <CatalogBackfillBar
          lastBackfill={lastBackfill}
          busy={backfillBusy}
          force={forceBackfill}
          onForceChange={setForceBackfill}
          onBackfill={handleBackfill}
          error={backfillError}
        />
        <ChipRow
          label="Catalog view"
          options={VIEW_FILTERS.map((row) =>
            row.id === 'unlinked'
              ? { ...row, label: `Unlinked${leftoverCount + ambiguousCount ? ` (${leftoverCount + ambiguousCount})` : ''}` }
              : row.id === 'ambiguous'
                ? { ...row, label: `Ambiguous${ambiguousCount ? ` (${ambiguousCount})` : ''}` }
                : row,
          )}
          value={viewFilter}
          onChange={handleViewChange}
        />
        <CatalogProposals
          proposals={proposals}
          dismissed={dismissedProposals}
          busy={mergeBusy}
          onConfirm={handleProposalMerge}
          onDismiss={(key) =>
            setDismissedProposals((current) => new Set(current).add(key))
          }
        />
        <CatalogMergeForm
          organizers={organizers}
          busy={mergeBusy}
          onMerge={handleMerge}
        />
        {showingUnlinked ? null : (
        <div className="pivot-tenant-catalog__toolbar">
          <label className="linear-field pivot-tenant-catalog__search">
            <span className="linear-field__label">Search</span>
            <input
              className="linear-input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Name or alias"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <ChipRow
            label="Claim status"
            options={CLAIM_FILTERS}
            value={claimStatus}
            onChange={handleClaimChange}
          />
          <ChipRow
            label="Source"
            options={SOURCE_FILTERS}
            value={source}
            onChange={handleSourceChange}
          />
        </div>
        )}

        {showingUnlinked ? (
          <>
            {unlinkedMessage ? (
              <p className="pivot-lab__error" role="alert">
                {unlinkedMessage}
              </p>
            ) : null}
            <CatalogUnlinkedTable
              tenantKey={tenantKey}
              events={unlinkedEvents}
              loading={unlinkedLoading}
            />
            {unlinkedEvents.length ? (
              <div className="pivot-tenant-catalog__pager">
                <span className="pivot-tenant-catalog__muted">
                  {rangeStart}–{rangeEnd} of {pageTotal}
                  {pageLoading ? ' · updating…' : ''}
                </span>
                <div className="pivot-tenant-catalog__pager-actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost linear-btn--sm"
                    disabled={!canPrev || pageLoading}
                    onClick={() => setOffset((current) => Math.max(0, current - LIST_LIMIT))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost linear-btn--sm"
                    disabled={!canNext || pageLoading}
                    onClick={() => setOffset((current) => current + LIST_LIMIT)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
        {listMessage ? (
          <p className="pivot-lab__error" role="alert">
            {listMessage}
          </p>
        ) : null}

        {loading && !organizers.length ? (
          <p className="pivot-lab__empty">Loading organizers…</p>
        ) : null}

        {!loading && !listMessage && total === 0 && !hasFilters ? (
          <p className="pivot-lab__empty pivot-tenant-catalog__empty">
            No organizers listed yet. Crawl attach and Catalog backfill will populate
            this graph — it is not filtered by batch week.
          </p>
        ) : null}

        {!loading && !listMessage && total === 0 && hasFilters ? (
          <p className="pivot-lab__empty">
            No organizers match
            {debouncedQuery ? ` “${debouncedQuery}”` : ' these filters'}.
          </p>
        ) : null}

        {organizers.length ? (
          <>
            <div className="pivot-tenant-catalog__table-wrap">
              <table className="pivot-tenant-catalog__table">
                <thead>
                  <tr>
                    <th>Organizer</th>
                    <th>Sources</th>
                    <th>Events</th>
                    <th>Weeks</th>
                    <th>Claim</th>
                  </tr>
                </thead>
                <tbody>
                  {organizers.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="pivot-tenant-catalog__identity">
                          {row.imageUrl ? (
                            <img
                              className="pivot-tenant-catalog__avatar"
                              src={row.imageUrl}
                              alt=""
                            />
                          ) : (
                            <span className="pivot-tenant-catalog__avatar is-fallback" aria-hidden>
                              {(row.canonicalName || '?').slice(0, 1)}
                            </span>
                          )}
                          <div className="pivot-tenant-catalog__names">
                            <button
                              type="button"
                              className="pivot-tenant-catalog__open"
                              onClick={() => openOrganizer(row.id)}
                            >
                              {row.canonicalName}
                            </button>
                            {row.aliases?.length ? (
                              <span className="pivot-tenant-catalog__aliases">
                                {row.aliases.slice(0, 3).join(' · ')}
                                {row.aliases.length > 3
                                  ? ` +${row.aliases.length - 3}`
                                  : ''}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        {row.providers?.length ? (
                          <span className="pivot-tenant-catalog__providers">
                            {row.providers.map(providerLabel).join(' · ')}
                          </span>
                        ) : (
                          <span className="pivot-tenant-catalog__muted">Name only</span>
                        )}
                      </td>
                      <td className="pivot-tenant-catalog__num">{row.eventCount ?? 0}</td>
                      <td className="pivot-tenant-catalog__num">
                        {row.weeksActive?.length ?? 0}
                      </td>
                      <td>
                        <span
                          className={`pivot-tenant-catalog__claim pivot-tenant-catalog__claim--${claimTone(
                            row.claimStatus,
                          )}`}
                        >
                          {row.claimStatus || 'unclaimed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pivot-tenant-catalog__pager">
              <span className="pivot-tenant-catalog__muted">
                {rangeStart}–{rangeEnd} of {pageTotal}
                {pageLoading ? ' · updating…' : ''}
              </span>
              <div className="pivot-tenant-catalog__pager-actions">
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost linear-btn--sm"
                  disabled={!canPrev || pageLoading}
                  onClick={() => setOffset((current) => Math.max(0, current - LIST_LIMIT))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost linear-btn--sm"
                  disabled={!canNext || pageLoading}
                  onClick={() => setOffset((current) => current + LIST_LIMIT)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
          </>
        )}
      </PivotOpsSection>
      )}
    </PivotTenantPage>
  );
}

export default PivotTenantCatalogPage;
