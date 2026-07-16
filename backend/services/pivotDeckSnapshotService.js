const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { logPivot, pivotRequestContext } = require('../utilities/pivotLogger');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');

const DECK_SNAPSHOT_ADMIN_ROLES = new Set(['admin', 'developer']);

function normalizeDeckSnapshotRefresh(rawRefresh, userRoles = []) {
  const wantsRefresh =
    rawRefresh === true ||
    rawRefresh === 1 ||
    rawRefresh === '1' ||
    String(rawRefresh || '').trim().toLowerCase() === 'true';
  if (!wantsRefresh) {
    return false;
  }

  const roles = Array.isArray(userRoles) ? userRoles : [];
  return roles.some((role) => DECK_SNAPSHOT_ADMIN_ROLES.has(String(role).trim()));
}

function normalizeOrderedEventIds(orderedEventIds) {
  if (!Array.isArray(orderedEventIds) || !orderedEventIds.length) {
    return [];
  }

  return orderedEventIds.map((rawId) => {
    const id = String(rawId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error(`Invalid orderedEventId: ${rawId}`);
    }
    return new mongoose.Types.ObjectId(id);
  });
}

function serializePivotDeckSnapshot(doc) {
  if (!doc) {
    return null;
  }

  return {
    _id: String(doc._id),
    userId: String(doc.userId),
    batchWeek: doc.batchWeek,
    orderedEventIds: (doc.orderedEventIds || []).map((id) => String(id)),
    rankerVersion: doc.rankerVersion,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function upsertPivotDeckSnapshot(req, payload = {}) {
  const userId = payload.userId || req.user?.userId;
  if (!userId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'UNAUTHORIZED',
    };
  }

  const batchWeek = String(payload.batchWeek || '').trim();
  if (!batchWeek || !isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const rankerVersion = String(payload.rankerVersion || '').trim();
  if (!rankerVersion) {
    return {
      error: 'rankerVersion is required.',
      status: 400,
      code: 'INVALID_RANKER_VERSION',
    };
  }

  let orderedEventIds;
  try {
    orderedEventIds = normalizeOrderedEventIds(payload.orderedEventIds);
  } catch (error) {
    return {
      error: error.message,
      status: 400,
      code: 'INVALID_ORDERED_EVENT_IDS',
    };
  }

  const forceRefresh = Boolean(payload.forceRefresh);
  const { PivotDeckSnapshot } = getModels(req, 'PivotDeckSnapshot');
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const existing = await PivotDeckSnapshot.findOne({
    userId: userObjectId,
    batchWeek,
  }).lean();

  if (existing && !forceRefresh) {
    return {
      data: serializePivotDeckSnapshot(existing),
      skipped: true,
    };
  }

  const doc = await PivotDeckSnapshot.findOneAndUpdate(
    { userId: userObjectId, batchWeek },
    {
      $set: {
        orderedEventIds,
        rankerVersion,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  logPivot('info', 'deck snapshot upserted', {
    ...pivotRequestContext(req),
    batchWeek,
    orderedCount: orderedEventIds.length,
    rankerVersion,
    created: !existing,
    refreshed: Boolean(existing && forceRefresh),
  });

  return {
    data: serializePivotDeckSnapshot(doc),
    skipped: false,
    created: !existing,
    refreshed: Boolean(existing && forceRefresh),
  };
}

async function recordPivotDeckSnapshot(req, payload = {}) {
  try {
    return await upsertPivotDeckSnapshot(req, payload);
  } catch (error) {
    logPivot('error', 'deck snapshot write failed', {
      ...pivotRequestContext(req),
      batchWeek: payload.batchWeek,
      message: error.message,
    });
    return { error: error.message };
  }
}

module.exports = {
  normalizeDeckSnapshotRefresh,
  normalizeOrderedEventIds,
  serializePivotDeckSnapshot,
  upsertPivotDeckSnapshot,
  recordPivotDeckSnapshot,
  DECK_SNAPSHOT_ADMIN_ROLES,
};
