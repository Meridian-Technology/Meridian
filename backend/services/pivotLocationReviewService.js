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

function serializeCandidate(event) {
  const pivot = event.customFields?.pivot || {};
  return {
    eventId: String(event._id),
    name: event.name,
    legacyLocation: event.location || '',
    rawLocationText: rawJustGoLocationText({
      rawLocationText: pivot.rawLocationText,
      richLocation: event.richLocation,
      location: event.location,
    }),
    richLocation: clone(event.richLocation) || null,
    candidateMatches: clone(pivot.locationReview?.candidateMatches) || [],
    review: clone(pivot.locationReview) || null,
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
  const query = {
    isDeleted: { $ne: true },
    'customFields.pivot.locationReview.status': status,
  };
  const events = await Event.find(query)
    .select('name location richLocation customFields.pivot')
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
};
