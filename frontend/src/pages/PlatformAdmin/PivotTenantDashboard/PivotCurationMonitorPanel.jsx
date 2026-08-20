import React from 'react';
import {
  PivotOpsAnimateNumber,
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
} from '../../../components/PivotOps';

function formatRate(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return '—';
  return `${Math.round(Number(rate) * 100)}%`;
}

/**
 * Live / post-mortem week KPIs. Per-event rates live in the catalog sheet
 * so they stay next to the rows you can actually edit.
 */
function PivotCurationMonitorPanel({
  stage,
  overview,
  overviewLoading,
  journey,
  journeyLoading,
}) {
  const kpis = overview?.kpis;
  const swipeCount = kpis?.swipeCount ?? 0;
  const interestedSurvivors = (kpis?.interestedCount ?? 0) + (kpis?.registeredCount ?? 0);
  const weekInterestRate =
    swipeCount > 0 ? interestedSurvivors / swipeCount : null;
  const medianCardsSeen = journey?.kpis?.medianCardsSeen;

  const isPostMortem = stage === 'post-mortem';

  return (
    <div className="pivot-tenant-curation__monitor">
      <PivotOpsSection
        title={isPostMortem ? 'Batch recap' : 'Live pulse'}
        titleId="curation-monitor-kpis"
        description={
          isPostMortem
            ? 'How this past drop performed after release. Per-event interest is in the catalog sheet.'
            : 'In-feed performance for the batch users are swiping now. Per-event interest sits on each catalog row as the week fills in.'
        }
      >
        {overviewLoading && !kpis ? (
          <p className="pivot-lab__empty">Loading week metrics…</p>
        ) : (
          <PivotOpsMetricGrid>
            <PivotOpsMetric
              label="Active users"
              value={<PivotOpsAnimateNumber value={kpis?.activeUsers ?? 0} />}
              hint="Users with any intent this week"
            />
            <PivotOpsMetric
              label="Reached (swipes)"
              value={<PivotOpsAnimateNumber value={swipeCount} />}
              hint="Total swipe decisions across catalog events"
            />
            <PivotOpsMetric
              label="Interest %"
              value={formatRate(weekInterestRate)}
              hint="(Interested + going) / swipes"
            />
            <PivotOpsMetric
              label="Interested"
              value={<PivotOpsAnimateNumber value={interestedSurvivors} />}
            />
            <PivotOpsMetric
              label="Going"
              value={<PivotOpsAnimateNumber value={kpis?.registeredCount ?? 0} />}
            />
            <PivotOpsMetric
              label="Median cards seen"
              value={
                journeyLoading && medianCardsSeen == null
                  ? '…'
                  : medianCardsSeen == null
                    ? '—'
                    : <PivotOpsAnimateNumber value={medianCardsSeen} />
              }
              hint="Median pivot_card_view count per user"
            />
            <PivotOpsMetric
              label="Ticket opens"
              value={
                <PivotOpsAnimateNumber
                  value={kpis?.externalOpenUsers ?? kpis?.externalOpenCount ?? 0}
                />
              }
            />
            <PivotOpsMetric
              label="Events"
              value={<PivotOpsAnimateNumber value={kpis?.eventCount ?? 0} />}
            />
          </PivotOpsMetricGrid>
        )}
      </PivotOpsSection>
    </div>
  );
}

export default PivotCurationMonitorPanel;
