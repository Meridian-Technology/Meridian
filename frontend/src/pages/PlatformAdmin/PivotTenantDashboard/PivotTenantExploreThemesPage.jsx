import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { PivotOpsBanner, PivotOpsSection, PivotOpsStatus } from '../../../components/PivotOps';
import PivotTenantPage from './PivotTenantPage';
import PivotTenantViewTabs from './PivotTenantViewTabs';
import PivotCarouselPopup from './carousel/PivotCarouselPopup';
import PivotCurationQueue from './PivotCurationQueue';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import useBrokenCatalogImages from './useBrokenCatalogImages';
import {
  FILTER_OPTIONS,
  HOST_CREATED_SOURCE,
  compareCurationEvents,
  eventMatchesFilter,
  eventMatchesSourceFilter,
  isHostCreatedEvent,
} from './curationCatalogFilters';
import { batchWeekFromEventDate, toIsoWeek } from '../../../utils/pivotIsoWeek';
import { formatClipEventDate, moveClipPin, removeClipPin } from './pivotClipAdmin';
import {
  EXPLORE_THEME_GROUP_SOURCES,
  EXPLORE_THEME_STATUS,
  exploreThemeDraftFromTheme,
  exploreThemeDraftKey,
  exploreThemeCarouselGroupsUrl,
  exploreThemeDraftProblem,
  exploreThemeInputFromDraft,
  exploreThemePaths,
  exploreThemeUnsplashUrl,
  cityCatalogPath,
  formatExploreThemeDates,
  mergeCarouselGroupEvents,
  newExploreThemeDraft,
  overlappingExploreThemes,
  mergePickedEvents,
} from './pivotExploreThemesAdmin';
import './PivotTenantExploreThemesPage.scss';

const NO_FETCH_CACHE = { enabled: false };
const JSON_HEADERS = { 'Content-Type': 'application/json' };
/** Featured events the phone preview shows before the shelf runs off-screen. */
const PREVIEW_POSTERS = 3;
/** Posters fanned on a carousel group's card. */
const GROUP_POSTERS = 4;

const EVENT_STATE_LABELS = Object.freeze({
  ended: 'Ended',
  unpublished: 'Not published',
  missing: 'Deleted',
});

function requestMessage(result, fallback) {
  return result?.data?.message || result?.error || fallback;
}

function EventThumb({ event }) {
  return event.coverImageUrl ? (
    <img className="explore-themes-event__thumb" src={event.coverImageUrl} alt="" loading="lazy" />
  ) : (
    <span className="explore-themes-event__thumb explore-themes-event__thumb--empty" aria-hidden="true" />
  );
}

function EventSummary({ event }) {
  const when = formatClipEventDate(event.startTime);
  return (
    <div className="explore-themes-event__copy">
      <span className="explore-themes-event__name">
        {event.state === 'missing' ? 'Deleted event' : event.name || 'Untitled event'}
      </span>
      <span className="explore-themes__muted">
        {[event.hostName, when].filter(Boolean).join(' · ')}
      </span>
    </div>
  );
}

/** How the theme reads on the discover page: photo, headline, featured shelf. */
function ThemePhonePreview({ draft, cityDisplayName }) {
  const city = String(cityDisplayName || '').split(',')[0].trim().toLowerCase();
  const posters = draft.events.filter((event) => event.state !== 'missing').slice(0, PREVIEW_POSTERS);
  const photo = draft.backgroundImageUrl;
  return (
    <figure className="explore-themes-preview" aria-label="Preview of the discover page">
      <div
        className={[
          'explore-themes-preview__screen',
          photo ? 'has-photo' : '',
          photo && draft.darkVignette ? 'has-vignette' : '',
          photo && draft.filmGrain ? 'has-grain' : '',
        ].filter(Boolean).join(' ')}
        style={photo ? { backgroundImage: `url(${photo})` } : undefined}
      >
        <div className="explore-themes-preview__scrim" />
        <div className="explore-themes-preview__vignette" />
        <div className="explore-themes-preview__grain" />
        <div className="explore-themes-preview__content">
          <span className="explore-themes-preview__title">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
            </svg>
            {city || 'city'}
          </span>
          <p className="explore-themes-preview__headline">
            {draft.tagline.trim() || <span className="explore-themes-preview__fallback">the usual headline</span>}
          </p>
          <span className="explore-themes-preview__shelf">
            {draft.name.trim().toLowerCase() || 'theme name'}
          </span>
          <div className="explore-themes-preview__posters">
            {posters.length ? (
              posters.map((event) => (
                <span
                  key={event.id}
                  className="explore-themes-preview__poster"
                  style={event.coverImageUrl ? { backgroundImage: `url(${event.coverImageUrl})` } : undefined}
                />
              ))
            ) : (
              <span className="explore-themes-preview__empty">
                No featured events: the usual picks show here.
              </span>
            )}
          </div>
        </div>
        <div className="explore-themes-preview__sheet" />
      </div>
      <figcaption className="explore-themes__muted">
        {photo ? 'Type turns cream over the photo.' : 'No photo: the hero keeps its orange.'}
      </figcaption>
    </figure>
  );
}

