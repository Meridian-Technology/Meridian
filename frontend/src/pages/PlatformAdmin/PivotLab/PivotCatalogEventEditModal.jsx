import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Popup from '../../../components/Popup/Popup';
import PivotTagMultiSelect from './PivotTagMultiSelect';
import { PivotDeckPhonePreview } from './PivotDeckCardPreview';
import { formatPivotDeckWhen } from '../../../utils/pivotIsoWeek';
import {
  toDatetimeLocalValue,
  datetimeLocalToIso,
  createEmptyManualShowtimeSlot,
  normalizeManualShowtimeSlots,
  deriveEventWindowFromShowtimes,
  applyMovieMetadataToDraft,
} from './PivotManualImportModal';
import PivotTmdbLookup from './PivotTmdbLookup';
import './PivotManualImportModal.scss';
import './PivotCatalogEventEditModal.scss';

const EMPTY_ENRICHMENT_DRAFT = Object.freeze({
  vibeText: '',
  priceBand: '',
  neighborhood: '',
  audience: '',
});

export function enrichmentToDraft(enrichment) {
  if (!enrichment) {
    return { ...EMPTY_ENRICHMENT_DRAFT };
  }

  return {
    vibeText: Array.isArray(enrichment.vibe) ? enrichment.vibe.join(', ') : '',
    priceBand: enrichment.priceBand || '',
    neighborhood: enrichment.neighborhood || '',
    audience: enrichment.audience || '',
  };
}

export function draftEnrichmentToPayload(draftEnrichment) {
  if (!draftEnrichment) {
    return {};
  }

  return {
    vibe: draftEnrichment.vibeText,
    priceBand: draftEnrichment.priceBand || undefined,
    neighborhood: draftEnrichment.neighborhood,
    audience: draftEnrichment.audience,
  };
}

export function hasEnrichmentDraftContent(draftEnrichment) {
  if (!draftEnrichment) {
    return false;
  }

  return Boolean(
    draftEnrichment.vibeText?.trim() ||
      draftEnrichment.priceBand ||
      draftEnrichment.neighborhood?.trim() ||
      draftEnrichment.audience?.trim(),
  );
}

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return toDatetimeLocalValue(parsed);
}

function catalogTimeSlotsToDraftSlots(timeSlots) {
  if (!Array.isArray(timeSlots) || !timeSlots.length) {
    return [];
  }

  return timeSlots.map((slot, index) => ({
    key: slot.id || `slot-${index}`,
    label: slot.label || '',
    startTimeLocal: isoToDatetimeLocal(slot.start_time),
    endTimeLocal: isoToDatetimeLocal(slot.end_time),
  }));
}

export function catalogEventToEditDraft(event) {
  if (!event) return null;

  const timeSlots = catalogTimeSlotsToDraftSlots(event.timeSlots);
  const hasShowtimes = timeSlots.length > 0;

  return {
    name: event.name || '',
    organizerName: event.organizerName || '',
    location: event.location || '',
    description: event.description || '',
    imageUrl: event.image || '',
    sourceUrl: event.sourceUrl || event.externalLink || '',
    scheduleMode: hasShowtimes ? 'showtimes' : 'single',
    startTimeLocal: isoToDatetimeLocal(event.start_time),
    endTimeLocal: isoToDatetimeLocal(event.end_time),
    timeSlots: hasShowtimes ? timeSlots : [],
    ingestStatus: event.ingestStatus || 'staged',
    featured: event.featured === true,
    clipDrop: event.clipDrop === true,
    tags: Array.isArray(event.tags) ? [...event.tags] : [],
    movie: event.movie || null,
    enrichment: enrichmentToDraft(event.enrichment),
  };
}

