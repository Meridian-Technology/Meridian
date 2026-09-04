const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { serializeLabEvent } = require('./pivotLabEventsService');
const { deletePivotCatalogEventsWithModels } = require('./pivotCatalogPurgeService');
const { unionHostIdentities } = require('../utilities/pivotHostIdentity');
const { uniqueOrganizerIds } = require('./pivotOrganizerResolveService');
const {
  unionPivotTimeSlots,
  slotFromStart,
  resolveEventEarliestStart,
  resolveEventLatestEnd,
} = require('../utilities/pivotTimeSlots');

const INGEST_RANK = Object.freeze({
  published: 3,
  staged: 2,
  draft: 1,
});

const INTENT_RANK = Object.freeze({
  registered: 2,
  interested: 1,
  passed: 0,
});

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pickRicherText(left, right) {
  const a = trimString(left);
  const b = trimString(right);
  if (!a) return b || '';
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function normalizeEventIds(raw) {
  if (!Array.isArray(raw) || raw.length < 2) {
    return {
      error: 'Select at least two catalog events to collapse into showtimes.',
      status: 400,
      code: 'EVENT_IDS_REQUIRED',
    };
  }

  const eventIds = [];
  const seen = new Set();
  for (const value of raw) {
    const id = String(value || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return {
        error: `Invalid eventId: ${id || '(empty)'}`,
        status: 400,
        code: 'INVALID_EVENT_IDS',
      };
    }
    if (seen.has(id)) continue;
    seen.add(id);
    eventIds.push(new mongoose.Types.ObjectId(id));
  }

  if (eventIds.length < 2) {
    return {
      error: 'Select at least two distinct catalog events to collapse into showtimes.',
      status: 400,
      code: 'EVENT_IDS_REQUIRED',
    };
  }

  return { eventIds };
}

function ingestRank(event) {
  return INGEST_RANK[event?.customFields?.pivot?.ingestStatus] || 0;
}

function slotsFromCatalogEvent(event) {
  const pivot = event?.customFields?.pivot || {};
  return unionPivotTimeSlots(
    pivot.timeSlots,
    [slotFromStart(event?.start_time, event?.end_time)],
  );
}

function pickSurvivorEvent(events, keepEventId) {
  if (keepEventId) {
    const preferred = events.find((event) => String(event._id) === String(keepEventId));
    if (preferred) return preferred;
  }

  return [...events].sort((left, right) => {
    const byStatus = ingestRank(right) - ingestRank(left);
    if (byStatus) return byStatus;
    const bySlots = slotsFromCatalogEvent(right).length - slotsFromCatalogEvent(left).length;
    if (bySlots) return bySlots;
    const leftStart = left.start_time ? new Date(left.start_time).getTime() : 0;
    const rightStart = right.start_time ? new Date(right.start_time).getTime() : 0;
    return leftStart - rightStart;
  })[0];
}

function serializeStoredSlots(slots) {
  return slots.map((slot) => ({
    id: slot.id,
    start_time: slot.start_time,
    ...(slot.end_time ? { end_time: slot.end_time } : {}),
    ...(slot.label ? { label: slot.label } : {}),
  }));
}

async function migrateAbsorbedIntents(PivotEventIntent, survivorId, absorbed, slotIdByEventId) {
  if (!PivotEventIntent) return { migrated: 0, merged: 0 };

  const absorbedIds = absorbed.map((event) => event._id);
  const intents = await PivotEventIntent.find({ eventId: { $in: absorbedIds } });
  let migrated = 0;
  let merged = 0;

  for (const intent of intents) {
    const slotId = trimString(intent.timeSlotId) || slotIdByEventId.get(String(intent.eventId)) || null;
    const existing = await PivotEventIntent.findOne({
      userId: intent.userId,
      eventId: survivorId,
    });

    if (existing) {
      const keepExisting = (INTENT_RANK[existing.status] || 0) >= (INTENT_RANK[intent.status] || 0);
      if (!keepExisting) existing.status = intent.status;
      if (!existing.timeSlotId && slotId) existing.timeSlotId = slotId;
      existing.externalOpenCount = (existing.externalOpenCount || 0) + (intent.externalOpenCount || 0);
      if (
        intent.externalOpenAt &&
        (!existing.externalOpenAt || intent.externalOpenAt > existing.externalOpenAt)
      ) {
        existing.externalOpenAt = intent.externalOpenAt;
      }
      await existing.save();
      await intent.deleteOne();
      merged += 1;
      continue;
    }

    intent.eventId = survivorId;
    if (!intent.timeSlotId && slotId) intent.timeSlotId = slotId;
    await intent.save();
    migrated += 1;
  }

  return { migrated, merged };
}

/**
 * Fold selected catalog rows into one event with `customFields.pivot.timeSlots`.
 * Extra rows are deleted after intents are pointed at the survivor.
 */
async function collapseCatalogEventsToShowtimes(req, options = {}) {
  const idsResult = normalizeEventIds(options.eventIds);
  if (idsResult.error) return idsResult;

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const db = await connectToDatabase(tenantKey);
  const models = getModels({ db }, 'Event', 'PivotEventIntent');
  const { Event, PivotEventIntent } = models;

  const events = await Event.find({
    _id: { $in: idsResult.eventIds },
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
  }).lean();

  if (events.length !== idsResult.eventIds.length) {
    return {
      error: 'One or more selected events were not found in this city catalog.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }

  const survivor = pickSurvivorEvent(events, options.keepEventId);
  const absorbed = events.filter((event) => String(event._id) !== String(survivor._id));
  const slots = unionPivotTimeSlots(...events.map((event) => slotsFromCatalogEvent(event)));

  if (slots.length < 2) {
    return {
      error: 'Those events share the same start time, so they cannot become showtimes. Delete the extra copy instead.',
      status: 400,
      code: 'NEED_DISTINCT_TIMES',
    };
  }

  const pivot = { ...(survivor.customFields?.pivot || {}) };
  const host = { ...(pivot.host || {}) };
  host.name = events.reduce((best, event) => pickRicherText(best, event.customFields?.pivot?.host?.name), host.name);
  host.imageUrl =
    host.imageUrl || events.find((event) => event.customFields?.pivot?.host?.imageUrl)?.customFields.pivot.host.imageUrl;
  host.profileUrl =
    host.profileUrl ||
    events.find((event) => event.customFields?.pivot?.host?.profileUrl)?.customFields.pivot.host.profileUrl;
  host.identities = unionHostIdentities(
    ...events.map((event) => event.customFields?.pivot?.host?.identities),
  );
  const organizerIds = uniqueOrganizerIds(
    ...events.map((event) => event.customFields?.pivot?.host?.organizerIds),
  );
  if (organizerIds.length) host.organizerIds = organizerIds;

  const earliest = resolveEventEarliestStart({ timeSlots: slots }, survivor.start_time);
  const latest = resolveEventLatestEnd({ timeSlots: slots }, survivor.end_time);
  const earliestEvent = [...events].sort((left, right) => {
    const leftStart = left.start_time ? new Date(left.start_time).getTime() : Infinity;
    const rightStart = right.start_time ? new Date(right.start_time).getTime() : Infinity;
    return leftStart - rightStart;
  })[0];
  pivot.host = host;
  pivot.batchWeek = earliestEvent?.customFields?.pivot?.batchWeek || pivot.batchWeek;
  pivot.timeSlots = serializeStoredSlots(slots);
  pivot.tags = [...new Set(events.flatMap((event) => event.customFields?.pivot?.tags || []))];
  pivot.duplicateRollup = {
    kind: 'showtime',
    count: events.length,
    collapsedEventIds: absorbed.map((event) => String(event._id)),
  };

  const updated = await Event.findByIdAndUpdate(
    survivor._id,
    {
      $set: {
        start_time: earliest || survivor.start_time,
        end_time: latest || survivor.end_time,
        description: events.reduce((best, event) => pickRicherText(best, event.description), ''),
        location: events.reduce((best, event) => pickRicherText(best, event.location), ''),
        image: survivor.image || events.find((event) => event.image)?.image || null,
        'customFields.pivot': pivot,
      },
    },
    { new: true, runValidators: true },
  ).lean();

  const slotIdByEventId = new Map(
    events.map((event) => {
      const fromStart = slotFromStart(event.start_time, event.end_time);
      return [String(event._id), fromStart?.id || null];
    }),
  );
  const intents = await migrateAbsorbedIntents(
    PivotEventIntent,
    survivor._id,
    absorbed,
    slotIdByEventId,
  );

  await deletePivotCatalogEventsWithModels(models, absorbed.map((event) => event._id));

  return {
    data: {
      event: serializeLabEvent(updated),
      collapsedCount: absorbed.length,
      showtimeCount: slots.length,
      intents,
    },
  };
}

module.exports = {
  collapseCatalogEventsToShowtimes,
  pickSurvivorEvent,
  slotsFromCatalogEvent,
  normalizeEventIds,
};
