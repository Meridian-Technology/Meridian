import React from 'react';
import { formatPivotDeckWhen } from '../../../utils/pivotIsoWeek';
import PivotImportThumb from '../PivotLab/PivotImportThumb';

function normalizeCopy(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function intentBadgeLabel(intent) {
  if (intent === 'registered') return 'going';
  if (intent === 'interested') return 'in your plans';
  if (intent === 'passed') return 'passed';
  return null;
}

/**
 * Compact explore list row — mirrors mobile PivotExploreRow + PivotEventCard compact.
 */
function PivotExploreCompactRow({ event, compact = false }) {
  const hostName = event.displayHost?.name || event.organizerName || '';
  const whenLabel = formatPivotDeckWhen(event.start_time, event.end_time);
  const intentLabel = intentBadgeLabel(event.userIntent);
  const isGoing = event.userIntent === 'registered';
  const isPassed = event.userIntent === 'passed';
  const tags = Array.isArray(event.tags) ? event.tags.slice(0, compact ? 2 : 4) : [];

  return (
    <article
      className={`pivot-explore-row${compact ? ' pivot-explore-row--compact' : ''}`}
      aria-label={event.name}
    >
      {intentLabel ? (
        <span
          className={[
            'pivot-explore-row__intent',
            isGoing ? ' pivot-explore-row__intent--going' : '',
            isPassed ? ' pivot-explore-row__intent--passed' : '',
          ].join('')}
        >
          {intentLabel}
        </span>
      ) : null}
      <div className="pivot-explore-row__card">
        <div className="pivot-explore-row__thumb">
          <PivotImportThumb src={event.coverImageUrl || event.image} alt={event.name} />
        </div>
        <div className="pivot-explore-row__copy">
          <h4 className="pivot-explore-row__title">{normalizeCopy(event.name) || 'untitled event'}</h4>
          <p className="pivot-explore-row__host">{normalizeCopy(hostName) || 'organizer tbd'}</p>
          {whenLabel || event.location ? (
            <div className="pivot-explore-row__meta">
              {whenLabel ? (
                <span className="pivot-explore-row__pill pivot-explore-row__pill--when">{whenLabel}</span>
              ) : null}
              {event.location ? (
                <span className="pivot-explore-row__pill pivot-explore-row__pill--where">
                  {normalizeCopy(event.location)}
                </span>
              ) : null}
            </div>
          ) : null}
          {tags.length ? (
            <div className="pivot-explore-row__tags">
              {tags.map((tag) => (
                <span key={tag} className="pivot-explore-row__tag">
                  {normalizeCopy(tag)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default PivotExploreCompactRow;
