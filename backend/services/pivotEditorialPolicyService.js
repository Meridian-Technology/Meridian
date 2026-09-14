const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { ensurePivotBatch, serializePivotBatch } = require('./pivotBatchService');
const { mergePivotDeckConfig } = require('../utilities/pivotDeckConfig');
const { actorFromReq } = require('../utilities/pivotEditorialPolicy');

function normalizeEventIds(raw) {
  if (!Array.isArray(raw)) {
    return { error: 'eventIds must be an array.', status: 400, code: 'INVALID_EVENT_IDS' };
  }
  const ids = [];
  const seen = new Set();
  for (const value of raw) {
    const id = String(value || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { error: `Invalid eventId: ${id || '(empty)'}.`, status: 400, code: 'INVALID_EVENT_IDS' };
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return { eventIds: ids };
}

async function updateBatchSelectionPolicy(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;
  const weekResult = normalizeBatchWeek(options.batchWeek, options.now);
  if (weekResult.error) return weekResult;

  const mode = String(options.mode || '').trim().toLowerCase();
  if (!['personalized', 'editorial'].includes(mode)) {
    return {
      error: 'mode must be personalized or editorial.',
      status: 400,
      code: 'INVALID_SELECTION_MODE',
    };
  }

  const idsResult = normalizeEventIds(options.eventIds || []);
  if (idsResult.error) return idsResult;
  const eventIds = mode === 'editorial' ? idsResult.eventIds : [];
  if (mode === 'editorial' && !eventIds.length) {
    return {
      error: 'Editorial mode requires at least one event.',
      status: 400,
      code: 'EDITORIAL_SET_REQUIRED',
    };
  }

  const deckConfig = mergePivotDeckConfig(tenantResult.tenant.pivotDeckConfig);
  if (eventIds.length > deckConfig.hardMax) {
    return {
      error: `Editorial mode supports at most ${deckConfig.hardMax} events for this city.`,
      status: 400,
      code: 'EDITORIAL_SET_TOO_LARGE',
    };
  }

  const db = await connectToDatabase(tenantResult.tenant.tenantKey);
  const tenantReq = { db };
  const { Event, PivotBatch } = getModels(tenantReq, 'Event', 'PivotBatch');
  if (eventIds.length) {
    const eligible = await Event.find({
      _id: { $in: eventIds },
      'customFields.pivot.batchWeek': weekResult.batchWeek,
      'customFields.pivot.ingestStatus': 'published',
      'customFields.pivot.rankingOverride.tier': { $ne: 'hidden' },
      isDeleted: { $ne: true },
    }).select('_id').lean();
    if (eligible.length !== eventIds.length) {
      return {
        error: 'Every editorial-set event must be published, visible in discovery, and belong to this batch week.',
        status: 400,
        code: 'INVALID_EDITORIAL_SET',
      };
    }
  }

  await ensurePivotBatch(tenantReq, { batchWeek: weekResult.batchWeek });
  const doc = await PivotBatch.findOneAndUpdate(
    { batchWeek: weekResult.batchWeek },
    {
      $set: {
        selectionPolicy: {
          mode,
          ...(eventIds.length ? { eventIds } : {}),
          updatedBy: actorFromReq(req),
          updatedAt: options.now || new Date(),
        },
      },
    },
    { new: true, runValidators: true },
  ).lean();

  return { data: { batch: serializePivotBatch(doc) } };
}

module.exports = { updateBatchSelectionPolicy, normalizeEventIds };
