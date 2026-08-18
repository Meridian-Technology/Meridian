import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { toIsoWeek, shiftIsoWeek } from '../../../utils/pivotIsoWeek';
import PivotTenantPage from './PivotTenantPage';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import PivotOverviewPanels, { formatRate } from './PivotOverviewPanels';
import PivotFleetReadinessCard from './PivotFleetReadinessCard';
import usePivotBatchWeekState from './usePivotBatchWeekState';
import usePivotTenantWeekKeybinds from './usePivotTenantWeekKeybinds';
import useOverviewMetricsSoften from './useOverviewMetricsSoften';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import { PivotOpsAnimateNumber, PivotOpsBanner, PivotOpsCard } from '../../../components/PivotOps';
import '../PivotLab/PivotLabPage.scss';
import './PivotTenantDashboard.scss';
import './PivotTenantOverviewPage.scss';
import './PivotFleetOverviewPage.scss';
import './PivotReadinessCard.scss';
import './PivotTenantPage.scss';

const NO_FETCH_CACHE = { enabled: false };
const RETENTION_WEEKS = 6;
const TOP_EVENTS_LIMIT = 10;

function cityCaption(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '·';
  return trimmed.slice(0, 1).toUpperCase();
}

/**
 * Fleet Overview — same panels as the city page, rolled up across pivot tenants.
 */