export function catalogEditDraftToOverrides(draft) {
  const useShowtimes = draft.scheduleMode === 'showtimes';
  const normalizedSlots = useShowtimes ? normalizeManualShowtimeSlots(draft.timeSlots) : [];
  const window = useShowtimes
    ? deriveEventWindowFromShowtimes(normalizedSlots)
    : {
        start_time: datetimeLocalToIso(draft.startTimeLocal),
        end_time: datetimeLocalToIso(draft.endTimeLocal),
      };

  return {
    name: draft.name?.trim() || '',
    hostName: draft.organizerName?.trim() || '',
    location: draft.location?.trim() || '',
    description: draft.description?.trim() || '',
    image: draft.imageUrl?.trim() || '',
    sourceUrl: draft.sourceUrl?.trim() || '',
    start_time: window.start_time || undefined,
    end_time: window.end_time || undefined,
    ingestStatus: draft.ingestStatus,
    featured: draft.featured === true,
    clipDrop: draft.clipDrop === true,
    tags: Array.isArray(draft.tags) ? draft.tags : [],
    ...(useShowtimes ? { timeSlots: normalizedSlots } : { timeSlots: [] }),
    ...(draft.movie ? { movie: draft.movie } : {}),
    enrichment: draftEnrichmentToPayload(draft.enrichment),
  };
}

function validateCatalogEditDraft(draft) {
  if (!draft.name?.trim()) return 'Event title is required.';
  if (!draft.organizerName?.trim()) return 'Organizer is required.';
  if (!draft.location?.trim()) return 'Location is required.';
  if (!draft.tags?.length) return 'Select at least one catalog tag.';
  if (draft.scheduleMode === 'showtimes') {
    const slots = normalizeManualShowtimeSlots(draft.timeSlots);
    if (!slots.length) return 'Add at least one showtime with a valid start.';
  } else if (!datetimeLocalToIso(draft.startTimeLocal)) {
    return 'Start time is required.';
  }
  return null;
}

