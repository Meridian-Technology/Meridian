const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const {
  assessJustGoLocationReview,
  rawJustGoLocationText,
} = require('../utilities/justGoLocationPolicy');

const REVIEW_ACTIONS = new Set([
  'select_match',
  'reject_match',
  'correct_representation',
  'approve_representation',
]);
const APPROVABLE_MODES = new Set(['approximate', 'registration_gated']);
const HISTORY_LIMIT = 100;

const REVIEW_REASON_COPY = Object.freeze({
  ambiguous_provider_matches: {
    title: 'Google found multiple plausible places',
    detail: 'Compare the source location with the suggested listing before choosing it.',
  },
  confidence_below_auto_apply: {
    title: 'The Google match needs a human check',
    detail: 'The match was plausible, but not confident enough to apply automatically.',
  },
  confidence_below_review: {
    title: 'The match confidence is too low',
    detail: 'Google returned a weak match. Correct the location or reject the suggestion.',
  },
  out_of_scope: {
    title: 'The suggested place is outside the city boundary',
    detail: 'Confirm the source is intended for this tenant before changing the boundary or approving it.',
  },
  unmatched_physical: {
    title: 'Google could not find this place',
    detail: 'The source text may be incomplete, private, misspelled, or not a Google Maps listing.',
  },
  provider_terminal_failure: {
    title: 'Google could not resolve this location',
    detail: 'The provider returned a non-retryable error. Correct it manually or try a different place.',
  },
  provider_temporary_failure: {
    title: 'Google was temporarily unavailable',
    detail: 'Try this match again later, or correct the location manually if it is time-sensitive.',
  },
  registration_gated_requires_review: {
    title: 'The address appears to be registration-only',
    detail: 'Confirm that the public label stays general and the precise address is revealed only after registration.',
  },
  mixed_location_modes: {
    title: 'The source describes more than one location mode',
    detail: 'Choose whether this is physical, online, or hybrid before approving a representation.',
  },
  missing_location_text: {
    title: 'The source has no usable location',
    detail: 'Add a public location label or mark the event as location TBD.',
  },
  candidate_rejected: {
    title: 'The previous Google suggestion was rejected',
    detail: 'Enter a corrected representation or leave this event for another reviewer.',
  },
});

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function reviewerFrom(req) {
  return {
    id: trimString(req.user?.globalUserId) || trimString(req.user?.userId) || null,
    email: trimString(req.user?.email) || null,
  };
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function reviewExplanation(review = {}) {
  const reason = trimString(review.reason) || 'manual_review';
  const copy = REVIEW_REASON_COPY[reason] || {
    title: 'This location needs a human decision',
    detail: 'Compare the source event with the proposed rich location before approving it.',
  };
  return {
    reason,
    ...copy,
    confidence: Number.isFinite(Number(review.confidence))
      ? Number(review.confidence)
      : null,
    candidateCount: Number.isFinite(Number(review.candidateCount))
      ? Number(review.candidateCount)
      : null,
  };
}

function serializeCandidate(event) {
  const pivot = event.customFields?.pivot || {};
  const review = clone(pivot.locationReview) || null;
  const explanationInput = {
    ...(pivot.locationReview || {}),
    confidence: pivot.locationReview?.confidence
      ?? pivot.locationBackfill?.confidence,
  };
  return {
    eventId: String(event._id),
    name: event.name,
    startTime: event.start_time || null,
    endTime: event.end_time || null,
    image: event.image || null,
    legacyLocation: event.location || '',
    rawLocationText: rawJustGoLocationText({
      rawLocationText: pivot.rawLocationText,
      richLocation: event.richLocation,
      location: event.location,
    }),
    richLocation: clone(event.richLocation) || null,
    candidateMatches: clone(pivot.locationReview?.candidateMatches) || [],
    review,
    whyReview: reviewExplanation(explanationInput),
    batchWeek: pivot.batchWeek || pivot.locationReview?.batchWeek || null,
    source: pivot.source || null,
    ingestStatus: pivot.ingestStatus || null,
    sourceUrl: pivot.sourceUrl || null,
  };
}

function buildReviewMutation(event, options = {}, now = new Date()) {
  const action = trimString(options.action);
  if (!REVIEW_ACTIONS.has(action)) {
    return {
      error: `action must be one of: ${[...REVIEW_ACTIONS].join(', ')}.`,
      status: 400,
      code: 'INVALID_LOCATION_REVIEW_ACTION',
    };
  }

  const pivot = event.customFields?.pivot || {};
  const existingReview = pivot.locationReview || {};
  const originalRaw = rawJustGoLocationText({
    rawLocationText: pivot.rawLocationText,
    richLocation: event.richLocation,
    location: event.location,
  });
  const proposed = options.richLocation === undefined
    ? clone(event.richLocation)
    : clone(options.richLocation);

  if (action !== 'reject_match') {
    const assessment = assessJustGoLocationReview({
      location: event.location,
      richLocation: proposed,
    });
    if (!assessment.publishable) {
      return {
        error: 'The reviewed location must satisfy its mode rules before approval.',
        status: 400,
        code: 'LOCATION_REVIEW_INVALID_REPRESENTATION',
        locationPolicy: assessment,
      };
    }
    if (action === 'select_match'
      && !['physical', 'registration_gated'].includes(proposed?.mode)) {
      return {
        error: 'select_match requires a resolved physical or registration-gated candidate.',
        status: 400,
        code: 'LOCATION_REVIEW_MATCH_MODE_INVALID',
      };
    }
    if (action === 'approve_representation' && !APPROVABLE_MODES.has(proposed?.mode)) {
      return {
        error: 'approve_representation supports approximate or registration-gated modes.',
        status: 400,
        code: 'LOCATION_REVIEW_APPROVAL_MODE_INVALID',
      };
    }
  }

  const reviewedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const reviewer = options.reviewer || { id: null, email: null };
  const decision = {
    action,
    reviewedAt,
    reviewer: { id: reviewer.id || null, email: reviewer.email || null },
    notes: trimString(options.notes) || null,
    candidateId: trimString(options.candidateId) || null,
    candidateRepresentation: options.richLocation === undefined
      ? null
      : clone(options.richLocation),
    before: clone(event.richLocation) || null,
    after: action === 'reject_match' ? clone(event.richLocation) || null : proposed,
  };
  const decisionHistory = [
    ...(Array.isArray(existingReview.decisionHistory)
      ? existingReview.decisionHistory
      : []),
    decision,
  ].slice(-HISTORY_LIMIT);

  const review = {
    ...clone(existingReview),
    status: action === 'reject_match' ? 'needs_review' : 'approved',
    reason: action === 'reject_match' ? 'candidate_rejected' : null,
    updatedAt: reviewedAt,
    reviewedAt,
    reviewedBy: decision.reviewer,
    lastDecision: action,
    decisionHistory,
  };

  return {
    set: {
      ...(action === 'reject_match' ? {} : { richLocation: proposed }),
      'customFields.pivot.rawLocationText': originalRaw,
      'customFields.pivot.locationReview': review,
    },
    decision,
  };
}

async function listLocationReviewCandidates(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;
  const db = await connectToDatabase(tenantResult.tenant.tenantKey);
  const { Event } = getModels({ db }, 'Event');
  const status = trimString(options.status) || 'needs_review';
  const batchWeek = trimString(options.batchWeek);
  if (batchWeek && !/^\d{4}-W\d{2}$/.test(batchWeek)) {
    return {
      error: 'batchWeek must use ISO format YYYY-Www.',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }
  const query = {
    isDeleted: { $ne: true },
    'customFields.pivot.locationReview.status': status,
    ...(batchWeek ? { 'customFields.pivot.batchWeek': batchWeek } : {}),
  };
  const events = await Event.find(query)
    .select('name location richLocation start_time end_time image customFields.pivot')
    .sort({ 'customFields.pivot.locationReview.updatedAt': 1, start_time: 1 })
    .limit(Math.min(Math.max(Number(options.limit) || 50, 1), 200))
    .lean();
  return { data: { candidates: events.map(serializeCandidate) } };
}

async function reviewLocationCandidate(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;
  const eventId = trimString(options.eventId);
  if (!eventId) {
    return { error: 'eventId is required.', status: 400, code: 'EVENT_ID_REQUIRED' };
  }
  const db = await connectToDatabase(tenantResult.tenant.tenantKey);
  const { Event } = getModels({ db }, 'Event');
  const event = await Event.findOne({
    _id: eventId,
    isDeleted: { $ne: true },
    'customFields.pivot': { $exists: true },
  }).lean();
  if (!event) {
    return { error: 'Pivot catalog event not found.', status: 404, code: 'EVENT_NOT_FOUND' };
  }
  const mutation = buildReviewMutation(event, {
    ...options,
    reviewer: reviewerFrom(req),
  }, options.now);
  if (mutation.error) return mutation;
  const updated = await Event.findByIdAndUpdate(
    eventId,
    { $set: mutation.set },
    { new: true, runValidators: true },
  ).lean();
  return { data: { candidate: serializeCandidate(updated), decision: mutation.decision } };
}

module.exports = {
  listLocationReviewCandidates,
  reviewLocationCandidate,
  buildReviewMutation,
  serializeCandidate,
  reviewerFrom,
  reviewExplanation,
};
