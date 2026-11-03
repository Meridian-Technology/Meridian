const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const googleLocationService = require('./googleLocationService');
const { preciseLocationInScope } = require('./justGoRichLocationWriteService');
const { resolvedPhysicalLocation } = require('./pivotLocationBackfillService');
const {
  findMemoriesForTexts,
  locationMatchKey,
  memoryModel,
  rememberLocation,
  richLocationFromMemory,
  serializeMemory,
} = require('./pivotLocationMemoryService');
const {
  assessJustGoLocationReview,
  rawJustGoLocationText,
} = require('../utilities/justGoLocationPolicy');
const {
  validateJustGoLocationConstraints,
} = require('../utilities/justGoLocationConstraints');

const REVIEW_ACTIONS = new Set([
  'select_match',
  'reject_match',
  'correct_representation',
  'approve_representation',
]);
const APPROVABLE_MODES = new Set(['approximate', 'registration_gated']);
const HISTORY_LIMIT = 100;
const MATCHING_SCAN_LIMIT = 2000;
const MATCHING_APPLY_LIMIT = 200;
const MEMORY_LIST_LIMIT = 200;

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
    matchKey: locationMatchKey(rawJustGoLocationText({
      rawLocationText: pivot.rawLocationText,
      richLocation: event.richLocation,
      location: event.location,
    })),
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
    ...(trimString(options.candidateSource)
      ? { candidateSource: trimString(options.candidateSource) }
      : {}),
    ...(options.appliedFromEventId
      ? { appliedFromEventId: String(options.appliedFromEventId) }
      : {}),
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
  const candidates = events.map(serializeCandidate);
  const [matchCounts, memories] = await Promise.all([
    countWaitingByMatchKey(Event, status),
    findMemoriesForTexts(
      db,
      tenantResult.tenant.tenantKey,
      candidates.map((candidate) => candidate.rawLocationText),
    ).catch(() => new Map()),
  ]);
  return {
    data: {
      candidates: candidates.map((candidate) => ({
        ...candidate,
        // Other events in the whole queue (any week) that share this text.
        matchingCount: Math.max((matchCounts.get(candidate.matchKey) || 1) - 1, 0),
        rememberedLocation: serializeMemory(memories.get(candidate.matchKey)),
      })),
    },
  };
}

function waitingTextFields(event) {
  return rawJustGoLocationText({
    rawLocationText: event.customFields?.pivot?.rawLocationText,
    richLocation: event.richLocation,
    location: event.location,
  });
}

async function findWaitingEvents(Event, status = 'needs_review') {
  return Event.find({
    isDeleted: { $ne: true },
    'customFields.pivot.locationReview.status': status,
  })
    .select('location richLocation customFields.pivot.rawLocationText')
    .limit(MATCHING_SCAN_LIMIT)
    .lean();
}

