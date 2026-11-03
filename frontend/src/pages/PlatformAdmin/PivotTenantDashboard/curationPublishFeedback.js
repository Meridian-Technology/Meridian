import { PIVOT_TENANT_PAGES } from './pivotTenantPageRoutes';
import { RICH_LOCATION_MIGRATION_UI_ENABLED } from './richLocationMigrationFlag';

const LOCATION_REVIEW_COPY = {
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
    'Confirm this event belongs in this city before approving the location.',
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
  missing_location_text: [
    'The source has no usable location',
    'Add a public location label or mark the event as location TBD.',
  ],
  candidate_rejected: [
    'The previous Google suggestion was rejected',
    'Enter a corrected representation before publishing.',
  ],
};

export function locationReviewBlock(event) {
  if (event?.locationReview?.status !== 'needs_review') return null;
  const reason = String(event.locationReview.reason || '').trim() || 'manual_review';
  const copy = LOCATION_REVIEW_COPY[reason] || [
    'Location needs a human decision',
    'Approve or correct the location before this event can go live.',
  ];
  return { reason, title: copy[0], detail: copy[1] };
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isResolvedGoogleMatch(place) {
  const point = place?.coordinates?.coordinates;
  return Boolean(place?.googlePlaceId && place?.formattedAddress
    && Array.isArray(point) && point.length === 2);
}

/** Google's top suggestion for an event waiting on location review, if any. */
export function locationReviewGoogleMatch(event) {
  if (!locationReviewBlock(event)) return null;
  const [top] = Array.isArray(event.locationReview.candidateMatches)
    ? event.locationReview.candidateMatches
    : [];
  return isResolvedGoogleMatch(top) ? top : null;
}

/** How sure Google was about its top match, as a 0–100 whole percentage. */
export function locationReviewConfidencePercent(event) {
  if (!locationReviewBlock(event)) return null;
  const confidence = finiteOrNull(event.locationReview.confidence)
    ?? finiteOrNull(event.locationReview.candidateMatches?.[0]?.resolutionConfidence);
  return confidence == null ? null : Math.round(Math.min(Math.max(confidence, 0), 1) * 100);
}

/**
 * Events in a selection that can take Google's top match without opening the
 * resolver. Out-of-scope matches stay manual: the suggestion is outside the city.
 */
export function bulkGoogleLocationEvents(events = []) {
  return events.filter((event) => locationReviewGoogleMatch(event)
    && locationReviewBlock(event).reason !== 'out_of_scope');
}

/** The select_match body that accepts an event's top Google match as-is. */
export function googleMatchReviewRequest(event) {
  const match = locationReviewGoogleMatch(event);
  if (!match) return null;
  return {
    action: 'select_match',
    richLocation: {
      ...match,
      mode: 'physical',
      originalInput: event.rawLocationText || match.originalInput || event.location || '',
      revealPolicy: 'public',
    },
    candidateSource: 'provider_candidate',
    remember: true,
  };
}

/**
 * Shape a curation catalog event like a `/rich-location-migration/reviews`
 * candidate so PivotLocationReviewInspector can resolve it in place.
 */
export function locationReviewCandidate(event) {
  const block = locationReviewBlock(event);
  if (!block) return null;
  const review = event.locationReview;
  return {
    eventId: String(event._id),
    name: event.name,
    startTime: event.start_time || null,
    image: event.image || null,
    legacyLocation: event.location || '',
    rawLocationText: event.rawLocationText || event.richLocation?.originalInput || event.location || '',
    richLocation: event.richLocation || null,
    candidateMatches: Array.isArray(review.candidateMatches) ? review.candidateMatches : [],
    review,
    whyReview: {
      reason: block.reason,
      title: block.title,
      detail: block.detail,
      confidence: finiteOrNull(review.confidence),
      candidateCount: finiteOrNull(review.candidateCount),
    },
    batchWeek: event.batchWeek || null,
    source: event.source || null,
    sourceUrl: event.sourceUrl || event.externalLink || null,
  };
}

/** Notification copy after a review save, including any events it also resolved. */
export function locationReviewSavedMessage(result = {}) {
  const name = result?.candidate?.name || '';
  const updated = Number(result?.matching?.updated) || 0;
  const parts = [name];
  if (updated) parts.push(`${updated} more ${updated === 1 ? 'event' : 'events'} with the same text`);
  if (result?.memory) parts.push('remembered for next time');
  return parts.filter(Boolean).join(' · ');
}

export function locationReviewHref(tenantKey, batchWeek, enabled = RICH_LOCATION_MIGRATION_UI_ENABLED) {
  if (!tenantKey || !enabled) return null;
  const params = new URLSearchParams({
    page: String(PIVOT_TENANT_PAGES.content),
    content: 'locations',
  });
  if (batchWeek) params.set('batchWeek', batchWeek);
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params.toString()}`;
}

export function coverImageBlock(event, { brokenImageIds, broken, scanning } = {}) {
  const raw = String(event?.image || '').trim();
  if (!raw) {
    return {
      code: 'MISSING_IMAGE',
      title: 'No cover image',
      detail: 'Add a working cover image before this event can go live.',
    };
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        code: 'BROKEN_IMAGE',
        title: 'Cover URL is not a web image',
        detail: 'Use an http(s) image URL that loads in the app.',
      };
    }
  } catch {
    return {
      code: 'BROKEN_IMAGE',
      title: 'Cover URL is not a web image',
      detail: 'Use an http(s) image URL that loads in the app.',
    };
  }
  if (broken || brokenImageIds?.has(String(event._id))) {
    return {
      code: 'BROKEN_IMAGE',
      title: 'Cover image failed to load',
      detail: 'Replace the image URL before this event can go live.',
    };
  }
  if (scanning) {
    return {
      code: 'CHECKING_IMAGE',
      title: 'Cover image is still being checked',
      detail: 'Wait for the catalog image check to finish before publishing.',
    };
  }
  return null;
}

export function eventPublishBlock(event, options) {
  return locationReviewBlock(event) || coverImageBlock(event, options);
}

function missingRichDataFields(event) {
  if (Array.isArray(event?.missingRichData)) {
    return event.missingRichData.map((field) => String(field || '').trim()).filter(Boolean);
  }
  const missing = [];
  if (!event?.description?.trim?.()) missing.push('description');
  if (!String(event?.image || '').trim()) missing.push('image');
  return missing;
}

export function catalogCopyBlock(event) {
  const tags = Array.isArray(event?.tags)
    ? event.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : [];
  const missingRich = missingRichDataFields(event);
  const needsRich = event?.needsRichData === true || missingRich.length > 0;
  const missingTags = tags.length === 0;
  if (!needsRich && !missingTags) return null;

  if (missingTags && needsRich) {
    return {
      code: 'CATALOG_INCOMPLETE',
      title: 'Missing tags and rich data',
      detail: 'Add tags and a description before publishing from review.',
    };
  }
  if (missingTags) {
    return {
      code: 'MISSING_TAGS',
      title: 'Missing tags',
      detail: 'Add at least one tag before publishing from review.',
    };
  }
  const fields = missingRich.length ? missingRich.join(' and ') : 'description';
  return {
    code: 'MISSING_RICH_DATA',
    title: 'Missing rich data',
    detail: `Add ${fields} before publishing from review.`,
  };
}

export function publishReviewBlock(event, options) {
  return eventPublishBlock(event, options) || catalogCopyBlock(event);
}

function extraSkipLabel(skippedCount) {
  if (skippedCount <= 1) return '';
  return ` ${skippedCount - 1} more also stayed unpublished.`;
}

export function releaseOutcomeNotification(data, batchWeek) {
  const releasedCount = Number(data?.releasedCount) || 0;
  const skipped = Array.isArray(data?.skipped) ? data.skipped : [];
  const skippedCount = Number(data?.skippedCount);
  const skipTotal = Number.isFinite(skippedCount) ? skippedCount : skipped.length;
  const first = skipped[0];
  const firstLabel = first?.name ? `“${first.name}”` : 'An event';
  const firstWhy = first?.title || first?.detail || 'it is not eligible to go live yet';
  const week = batchWeek || data?.batchWeek || 'this week';

  if (releasedCount === 0 && skipTotal > 0) {
    return {
      title: 'Nothing published',
      type: 'warning',
      message: `${firstLabel} was skipped: ${firstWhy}.${extraSkipLabel(skipTotal)}`,
    };
  }
  if (releasedCount > 0 && skipTotal > 0) {
    return {
      title: 'Partially published',
      type: 'warning',
      message: `${releasedCount} event(s) are live for ${week}. ${skipTotal} skipped — ${firstWhy}.`,
    };
  }
  if (releasedCount === 0) {
    return {
      title: 'Nothing published',
      type: 'warning',
      message: `No staged events were eligible to go live for ${week}.`,
    };
  }
  return {
    title: 'Published',
    type: 'success',
    message: `${releasedCount} event(s) are now live for ${week}.`,
  };
}
