import React, { useCallback, useEffect, useState } from 'react';
import Popup from '../../../components/Popup/Popup';
import { authenticatedRequest } from '../../../hooks/useFetch';
import PivotCatalogEventEditModal, { catalogEditDraftToOverrides } from '../PivotLab/PivotCatalogEventEditModal';
import './PivotSourceEventHistoryPopup.scss';

function dateLabel(value) {
  if (!value) return 'Time missing';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time missing' : date.toLocaleString();
}

function HistoryBody({ children }) { return children; }

const PREVIEW_FIELDS = [
  ['name', 'Title'], ['description', 'Description'], ['image', 'Image URL'],
  ['start_time', 'Start'], ['end_time', 'End'], ['location', 'Venue'],
  ['hostName', 'Organizer'], ['sourceUrl', 'Event URL'],
];

function previewValue(value, field) {
  if (field === 'start_time' || field === 'end_time') return dateLabel(value);
  return value || 'Missing';
}

function PreviewFieldValue({ value, field }) {
  return <span role="cell">{field === 'image' && value ? <img className="pivot-source-history__field-image"
    src={value} alt="" loading="lazy" /> : null}{previewValue(value, field)}</span>;
}

function PreviewEvent({ entry, index }) {
  const draft = entry.draft || {};
  const saved = entry.catalogEvent || null;
  const changed = saved ? PREVIEW_FIELDS.filter(([field]) =>
    String(draft[field] || '') !== String(saved[field] || '')).length : 0;
  const candidates = draft.scrapeEvidence?.imageCandidates || [];
  return <article className="pivot-source-history__event pivot-source-history__event--preview" key={entry.sourceUrl || index}>
    {draft.image ? <img src={draft.image} alt="Extracted event" loading="lazy" />
      : <div className="pivot-source-history__no-image">No image</div>}
    <div className="pivot-source-history__event-main">
      <div className="pivot-source-history__event-heading"><h3>{draft.name || 'Untitled event'}</h3>
        <span>{saved ? `${changed} changed field${changed === 1 ? '' : 's'}` : 'New to catalog'}</span></div>
      <div className={`pivot-source-history__comparison${saved ? '' : ' pivot-source-history__comparison--new'}`}
        role="table" aria-label={`${draft.name || 'Event'} field comparison`}>
        <div className="pivot-source-history__comparison-head" role="row">
          <strong role="columnheader">Field</strong>
          {saved ? <strong role="columnheader">Current catalog</strong> : null}
          <strong role="columnheader">Preview extraction</strong>
        </div>
        {PREVIEW_FIELDS.map(([field, label]) => {
          const differs = saved && String(draft[field] || '') !== String(saved[field] || '');
          return <div className={`pivot-source-history__comparison-row${differs ? ' is-changed' : ''}`}
            role="row" key={field}>
            <b role="cell">{label}</b>
            {saved ? <PreviewFieldValue value={saved[field]} field={field} /> : null}
            <PreviewFieldValue value={draft[field]} field={field} />
          </div>;
        })}
      </div>
      {candidates.length > 1 ? <div className="pivot-source-history__candidate-images">
        <strong>Images found on page</strong>
        {candidates.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="Image candidate" loading="lazy" /></a>)}
      </div> : null}
      {entry.warnings?.length ? <p className="pivot-source-history__preview-warning">{entry.warnings.join(' · ')}</p> : null}
      {draft.sourceUrl ? <a href={draft.sourceUrl} target="_blank" rel="noreferrer">Open event page ↗</a> : null}
    </div>
  </article>;
}

