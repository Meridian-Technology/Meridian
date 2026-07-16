import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import AdminPlatformMetricChart from '../../Admin/General/AdminPlatformAnalytics/AdminPlatformMetricChart';
import {
  toIsoWeek,
  isValidIsoWeek,
  shiftIsoWeek,
  formatEventWhen,
} from '../../../utils/pivotIsoWeek';
import PivotReadinessCard from './PivotReadinessCard';
import PivotTenantPage from './PivotTenantPage';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import usePivotBatchWeekState from './usePivotBatchWeekState';
import usePivotTenantWeekKeybinds from './usePivotTenantWeekKeybinds';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import '../PivotLab/PivotLabPage.scss';
import './PivotTenantDashboard.scss';
import './PivotTenantOverviewPage.scss';
import './PivotReadinessCard.scss';
import './PivotTenantPage.scss';

const NO_FETCH_CACHE = { enabled: false };
const CHART_COLOR = '#5e6ad2'; // --la-accent
const RETENTION_WEEKS = 6;
const TOP_EVENTS_LIMIT = 10;

function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

function InsightSeverity({ severity }) {
  const label =
    severity === 'critical' ? 'Critical' : severity === 'warn' ? 'Warn' : 'Info';
  const mod =
    severity === 'critical' || severity === 'warn'
      ? 'pivot-lab__pill--warn'
      : 'pivot-lab__pill--muted';
  return <span className={`pivot-lab__pill ${mod}`}>{label}</span>;
}

function MetricCard({ label, value, hint, delta }) {
  return (
    <div className="linear-stat pivot-lab__metric">
      <span className="linear-stat__label">{label}</span>
      <span className="linear-stat__value">{value}</span>
      {hint ? <span className="pivot-lab__metric-hint">{hint}</span> : null}
      {delta != null ? (
        <span
          className={`pivot-tenant-overview__delta${
            delta > 0
              ? ' pivot-tenant-overview__delta--up'
              : delta < 0
                ? ' pivot-tenant-overview__delta--down'
                : ''
          }`}
        >
          {delta > 0 ? '+' : ''}
          {delta} vs prev
        </span>
      ) : null}
    </div>
  );
}

