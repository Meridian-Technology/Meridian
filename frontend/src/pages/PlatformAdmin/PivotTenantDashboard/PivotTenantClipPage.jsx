import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  PivotOpsBanner,
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
} from '../../../components/PivotOps';
import { justGoPublicUrl } from '../../JustGoLanding/justGoLandingCopy';
import PivotTenantPage from './PivotTenantPage';
import PivotClipTextEditor from './PivotClipTextEditor';
import {
  CLIP_DECK_SOURCES,
  CLIP_PIN_STATE_LABELS,
  addClipPin,
  clipAdminPaths,
  clipConfigFromDraft,
  clipDraftFromData,
  clipSearchUrl,
  countPlayablePins,
  describeClipPreview,
  formatClipEventDate,
  isClipDraftDirty,
  moveClipPin,
  removeClipPin,
} from './pivotClipAdmin';
import './PivotTenantClipPage.scss';

const NO_FETCH_CACHE = { enabled: false };
const SEARCH_DEBOUNCE_MS = 280;

/*
 * The clip reports nothing yet. These are the numbers it will show once it
 * does; until then every value is a dash.
 */
const CONVERSION_PLACEHOLDERS = [
  { key: 'opens', label: 'Opens', hint: 'Clip launches from a tag, poster, or link' },
  { key: 'packOpened', label: 'Pack opened', hint: 'Saw the deck after the pack tore open' },
  { key: 'swipes', label: 'Swipes', hint: 'Cards passed or saved in the clip' },
  { key: 'finished', label: 'Finished deck', hint: 'Reached the picks card' },
  { key: 'getApp', label: 'Get the app', hint: 'Tapped the install prompt' },
  { key: 'handoff', label: 'Picks imported', hint: 'Signed in to the app with clip swipes waiting' },
];

function EventThumb({ event }) {
  return event.coverImageUrl ? (
    <img className="pivot-clip-event__thumb" src={event.coverImageUrl} alt="" loading="lazy" />
  ) : (
    <span className="pivot-clip-event__thumb pivot-clip-event__thumb--empty" aria-hidden="true" />
  );
}

function EventSummary({ event }) {
  const when = formatClipEventDate(event.startTime);
  return (
    <div className="pivot-clip-event__copy">
      <span className="pivot-clip-event__name">{event.name || 'Untitled event'}</span>
      <span className="pivot-clip-event__meta">
        {[event.hostName, when, event.batchWeek].filter(Boolean).join(' · ')}
      </span>
    </div>
  );
}

function ClipStatusSection({ tenantKey, data, loading, onRefresh }) {
  const { addNotification } = useNotification();
  const clipUrl = justGoPublicUrl(`/clip/${encodeURIComponent(tenantKey)}`);
  const preview = data?.preview;
  const summary = describeClipPreview(preview);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(clipUrl);
      addNotification({ title: 'Link copied', message: clipUrl, type: 'success' });
    } catch {
      addNotification({ title: 'Could not copy link', message: clipUrl, type: 'error' });
    }
  }, [addNotification, clipUrl]);

  return (
    <PivotOpsSection
      title="Live deck"
      titleId="pivot-clip-live-title"
      description="What someone gets if they open the clip in this city right now."
      actions={(
        <button
          type="button"
          className="linear-btn linear-btn--ghost linear-btn--sm"
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </button>
      )}
    >
      {data && data.cityStatus !== 'active' ? (
        <PivotOpsBanner tone="warn" title="City isn’t active">
          The public clip only opens active cities. This is what it will play once the city is live.
        </PivotOpsBanner>
      ) : null}
      {data?.previewError ? <p className="pivot-clip__error">{data.previewError}</p> : null}

      <div className="pivot-clip-status">
        <div className="pivot-clip-status__summary">
          <span className="pivot-clip-status__title">{summary.title}</span>
          {summary.detail ? <span className="pivot-clip__muted">{summary.detail}</span> : null}
          {preview?.nextDropAt ? (
            <span className="pivot-clip__muted">
              Next drop {formatClipEventDate(preview.nextDropAt)}
            </span>
          ) : null}
        </div>
        <div className="pivot-clip-status__link">
          <code>{clipUrl}</code>
          <button
            type="button"
            className="linear-btn linear-btn--secondary linear-btn--sm"
            onClick={copyLink}
          >
            Copy link
          </button>
        </div>
      </div>
      <p className="pivot-clip__muted pivot-clip-status__hint">
        Add <code>?ref=CODE</code> to carry an invite code into the app, or a third path segment
        (<code>/clip/{tenantKey}/tag-1</code>) to label a tag.
      </p>

      {preview?.events?.length ? (
        <ol className="pivot-clip-preview">
          {preview.events.map((event) => (
            <li key={event.id} className="pivot-clip-event">
              <EventThumb event={event} />
              <EventSummary event={event} />
            </li>
          ))}
        </ol>
      ) : null}
    </PivotOpsSection>
  );
}

