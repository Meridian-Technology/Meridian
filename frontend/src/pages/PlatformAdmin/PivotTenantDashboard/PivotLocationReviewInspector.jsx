import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { PivotOpsStatus } from '../../../components/PivotOps';
import { formatEventWhen } from '../../../utils/pivotIsoWeek';
import PivotLocationPlaceSearch from './PivotLocationPlaceSearch';
import './PivotLocationReviewInspector.scss';

const MAPS_EMBED_KEY = String(
  process.env.REACT_APP_GOOGLE_MAPS_EMBED_API_KEY || '',
).trim();

const FALLBACK_REASON_COPY = {
  ambiguous_provider_matches: [
    'Google found multiple plausible places',
    'Compare the source location with the suggested listing before choosing it.',
  ],
  confidence_below_auto_apply: [
    'The Google match needs a human check',
    'The match was plausible, but not confident enough to apply automatically.',
  ],
  confidence_below_review: [
    'The match confidence is too low',
    'Google returned a weak match. Correct the location or reject the suggestion.',
  ],
  out_of_scope: [
    'The suggested place is outside the city boundary',
    'Confirm this event belongs in the tenant before approving the location.',
  ],
  unmatched_physical: [
    'Google could not find this place',
    'The source may be incomplete, private, misspelled, or not listed on Google Maps.',
  ],
  provider_terminal_failure: [
    'Google could not resolve this location',
    'Correct the representation manually or leave it for another pass.',
  ],
  provider_temporary_failure: [
    'Google was temporarily unavailable',
    'Try this match again later, or correct the location manually.',
  ],
  registration_gated_requires_review: [
    'The address appears to be registration-only',
    'Keep the public label general and reveal the precise address only after registration.',
  ],
  mixed_location_modes: [
    'The source describes more than one location mode',
    'Decide whether this is a physical, online, or registration-only event.',
  ],
};

