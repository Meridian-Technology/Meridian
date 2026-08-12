import React from 'react';
import {
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
} from '../../../components/PivotOps';
import PivotImportThumb from '../PivotLab/PivotImportThumb';
import IngestStatusPill from '../PivotLab/IngestStatusPill';
import { formatEventWhen } from '../../../utils/pivotIsoWeek';

function formatRate(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return '—';
  return `${Math.round(Number(rate) * 100)}%`;
}

/**
 * Live / post-mortem monitoring: week KPIs + per-event interest % and reach.
 * Week navigation lives on the parent page (date-driven stage).
 */
function PivotCurationMonitorPanel({
  stage,
  overview,
  overviewLoading,
  journey,
  journeyLoading,
  performanceEvents,
  performanceLoading,
  performanceError,
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
            ? 'How this past drop performed after release.'
            : 'In-feed performance for the batch users are swiping now.'
        }
      >
        {overviewLoading && !kpis ? (
          <p className="pivot-lab__empty">Loading week metrics…</p>
        ) : (
          <PivotOpsMetricGrid>
            <PivotOpsMetric
              label="Active users"
              value={kpis?.activeUsers ?? 0}
              hint="Users with any intent this week"
            />
            <PivotOpsMetric
              label="Reached (swipes)"
              value={swipeCount}
              hint="Total swipe decisions across catalog events"
            />
            <PivotOpsMetric
              label="Interest %"
              value={formatRate(weekInterestRate)}
              hint="(Interested + going) / swipes"
            />
            <PivotOpsMetric label="Interested" value={interestedSurvivors} />
            <PivotOpsMetric label="Going" value={kpis?.registeredCount ?? 0} />
            <PivotOpsMetric
              label="Median cards seen"
              value={
                journeyLoading && medianCardsSeen == null
                  ? '…'
                  : medianCardsSeen ?? '—'
              }
              hint="Median pivot_card_view count per user"
            />
            <PivotOpsMetric
              label="Ticket opens"
              value={kpis?.externalOpenUsers ?? kpis?.externalOpenCount ?? 0}
            />
            <PivotOpsMetric label="Events" value={kpis?.eventCount ?? 0} />
          </PivotOpsMetricGrid>
        )}
      </PivotOpsSection>

      <PivotOpsSection
        title="Event performance"
        titleId="curation-monitor-events"
        description="Interest % = right-swipe survivors ÷ people reached (swiped). Reached = interested + going + passed."
      >
        {performanceError ? (
          <p className="pivot-lab__error" role="alert">
            {typeof performanceError === 'string'
              ? performanceError
              : 'Unable to load event performance.'}
          </p>
        ) : null}
        {performanceLoading && !performanceEvents.length ? (
          <p className="pivot-lab__empty">Loading event performance…</p>
        ) : performanceEvents.length ? (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Image</span>
                  </th>
                  <th scope="col">Event</th>
                  <th scope="col">When</th>
                  <th scope="col">Status</th>
                  <th scope="col" title="People who swiped on this card">
                    Reached
                  </th>
                  <th scope="col">Interested</th>
                  <th scope="col">Going</th>
                  <th scope="col">Passed</th>
                  <th scope="col" title="(Interested + going) / reached">
                    Interest %
                  </th>
                  <th scope="col" title="Unique ticket openers / interested">
                    Ticket %
                  </th>
                  <th scope="col">Opens</th>
                </tr>
              </thead>
              <tbody>
                {performanceEvents.map((event) => (
                  <tr key={event.eventId}>
                    <td className="pivot-lab__thumb-cell">
                      <PivotImportThumb src={event.image} alt={event.name} />
                    </td>
                    <td>
                      <div className="pivot-tenant-curation__event-name">
                        {event.name || 'Untitled'}
                      </div>
                      {event.tags?.length ? (
                        <div className="pivot-tenant-curation__event-tags">
                          {event.tags.slice(0, 3).join(', ')}
                          {event.tags.length > 3 ? '…' : ''}
                        </div>
                      ) : null}
                    </td>
                    <td>{formatEventWhen(event.start_time)}</td>
                    <td>
                      <IngestStatusPill status={event.ingestStatus} />
                    </td>
                    <td>
                      <strong>{event.reached ?? 0}</strong>
                    </td>
                    <td>{event.interestedTotal ?? 0}</td>
                    <td>{event.registered ?? 0}</td>
                    <td>{event.passed ?? 0}</td>
                    <td>
                      <strong>{formatRate(event.interestRate)}</strong>
                    </td>
                    <td>{formatRate(event.ticketOpenRate)}</td>
                    <td>
                      {event.externalOpen ?? 0}
                      {event.externalOpenUsers
                        ? ` (${event.externalOpenUsers})`
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !performanceLoading ? (
          <p className="pivot-lab__empty">No catalog events for this batch week.</p>
        ) : null}
      </PivotOpsSection>
    </div>
  );
}

export default PivotCurationMonitorPanel;