/** Unsplash's required attribution: the photographer and Unsplash, both linked. */
function PhotoCredit({ credit }) {
  if (credit?.provider !== 'unsplash') return null;
  return (
    <span className="explore-themes__muted explore-themes-credit">
      Photo by{' '}
      <a href={credit.photographerUrl} target="_blank" rel="noreferrer">{credit.photographer}</a>
      {' '}on{' '}
      <a href={credit.sourceUrl} target="_blank" rel="noreferrer">Unsplash</a>
    </span>
  );
}

function UnsplashSearch({ tenantKey, disabled, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ term: null, photos: [], page: 0, hasMore: false });
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(null);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(
    async (term, page = 1) => {
      const id = requestId.current + 1;
      requestId.current = id;
      setLoading(true);
      setError('');
      const result = await authenticatedRequest(exploreThemeUnsplashUrl(tenantKey, { query: term, page }));
      // A newer search has started; this one's photos are stale.
      if (requestId.current !== id) return;
      setLoading(false);
      if (!result.data?.success) {
        setError(requestMessage(result, 'Could not search Unsplash.'));
        return;
      }
      const data = result.data.data;
      setResults((prev) => ({
        term,
        photos: page > 1 ? [...prev.photos, ...data.photos] : data.photos,
        page: data.page,
        hasMore: data.hasMore,
      }));
    },
    [tenantKey],
  );

  useEffect(() => {
    load('');
  }, [load]);

  const pick = useCallback(
    async (photo) => {
      setPicking(photo.photoId);
      setError('');
      const result = await authenticatedRequest(exploreThemePaths(tenantKey).unsplashSelect, {
        method: 'POST',
        data: { photoId: photo.photoId },
        headers: JSON_HEADERS,
      });
      setPicking(null);
      if (!result.data?.success) {
        setError(requestMessage(result, 'Could not use that photo.'));
        return;
      }
      onPick(result.data.data);
    },
    [onPick, tenantKey],
  );

  return (
    <div className="explore-themes-unsplash">
      <form
        className="explore-themes-unsplash__search"
        onSubmit={(event) => {
          event.preventDefault();
          load(query.trim());
        }}
      >
        <input
          type="search"
          value={query}
          maxLength={200}
          placeholder="Try pumpkins, autumn leaves, fireworks…"
          aria-label="Search Unsplash"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="linear-btn linear-btn--secondary linear-btn--sm" disabled={loading}>
          Search
        </button>
        <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" onClick={onClose}>
          Close
        </button>
      </form>
      {error ? <p className="explore-themes__error" role="alert">{error}</p> : null}
      {results.photos.length ? (
        <ul className="explore-themes-unsplash__grid">
          {results.photos.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                className={`explore-themes-unsplash__photo${photo.height > photo.width ? ' is-portrait' : ''}`}
                disabled={disabled || Boolean(picking)}
                aria-label={`Use ${photo.alt} by ${photo.photographer}`}
                onClick={() => pick(photo)}
              >
                <img src={photo.thumbnail} alt="" loading="lazy" />
                <span>{picking === photo.photoId ? 'Using…' : photo.photographer}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {loading ? <p className="explore-themes__muted" role="status">Loading photos…</p> : null}
      {!loading && results.term !== null && !results.photos.length && !error ? (
        <p className="explore-themes__muted">No photos match. Try a broader word.</p>
      ) : null}
      {results.hasMore && !loading ? (
        <button
          type="button"
          className="linear-btn linear-btn--ghost linear-btn--sm"
          onClick={() => load(results.term, results.page + 1)}
        >
          More photos
        </button>
      ) : null}
      <span className="explore-themes__muted">
        Portrait photos fill the screen best. The photographer is credited in the app.
      </span>
    </div>
  );
}

function ThemePhotoField({ tenantKey, value, credit, onChange }) {
  const { addNotification } = useNotification();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const pickUnsplash = useCallback(
    ({ url, credit: photoCredit }) => {
      onChange({ url, credit: photoCredit });
      setSearching(false);
    },
    [onChange],
  );

  const upload = useCallback(
    async (file) => {
      if (!file) return;
      setUploading(true);
      const form = new FormData();
      form.append('image', file);
      const result = await authenticatedRequest(exploreThemePaths(tenantKey).image, {
        method: 'POST',
        data: form,
      });
      setUploading(false);
      if (!result.data?.success) {
        addNotification({
          title: 'Photo not uploaded',
          message: requestMessage(result, 'The upload failed.'),
          type: 'error',
        });
        return;
      }
      onChange({ url: result.data.data.url, credit: null });
    },
    [addNotification, onChange, tenantKey],
  );

  return (
    <div className="explore-themes-field">
      <span className="explore-themes-field__label">Background photo</span>
      <div className="explore-themes-photo">
        {value ? (
          <img className="explore-themes-photo__thumb" src={value} alt="Theme background" />
        ) : (
          <span className="explore-themes-photo__thumb explore-themes-photo__thumb--empty" aria-hidden="true" />
        )}
        <div className="explore-themes-photo__actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              upload(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className="linear-btn linear-btn--secondary linear-btn--sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : value ? 'Upload another' : 'Upload photo'}
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--secondary linear-btn--sm"
            disabled={uploading}
            aria-expanded={searching}
            onClick={() => setSearching((open) => !open)}
          >
            Search Unsplash
          </button>
          {value ? (
            <button
              type="button"
              className="linear-btn linear-btn--ghost linear-btn--sm"
              disabled={uploading}
              onClick={() => onChange({ url: '', credit: null })}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {value ? <PhotoCredit credit={credit} /> : null}
      {searching ? (
        <UnsplashSearch
          tenantKey={tenantKey}
          disabled={uploading}
          onPick={pickUnsplash}
          onClose={() => setSearching(false)}
        />
      ) : null}
      <span className="explore-themes__muted">
        Portrait, at least 1290 px wide. The top half sits behind the title and headline, so keep
        faces and words out of it. JPEG, PNG or WebP up to 12 MB.
      </span>
    </div>
  );
}

function CarouselGroupCard({ group, featured, onAdd, onReplace }) {
  const showable = group.events.filter((event) => event.state === 'live');
  const fresh = showable.filter((event) => !featured.has(event.id)).length;
  const gone = group.events.length - showable.length;
  const updated = group.updatedAt ? formatClipEventDate(group.updatedAt).split(',').slice(0, 2).join(',') : '';
  return (
    <li className="explore-themes-group">
      <span className="explore-themes-group__posters" aria-hidden="true">
        {group.events.slice(0, GROUP_POSTERS).map((event) => (
          event.coverImageUrl
            ? <img key={event.id} src={event.coverImageUrl} alt="" loading="lazy" />
            : <span key={event.id} className="explore-themes-group__blank" />
        ))}
      </span>
      <div className="explore-themes-group__copy">
        <span className="explore-themes-group__label">{group.label}</span>
        <span className="explore-themes__muted">
          {[group.detail, updated && `updated ${updated}`].filter(Boolean).join(' · ')}
        </span>
        <span className="explore-themes__muted">
          {showable.length} upcoming here
          {gone ? ` · ${gone} ended or unpublished` : ''}
        </span>
      </div>
      <div className="explore-themes-group__actions">
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          disabled={!fresh}
          onClick={() => onAdd(group)}
        >
          {fresh || !showable.length ? 'Add' : 'All added'}
        </button>
        <button
          type="button"
          className="linear-btn linear-btn--ghost linear-btn--sm"
          disabled={!showable.length}
          onClick={() => onReplace(group)}
        >
          Use instead
        </button>
      </div>
    </li>
  );
}

function CarouselGroupList({ tenantKey, source, featured, onAdd, onReplace }) {
  const { data: response, loading, error, refetch } = useFetch(
    exploreThemeCarouselGroupsUrl(tenantKey, source),
    { cache: NO_FETCH_CACHE },
  );
  const data = response?.success ? response.data : null;
  const loadError = error || (response && !response.success ? response.message : null);
  if (!data && loading) {
    return (
      <p className="explore-themes__muted" role="status">
        {source === 'suggested' ? 'Finding suggested groups… this takes a few seconds.' : 'Loading recent carousels…'}
      </p>
    );
  }
  if (loadError) {
    return (
      <p className="explore-themes__error" role="alert">
        {loadError}{' '}
        <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" onClick={refetch}>Retry</button>
      </p>
    );
  }
  if (!data) return null;
  return (
    <>
      {data.notice ? <PivotOpsBanner tone="muted">{data.notice}</PivotOpsBanner> : null}
      {data.groups.length ? (
        <ul className="explore-themes-groups">
          {data.groups.map((group) => (
            <CarouselGroupCard key={group.id} group={group} featured={featured} onAdd={onAdd} onReplace={onReplace} />
          ))}
        </ul>
      ) : !data.notice ? (
        <p className="explore-themes__muted">
          {source === 'suggested'
            ? 'No suggested groups have enough events in this city.'
            : 'No carousels from the last four months include this city.'}
        </p>
      ) : null}
    </>
  );
}

/** Starts the featured list from a carousel: recent ones, or suggestions. */
function CarouselGroupPicker({ tenantKey, events, max, onChange }) {
  const { addNotification } = useNotification();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('recent');
  // Each tab loads the first time it's shown and stays loaded after.
  const [opened, setOpened] = useState(() => new Set(['recent']));
  const featured = useMemo(() => new Set(events.map((event) => event.id)), [events]);

  const showSource = useCallback((next) => {
    setSource(next);
    setOpened((prev) => (prev.has(next) ? prev : new Set([...prev, next])));
  }, []);

  const take = useCallback(
    (group, replace) => {
      const result = mergeCarouselGroupEvents(events, group.events, max, { replace });
      onChange(result.events);
      const overflow = result.overflow ? ` ${result.overflow} more didn’t fit under the ${max}-event cap.` : '';
      addNotification({
        title: replace ? `Featuring “${group.label}”` : `Added from “${group.label}”`,
        message: `${result.added} ${result.added === 1 ? 'event' : 'events'} in the featured list.${overflow}`,
        type: result.added ? 'success' : 'info',
      });
    },
    [addNotification, events, max, onChange],
  );
  const add = useCallback((group) => take(group, false), [take]);
  const replace = useCallback(
    (group) => {
      // eslint-disable-next-line no-alert
      if (events.length && !window.confirm(`Replace the ${events.length} featured events with “${group.label}”?`)) return;
      take(group, true);
    },
    [events.length, take],
  );

  return (
    <div className="explore-themes-carousels">
      <button
        type="button"
        className="linear-btn linear-btn--ghost linear-btn--sm explore-themes-carousels__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide carousel groups' : 'Start from a carousel'}
      </button>
      {open ? (
        <div className="explore-themes-carousels__body">
          <PivotTenantViewTabs
            views={EXPLORE_THEME_GROUP_SOURCES}
            value={source}
            onChange={showSource}
            ariaLabel="Carousel groups"
          />
          {EXPLORE_THEME_GROUP_SOURCES.filter((option) => opened.has(option.id)).map((option) => (
            <div key={option.id} hidden={option.id !== source}>
              <CarouselGroupList
                tenantKey={tenantKey}
                source={option.id}
                featured={featured}
                onAdd={add}
                onReplace={replace}
              />
            </div>
          ))}
          <span className="explore-themes__muted">
            Only this city’s upcoming events come across; you can still reorder or remove them.
          </span>
        </div>
      ) : null}
    </div>
  );
}

const NO_OP = () => {};
const NO_TAGS = [];
const NO_EVENTS = [];
const NO_PERFORMANCE = new Map();

/** The week a theme starts in, or this week if it already has. */
function pickerStartWeek(startsOn) {
  const today = toIsoWeek();
  const start = batchWeekFromEventDate(startsOn ? `${startsOn}T12:00:00Z` : null);
  return start && start > today ? start : today;
}

/**
 * The Events page's catalog, opened to pick a theme's featured events: the
 * same week switcher, filters, search, keyboard and drag selection, and
 * detail view, without the status, feature, weight, tag or edit controls.
 * It opens on Featured; picks from other weeks and filters stay picked.
 */
function ThemeEventPicker({ tenantKey, startsOn, events, max, onDone, onClose }) {
  const city = String(tenantKey || '').trim().toLowerCase();
  const [batchWeek, setBatchWeek] = useState(() => pickerStartWeek(startsOn));
  const [filter, setFilter] = useState('featured');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [picked, setPicked] = useState(events);
  const params = useMemo(() => ({ batchWeek, include: 'catalog' }), [batchWeek]);
  const { data: response, loading, error } = useFetch(cityCatalogPath(city), { params, cache: NO_FETCH_CACHE });
  const catalog = response?.success ? response.data?.catalog : null;
  const catalogEvents = useMemo(
    () => (catalog && !catalog.error && catalog.events ? catalog.events : NO_EVENTS),
    [catalog],
  );
  const { brokenIds, scanning } = useBrokenCatalogImages(catalogEvents);

  const shown = useMemo(() => {
    const hostCreatedOnly = sourceFilter === HOST_CREATED_SOURCE;
    return catalogEvents
      .filter((event) => (
        eventMatchesFilter(event, filter, { brokenImageIds: brokenIds })
        && eventMatchesSourceFilter(event, sourceFilter)
      ))
      .slice()
      .sort((a, b) => compareCurationEvents(a, b, { hostCreatedOnly }));
  }, [brokenIds, catalogEvents, filter, sourceFilter]);
  const hostCreatedCount = useMemo(
    () => catalogEvents.filter((event) => isHostCreatedEvent(event)).length,
    [catalogEvents],
  );

  const selectedIds = useMemo(() => new Set(picked.map((event) => event.id)), [picked]);
  const handleSelectedIds = useCallback(
    (next) => setPicked((current) => mergePickedEvents(current, new Set([...next].map(String)), catalogEvents)),
    [catalogEvents],
  );
  const over = picked.length > max;

  return (
    <PivotCarouselPopup open onClose={onClose} className="explore-themes-picker">
      <div className="explore-themes-picker__body">
        <div className="explore-themes-picker__head">
          <div>
            <h2 className="explore-themes-picker__title">Featured events</h2>
            <span className={over ? 'explore-themes__error' : 'explore-themes__muted'}>
              {picked.length} of {max} picked{over ? `. Drop ${picked.length - max} to use them.` : ''}
            </span>
          </div>
          <PivotBatchWeekPicker batchWeek={batchWeek} onChange={setBatchWeek} showLabel={false} />
          <div className="explore-themes-picker__actions">
            <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--primary linear-btn--sm"
              disabled={over}
              onClick={() => onDone(picked)}
            >
              Use {picked.length} {picked.length === 1 ? 'event' : 'events'}
            </button>
          </div>
        </div>
        <PivotCurationQueue
          mode="pick"
          title={`Catalog · ${batchWeek}`}
          description="Click events to pick or drop them; picks from other weeks and filters stay. Press Enter for a closer look."
          tenantKey={city}
          batchWeek={batchWeek}
          events={shown}
          eventsLoading={loading && !catalog}
          eventsError={error || catalog?.error || null}
          selectedIds={selectedIds}
          onSelectedIdsChange={handleSelectedIds}
          filter={filter}
          onFilterChange={setFilter}
          filterOptions={FILTER_OPTIONS}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          hostCreatedCount={hostCreatedCount}
          brokenImageIds={brokenIds}
          scanningBrokenImages={scanning}
          catalogTags={NO_TAGS}
          bulkTags={NO_TAGS}
          onBulkTagsChange={NO_OP}
          showPerformance={false}
          performanceById={NO_PERFORMANCE}
          busyKey={null}
          emptyLabel={filter === 'featured' ? 'No featured events this week. Try All.' : undefined}
        />
        {picked.length ? (
          <div className="explore-themes-picker__picked">
            <span className="explore-themes-field__label">Picked, in shelf order</span>
            <ol className="explore-themes-events">
              {picked.map((event, index) => (
                <li key={event.id} className="explore-themes-event">
                  <span className="explore-themes-event__index">{index + 1}</span>
                  <EventThumb event={event} />
                  <EventSummary event={event} />
                  <div className="explore-themes-event__actions">
                    <button
                      type="button"
                      className="linear-btn linear-btn--ghost linear-btn--sm"
                      aria-label={`Move ${event.name || 'event'} up`}
                      disabled={index === 0}
                      onClick={() => setPicked(moveClipPin(picked, index, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="linear-btn linear-btn--ghost linear-btn--sm"
                      aria-label={`Move ${event.name || 'event'} down`}
                      disabled={index === picked.length - 1}
                      onClick={() => setPicked(moveClipPin(picked, index, 1))}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="linear-btn linear-btn--ghost linear-btn--sm"
                      aria-label={`Remove ${event.name || 'event'}`}
                      onClick={() => setPicked(removeClipPin(picked, event.id))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </PivotCarouselPopup>
  );
}

function FeaturedEvents({ tenantKey, startsOn, events, max, onChange }) {
  const [browsing, setBrowsing] = useState(false);

  return (
    <div className="explore-themes-field">
      <span className="explore-themes-field__label">
        Featured events
        <span className="explore-themes__muted"> · {events.length} of {max}</span>
      </span>
      {events.length ? (
        <ol className="explore-themes-events">
          {events.map((event, index) => {
            const stateLabel = EVENT_STATE_LABELS[event.state] || null;
            return (
              <li key={event.id} className={`explore-themes-event${stateLabel ? ' is-skipped' : ''}`}>
                <span className="explore-themes-event__index">{index + 1}</span>
                <EventThumb event={event} />
                <EventSummary event={event} />
                {stateLabel ? <PivotOpsStatus tone="warn">{stateLabel}</PivotOpsStatus> : null}
                <div className="explore-themes-event__actions">
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost linear-btn--sm"
                    aria-label={`Move ${event.name || 'event'} up`}
                    disabled={index === 0}
                    onClick={() => onChange(moveClipPin(events, index, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost linear-btn--sm"
                    aria-label={`Move ${event.name || 'event'} down`}
                    disabled={index === events.length - 1}
                    onClick={() => onChange(moveClipPin(events, index, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost linear-btn--sm"
                    aria-label={`Remove ${event.name || 'event'}`}
                    onClick={() => onChange(removeClipPin(events, event.id))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="explore-themes__muted">
          None yet. Without any, the hero keeps its usual featured picks.
        </p>
      )}
      <span className="explore-themes__muted">
        Ended, unpublished, or passed events drop out of the shelf on their own.
      </span>

      <div className="explore-themes-featured__actions">
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          onClick={() => setBrowsing(true)}
        >
          Browse events
        </button>
      </div>
      {browsing ? (
        <ThemeEventPicker
          tenantKey={tenantKey}
          startsOn={startsOn}
          events={events}
          max={max}
          onClose={() => setBrowsing(false)}
          onDone={(next) => {
            onChange(next);
            setBrowsing(false);
          }}
        />
      ) : null}

      <CarouselGroupPicker tenantKey={tenantKey} events={events} max={max} onChange={onChange} />
    </div>
  );
}

function ThemeEditor({ tenantKey, cityDisplayName, timezone, limits, themes, editing, onCancel, onSaved }) {
  const { addNotification } = useNotification();
  const [draft, setDraft] = useState(editing.draft);
  const [saving, setSaving] = useState(false);
  const dirty = exploreThemeDraftKey(draft) !== editing.baselineKey;
  const problem = exploreThemeDraftProblem(draft, limits);
  const overlaps = overlappingExploreThemes(draft, themes);
  const patch = useCallback((changes) => setDraft((prev) => ({ ...prev, ...changes })), []);
  const setPhoto = useCallback(
    ({ url, credit }) => patch({ backgroundImageUrl: url, backgroundCredit: credit }),
    [patch],
  );
  const setEvents = useCallback((events) => patch({ events }), [patch]);

  const save = useCallback(async () => {
    setSaving(true);
    const paths = exploreThemePaths(tenantKey);
    const result = await authenticatedRequest(draft.id ? paths.theme(draft.id) : paths.list, {
      method: draft.id ? 'PATCH' : 'POST',
      data: exploreThemeInputFromDraft(draft),
      headers: JSON_HEADERS,
    });
    setSaving(false);
    if (!result.data?.success) {
      addNotification({
        title: 'Theme not saved',
        message: requestMessage(result, 'Unable to save the theme.'),
        type: 'error',
      });
      return;
    }
    const saved = result.data.data.theme;
    addNotification({
      title: 'Theme saved',
      message: saved.published
        ? `Live in the app ${formatExploreThemeDates(saved.startsOn, saved.endsOn)}.`
        : 'Saved as a draft. Publish it to put it in the app.',
      type: 'success',
    });
    onSaved(saved);
  }, [addNotification, draft, onSaved, tenantKey]);

  return (
    <PivotOpsSection
      title={draft.id ? `Edit ${editing.name || 'theme'}` : 'New theme'}
      titleId="explore-themes-editor-title"
      description="Everything here only changes the discover page’s hero, and only during the theme’s dates."
      actions={(
        <>
          <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" onClick={onCancel} disabled={saving}>
            {dirty ? 'Discard' : 'Back'}
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--primary linear-btn--sm"
            disabled={!dirty || saving || Boolean(problem)}
            title={problem || undefined}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save theme'}
          </button>
        </>
      )}
    >
      <div className="explore-themes-editor">
        <div className="explore-themes-editor__form">
          <label className="explore-themes-field">
            <span className="explore-themes-field__label">Name</span>
            <input
              type="text"
              value={draft.name}
              maxLength={limits.nameMax}
              placeholder="halloween"
              onChange={(event) => patch({ name: event.target.value })}
            />
            <span className="explore-themes__muted">Titles the featured shelf in the app.</span>
          </label>

          <label className="explore-themes-field">
            <span className="explore-themes-field__label">
              Tagline
              <span className="explore-themes__muted"> · {draft.tagline.trim().length}/{limits.taglineMax}</span>
            </span>
            <textarea
              rows={2}
              value={draft.tagline}
              maxLength={limits.taglineMax}
              placeholder="spooky season is here"
              onChange={(event) => patch({ tagline: event.target.value })}
            />
            <span className="explore-themes__muted">
              The big line at the top of Explore. Leave it empty to keep the usual one.
            </span>
          </label>

          <div className="explore-themes-field">
            <span className="explore-themes-field__label">Dates</span>
            <div className="explore-themes-dates">
              <label>
                <span className="explore-themes__muted">First day</span>
                <input type="date" value={draft.startsOn} onChange={(event) => patch({ startsOn: event.target.value })} />
              </label>
              <label>
                <span className="explore-themes__muted">Last day</span>
                <input
                  type="date"
                  value={draft.endsOn}
                  min={draft.startsOn || undefined}
                  onChange={(event) => patch({ endsOn: event.target.value })}
                />
              </label>
            </div>
            <span className="explore-themes__muted">
              Whole days in {timezone}: it starts at midnight and ends at midnight after the last day.
            </span>
          </div>

          <ThemePhotoField
            tenantKey={tenantKey}
            value={draft.backgroundImageUrl}
            credit={draft.backgroundCredit}
            onChange={setPhoto}
          />

          <fieldset className="explore-themes-field explore-themes-looks" disabled={!draft.backgroundImageUrl}>
            <legend className="explore-themes-field__label">Photo look</legend>
            <label className="explore-themes__check">
              <input
                type="checkbox"
                checked={draft.darkVignette}
                onChange={(event) => patch({ darkVignette: event.target.checked })}
              />
              Dark vignette: darkens the edges and the strip behind the featured events, so they read on a bright photo
            </label>
            <label className="explore-themes__check">
              <input
                type="checkbox"
                checked={draft.filmGrain}
                onChange={(event) => patch({ filmGrain: event.target.checked })}
              />
              Film grain: the app’s photo texture over the background
            </label>
            {!draft.backgroundImageUrl ? (
              <span className="explore-themes__muted">Add a photo to choose its look.</span>
            ) : null}
          </fieldset>

          <FeaturedEvents
            tenantKey={tenantKey}
            startsOn={draft.startsOn}
            events={draft.events}
            max={limits.featuredMax}
            onChange={setEvents}
          />

          <label className="explore-themes__check">
            <input type="checkbox" checked={draft.published} onChange={(event) => patch({ published: event.target.checked })} />
            Published: show it in the app during its dates
          </label>

          {draft.published && overlaps.length ? (
            <PivotOpsBanner tone="warn" title="Overlaps another published theme">
              {overlaps.map((theme) => `${theme.name} (${formatExploreThemeDates(theme.startsOn, theme.endsOn)})`).join(', ')}.
              While both are on, the app shows whichever starts later.
            </PivotOpsBanner>
          ) : null}
          {problem && dirty ? <p className="explore-themes__error">{problem}</p> : null}
        </div>

        <ThemePhonePreview draft={draft} cityDisplayName={cityDisplayName} />
      </div>
    </PivotOpsSection>
  );
}

function ThemeRow({ theme, busy, onEdit, onTogglePublished, onDelete }) {
  const status = EXPLORE_THEME_STATUS[theme.status] || EXPLORE_THEME_STATUS.draft;
  const unplayable = theme.events.filter((event) => event.state && event.state !== 'live').length;
  return (
    <li className="explore-themes-row">
      {theme.backgroundImageUrl ? (
        <img className="explore-themes-row__thumb" src={theme.backgroundImageUrl} alt="" loading="lazy" />
      ) : (
        <span className="explore-themes-row__thumb explore-themes-row__thumb--plain" aria-hidden="true" />
      )}
      <div className="explore-themes-row__copy">
        <span className="explore-themes-row__name">
          {theme.name}
          <PivotOpsStatus tone={status.tone}>{status.label}</PivotOpsStatus>
        </span>
        <span className="explore-themes__muted">
          {formatExploreThemeDates(theme.startsOn, theme.endsOn)}
          {' · '}
          {theme.events.length} featured
          {unplayable ? ` (${unplayable} won’t show)` : ''}
        </span>
        {theme.tagline ? <span className="explore-themes-row__tagline">{theme.tagline}</span> : null}
      </div>
      <div className="explore-themes-row__actions">
        <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" disabled={busy} onClick={onEdit}>
          Edit
        </button>
        {theme.status !== 'ended' ? (
          <button type="button" className="linear-btn linear-btn--secondary linear-btn--sm" disabled={busy} onClick={onTogglePublished}>
            {theme.published ? 'Unpublish' : 'Publish'}
          </button>
        ) : null}
        <button type="button" className="linear-btn linear-btn--ghost linear-btn--sm" disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}

/**
 * Content → Explore themes: holiday and festival takeovers of the app's
 * discover page — its headline, featured events, and background photo — for
 * a run of dates.
 */
function PivotTenantExploreThemesPage({ tenantKey, cityDisplayName, title = 'Content', nav = null }) {
  const { addNotification } = useNotification();
  const paths = useMemo(() => exploreThemePaths(tenantKey), [tenantKey]);
  const { data: response, loading, error, refetch } = useFetch(paths.list, { cache: NO_FETCH_CACHE });
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const data = response?.success ? response.data : null;
  const themes = data?.themes || [];
  const limits = data?.limits || { nameMax: 40, taglineMax: 90, featuredMax: 12, spanMaxDays: 92 };
  const loadError = error || (response && !response.success ? response.message : null);

  const startEditing = useCallback((theme) => {
    const draft = theme ? exploreThemeDraftFromTheme(theme) : newExploreThemeDraft();
    // A brand-new draft counts as changed once a name is typed.
    setEditing({ draft, name: theme?.name, baselineKey: exploreThemeDraftKey(draft) });
  }, []);

  const handleSaved = useCallback(() => {
    setEditing(null);
    refetch();
  }, [refetch]);

  const mutate = useCallback(
    async (theme, request, successTitle) => {
      setBusyId(theme.id);
      const result = await authenticatedRequest(paths.theme(theme.id), request);
      setBusyId(null);
      if (!result.data?.success) {
        addNotification({ title: 'Theme not updated', message: requestMessage(result, 'Try again.'), type: 'error' });
        return;
      }
      addNotification({ title: successTitle, message: theme.name, type: 'success' });
      refetch();
    },
    [addNotification, paths, refetch],
  );

  const togglePublished = useCallback(
    (theme) => mutate(
      theme,
      { method: 'PATCH', data: { published: !theme.published }, headers: JSON_HEADERS },
      theme.published ? 'Theme unpublished' : 'Theme published',
    ),
    [mutate],
  );

  const deleteTheme = useCallback(
    (theme) => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Delete “${theme.name}”? This can’t be undone.`)) return;
      mutate(theme, { method: 'DELETE' }, 'Theme deleted');
    },
    [mutate],
  );

  const live = themes.find((theme) => theme.status === 'live');

  return (
    <PivotTenantPage title={title} tenantKey={tenantKey} cityDisplayName={cityDisplayName} className="pivot-tenant-explore-themes">
      {nav}
      {loadError ? <p className="explore-themes__error">{loadError}</p> : null}
      {!data && loading ? <p className="explore-themes__muted">Loading explore themes…</p> : null}
      {data && editing ? (
        <ThemeEditor
          tenantKey={tenantKey}
          cityDisplayName={data.cityDisplayName || cityDisplayName}
          timezone={data.timezone}
          limits={limits}
          themes={themes}
          editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={handleSaved}
        />
      ) : null}
      {data && !editing ? (
        <PivotOpsSection
          title="Explore themes"
          titleId="explore-themes-list-title"
          description="Take over the discover page for a holiday or festival: a tagline, featured events, and a background photo, for the dates you pick."
          actions={(
            <button type="button" className="linear-btn linear-btn--primary linear-btn--sm" onClick={() => startEditing(null)}>
              New theme
            </button>
          )}
        >
          {live ? (
            <PivotOpsBanner tone="info" title={`${live.name} is live`}>
              Through {formatExploreThemeDates(live.endsOn, live.endsOn)}, {data.timezone} time.
            </PivotOpsBanner>
          ) : null}
          {themes.length ? (
            <ul className="explore-themes-list">
              {themes.map((theme) => (
                <ThemeRow
                  key={theme.id}
                  theme={theme}
                  busy={busyId === theme.id}
                  onEdit={() => startEditing(theme)}
                  onTogglePublished={() => togglePublished(theme)}
                  onDelete={() => deleteTheme(theme)}
                />
              ))}
            </ul>
          ) : (
            <p className="explore-themes__muted">No themes yet. Explore shows its usual hero.</p>
          )}
        </PivotOpsSection>
      ) : null}
    </PivotTenantPage>
  );
}

export default PivotTenantExploreThemesPage;