function candidateCoordinates(place) {
  const values = place?.coordinates?.coordinates;
  if (!Array.isArray(values) || values.length !== 2) return null;
  const [longitude, latitude] = values.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function googleMapsListingUrl(place) {
  if (!place) return null;
  const coordinates = candidateCoordinates(place);
  const query =
    place.venueName ||
    place.formattedAddress ||
    (coordinates ? `${coordinates.latitude},${coordinates.longitude}` : null);
  if (!query) return null;
  const params = new URLSearchParams({ api: '1', query });
  if (place.googlePlaceId) params.set('query_place_id', place.googlePlaceId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function googleMapsEmbedUrl(place, apiKey = MAPS_EMBED_KEY) {
  if (!place || !apiKey) return null;
  const coordinates = candidateCoordinates(place);
  const query = place.googlePlaceId
    ? `place_id:${place.googlePlaceId}`
    : place.formattedAddress ||
      (coordinates ? `${coordinates.latitude},${coordinates.longitude}` : null);
  if (!query) return null;
  const params = new URLSearchParams({ key: apiKey, q: query, zoom: '15' });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}

function reasonDetails(candidate) {
  if (candidate?.whyReview?.title) return candidate.whyReview;
  const reason = candidate?.review?.reason || 'manual_review';
  const [title, detail] = FALLBACK_REASON_COPY[reason] || [
    'This location needs a human decision',
    'Compare the source event with the proposed rich location before approving it.',
  ];
  return {
    reason,
    title,
    detail,
    confidence: candidate?.review?.confidence ?? null,
    candidateCount: candidate?.review?.candidateCount ?? null,
  };
}

const MODE_OPTIONS = [
  { mode: 'physical', label: 'Exact place', hint: 'Show the Google listing and address.', needsPlace: true },
  { mode: 'registration_gated', label: 'Address after RSVP', hint: 'Map the place, but only registered guests see the address.', needsPlace: true },
  { mode: 'approximate', label: 'General area', hint: 'A neighborhood or area, no exact address.' },
  { mode: 'online', label: 'Online', hint: 'Streamed or virtual only.' },
  { mode: 'tbd', label: 'TBD', hint: 'The organizer has not announced it yet.' },
];

const MODE_LABELS = Object.fromEntries(MODE_OPTIONS.map((option) => [option.mode, option.label]));

const REVIEW_ACTION_FOR_MODE = {
  physical: 'select_match',
  registration_gated: 'select_match',
  approximate: 'approve_representation',
  online: 'correct_representation',
  tbd: 'correct_representation',
};

function sourceText(candidate) {
  return candidate?.rawLocationText || candidate?.legacyLocation || '';
}

function initialMode(candidate, hasPlace) {
  const suggested = candidate?.review?.suggestedMode;
  if (['registration_gated', 'approximate', 'online', 'tbd'].includes(suggested)) return suggested;
  if (hasPlace) return 'physical';
  return sourceText(candidate) ? 'approximate' : 'tbd';
}

function defaultLabel(mode, place, candidate) {
  if (mode === 'physical') return place?.venueName || place?.publicDisplayLabel || '';
  if (mode === 'registration_gated') {
    return place?.neighborhood || place?.city || 'Location revealed after registration';
  }
  if (mode === 'approximate') return sourceText(candidate) || place?.neighborhood || place?.city || '';
  if (mode === 'online') return 'Online';
  return 'Location TBD';
}

function areaFrom(place) {
  return {
    neighborhood: place?.neighborhood || '',
    city: place?.city || '',
    region: place?.region || '',
    countryCode: place?.countryCode || '',
  };
}

/**
 * The rich location the reviewer is about to save. Physical modes reuse the
 * resolved Google place; area/online/TBD carry no precise fields at all.
 */
function buildRepresentation({ mode, place, label, area, candidate }) {
  const originalInput = sourceText(candidate);
  const publicDisplayLabel = String(label || '').trim();
  if (mode === 'physical' || mode === 'registration_gated') {
    if (!place) return null;
    return {
      ...place,
      mode,
      originalInput: originalInput || place.originalInput,
      publicDisplayLabel: publicDisplayLabel || place.publicDisplayLabel || place.venueName,
      revealPolicy: mode === 'registration_gated' ? 'registered_only' : 'public',
    };
  }
  const base = {
    mode,
    originalInput,
    resolutionStatus: 'not_applicable',
    revealPolicy: 'public',
  };
  if (mode === 'approximate') {
    const areaFields = Object.fromEntries(
      Object.entries(area || {})
        .map(([key, value]) => [key, String(value || '').trim()])
        .filter(([, value]) => value),
    );
    return {
      ...base,
      ...areaFields,
      approximateLabel: publicDisplayLabel,
      publicDisplayLabel,
    };
  }
  return {
    ...base,
    publicDisplayLabel: publicDisplayLabel || (mode === 'online' ? 'Online' : 'Location TBD'),
  };
}

function representationProblem(mode, representation) {
  if ((mode === 'physical' || mode === 'registration_gated') && !representation) {
    return 'Pick a Google candidate or search for the place first.';
  }
  if (!representation?.publicDisplayLabel) return 'Add the label people will see.';
  if (mode === 'approximate'
    && !['neighborhood', 'city', 'region', 'countryCode'].some((key) => representation[key])) {
    return 'Add a neighborhood or city so the area can be placed.';
  }
  return null;
}

function manualLocation(candidate, mode) {
  return buildRepresentation({
    mode,
    place: null,
    label: defaultLabel(mode, null, candidate),
    area: {},
    candidate,
  });
}

function rememberedRepresentation(memory, candidate) {
  if (!memory?.richLocation) return null;
  return { ...memory.richLocation, originalInput: sourceText(candidate) };
}

function RememberedMatch({ memory, busy, onUse }) {
  const location = memory.richLocation || {};
  return (
    <div className="pivot-location-review__remembered">
      <Icon icon="mdi:history" />
      <div>
        <strong>You matched “{memory.sourceText}” before</strong>
        <span>
          {MODE_LABELS[location.mode] || location.mode} · {location.publicDisplayLabel || location.formattedAddress || 'No label'}
          {location.formattedAddress && location.formattedAddress !== location.publicDisplayLabel
            ? ` · ${location.formattedAddress}`
            : ''}
        </span>
      </div>
      <button type="button" className="linear-btn linear-btn--primary linear-btn--sm" disabled={busy} onClick={onUse}>
        Use previous match
      </button>
    </div>
  );
}

function SourceEvidence({ candidate }) {
  return (
    <article className="pivot-location-review__evidence">
      <p className="pivot-location-review__eyebrow">Source event says</p>
      <div className="pivot-location-review__source-head">
        {candidate.image ? <img src={candidate.image} alt="" /> : null}
        <div>
          <strong>{candidate.name || 'Untitled event'}</strong>
          <span>{formatEventWhen(candidate.startTime)}</span>
        </div>
      </div>
      <dl className="pivot-location-review__facts">
        <div><dt>Location text</dt><dd>{candidate.rawLocationText || candidate.legacyLocation || 'Blank'}</dd></div>
        <div><dt>Source</dt><dd>{candidate.source || 'Unknown source'}</dd></div>
        <div><dt>Batch week</dt><dd>{candidate.batchWeek || '—'}</dd></div>
      </dl>
      {candidate.sourceUrl ? (
        <a
          className="linear-btn linear-btn--ghost linear-btn--sm"
          href={candidate.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Icon icon="mdi:open-in-new" /> Open source listing
        </a>
      ) : null}
    </article>
  );
}

function GoogleEvidence({ place, fromSearch = false, outOfScope = false }) {
  const listingUrl = googleMapsListingUrl(place);
  const embedUrl = googleMapsEmbedUrl(place);
  const confidence = Number(place?.resolutionConfidence);

  return (
    <article className="pivot-location-review__evidence pivot-location-review__evidence--google">
      <div className="pivot-location-review__google-head">
        <p className="pivot-location-review__eyebrow">{fromSearch ? 'You picked' : 'Google suggests'}</p>
        {fromSearch ? null : Number.isFinite(confidence) ? (
          <PivotOpsStatus tone={confidence >= 0.9 ? 'ok' : 'warn'}>
            {Math.round(confidence * 100)}% confidence
          </PivotOpsStatus>
        ) : null}
      </div>
      {place ? (
        <>
          <strong className="pivot-location-review__place-name">
            {place.venueName || place.publicDisplayLabel || 'Mapped place'}
          </strong>
          <p className="pivot-location-review__address">
            {place.formattedAddress || place.publicDisplayLabel || 'No formatted address'}
          </p>
          {outOfScope ? (
            <PivotOpsStatus tone="warn">Outside this city's boundary</PivotOpsStatus>
          ) : null}
          {embedUrl ? (
            <iframe
              className="pivot-location-review__map"
              title={`Map of ${place.venueName || place.formattedAddress || 'suggested place'}`}
              src={embedUrl}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <div className="pivot-location-review__map-fallback">
              <Icon icon="mdi:map-marker-outline" />
              <span>
                {MAPS_EMBED_KEY
                  ? 'No coordinates are available for this suggestion.'
                  : 'Map preview needs the browser-restricted Maps Embed key.'}
              </span>
            </div>
          )}
          {listingUrl ? (
            <a
              className="linear-btn linear-btn--secondary linear-btn--sm"
              href={listingUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Icon icon="mdi:google-maps" /> View exact Google listing
            </a>
          ) : null}
        </>
      ) : (
        <div className="pivot-location-review__no-match">
          <Icon icon="mdi:map-marker-off-outline" />
          <strong>No Google listing to compare</strong>
          <span>Search Google above, or describe the location as an area, online, or TBD.</span>
        </div>
      )}
    </article>
  );
}

export default function PivotLocationReviewInspector({ candidate, busy, onReview, tenantKey }) {
  const matches = candidate?.candidateMatches || [];
  const [selected, setSelected] = useState(0);
  const [searched, setSearched] = useState(null);
  const searchedPlace = searched?.place || null;
  const place = selected === 'search' ? searchedPlace : matches[selected] || null;
  const [mode, setMode] = useState(() => initialMode(candidate, Boolean(matches[0])));
  // Edits belong to one event/mode/place; switching any of them shows that
  // combination's defaults again instead of carrying a stale label across.
  const draftKey = [candidate?.eventId, mode, place?.googlePlaceId || place?.formattedAddress || ''].join('|');
  const [edits, setEdits] = useState({ key: null });
  const draftEdits = edits.key === draftKey ? edits : {};
  const placeArea = useMemo(() => areaFrom(place), [place]);
  const label = draftEdits.label ?? defaultLabel(mode, place, candidate);
  const area = draftEdits.area ?? placeArea;
  const setLabel = (value) => setEdits({ ...draftEdits, key: draftKey, label: value });
  const setArea = (value) => setEdits({ ...draftEdits, key: draftKey, area: value });
  const [remember, setRemember] = useState(true);
  const [applyToMatching, setApplyToMatching] = useState(true);
  const [representationJson, setRepresentationJson] = useState('{}');
  const why = useMemo(() => reasonDetails(candidate), [candidate]);
  const memory = candidate?.rememberedLocation || null;
  const matchingCount = candidate?.matchingCount;
  const text = sourceText(candidate);

  useEffect(() => {
    setSelected(0);
    setSearched(null);
    setMode(initialMode(candidate, Boolean(candidate?.candidateMatches?.[0])));
    setRemember(true);
    setApplyToMatching(true);
    // Reset per event, not whenever the parent re-renders the same candidate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.eventId]);

  const representation = useMemo(
    () => buildRepresentation({ mode, place, label, area, candidate }),
    [area, candidate, label, mode, place],
  );
  const problem = representationProblem(mode, representation);

  useEffect(() => {
    setRepresentationJson(JSON.stringify(representation || candidate?.richLocation || {}, null, 2));
  }, [candidate, representation]);

  if (!candidate) {
    return <div className="pivot-location-review__empty">Select an event to review it.</div>;
  }

  const reviewOptions = (candidateSource) => ({
    remember: Boolean(text) && remember,
    applyToMatching: matchingCount !== 0 && applyToMatching,
    candidateSource,
  });

  const save = () => {
    if (problem) return;
    onReview(
      candidate.eventId,
      REVIEW_ACTION_FOR_MODE[mode],
      representation,
      reviewOptions(selected === 'search' && place ? 'manual_search' : place ? 'provider_candidate' : 'manual'),
    );
  };

  const saveJson = () => {
    try {
      onReview(
        candidate.eventId,
        'correct_representation',
        JSON.parse(representationJson),
        reviewOptions('manual_json'),
      );
    } catch {
      onReview(candidate.eventId, 'invalid_json');
    }
  };

  const pickSearched = (result) => {
    setSearched(result);
    setSelected('search');
    if (mode !== 'registration_gated') setMode('physical');
  };

  const modeOption = MODE_OPTIONS.find((option) => option.mode === mode);

  return (
    <aside className="pivot-location-review">
      <header className="pivot-location-review__reason">
        <div>
          <strong>{why.title}</strong>
          <p>{why.detail}</p>
        </div>
        <div className="pivot-location-review__reason-meta">
          <span>{String(why.reason || '').replace(/_/g, ' ')}</span>
          {why.candidateCount > 1 ? <span>{why.candidateCount} possible matches</span> : null}
          {why.confidence != null ? <span>{Math.round(why.confidence * 100)}% confidence</span> : null}
          {matchingCount > 0 ? <span>{matchingCount} more waiting with this text</span> : null}
        </div>
      </header>

      {memory ? (
        <RememberedMatch
          memory={memory}
          busy={busy}
          onUse={() => onReview(
            candidate.eventId,
            memory.action || 'correct_representation',
            rememberedRepresentation(memory, candidate),
            { remember: false, applyToMatching: matchingCount !== 0, candidateSource: 'memory' },
          )}
        />
      ) : null}

      {matches.length > 1 || searchedPlace ? (
        <div className="pivot-location-review__match-picker" role="group" aria-label="Google candidates">
          <span>Compare Google candidates</span>
          <div>
            {matches.map((match, index) => (
              <button
                key={match.googlePlaceId || `${match.formattedAddress}-${index}`}
                type="button"
                className={index === selected ? 'is-active' : ''}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
              >
                <strong>{index + 1}. {match.venueName || match.publicDisplayLabel || 'Mapped place'}</strong>
                <small>{match.formattedAddress || 'No formatted address'}</small>
              </button>
            ))}
            {searchedPlace ? (
              <button
                type="button"
                className={selected === 'search' ? 'is-active' : ''}
                aria-pressed={selected === 'search'}
                onClick={() => setSelected('search')}
              >
                <strong>Your search: {searchedPlace.venueName || searchedPlace.publicDisplayLabel}</strong>
                <small>{searchedPlace.formattedAddress || 'No formatted address'}</small>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tenantKey ? (
        <PivotLocationPlaceSearch
          key={candidate.eventId}
          tenantKey={tenantKey}
          originalInput={text}
          disabled={busy}
          onPick={pickSearched}
        />
      ) : null}

      <div className="pivot-location-review__comparison">
        <SourceEvidence candidate={candidate} />
        <GoogleEvidence
          place={place}
          fromSearch={selected === 'search'}
          outOfScope={selected === 'search' && searched?.inScope === false}
        />
      </div>

      <section className="pivot-location-review__decision" aria-label="Location decision">
        <div>
          <strong>How should this event show its location?</strong>
          <span>{modeOption?.hint}</span>
        </div>
        <div className="pivot-location-review__modes" role="radiogroup" aria-label="Location type">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={mode === option.mode}
              className={mode === option.mode ? 'is-active' : ''}
              disabled={busy || (option.needsPlace && !place)}
              title={option.needsPlace && !place ? 'Pick or search for a Google place first' : option.hint}
              onClick={() => setMode(option.mode)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="pivot-location-review__draft">
          <label className="pivot-location-review__field">
            <span>{mode === 'registration_gated' ? 'Label shown before RSVP' : 'Label people will see'}</span>
            <input
              className="linear-input"
              aria-label="Public location label"
              value={label}
              disabled={busy}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          {mode === 'approximate' ? (
            <>
              <label className="pivot-location-review__field">
                <span>Neighborhood</span>
                <input
                  className="linear-input"
                  aria-label="Neighborhood"
                  value={area.neighborhood}
                  disabled={busy}
                  onChange={(event) => setArea({ ...area, neighborhood: event.target.value })}
                />
              </label>
              <label className="pivot-location-review__field">
                <span>City</span>
                <input
                  className="linear-input"
                  aria-label="City"
                  value={area.city}
                  disabled={busy}
                  onChange={(event) => setArea({ ...area, city: event.target.value })}
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="pivot-location-review__memory-options">
          {text ? (
            <label>
              <input
                type="checkbox"
                checked={remember}
                disabled={busy}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember this for future events that say “{text}”
            </label>
          ) : null}
          {matchingCount !== 0 && text ? (
            <label>
              <input
                type="checkbox"
                checked={applyToMatching}
                disabled={busy}
                onChange={(event) => setApplyToMatching(event.target.checked)}
              />
              {matchingCount > 0
                ? `Also apply to the ${matchingCount} other waiting ${matchingCount === 1 ? 'event' : 'events'} with this text`
                : 'Also apply to other waiting events with this text'}
            </label>
          ) : null}
        </div>

        <div className="pivot-location-review__actions">
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            disabled={busy || Boolean(problem)}
            title={problem || undefined}
            onClick={save}
          >
            Save location
          </button>
          {matches.length ? (
            <button
              type="button"
              className="linear-btn linear-btn--ghost"
              disabled={busy}
              onClick={() => onReview(candidate.eventId, 'reject_match')}
            >
              Dismiss Google match
            </button>
          ) : null}
          {problem ? <small className="pivot-location-review__problem">{problem}</small> : null}
        </div>
      </section>

      <details className="pivot-location-review__advanced">
        <summary>Advanced: edit rich location JSON</summary>
        <label className="pivot-location-review__field">
          <span>Rich location representation</span>
          <textarea
            className="linear-input pivot-location-review__json"
            aria-label="Rich location representation"
            rows={12}
            value={representationJson}
            onChange={(event) => setRepresentationJson(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          disabled={busy}
          onClick={saveJson}
        >
          Save manual correction
        </button>
      </details>
    </aside>
  );
}

export {
  MAPS_EMBED_KEY,
  buildRepresentation,
  candidateCoordinates,
  googleMapsEmbedUrl,
  googleMapsListingUrl,
  manualLocation,
  reasonDetails,
};
