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

export function locationReviewHref(tenantKey, batchWeek) {
  if (!tenantKey) return null;
  const params = new URLSearchParams({ page: '7' });
  if (batchWeek) params.set('batchWeek', batchWeek);
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params.toString()}`;
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
