import React from 'react';
import PivotScrapbookTitle from '../../../components/PivotBranding/PivotScrapbookTitle';
import justGoCreatorCopy from '../justGoCreatorCopy';
import {
  buildInsightsChart,
  buildIntentFunnel,
  dailyInterestCount,
  dailyWindowLabel,
  formatConversion,
  funnelBarWidth,
  sumDaily,
} from './insightsUtils';
import { formatWorkspaceDate } from './workspaceUtils';

/** Flare-register zero state, keyed to whether ops have published the listing. */
function InsightsZeroState({ isPublished }) {
  const copy = justGoCreatorCopy.workspace.insights;
  return (
    <section className="jg-coming-soon">
      <PivotScrapbookTitle
        title={isPublished ? copy.liveZeroTitle : copy.draftZeroTitle}
        as="h2"
      />
      <p className="jg-coming-soon__body">
        {isPublished ? copy.liveZeroBody : copy.draftZeroBody}
      </p>
      <p className="jg-workspace-tab__note">
        {justGoCreatorCopy.workspace.explainer.parity}
      </p>
    </section>
  );
}

function IntentFunnel({ stats }) {
  const copy = justGoCreatorCopy.workspace.insights;
  const steps = buildIntentFunnel(stats);

  return (
    <section className="jg-workspace-tab__section">
      <h3 className="jg-workspace-tab__title">{copy.funnelTitle}</h3>
      <div className="jg-funnel">
        {steps.map((step) => {
          const conversion = formatConversion(step.conversion);
          return (
            <div key={step.key} className="jg-funnel__row">
              <span className="jg-funnel__label">{copy.funnelSteps[step.key]}</span>
              <span className="jg-funnel__track">
                <span
                  className="jg-funnel__bar"
                  style={{ width: `${funnelBarWidth(step.value, steps)}%` }}
                />
              </span>
              <span className="jg-funnel__value">{step.value}</span>
              <span className="jg-funnel__conversion">
                {conversion ? `${conversion} ${copy.ofPrevious}` : '\u00a0'}
              </span>
            </div>
          );
        })}
      </div>
      <p className="jg-workspace-tab__note">{copy.funnelNote}</p>
    </section>
  );
}

function DailyTrend({ daily }) {
  const copy = justGoCreatorCopy.workspace.insights;
  const chart = buildInsightsChart(daily);
  const window = dailyWindowLabel(daily);

  return (
    <section className="jg-workspace-tab__section">
      <h3 className="jg-workspace-tab__title">{copy.chartTitle}</h3>

      {chart?.hasSignal ? (
        <>
          <div className="jg-trend">
            <svg
              className="jg-trend__svg"
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={copy.chartAlt}
            >
              <path className="jg-trend__area" d={chart.areaPath} />
              <path className="jg-trend__line" d={chart.linePath} />
            </svg>
            {window ? (
              <div className="jg-trend__axis">
                <span>{formatWorkspaceDate(window.first)}</span>
                <span>{formatWorkspaceDate(window.last)}</span>
              </div>
            ) : null}
          </div>

          <ul className="jg-trend__legend">
            <li className="jg-trend__legend-item jg-trend__legend-item--views">
              <span className="jg-trend__swatch" aria-hidden="true" />
              <span className="jg-trend__legend-label">{copy.chartViews}</span>
              <span className="jg-trend__legend-meta">
                {copy.chartTotal(sumDaily(daily, (day) => day.views))} ·{' '}
                {copy.chartPeak(chart.peakViews)}
              </span>
            </li>
            <li className="jg-trend__legend-item jg-trend__legend-item--interest">
              <span className="jg-trend__swatch" aria-hidden="true" />
              <span className="jg-trend__legend-label">{copy.chartInterest}</span>
              <span className="jg-trend__legend-meta">
                {copy.chartTotal(sumDaily(daily, dailyInterestCount))} ·{' '}
                {copy.chartPeak(chart.peakInterest)}
              </span>
            </li>
          </ul>

          <p className="jg-workspace-tab__note">{copy.chartScaleNote}</p>
          <p className="jg-workspace-tab__note">{copy.firstTouchNote}</p>
        </>
      ) : (
        <p className="jg-workspace-tab__subtitle">{copy.chartEmpty}</p>
      )}
    </section>
  );
}

/**
 * Insights tab — intent funnel plus the 14-day trend from `stats.daily`.
 *
 * Every number is an aggregate ops already read (`PivotEventIntent` for intent, `EventAnalytics` for
 * views), so nothing here can diverge from the ops event-performance row. Deliberately absent:
 * anything implying native commerce — no tickets sold, no revenue, no attendance. Phase 1 sells the
 * listing through someone else's ticket link and says so.
 */
function WorkspaceInsightsTab({ event, stats }) {
  const copy = justGoCreatorCopy.workspace.insights;
  const isPublished = event?.ingestStatus === 'published';
  const chart = buildInsightsChart(stats?.daily);
  const funnelHasSignal = buildIntentFunnel(stats).some((step) => step.value > 0);

  if (!isPublished || (!funnelHasSignal && !chart?.hasSignal)) {
    return (
      <div className="jg-workspace-tab">
        <InsightsZeroState isPublished={isPublished} />
      </div>
    );
  }

  return (
    <div className="jg-workspace-tab">
      <section className="jg-workspace-tab__section">
        <h2 className="jg-workspace-tab__title">{copy.title}</h2>
        <p className="jg-workspace-tab__subtitle">{copy.subtitle}</p>
      </section>

      <IntentFunnel stats={stats} />
      <DailyTrend daily={stats?.daily} />

      <p className="jg-workspace-tab__note">
        {justGoCreatorCopy.workspace.explainer.parity}
      </p>
    </div>
  );
}

export default WorkspaceInsightsTab;
