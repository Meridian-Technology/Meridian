import React, { useState } from 'react';
import { eventRefKey } from './carouselCurationSelection';

function PosterFan({ candidates }) {
  const images = [...new Set(candidates.map((candidate) => candidate.snapshot?.image).filter(Boolean))].slice(0, 5);
  if (!images.length) {
    return <span className="jg-curate-groups__fan jg-curate-groups__fan--empty" aria-hidden="true">✳</span>;
  }
  const middle = (images.length - 1) / 2;
  return (
    <span className="jg-curate-groups__fan" aria-hidden="true">
      {images.map((src, index) => (
        <span
          className="jg-curate-groups__photo"
          key={src}
          style={{ zIndex: index, '--fan-x': `${(index - middle) * 18}px`, '--fan-r': `${(index - middle) * 6}deg` }}
        >
          <img src={src} alt="" />
        </span>
      ))}
    </span>
  );
}

function GroupCard({ group, selectedKeys, onToggle, onAdd }) {
  const [expanded, setExpanded] = useState(false);
  const selectedCount = group.candidates.filter((candidate) => selectedKeys.has(eventRefKey(candidate.ref))).length;
  return (
    <article className="jg-curate-groups__card">
      <PosterFan candidates={group.candidates} />
      <div className="jg-curate-groups__copy">
        <span className="jg-curate-groups__eyebrow">{group.signal.label} · {group.seed.snapshot.city?.name}</span>
        <h3>{group.label}</h3>
        <p>Starting with {group.seed.snapshot.name}</p>
        <span className="jg-curate-groups__count">{group.candidates.length} events · {selectedCount} selected</span>
      </div>
      <div className="jg-curate-groups__actions">
        <button type="button" className="linear-btn linear-btn--secondary" onClick={() => onAdd(group)}>Add group</button>
        <button type="button" className="linear-btn linear-btn--ghost" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? 'Hide events' : 'See events'}
        </button>
      </div>
      {expanded && (
        <ul className="jg-curate-groups__events">
          {group.candidates.map((candidate) => {
            const selected = selectedKeys.has(eventRefKey(candidate.ref));
            return (
              <li key={eventRefKey(candidate.ref)}>
                {candidate.snapshot.image ? <img src={candidate.snapshot.image} alt="" /> : <span className="jg-curate-groups__event-fallback" />}
                <span><strong>{candidate.snapshot.name}</strong><small>{candidate.snapshot.host || candidate.snapshot.city?.name || candidate.ref.sourceTenantKey}</small></span>
                <button type="button" className="linear-btn linear-btn--ghost" onClick={() => onToggle(candidate)} aria-label={`${selected ? 'Remove' : 'Add'} ${candidate.snapshot.name}`}>
                  {selected ? 'Remove' : 'Add'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

export default function PivotCarouselCuratedGroups({ groups, loading, error, sources, selectedKeys, onToggle, onAdd, onRetry }) {
  if (loading) return <p className="jg-curate__empty" role="status">Finding curated groups…</p>;
  if (error) return <p className="jg-curate__alert" role="alert">{error} <button type="button" className="linear-btn linear-btn--ghost" onClick={onRetry}>Retry</button></p>;
  return (
    <section className="jg-curate-groups" aria-label="Curated groups">
      <div className="jg-curate-groups__heading">
        <div><h2>Curated groups</h2><p>Four starting points from featured, promoted, and high interest events. Review the events before creating a carousel.</p></div>
        <button type="button" className="linear-btn linear-btn--ghost" onClick={onRetry}>Refresh</button>
      </div>
      {sources.some((source) => source.status === 'failed') && <p className="jg-curate__warn" role="status">Some cities could not load suggestions. Refresh to try again.</p>}
      {groups.length ? <div className="jg-curate-groups__grid">{groups.map((group) => (
        <GroupCard key={group.id} group={group} selectedKeys={selectedKeys} onToggle={onToggle} onAdd={onAdd} />
      ))}</div> : <p className="jg-curate__empty">No related groups are ready yet. Browse events to build a carousel.</p>}
    </section>
  );
}
