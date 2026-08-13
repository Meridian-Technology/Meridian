import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import AdminPlatformMetricChart from '../../Admin/General/AdminPlatformAnalytics/AdminPlatformMetricChart';
import {
  PivotOpsAnimateNumber,
  PivotOpsAreaFunnel,
  PivotOpsBarList,
  PivotOpsCard,
  PivotOpsHeatRow,
  PivotOpsSection,
  PivotOpsStack,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import {
  toIsoWeek,
  shiftIsoWeek,
} from '../../../utils/pivotIsoWeek';
import PivotReadinessCard from './PivotReadinessCard';
import PivotTenantPage from './PivotTenantPage';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import PivotHostLiveWeekAlert from './PivotHostLiveWeekAlert';
import usePivotBatchWeekState from './usePivotBatchWeekState';
import usePivotTenantWeekKeybinds from './usePivotTenantWeekKeybinds';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import '../PivotLab/PivotLabPage.scss';
import './PivotTenantDashboard.scss';
import './PivotTenantOverviewPage.scss';
import './PivotReadinessCard.scss';
import './PivotTenantPage.scss';

const NO_FETCH_CACHE = { enabled: false };
const CHART_COLOR = '#ff4f1f';
const CHART_COLOR_PREV = '#ff9a78';
const RETENTION_WEEKS = 6;
const TOP_EVENTS_LIMIT = 10;

function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

function InsightSeverity({ severity }) {
  const label =
    severity === 'critical' ? 'Critical' : severity === 'warn' ? 'Warn' : 'Info';
  const tone =
    severity === 'critical'
      ? 'danger'
      : severity === 'warn'
        ? 'warn'
        : 'muted';
  return <PivotOpsStatus tone={tone}>{label}</PivotOpsStatus>;
}

function deltaFor(vsPrevWeek, key) {
  const row = vsPrevWeek?.[key];
  if (!row || typeof row.delta !== 'number') return null;
  return row.delta;
}

function formatDelta(delta) {
  if (delta == null) return null;
  if (delta === 0) return 'flat vs prev';
  return `${delta > 0 ? '+' : ''}${delta} vs prev`;
}

function ratePointsDelta(vsPrevWeek, key) {
  const row = vsPrevWeek?.[key];
  if (!row || row.current == null || row.previous == null || row.delta == null) {
    return null;
  }
  const points = Math.round(row.delta * 1000) / 10;
  if (points === 0) return 'flat';
  return `${points > 0 ? '+' : ''}${points}pp`;
}

/** One-letter weekday caption; Thursday → R (MTWRFSS). */
function weekdayInitial(weekday, dateIso) {
  const raw = String(weekday || '').trim().toLowerCase();
  if (raw.startsWith('thu') || raw === 'r') return 'R';
  if (raw.startsWith('mon') || raw === 'm') return 'M';
  if (raw.startsWith('tue') || raw === 't') return 'T';
  if (raw.startsWith('wed') || raw === 'w') return 'W';
  if (raw.startsWith('fri') || raw === 'f') return 'F';
  if (raw.startsWith('sat') || raw.startsWith('sun') || raw === 's') return 'S';

  // Fallback from YYYY-MM-DD when weekday string is missing/localized oddly.
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    const day = new Date(`${dateIso}T12:00:00Z`).getUTCDay();
    return ['S', 'M', 'T', 'W', 'R', 'F', 'S'][day] || '·';
  }
  return '·';
}

/**
 * Per-tenant Overview — denser visual panels (trend, composition, bars)
 * instead of large grids of single-number cards.
 */