function formatPercent(numerator, denominator) {
  if (!denominator) return null;
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/** Funnel from API stages (Task 2.1) with Lab stage-over-stage conversion. */
function FunnelChart({ stages }) {
  const max = Math.max(1, ...(stages || []).map((stage) => stage.value ?? 0));

  if (!stages?.length) return null;

  return (
    <div className="pivot-lab__funnel" role="img" aria-label="Weekly conversion funnel">
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

function formatStatusBreakdown(counts) {
  if (!counts) return null;
  const parts = [];
  if (counts.published) parts.push(`${counts.published} published`);
  if (counts.staged) parts.push(`${counts.staged} staged`);
  if (counts.draft) parts.push(`${counts.draft} draft`);
  if (counts.other) parts.push(`${counts.other} other`);
  return parts.length ? parts.join(' · ') : 'no catalog events';
}

function deltaFor(vsPrevWeek, key) {
  const row = vsPrevWeek?.[key];
  if (!row || typeof row.delta !== 'number') return null;
  return row.delta;
}

/**
 * Per-tenant Overview — city KPIs, funnel, active-users trend, next-drop callout,
 * top events, and actionable insights.
 */
function PivotTenantOverviewPage({ tenantKey, cityDisplayName }) {
  const initializedWeekRef = useRef(false);
  const {
    batchWeek,
    committedWeek,
    setBatchWeek,
    batchWeekValid,
    committedWeekValid,
  } = usePivotBatchWeekState(() => toIsoWeek());

  const opsParams = useMemo(
    () => ({
      batchWeek: committedWeek,
      include: 'overview',
      performanceLimit: TOP_EVENTS_LIMIT,
      retentionWeeks: RETENTION_WEEKS,
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
  } = useFetch(opsUrl, {
    params: opsParams,
    cache: NO_FETCH_CACHE,
  });

  const ops = opsResponse?.success ? opsResponse.data : null;

  useEffect(() => {
    if (initializedWeekRef.current) return;
    if (!ops?.anchors?.liveWeek) return;
    initializedWeekRef.current = true;
    setBatchWeek(ops.anchors.liveWeek, { immediate: true });
  }, [ops?.anchors?.liveWeek, setBatchWeek]);

  const overview = ops?.overview && !ops.overview.error ? ops.overview : null;
  const drop = overview?.dropSchedule || ops?.dropSchedule;
  const dropDayOfWeek = ops?.weekRange?.dropDayOfWeek ?? drop?.dayOfWeek ?? 4;
  const dropTimeZone = ops?.weekRange?.timeZone ?? drop?.timezone ?? 'UTC';
  const readiness = ops?.readiness && !ops.readiness.error ? ops.readiness : null;
  const overviewMessage =
    opsError ||
    (opsResponse && !opsResponse.success
      ? opsResponse.message || 'Unable to load overview.'
      : null) ||
    (ops?.overview?.error ? ops.overview.error : null);

  const performance = ops?.performance && !ops.performance.error ? ops.performance : null;
  const topEvents = performance?.events ?? [];
  const performanceError = ops?.performance?.error || null;
  const performanceLoading = opsLoading && !performance;

  const insightsPayload = ops?.insights && !ops.insights.error ? ops.insights : null;
  const insights = insightsPayload?.insights ?? [];
  const insightsError = ops?.insights?.error || null;
  const insightsLoading = opsLoading && !insightsPayload;

  const selectedRetention =
    ops?.retention && !ops.retention.error ? ops.retention.tenant : null;
  const retentionError = ops?.retention?.error || null;
  const retentionLoading = opsLoading && !selectedRetention;
  const readinessLoading = opsLoading && !readiness;
  const overviewLoading = opsLoading;

  const activeUsersSeries = useMemo(() => {
    const weeks = selectedRetention?.weeks ?? [];
    if (!weeks.length) return [];
    return [
      {
        label: 'Active users',
        color: CHART_COLOR,
        data: weeks.map((week) => ({ x: week.batchWeek, y: week.activeUsers ?? 0 })),
      },
    ];
  }, [selectedRetention]);

  const stepBatchWeek = useCallback((delta) => {
    setBatchWeek((current) => {
      const next = shiftIsoWeek(current, delta);
      return next || current;
    });
  }, [setBatchWeek]);

  const { keyboardNavActive } = usePivotTenantWeekKeybinds({
    enabled: batchWeekValid,
    onStepWeek: stepBatchWeek,
    onRefresh: refetchOps,
  });

  const kpis = overview?.kpis;
  const vsPrev = overview?.vsPrevWeek;
  const displayCity = overview?.cityDisplayName || cityDisplayName || tenantKey;

  const feedbackLabel =
    kpis?.feedbackAvg != null
      ? `${kpis.feedbackAvg} (${kpis.feedbackCount ?? 0})`
      : '—';

  const eventHint = formatStatusBreakdown(kpis?.eventCountsByStatus);

  return (
    <PivotTenantPage
      title="Overview"
      tenantKey={tenantKey}
      cityDisplayName={displayCity}
      className="pivot-tenant-overview"
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
            onClick={() => refetchOps()}
            disabled={!opsUrl || overviewLoading}
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

      {drop ? (
        <aside className="pivot-tenant-overview__drop" aria-label="Next drop">
          <div>
            <p className="pivot-tenant-overview__drop-label">Next drop</p>
            <p className="pivot-tenant-overview__drop-value">
              {drop.nextDropFormatted || drop.nextDropAt || '—'}
            </p>
          </div>
          <div className="pivot-tenant-overview__drop-meta">
            <span>
              Week <strong>{drop.batchWeek || batchWeek}</strong>
            </span>
            {drop.localSchedule ? <span>{drop.localSchedule}</span> : null}
            {drop.timezone ? <span>{drop.timezone}</span> : null}
          </div>
        </aside>
      ) : null}

      <PivotReadinessCard
        readiness={readiness}
        loading={readinessLoading}
        compact
      />

      {overviewLoading && !overview ? (
        <p className="pivot-lab__empty">Loading overview…</p>
      ) : null}

      {overviewMessage && !overview ? (
        <p className="pivot-lab__error" role="alert">
          {typeof overviewMessage === 'string'
            ? overviewMessage
            : 'Unable to load overview for this city.'}
        </p>
      ) : null}

      {overview && kpis ? (
        <section className="linear-section pivot-lab__section" aria-labelledby="pivot-tenant-kpis">
          <h2 id="pivot-tenant-kpis" className="linear-section__title">
            {displayCity} · {overview.batchWeek || batchWeek}
          </h2>
          <div className="pivot-lab__kpi-grid">
            <MetricCard
              label="Active users"
              value={kpis.activeUsers ?? 0}
              hint="swiped this week"
              delta={deltaFor(vsPrev, 'activeUsers')}
            />
            <MetricCard
              label="Published events"
              value={kpis.eventCount ?? 0}
              hint={eventHint}
              delta={deltaFor(vsPrev, 'eventCount')}
            />
            <MetricCard
              label="Interested"
              value={kpis.interestedCount ?? 0}
              delta={deltaFor(vsPrev, 'interestedCount')}
            />
            <MetricCard
              label="Going"
              value={kpis.registeredCount ?? 0}
              delta={deltaFor(vsPrev, 'registeredCount')}
            />
            <MetricCard
              label="Ticket openers"
              value={kpis.externalOpenUsers ?? 0}
              hint={`${kpis.externalOpenCount ?? 0} total opens`}
              delta={deltaFor(vsPrev, 'externalOpenUsers')}
            />
            <MetricCard
              label="Feedback avg"
              value={feedbackLabel}
              hint="ratings from going"
            />
          </div>
          <div className="pivot-lab__overview-grid">
            <div className="pivot-lab__panel">
              <h3 className="pivot-lab__panel-title">This week&apos;s loop</h3>
              <FunnelChart stages={overview.funnel} />
              <div className="pivot-lab__engagement-row">
                <MetricCard
                  label="Calendar adds"
                  value={kpis.calendarAdds ?? 0}
                  delta={deltaFor(vsPrev, 'calendarAdds')}
                />
                <MetricCard
                  label="Invites shared"
                  value={kpis.inviteShares ?? 0}
                  delta={deltaFor(vsPrev, 'inviteShares')}
                />
                <MetricCard
                  label="Interests saved"
                  value={kpis.interestsSaved ?? 0}
                  delta={deltaFor(vsPrev, 'interestsSaved')}
                />
              </div>
            </div>
            <div className="pivot-lab__panel">
              {retentionError ? (
                <p className="pivot-lab__error">{retentionError}</p>
              ) : null}
              {retentionLoading && !activeUsersSeries.length ? (
                <p className="pivot-lab__empty">Loading trend…</p>
              ) : (
                <AdminPlatformMetricChart
                  title="Active users by week"
                  series={activeUsersSeries}
                  granularity="week"
                  height={180}
                  emptyMessage="No weekly activity yet"
                />
              )}
              {selectedRetention?.weeks?.length ? (
                <p className="pivot-tenant-overview__retention-hint">
                  Latest retention:{' '}
                  {(() => {
                    const last = selectedRetention.weeks[selectedRetention.weeks.length - 1];
                    if (last?.retentionRate == null) return '— (need prior week)';
                    return `${last.retentionRate}% returned from prior week`;
                  })()}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {!overviewLoading && overview && !kpis ? (
        <p className="pivot-lab__empty">No metrics for this week yet.</p>
      ) : null}

      <section
        className="linear-section pivot-lab__section"
        aria-labelledby="pivot-tenant-top-events"
      >
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="pivot-tenant-top-events" className="linear-section__title">
              Top events
            </h2>
            <p className="pivot-lab__section-hint">
              Ranked by right-swipe survivors (interested + registered) for{' '}
              {overview?.batchWeek || batchWeek}.
            </p>
          </div>
        </div>
        {performanceError ? (
          <p className="pivot-lab__error" role="alert">
            {typeof performanceError === 'string'
              ? performanceError
              : 'Unable to load event performance.'}
          </p>
        ) : null}
        {performanceLoading && !topEvents.length ? (
          <p className="pivot-lab__empty">Loading top events…</p>
        ) : topEvents.length ? (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Status</th>
                  <th scope="col">Interested</th>
                  <th scope="col">Going</th>
                  <th scope="col">Passed</th>
                  <th scope="col" title="Total ticket link opens">
                    Opens
                  </th>
                  <th scope="col" title="Right-swipe survivors / swipes">
                    Interest %
                  </th>
                  <th scope="col" title="Unique openers / interested survivors">
                    Ticket %
                  </th>
                </tr>
              </thead>
              <tbody>
                {topEvents.map((event) => (
                  <tr key={event.eventId}>
                    <td>
                      <div className="pivot-tenant-overview__event-name">
                        {event.name || 'Untitled'}
                      </div>
                      <div className="pivot-tenant-overview__event-when">
                        {formatEventWhen(event.start_time)}
                      </div>
                    </td>
                    <td>
                      <span className="pivot-lab__pill">{event.ingestStatus || '—'}</span>
                    </td>
                    <td>{event.interestedTotal ?? 0}</td>
                    <td>{event.registered ?? 0}</td>
                    <td>{event.passed ?? 0}</td>
                    <td>
                      {event.externalOpen ?? 0}
                      {event.externalOpenUsers
                        ? ` (${event.externalOpenUsers} users)`
                        : ''}
                    </td>
                    <td>{formatRate(event.interestRate)}</td>
                    <td>{formatRate(event.ticketOpenRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !performanceLoading ? (
          <p className="pivot-lab__empty">No catalog events for this week yet.</p>
        ) : null}
      </section>

      <section
        className="linear-section pivot-lab__section pivot-tenant-overview__insights-slot"
        aria-labelledby="pivot-tenant-insights"
      >
        <div className="pivot-lab__section-head">
          <div>
            <h2 id="pivot-tenant-insights" className="linear-section__title">
              Needs attention
            </h2>
            <p className="pivot-lab__section-hint">
              Server-side rules for this city and week — only issues that need a look.
            </p>
          </div>
        </div>
        {insightsError ? (
          <p className="pivot-lab__error" role="alert">
            {typeof insightsError === 'string'
              ? insightsError
              : 'Unable to load insights.'}
          </p>
        ) : null}
        {insightsLoading && !insightsPayload ? (
          <p className="pivot-lab__empty">Checking for issues…</p>
        ) : insights.length ? (
          <ul className="pivot-tenant-overview__insight-list">
            {insights.map((insight) => (
              <li
                key={insight.id}
                className={`pivot-tenant-overview__insight pivot-tenant-overview__insight--${insight.severity || 'info'}`}
              >
                <div className="pivot-tenant-overview__insight-head">
                  <InsightSeverity severity={insight.severity} />
                  <h3 className="pivot-tenant-overview__insight-title">{insight.title}</h3>
                </div>
                <p className="pivot-tenant-overview__insight-body">{insight.body}</p>
                {insight.href ? (
                  <Link
                    className="linear-btn linear-btn--secondary pivot-tenant-overview__insight-link"
                    to={insight.href}
                  >
                    {insight.action?.label || 'Open'}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !insightsLoading ? (
          <p className="pivot-lab__empty pivot-tenant-overview__insights-clear">
            Nothing flagged for this week. Catalog and engagement look steady.
          </p>
        ) : null}
      </section>
    </PivotTenantPage>
  );
}

export default PivotTenantOverviewPage;
