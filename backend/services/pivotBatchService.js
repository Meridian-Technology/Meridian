const getModels = require('./getModelService');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const pivotBatchSchema = require('../schemas/pivotBatch');

const PIVOT_BATCH_STATUSES = pivotBatchSchema.PIVOT_BATCH_STATUSES;
const DEFAULT_TARGET_EVENT_COUNT = 40;

function invalidBatchWeek() {
  return {
    error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
    status: 400,
    code: 'INVALID_BATCH_WEEK',
  };
}

/**
 * Upsert a PivotBatch for the city DB on first curation / release activity.
 * Call with `{ db }` after `connectToDatabase(tenantKey)` (or mobile `req`).
 *
 * @param {{ db: import('mongoose').Connection }} reqLike
 * @param {{ batchWeek: string, status?: string, targetEventCount?: number }} options
 */
async function ensurePivotBatch(reqLike, options = {}) {
  const batchWeek = String(options.batchWeek || '').trim();
  if (!isValidIsoWeek(batchWeek)) {
    return invalidBatchWeek();
  }

  const status = options.status || 'curating';
  if (!PIVOT_BATCH_STATUSES.includes(status)) {
    return {
      error: 'status must be curating, ready, or released.',
      status: 400,
      code: 'INVALID_BATCH_STATUS',
    };
  }

  const { PivotBatch } = getModels(reqLike, 'PivotBatch');
  const setOnInsert = {
    batchWeek,
    status,
    targetEventCount:
      options.targetEventCount != null
        ? options.targetEventCount
        : DEFAULT_TARGET_EVENT_COUNT,
    releasedAt: null,
    releasedBy: null,
  };

  const doc = await PivotBatch.findOneAndUpdate(
    { batchWeek },
    { $setOnInsert: setOnInsert },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return { data: serializePivotBatch(doc) };
}

/**
 * @param {{ db: import('mongoose').Connection }} reqLike
 * @param {string} batchWeek
 */
async function getPivotBatch(reqLike, batchWeek) {
  const week = String(batchWeek || '').trim();
  if (!isValidIsoWeek(week)) {
    return invalidBatchWeek();
  }

  const { PivotBatch } = getModels(reqLike, 'PivotBatch');
  const doc = await PivotBatch.findOne({ batchWeek: week }).lean();
  if (!doc) {
    return { data: null };
  }
  return { data: serializePivotBatch(doc) };
}

function serializePivotBatch(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    batchWeek: doc.batchWeek,
    status: doc.status,
    targetEventCount: doc.targetEventCount ?? DEFAULT_TARGET_EVENT_COUNT,
    releasedAt: doc.releasedAt || null,
    releasedBy: doc.releasedBy || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

module.exports = {
  DEFAULT_TARGET_EVENT_COUNT,
  ensurePivotBatch,
  getPivotBatch,
  serializePivotBatch,
  PIVOT_BATCH_STATUSES,
};
