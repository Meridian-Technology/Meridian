import React, { useMemo, useState } from 'react';
import './PivotSourceIntelligence.scss';

const FILTERS = [
  { key: 'all', label: 'All sources' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'unscored', label: 'Awaiting evidence' },
  { key: 'rejected', label: 'Ruled out' },
];
const TIERS = [
  { key: 'standard', label: 'Standard' },
  { key: 'promote', label: 'Promote' },
  { key: 'strong_promote', label: 'Strong promote' },
  { key: 'demote', label: 'Demote' },
];
const REJECTION_LABELS = {
  'no-events': 'No dated events found',
  'below-threshold': 'Below the event threshold',
  'scrape-failed': 'Extraction failed',
  'no-index-page': 'No calendar page found',
  'blocked-host': 'Host could not be crawled',
};

function percent(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function signed(value) {
  const amount = Number(value || 0);
  return `${amount > 0 ? '+' : ''}${amount.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function sourceNeedsAttention(source) {
  if (source.status !== 'qualified') return false;
  const failed = (source.entrypoints || []).some((entrypoint) => entrypoint.lastRunStatus === 'failed');
  return failed || !source.entrypoints?.length || source.score?.breakdown?.publishRate < 0.5;
}

function EvidenceBar({ value, label }) {
  return (
    <div className="pivot-source-intel__evidence-bar" aria-label={`${label}: ${percent(value)}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, (value || 0) * 100))}%` }} />
    </div>
  );
}

function BatchBars({ history }) {
  if (!history?.length) return <p className="pivot-source-intel__empty">No attributed events in released batches yet.</p>;
  return (
    <div className="pivot-source-intel__batch-list">
      {history.map((batch) => (
        <div className="pivot-source-intel__batch" key={batch.batchWeek}>
          <span className="pivot-source-intel__batch-week">{batch.batchWeek}</span>
          <EvidenceBar value={batch.publishRate} label={`${batch.batchWeek} published share`} />
          <span className="pivot-source-intel__batch-count">{batch.published}/{batch.eligible} published</span>
          <span className="pivot-source-intel__batch-featured">{batch.featured} featured</span>
        </div>
      ))}
    </div>
  );
}

function SourceCard({ source, selected, onClick }) {
  const history = source.score?.breakdown?.history || [];
  const needsAttention = sourceNeedsAttention(source);
  return (
    <button type="button" className={`pivot-source-intel__card${selected ? ' is-selected' : ''}`} onClick={onClick} aria-pressed={selected}>
      <span className="pivot-source-intel__card-top">
        <span className="pivot-source-intel__provider">{source.provider}</span>
        <span className="pivot-source-intel__card-state">
          {source.enabled === false ? 'Muted' : source.status === 'rejected' ? 'Ruled out' : needsAttention ? 'Review' : 'Active'}
        </span>
      </span>
      <strong className="pivot-source-intel__card-title">{source.label || source.host}</strong>
      <span className="pivot-source-intel__card-host">{source.host} · {source.entrypoints?.length || 0} entrypoints</span>
      <span className="pivot-source-intel__card-scores">
        <span><b>{percent(source.score?.quality)}</b><small>Quality</small></span>
        <span><b>{percent(source.score?.reputation)}</b><small>Reputation</small></span>
        <span><b>{signed(source.deckImpact?.total)}</b><small>Deck points</small></span>
      </span>
      <span className="pivot-source-intel__card-footer">
        <span>{source.score?.sampleSize ? `${source.score.publishedCount}/${source.score.sampleSize} published` : 'Awaiting published batch'}</span>
        <span className="pivot-source-intel__mini-bars" aria-label={`${history.length} batches with evidence`}>
          {[...history].reverse().map((batch) => (
            <i key={batch.batchWeek} style={{ height: `${Math.max(12, batch.publishRate * 100)}%` }} title={`${batch.batchWeek}: ${batch.published}/${batch.eligible} published`} />
          ))}
        </span>
      </span>
    </button>
  );
}

function SourceDetail({ source, onSetTier, onToggleEnabled }) {
  const breakdown = source.score?.breakdown || {};
  const components = breakdown.components || {};
  const impact = source.deckImpact || {};
  const tier = source.rankingOverride?.tier || 'standard';
  return (
    <article className="pivot-source-intel__detail" aria-label={`${source.label || source.host} source details`}>
      <header className="pivot-source-intel__detail-header">
        <div>
          <span className="pivot-source-intel__eyebrow">Source profile · {source.provider}</span>
          <h3>{source.label || source.host}</h3>
          <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
        </div>
        <span className={`pivot-source-intel__impact${impact.total < 0 ? ' is-negative' : ''}`}>
          {signed(impact.total)} <small>deck points</small>
        </span>
      </header>
      {source.status === 'rejected' ? (
        <p className="pivot-source-intel__notice">Discovery ruled this source out: {REJECTION_LABELS[source.rejectedReason] || source.rejectedReason || 'no qualifying events'}.</p>
      ) : null}

      <div className="pivot-source-intel__score-grid">
        <div className="pivot-source-intel__score-panel">
          <span className="pivot-source-intel__eyebrow">Event quality</span>
          <strong>{percent(source.score?.quality)}</strong>
          <p>From published share, editorial selections, and a capped event-volume signal.</p>
          <EvidenceBar value={source.score?.quality} label="Quality score" />
        </div>
        <div className="pivot-source-intel__score-panel">
          <span className="pivot-source-intel__eyebrow">Source reputation</span>
          <strong>{percent(source.score?.reputation)}</strong>
          <p>Quality sustained across batches, with confidence growing as evidence accumulates.</p>
          <EvidenceBar value={source.score?.reputation} label="Reputation score" />
        </div>
      </div>

      <div className="pivot-source-intel__section">
        <div className="pivot-source-intel__section-heading">
          <h4>Evidence behind the score</h4>
          <span>{source.score?.sampleSize || 0} attributed events · {source.score?.batchCount || 0} batches</span>
        </div>
        <div className="pivot-source-intel__facts">
          <div><strong>{breakdown.publishedCount ?? 0}/{breakdown.eligibleCount ?? 0}</strong><span>Made it to published</span></div>
          <div><strong>{breakdown.featuredCount ?? 0}/{breakdown.publishedCount ?? 0}</strong><span>Featured or promoted</span></div>
          <div><strong>{percent(components.consistency)}</strong><span>Batch consistency</span></div>
          <div><strong>{percent(components.confidence)}</strong><span>Evidence confidence</span></div>
        </div>
        <p className="pivot-source-intel__method">
          Quality = 65% smoothed publish rate + 25% smoothed editorial rate + 10% capped volume.
          Reputation = 70% quality + 15% consistency + 15% confidence. Recent batches count more.
        </p>
      </div>

      <div className="pivot-source-intel__section">
        <div className="pivot-source-intel__section-heading">
          <h4>Released batch history</h4>
          <span>Up to the last {breakdown.windowBatchCount || 8} released batches</span>
        </div>
        <BatchBars history={breakdown.history} />
      </div>

      <div className="pivot-source-intel__section">
        <div className="pivot-source-intel__section-heading">
          <h4>Entrypoints</h4>
          <span>Separate crawl jobs, shared source reputation</span>
        </div>
        {source.entrypoints?.length ? (
          <div className="pivot-source-intel__entrypoints">
            {source.entrypoints.map((entrypoint) => {
              const evidence = breakdown.entrypoints?.[entrypoint.id];
              return (
                <div className="pivot-source-intel__entrypoint" key={entrypoint.id}>
                  <div><strong>{entrypoint.label || entrypoint.url}</strong><a href={entrypoint.url} target="_blank" rel="noreferrer">{entrypoint.url}</a></div>
                  <div className="pivot-source-intel__entrypoint-stats">
                    <span>{evidence ? `${evidence.published}/${evidence.eligible} published` : 'No attributed events'}</span>
                    <span>{entrypoint.lastRunStatus || 'Never run'} · {formatDate(entrypoint.lastRunAt)}</span>
                    {entrypoint.lastRunStats ? (
                      <span>Last crawl: {entrypoint.lastRunStats.discovered || 0} found · {entrypoint.lastRunStats.upserted || 0} cataloged · {entrypoint.lastRunStats.failed || 0} failed</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="pivot-source-intel__empty">No entrypoint is linked. Add a saved job and select this catalog source.</p>}
      </div>

      <div className="pivot-source-intel__section pivot-source-intel__controls">
        <div className="pivot-source-intel__section-heading">
          <h4>Distribution control</h4>
          <span>Automatic {signed(impact.automatic)} · manual {signed(impact.manual)} · capped total {signed(impact.total)}</span>
        </div>
        <div className="pivot-source-intel__tier-options" role="group" aria-label="Source ranking override">
          {TIERS.map((option) => (
            <button key={option.key} type="button" className={tier === option.key ? 'is-active' : ''}
              aria-pressed={tier === option.key} onClick={() => onSetTier(source, option.key)}>{option.label}</button>
          ))}
        </div>
        <button className="pivot-source-intel__mute" type="button" onClick={() => onToggleEnabled(source)}>
          {source.enabled === false ? 'Resume future crawls' : 'Pause future crawls'}
        </button>
        <p className="pivot-source-intel__method">
          Automatic adjustment = city source weight ({impact.weight ?? 0}) × (55% quality + 45% reputation − 50%) × 2.
          Manual tiers add 0, +0.35, +0.70, or −0.50; the combined adjustment is capped between −0.60 and +0.90.
          This is added to each event’s personalized ranking score and does not guarantee a slot. Existing decks stay frozen until rebuilt.
          Pausing crawls does not remove published events.
        </p>
      </div>
      <p className="pivot-source-intel__footnote">Evidence includes attributed staged and published events in released batches. Updated {formatDate(source.score?.computedAt)}.</p>
    </article>
  );
}

export default function PivotSourceIntelligence({ sources = [], loading, error, onRefresh,
  onRecompute, recomputing, onCreate, creating, newSource, onNewSourceChange, onSetTier, onToggleEnabled }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('attention');
  const [selectedId, setSelectedId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const summary = useMemo(() => sources.reduce((out, source) => {
    out.qualified += source.status === 'qualified' ? 1 : 0;
    out.unscored += source.status === 'qualified' && source.score?.quality == null ? 1 : 0;
    out.attention += sourceNeedsAttention(source) ? 1 : 0;
    out.eligible += source.score?.breakdown?.eligibleCount || 0;
    out.published += source.score?.breakdown?.publishedCount || 0;
    out.featured += source.score?.breakdown?.featuredCount || 0;
    return out;
  }, { qualified: 0, unscored: 0, attention: 0, eligible: 0, published: 0, featured: 0 }), [sources]);
  const legacyScoreCount = sources.filter((source) => source.score?.quality != null && (source.score.version || 0) < 2).length;

  const visible = useMemo(() => sources.filter((source) => {
    const searchable = `${source.label || ''} ${source.host} ${source.sourceKey || ''} ${source.provider}`.toLowerCase();
    if (query && !searchable.includes(query.toLowerCase().trim())) return false;
    if (filter === 'attention') return sourceNeedsAttention(source);
    if (filter === 'unscored') return source.status === 'qualified' && source.score?.quality == null;
    if (filter === 'rejected') return source.status === 'rejected';
    return true;
  }).sort((a, b) => {
    if (sort === 'reputation') return (b.score?.reputation ?? -1) - (a.score?.reputation ?? -1);
    if (sort === 'published') return (b.score?.publishedCount || 0) - (a.score?.publishedCount || 0);
    if (sort === 'name') return (a.label || a.host).localeCompare(b.label || b.host);
    return Number(sourceNeedsAttention(b)) - Number(sourceNeedsAttention(a))
      || (b.score?.reputation ?? -1) - (a.score?.reputation ?? -1);
  }), [sources, query, filter, sort]);
  const selected = visible.find((source) => source._id === selectedId) || visible[0] || null;

  return (
    <div className="pivot-source-intel">
      <header className="pivot-source-intel__header">
        <div><span className="pivot-source-intel__eyebrow">Curation intelligence</span><h2 id="curation-sources">Source health</h2>
          <p>See which calendars reliably reach the published catalog and how that evidence affects personal decks.</p></div>
        <div className="pivot-source-intel__header-actions">
          <button type="button" className="linear-btn linear-btn--ghost" onClick={onRefresh} disabled={loading}>Refresh</button>
          <button type="button" className="linear-btn linear-btn--ghost" onClick={onRecompute} disabled={recomputing}>{recomputing ? 'Recomputing…' : 'Recompute evidence'}</button>
          <button type="button" className="linear-btn linear-btn--primary" onClick={() => setCreateOpen((open) => !open)} aria-expanded={createOpen}>Add source</button>
        </div>
      </header>

      {legacyScoreCount ? <p className="pivot-source-intel__notice">{legacyScoreCount} source{legacyScoreCount === 1 ? '' : 's'} have older scores without an evidence breakdown. Recompute evidence to see the full history and portfolio totals.</p> : null}

      {createOpen ? (
        <div className="pivot-source-intel__create" aria-label="Add catalog source">
          <p>Give the calendar a stable key. After saving it, link one or more Saved jobs as entrypoints.</p>
          <div className="pivot-source-intel__create-grid">
            <label>Display name<input className="linear-input" value={newSource.label} onChange={(e) => onNewSourceChange({ ...newSource, label: e.target.value })} placeholder="Downtown arts calendar" /></label>
            <label>Stable key<input className="linear-input" value={newSource.sourceKey} onChange={(e) => onNewSourceChange({ ...newSource, sourceKey: e.target.value })} placeholder="downtown-arts" /></label>
            <label>Calendar URL<input className="linear-input" value={newSource.url} onChange={(e) => onNewSourceChange({ ...newSource, url: e.target.value })} placeholder="https://lu.ma/calendar/..." /></label>
            <label>Provider<select className="linear-input" value={newSource.provider} onChange={(e) => onNewSourceChange({ ...newSource, provider: e.target.value })}>
              <option value="luma">Luma</option><option value="partiful">Partiful</option><option value="generic-site">Website</option>
            </select></label>
          </div>
          <button type="button" className="linear-btn linear-btn--primary" disabled={creating} onClick={onCreate}>{creating ? 'Saving…' : 'Create source'}</button>
        </div>
      ) : null}

      <div className="pivot-source-intel__summary" aria-label="Source portfolio summary">
        <div><span>Qualified sources</span><strong>{summary.qualified}</strong><small>{summary.attention} need review</small></div>
        <div><span>Published from sources</span><strong>{summary.published}<small>/{summary.eligible}</small></strong><small>Attributed events in released batches</small></div>
        <div><span>Editorial selections</span><strong>{summary.featured}</strong><small>Featured or promoted published events</small></div>
        <div><span>Awaiting evidence</span><strong>{summary.unscored}</strong><small>No eligible attributed events yet</small></div>
      </div>

      <div className="pivot-source-intel__filterbar">
        <div className="pivot-source-intel__filters" role="group" aria-label="Filter sources">
          {FILTERS.map((item) => <button type="button" key={item.key} className={filter === item.key ? 'is-active' : ''} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}</button>)}
        </div>
        <input className="linear-input" aria-label="Search sources" placeholder="Search calendars…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="pivot-source-intel__sort">Sort <select className="linear-input" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="attention">Needs attention</option><option value="reputation">Reputation</option><option value="published">Published count</option><option value="name">Name</option>
        </select></label>
      </div>

      {error ? <p className="pivot-lab__error">{String(error)}</p> : null}
      {loading && !sources.length ? <p className="pivot-source-intel__empty">Loading source evidence…</p> : null}
      {!loading && !sources.length ? <p className="pivot-source-intel__empty">No sources yet. Add a calendar or run source discovery to start building a record.</p> : null}
      {sources.length && !visible.length ? <p className="pivot-source-intel__empty">No sources match this view.</p> : null}
      {visible.length ? (
        <div className="pivot-source-intel__workspace">
          <div className="pivot-source-intel__cards" aria-label="Sources">
            {visible.map((source) => <SourceCard key={source._id} source={source} selected={selected?._id === source._id} onClick={() => setSelectedId(source._id)} />)}
          </div>
          {selected ? <SourceDetail source={selected} onSetTier={onSetTier} onToggleEnabled={onToggleEnabled} /> : null}
        </div>
      ) : null}
    </div>
  );
}
