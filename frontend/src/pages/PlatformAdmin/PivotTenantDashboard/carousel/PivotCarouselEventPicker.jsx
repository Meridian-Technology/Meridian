/**
 * Fill an event slot from the city's curated catalog.
 *
 * Picking copies the event onto the slide as a snapshot and keeps its id for
 * provenance only. That is deliberate: a correction made in curation months
 * later must not silently rewrite a carousel that has already been posted, and
 * once an event is on a slide its copy belongs to the deck.
 *
 * Published events only, newest first — a deck reports on nights that already
 * happened, so a draft listing has no business on a slide.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedRequest } from '../../../../hooks/useFetch';
import PivotCarouselPopup from './PivotCarouselPopup';
import { formatWhenLabel } from './zineDeck';

const SEARCH_DEBOUNCE_MS = 260;
const PAGE = 24;

/** Local calendar day, so a late-night picker does not slip into UTC tomorrow. */
function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function tomorrowSpan() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const day = ymd(date);
  return { from: day, to: day };
}

/** The Saturday–Sunday that has already finished, not the weekend currently in progress. */
function lastWeekendSpan() {
  const now = new Date();
  const daysSinceSunday = now.getDay() === 0 ? 7 : now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - daysSinceSunday);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() - 1);
  return { from: ymd(saturday), to: ymd(sunday) };
}

const RANGES = [
  { key: 'tomorrow', label: 'tomorrow', span: tomorrowSpan },
  { key: 'weekend', label: 'last weekend', span: lastWeekendSpan },
  { key: 'all', label: 'any date', span: () => ({ from: '', to: '' }) },
];

export default function PivotCarouselEventPicker({
  tenantKey,
  open,
  slotLabel,
  onClose,
  onPick,
}) {
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounce = useRef(null);

  const base = `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/carousel-catalog`;

  const search = useCallback(
    async (nextSkip = 0, append = false) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: String(PAGE), skip: String(nextSkip) });
      if (query.trim()) params.set('q', query.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', `${to}T23:59:59.999Z`);

      const res = await authenticatedRequest(`${base}?${params.toString()}`);
      setLoading(false);

      if (!res.data?.success) {
        setError(res.data?.message || 'Could not search the catalog.');
        return;
      }
      const payload = res.data.data;
      setRows((prev) => (append ? [...prev, ...payload.events] : payload.events));
      setTotal(payload.total);
      setSkip(nextSkip);
    },
    [base, query, from, to],
  );

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(0, false), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounce.current);
  }, [open, search]);

  const applyRange = useCallback((key) => {
    setRange(key);
    const preset = RANGES.find((r) => r.key === key);
    const span = preset ? preset.span() : { from: '', to: '' };
    setFrom(span.from);
    setTo(span.to);
  }, []);

  const pick = useCallback(
    (row) => {
      onPick({
        eventId: row._id,
        label: null,
        snapshot: {
          name: row.name,
          host: row.host,
          startTime: row.startTime,
          whenLabel: formatWhenLabel(row.startTime),
          location: row.location,
          image: row.image,
        },
        imageOverride: null,
        // Catalog tags seed the vibe tags; they are a starting point to rewrite,
        // not the room's own words, so they stay editable on the slide.
        values: { tags: (row.tags || []).slice(0, 3) },
      });
      onClose();
    },
    [onPick, onClose],
  );

  const summary = useMemo(() => {
    if (loading && !rows.length) return 'searching…';
    if (error) return error;
    if (!rows.length) return 'nothing published matches';
    return `${rows.length} of ${total} published`;
  }, [loading, rows.length, total, error]);

  if (!open) return null;

  return (
    <PivotCarouselPopup open={open} onClose={onClose} className="jgz-pickerpopup">
      <div className="jgz-picker">
        <header className="jgz-picker__head">
          <div>
            <h2>Pick an event</h2>
            <p>{slotLabel}</p>
          </div>
          <span className="jgz-picker__summary">{summary}</span>
        </header>

        <div className="jgz-picker__controls">
          <label className="jgz-picker__search">
            <span className="jgz-picker__sr">Search the catalog</span>
            <input
              type="search"
              value={query}
              placeholder="name, host, venue or tag"
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </label>

          <div className="jgz-picker__ranges" role="group" aria-label="Date range">
            {RANGES.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={range === option.key}
                onClick={() => applyRange(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="jgz-picker__dates">
            <label>
              <span>from</span>
              <input
                type="date"
                value={from}
                onChange={(event) => { setFrom(event.target.value); setRange('custom'); }}
              />
            </label>
            <label>
              <span>to</span>
              <input
                type="date"
                value={to}
                onChange={(event) => { setTo(event.target.value); setRange('custom'); }}
              />
            </label>
          </div>
        </div>

        <ul className="jgz-picker__results">
          {rows.map((row) => (
            <li key={row._id}>
              <button type="button" onClick={() => pick(row)}>
                <span className="jgz-picker__thumb">
                  {row.image ? (
                    <img src={row.image} alt="" loading="lazy" />
                  ) : (
                    <span className="jgz-picker__thumb-blank">no flier</span>
                  )}
                </span>
                <span className="jgz-picker__row">
                  <b className="jgz-picker__name">{row.name}</b>
                  {row.host ? <span className="jgz-picker__host">{row.host}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {rows.length < total ? (
          <button
            type="button"
            className="jgz-picker__more"
            onClick={() => search(skip + PAGE, true)}
            disabled={loading}
          >
            {loading ? 'loading…' : `show ${Math.min(PAGE, total - rows.length)} more`}
          </button>
        ) : null}
      </div>
    </PivotCarouselPopup>
  );
}