function PivotCatalogEventEditModal({
  open,
  event,
  onClose,
  catalogTags,
  cityLabel,
  batchWeek,
  onSave,
  saving,
  onSuggestTags,
  tagSuggestLoading,
  mode = 'edit',
  title,
  saveLabel,
  savingLabel,
  notices = [],
  lockIngestStatus = false,
  elevated = false,
}) {
  const [draft, setDraft] = useState(null);
  const [formError, setFormError] = useState('');
  const [rememberForCalendar, setRememberForCalendar] = useState(true);
  const [correctionReasons, setCorrectionReasons] = useState({});
  const openedAtRef = useRef(null);
  const isImport = mode === 'import';

  useEffect(() => {
    if (open && event) {
      setDraft(catalogEventToEditDraft(event));
      setFormError('');
      setRememberForCalendar(true);
      setCorrectionReasons({});
      openedAtRef.current = Date.now();
    } else if (!open) {
      setDraft(null);
      setCorrectionReasons({});
      setFormError('');
      openedAtRef.current = null;
    }
  }, [open, event]);

  const patchDraft = useCallback((patch) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setFormError('');
  }, []);

  const deckPreview = useMemo(() => {
    if (!draft) return null;

    const useShowtimes = draft.scheduleMode === 'showtimes';
    const normalizedSlots = useShowtimes ? normalizeManualShowtimeSlots(draft.timeSlots) : [];
    const window = useShowtimes
      ? deriveEventWindowFromShowtimes(normalizedSlots)
      : {
          start_time: datetimeLocalToIso(draft.startTimeLocal),
          end_time: datetimeLocalToIso(draft.endTimeLocal),
        };

    return {
      title: draft.name,
      hostName: draft.organizerName,
      whenLabel: formatPivotDeckWhen(window.start_time, window.end_time),
      locationLabel: draft.location,
      description: draft.description,
      imageUrl: draft.imageUrl?.trim() || undefined,
    };
  }, [draft]);

  const setScheduleMode = useCallback((mode) => {
    setDraft((current) => {
      if (!current || current.scheduleMode === mode) return current;

      if (mode === 'showtimes') {
        const seedStart = current.startTimeLocal || toDatetimeLocalValue(new Date());
        return {
          ...current,
          scheduleMode: 'showtimes',
          timeSlots: current.timeSlots?.length
            ? current.timeSlots
            : [createEmptyManualShowtimeSlot(seedStart)],
        };
      }

      return {
        ...current,
        scheduleMode: 'single',
        timeSlots: [],
      };
    });
    setFormError('');
  }, []);

  const addShowtime = useCallback(() => {
    setDraft((current) => {
      if (!current) return current;
      const last = current.timeSlots?.[current.timeSlots.length - 1];
      const nextStart = last?.startTimeLocal || current.startTimeLocal || '';
      return {
        ...current,
        scheduleMode: 'showtimes',
        timeSlots: [...(current.timeSlots || []), createEmptyManualShowtimeSlot(nextStart)],
      };
    });
    setFormError('');
  }, []);

  const updateShowtime = useCallback((slotKey, patch) => {
    setDraft((current) => ({
      ...current,
      timeSlots: (current.timeSlots || []).map((slot) =>
        slot.key === slotKey ? { ...slot, ...patch } : slot,
      ),
    }));
    setFormError('');
  }, []);

  const removeShowtime = useCallback((slotKey) => {
    setDraft((current) => ({
      ...current,
      timeSlots: (current.timeSlots || []).filter((slot) => slot.key !== slotKey),
    }));
    setFormError('');
  }, []);

  const handleMovieChange = useCallback(
    (movie) => {
      patchDraft(applyMovieMetadataToDraft(movie));
    },
    [patchDraft],
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;

    const error = validateCatalogEditDraft(draft);
    if (error) {
      setFormError(error);
      return;
    }

    const ok = await onSave?.(draft, {
      rememberForCalendar: !isImport && event?.source === 'generic-site' && Boolean(event?.entrypointId) && rememberForCalendar,
      correctionReasons: rememberForCalendar ? correctionReasons : {},
      reviewSeconds: openedAtRef.current ? Math.min(3600, Math.round((Date.now() - openedAtRef.current) / 1000)) : 0,
    });
    if (ok) {
      onClose?.();
    }
  }, [draft, event, isImport, onClose, onSave, rememberForCalendar, correctionReasons]);

  if (!open || !event) {
    return null;
  }

  const canImproveScrape = !isImport && event.source === 'generic-site' && Boolean(event.entrypointId);
  const imageChanged = draft?.imageUrl?.trim() !== (event.image || '').trim();
  const descriptionChanged = draft?.description?.trim() !== (event.description || '').trim();
  const dateChanged = draft?.startTimeLocal !== isoToDatetimeLocal(event.start_time);
  const imageCandidates = [...new Set([event.image, ...(event.scrapeEvidence?.imageCandidates || [])]
    .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url)))].slice(0, 6);

  return (
    <Popup
      isOpen={open}
      onClose={onClose}
      customClassName="pivot-manual-import__shell pivot-catalog-edit__shell"
      overlayClassName={elevated ? 'popup-overlay--elevated' : ''}
      disableOutsideClick={saving || tagSuggestLoading}
    >
      {draft ? (
      <div
        className="pivot-manual-import pivot-catalog-edit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pivot-catalog-edit-title"
      >
        <header className="pivot-manual-import__head">
          <div>
            <h2 id="pivot-catalog-edit-title" className="pivot-manual-import__title">
              {title || (isImport ? 'Review imported event' : 'Edit catalog event')}
            </h2>
            <p className="pivot-manual-import__meta">
              {cityLabel || 'No city'} · {batchWeek}
              {event?.source === 'justgo'
                ? ' · Host-created'
                : event?.source
                  ? ` · ${event.source}`
                  : ''}
            </p>
          </div>
        </header>

        {notices.length ? (
          <ul className="pivot-lab__import-warnings" aria-label="Import warnings">
            {notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        ) : null}

        <div className="pivot-catalog-edit__layout">
          <div className="pivot-manual-import__form pivot-catalog-edit__form">
            {event?.source === 'justgo' ? (
              <section
                className="pivot-manual-import__section pivot-catalog-edit__host-created"
                aria-label="Host-created provenance"
              >
                <div className="pivot-catalog-edit__host-created-head">
                  <h3 className="pivot-manual-import__section-title">Host-created</h3>
                  <span className="pivot-catalog-edit__host-created-badge">Just Go</span>
                </div>
                <dl className="pivot-catalog-edit__host-created-meta">
                  <div>
                    <dt>Creator</dt>
                    <dd>{event.createdByUserId || '—'}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>
                      {event.creatorSubmittedAt
                        ? new Date(event.creatorSubmittedAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Platform managed</dt>
                    <dd>{event.platformManaged === true ? 'true' : 'false'}</dd>
                  </div>
                  <div>
                    <dt>External link</dt>
                    <dd>
                      {event.externalLink || event.sourceUrl ? (
                        <a
                          href={event.externalLink || event.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open listing
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <section className="pivot-manual-import__section" aria-label="Event details">
              <h3 className="pivot-manual-import__section-title">Event</h3>
              <label className="pivot-manual-import__field pivot-manual-import__field--wide">
                <span className="pivot-manual-import__label">Title</span>
                <input
                  className="linear-input pivot-manual-import__input"
                  value={draft.name}
                  onChange={(e) => patchDraft({ name: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <div className="pivot-manual-import__row">
                <label className="pivot-manual-import__field">
                  <span className="pivot-manual-import__label">Organizer</span>
                  <input
                    className="linear-input pivot-manual-import__input"
                    value={draft.organizerName}
                    onChange={(e) => patchDraft({ organizerName: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label className="pivot-manual-import__field">
                  <span className="pivot-manual-import__label">Location</span>
                  <input
                    className="linear-input pivot-manual-import__input"
                    value={draft.location}
                    onChange={(e) => patchDraft({ location: e.target.value })}
                    autoComplete="off"
                  />
                </label>
              </div>
              <label className="pivot-manual-import__field pivot-manual-import__field--wide">
                <span className="pivot-manual-import__label">Description</span>
                <textarea
                  className="linear-input pivot-manual-import__textarea"
                  value={draft.description}
                  onChange={(e) => patchDraft({ description: e.target.value })}
                  rows={2}
                  placeholder="Short deck copy"
                />
              </label>
            </section>

            <section className="pivot-manual-import__section" aria-label="Film metadata">
              <PivotTmdbLookup
                movie={draft.movie}
                onMovieChange={handleMovieChange}
                disabled={saving || tagSuggestLoading}
              />
            </section>

            <section className="pivot-manual-import__section" aria-label="Poster">
              <h3 className="pivot-manual-import__section-title">Poster</h3>
              {canImproveScrape && imageCandidates.length > 1 ? <div className="pivot-catalog-edit__image-choices" role="group" aria-label="Images found for this event">
                {imageCandidates.map((url) => <button type="button" key={url}
                  className={draft.imageUrl === url ? 'is-selected' : ''} aria-label={`Choose image ${url}`}
                  aria-pressed={draft.imageUrl === url} onClick={() => patchDraft({ imageUrl: url })}>
                  <img src={url} alt="" loading="lazy" />
                </button>)}
              </div> : null}
              <label className="pivot-manual-import__field pivot-manual-import__field--wide">
                <span className="pivot-manual-import__label">Image URL</span>
                <input
                  className="linear-input pivot-manual-import__input"
                  value={draft.imageUrl}
                  onChange={(e) => patchDraft({ imageUrl: e.target.value })}
                  placeholder="https://…/poster.jpg"
                  autoComplete="off"
                />
              </label>
            </section>

            <section className="pivot-manual-import__section" aria-label="Schedule">
              <div className="pivot-manual-import__section-head">
                <h3 className="pivot-manual-import__section-title">When</h3>
                <div
                  className="pivot-manual-import__schedule-toggle"
                  role="group"
                  aria-label="Schedule mode"
                >
                  <button
                    type="button"
                    className={`pivot-manual-import__schedule-btn${
                      draft.scheduleMode === 'single'
                        ? ' pivot-manual-import__schedule-btn--active'
                        : ''
                    }`}
                    onClick={() => setScheduleMode('single')}
                  >
                    Single time
                  </button>
                  <button
                    type="button"
                    className={`pivot-manual-import__schedule-btn${
                      draft.scheduleMode === 'showtimes'
                        ? ' pivot-manual-import__schedule-btn--active'
                        : ''
                    }`}
                    onClick={() => setScheduleMode('showtimes')}
                  >
                    Showtimes
                  </button>
                </div>
              </div>

              {draft.scheduleMode === 'single' ? (
                <div className="pivot-manual-import__when">
                  <label className="pivot-manual-import__field pivot-manual-import__field--grow">
                    <span className="pivot-manual-import__label">Start</span>
                    <input
                      className="linear-input pivot-manual-import__input"
                      type="datetime-local"
                      value={draft.startTimeLocal}
                      onChange={(e) => patchDraft({ startTimeLocal: e.target.value })}
                    />
                  </label>
                  <label className="pivot-manual-import__field pivot-manual-import__field--grow">
                    <span className="pivot-manual-import__label">End (optional)</span>
                    <input
                      className="linear-input pivot-manual-import__input"
                      type="datetime-local"
                      value={draft.endTimeLocal}
                      onChange={(e) => patchDraft({ endTimeLocal: e.target.value })}
                    />
                  </label>
                </div>
              ) : (
                <div className="pivot-manual-import__showtimes">
                  {(draft.timeSlots || []).map((slot, index) => (
                    <div key={slot.key} className="pivot-manual-import__showtime-row">
                      <div className="pivot-manual-import__showtime-head">
                        <span className="pivot-manual-import__showtime-index">
                          Showtime {index + 1}
                        </span>
                        {(draft.timeSlots || []).length > 1 ? (
                          <button
                            type="button"
                            className="pivot-manual-import__showtime-remove"
                            onClick={() => removeShowtime(slot.key)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="pivot-manual-import__row">
                        <label className="pivot-manual-import__field">
                          <span className="pivot-manual-import__label">Label (optional)</span>
                          <input
                            className="linear-input pivot-manual-import__input"
                            value={slot.label}
                            onChange={(e) => updateShowtime(slot.key, { label: e.target.value })}
                            placeholder="6:00 PM"
                            autoComplete="off"
                          />
                        </label>
                        <label className="pivot-manual-import__field">
                          <span className="pivot-manual-import__label">Start</span>
                          <input
                            className="linear-input pivot-manual-import__input"
                            type="datetime-local"
                            value={slot.startTimeLocal}
                            onChange={(e) =>
                              updateShowtime(slot.key, { startTimeLocal: e.target.value })
                            }
                          />
                        </label>
                      </div>
                      <label className="pivot-manual-import__field pivot-manual-import__field--wide">
                        <span className="pivot-manual-import__label">End (optional)</span>
                        <input
                          className="linear-input pivot-manual-import__input"
                          type="datetime-local"
                          value={slot.endTimeLocal}
                          onChange={(e) =>
                            updateShowtime(slot.key, { endTimeLocal: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost pivot-manual-import__add-showtime"
                    onClick={addShowtime}
                  >
                    Add showtime
                  </button>
                </div>
              )}
            </section>

            <section className="pivot-manual-import__section" aria-label="Catalog settings">
              <h3 className="pivot-manual-import__section-title">Catalog</h3>
              <div className="pivot-manual-import__row">
                {!isImport ? (
                  <>
                    <label className="pivot-manual-import__field">
                      <span className="pivot-manual-import__label">Ingest status</span>
                      <select
                        className="linear-input pivot-manual-import__input"
                        value={draft.ingestStatus}
                        disabled={lockIngestStatus}
                        onChange={(e) => patchDraft({ ingestStatus: e.target.value })}
                      >
                        <option value="draft">Draft</option>
                        <option value="staged">Staged</option>
                        <option value="published">Published (live feed)</option>
                      </select>
                      {lockIngestStatus ? <span className="pivot-manual-import__hint">Change publication status from the batch curation queue.</span> : null}
                    </label>
                    <label className="pivot-manual-import__field pivot-manual-import__check">
                      <span className="pivot-manual-import__label">Featured</span>
                      <input
                        type="checkbox"
                        checked={draft.featured === true}
                        onChange={(e) => patchDraft({ featured: e.target.checked })}
                      />
                      <span className="pivot-manual-import__hint">
                        Internal. Published featured events are the only cards on the public landing deck.
                      </span>
                    </label>
                    <label className="pivot-manual-import__field pivot-manual-import__check">
                      <span className="pivot-manual-import__label">App Clip deck</span>
                      <input
                        type="checkbox"
                        checked={draft.clipDrop === true}
                        onChange={(e) => patchDraft({ clipDrop: e.target.checked })}
                      />
                      <span className="pivot-manual-import__hint">
                        Internal. Published App Clip events make up the demo clip&apos;s deck. With none this week, the clip shows the featured cards.
                      </span>
                    </label>
                    {event?.ingestStatus === 'staged' && draft.ingestStatus === 'published' ? (
                      <p className="pivot-manual-import__hint" role="status">
                        Saving as Published runs the release step so the event appears in the app feed.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="pivot-manual-import__hint" role="status">
                    This event will be staged for review and will stay off the live feed.
                  </p>
                )}
                <label className="pivot-manual-import__field">
                  <span className="pivot-manual-import__label">Listing URL</span>
                  <input
                    className="linear-input pivot-manual-import__input"
                    value={draft.sourceUrl}
                    onChange={(e) => patchDraft({ sourceUrl: e.target.value })}
                    placeholder="https://…"
                    autoComplete="off"
                  />
                </label>
              </div>
            </section>

            {!isImport ? (
            <section className="pivot-manual-import__section" aria-label="Enrichment">
              <h3 className="pivot-manual-import__section-title">Enrichment</h3>
              <p className="pivot-manual-import__hint">
                Optional metadata for Explore search and future embeddings. Empty fields are allowed.
              </p>
              {draft.ingestStatus === 'published' && !hasEnrichmentDraftContent(draft.enrichment) ? (
                <p className="pivot-catalog-edit__enrichment-warn" role="status">
                  No enrichment yet — publish is allowed, but search and personalization work better with vibe, price, neighborhood, or audience.
                </p>
              ) : null}
              <label className="pivot-manual-import__field pivot-manual-import__field--wide">
                <span className="pivot-manual-import__label">Vibe (comma-separated)</span>
                <input
                  className="linear-input pivot-manual-import__input"
                  value={draft.enrichment?.vibeText || ''}
                  onChange={(e) =>
                    patchDraft({
                      enrichment: {
                        ...draft.enrichment,
                        vibeText: e.target.value,
                      },
                    })
                  }
                  placeholder="intimate, dancey, outdoors"
                  autoComplete="off"
                />
              </label>
              <div className="pivot-manual-import__row">
                <label className="pivot-manual-import__field">
                  <span className="pivot-manual-import__label">Price band</span>
                  <select
                    className="linear-input pivot-manual-import__input"
                    value={draft.enrichment?.priceBand || ''}
                    onChange={(e) =>
                      patchDraft({
                        enrichment: {
                          ...draft.enrichment,
                          priceBand: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Not set</option>
                    <option value="free">Free</option>
                    <option value="low">Low</option>
                    <option value="mid">Mid</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="pivot-manual-import__field">
                  <span className="pivot-manual-import__label">Neighborhood</span>
                  <input
                    className="linear-input pivot-manual-import__input"
                    value={draft.enrichment?.neighborhood || ''}
                    onChange={(e) =>
                      patchDraft({
                        enrichment: {
                          ...draft.enrichment,
                          neighborhood: e.target.value,
                        },
                      })
                    }
                    placeholder="williamsburg"
                    autoComplete="off"
                  />
                </label>
              </div>
              <label className="pivot-manual-import__field pivot-manual-import__field--wide">
                <span className="pivot-manual-import__label">Audience</span>
                <input
                  className="linear-input pivot-manual-import__input"
                  value={draft.enrichment?.audience || ''}
                  onChange={(e) =>
                    patchDraft({
                      enrichment: {
                        ...draft.enrichment,
                        audience: e.target.value,
                      },
                    })
                  }
                  placeholder="21+, queer-friendly, families"
                  autoComplete="off"
                />
              </label>
            </section>
            ) : null}

            <section className="pivot-manual-import__section" aria-label="Tags">
              <h3 className="pivot-manual-import__section-title">Tags</h3>
              <PivotTagMultiSelect
                catalogTags={catalogTags}
                selectedSlugs={draft.tags}
                onChange={(tags) => patchDraft({ tags })}
                labelId="pivot-catalog-edit-tags"
                hint="Select at least one catalog tag for published events."
              />
              {onSuggestTags ? (
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost"
                  onClick={() => onSuggestTags(draft, patchDraft)}
                  disabled={tagSuggestLoading}
                >
                  {tagSuggestLoading ? 'Suggesting…' : 'Suggest tags with Claude'}
                </button>
              ) : null}
            </section>
          </div>

          {deckPreview ? (
            <aside className="pivot-catalog-edit__preview" aria-label="Deck preview">
              <PivotDeckPhonePreview
                {...deckPreview}
                hint="Live preview of the swipe deck card."
              />
            </aside>
          ) : null}
        </div>

        {formError ? <p className="pivot-manual-import__error">{formError}</p> : null}

        {canImproveScrape ? <div className="pivot-catalog-edit__learning">
          {event.scrapeEvidence?.appliedRuleIds?.length ? <p>
            {event.scrapeEvidence.appliedRuleIds.length} approved extraction rule{event.scrapeEvidence.appliedRuleIds.length === 1 ? '' : 's'} affected this event during its last crawl.
          </p> : null}
          <label className="pivot-manual-import__hint"><input type="checkbox" checked={rememberForCalendar}
            onChange={(e) => setRememberForCalendar(e.target.checked)} />{' '}Improve future scrapes from these corrections</label>
          {rememberForCalendar ? <>
            <p>The event correction saves now. A reusable rule will wait for review in Source health.</p>
            {imageChanged ? <label>Why was the image wrong?
              <select aria-label="Image correction reason" value={correctionReasons.image || ''}
                onChange={(e) => setCorrectionReasons((current) => ({ ...current, image: e.target.value }))}>
                <option value="">Choose a reason</option><option value="venue_logo">Venue or calendar logo</option>
                <option value="wrong_event">Image from another event</option><option value="low_quality">Low quality image</option>
              </select></label> : null}
            {descriptionChanged ? <label>Why was the description wrong?
              <select aria-label="Description correction reason" value={correctionReasons.description || ''}
                onChange={(e) => setCorrectionReasons((current) => ({ ...current, description: e.target.value }))}>
                <option value="">Choose a reason</option><option value="date_not_description">It was a date or time</option>
                <option value="boilerplate">Repeated venue copy</option><option value="wrong_event">Copy from another event</option>
              </select></label> : null}
            {dateChanged ? <label>Why was the start date wrong?
              <select aria-label="Date correction reason" value={correctionReasons.start_time || ''}
                onChange={(e) => setCorrectionReasons((current) => ({ ...current, start_time: e.target.value }))}>
                <option value="">Choose a reason</option><option value="section_heading">Date heading applies to a group</option>
                <option value="detail_page">Use the event detail page</option><option value="wrong_date">Unrelated date on the page</option>
              </select></label> : null}
          </> : null}
        </div> : null}

        <footer className="pivot-manual-import__footer">
          <div className="pivot-manual-import__actions">
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? (savingLabel || 'Saving…')
                : (saveLabel || (isImport ? 'Stage event' : 'Save changes'))}
            </button>
            <button type="button" className="linear-btn linear-btn--ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </footer>
      </div>
      ) : null}
    </Popup>
  );
}

export default PivotCatalogEventEditModal;