function PivotFleetOverviewPage() {
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
  const opsUrl = committedWeekValid ? '/admin/pivot/ops' : null;

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
  const dropDayOfWeek = ops?.weekRange?.dropDayOfWeek ?? 1;
  const dropTimeZone = ops?.weekRange?.timeZone ?? 'UTC';
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
  const crewMetricsError = ops?.crewMetrics?.error || null;
  const crewMetricsLoading = opsLoading && !crewMetrics;

  const selectedRetention =
    ops?.retention && !ops.retention.error ? ops.retention.tenant : null;
  const retentionError = ops?.retention?.error || null;
  const retentionLoading = opsLoading && !selectedRetention;
  const readinessLoading = opsLoading && !readiness;
  const overviewLoading = opsLoading;

  const retentionWeeks = selectedRetention?.weeks ?? [];
  const kpis = overview?.kpis;
  const vsPrev = overview?.vsPrevWeek;
  const failedTenants = ops?.failedTenants || [];
  const hostAlerts = overview?.hostLiveWeekAlerts || [];
  const cityRows = ops?.tenants || [];

  const cityHeatCells = useMemo(
    () =>
      (overview?.cityContribution || []).map((city) => ({
        key: city.tenantKey,
        label: '',
        caption: cityCaption(city.cityDisplayName || city.tenantKey),
        value: city.activeUsers ?? 0,
        title: `${city.cityDisplayName || city.tenantKey} · ${city.activeUsers ?? 0} city-active`,
      })),
    [overview?.cityContribution],
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

  const swipeCount = kpis?.swipeCount ?? 0;
  const interestSurvivors =
    (kpis?.interestedCount ?? 0) + (kpis?.registeredCount ?? 0);
  const weekInterestRate =
    swipeCount > 0 ? interestSurvivors / swipeCount : null;

  const metricsShouldSoften =
    batchWeek !== committedWeek ||
    (Boolean(opsLoading) &&
      overview?.batchWeek != null &&
      overview.batchWeek !== committedWeek);
  const metricsSoftened = useOverviewMetricsSoften(metricsShouldSoften);

  const pulseDescription = `${overview?.batchWeek || batchWeek}${
    weekInterestRate != null
      ? ` · ${formatRate(weekInterestRate)} interest on ${swipeCount} swipes`
      : ''
  } · city-active users`;

  return (
    <PivotTenantPage
      title="Overview"
      tenantKey=""
      cityDisplayName="All cities"
      className={`pivot-tenant-overview pivot-fleet-overview${
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

      {failedTenants.length ? (
        <p className="pivot-lab__error" role="status">
          {failedTenants.length === 1
            ? `${failedTenants[0].cityDisplayName || failedTenants[0].tenantKey} failed to load.`
            : `${failedTenants.length} cities failed to load and are excluded from totals.`}
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
                {weekRangeLabel || activeBatchWeek || 'ISO week'}
              </p>
            </div>
            {drop ? (
              <div className="pivot-tenant-overview__drop-next">
                <p className="pivot-tenant-overview__drop-label">Next drop</p>
                <p className="pivot-tenant-overview__drop-value">
                  {drop.nextDropFormatted || drop.nextDropAt || '—'}
                </p>
                <div className="pivot-tenant-overview__drop-meta">
                  {drop.cityDisplayName ? <span>{drop.cityDisplayName}</span> : null}
                  {drop.timezone ? <span>{drop.timezone}</span> : null}
                </div>
              </div>
            ) : null}
          </PivotOpsCard>
        ) : null}
        <PivotFleetReadinessCard
          readiness={readiness}
          loading={readinessLoading}
          className="pivot-tenant-overview__readiness"
        />
      </div>

      {hostAlerts.length ? (
        <PivotOpsBanner
          tone="accent"
          role="alert"
          title="Live week — host drafts need review"
          className="pivot-fleet-overview__host-alert"
        >
          <p>
            {hostAlerts
              .map((alert) => alert.cityDisplayName || alert.tenantKey)
              .join(', ')}{' '}
            {hostAlerts.length === 1 ? 'has' : 'have'} host-created drafts on a
            live week.
          </p>
        </PivotOpsBanner>
      ) : null}

      {cityRows.length ? (
        <nav className="pivot-fleet-overview__city-rail" aria-label="Cities">
          {cityRows.map((city) => (
            <Link
              key={city.tenantKey}
              className="pivot-fleet-overview__city-card"
              to={`/platform-admin/pivot/${encodeURIComponent(city.tenantKey)}`}
            >
              <span className="pivot-fleet-overview__city-name">
                {city.cityDisplayName || city.tenantKey}
              </span>
              <span className="pivot-fleet-overview__city-meta">
                {city.activeUsers ?? 0} city-active
                {city.score != null ? ` · ${city.score}/100` : ''}
                {city.insightCount ? ` · ${city.insightCount} issue${city.insightCount === 1 ? '' : 's'}` : ''}
                {city.error ? ' · metrics error' : ''}
              </span>
            </Link>
          ))}
        </nav>
      ) : null}

      {overviewLoading && !overview ? (
        <p className="pivot-lab__empty">Loading overview…</p>
      ) : null}

      {overviewMessage && !overview ? (
        <p className="pivot-lab__error" role="alert">
          {typeof overviewMessage === 'string'
            ? overviewMessage
            : 'Unable to load fleet overview.'}
        </p>
      ) : null}

      {overview && kpis ? (
        <PivotOverviewPanels
          displayCity="All cities"
          batchWeek={overview.batchWeek || batchWeek}
          kpis={kpis}
          vsPrev={vsPrev}
          funnel={overview.funnel || []}
          retentionWeeks={retentionWeeks}
          retentionError={retentionError}
          retentionLoading={retentionLoading}
          pulseCells={cityHeatCells}
          pulseAriaLabel="City-active users across pivot cities"
          pulseDescription={pulseDescription}
          activeUsersCaption="city-active this week"
          crewMetrics={crewMetrics}
          crewMetricsError={crewMetricsError}
          crewMetricsLoading={crewMetricsLoading}
          topEvents={topEvents}
          performanceError={performanceError}
          performanceLoading={performanceLoading}
          renderEventMeta={(event) =>
            event.cityDisplayName ? (
              <p className="pivot-fleet-overview__event-city">{event.cityDisplayName}</p>
            ) : null
          }
          insights={insights}
          insightsError={insightsError}
          insightsLoading={insightsLoading}
        />
      ) : null}

      {!overviewLoading && overview && !kpis ? (
        <p className="pivot-lab__empty">No metrics for this week yet.</p>
      ) : null}
    </PivotTenantPage>
  );
}

export default PivotFleetOverviewPage;
