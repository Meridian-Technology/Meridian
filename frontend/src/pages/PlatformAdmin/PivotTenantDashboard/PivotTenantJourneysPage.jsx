import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  toIsoWeek,
  isValidIsoWeek,
  shiftIsoWeek,
  formatEventWhen,
} from '../../../utils/pivotIsoWeek';
import PivotTenantPage from './PivotTenantPage';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import usePivotBatchWeekState from './usePivotBatchWeekState';
import usePivotTenantWeekKeybinds from './usePivotTenantWeekKeybinds';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import '../PivotLab/PivotLabPage.scss';
import './PivotTenantDashboard.scss';
import './PivotTenantJourneysPage.scss';
import './PivotTenantPage.scss';

const NO_FETCH_CACHE = { enabled: false };
const WIPE_CONFIRM_TOKEN = 'WIPE';
const SEARCH_DEBOUNCE_MS = 280;

function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

function formatPercent(numerator, denominator) {
  if (!denominator) return null;
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatConversionPct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(1)}%`;
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="linear-stat pivot-lab__metric">
      <span className="linear-stat__label">{label}</span>
      <span className="linear-stat__value">{value}</span>
      {hint ? <span className="pivot-lab__metric-hint">{hint}</span> : null}
    </div>
  );
}

/** Intent funnel bars — same visual language as Overview / Lab. */
function IntentFunnelChart({ stages }) {
  const max = Math.max(1, ...(stages || []).map((stage) => stage.value ?? 0));
  if (!stages?.length) return null;

  return (
    <div className="pivot-lab__funnel" role="img" aria-label="Intent conversion funnel">
      {stages.map((stage, index) => {
        const prev = index > 0 ? stages[index - 1].value : null;
        const conversion = prev != null ? formatPercent(stage.value, prev) : null;
        return (
          <div className="pivot-lab__funnel-row" key={stage.key}>
            <div className="pivot-lab__funnel-meta">
              <span className="pivot-lab__funnel-label">{stage.label}</span>
              <span className="pivot-lab__funnel-hint">{stage.hint}</span>
            </div>
            <div className="pivot-lab__funnel-track">
              <div
                className="pivot-lab__funnel-bar"
                style={{ width: `${Math.max(2, ((stage.value ?? 0) / max) * 100)}%` }}
              />
              <span className="pivot-lab__funnel-value">{stage.value ?? 0}</span>
            </div>
            <span className="pivot-lab__funnel-conversion">
              {conversion ? `${conversion} of prev` : '\u00a0'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Analytics closed-funnel steps (pivot_* event names). */
function AnalyticsFunnelSteps({ steps }) {
  if (!steps?.length) return null;
  const max = Math.max(1, ...steps.map((s) => s.count ?? 0));

  return (
    <div className="pivot-tenant-journeys__analytics-funnel" role="list">
      {steps.map((step) => (
        <div
          className="pivot-tenant-journeys__analytics-row"
          key={step.event || step.key}
          role="listitem"
        >
          <div className="pivot-tenant-journeys__analytics-meta">
            <span className="pivot-tenant-journeys__analytics-key">{step.key}</span>
            <code className="linear-code linear-code--inline">{step.event}</code>
          </div>
          <div className="pivot-lab__funnel-track">
            <div
              className="pivot-lab__funnel-bar"
              style={{ width: `${Math.max(2, ((step.count ?? 0) / max) * 100)}%` }}
            />
            <span className="pivot-lab__funnel-value">{step.count ?? 0}</span>
          </div>
          <span className="pivot-tenant-journeys__analytics-conv">
            {formatConversionPct(step.conversionRate)}
            {step.dropOff > 0 ? ` · −${step.dropOff}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function IntentStatusPill({ status }) {
  if (status === 'registered') {
    return <span className="pivot-lab__pill pivot-lab__pill--ok">Going</span>;
  }
  if (status === 'interested') {
    return <span className="pivot-lab__pill pivot-lab__pill--info">Interested</span>;
  }
  if (status === 'passed') {
    return <span className="pivot-lab__pill pivot-lab__pill--muted">Passed</span>;
  }
  return <span className="pivot-lab__pill">{status || '—'}</span>;
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Per-tenant User journeys — compact funnel + user inspector + wipe-week.
 */
function PivotTenantJourneysPage({ tenantKey, cityDisplayName }) {
  const { addNotification } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const initializedWeekRef = useRef(false);

  const urlBatchWeek = searchParams.get('batchWeek');
  const urlUserId = searchParams.get('userId');

  const {
    batchWeek,
    committedWeek,
    setBatchWeek,
    batchWeekValid,
    committedWeekValid,
  } = usePivotBatchWeekState(
    isValidIsoWeek(urlBatchWeek) ? urlBatchWeek.trim() : toIsoWeek(),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(() => urlUserId?.trim() || null);
  const [wipeBusy, setWipeBusy] = useState(false);

  const debouncedQuery = useDebouncedValue(searchQuery.trim(), SEARCH_DEBOUNCE_MS);

  // Bookmark committed week + selected user (preserve page=2).
  useEffect(() => {
    const currentWeek = searchParams.get('batchWeek');
    const currentUser = searchParams.get('userId');
    const pageOk = searchParams.get('page') === '2';
    const weekOk = !committedWeekValid || currentWeek === committedWeek;
    const userOk = selectedUserId ? currentUser === selectedUserId : !currentUser;
    if (pageOk && weekOk && userOk) return;

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', '2');
        if (committedWeekValid) next.set('batchWeek', committedWeek);
        if (selectedUserId) next.set('userId', selectedUserId);
        else next.delete('userId');
        return next;
      },
      { replace: true },
    );
  }, [committedWeek, committedWeekValid, selectedUserId, searchParams, setSearchParams]);

  // Sync from deep links / tenant switch.
  useEffect(() => {
    if (isValidIsoWeek(urlBatchWeek)) {
      const trimmed = urlBatchWeek.trim();
      setBatchWeek((current) => (current === trimmed ? current : trimmed), {
        immediate: true,
      });
    }
  }, [urlBatchWeek, setBatchWeek]);

  useEffect(() => {
    const next = urlUserId?.trim() || null;
    setSelectedUserId((current) => (current === next ? current : next));
  }, [urlUserId]);

  const opsParams = useMemo(
    () => ({
      batchWeek: committedWeek,
      include: 'journeys',
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

  const isUserSearch = debouncedQuery.length >= 2;
  const usersParams = useMemo(
    () => ({
      ...(isUserSearch ? { query: debouncedQuery } : {}),
      ...(committedWeekValid ? { batchWeek: committedWeek } : {}),
    }),
    [isUserSearch, debouncedQuery, committedWeek, committedWeekValid],
  );
  // Search when query is long enough; otherwise load most-active for the week.
  const usersUrl =
    tenantKey && (isUserSearch || committedWeekValid)
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/journeys/users`
      : null;
  const {
    data: usersResponse,
    loading: usersLoading,
    error: usersError,
  } = useFetch(usersUrl, { params: usersParams, cache: NO_FETCH_CACHE });

  const historyParams = useMemo(
    () => (committedWeekValid ? { batchWeek: committedWeek } : {}),
    [committedWeek, committedWeekValid],
  );
  const historyUrl =
    tenantKey && selectedUserId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/journeys/users/${encodeURIComponent(selectedUserId)}/history`
      : null;
  const {
    data: historyResponse,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useFetch(historyUrl, {
    params: historyParams,
    cache: NO_FETCH_CACHE,
  });

  const ops = opsResponse?.success ? opsResponse.data : null;
  const dropDayOfWeek = ops?.weekRange?.dropDayOfWeek ?? ops?.dropSchedule?.dayOfWeek ?? 4;
  const dropTimeZone = ops?.weekRange?.timeZone ?? ops?.dropSchedule?.timezone ?? 'UTC';

  useEffect(() => {
    if (initializedWeekRef.current) return;
    if (isValidIsoWeek(urlBatchWeek)) {
      initializedWeekRef.current = true;
      return;
    }
    if (!ops?.anchors?.liveWeek) return;
    initializedWeekRef.current = true;
    setBatchWeek(ops.anchors.liveWeek, { immediate: true });
  }, [ops?.anchors?.liveWeek, urlBatchWeek, setBatchWeek]);
  const overview = ops?.journey && !ops.journey.error ? ops.journey : null;
  const funnel = ops?.funnel && !ops.funnel.error ? ops.funnel : null;
  const users = usersResponse?.success ? usersResponse.data?.users ?? [] : [];
  const usersMode =
    usersResponse?.success && usersResponse.data?.mode
      ? usersResponse.data.mode
      : isUserSearch
        ? 'search'
        : 'active';
  const history = historyResponse?.success ? historyResponse.data : null;

  const overviewLoading = opsLoading;
  const funnelLoading = opsLoading && !funnel;
  const overviewMessage =
    opsError ||
    (opsResponse && !opsResponse.success
      ? opsResponse.message || 'Unable to load journey overview.'
      : null) ||
    (ops?.journey?.error ? ops.journey.error : null);
  const funnelMessage =
    ops?.funnel?.error ||
    (opsResponse && !opsResponse.success && !overviewMessage
      ? opsResponse.message || 'Unable to load funnel.'
      : null);
  const usersMessage =
    usersError ||
    (usersResponse && !usersResponse.success
      ? usersResponse.message || 'Unable to search users.'
      : null);
  const historyMessage =
    historyError ||
    (historyResponse && !historyResponse.success
      ? historyResponse.message || 'Unable to load history.'
      : null);

  const displayCity = overview?.cityDisplayName || cityDisplayName || tenantKey;
  const kpis = overview?.kpis;
  const conversionRates = overview?.conversionRates;
  const intentFunnel = funnel?.intentFunnel || overview?.funnel || [];
  const analyticsSteps = funnel?.steps || [];

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
    if (selectedUserId) refetchHistory();
  }, [refetchOps, refetchHistory, selectedUserId]);

  const { keyboardNavActive } = usePivotTenantWeekKeybinds({
    enabled: batchWeekValid,
    onStepWeek: stepBatchWeek,
    onRefresh: refreshAll,
  });

  const selectUser = useCallback((userId) => {
    setSelectedUserId(userId);
  }, []);

  const clearSelectedUser = useCallback(() => {
    setSelectedUserId(null);
  }, []);

  const handleWipeWeek = useCallback(async () => {
    if (!tenantKey || !selectedUserId || !committedWeekValid) return;

    const intentCount = history?.intents?.length ?? 0;
    if (
      !window.confirm(
        `Wipe ${intentCount || 'all'} interaction(s) for this user in ${committedWeek}? This cannot be undone.`,
      )
    ) {
      return;
    }

    const typed = window.prompt(
      `Type ${WIPE_CONFIRM_TOKEN} to confirm wiping intents for ${committedWeek}.`,
      '',
    );
    if (typed !== WIPE_CONFIRM_TOKEN) {
      if (typed != null) {
        addNotification({
          title: 'Wipe cancelled',
          message: `Confirmation must be exactly “${WIPE_CONFIRM_TOKEN}”.`,
          type: 'warning',
        });
      }
      return;
    }

    setWipeBusy(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/users/${encodeURIComponent(selectedUserId)}/wipe-week`,
      {
        method: 'POST',
        data: { batchWeek: committedWeek, confirm: WIPE_CONFIRM_TOKEN },
      },
    );
    setWipeBusy(false);

    if (error || !data?.success) {
      const code = data?.code;
      addNotification({
        title: 'Wipe failed',
        message:
          error ||
          data?.message ||
          (code === 'CONFIRM_REQUIRED'
            ? 'Confirmation token required.'
            : 'Could not wipe week intents.'),
        type: 'error',
      });
      return;
    }

    addNotification({
      title: 'Week wiped',
      message: `Removed ${data.data?.deletedCount ?? 0} intent(s) for ${committedWeek}.`,
      type: 'success',
    });
    refetchHistory();
    refetchOps();
  }, [
    addNotification,
    committedWeek,
    committedWeekValid,
    history?.intents?.length,
    refetchHistory,
    refetchOps,
    selectedUserId,
    tenantKey,
  ]);

  const curationHref = batchWeekValid
    ? `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?page=1&batchWeek=${encodeURIComponent(batchWeek)}`
    : `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?page=1`;

  return (
    <PivotTenantPage
      title="User journeys"
      tenantKey={tenantKey}
      cityDisplayName={displayCity}
      className="pivot-tenant-journeys"
      actions={
        <>
          <PivotBatchWeekPicker
            batchWeek={batchWeek}
            onChange={setBatchWeek}
            keyboardNavActive={keyboardNavActive}
            anchors={ops?.anchors}
            dropDayOfWeek={dropDayOfWeek}
            timeZone={dropTimeZone}
            pending={batchWeek !== committedWeek}
          />
          <button
            type="button"
            className="linear-btn linear-btn--secondary pivot-tenant-kbd-btn"
            onClick={refreshAll}
            disabled={!opsUrl || overviewLoading || funnelLoading}
          >
            Refresh
            <KeybindTooltip label="Refresh" keybind="R" />
          </button>
        </>
      }
    >
      {!batchWeekValid ? (
        <p className="pivot-lab__error" role="alert">
          Batch week must be ISO format YYYY-Www (e.g. {toIsoWeek()}).
        </p>
      ) : null}

      {overviewMessage && !overview ? (
        <p className="pivot-lab__error" role="alert">
          {typeof overviewMessage === 'string'
            ? overviewMessage
            : 'Unable to load journey overview.'}
        </p>
      ) : null}

      <section
        className="linear-section pivot-lab__section"
        aria-labelledby="pivot-journeys-kpis"
      >
        <div className="pivot-lab__section-head">
          <h2 id="pivot-journeys-kpis" className="linear-section__title">
            Week snapshot
          </h2>
          {overviewLoading ? (
            <span className="pivot-tenant-journeys__muted">Loading…</span>
          ) : null}
        </div>
        <div className="pivot-lab__kpi-grid">
          <MetricCard
            label="Active users"
            value={kpis?.activeUsers ?? '—'}
            hint="with intents this week"
          />
          <MetricCard
            label="Median cards seen"
            value={kpis?.medianCardsSeen ?? '—'}
            hint="pivot_card_view"
          />
          <MetricCard
            label="Swipes"
            value={kpis?.swipeCount ?? '—'}
            hint="pass + interested + going"
          />
          <MetricCard
            label="Interest rate"
            value={formatRate(conversionRates?.interestRate)}
            hint="right-swipe / swipes"
          />
          <MetricCard
            label="Ticket open rate"
            value={formatRate(conversionRates?.ticketOpenRate)}
            hint="openers / interested"
          />
          <MetricCard
            label="Register rate"
            value={formatRate(conversionRates?.registerRate)}
            hint="going / openers"
          />
        </div>
      </section>

      <section
        className="linear-section pivot-lab__section"
        aria-labelledby="pivot-journeys-funnel"
      >
        <div className="pivot-lab__section-head">
          <h2 id="pivot-journeys-funnel" className="linear-section__title">
            Funnel
          </h2>
          {funnelLoading ? (
            <span className="pivot-tenant-journeys__muted">Loading…</span>
          ) : funnel?.overallConversionRate != null ? (
            <span className="pivot-tenant-journeys__muted">
              Analytics overall {formatConversionPct(funnel.overallConversionRate)}
            </span>
          ) : null}
        </div>
        {funnelMessage ? (
          <p className="pivot-lab__error" role="alert">
            {funnelMessage}
          </p>
        ) : null}
        {!funnelLoading && !intentFunnel.length && !analyticsSteps.length ? (
          <p className="pivot-lab__empty">No funnel data for this week yet.</p>
        ) : (
          <div className="pivot-tenant-journeys__funnel-grid">
            <div className="pivot-lab__panel">
              <h3 className="pivot-lab__panel-title">Intent stages</h3>
              <IntentFunnelChart stages={intentFunnel} />
            </div>
            <div className="pivot-lab__panel">
              <h3 className="pivot-lab__panel-title">Analytics steps</h3>
              {analyticsSteps.length ? (
                <AnalyticsFunnelSteps steps={analyticsSteps} />
              ) : (
                <p className="pivot-lab__empty">
                  No pivot analytics events for this week.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <section
        className="linear-section pivot-lab__section"
        aria-labelledby="pivot-journeys-inspector"
      >
        <div className="pivot-lab__section-head">
          <h2 id="pivot-journeys-inspector" className="linear-section__title">
            User inspector
          </h2>
          <Link className="pivot-tenant-journeys__link" to={curationHref}>
            Open curation
          </Link>
        </div>

        <div className="pivot-tenant-journeys__inspector">
          <div className="pivot-tenant-journeys__search">
            <label className="linear-field">
              <span className="linear-field__label">Find user</span>
              <input
                className="linear-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, username, or user id"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {usersMessage ? (
              <p className="pivot-lab__error" role="alert">
                {usersMessage}
              </p>
            ) : null}
            {searchQuery.length > 0 && searchQuery.length < 2 ? (
              <p className="pivot-tenant-journeys__muted">
                Type at least 2 characters to search.
              </p>
            ) : null}
            {!isUserSearch && committedWeekValid ? (
              <p className="pivot-tenant-journeys__list-label">
                Most active · {committedWeek}
              </p>
            ) : null}
            {isUserSearch && users.length > 0 ? (
              <p className="pivot-tenant-journeys__list-label">Search results</p>
            ) : null}
            {usersLoading ? (
              <p className="pivot-tenant-journeys__muted">
                {isUserSearch ? 'Searching…' : 'Loading active users…'}
              </p>
            ) : null}
            {!usersLoading && isUserSearch && !users.length ? (
              <p className="pivot-lab__empty">No users match “{debouncedQuery}”.</p>
            ) : null}
            {!usersLoading &&
            !isUserSearch &&
            committedWeekValid &&
            usersMode === 'active' &&
            !users.length ? (
              <p className="pivot-lab__empty">
                No users with intents in {committedWeek}.
              </p>
            ) : null}
            {users.length > 0 ? (
              <ul className="pivot-tenant-journeys__user-list" role="listbox">
                {users.map((user) => {
                  const selected = user.userId === selectedUserId;
                  return (
                    <li key={user.userId}>
                      <button
                        type="button"
                        className={`pivot-tenant-journeys__user-row${
                          selected ? ' pivot-tenant-journeys__user-row--selected' : ''
                        }`}
                        onClick={() => selectUser(user.userId)}
                        aria-selected={selected}
                      >
                        <span className="pivot-tenant-journeys__user-name">
                          {user.name || 'Unnamed'}
                          {user.username ? (
                            <span className="pivot-tenant-journeys__user-handle">
                              @{user.username}
                            </span>
                          ) : null}
                        </span>
                        {typeof user.intentCount === 'number' ? (
                          <span className="pivot-tenant-journeys__muted">
                            {user.intentCount} intent
                            {user.intentCount === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="pivot-lab__panel pivot-tenant-journeys__history">
            {!selectedUserId ? (
              <p className="pivot-lab__empty">
                Select a user to inspect week history and wipe interactions.
              </p>
            ) : (
              <>
                <div className="pivot-tenant-journeys__history-head">
                  <div>
                    <p className="pivot-tenant-journeys__history-name">
                      {history?.user?.name || 'User'}
                      {history?.user?.username ? (
                        <span className="pivot-tenant-journeys__user-handle">
                          @{history.user.username}
                        </span>
                      ) : null}
                    </p>
                    <code className="linear-code linear-code--inline">
                      {selectedUserId}
                    </code>
                  </div>
                  <div className="pivot-tenant-journeys__history-actions">
                    <button
                      type="button"
                      className="linear-btn linear-btn--ghost"
                      onClick={clearSelectedUser}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="linear-btn pivot-lab__purge-btn"
                      onClick={handleWipeWeek}
                      disabled={wipeBusy || !batchWeekValid || historyLoading}
                    >
                      {wipeBusy ? 'Wiping…' : 'Wipe interactions for week'}
                    </button>
                  </div>
                </div>

                {historyMessage ? (
                  <p className="pivot-lab__error" role="alert">
                    {historyMessage}
                  </p>
                ) : null}

                {historyLoading ? (
                  <p className="pivot-tenant-journeys__muted">Loading history…</p>
                ) : null}

                {!historyLoading && history ? (
                  <>
                    <h3 className="pivot-lab__panel-title">
                      Intents
                      {batchWeekValid ? ` · ${batchWeek}` : ''}
                      {history.intents?.length
                        ? ` (${history.intents.length})`
                        : ''}
                    </h3>
                    {!history.intents?.length ? (
                      <p className="pivot-lab__empty">
                        No intents for this user
                        {batchWeekValid ? ` in ${batchWeek}` : ''}.
                      </p>
                    ) : (
                      <ul className="pivot-tenant-journeys__timeline">
                        {history.intents.map((intent) => (
                          <li
                            key={`${intent.eventId}-${intent.updatedAt || intent.status}`}
                            className="pivot-tenant-journeys__timeline-item"
                          >
                            <div className="pivot-tenant-journeys__timeline-main">
                              <IntentStatusPill status={intent.status} />
                              <div>
                                <p className="pivot-tenant-journeys__event-name">
                                  {intent.eventName || 'Untitled event'}
                                </p>
                                <p className="pivot-tenant-journeys__event-meta">
                                  {formatEventWhen(intent.eventStartTime) || '—'}
                                  {intent.externalOpenCount > 0
                                    ? ` · ${intent.externalOpenCount} ticket open${
                                        intent.externalOpenCount === 1 ? '' : 's'
                                      }`
                                    : ''}
                                  {intent.timeSlotId
                                    ? ` · slot ${intent.timeSlotId}`
                                    : ''}
                                </p>
                              </div>
                            </div>
                            <div className="pivot-tenant-journeys__timeline-side">
                              <code className="linear-code linear-code--inline">
                                {intent.eventId.slice(-6)}
                              </code>
                              <Link
                                className="pivot-tenant-journeys__link"
                                to={curationHref}
                                title="Open curation for this week"
                              >
                                Catalog
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {history.analytics?.length ? (
                      <>
                        <h3 className="pivot-lab__panel-title">
                          Recent analytics ({history.analytics.length})
                        </h3>
                        <ul className="pivot-tenant-journeys__analytics-list">
                          {history.analytics.slice(0, 20).map((row, idx) => (
                            <li key={`${row.event}-${row.ts}-${idx}`}>
                              <code className="linear-code linear-code--inline">
                                {row.event}
                              </code>
                              <span className="pivot-tenant-journeys__muted">
                                {row.ts
                                  ? new Date(row.ts).toLocaleString()
                                  : '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </PivotTenantPage>
  );
}

export default PivotTenantJourneysPage;
