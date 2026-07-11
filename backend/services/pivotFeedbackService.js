const mongoose = require('mongoose');
const getModels = require('./getModelService');
const FeedbackService = require('./feedbackService');
const {
  findPublishedPivotEvent,
  serializeRecapEvent,
} = require('./pivotIntentService');
const { resolveDisplayHost, PIVOT_EVENT_STATUSES } = require('./pivotFeedService');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');

const PIVOT_EVENT_FEATURE = 'pivot_event';
const RECAP_EVENT_FIELDS =
  'name description location start_time end_time externalLink type customFields.pivot';

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function serializePendingEvent(event, userIntent) {
  const base = serializeRecapEvent(event, userIntent);
  return {
    _id: base._id,
    name: base.name,
    end_time: base.end_time,
    displayHost: base.displayHost,
    batchWeek: event.customFields?.pivot?.batchWeek || null,
  };
}

async function getPendingEventFeedback(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const now = options.now || new Date();
  const { PivotEventIntent, Event, UniversalFeedback } = getModels(
    req,
    'PivotEventIntent',
    'Event',
    'UniversalFeedback',
  );

  const intents = await PivotEventIntent.find({
    userId,
    status: 'registered',
  })
    .select('eventId')
    .lean();

  if (!intents.length) {
    return { data: { events: [] } };
  }

  const eventIds = intents.map((intent) => intent.eventId);

  const events = await Event.find({
    _id: { $in: eventIds },
    end_time: { $lt: now },
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
    'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
  })
    .select(RECAP_EVENT_FIELDS)
    .sort({ end_time: 1 })
    .lean();

  const eligible = events.filter((event) => resolveDisplayHost(event.customFields?.pivot));
  if (!eligible.length) {
    return { data: { events: [] } };
  }

  const eligibleIds = eligible.map((event) => event._id);
  const submitted = await UniversalFeedback.find({
    user: userId,
    feature: PIVOT_EVENT_FEATURE,
    processId: { $in: eligibleIds },
  })
    .select('processId')
    .lean();

  const submittedIds = new Set(submitted.map((row) => String(row.processId)));
  const pending = eligible.filter((event) => !submittedIds.has(String(event._id)));

  return {
    data: {
      events: pending.map((event) => serializePendingEvent(event, 'registered')),
    },
  };
}

async function submitEventFeedback(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const eventId = String(body.eventId || '').trim();
  const rating = body.rating;
  const comment =
    typeof body.comment === 'string' ? body.comment.trim() : undefined;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return {
      error: 'A valid eventId is required.',
      status: 400,
      code: 'INVALID_EVENT_ID',
    };
  }

  const ratingNumber = Number(rating);
  if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) {
    return {
      error: 'rating must be an integer from 1 to 5.',
      status: 400,
      code: 'INVALID_RATING',
    };
  }

  const now = body.now || new Date();
  const event = await findPublishedPivotEvent(req, eventId);
  if (!event) {
    return {
      error: 'Event is not an active Pivot catalog event.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }

  if (!event.end_time || new Date(event.end_time) >= now) {
    return {
      error: 'Feedback is only available after the event ends.',
      status: 403,
      code: 'EVENT_NOT_ENDED',
    };
  }

  const { PivotEventIntent } = getModels(req, 'PivotEventIntent');
  const intent = await PivotEventIntent.findOne({
    userId,
    eventId,
    status: 'registered',
  }).lean();

  if (!intent) {
    return {
      error: 'Only users who confirmed a ticket can leave feedback.',
      status: 403,
      code: 'NOT_REGISTERED',
    };
  }

  const responses = { rating: ratingNumber };
  if (comment) {
    responses.comment = comment;
  }

  const batchWeek = event.customFields?.pivot?.batchWeek || intent.batchWeek || null;
  const metadata = { batchWeek, source: 'pivot_mobile' };

  try {
    const feedbackService = new FeedbackService(req);
    await feedbackService.ensurePivotEventFeedbackConfig(userId);
    const feedback = await feedbackService.submitFeedback(
      userId,
      PIVOT_EVENT_FEATURE,
      eventId,
      responses,
      metadata,
    );

    return {
      data: {
        eventId: String(feedback.processId),
        rating: ratingNumber,
        submittedAt: feedback.submittedAt,
      },
    };
  } catch (err) {
    if (err.message?.includes('No feedback configuration')) {
      return {
        error: 'Pivot event feedback is not configured for this tenant.',
        status: 503,
        code: 'FEEDBACK_NOT_CONFIGURED',
      };
    }
    if (err.message?.includes('Validation errors')) {
      return {
        error: err.message,
        status: 400,
        code: 'VALIDATION_ERROR',
      };
    }
    throw err;
  }
}

async function listUserPivotEventFeedback(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 50);
  const { UniversalFeedback, Event } = getModels(req, 'UniversalFeedback', 'Event');

  const rows = await UniversalFeedback.find({
    user: userId,
    feature: PIVOT_EVENT_FEATURE,
  })
    .sort({ submittedAt: -1 })
    .limit(limit)
    .lean();

  if (!rows.length) {
    return { data: { feedback: [] } };
  }

  const eventIds = rows.map((row) => row.processId);
  const events = await Event.find({ _id: { $in: eventIds } })
    .select('name customFields.pivot.host')
    .lean();
  const eventById = new Map(events.map((event) => [String(event._id), event]));

  const feedback = rows.map((row) => {
    const event = eventById.get(String(row.processId));
    const hostName = event?.customFields?.pivot?.host?.name || null;
    return {
      eventId: String(row.processId),
      eventName: event?.name || null,
      hostName,
      rating: row.responses?.rating ?? null,
      comment: row.responses?.comment ?? null,
      batchWeek: row.metadata?.batchWeek ?? null,
      submittedAt: row.submittedAt,
    };
  });

  return { data: { feedback } };
}

module.exports = {
  getPendingEventFeedback,
  submitEventFeedback,
  listUserPivotEventFeedback,
  PIVOT_EVENT_FEATURE,
};
