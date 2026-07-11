import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Popup from '../../../components/Popup/Popup';
import { useNotification } from '../../../NotificationContext';
import PivotTagMultiSelect from './PivotTagMultiSelect';
import PivotTmdbLookup from './PivotTmdbLookup';
import './PivotManualImportModal.scss';

const IMAGE_CHECK_DEBOUNCE_MS = 450;
const IMAGE_CHECK_TIMEOUT_MS = 12_000;

function normalizeImageUrl(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function checkImageUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      finish({ ok: false, reason: 'timeout' });
    }, IMAGE_CHECK_TIMEOUT_MS);

    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        finish({ ok: true });
        return;
      }
      finish({ ok: false, reason: 'empty' });
    };

    img.onerror = () => {
      finish({ ok: false, reason: 'blocked' });
    };

    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

function imagePreviewErrorMessage(reason) {
  if (reason === 'timeout') {
    return 'Image took too long to load — check the URL or try again.';
  }
  if (reason === 'invalid') {
    return 'Enter a valid http(s) image URL.';
  }
  return 'Could not load image — the URL may be broken, not an image, or blocked by the host.';
}

function isTypingTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function toDatetimeLocalValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function datetimeLocalToIso(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function nextWeekdayAt(hour, minute, weekday) {
  const date = new Date();
  const delta = (weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  date.setHours(hour, minute, 0, 0);
  if (date <= new Date()) {
    date.setDate(date.getDate() + 7);
  }
  return date;
}

export function createManualImportDraft(sticky = {}) {
  const friday = nextWeekdayAt(19, 0, 5);
  const startTimeLocal = sticky.startTimeLocal || toDatetimeLocalValue(friday);
  return {
    name: '',
    organizerName: sticky.organizerName || '',
    location: sticky.location || '',
    scheduleMode: sticky.scheduleMode === 'showtimes' ? 'showtimes' : 'single',
    startTimeLocal,
    endTimeLocal: sticky.endTimeLocal || '',
    timeSlots:
      sticky.scheduleMode === 'showtimes' && Array.isArray(sticky.timeSlots)
        ? sticky.timeSlots.map((slot) => ({ ...slot }))
        : [],
    tags: Array.isArray(sticky.tags) ? [...sticky.tags] : [],
    movie: sticky.movie || null,
    sourceUrl: '',
    description: '',
    imageUrl: '',
  };
}

function buildShowtimeId(label, startTimeLocal, index, usedIds) {
  const fromLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (fromLabel) {
    let candidate = fromLabel;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${fromLabel}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  if (startTimeLocal) {
    const parsed = new Date(startTimeLocal);
    if (!Number.isNaN(parsed.getTime())) {
      let candidate = `${pad2(parsed.getHours())}${pad2(parsed.getMinutes())}`;
      let suffix = 2;
      while (usedIds.has(candidate)) {
        candidate = `${pad2(parsed.getHours())}${pad2(parsed.getMinutes())}-${suffix}`;
        suffix += 1;
      }
      return candidate;
    }
  }

  let candidate = `slot-${index + 1}`;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `slot-${index + 1}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function formatShowtimeLabel(startTimeLocal) {
  const parsed = new Date(startTimeLocal);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '');
}

export function normalizeManualShowtimeSlots(timeSlots) {
  if (!Array.isArray(timeSlots) || !timeSlots.length) {
    return [];
  }

  const usedIds = new Set();
  const normalized = [];

  for (const [index, raw] of timeSlots.entries()) {
    const start_time = datetimeLocalToIso(raw.startTimeLocal);
    if (!start_time) {
      continue;
    }

    const id = buildShowtimeId(raw.label || '', raw.startTimeLocal, index, usedIds);
    usedIds.add(id);
    const end_time = datetimeLocalToIso(raw.endTimeLocal);
    const label = raw.label?.trim() || formatShowtimeLabel(raw.startTimeLocal);

    normalized.push({
      id,
      start_time,
      ...(end_time ? { end_time } : {}),
      ...(label ? { label } : {}),
    });
  }

  normalized.sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  return normalized;
}

export function deriveEventWindowFromShowtimes(timeSlots) {
  if (!timeSlots.length) {
    return { start_time: '', end_time: '' };
  }

  const start_time = timeSlots[0].start_time;
  let end_time = timeSlots[0].end_time || timeSlots[0].start_time;
  for (const slot of timeSlots) {
    const candidate = slot.end_time || slot.start_time;
    if (new Date(candidate).getTime() > new Date(end_time).getTime()) {
      end_time = candidate;
    }
  }

  return { start_time, end_time };
}

export function createEmptyManualShowtimeSlot(startTimeLocal = '') {
  return {
    key: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    startTimeLocal,
    endTimeLocal: '',
  };
}

export function applyMovieMetadataToDraft(movie) {
  if (!movie) {
    return { movie: null };
  }

  return {
    movie,
    name: movie.title || '',
    description: movie.synopsis || '',
    imageUrl: movie.posterUrl || '',
  };
}

export function manualDraftToImportEntry(draft) {
  const tags = Array.isArray(draft.tags) ? draft.tags : [];
  const warnings = [];
  const useShowtimes = draft.scheduleMode === 'showtimes';
  const normalizedSlots = useShowtimes ? normalizeManualShowtimeSlots(draft.timeSlots) : [];
  const window = useShowtimes
    ? deriveEventWindowFromShowtimes(normalizedSlots)
    : {
        start_time: datetimeLocalToIso(draft.startTimeLocal),
        end_time: datetimeLocalToIso(draft.endTimeLocal),
      };
  const start_time = window.start_time;
  const end_time = window.end_time || undefined;

  if (!draft.name?.trim()) warnings.push('Missing event title (name).');
  if (!draft.organizerName?.trim()) warnings.push('Missing organizer (hostName).');
  if (!draft.location?.trim()) warnings.push('Missing location.');
  if (useShowtimes) {
    if (!normalizedSlots.length) warnings.push('Add at least one showtime with a valid start.');
  } else if (!start_time) {
    warnings.push('Missing start_time.');
  }
  if (!tags.length) warnings.push('No catalog tags — pick tags before publishing.');

  return {
    sourceUrl: draft.sourceUrl?.trim() || '',
    draft: {
      name: draft.name?.trim() || '',
      hostName: draft.organizerName?.trim() || '',
      location: draft.location?.trim() || '',
      start_time,
      ...(end_time ? { end_time } : {}),
      description: draft.description?.trim() || '',
      image: draft.imageUrl?.trim() || '',
      sourceUrl: draft.sourceUrl?.trim() || '',
      source: 'manual',
      sourceTags: [],
      tags,
      ...(normalizedSlots.length ? { timeSlots: normalizedSlots } : {}),
      ...(draft.movie ? { movie: draft.movie } : {}),
    },
    warnings,
  };
}

function validateManualDraft(draft) {
  const entry = manualDraftToImportEntry(draft);
  const missing = entry.warnings.filter(
    (warning) => !warning.startsWith('No catalog tags'),
  );
  if (!entry.draft.tags.length) {
    return 'Select at least one catalog tag.';
  }
  if (missing.length) {
    if (draft.scheduleMode === 'showtimes') {
      return 'Fill title, organizer, location, and at least one showtime.';
    }
    return 'Fill title, organizer, location, and start time.';
  }
  return null;
}

const TIME_SHORTCUTS = [
  { key: 'fri', label: 'Fri 7p', date: () => nextWeekdayAt(19, 0, 5) },
  { key: 'sat', label: 'Sat 2p', date: () => nextWeekdayAt(14, 0, 6) },
  { key: 'sun', label: 'Sun 11a', date: () => nextWeekdayAt(11, 0, 0) },
  {
    key: 'tonight',
    label: 'Tonight',
    date: () => {
      const date = new Date();
      date.setHours(19, 0, 0, 0);
      if (date <= new Date()) date.setDate(date.getDate() + 1);
      return date;
    },
  },
];

function PivotManualImportModal({
  open,
  onClose,
  catalogTags,
  cityLabel,
  batchWeek,
  selectedTenantKey,
  stickyDefaults,
  onStickyChange,
  onAddToBatch,
  onPublish,
  publishLoading,
  onSuggestTags,
  tagSuggestLoading,
}) {
  const { addNotification } = useNotification();
  const [draft, setDraft] = useState(() => createManualImportDraft(stickyDefaults));
  const [showOptional, setShowOptional] = useState(false);
  const [formError, setFormError] = useState('');
  const [imagePreview, setImagePreview] = useState({ status: 'idle', url: '', message: '' });
  const titleRef = useRef(null);
  const stickyRef = useRef(stickyDefaults);
  const imageNotifyRef = useRef('');
  stickyRef.current = stickyDefaults;

  useEffect(() => {
    if (!open) return;
    setDraft(createManualImportDraft(stickyRef.current));
    setShowOptional(false);
    setFormError('');
    setImagePreview({ status: 'idle', url: '', message: '' });
    imageNotifyRef.current = '';
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const patchDraft = useCallback((patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError('');
  }, []);

  useEffect(() => {
    const trimmed = draft.imageUrl.trim();
    if (!trimmed) {
      setImagePreview({ status: 'idle', url: '', message: '' });
      imageNotifyRef.current = '';
      return undefined;
    }

    const normalized = normalizeImageUrl(trimmed);
    if (!normalized) {
      const message = imagePreviewErrorMessage('invalid');
      setImagePreview({ status: 'error', url: trimmed, message });
      if (imageNotifyRef.current !== trimmed) {
        imageNotifyRef.current = trimmed;
        addNotification({
          title: 'Image preview failed',
          message,
          type: 'warning',
        });
      }
      return undefined;
    }

    setImagePreview({ status: 'checking', url: normalized, message: '' });
    let cancelled = false;

    const timer = setTimeout(async () => {
      const result = await checkImageUrl(normalized);
      if (cancelled) return;

      if (result.ok) {
        setImagePreview({ status: 'ok', url: normalized, message: '' });
        imageNotifyRef.current = '';
        return;
      }

      const message = imagePreviewErrorMessage(result.reason);
      setImagePreview({ status: 'error', url: normalized, message });
      if (imageNotifyRef.current !== normalized) {
        imageNotifyRef.current = normalized;
        addNotification({
          title: 'Image preview failed',
          message,
          type: 'warning',
        });
      }
    }, IMAGE_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addNotification, draft.imageUrl]);

  const toggleTag = useCallback((slug) => {
    setDraft((current) => {
      const tags = current.tags.includes(slug)
        ? current.tags.filter((entry) => entry !== slug)
        : [...current.tags, slug];
      return { ...current, tags };
    });
    setFormError('');
  }, []);

  const persistSticky = useCallback(
    (nextDraft) => {
      onStickyChange?.({
        organizerName: nextDraft.organizerName,
        location: nextDraft.location,
        tags: nextDraft.tags,
        startTimeLocal: nextDraft.startTimeLocal,
        endTimeLocal: nextDraft.endTimeLocal,
        scheduleMode: nextDraft.scheduleMode,
        timeSlots: nextDraft.timeSlots,
        movie: nextDraft.movie,
      });
    },
    [onStickyChange],
  );

  const resetForNextEntry = useCallback(
    (nextDraft) => {
      const sticky = {
        organizerName: nextDraft.organizerName,
        location: nextDraft.location,
        tags: nextDraft.tags,
        startTimeLocal: nextDraft.startTimeLocal,
        endTimeLocal: nextDraft.endTimeLocal,
        scheduleMode: nextDraft.scheduleMode,
        timeSlots: nextDraft.timeSlots,
        movie: nextDraft.movie,
      };
      persistSticky(sticky);
      setDraft(createManualImportDraft(sticky));
      requestAnimationFrame(() => titleRef.current?.focus());
    },
    [persistSticky],
  );

  const handleAddToBatch = useCallback(() => {
    const error = validateManualDraft(draft);
    if (error) {
      setFormError(error);
      return;
    }
    onAddToBatch?.(manualDraftToImportEntry(draft));
    resetForNextEntry(draft);
  }, [draft, onAddToBatch, resetForNextEntry]);

  const handlePublish = useCallback(async () => {
    const error = validateManualDraft(draft);
    if (error) {
      setFormError(error);
      return;
    }
    if (!selectedTenantKey) {
      setFormError('Choose a city before publishing.');
      return;
    }
    const ok = await onPublish?.(draft);
    if (ok) {
      resetForNextEntry(draft);
    }
  }, [draft, onPublish, resetForNextEntry, selectedTenantKey]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
          handlePublish();
        } else {
          handleAddToBatch();
        }
        return;
      }

      if (isTypingTarget(event.target)) return;

      const hotkeyIndex = Number.parseInt(event.key, 10);
      if (hotkeyIndex >= 1 && hotkeyIndex <= 9 && catalogTags[hotkeyIndex - 1]) {
        event.preventDefault();
        toggleTag(catalogTags[hotkeyIndex - 1].slug);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [catalogTags, handleAddToBatch, handlePublish, onClose, open, toggleTag]);

  const canSubmit = useMemo(() => !validateManualDraft(draft), [draft]);

  const setScheduleMode = useCallback(
    (scheduleMode) => {
      setDraft((current) => {
        if (scheduleMode === current.scheduleMode) {
          return current;
        }

        if (scheduleMode === 'showtimes') {
          const seedSlots =
            current.timeSlots?.length > 0
              ? current.timeSlots
              : [createEmptyManualShowtimeSlot(current.startTimeLocal)];
          return {
            ...current,
            scheduleMode: 'showtimes',
            timeSlots: seedSlots,
          };
        }

        const firstSlot = current.timeSlots?.[0];
        return {
          ...current,
          scheduleMode: 'single',
          startTimeLocal: firstSlot?.startTimeLocal || current.startTimeLocal,
          endTimeLocal: firstSlot?.endTimeLocal || current.endTimeLocal,
        };
      });
      setFormError('');
    },
    [],
  );

  const addShowtime = useCallback(() => {
    setDraft((current) => {
      const lastSlot = current.timeSlots?.[current.timeSlots.length - 1];
      const seedStart = lastSlot?.startTimeLocal || current.startTimeLocal;
      let nextStart = seedStart;
      if (seedStart) {
        const parsed = new Date(seedStart);
        if (!Number.isNaN(parsed.getTime())) {
          parsed.setHours(parsed.getHours() + 2);
          nextStart = toDatetimeLocalValue(parsed);
        }
      }
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

  return (
    <Popup
      isOpen={open}
      onClose={onClose}
      customClassName="pivot-manual-import__shell"
      disableOutsideClick={publishLoading || tagSuggestLoading}
    >
      <div
        className="pivot-manual-import"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pivot-manual-import-title"
      >
        <header className="pivot-manual-import__head">
          <div>
            <h2 id="pivot-manual-import-title" className="pivot-manual-import__title">
              Quick add manual event
            </h2>
            <p className="pivot-manual-import__meta">
              {cityLabel || 'No city'} · {batchWeek}
            </p>
          </div>
        </header>

        <div className="pivot-manual-import__form">
          <section className="pivot-manual-import__section" aria-label="Event details">
            <h3 className="pivot-manual-import__section-title">Event</h3>
            <label className="pivot-manual-import__field pivot-manual-import__field--wide">
              <span className="pivot-manual-import__label">Title</span>
              <input
                ref={titleRef}
                className="linear-input pivot-manual-import__input"
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
                placeholder="Sunset listening party"
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
                  placeholder="Venue or host"
                  autoComplete="off"
                />
              </label>
              <label className="pivot-manual-import__field">
                <span className="pivot-manual-import__label">Location</span>
                <input
                  className="linear-input pivot-manual-import__input"
                  value={draft.location}
                  onChange={(e) => patchDraft({ location: e.target.value })}
                  placeholder="Neighborhood or address"
                  autoComplete="off"
                />
              </label>
            </div>
          </section>

          <section className="pivot-manual-import__section" aria-label="Film metadata">
            <PivotTmdbLookup
              movie={draft.movie}
              onMovieChange={handleMovieChange}
              disabled={publishLoading || tagSuggestLoading}
            />
          </section>

          <section className="pivot-manual-import__section" aria-label="Poster image">
            <h3 className="pivot-manual-import__section-title">Poster</h3>
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
            {draft.imageUrl.trim() ? (
              <div
                className={`pivot-manual-import__image-preview${
                  imagePreview.status === 'error'
                    ? ' pivot-manual-import__image-preview--error'
                    : imagePreview.status === 'ok'
                      ? ' pivot-manual-import__image-preview--ok'
                      : ''
                }`}
              >
                {imagePreview.status === 'checking' ? (
                  <p className="pivot-manual-import__image-preview-status">Checking image…</p>
                ) : null}
                {imagePreview.status === 'error' ? (
                  <p className="pivot-manual-import__image-preview-status pivot-manual-import__image-preview-status--error">
                    {imagePreview.message}
                  </p>
                ) : null}
                {imagePreview.status === 'ok' ? (
                  <img
                    className="pivot-manual-import__image-preview-img"
                    src={imagePreview.url}
                    alt="Poster preview"
                    referrerPolicy="no-referrer"
                    onError={() => {
                      const message = imagePreviewErrorMessage('blocked');
                      setImagePreview({ status: 'error', url: imagePreview.url, message });
                      if (imageNotifyRef.current !== imagePreview.url) {
                        imageNotifyRef.current = imagePreview.url;
                        addNotification({
                          title: 'Image preview failed',
                          message,
                          type: 'warning',
                        });
                      }
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <p className="pivot-manual-import__image-hint">Paste a direct image link to preview the deck poster.</p>
            )}
          </section>

          <section className="pivot-manual-import__section" aria-label="Schedule">
            <div className="pivot-manual-import__section-head">
              <h3 className="pivot-manual-import__section-title">When</h3>
              <div
                className="pivot-manual-import__schedule-toggle"
                role="group"
                aria-label="Schedule mode">
                <button
                  type="button"
                  className={`pivot-manual-import__schedule-btn${
                    draft.scheduleMode === 'single'
                      ? ' pivot-manual-import__schedule-btn--active'
                      : ''
                  }`}
                  onClick={() => setScheduleMode('single')}>
                  Single time
                </button>
                <button
                  type="button"
                  className={`pivot-manual-import__schedule-btn${
                    draft.scheduleMode === 'showtimes'
                      ? ' pivot-manual-import__schedule-btn--active'
                      : ''
                  }`}
                  onClick={() => setScheduleMode('showtimes')}>
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
                <div className="pivot-manual-import__time-shortcuts" role="group" aria-label="Time shortcuts">
                  {TIME_SHORTCUTS.map((shortcut) => (
                    <button
                      key={shortcut.key}
                      type="button"
                      className="pivot-manual-import__time-btn"
                      onClick={() => patchDraft({ startTimeLocal: toDatetimeLocalValue(shortcut.date()) })}
                    >
                      {shortcut.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pivot-manual-import__showtimes">
                {(draft.timeSlots || []).map((slot, index) => (
                  <div key={slot.key} className="pivot-manual-import__showtime-row">
                    <div className="pivot-manual-import__showtime-head">
                      <span className="pivot-manual-import__showtime-index">Showtime {index + 1}</span>
                      {(draft.timeSlots || []).length > 1 ? (
                        <button
                          type="button"
                          className="pivot-manual-import__showtime-remove"
                          onClick={() => removeShowtime(slot.key)}>
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
                          onChange={(e) => updateShowtime(slot.key, { startTimeLocal: e.target.value })}
                        />
                      </label>
                    </div>
                    <label className="pivot-manual-import__field pivot-manual-import__field--wide">
                      <span className="pivot-manual-import__label">End (optional)</span>
                      <input
                        className="linear-input pivot-manual-import__input"
                        type="datetime-local"
                        value={slot.endTimeLocal}
                        onChange={(e) => updateShowtime(slot.key, { endTimeLocal: e.target.value })}
                      />
                    </label>
                  </div>
                ))}
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost pivot-manual-import__add-showtime"
                  onClick={addShowtime}>
                  Add showtime
                </button>
                <p className="pivot-manual-import__showtime-hint">
                  Users pick a showtime when they tap “i got a ticket” in the app.
                </p>
              </div>
            )}
          </section>

          <section className="pivot-manual-import__section" aria-label="Tags">
            <h3 className="pivot-manual-import__section-title">Tags</h3>
            <PivotTagMultiSelect
              catalogTags={catalogTags}
              selectedSlugs={draft.tags}
              onChange={(tags) => patchDraft({ tags })}
              labelId="pivot-manual-import-tags"
              hint="Press 1–9 to toggle the first nine tags."
              compact
              showHotkeys
              showLabel={false}
            />
          </section>

          <details
            className="pivot-manual-import__optional"
            open={showOptional}
            onToggle={(e) => setShowOptional(e.target.open)}
          >
            <summary className="pivot-manual-import__optional-summary">Optional fields</summary>
            <div className="pivot-manual-import__optional-body">
              <label className="pivot-manual-import__field pivot-manual-import__field--wide">
                <span className="pivot-manual-import__label">Listing URL</span>
                <input
                  className="linear-input pivot-manual-import__input"
                  value={draft.sourceUrl}
                  onChange={(e) => patchDraft({ sourceUrl: e.target.value })}
                  placeholder="https://…"
                  autoComplete="off"
                />
              </label>
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
            </div>
          </details>
        </div>

        {formError ? <p className="pivot-manual-import__error">{formError}</p> : null}

        <footer className="pivot-manual-import__footer">
          <div className="pivot-manual-import__actions">
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              onClick={handleAddToBatch}
              disabled={!canSubmit}
            >
              Add to batch
              <kbd className="pivot-manual-import__kbd">⌘↵</kbd>
            </button>
            <button
              type="button"
              className="linear-btn linear-btn--ghost"
              onClick={handlePublish}
              disabled={!canSubmit || !selectedTenantKey || publishLoading}
            >
              {publishLoading ? 'Staging…' : 'Stage now'}
              <kbd className="pivot-manual-import__kbd">⌘⇧↵</kbd>
            </button>
            {onSuggestTags ? (
              <button
                type="button"
                className="linear-btn linear-btn--ghost"
                onClick={() => onSuggestTags(draft, patchDraft)}
                disabled={tagSuggestLoading}
              >
                {tagSuggestLoading ? 'Suggesting…' : 'AI tags'}
              </button>
            ) : null}
            <button type="button" className="linear-btn linear-btn--ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
          <p className="pivot-manual-import__shortcuts">
            <kbd>M</kbd> open · <kbd>1</kbd>–<kbd>9</kbd> tags · <kbd>⌘↵</kbd> queue next ·{' '}
            <kbd>⌘⇧↵</kbd> stage
          </p>
        </footer>
      </div>
    </Popup>
  );
}

export { isTypingTarget };
export default PivotManualImportModal;
