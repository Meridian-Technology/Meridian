const mongoose = require('mongoose');
const getModels = require('./getModelService');
const {
  getFeedPilotWindowFilter,
  resolveDisplayHost,
  serializePivotFeedEvent,
  loadFriendSocial,
  PIVOT_EVENT_STATUSES,
} = require('./pivotFeedService');
const { toIsoWeek, isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const { logPivot, pivotRequestContext } = require('../utilities/pivotLogger');
const {
  normalizePivotTimeSlots,
  findTimeSlotById,
  eventHasTimeSlots,
} = require('../utilities/pivotTimeSlots');

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

  const baseQuery = {
    _id: eventId,
    'customFields.pivot.ingestStatus': 'published',
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
    'customFields.pivot.host.name': { $exists: true, $nin: [null, ''] },
  };

  const effectiveNow = now ? new Date(now) : new Date();
  const query = requireWindow
    ? { $and: [baseQuery, getFeedPilotWindowFilter(effectiveNow)] }
    : baseQuery;

  return Event.findOne(query)
    .select('start_time end_time externalLink customFields.pivot')
    .lean();
}

async function upsertIntent(req, { userId, eventId, status, batchWeek, timeSlotId }) {
  const { PivotEventIntent } = getModels(req, 'PivotEventIntent');

  const update = { status, batchWeek };
  if (timeSlotId !== undefined) {
    update.timeSlotId = timeSlotId || null;
  }

  const doc = await PivotEventIntent.findOneAndUpdate(
    { userId, eventId },
    { $set: update },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return doc;
}

function resolveRegisteredTimeSlotId(event, requestedTimeSlotId) {
  const pivot = event.customFields?.pivot;
  if (!eventHasTimeSlots(pivot)) {
    return { timeSlotId: null };
  }

  const slots = normalizePivotTimeSlots(pivot?.timeSlots);
  const trimmed = typeof requestedTimeSlotId === 'string' ? requestedTimeSlotId.trim() : '';

  if (slots.length === 1) {
    return { timeSlotId: trimmed || slots[0].id };
  }

  if (!trimmed) {
    return {
      error: 'A showtime is required for this event.',
      status: 400,
      code: 'TIME_SLOT_REQUIRED',
    };
  }

  if (!findTimeSlotById(pivot, trimmed)) {
    return {
      error: 'Invalid showtime for this event.',
      status: 400,
      code: 'INVALID_TIME_SLOT',
    };
  }

  return { timeSlotId: trimmed };
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
  const doc = await upsertIntent(req, {
    userId,
    eventId,
    status,
    batchWeek,
    timeSlotId: null,
  });

  logPivot('info', 'feed action recorded', {
    ...pivotRequestContext(req),
    eventId,
    status: doc.status,
    batchWeek: doc.batchWeek,
    action,
  });

  return {
    data: {
      eventId: String(doc.eventId),
      status: doc.status,
      batchWeek: doc.batchWeek,
      timeSlotId: doc.timeSlotId || null,
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

  logPivot('info', 'external ticket open recorded', {
    ...pivotRequestContext(req),
    eventId,
    status: doc.status,
    externalOpenCount: doc.externalOpenCount,
    batchWeek: doc.batchWeek,
  });

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

async function confirmRegistered(req, rawEventId, body = {}) {
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

  const slotResolution = resolveRegisteredTimeSlotId(event, body.timeSlotId);
  if (slotResolution.error) {
    return slotResolution;
  }

  const batchWeek = event.customFields?.pivot?.batchWeek || toIsoWeek();
  const doc = await upsertIntent(req, {
    userId,
    eventId,
    status: 'registered',
    batchWeek,
    timeSlotId: slotResolution.timeSlotId,
  });

  logPivot('info', 'registration confirmed', {
    ...pivotRequestContext(req),
    eventId,
    batchWeek: doc.batchWeek,
    timeSlotId: doc.timeSlotId || null,
  });

  return {
    data: {
      eventId: String(doc.eventId),
      status: doc.status,
      batchWeek: doc.batchWeek,
      timeSlotId: doc.timeSlotId || null,
    },
  };
}

function serializeRecapEvent(event, intentRow, extras = {}) {
  const pivot = event.customFields?.pivot || {};
  const status =
    intentRow && typeof intentRow === 'object' ? intentRow.status : intentRow;
  const userTimeSlotId =
    (intentRow && typeof intentRow === 'object' ? intentRow.timeSlotId : null) ||
    extras.userTimeSlotId ||
    null;

  return serializePivotFeedEvent(event, {
    displayHost: resolveDisplayHost(pivot),
    userIntent: status || null,
    userTimeSlotId,
    socialByTimeSlot: extras.socialByTimeSlot || new Map(),
    friendsInterested: extras.friendsInterested || [],
    friendsGoing: extras.friendsGoing || [],
    friendsInterestedCount: extras.friendsInterestedCount || 0,
    friendsGoingCount: extras.friendsGoingCount || 0,
  });
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
    .select('eventId status timeSlotId')
    .lean();

  if (!intents.length) {
    return { data: { batchWeek, events: [] } };
  }

  const intentByEvent = new Map(
    intents.map((intent) => [
      String(intent.eventId),
      { status: intent.status, timeSlotId: intent.timeSlotId || null },
    ]),
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

  const { socialByEvent, socialByEventAndSlot } = await loadFriendSocial(
    req,
    userId,
    eventIds,
  );

  const recapEvents = events
    .filter((event) => resolveDisplayHost(event.customFields?.pivot))
    .map((event) => {
      const id = String(event._id);
      const social = socialByEvent.get(id) || {
        friendsInterested: [],
        friendsGoing: [],
        friendInterestedCount: 0,
        friendRegisteredCount: 0,
      };
      const normalizedSlots = normalizePivotTimeSlots(
        event.customFields?.pivot?.timeSlots,
      );
      const socialByTimeSlot = new Map();
      for (const slot of normalizedSlots) {
        const slotSocial = socialByEventAndSlot.get(`${id}:${slot.id}`);
        if (slotSocial) {
          socialByTimeSlot.set(slot.id, slotSocial);
        }
      }

      return serializeRecapEvent(event, intentByEvent.get(id), {
        socialByTimeSlot,
        friendsInterested: social.friendsInterested,
        friendsGoing: social.friendsGoing,
        friendsInterestedCount: social.friendInterestedCount || 0,
        friendsGoingCount: social.friendRegisteredCount || 0,
      });
    });

  logPivot('info', 'week recap built', {
    ...pivotRequestContext(req),
    batchWeek,
    intentCount: intents.length,
    eventCount: recapEvents.length,
  });

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
  resolveRegisteredTimeSlotId,
};
