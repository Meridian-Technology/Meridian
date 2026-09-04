import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { PivotOpsStatus } from '../../../components/PivotOps';
import { formatEventWhen } from '../../../utils/pivotIsoWeek';

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

function manualLocation(candidate, mode) {
  const originalInput = candidate?.rawLocationText || candidate?.legacyLocation || '';
  if (mode === 'tbd') {
    return {
      mode: 'tbd',
      originalInput,
      publicDisplayLabel: 'Location TBD',
      resolutionStatus: 'not_applicable',
      revealPolicy: 'public',
    };
  }
  return {
    mode: 'approximate',
    originalInput,
    approximateLabel: originalInput || 'Location provided after registration',
    publicDisplayLabel: originalInput || 'Location provided after registration',
    resolutionStatus: 'not_applicable',
    revealPolicy: 'public',
  };
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

function GoogleEvidence({ place }) {
  const listingUrl = googleMapsListingUrl(place);
  const embedUrl = googleMapsEmbedUrl(place);
  const confidence = Number(place?.resolutionConfidence);

  return (
    <article className="pivot-location-review__evidence pivot-location-review__evidence--google">
      <div className="pivot-location-review__google-head">
        <p className="pivot-location-review__eyebrow">Google suggests</p>
        {Number.isFinite(confidence) ? (
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
          <span>Use the source evidence to enter a correction, or reject this review.</span>
        </div>
      )}
    </article>
  );
}

export default function PivotLocationReviewInspector({ candidate, busy, onReview }) {
  const matches = candidate?.candidateMatches || [];
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const suggested = matches[selectedMatchIndex] || matches[0] || null;
  const [representation, setRepresentation] = useState('{}');
  const why = useMemo(() => reasonDetails(candidate), [candidate]);

  useEffect(() => {
    setSelectedMatchIndex(0);
  }, [candidate?.eventId]);

  useEffect(() => {
    setRepresentation(JSON.stringify(suggested || candidate?.richLocation || {}, null, 2));
  }, [candidate, suggested]);

  if (!candidate) {
    return <div className="pivot-location-review__empty">Select an event to review it.</div>;
  }

  const saveCorrection = () => {
    try {
      onReview(candidate.eventId, 'correct_representation', JSON.parse(representation));
    } catch {
      onReview(candidate.eventId, 'invalid_json');
    }
  };

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
        </div>
      </header>

      {matches.length > 1 ? (
        <div className="pivot-location-review__match-picker" role="group" aria-label="Google candidates">
          <span>Compare Google candidates</span>
          <div>
            {matches.map((match, index) => (
              <button
                key={match.googlePlaceId || `${match.formattedAddress}-${index}`}
                type="button"
                className={index === selectedMatchIndex ? 'is-active' : ''}
                aria-pressed={index === selectedMatchIndex}
                onClick={() => setSelectedMatchIndex(index)}
              >
                <strong>{index + 1}. {match.venueName || match.publicDisplayLabel || 'Mapped place'}</strong>
                <small>{match.formattedAddress || 'No formatted address'}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pivot-location-review__comparison">
        <SourceEvidence candidate={candidate} />
        <GoogleEvidence place={suggested} />
      </div>

      <div className="pivot-location-review__decision">
        <div>
          <strong>Choose the location this event should use</strong>
          <span>Choose a ready-made option, or edit the full representation below.</span>
        </div>
        <div className="pivot-location-migration__actions">
          {suggested ? (
            <button
              type="button"
              className="linear-btn linear-btn--primary"
              disabled={busy}
              onClick={() => onReview(candidate.eventId, 'select_match', suggested)}
            >
              Use Google
            </button>
          ) : null}
          {candidate.rawLocationText || candidate.legacyLocation ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              disabled={busy}
              onClick={() => onReview(
                candidate.eventId,
                'correct_representation',
                manualLocation(candidate, 'approximate'),
              )}
            >
              Use source label
            </button>
          ) : null}
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            disabled={busy}
            onClick={() => onReview(
              candidate.eventId,
              'correct_representation',
              manualLocation(candidate, 'tbd'),
            )}
          >
            Mark location TBD
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            disabled={busy}
            onClick={() => onReview(candidate.eventId, 'reject_match')}
          >
            Dismiss match
          </button>
        </div>
      </div>

      <details className="pivot-location-review__advanced">
        <summary>Advanced: edit rich location JSON</summary>
        <label className="pivot-location-migration__field">
          <span>Rich location representation</span>
          <textarea
            className="linear-input pivot-location-migration__json"
            aria-label="Rich location representation"
            rows={12}
            value={representation}
            onChange={(event) => setRepresentation(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          disabled={busy}
          onClick={saveCorrection}
        >
          Save manual correction
        </button>
      </details>
    </aside>
  );
}

export {
  MAPS_EMBED_KEY,
  candidateCoordinates,
  googleMapsEmbedUrl,
  googleMapsListingUrl,
  manualLocation,
  reasonDetails,
};
