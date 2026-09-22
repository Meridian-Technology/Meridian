const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { normalizeBatchWeek, rebuildWeeklySnapshot } = require('./pivotWeeklySnapshotService');
const {
  ensurePivotBatch,
  serializePivotBatch,
  DEFAULT_TARGET_EVENT_COUNT,
} = require('./pivotBatchService');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');
const { logPivot, pivotRequestContext } = require('../utilities/pivotLogger');
const { REVIEW_REASON_COPY } = require('./pivotLocationReviewService');
const { explainCoverImageSkip, partitionDocsByCoverProbe } = require('../utilities/pivotCoverImage');

const UNRELEASE_CONFIRM_TOKEN = 'UNRELEASE';
const STAGED_STATUS = 'staged';

function resolveReleasedBy(req) {
  return (
    (typeof req.user?.email === 'string' && req.user.email.trim()) ||
    (typeof req.user?.globalUserId === 'string' && req.user.globalUserId.trim()) ||
    (typeof req.user?.userId === 'string' && req.user.userId.trim()) ||
    'platform-admin'
  );
}

/**
 * Normalize optional eventIds body field.
 * @returns {{ eventIds: import('mongoose').Types.ObjectId[]|null } | { error: string, status: number, code: string }}
 */
function normalizeEventIds(raw) {
  if (raw === undefined || raw === null) {
    return { eventIds: null };
  }
  if (!Array.isArray(raw)) {
    return {
      error: 'eventIds must be an array of event id strings.',
      status: 400,
      code: 'INVALID_EVENT_IDS',
    };
  }
  if (!raw.length) {
    return {
      error: 'eventIds must be a non-empty array when provided.',
      status: 400,
      code: 'INVALID_EVENT_IDS',
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

  return { eventIds };
}

function catalogWeekBaseQuery(batchWeek) {
  return {
    'customFields.pivot.batchWeek': batchWeek,
    isDeleted: { $ne: true },
    'customFields.pivot': { $exists: true },
  };
}

const SKIP_SELECT = 'name isDeleted image customFields.pivot';

function tallySkipCodes(skipped) {
  const skippedByCode = {};
  for (const row of skipped) {
    const code = row.code || 'UNKNOWN';
    skippedByCode[code] = (skippedByCode[code] || 0) + 1;
  }
  return skippedByCode;
}

function explainReleaseSkip(doc, batchWeek) {
  if (!doc || doc.isDeleted) {
    return {
      code: 'NOT_FOUND',
      title: 'Event was not found in this week’s catalog',
      detail: 'It may have been deleted, or the id does not belong to this city week.',
    };
  }
  const pivot = doc.customFields?.pivot || {};
  if (pivot.batchWeek !== batchWeek) {
    return {
      code: 'WRONG_WEEK',
      title: 'This event is in a different catalog week',
      detail: pivot.batchWeek
        ? `It is assigned to ${pivot.batchWeek}, not ${batchWeek}.`
        : 'It has no catalog week assigned.',
    };
  }
  if (pivot.ingestStatus === PIVOT_FEED_INGEST_STATUS) {
    return {
      code: 'ALREADY_PUBLISHED',
      title: 'Already live',
      detail: 'This event is already published in the live feed.',
    };
  }
  if (pivot.ingestStatus !== STAGED_STATUS) {
    return {
      code: 'NOT_STAGED',
      title: 'Not staged',
      detail: pivot.ingestStatus
        ? `Status is ${pivot.ingestStatus}. Stage it before publishing.`
        : 'Stage this event before publishing it to the live feed.',
    };
  }
  if (pivot.locationReview?.status === 'needs_review') {
    const reason = String(pivot.locationReview.reason || '').trim() || 'manual_review';
    const copy = REVIEW_REASON_COPY[reason] || {
      title: 'Location needs a human decision',
      detail: 'Approve or correct the location before this event can go live.',
    };
    return {
      code: 'LOCATION_REVIEW',
      reason,
      title: copy.title,
      detail: copy.detail,
    };
  }
  const imageSkip = explainCoverImageSkip(doc.image);
  if (imageSkip) return imageSkip;
  return null;
}

async function collectReleasePlan(Event, { batchWeek, eventIds, fetchImpl }) {
  let rows;
  if (eventIds) {
    const docs = await Event.find({ _id: { $in: eventIds } })
      .select(SKIP_SELECT)
      .lean();
    const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
    rows = eventIds.map((id) => ({ eventId: id, doc: byId.get(String(id)) }));
  } else {
    const docs = await Event.find({
      ...catalogWeekBaseQuery(batchWeek),
      'customFields.pivot.ingestStatus': STAGED_STATUS,
    })
      .select(SKIP_SELECT)
      .lean();
    rows = docs.map((doc) => ({ eventId: doc._id, doc }));
  }

  const skipped = [];
  const probeCandidates = [];
  for (const { eventId, doc } of rows) {
    const skip = explainReleaseSkip(doc, batchWeek);
    if (skip) {
      skipped.push({
        eventId: String(eventId),
        name: doc?.name || null,
        ...skip,
      });
    } else {
      probeCandidates.push(doc);
    }
  }

  const probed = await partitionDocsByCoverProbe(probeCandidates, { fetchImpl });
  for (const { doc, skip } of probed.skipped) {
    skipped.push({
      eventId: String(doc._id),
      name: doc?.name || null,
      ...skip,
    });
  }

  return {
    skipped,
    eligibleIds: probed.eligible.map((doc) => doc._id),
  };
}

async function openTenantDb(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  return { db, school: tenantKey };
}

/**
 * Choice A release: flip staged → published for a city week.
 * Optional `eventIds` limits the flip (partial release). Omit to release all staged.
 *
 * @param {object} req — needs globalDb for optional snapshot rebuild
 * @param {{ tenantKey: string, batchWeek: string, eventIds?: string[], rebuildSnapshot?: boolean, now?: Date }} options
 */
async function releaseBatch(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const idsResult = normalizeEventIds(options.eventIds);
  if (idsResult.error) {
    return idsResult;
  }

  const { batchWeek } = normalized;
  const { tenant } = tenantResult;
  const tenantKey = tenant.tenantKey;
  const now = options.now || new Date();
  const releasedBy = resolveReleasedBy(req);

  const tenantReq = await openTenantDb(tenantKey);
  const { Event, PivotBatch } = getModels(tenantReq, 'Event', 'PivotBatch');

  const plan = await collectReleasePlan(Event, {
    batchWeek,
    eventIds: idsResult.eventIds,
    fetchImpl: options.fetchImpl,
  });
  const skipped = plan.skipped;
  const skippedCount = skipped.length;
  const skippedByCode = tallySkipCodes(skipped);

  let releasedCount = 0;
  if (plan.eligibleIds.length) {
    const updateResult = await Event.updateMany(
      { _id: { $in: plan.eligibleIds } },
      { $set: { 'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS } },
    );
    releasedCount = updateResult.modifiedCount ?? updateResult.nModified ?? 0;
  }

  await ensurePivotBatch(tenantReq, {
    batchWeek,
    status: 'curating',
    targetEventCount: DEFAULT_TARGET_EVENT_COUNT,
  });

  const batchDoc = await PivotBatch.findOneAndUpdate(
    { batchWeek },
    {
      $set: {
        status: 'released',
        releasedAt: now,
        releasedBy,
      },
    },
    { new: true, runValidators: true },
  ).lean();

  let snapshot = null;
  const shouldRebuild = options.rebuildSnapshot !== false;
  if (shouldRebuild && releasedCount > 0) {
    try {
      const snapResult = await rebuildWeeklySnapshot(req, { batchWeek, now });
      if (!snapResult.error) {
        snapshot = { rebuilt: true, batchWeek };
      } else {
        logPivot('warn', 'batch release snapshot rebuild failed', {
          ...pivotRequestContext(req),
          tenantKey,
          batchWeek,
          message: snapResult.error,
          code: snapResult.code,
        });
        snapshot = { rebuilt: false, error: snapResult.error, code: snapResult.code };
      }
    } catch (error) {
      logPivot('warn', 'batch release snapshot rebuild threw', {
        ...pivotRequestContext(req),
        tenantKey,
        batchWeek,
        message: error.message,
      });
      snapshot = { rebuilt: false, error: error.message };
    }
  }

  logPivot('info', 'batch released', {
    ...pivotRequestContext(req),
    tenantKey,
    batchWeek,
    releasedCount,
    skippedCount,
    skippedByCode,
    partial: Boolean(idsResult.eventIds),
    releasedBy,
  });

  if (releasedCount > 0) {
    try {
      const { enqueueEventDiscoveryOnCatalogPublish } = require('./meridianJobHandlers/eventDiscoveryEnqueue');
      await enqueueEventDiscoveryOnCatalogPublish(req, {
        tenantKey,
        batchWeek,
        now,
      });
    } catch (error) {
      logPivot('warn', 'event discovery enqueue on catalog publish failed', {
        ...pivotRequestContext(req),
        tenantKey,
        batchWeek,
        message: error.message,
      });
    }
  }

  return {
    data: {
      tenantKey,
      batchWeek,
      releasedCount,
      skippedCount,
      skippedByCode,
      skipped,
      batchStatus: batchDoc?.status || 'released',
      batch: serializePivotBatch(batchDoc),
      partial: Boolean(idsResult.eventIds),
      snapshot,
    },
  };
}

/**
 * Emergency pull-back: published → staged for a city week.
 * Requires typed confirm token `UNRELEASE` — users may have already swiped.
 *
 * Optional `eventIds` limits the pull-back (partial unrelease).
 *
 * @param {object} req
 * @param {{ tenantKey: string, batchWeek: string, confirm: string, eventIds?: string[], rebuildSnapshot?: boolean, now?: Date }} options
 */
async function unreleaseBatch(req, options = {}) {
  const confirm = String(options.confirm || '').trim();
  if (confirm !== UNRELEASE_CONFIRM_TOKEN) {
    return {
      error: `Type ${UNRELEASE_CONFIRM_TOKEN} to confirm. Unrelease pulls published events out of the live feed; users may have already swiped.`,
      status: 400,
      code: 'CONFIRMATION_REQUIRED',
    };
  }

  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const idsResult = normalizeEventIds(options.eventIds);
  if (idsResult.error) {
    return idsResult;
  }

  const { batchWeek } = normalized;
  const { tenant } = tenantResult;
  const tenantKey = tenant.tenantKey;
  const now = options.now || new Date();

  const tenantReq = await openTenantDb(tenantKey);
  const { Event, PivotBatch } = getModels(tenantReq, 'Event', 'PivotBatch');

  const match = {
    ...catalogWeekBaseQuery(batchWeek),
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
  };
  if (idsResult.eventIds) {
    match._id = { $in: idsResult.eventIds };
  }

  const updateResult = await Event.updateMany(match, {
    $set: { 'customFields.pivot.ingestStatus': STAGED_STATUS },
  });
  const unreleasedCount = updateResult.modifiedCount ?? updateResult.nModified ?? 0;

  let skippedCount = 0;
  if (idsResult.eventIds) {
    skippedCount = Math.max(0, idsResult.eventIds.length - unreleasedCount);
  }

  await ensurePivotBatch(tenantReq, {
    batchWeek,
    status: 'curating',
    targetEventCount: DEFAULT_TARGET_EVENT_COUNT,
  });

  const remainingPublished = await Event.countDocuments({
    ...catalogWeekBaseQuery(batchWeek),
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
  });

  const nextStatus = remainingPublished > 0 ? 'released' : 'curating';
  const batchSet =
    nextStatus === 'released'
      ? { status: 'released' }
      : { status: 'curating', releasedAt: null, releasedBy: null };

  const batchDoc = await PivotBatch.findOneAndUpdate(
    { batchWeek },
    { $set: batchSet },
    { new: true, runValidators: true },
  ).lean();

  let snapshot = null;
  const shouldRebuild = options.rebuildSnapshot !== false;
  if (shouldRebuild && unreleasedCount > 0) {
    try {
      const snapResult = await rebuildWeeklySnapshot(req, { batchWeek, now });
      if (!snapResult.error) {
        snapshot = { rebuilt: true, batchWeek };
      } else {
        snapshot = { rebuilt: false, error: snapResult.error, code: snapResult.code };
      }
    } catch (error) {
      snapshot = { rebuilt: false, error: error.message };
    }
  }

  logPivot('info', 'batch unreleased', {
    ...pivotRequestContext(req),
    tenantKey,
    batchWeek,
    unreleasedCount,
    skippedCount,
    remainingPublished,
    batchStatus: nextStatus,
    partial: Boolean(idsResult.eventIds),
  });

  return {
    data: {
      tenantKey,
      batchWeek,
      unreleasedCount,
      skippedCount,
      batchStatus: batchDoc?.status || nextStatus,
      batch: serializePivotBatch(batchDoc),
      remainingPublished,
      partial: Boolean(idsResult.eventIds),
      snapshot,
      warning:
        'Unrelease removes events from the live feed. Users who already swiped may retain intents for those events.',
    },
  };
}

module.exports = {
  releaseBatch,
  unreleaseBatch,
  UNRELEASE_CONFIRM_TOKEN,
  normalizeEventIds,
  resolveReleasedBy,
  explainReleaseSkip,
};