function PivotTenantOverviewPage({ tenantKey, cityDisplayName }) {
  const initializedWeekRef = useRef(false);
  const [chartHoverSync, setChartHoverSync] = useState(null);
  const handleChartHoverSyncChange = useCallback((signal) => {
    if (!signal || signal.type === 'leave') {
      setChartHoverSync(null);
      return;
    }
    setChartHoverSync(signal);
  }, []);
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
  const weekRangeLabel = ops?.weekRange?.label || null;
  const activeBatchWeek = drop?.batchWeek || batchWeek;
  const weekNumMatch = String(activeBatchWeek || '').match(/^(\d{4})-W(\d{2})$/i);
  const weekNumberLabel = weekNumMatch
    ? `W${Number(weekNumMatch[2])}`
    : activeBatchWeek || '—';
  const weekYearLabel = weekNumMatch ? weekNumMatch[1] : null;
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

  const crewMetrics =
    ops?.crewMetrics && !ops.crewMetrics.error ? ops.crewMetrics : null;
  const crewKpis = crewMetrics?.kpis;
  const crewVsPrev = crewMetrics?.vsPrevWeek;
  const crewMetricsError = ops?.crewMetrics?.error || null;
  const crewMetricsLoading = opsLoading && !crewMetrics;

  const selectedRetention =
    ops?.retention && !ops.retention.error ? ops.retention.tenant : null;
  const retentionError = ops?.retention?.error || null;
  const retentionLoading = opsLoading && !selectedRetention;
  const readinessLoading = opsLoading && !readiness;
  const overviewLoading = opsLoading;

  const retentionWeeks = selectedRetention?.weeks ?? [];

  const activeUsersSeries = useMemo(() => {
    if (!retentionWeeks.length) return [];
    return [
      {
        label: 'Active users',
        color: CHART_COLOR,
        data: retentionWeeks.map((week) => ({
          x: week.batchWeek,
          y: week.activeUsers ?? 0,
        })),
      },
    ];
  }, [retentionWeeks]);

  const retentionSeries = useMemo(() => {
    if (!retentionWeeks.length) return [];
    const points = retentionWeeks
      .filter((week) => week.retentionRate != null)
      .map((week) => ({
        x: week.batchWeek,
        y: week.retentionRate,
      }));
    if (!points.length) return [];
    return [
      {
        label: 'Retention',
        color: CHART_COLOR_PREV,
        strokeDasharray: '4 4',
        fillOpacity: 0,
        data: points,
      },
    ];
  }, [retentionWeeks]);

  const retentionXDomain = useMemo(
    () => retentionWeeks.map((week) => week.batchWeek),
    [retentionWeeks],
  );

  const kpis = overview?.kpis;
  const vsPrev = overview?.vsPrevWeek;
  const eventsByDay = overview?.eventsByDay || [];
  const displayCity = overview?.cityDisplayName || cityDisplayName || tenantKey;

  const dayHeatCells = useMemo(
    () =>
      eventsByDay.map((day) => ({
        key: day.date,
        label: '',
        caption: weekdayInitial(day.weekday, day.date),
        value: day.count ?? 0,
        title: `${day.weekday || 'Day'} ${day.date} · ${day.count ?? 0} event${
          (day.count ?? 0) === 1 ? '' : 's'
        }`,
      })),
    [eventsByDay],
  );

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
  const hostLiveWeekAlert = overview?.hostLiveWeekAlert || null;
  const hostCreatedCounts = kpis?.hostCreatedCounts || {
    hostDraft: kpis?.hostDraft ?? 0,
    hostStaged: kpis?.hostStaged ?? 0,
    hostPublished: kpis?.hostPublished ?? 0,
  };
  const statusCounts = kpis?.eventCountsByStatus || {};

  const catalogSegments = useMemo(
    () =>
      [
        { key: 'published', label: 'Published', value: statusCounts.published ?? 0, tone: 'accent' },
        { key: 'staged', label: 'Staged', value: statusCounts.staged ?? 0, tone: 'ink' },
        { key: 'draft', label: 'Draft', value: statusCounts.draft ?? 0, tone: 'soft' },
        { key: 'other', label: 'Other', value: statusCounts.other ?? 0, tone: 'warn' },
      ].filter((segment) => segment.value > 0),
    [statusCounts],
  );

  const hostSegments = useMemo(
    () =>
      [
        {
          key: 'published',
          label: 'Published',
          value: hostCreatedCounts.hostPublished ?? 0,
          tone: 'accent',
        },
        {
          key: 'staged',
          label: 'Staged',
          value: hostCreatedCounts.hostStaged ?? 0,
          tone: 'ink',
        },
        {
          key: 'draft',
          label: 'Draft',
          value: hostCreatedCounts.hostDraft ?? 0,
          tone: 'soft',
        },
      ].filter((segment) => segment.value > 0),
    [hostCreatedCounts],
  );

  const loopBars = useMemo(() => {
    if (!kpis) return [];
    const rows = [
      {
        key: 'calendar',
        label: 'Calendar adds',
        value: kpis.calendarAdds ?? 0,
        previous: vsPrev?.calendarAdds?.previous,
        hint: formatDelta(deltaFor(vsPrev, 'calendarAdds')),
      },
      {
        key: 'invites',
        label: 'Invites shared',
        value: kpis.inviteShares ?? 0,
        previous: vsPrev?.inviteShares?.previous,
        hint: formatDelta(deltaFor(vsPrev, 'inviteShares')),
        striped: true,
      },
      {
        key: 'interests',
        label: 'Interests saved',
        value: kpis.interestsSaved ?? 0,
        previous: vsPrev?.interestsSaved?.previous,
        hint: formatDelta(deltaFor(vsPrev, 'interestsSaved')),
      },
    ];
    const max = Math.max(
      1,
      ...rows.flatMap((row) => [row.value, row.previous ?? 0]),
    );
    return rows.map((row) => ({
      ...row,
      max,
      secondary: row.previous != null ? `prev ${row.previous}` : null,
    }));
  }, [kpis, vsPrev]);

  const crewBars = useMemo(() => {
    if (!crewKpis) return [];
    return [
      {
        key: 'creation',
        label: 'Circle creation',
        value: Math.round((crewKpis.crewCreationRate?.rate ?? 0) * 100),
        max: 100,
        hint: `${crewKpis.crewCreationRate?.usersWithCrew ?? 0}/${crewKpis.crewCreationRate?.wau ?? 0} WAU · ${ratePointsDelta(crewVsPrev, 'crewCreationRate') || '—'}`,
      },
      {
        key: 'quorum',
        label: 'Quorum hit',
        value: Math.round((crewKpis.quorumHitRate?.rate ?? 0) * 100),
        max: 100,
        hint: `${crewKpis.quorumHitRate?.quorumMet ?? 0}/${crewKpis.quorumHitRate?.activeCrews ?? 0} circles · ${ratePointsDelta(crewVsPrev, 'quorumHitRate') || '—'}`,
      },
      {
        key: 'judgement',
        label: 'Judgement confirm',
        value: Math.round((crewKpis.judgementConfirmRate?.rate ?? 0) * 100),
        max: 100,
        hint: `${crewKpis.judgementConfirmRate?.confirmed ?? 0}/${crewKpis.judgementConfirmRate?.proposed ?? 0} · ${ratePointsDelta(crewVsPrev, 'judgementConfirmRate') || '—'}`,
      },
      {
        key: 'invite',
        label: 'Invited → joined',
        value: Math.round((crewKpis.invitedJoinRate?.rate ?? 0) * 100),
        max: 100,
        hint: `${crewKpis.invitedJoinRate?.resolved ?? 0}/${crewKpis.invitedJoinRate?.sent ?? 0} · ${ratePointsDelta(crewVsPrev, 'invitedJoinRate') || '—'}`,
        striped: true,
      },
    ];
  }, [crewKpis, crewVsPrev]);

  const latestRetentionRate = useMemo(() => {
    for (let i = retentionWeeks.length - 1; i >= 0; i -= 1) {
      if (retentionWeeks[i]?.retentionRate != null) {
        return retentionWeeks[i].retentionRate;
      }
    }
    return null;
  }, [retentionWeeks]);

  const swipeCount = kpis?.swipeCount ?? 0;
  const interestSurvivors =
    (kpis?.interestedCount ?? 0) + (kpis?.registeredCount ?? 0);
  const weekInterestRate =
    swipeCount > 0 ? interestSurvivors / swipeCount : null;

  // Soften (blur) metrics as soon as the week changes; keep blurred through the
  // fetch, then unblur after a short minimum so the motion always reads.
  const metricsShouldSoften =
    batchWeek !== committedWeek ||
    (Boolean(opsLoading) &&
      overview?.batchWeek != null &&
      overview.batchWeek !== committedWeek);
  const [metricsSoftened, setMetricsSoftened] = useState(false);
  const softenStartedAtRef = useRef(0);
  useEffect(() => {
    if (metricsShouldSoften) {
      if (!metricsSoftened) softenStartedAtRef.current = Date.now();
      setMetricsSoftened(true);
      return undefined;
    }
    if (!metricsSoftened) return undefined;
    const elapsed = Date.now() - softenStartedAtRef.current;
    const remaining = Math.max(0, 320 - elapsed);
    const id = window.setTimeout(() => setMetricsSoftened(false), remaining);
    return () => window.clearTimeout(id);
  }, [metricsShouldSoften, metricsSoftened]);

  return (
    <PivotTenantPage
      title="Overview"
      tenantKey={tenantKey}
      cityDisplayName={displayCity}
      className={`pivot-tenant-overview${
        metricsSoftened ? ' pivot-tenant-overview--metrics-softened' : ''
      }`}
      actions={
        <>
          <PivotBatchWeekPicker
            batchWeek={batchWeek}
            onChange={setBatchWeek}
            keyboardNavActive={keyboardNavActive}
            anchors={ops?.anchors}
            dropDayOfWeek={dropDayOfWeek}
            timeZone={dropTimeZone}
            pending={batchWeek !== committedWeek || metricsSoftened}
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

      <div className="pivot-tenant-overview__mast">
        {drop || activeBatchWeek ? (
          <PivotOpsCard
            as="aside"
            className="pivot-tenant-overview__drop"
            aria-label={`Batch week ${activeBatchWeek || ''}`}
          >
            <div className="pivot-tenant-overview__drop-week">
              <p className="pivot-tenant-overview__drop-week-num">
                {weekNumMatch ? (
                  <>
                    <span aria-hidden>W</span>
                    <PivotOpsAnimateNumber
                      value={Number(weekNumMatch[2])}
                      format={{ useGrouping: false }}
                      className="pivot-tenant-overview__soft-num"
                      aria-hidden
                    />
                    <span className="pivot-tenant-overview__sr-only">
                      {weekNumberLabel}
                    </span>
                  </>
                ) : (
                  weekNumberLabel
                )}
                {weekYearLabel ? (
                  <span className="pivot-tenant-overview__drop-week-year">
                    {weekYearLabel}
                  </span>
                ) : null}
              </p>
              <p className="pivot-tenant-overview__drop-week-range">
                {weekRangeLabel || activeBatchWeek || '—'}
              </p>
            </div>
            {drop ? (
              <div className="pivot-tenant-overview__drop-next">
                <p className="pivot-tenant-overview__drop-label">Next drop</p>
                <p className="pivot-tenant-overview__drop-value">
                  {drop.nextDropFormatted || drop.nextDropAt || '—'}
                </p>
                <div className="pivot-tenant-overview__drop-meta">
                  {drop.localSchedule ? <span>{drop.localSchedule}</span> : null}
                  {drop.timezone ? <span>{drop.timezone}</span> : null}
                </div>
              </div>
            ) : null}
          </PivotOpsCard>
        ) : null}
        <PivotReadinessCard
          readiness={readiness}
          loading={readinessLoading}
          compact
          className="pivot-tenant-overview__readiness"
        />
      </div>

      <PivotHostLiveWeekAlert alert={hostLiveWeekAlert} />

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
        <>
          <div className="pivot-tenant-overview__hero">
            <PivotOpsCard className="pivot-tenant-overview__panel pivot-tenant-overview__panel--trend">
              <div className="pivot-tenant-overview__panel-head">
                <div>
                  <h2 className="pivot-ops-section__title">Active users</h2>
                  <p className="pivot-ops-section__description">
                    {displayCity} · last {retentionWeeks.length || RETENTION_WEEKS} weeks
                  </p>
                </div>
                <div className="pivot-tenant-overview__hero-stat">
                  <PivotOpsAnimateNumber
                    value={kpis.activeUsers ?? 0}
                    className="pivot-tenant-overview__hero-value pivot-tenant-overview__soft-num"
                  />
                  <span className="pivot-tenant-overview__hero-meta">
                    this week
                    {formatDelta(deltaFor(vsPrev, 'activeUsers'))
                      ? ` · ${formatDelta(deltaFor(vsPrev, 'activeUsers'))}`
                      : ''}
                    {latestRetentionRate != null
                      ? ` · ${latestRetentionRate}% retained`
                      : ''}
                  </span>
                </div>
              </div>
              {retentionError ? (
                <p className="pivot-lab__error">{retentionError}</p>
              ) : null}
              {retentionLoading && !activeUsersSeries.length ? (
                <p className="pivot-lab__empty">Loading trend…</p>
              ) : (
                <div className="pivot-tenant-overview__trend-chart">
                  <AdminPlatformMetricChart
                    title=""
                    series={activeUsersSeries}
                    granularity="week"
                    height={200}
                    emptyMessage="No weekly activity yet"
                    margin={{ top: 8, right: 0, bottom: 22, left: 0 }}
                    edgeToEdge
                    hideYAxis
                    xDomain={retentionXDomain}
                    syncId="pivot-overview-active-users"
                    hoverSyncSignal={chartHoverSync}
                    onHoverSyncChange={handleChartHoverSyncChange}
                  />
                  {retentionSeries.length ? (
                    <div className="pivot-tenant-overview__retention-spark">
                      <div className="pivot-tenant-overview__retention-spark-head">
                        <span>Retention</span>
                        {latestRetentionRate != null ? (
                          <PivotOpsAnimateNumber
                            value={latestRetentionRate}
                            suffix="%"
                            format={{
                              maximumFractionDigits: 1,
                              useGrouping: false,
                            }}
                            className="pivot-tenant-overview__soft-num"
                          />
                        ) : (
                          <span className="pivot-tenant-overview__soft-num">—</span>
                        )}
                      </div>
                      <AdminPlatformMetricChart
                        title=""
                        series={retentionSeries}
                        granularity="week"
                        height={72}
                        emptyMessage="No retention yet"
                        margin={{ top: 4, right: 0, bottom: 4, left: 0 }}
                        dashedLineBackdropStroke="#ffffff"
                        edgeToEdge
                        hideXAxis
                        hideYAxis
                        showArea={false}
                        yDomain={[0, 100]}
                        xDomain={retentionXDomain}
                        syncId="pivot-overview-retention"
                        hoverSyncSignal={chartHoverSync}
                        onHoverSyncChange={handleChartHoverSyncChange}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </PivotOpsCard>

            <div className="pivot-tenant-overview__hero-side">
              <PivotOpsCard className="pivot-tenant-overview__panel">
                <div className="pivot-tenant-overview__pulse-head">
                  <h2 className="pivot-ops-section__title">Week pulse</h2>
                  {dayHeatCells.length ? (
                    <PivotOpsHeatRow
                      variant="contrib"
                      ariaLabel="Catalog events distributed across the drop week"
                      cells={dayHeatCells}
                      className="pivot-tenant-overview__day-heat"
                    />
                  ) : null}
                </div>
                <p className="pivot-ops-section__description">
                  {overview.batchWeek || batchWeek}
                  {weekInterestRate != null
                    ? ` · ${formatRate(weekInterestRate)} interest on ${swipeCount} swipes`
                    : ''}
                </p>
                <dl className="pivot-tenant-overview__pulse-grid">
                  <div>
                    <dt>Published events</dt>
                    <dd>
                      <PivotOpsAnimateNumber
                        value={kpis.eventCount ?? 0}
                        className="pivot-tenant-overview__soft-num"
                      />
                      <span>{formatDelta(deltaFor(vsPrev, 'eventCount')) || ' '}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Going</dt>
                    <dd>
                      <PivotOpsAnimateNumber
                        value={kpis.registeredCount ?? 0}
                        className="pivot-tenant-overview__soft-num"
                      />
                      <span>{formatDelta(deltaFor(vsPrev, 'registeredCount')) || ' '}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Ticket openers</dt>
                    <dd>
                      <PivotOpsAnimateNumber
                        value={kpis.externalOpenUsers ?? 0}
                        className="pivot-tenant-overview__soft-num"
                      />
                      <span>
                        {kpis.externalOpenCount ?? 0} opens
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Feedback</dt>
                    <dd>
                      {kpis.feedbackAvg != null ? (
                        <PivotOpsAnimateNumber
                          value={kpis.feedbackAvg}
                          format={{
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 1,
                          }}
                          className="pivot-tenant-overview__soft-num"
                        />
                      ) : (
                        <span className="pivot-tenant-overview__soft-num">—</span>
                      )}
                      <span>{kpis.feedbackCount ?? 0} ratings</span>
                    </dd>
                  </div>
                </dl>
              </PivotOpsCard>

              <PivotOpsCard className="pivot-tenant-overview__panel">
                <PivotOpsStack
                  title="Catalog mix"
                  segments={catalogSegments}
                  ariaLabel="Catalog events by status"
                />
              </PivotOpsCard>

              <PivotOpsCard className="pivot-tenant-overview__panel">
                <PivotOpsStack
                  title="Host-created mix"
                  segments={hostSegments}
                  ariaLabel="Host-created listings by status"
                />
              </PivotOpsCard>
            </div>
          </div>

          <div className="pivot-tenant-overview__mid">
            <PivotOpsCard className="pivot-tenant-overview__panel pivot-tenant-overview__panel--loop">
              <h2 className="pivot-ops-section__title">This week&apos;s loop</h2>
              <p className="pivot-ops-section__description">
                Swipe → interest → ticket → going
              </p>
              <div className="pivot-tenant-overview__funnel-wrap">
                <PivotOpsAreaFunnel
                  stages={(overview.funnel || []).map((stage) => ({
                    ...stage,
                    label:
                      stage.key === 'openers'
                        ? 'Openers'
                        : stage.label,
                  }))}
                  ariaLabel="Weekly conversion funnel"
                  fill
                />
              </div>
            </PivotOpsCard>

            <PivotOpsCard className="pivot-tenant-overview__panel">
              <h2 className="pivot-ops-section__title">Engagement depth</h2>
              <p className="pivot-ops-section__description">
                Counts vs prior week (prev shown under value)
              </p>
              <PivotOpsBarList
                items={loopBars}
                ariaLabel="Engagement counts"
                className="pivot-tenant-overview__bars"
              />
            </PivotOpsCard>

            <PivotOpsCard className="pivot-tenant-overview__panel">
              <h2 className="pivot-ops-section__title">Circle coordination</h2>
              <p className="pivot-ops-section__description">
                {crewMetrics?.totalCrews != null
                  ? `${crewMetrics.totalCrews} active circle${
                      crewMetrics.totalCrews === 1 ? '' : 's'
                    }`
                  : 'Rate metrics for this week'}
                {crewKpis?.crossCrewSurfaces
                  ? ` · ${crewKpis.crossCrewSurfaces.views ?? 0} cross-circle views / ${crewKpis.crossCrewSurfaces.clicks ?? 0} clicks`
                  : ''}
              </p>
              {crewMetricsError ? (
                <p className="pivot-lab__error" role="alert">
                  {typeof crewMetricsError === 'string'
                    ? crewMetricsError
                    : 'Unable to load circle metrics.'}
                </p>
              ) : null}
              {crewMetricsLoading && !crewKpis ? (
                <p className="pivot-lab__empty">Loading circle metrics…</p>
              ) : null}
              {crewBars.length ? (
                <PivotOpsBarList
                  items={crewBars}
                  ariaLabel="Circle rate metrics"
                  valueFormat={(v) => `${v}%`}
                  className="pivot-tenant-overview__bars"
                />
              ) : !crewMetricsLoading ? (
                <p className="pivot-lab__empty">No circle metrics for this week.</p>
              ) : null}
            </PivotOpsCard>
          </div>
        </>
      ) : null}

      {!overviewLoading && overview && !kpis ? (
        <p className="pivot-lab__empty">No metrics for this week yet.</p>
      ) : null}

      <div className="pivot-tenant-overview__bottom">
        <PivotOpsSection
          title="Top events"
          titleId="pivot-tenant-top-events"
          description={`Highest interest for ${overview?.batchWeek || batchWeek}.`}
          className="pivot-tenant-overview__events"
        >
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
            <div
              className="pivot-tenant-overview__event-rail"
              role="list"
              aria-label="Top events by interested survivors"
            >
              {topEvents.map((event) => {
                const name = event.name || 'Untitled';
                const interested = event.interestedTotal ?? 0;
                return (
                  <article
                    key={event.eventId}
                    className="pivot-tenant-overview__event-card"
                    role="listitem"
                  >
                    <div className="pivot-tenant-overview__event-media">
                      {event.image ? (
                        <img src={event.image} alt="" loading="lazy" />
                      ) : (
                        <div
                          className="pivot-tenant-overview__event-media-fallback"
                          aria-hidden="true"
                        >
                          {name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="pivot-tenant-overview__event-card-body">
                      <h3 className="pivot-tenant-overview__event-card-title">
                        {name}
                      </h3>
                      <p className="pivot-tenant-overview__event-card-stat">
                        <PivotOpsAnimateNumber
                          value={interested}
                          className="pivot-tenant-overview__soft-num"
                        />{' '}
                        interested
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !performanceLoading ? (
            <p className="pivot-lab__empty">No catalog events for this week yet.</p>
          ) : null}
        </PivotOpsSection>

        <PivotOpsSection
          title="Needs attention"
          titleId="pivot-tenant-insights"
          description="Only issues that need a look this week."
          className="pivot-tenant-overview__insights-slot"
        >
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
                    <h3 className="pivot-tenant-overview__insight-title">
                      {insight.title}
                    </h3>
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
              Nothing flagged. Catalog and engagement look steady.
            </p>
          ) : null}
        </PivotOpsSection>
      </div>
    </PivotTenantPage>
  );
}

export default PivotTenantOverviewPage;