function ClipConversionSection() {
  return (
    <PivotOpsSection
      title="Conversion"
      titleId="pivot-clip-conversion-title"
      description="From tap to installed app."
    >
      <PivotOpsBanner tone="muted" title="Not tracked yet">
        The clip doesn’t send analytics yet. These fill in once it does.
      </PivotOpsBanner>
      <PivotOpsMetricGrid className="pivot-clip-conversion">
        {CONVERSION_PLACEHOLDERS.map((metric) => (
          <PivotOpsMetric
            key={metric.key}
            label={metric.label}
            value="—"
            hint={metric.hint}
            className="pivot-clip-conversion__metric"
          />
        ))}
      </PivotOpsMetricGrid>
    </PivotOpsSection>
  );
}

function ClipPinnedList({ draft, limits, onChange }) {
  const curated = draft.curated;
  if (!curated.length) {
    return <p className="pivot-clip__muted">Nothing pinned yet. Search below to add cards.</p>;
  }
  return (
    <ol className="pivot-clip-pins">
      {curated.map((event, index) => {
        const stateLabel = CLIP_PIN_STATE_LABELS[event.state] || null;
        const skipped = event.state !== 'live' && !(event.state === 'ended' && !draft.hidePastEvents);
        return (
          <li
            key={event.id}
            className={`pivot-clip-event pivot-clip-pins__row${skipped ? ' is-skipped' : ''}`}
          >
            <span className="pivot-clip-pins__index">{index + 1}</span>
            <EventThumb event={event} />
            <EventSummary event={event.state === 'missing' ? { ...event, name: 'Deleted event' } : event} />
            {stateLabel ? (
              <span className={`pivot-clip-pins__state pivot-clip-pins__state--${event.state}`}>
                {stateLabel}
              </span>
            ) : null}
            <div className="pivot-clip-pins__actions">
              <button
                type="button"
                className="linear-btn linear-btn--ghost linear-btn--sm"
                aria-label={`Move ${event.name || 'event'} up`}
                disabled={index === 0}
                onClick={() => onChange(moveClipPin(curated, index, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="linear-btn linear-btn--ghost linear-btn--sm"
                aria-label={`Move ${event.name || 'event'} down`}
                disabled={index === curated.length - 1}
                onClick={() => onChange(moveClipPin(curated, index, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="linear-btn linear-btn--ghost linear-btn--sm"
                aria-label={`Unpin ${event.name || 'event'}`}
                onClick={() => onChange(removeClipPin(curated, event.id))}
              >
                Remove
              </button>
            </div>
          </li>
        );
      })}
      {limits?.curatedMax ? (
        <li className="pivot-clip__muted pivot-clip-pins__cap">
          {curated.length} of {limits.curatedMax} pinned
        </li>
      ) : null}
    </ol>
  );
}

function ClipEventSearch({ tenantKey, draft, limits, onChange }) {
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [includePast, setIncludePast] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data: response, loading, error } = useFetch(
    clipSearchUrl(tenantKey, { q: term, includePast }),
    { cache: NO_FETCH_CACHE },
  );
  const results = response?.success ? response.data?.events || [] : [];
  const pinned = useMemo(() => new Set(draft.curated.map((row) => row.id)), [draft.curated]);
  const full = Boolean(limits?.curatedMax) && draft.curated.length >= limits.curatedMax;
  const searchError = error || (response && !response.success ? response.message : null);

  return (
    <div className="pivot-clip-search">
      <h3 className="pivot-clip__subhead">Add cards</h3>
      <div className="pivot-clip-search__controls">
        <input
          type="search"
          value={query}
          placeholder="Search published events from any week"
          aria-label="Search events to pin"
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="pivot-clip__check">
          <input
            type="checkbox"
            checked={includePast}
            onChange={(event) => setIncludePast(event.target.checked)}
          />
          Include past events
        </label>
      </div>
      {searchError ? <p className="pivot-clip__error">{searchError}</p> : null}
      {!searchError && !loading && response?.success && !results.length ? (
        <p className="pivot-clip__muted">No published events match.</p>
      ) : null}
      <ul className="pivot-clip-search__results">
        {results.map((event) => {
          const isPinned = pinned.has(event.id);
          return (
            <li key={event.id} className="pivot-clip-event">
              <EventThumb event={event} />
              <EventSummary event={event} />
              {event.state === 'ended' ? (
                <span className="pivot-clip-pins__state pivot-clip-pins__state--ended">Ended</span>
              ) : null}
              <button
                type="button"
                className="linear-btn linear-btn--secondary linear-btn--sm"
                disabled={isPinned || full}
                onClick={() => onChange(addClipPin(draft.curated, event, limits?.curatedMax))}
              >
                {isPinned ? 'Pinned' : 'Pin'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ClipDeckSection({ tenantKey, data, draft, setDraft, onSaved }) {
  const { addNotification } = useNotification();
  const [saving, setSaving] = useState(false);
  const dirty = isClipDraftDirty(draft, data);
  const limits = data?.limits;
  const playable = countPlayablePins(draft);

  const patch = useCallback((changes) => setDraft((prev) => ({ ...prev, ...changes })), [setDraft]);
  const setCurated = useCallback((curated) => patch({ curated }), [patch]);

  const save = useCallback(async () => {
    setSaving(true);
    const { data: res, error } = await authenticatedRequest(clipAdminPaths(tenantKey).clip, {
      method: 'PUT',
      data: { config: clipConfigFromDraft(draft) },
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);
    if (error || !res?.success) {
      addNotification({
        title: 'Save failed',
        message: res?.message || error || 'Unable to save App Clip settings.',
        type: 'error',
      });
      return;
    }
    onSaved(res.data);
    addNotification({
      title: 'App Clip saved',
      message: 'The clip picks this up on its next open.',
      type: 'success',
    });
  }, [addNotification, draft, onSaved, tenantKey]);

  return (
    <PivotOpsSection
      title="Deck"
      titleId="pivot-clip-deck-title"
      description="Which cards the clip plays, and how many."
      actions={(
        <>
          <button
            type="button"
            className="linear-btn linear-btn--ghost linear-btn--sm"
            disabled={!dirty || saving}
            onClick={() => setDraft(clipDraftFromData(data))}
          >
            Discard
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--primary linear-btn--sm"
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save deck'}
          </button>
        </>
      )}
    >
      <fieldset className="pivot-clip-config">
        <legend className="pivot-clip__subhead">Cards come from</legend>
        {CLIP_DECK_SOURCES.map((source) => (
          <label key={source.id} className="pivot-clip-config__source">
            <input
              type="radio"
              name="pivot-clip-deck-source"
              value={source.id}
              checked={draft.deckSource === source.id}
              onChange={() => patch({ deckSource: source.id })}
            />
            <span>
              <span className="pivot-clip-config__label">{source.label}</span>
              <span className="pivot-clip__muted">{source.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="pivot-clip-config__grid">
        <label className="pivot-clip-config__field">
          <span className="pivot-clip-config__label">Cards per deck</span>
          <input
            type="number"
            min={1}
            max={limits?.cardLimitMax || 24}
            value={draft.cardLimit}
            onChange={(event) => patch({ cardLimit: event.target.value })}
          />
        </label>
        <label className="pivot-clip__check">
          <input
            type="checkbox"
            checked={draft.hidePastEvents}
            disabled={draft.deckSource !== 'custom'}
            onChange={(event) => patch({ hidePastEvents: event.target.checked })}
          />
          Skip pinned events that have ended
        </label>
        <label className="pivot-clip__check">
          <input
            type="checkbox"
            checked={draft.fallbackToWeek}
            disabled={draft.deckSource !== 'custom'}
            onChange={(event) => patch({ fallbackToWeek: event.target.checked })}
          />
          Play this week’s drop when no pin is playable
        </label>
      </div>

      <div className="pivot-clip-curation">
        <h3 className="pivot-clip__subhead">
          Pinned list
          <span className="pivot-clip__muted"> · {playable} playable</span>
        </h3>
        {draft.deckSource !== 'custom' && draft.curated.length ? (
          <PivotOpsBanner tone="info">
            Pins are kept, but the clip plays this week’s drop until you switch to Pinned list.
          </PivotOpsBanner>
        ) : null}
        <ClipPinnedList draft={draft} limits={limits} onChange={setCurated} />
        <ClipEventSearch tenantKey={tenantKey} draft={draft} limits={limits} onChange={setCurated} />
      </div>
    </PivotOpsSection>
  );
}

/**
 * Content → App Clip: what the clip plays in this city, its wording, and
 * (once the clip reports them) its conversion numbers.
 */
function PivotTenantClipPage({ tenantKey, cityDisplayName, title = 'Content', nav = null }) {
  const { data: response, loading, error, refetch } = useFetch(
    clipAdminPaths(tenantKey).clip,
    { cache: NO_FETCH_CACHE },
  );
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const dataRef = useRef(null);

  // A refresh keeps unsaved deck edits for the same city; a save replaces them.
  const applyData = useCallback((next, { keepEdits }) => {
    const previous = dataRef.current;
    const sameCity = previous?.tenantKey === next?.tenantKey;
    setDraft((prev) => (
      keepEdits && sameCity && prev && isClipDraftDirty(prev, previous)
        ? prev
        : clipDraftFromData(next)
    ));
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => {
    if (response?.success) applyData(response.data, { keepEdits: true });
  }, [response, applyData]);

  const handleSaved = useCallback((next) => applyData(next, { keepEdits: false }), [applyData]);

  const loadError = error || (response && !response.success ? response.message : null);

  return (
    <PivotTenantPage
      title={title}
      tenantKey={tenantKey}
      cityDisplayName={cityDisplayName}
      className="pivot-tenant-clip"
    >
      {nav}
      {loadError ? <p className="pivot-clip__error">{loadError}</p> : null}
      {!data && loading ? <p className="pivot-clip__muted">Loading App Clip…</p> : null}
      {data ? (
        <div className="pivot-clip">
          <ClipStatusSection
            tenantKey={tenantKey}
            data={data}
            loading={loading}
            onRefresh={refetch}
          />
          <ClipConversionSection />
          {draft ? (
            <ClipDeckSection
              tenantKey={tenantKey}
              data={data}
              draft={draft}
              setDraft={setDraft}
              onSaved={handleSaved}
            />
          ) : null}
          <PivotClipTextEditor tenantKey={tenantKey} />
        </div>
      ) : null}
    </PivotTenantPage>
  );
}

export default PivotTenantClipPage;
