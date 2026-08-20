import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  deltaFor,
  formatDelta,
  formatRate,
  ratePointsDelta,
} from './pivotOverviewFormat';

export const CHART_COLOR = '#ff4f1f';
export const CHART_COLOR_PREV = '#ff9a78';

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

/**
 * Shared Overview panels (hero, mix, funnel, bars, top events, insights).
 * City and fleet pages supply pulse cells, captions, and event extras.
 */
function PivotOverviewPanels({
  displayCity,
  batchWeek,
  kpis,
  vsPrev,
  funnel = [],
  retentionWeeks = [],
  retentionError = null,
  retentionLoading = false,
  pulseCells = [],
  pulseAriaLabel = 'Catalog events distributed across the drop week',
  pulseDescription = '',
  activeUsersCaption = 'this week',
  crewMetrics = null,
  crewMetricsError = null,
  crewMetricsLoading = false,
  topEvents = [],
  performanceError = null,
  performanceLoading = false,
  renderEventMeta = null,
  insights = [],
  insightsError = null,
  insightsLoading = false,
}) {
  const [chartHoverSync, setChartHoverSync] = useState(null);
  const handleChartHoverSyncChange = useCallback((signal) => {
    if (!signal || signal.type === 'leave') {
      setChartHoverSync(null);
      return;
    }
    setChartHoverSync(signal);
  }, []);

  const crewKpis = crewMetrics?.kpis;
  const crewVsPrev = crewMetrics?.vsPrevWeek;

  const statusCounts = kpis?.eventCountsByStatus || {};
  const hostCreatedCounts = kpis?.hostCreatedCounts || {
    hostDraft: kpis?.hostDraft ?? 0,
    hostStaged: kpis?.hostStaged ?? 0,
    hostPublished: kpis?.hostPublished ?? 0,
  };

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

  const latestRetentionRate = useMemo(() => {
    for (let i = retentionWeeks.length - 1; i >= 0; i -= 1) {
      if (retentionWeeks[i]?.retentionRate != null) {
        return retentionWeeks[i].retentionRate;
      }
    }
    return null;
  }, [retentionWeeks]);

  return (
    <>
      <div className="pivot-tenant-overview__hero">
        <PivotOpsCard className="pivot-tenant-overview__panel pivot-tenant-overview__panel--trend">
          <div className="pivot-tenant-overview__panel-head">
            <div>
              <h2 className="pivot-ops-section__title">Active users</h2>
              <p className="pivot-ops-section__description">
                {displayCity} · last {retentionWeeks.length || 6} weeks
              </p>
            </div>
            <div className="pivot-tenant-overview__hero-stat">
              <PivotOpsAnimateNumber
                value={kpis.activeUsers ?? 0}
                className="pivot-tenant-overview__hero-value pivot-tenant-overview__soft-num"
              />
              <span className="pivot-tenant-overview__hero-meta">
                {activeUsersCaption}
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
              {pulseCells.length ? (
                <PivotOpsHeatRow
                  variant="contrib"
                  ariaLabel={pulseAriaLabel}
                  cells={pulseCells}
                  className="pivot-tenant-overview__day-heat"
                />
              ) : null}
            </div>
            <p className="pivot-ops-section__description">{pulseDescription}</p>
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
              stages={(funnel || []).map((stage) => ({
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

      <div className="pivot-tenant-overview__bottom">
        <PivotOpsSection
          title="Top events"
          titleId="pivot-tenant-top-events"
          description={`Highest interest for ${batchWeek}.`}
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
                    key={`${event.tenantKey || 'event'}-${event.eventId}`}
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
                      {typeof renderEventMeta === 'function' ? renderEventMeta(event) : null}
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
          {insightsLoading && !insights.length ? (
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
    </>
  );
}

export default PivotOverviewPanels;
export { formatRate };
