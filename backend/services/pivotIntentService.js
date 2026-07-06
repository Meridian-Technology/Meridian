const mongoose = require('mongoose');
const getModels = require('./getModelService');
const {
  getPilotWindow,
  resolveDisplayHost,
  PIVOT_EVENT_STATUSES,
} = require('./pivotFeedService');
const { toIsoWeek, isValidIsoWeek } = require('../utilities/pivotIsoWeek');

const FEED_ACTION_TO_STATUS = {
  interested: 'interested',
  pass: 'passed',
};

const RECAP_STATUSES = ['interested', 'registered'];
const RECAP_EVENT_FIELDS =
  'name description location start_time end_time externalLink type image customFields.pivot';

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

/**
 * Loads a published Pivot catalog event by id, enforcing the same visibility
 * filters as the feed (never campus RSVP rows). Optionally enforces the active
 * pilot window for swipe actions.
 */
async function findPublishedPivotEvent(req, eventId, { now, requireWindow } = {}) {
  const { Event } = getModels(req, 'Event');

  const query = {
    _id: eventId,
    'customFields.pivot.ingestStatus': 'published',
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
    'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
  };

  if (requireWindow) {
    const { windowStart, windowEnd } = getPilotWindow(now);
    query.start_time = { $gte: windowStart, $lt: windowEnd };
  }

  return Event.findOne(query)
    .select('start_time end_time externalLink customFields.pivot')
    .lean();
}

async function upsertIntent(req, { userId, eventId, status, batchWeek }) {
  const { PivotEventIntent } = getModels(req, 'PivotEventIntent');

  const doc = await PivotEventIntent.findOneAndUpdate(
    { userId, eventId },
    { $set: { status, batchWeek } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return doc;
}

async function recordFeedAction(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const eventId = String(body.eventId || '').trim();
  const action = String(body.action || '').trim();

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return {
      error: 'A valid eventId is required.',
      status: 400,
      code: 'INVALID_EVENT_ID',
    };
  }

  const status = FEED_ACTION_TO_STATUS[action];
  if (!status) {
    return {
      error: "action must be 'interested' or 'pass'.",
      status: 400,
      code: 'INVALID_ACTION',
    };
  }

  const event = await findPublishedPivotEvent(req, eventId, {
    now: body.now,
    requireWindow: true,
  });
  if (!event) {
    return {
      error: 'Event is not an active Pivot catalog event.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }

  const batchWeek = event.customFields?.pivot?.batchWeek || toIsoWeek();
  const doc = await upsertIntent(req, { userId, eventId, status, batchWeek });

  return {
    data: {
      eventId: String(doc.eventId),
      status: doc.status,
      batchWeek: doc.batchWeek,
    },
  };
}

async function recordExternalOpen(req, rawEventId, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const eventId = String(rawEventId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return {
      error: 'A valid eventId is required.',
      status: 400,
      code: 'INVALID_EVENT_ID',
    };
  }

  const event = await findPublishedPivotEvent(req, eventId);
  if (!event) {
    return {
      error: 'Event is not an active Pivot catalog event.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }

  const batchWeek = event.customFields?.pivot?.batchWeek || toIsoWeek();
  const openedAt = body.openedExternalAt
    ? new Date(body.openedExternalAt)
    : new Date();
  const externalOpenAt = Number.isNaN(openedAt.getTime()) ? new Date() : openedAt;

  const { PivotEventIntent } = getModels(req, 'PivotEventIntent');

  // Opening tickets is a stronger signal than passing, so a brand-new row lands
  // as `interested`; an existing `interested`/`registered` row keeps its status.
  const doc = await PivotEventIntent.findOneAndUpdate(
    { userId, eventId },
    {
      $set: { externalOpenAt },
      $inc: { externalOpenCount: 1 },
      $setOnInsert: { status: 'interested', batchWeek },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    data: {
      eventId: String(doc.eventId),
      status: doc.status,
      batchWeek: doc.batchWeek,
      externalOpenCount: doc.externalOpenCount,
      externalOpenAt: doc.externalOpenAt,
    },
  };
}

async function confirmRegistered(req, rawEventId) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const eventId = String(rawEventId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return {
      error: 'A valid eventId is required.',
      status: 400,
      code: 'INVALID_EVENT_ID',
    };
  }

  const event = await findPublishedPivotEvent(req, eventId);
  if (!event) {
    return {
      error: 'Event is not an active Pivot catalog event.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }

  const batchWeek = event.customFields?.pivot?.batchWeek || toIsoWeek();
  const doc = await upsertIntent(req, {
    userId,
    eventId,
    status: 'registered',
    batchWeek,
  });

  return {
    data: {
      eventId: String(doc.eventId),
      status: doc.status,
      batchWeek: doc.batchWeek,
    },
  };
}

function serializeRecapEvent(event, userIntent) {
  const pivot = event.customFields?.pivot || {};
  const coverImageUrl =
    typeof event.image === 'string' && event.image.trim() ? event.image.trim() : null;

  return {
    _id: String(event._id),
    name: event.name,
    description: event.description,
    location: event.location,
    start_time: event.start_time,
    end_time: event.end_time,
    externalLink: event.externalLink,
    type: event.type,
    tags: Array.isArray(pivot.tags) ? pivot.tags : [],
    ...(coverImageUrl ? { coverImageUrl } : {}),
    displayHost: resolveDisplayHost(pivot),
    userIntent,
  };
}

async function getWeekRecap(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const now = options.now || new Date();
  const batchWeek = options.batchWeek?.trim() || toIsoWeek(now);
  if (options.batchWeek && !isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const { PivotEventIntent, Event } = getModels(req, 'PivotEventIntent', 'Event');

  const intents = await PivotEventIntent.find({
    userId,
    batchWeek,
    status: { $in: RECAP_STATUSES },
  })
    .select('eventId status')
    .lean();

  if (!intents.length) {
    return { data: { batchWeek, events: [] } };
  }

  const intentByEvent = new Map(
    intents.map((intent) => [String(intent.eventId), intent.status]),
  );
  const eventIds = [...intentByEvent.keys()];

  const events = await Event.find({
    _id: { $in: eventIds },
    'customFields.pivot.ingestStatus': 'published',
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
    'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
  })
    .select(RECAP_EVENT_FIELDS)
    .sort({ start_time: 1 })
    .lean();

  const recapEvents = events
    .filter((event) => resolveDisplayHost(event.customFields?.pivot))
    .map((event) =>
      serializeRecapEvent(event, intentByEvent.get(String(event._id)) || null),
    );

  return { data: { batchWeek, events: recapEvents } };
}

async function resetWeekActions(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const now = options.now || new Date();
  const batchWeek = options.batchWeek?.trim() || toIsoWeek(now);
  if (options.batchWeek && !isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const { PivotEventIntent } = getModels(req, 'PivotEventIntent');

  // Match getWeekRecap: intents are keyed by batchWeek on the intent row, not
  // the feed event pool (registered events can sit outside the pilot window).
  const result = await PivotEventIntent.deleteMany({
    userId,
    batchWeek,
  });

  return {
    data: {
      batchWeek,
      deletedCount: result.deletedCount ?? 0,
    },
  };
}

module.exports = {
  recordFeedAction,
  recordExternalOpen,
  confirmRegistered,
  getWeekRecap,
  resetWeekActions,
  findPublishedPivotEvent,
  serializeRecapEvent,
};