export default function PivotSourceEventHistoryPopup({ open, source, tenantKey, cityLabel,
  catalogTags = [], onClose, onUpdated, preview = null }) {
  const [status, setStatus] = useState('all');
  const [entrypointId, setEntrypointId] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => { setPage(1); setStatus('all'); setEntrypointId(''); setResult(null); setEditing(null); }, [source?._id]);

  useEffect(() => {
    if (!open || preview || !source?._id || !tenantKey) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    setResult(null);
    const url = `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/sources/${encodeURIComponent(source._id)}/events?page=${page}&status=${status}${entrypointId ? `&entrypointId=${encodeURIComponent(entrypointId)}` : ''}`;
    authenticatedRequest(url).then(({ data, error: requestError }) => {
      if (!active) return;
      if (requestError || !data?.success) setError(requestError || data?.message || 'Could not load source events.');
      else setResult(data.data);
      setLoading(false);
    }).catch(() => {
      if (active) { setError('Could not load source events.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [open, preview, source?._id, tenantKey, page, status, entrypointId, revision]);

  const saveEdit = useCallback(async (draft, learning = {}) => {
    if (!editing) return false;
    setSaving(true);
    setSaveError('');
    const { ingestStatus: _unchangedStatus, ...overrides } = catalogEditDraftToOverrides(draft);
    try {
      const { data, error: requestError } = await authenticatedRequest(`/admin/pivot/ingest/${encodeURIComponent(editing._id)}`,
        { method: 'PATCH', data: { tenantKey, overrides, ...learning } });
      if (requestError || !data?.success) {
        setSaveError(requestError || data?.message || 'Could not save event corrections.');
        return false;
      }
      setEditing(null);
      setRevision((current) => current + 1);
      onUpdated?.();
      return true;
    } catch {
      setSaveError('Could not save event corrections.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [editing, onUpdated, tenantKey]);

  if (!open || !source) return null;
  if (preview) {
    const drafts = preview.data?.drafts || [];
    return <Popup isOpen={open} onClose={onClose}
      customClassName="pivot-source-history__shell pivot-source-history__shell--preview" hideCloseButton>
      <section className="pivot-source-history" role="dialog" aria-modal="true"
        aria-label={`${preview.label || 'Scrape preview'} for ${preview.job?.label || source.label || source.host}`}>
        <header className="pivot-source-history__header">
          <div><span>Scrape preview · {preview.job?.label || source.label || source.host}</span>
            <h2>{preview.label || 'Scrape preview'}</h2>
            <p>Compare extracted values with matching catalog events. This preview does not save events.</p></div>
          <button type="button" onClick={onClose} aria-label="Close scrape preview">Close</button>
        </header>
        <div className="pivot-source-history__toolbar"><strong>{drafts.length} extracted event{drafts.length === 1 ? '' : 's'}</strong>
          <span>{drafts.filter((entry) => entry.catalogEvent).length} matched in catalog</span></div>
        {preview.data?.warnings?.length ? <div className="pivot-source-history__preview-warnings" role="status">
          {preview.data.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div> : null}
        <div className="pivot-source-history__events">
          {drafts.map((entry, index) => <PreviewEvent key={entry.sourceUrl || index} entry={entry} index={index} />)}
        </div>
      </section>
    </Popup>;
  }
  const total = result?.total || 0;
  const pageSize = result?.pageSize || 24;
  const events = result?.events || [];
  const entrypoints = new Map((source.entrypoints || []).map((job) => [job.id, job.label || job.url]));
  return <>
    <Popup isOpen={open} onClose={onClose} customClassName="pivot-source-history__shell" hideCloseButton
      disableOutsideClick={Boolean(editing)}>
      <HistoryBody>
      <section className="pivot-source-history" role="dialog" aria-modal="true" aria-label={`${source.label || source.host} past events`}>
        <header className="pivot-source-history__header">
          <div><span>Source event history</span><h2>{source.label || source.host}</h2>
            <p>Events attributed to this source or observed through its entrypoints, across all catalog weeks.</p></div>
          <button type="button" onClick={onClose} aria-label="Close source event history">Close</button>
        </header>
        <div className="pivot-source-history__toolbar">
          <strong>{total} event{total === 1 ? '' : 's'}</strong>
          <label>Status <select aria-label="Filter source events by status" value={status}
            onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="all">All</option><option value="staged">Staged</option><option value="published">Published</option>
          </select></label>
          {(source.entrypoints || []).length ? <label>Entrypoint <select aria-label="Filter source events by entrypoint"
            value={entrypointId} onChange={(event) => { setEntrypointId(event.target.value); setPage(1); }}>
            <option value="">All entrypoints</option>
            {source.entrypoints.map((job) => <option key={job.id} value={job.id}>{job.label || job.url}</option>)}
          </select></label> : null}
        </div>
        {loading ? <p role="status">Loading source events…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!loading && !error && !events.length ? <p>No events found for this source and status.</p> : null}
        <div className="pivot-source-history__events">
          {events.map((event) => <article className="pivot-source-history__event" key={event._id}>
            {event.image ? <img src={event.image} alt="" loading="lazy" /> : <div className="pivot-source-history__no-image">No image</div>}
            <div className="pivot-source-history__event-main">
              <div className="pivot-source-history__event-heading"><h3>{event.name}</h3>
                <span>{event.ingestStatus || 'Unknown'} · {event.attribution === 'primary' ? 'Attributed' : 'Also observed'}</span></div>
              <p>{dateLabel(event.start_time)} · {event.location || 'Venue missing'}</p>
              <p>{event.organizerName || 'Organizer missing'} · {event.batchWeek || 'No week'}
                {event.featured ? ' · Featured' : ''}</p>
              {event.entrypointId ? <small>Entrypoint: {entrypoints.get(event.entrypointId) || event.entrypointId}</small> : null}
              {event.description ? <p className="pivot-source-history__description">{event.description}</p> : null}
              <div className="pivot-source-history__actions">
                <button type="button" onClick={() => { setSaveError(''); setEditing(event); }}>Edit event</button>
                {event.sourceUrl ? <a href={event.sourceUrl} target="_blank" rel="noreferrer">Source page ↗</a> : null}
              </div>
            </div>
          </article>)}
        </div>
        {total > pageSize ? <div className="pivot-source-history__pagination">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {page} of {Math.ceil(total / pageSize)}</span>
          <button type="button" disabled={page * pageSize >= total || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
        </div> : null}
      </section>
      </HistoryBody>
    </Popup>
    <PivotCatalogEventEditModal open={Boolean(editing)} event={editing} onClose={() => setEditing(null)}
      onSave={saveEdit} saving={saving} notices={saveError ? [saveError] : []} elevated lockIngestStatus
      catalogTags={catalogTags} cityLabel={cityLabel} batchWeek={editing?.batchWeek} />
  </>;
}
