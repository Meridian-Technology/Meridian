import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedRequest } from '../../../../hooks/useFetch';
import {
  chipsFromCurationQuery,
  removeCurationChip,
  resetCurationQuery,
} from './carouselCurationQuery';
import { filterCurationCandidates } from './carouselCurationCatalog';
import PivotCarouselCurationCatalog from './PivotCarouselCurationCatalog';
import {
  addSelection,
  addVisibleSelection,
  COVER_PRESETS,
  EVENT_PRESETS,
  defaultQueryForFormat,
  describeCurationDiff,
  diffSelection,
  eventRefKey,
  moveSelection,
  newIdempotencyKey,
  previousCurationStep,
  removeSelection,
  selectionWarnings,
  slideEstimate,
} from './carouselCurationSelection';
import {
  clearCurationDraftLocal,
  curationDraftStorageKey,
  readCurationDraftLocal,
  shouldRecoverLocalDraft,
  writeCurationDraftLocal,
} from './carouselCurationDraftStorage';
import './PivotCarouselCurationWorkspace.scss';

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatLabel(format) {
  return format === 'sorry-you-missed-it' ? 'Sorry you missed it' : 'City picks';
}

export default function PivotCarouselCurationWorkspace({
  account,
  draftId,
  issue,
  onDraftId,
  onCreated,
  onApplied,
  onCancel,
  notify,
}) {
  const [step, setStep] = useState('search');
  const [draft, setDraft] = useState(null);
  const [format, setFormat] = useState(account?.defaultFormat || 'city-picks');
  const [query, setQuery] = useState(() => ({
    ...resetCurationQuery(),
    ...defaultQueryForFormat(account?.defaultFormat, account?.sourceTenantKeys, account?.ownerTenantKey),
  }));
  const [selected, setSelected] = useState([]);
  const [theme, setTheme] = useState('');
  const [coverPreset, setCoverPreset] = useState('loose-letters');
  const [eventPreset, setEventPreset] = useState('photo-note');
  const [name, setName] = useState('');
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const [results, setResults] = useState([]);
  const [sources, setSources] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [complete, setComplete] = useState(true);
  const [chips, setChips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [revalidation, setRevalidation] = useState(null);
  const [diff, setDiff] = useState(null);
  const [ready, setReady] = useState(!draftId);
  const saveTimer = useRef(null);
  const previousRefs = issue?.curation?.refs || issue?.sources || [];

  const path = `/admin/pivot/carousel-accounts/${account.id}/curation`;
  const storageKey = curationDraftStorageKey({
    accountId: account.id,
    issueId: issue?.id,
    draftId: draftId || 'open',
  });

  const persist = useCallback(async (nextDraftId, payload) => {
    writeCurationDraftLocal(storageKey, payload);
    const body = {
      format: payload.format,
      query: { ...payload.query, cursor: null },
      selected: payload.selected,
      theme: payload.theme,
      coverPreset: payload.coverPreset,
      eventPreset: payload.eventPreset,
      issueId: issue?.id || undefined,
      idempotencyKey,
    };
    if (nextDraftId) {
      return authenticatedRequest(`${path}/drafts/${nextDraftId}`, { method: 'PATCH', data: body });
    }
    return authenticatedRequest(`${path}/drafts`, { method: 'POST', data: body });
  }, [idempotencyKey, issue?.id, path, storageKey]);

  const queueSave = useCallback((payload) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const result = await persist(draftId, payload);
      setSaving(false);
      if (result.data?.success) {
        setDraft(result.data.data.draft);
        if (!draftId) onDraftId(result.data.data.draft.id);
      }
    }, 400);
  }, [draftId, onDraftId, persist]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!draftId) {
        const local = readCurationDraftLocal(storageKey);
        if (local?.selected?.length) {
          setSelected(local.selected);
          setTheme(local.theme || '');
          setFormat(local.format || format);
          setQuery((current) => ({ ...current, ...(local.query || {}) }));
        }
        setReady(true);
        return;
      }
      const result = await authenticatedRequest(`${path}/drafts/${draftId}`);
      if (cancelled) return;
      if (!result.data?.success) {
        setReady(true);
        return;
      }
      const loaded = result.data.data.draft;
      const local = readCurationDraftLocal(storageKey);
      const useLocal = shouldRecoverLocalDraft(local, loaded);
      setDraft(loaded);
      setFormat(useLocal ? local.format : loaded.format);
      setQuery((current) => ({ ...current, ...(useLocal ? local.query : loaded.query) }));
      setSelected(useLocal ? local.selected : loaded.selected || []);
      setTheme(useLocal ? local.theme : loaded.theme || '');
      setCoverPreset(loaded.coverPreset || 'loose-letters');
      setEventPreset(loaded.eventPreset || 'photo-note');
      setReady(true);
    }
    boot();
    return () => { cancelled = true; };
  }, [draftId, path, storageKey]);

  const snapshot = useMemo(() => ({
    format, query, selected, theme, coverPreset, eventPreset,
  }), [format, query, selected, theme, coverPreset, eventPreset]);

  useEffect(() => {
    if (!account?.id || !ready) return;
    queueSave(snapshot);
  }, [account?.id, queueSave, ready, snapshot]);

  const estimate = slideEstimate(selected.length);
  const warnings = selectionWarnings(selected, { format });
  const selectedKeys = useMemo(() => new Set(selected.map((item) => eventRefKey(item.ref))), [selected]);

  const search = useCallback(async (nextQuery, append = false) => {
    setLoading(true);
    setError(null);
    const result = await authenticatedRequest(`${path}/search`, {
      method: 'POST',
      data: { ...nextQuery, cursor: append ? nextQuery.cursor : null },
    });
    setLoading(false);
    if (!result.data?.success) {
      setError(result.data?.message || result.error || 'Could not search the catalog.');
      return;
    }
    const data = result.data.data;
    setResults((current) => (append ? [...current, ...data.candidates] : data.candidates));
    setSources(data.sources || []);
    setCursor(data.continuation?.cursor || null);
    setComplete(data.continuation?.complete !== false);
    setChips(data.chips || chipsFromCurationQuery(nextQuery));
    setQuery((current) => ({ ...current, cursor: data.continuation?.cursor || null }));
  }, [path]);

  useEffect(() => {
    if (!ready || !account?.id) return undefined;
    const delay = query.keyword ? 280 : 0;
    const timer = setTimeout(() => {
      search({ ...query, cursor: null }, false);
    }, delay);
    return () => clearTimeout(timer);
    // Load the catalog first, then treat keyword/when as filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, ready, query.keyword, query.temporalMode, format]);

  const updateQuery = (patch) => {
    setQuery((current) => ({ ...current, ...patch, cursor: null }));
  };

  const visible = useMemo(
    () => filterCurationCandidates(results, query.keyword),
    [query.keyword, results],
  );

  const toggleCandidate = (candidate) => {
    const key = eventRefKey(candidate.ref);
    if (selectedKeys.has(key)) {
      setSelected(removeSelection(selected, candidate.ref));
      setError(null);
      return;
    }
    const result = addSelection(selected, candidate);
    setSelected(result.selected);
    setError(result.duplicate ? 'That event is already in the tray.' : null);
  };

  const failedSources = sources.filter((row) => row.status === 'failed');

  const goReview = async () => {
    if (!selected.length) {
      setError('Select at least one event.');
      return;
    }
    if (estimate.overflow) {
      setError(`An issue can hold ${estimate.maxSlides} slides, including the cover.`);
      return;
    }
    setDiff(issue ? diffSelection(previousRefs, selected.map((item) => item.ref)) : null);
    setStep('review');
  };

  const goName = async () => {
    setLoading(true);
    let id = draftId || draft?.id;
    if (!id) {
      const created = await persist(null, snapshot);
      if (!created.data?.success) {
        setLoading(false);
        setError(created.data?.message || 'Could not save the draft.');
        return;
      }
      id = created.data.data.draft.id;
      setDraft(created.data.data.draft);
      onDraftId(id);
    }
    const result = await authenticatedRequest(`${path}/drafts/${id}/revalidate`, { method: 'POST' });
    setLoading(false);
    if (!result.data?.success) {
      setError(result.data?.message || 'Could not revalidate the selection.');
      return;
    }
    setDraft(result.data.data.draft);
    setSelected(result.data.data.draft.selected || selected);
    setRevalidation(result.data.data.revalidation);
    setStep('name');
  };

  const finish = async () => {
    const id = draftId || draft?.id;
    if (!id) {
      setError('The draft is still saving.');
      return;
    }
    if (!name.trim()) {
      setError('Name the issue after you have reviewed the batch.');
      return;
    }
    setLoading(true);
    const stale = revalidation && (
      revalidation.missing?.length || revalidation.unavailable?.length || revalidation.complete === false
    );
    const endpoint = issue ? 'apply' : 'create';
    const result = await authenticatedRequest(`${path}/drafts/${id}/${endpoint}`, {
      method: 'POST',
      data: {
        name: name.trim(),
        idempotencyKey,
        acceptChanges: Boolean(stale),
        issueId: issue?.id,
        revision: issue?.revision,
      },
    });
    setLoading(false);
    if (!result.data?.success) {
      setError(result.data?.message || 'Could not save the issue.');
      if (result.data?.details) setRevalidation(result.data.details);
      notify?.({ title: 'Could not finish curation', message: result.data?.message || 'The request failed.', type: 'error' });
      return;
    }
    clearCurationDraftLocal(storageKey);
    if (issue) onApplied(result.data.data);
    else onCreated(result.data.data);
  };

  return (
    <div className="jg-curate">
      <header className="jg-curate__head">
        <button type="button" className="jg-curate__quiet" onClick={onCancel}>All issues</button>
        <h2>{issue ? 'Edit selection' : 'New issue'}</h2>
        <p>
          {formatLabel(format)}
          {saving ? ' · saving draft' : ''}
          {` · ${selected.length} selected · ${estimate.slideCount} slides`}
        </p>
      </header>

      {error && <p className="jg-curate__alert" role="alert">{error}</p>}

      {step === 'search' && (
        <>
          <div className="jg-curate__toolbar">
            <label className="pivot-curation-sheet__search">
              <span className="visually-hidden">Filter events</span>
              <input
                type="search"
                value={query.keyword}
                onChange={(event) => updateQuery({ keyword: event.target.value })}
                placeholder="Filter events, hosts, locations…"
                autoComplete="off"
                spellCheck="false"
              />
            </label>
            <label>
              Format
              <select value={format} onChange={(event) => {
                const next = event.target.value;
                setFormat(next);
                updateQuery(defaultQueryForFormat(next, account.sourceTenantKeys, account.ownerTenantKey));
              }}>
                <option value="city-picks">City picks</option>
                <option value="sorry-you-missed-it">Sorry you missed it</option>
              </select>
            </label>
            <label>
              When
              <select value={query.temporalMode} onChange={(event) => updateQuery({ temporalMode: event.target.value })}>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
                <option value="any">Any date</option>
              </select>
            </label>
          </div>

          <div className="jg-curate__chips">
            {chips.filter((chip) => chip.id !== 'keyword' && chip.id !== 'temporal').map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setQuery(removeCurationChip(query, chip.id))}
              >
                {chip.label} ×
              </button>
            ))}
          </div>

          {failedSources.length > 0 && (
            <p className="jg-curate__warn" role="status">
              {failedSources.map((row) => `${row.tenantKey}: ${row.error}`).join(' · ')}
              {' '}
              <button type="button" onClick={() => search({ ...query, cursor: null }, false)}>Retry</button>
              {!complete && ' Results are incomplete.'}
            </p>
          )}

          <div className="jg-curate__results">
            <div className="jg-curate__result-bar">
              <button type="button" onClick={() => setSelected(addVisibleSelection(selected, visible).selected)}>
                Select visible
              </button>
            </div>
            <PivotCarouselCurationCatalog
              candidates={visible}
              selectedKeys={selectedKeys}
              loading={loading}
              keyword={query.keyword}
              onToggle={toggleCandidate}
            />
            {cursor && (
              <button type="button" className="jg-curate__more" onClick={() => search({ ...query, cursor }, true)} disabled={loading}>
                More
              </button>
            )}
          </div>
        </>
      )}

      {step === 'review' && (
        <section className="jg-curate__review">
          <label>
            Optional theme
            <input value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="A catchy cover title, not the issue name" />
          </label>
          <div className="jg-curate__presets">
            <label>
              Cover start
              <select value={coverPreset} onChange={(event) => setCoverPreset(event.target.value)}>
                {COVER_PRESETS.map((id) => <option key={id} value={id}>{id.replace(/-/g, ' ')}</option>)}
              </select>
            </label>
            <label>
              Event start
              <select value={eventPreset} onChange={(event) => setEventPreset(event.target.value)}>
                {EVENT_PRESETS.map((id) => <option key={id} value={id}>{id.replace(/-/g, ' ')}</option>)}
              </select>
            </label>
          </div>
          {estimate.overflow && (
            <p className="jg-curate__alert">This batch would create {estimate.slideCount} slides. The cap is {estimate.maxSlides}.</p>
          )}
          {warnings.map((warning) => (
            <p key={`${warning.code}-${warning.ref?.eventId || warning.message}`} className="jg-curate__warn">{warning.message}</p>
          ))}
          {diff && <p className="jg-curate__note">{describeCurationDiff(diff)}</p>}
          <ol className="jg-curate__batch">
            {selected.map((item) => (
              <li key={eventRefKey(item.ref)}>
                <strong>{item.snapshot.name}</strong>
                <em>{item.snapshot.city?.name || item.ref.sourceTenantKey} · {when(item.snapshot.startTime)}</em>
                {item.snapshot.sourceUrl && (
                  <a href={item.snapshot.sourceUrl} target="_blank" rel="noreferrer">Source</a>
                )}
                <label>
                  Recap note
                  <input
                    value={item.recapNote || ''}
                    onChange={(event) => setSelected(selected.map((row) => (
                      eventRefKey(row.ref) === eventRefKey(item.ref)
                        ? { ...row, recapNote: event.target.value }
                        : row
                    )))}
                  />
                </label>
              </li>
            ))}
          </ol>
        </section>
      )}

      {step === 'name' && (
        <section className="jg-curate__name">
          <p>The issue name is internal. It does not print on the cover.</p>
          {revalidation && (
            <ul className="jg-curate__report">
              {revalidation.missing?.map((ref) => (
                <li key={eventRefKey(ref)}>Missing: {ref.sourceTenantKey}/{ref.eventId}</li>
              ))}
              {revalidation.unavailable?.map((row) => (
                <li key={eventRefKey(row.ref)}>Unavailable: {row.ref.eventId} ({row.publication})</li>
              ))}
              {revalidation.changed?.map((row) => (
                <li key={eventRefKey(row.ref)}>Changed: {row.ref.eventId} ({row.fields.join(', ')})</li>
              ))}
              {revalidation.complete === false && <li>One or more cities could not be rechecked.</li>}
              {!revalidation.missing?.length && !revalidation.unavailable?.length && !revalidation.changed?.length && revalidation.complete !== false && (
                <li>Selection still matches the catalog.</li>
              )}
            </ul>
          )}
          <label>
            Issue name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
          </label>
        </section>
      )}

      <aside className="jg-curate__tray">
        <header>
          <strong>{selected.length} selected</strong>
          <span>{estimate.slideCount} / {estimate.maxSlides} slides</span>
        </header>
        <ol>
          {selected.map((item, index) => (
            <li key={eventRefKey(item.ref)}>
              <b>{item.snapshot.name}</b>
              <span>{item.snapshot.city?.tenantKey || item.ref.sourceTenantKey}</span>
              <span className="jg-curate__tray-ops">
                <button type="button" disabled={index === 0} onClick={() => setSelected(moveSelection(selected, item.ref, -1))}>Up</button>
                <button type="button" disabled={index === selected.length - 1} onClick={() => setSelected(moveSelection(selected, item.ref, 1))}>Down</button>
                <button type="button" onClick={() => setSelected(removeSelection(selected, item.ref))}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
      </aside>

      <footer className="jg-curate__foot">
        {step !== 'search' && (
          <button type="button" onClick={() => setStep(previousCurationStep(step))}>Back</button>
        )}
        {step === 'search' && (
          <button type="button" onClick={goReview} disabled={!selected.length || estimate.overflow}>
            Review selection
          </button>
        )}
        {step === 'review' && (
          <button type="button" onClick={goName} disabled={!selected.length || estimate.overflow || loading}>
            Continue to name
          </button>
        )}
        {step === 'name' && (
          <button type="button" onClick={finish} disabled={loading || !name.trim()}>
            {issue ? 'Update issue' : 'Create issue'}
          </button>
        )}
      </footer>
    </div>
  );
}

