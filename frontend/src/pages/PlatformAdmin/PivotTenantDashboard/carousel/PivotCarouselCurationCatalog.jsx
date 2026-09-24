import React, { useState } from 'react';
import { formatEventWhenWithShowtimes } from '../../../../utils/pivotIsoWeek';
import PivotImportThumb from '../../PivotLab/PivotImportThumb';
import PivotCurationPortalPopup from '../PivotCurationPortalPopup';
import { candidateToCatalogEvent, editorialTierLabel } from './carouselCurationCatalog';
import { eventRefKey } from './carouselCurationSelection';
import '../PivotCurationQueue.scss';

function EventDetailCard({ candidate, handleClose }) {
  const event = candidateToCatalogEvent(candidate);
  const snapshot = candidate.snapshot || {};
  const when = formatEventWhenWithShowtimes(event);
  const sourceHref = snapshot.externalLink || snapshot.sourceUrl;
  return (
    <aside className="pivot-curation-sheet__inspect pivot-curation-sheet__inspect--dossier" aria-label={`${event.name || 'Event'} details`}>
      <div className="pivot-curation-sheet__inspect-media">
        {event.image ? <img src={event.image} alt="" /> : <div className="pivot-curation-sheet__inspect-fallback" aria-hidden="true" />}
      </div>
      <div className="pivot-curation-sheet__inspect-body">
        <div className="pivot-curation-sheet__inspect-head">
          <h3 className="pivot-curation-sheet__inspect-title">{event.name || 'Untitled'}</h3>
          <button type="button" className="linear-btn linear-btn--ghost pivot-curation-sheet__inspect-close" onClick={handleClose}>Close</button>
        </div>
        <p className="pivot-curation-sheet__inspect-meta">{[event.organizerName, when, event.location].filter(Boolean).join(' · ')}</p>
        {snapshot.description ? <p className="pivot-curation-sheet__inspect-copy is-full">{snapshot.description}</p> : null}
        {sourceHref ? <a className="pivot-curation-sheet__inspect-link" href={sourceHref} target="_blank" rel="noreferrer">Source listing</a> : null}
      </div>
    </aside>
  );
}

function EventDetailPopup({ candidate, onClose }) {
  return (
    <PivotCurationPortalPopup isOpen onClose={onClose} className="pivot-curation-inspect-popup">
      <EventDetailCard candidate={candidate} />
    </PivotCurationPortalPopup>
  );
}

function CatalogPickRow({ candidate, selected, onToggle, onInspect }) {
  const event = candidateToCatalogEvent(candidate);
  const tags = event.tags || [];
  const sourceHref = candidate.snapshot?.externalLink || candidate.snapshot?.sourceUrl;
  const tier = editorialTierLabel(event);

  return (
    <tr
      className={selected ? 'is-selected' : ''}
      onClick={() => onToggle(candidate)}
      onDoubleClick={(nativeEvent) => { nativeEvent.preventDefault(); onInspect(candidate); }}
    >
      <td className="pivot-curation-sheet__thumb-col">
        {sourceHref ? (
          <a
            className="pivot-lab__thumb-link"
            href={sourceHref}
            target="_blank"
            rel="noreferrer"
            title="Open source listing"
            onClick={(nativeEvent) => nativeEvent.stopPropagation()}
          >
            <PivotImportThumb src={event.image} alt={event.name} />
          </a>
        ) : (
          <PivotImportThumb src={event.image} alt={event.name} />
        )}
      </td>
      <td>
        <span className="pivot-curation-sheet__name">{event.name || 'Untitled'}</span>
        <div className="pivot-curation-sheet__host">{event.organizerName || 'No host'}</div>
        <div className="pivot-curation-sheet__mobile-when">
          {formatEventWhenWithShowtimes(event)}
        </div>
        {event.featured ? (
          <span className="pivot-curation-sheet__featured" title="Featured — public landing deck">
            Featured
          </span>
        ) : null}
        {tier ? (
          <span
            className={`pivot-curation-sheet__editorial-badge pivot-curation-sheet__editorial-badge--${event.rankingOverride.tier}`}
          >
            {tier}
          </span>
        ) : null}
      </td>
      <td className="pivot-curation-sheet__when pivot-curation-sheet__desktop-only">
        {formatEventWhenWithShowtimes(event)}
      </td>
      <td className="pivot-curation-sheet__desktop-only">
        {tags.length ? (
          <div className="pivot-curation-sheet__tag-list">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="pivot-curation-sheet__tag">{tag}</span>
            ))}
            {tags.length > 3 ? (
              <span className="pivot-curation-sheet__muted">+{tags.length - 3}</span>
            ) : null}
          </div>
        ) : (
          <span className="pivot-curation-sheet__muted">—</span>
        )}
      </td>
    </tr>
  );
}

export default function PivotCarouselCurationCatalog({
  candidates,
  selectedKeys,
  loading,
  keyword,
  onToggle,
}) {
  const [detail, setDetail] = useState(null);
  if (!candidates.length && loading) {
    return <p className="jg-curate__empty">Loading catalog…</p>;
  }
  if (!candidates.length) {
    return (
      <p className="jg-curate__empty">
        {keyword?.trim() ? 'No events match this filter.' : 'No events in this catalog yet.'}
      </p>
    );
  }

  return (
    <>
    <div className="pivot-curation-sheet jg-curate__sheet">
      <div className="pivot-curation-sheet__scroller">
        <table className="pivot-curation-sheet__table">
          <thead>
            <tr>
              <th scope="col" className="pivot-curation-sheet__thumb-col">
                <span className="visually-hidden">Image</span>
              </th>
              <th scope="col">Event</th>
              <th scope="col" className="pivot-curation-sheet__desktop-only">When</th>
              <th scope="col" className="pivot-curation-sheet__desktop-only">Tags</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => {
              const key = eventRefKey(candidate.ref);
              return (
                <CatalogPickRow
                  key={key}
                  candidate={candidate}
                  selected={selectedKeys.has(key)}
                  onToggle={onToggle}
                  onInspect={setDetail}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    {detail ? <EventDetailPopup candidate={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}