async function countWaitingByMatchKey(Event, status) {
  const counts = new Map();
  (await findWaitingEvents(Event, status)).forEach((event) => {
    const key = locationMatchKey(waitingTextFields(event));
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
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

  const resolved = mutation.decision.action !== 'reject_match';
  const sourceText = mutation.set['customFields.pivot.rawLocationText'];
  const reviewer = mutation.decision.reviewer;
  let memory = null;
  if (resolved && options.remember === true) {
    memory = await rememberLocation({
      db,
      tenantKey: tenantResult.tenant.tenantKey,
      sourceText,
      richLocation: mutation.decision.after,
      action: mutation.decision.action,
      reviewer,
      eventId,
    });
  }
  const matching = resolved && options.applyToMatching === true
    ? await applyToMatchingEvents(Event, {
      sourceEventId: eventId,
      sourceText,
      richLocation: mutation.decision.after,
      action: mutation.decision.action,
      reviewer,
      now: options.now,
    })
    : { updated: 0, failed: 0 };

  return {
    data: {
      candidate: serializeCandidate(updated),
      decision: mutation.decision,
      memory: serializeMemory(memory),
      matching,
    },
  };
}

/**
 * Apply one reviewer decision to the other queued events whose source text
 * normalizes to the same key. Each event keeps its own originalInput and gets
 * its own audit entry pointing back at the event that was actually reviewed.
 */
async function applyToMatchingEvents(Event, options) {
  const matchKey = locationMatchKey(options.sourceText);
  const result = { updated: 0, failed: 0 };
  if (!matchKey) return result;
  const waiting = (await findWaitingEvents(Event))
    .filter((event) => String(event._id) !== String(options.sourceEventId)
      && locationMatchKey(waitingTextFields(event)) === matchKey)
    .slice(0, MATCHING_APPLY_LIMIT);
  if (!waiting.length) return result;
  const events = await Event.find({ _id: { $in: waiting.map((event) => event._id) } }).lean();
  for (const event of events) {
    const now = options.now ? new Date(options.now) : new Date();
    const mutation = buildReviewMutation(event, {
      action: options.action,
      richLocation: richLocationFromMemory(
        { richLocation: options.richLocation, sourceText: options.sourceText },
        waitingTextFields(event),
        now,
      ),
      reviewer: options.reviewer,
      candidateSource: 'matching_text',
      appliedFromEventId: options.sourceEventId,
    }, now);
    if (mutation.error) {
      result.failed += 1;
      continue;
    }
    await Event.updateOne(
      { _id: event._id, 'customFields.pivot.locationReview.status': 'needs_review' },
      { $set: mutation.set },
      { runValidators: true },
    );
    result.updated += 1;
  }
  return result;
}

function autocompleteBias(constraints) {
  const bounds = constraints?.bounds;
  if (!bounds || bounds.west > bounds.east) return undefined;
  return {
    rectangle: {
      low: { latitude: bounds.south, longitude: bounds.west },
      high: { latitude: bounds.north, longitude: bounds.east },
    },
  };
}

function providerError(error, fallback) {
  const invalidInput = ['GOOGLE_AUTOCOMPLETE_INPUT_INVALID', 'GOOGLE_PLACE_ID_INVALID']
    .includes(error?.code);
  return {
    error: invalidInput ? 'The Google search is invalid.' : fallback,
    status: invalidInput ? 400 : error?.code === 'GOOGLE_PLACE_NOT_FOUND' ? 404 : 502,
    code: error?.code || 'GOOGLE_LOCATION_FAILED',
  };
}

async function reviewerSearchContext(req, tenantKey) {
  const tenantResult = await resolvePivotTenant(req, tenantKey);
  if (tenantResult.error) return tenantResult;
  const constraintResult = validateJustGoLocationConstraints(
    tenantResult.tenant.richLocationConstraints,
  );
  if (constraintResult.error) {
    return {
      error: 'Set the city boundary before searching Google for places.',
      status: 409,
      code: 'RICH_LOCATION_CITY_CONSTRAINTS_REQUIRED',
    };
  }
  return { tenant: tenantResult.tenant, constraints: constraintResult.constraints };
}

/**
 * Google suggestions for a reviewer typing a place. Biased toward the city but
 * not restricted to it, so an out-of-scope listing can still be inspected.
 */
async function searchReviewPlaces(req, options = {}) {
  const context = await reviewerSearchContext(req, options.tenantKey);
  if (context.error) return context;
  const query = trimString(options.query);
  if (query.length < 2 || query.length > 200) {
    return {
      error: 'Search must be between 2 and 200 characters.',
      status: 400,
      code: 'LOCATION_SEARCH_QUERY_INVALID',
    };
  }
  try {
    const suggestions = await (options.googleAdapter || googleLocationService)
      .autocompletePlaces(query, {
        languageCode: 'en',
        regionCode: context.constraints.countryCode,
        includedRegionCodes: [context.constraints.countryCode],
        locationBias: autocompleteBias(context.constraints),
      });
    return { data: { suggestions } };
  } catch (error) {
    return providerError(error, 'Google suggestions are temporarily unavailable.');
  }
}

/** Resolve a typed-in Google place into the same shape as a backfill match. */
async function resolveReviewPlace(req, options = {}) {
  const context = await reviewerSearchContext(req, options.tenantKey);
  if (context.error) return context;
  const placeId = trimString(options.placeId);
  if (!placeId) {
    return { error: 'placeId is required.', status: 400, code: 'GOOGLE_PLACE_ID_INVALID' };
  }
  try {
    const canonical = await (options.googleAdapter || googleLocationService)
      .fetchPlaceDetails(placeId, { languageCode: 'en' });
    if (!canonical || canonical.resolutionStatus !== 'resolved') {
      return {
        error: 'Google could not resolve that place.',
        status: 422,
        code: 'RICH_LOCATION_UNRESOLVED',
      };
    }
    const now = options.now ? new Date(options.now) : new Date();
    const place = resolvedPhysicalLocation(
      canonical,
      trimString(options.originalInput) || canonical.formattedAddress,
      now,
    );
    const scope = preciseLocationInScope(place, context.constraints);
    return {
      data: {
        place,
        inScope: scope.ok,
        ...(scope.ok ? {} : { scopeReason: scope.reason }),
      },
    };
  } catch (error) {
    return providerError(error, 'Google could not load that place right now.');
  }
}

async function listLocationMemories(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;
  const { tenantKey } = tenantResult.tenant;
  const db = await connectToDatabase(tenantKey);
  const query = { tenantKey };
  const search = locationMatchKey(options.query);
  if (search) {
    query.matchKey = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
  }
  const memories = await memoryModel(db, tenantKey)
    .find(query)
    .sort({ updatedAt: -1 })
    .limit(Math.min(Math.max(Number(options.limit) || 100, 1), MEMORY_LIST_LIMIT))
    .lean();
  return { data: { memories: memories.map(serializeMemory) } };
}

async function forgetLocationMemory(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;
  const memoryId = trimString(options.memoryId);
  if (!/^[a-f0-9]{24}$/i.test(memoryId)) {
    return { error: 'A valid memoryId is required.', status: 400, code: 'MEMORY_ID_INVALID' };
  }
  const { tenantKey } = tenantResult.tenant;
  const db = await connectToDatabase(tenantKey);
  const deleted = await memoryModel(db, tenantKey)
    .findOneAndDelete({ _id: memoryId, tenantKey })
    .lean();
  if (!deleted) {
    return { error: 'Remembered location not found.', status: 404, code: 'MEMORY_NOT_FOUND' };
  }
  return { data: { memory: serializeMemory(deleted) } };
}

module.exports = {
  listLocationReviewCandidates,
  reviewLocationCandidate,
  applyToMatchingEvents,
  searchReviewPlaces,
  resolveReviewPlace,
  listLocationMemories,
  forgetLocationMemory,
  buildReviewMutation,
  serializeCandidate,
  reviewerFrom,
  reviewExplanation,
  REVIEW_REASON_COPY,
};
