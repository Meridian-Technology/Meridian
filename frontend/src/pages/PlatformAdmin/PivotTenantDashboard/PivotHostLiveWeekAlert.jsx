import React from 'react';
import { Link } from 'react-router-dom';
import { PivotOpsBanner } from '../../../components/PivotOps';
import './PivotHostLiveWeekAlert.scss';

export function formatHostCreatedCounts(counts = {}) {
  const hostDraft = counts.hostDraft ?? 0;
  const hostStaged = counts.hostStaged ?? 0;
  const hostPublished = counts.hostPublished ?? 0;
  return `${hostDraft} draft · ${hostStaged} staged · ${hostPublished} published`;
}

/**
 * Callout when host-created drafts target a week that is already live/released.
 * Links (or local callback) into Curation with Host-created + draft filters.
 */
function PivotHostLiveWeekAlert({
  alert,
  onReviewClick,
  className = '',
}) {
  if (!alert?.active) return null;

  const draftLabel =
    alert.hostDraft === 1
      ? '1 Host-created draft'
      : `${alert.hostDraft} Host-created drafts`;

  const cta = typeof onReviewClick === 'function' ? (
    <button
      type="button"
      className="linear-btn linear-btn--primary pivot-host-live-week-alert__cta"
      onClick={onReviewClick}
    >
      Review Host-created
    </button>
  ) : alert.curationHref ? (
    <Link
      className="linear-btn linear-btn--primary pivot-host-live-week-alert__cta"
      to={alert.curationHref}
    >
      Review Host-created
    </Link>
  ) : null;

  return (
    <PivotOpsBanner
      tone="accent"
      role="alert"
      title="Live week — host drafts need review"
      actions={cta}
      className={`pivot-host-live-week-alert ${className}`.trim()}
    >
      <p>
        {draftLabel} target this week, which already has published events or is released.
        They stay drafts until you stage and publish.
      </p>
    </PivotOpsBanner>
  );
}

export default PivotHostLiveWeekAlert;
