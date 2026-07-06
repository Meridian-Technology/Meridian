const getGlobalModels = require('./getGlobalModelService');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');

function serializeLabNotes(doc) {
  if (!doc) {
    return {
      batchWeek: null,
      notes: '',
      updatedBy: null,
      updatedAt: null,
    };
  }

  return {
    batchWeek: doc.batchWeek,
    notes: doc.notes || '',
    updatedBy: doc.updatedBy || null,
    updatedAt: doc.updatedAt || null,
  };
}

async function getInterviewNotes(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const { batchWeek } = normalized;
  const { PivotLabNotes } = getGlobalModels(req, 'PivotLabNotes');
  const doc = await PivotLabNotes.findOne({ batchWeek }).lean();

  return {
    data: serializeLabNotes(doc ? { ...doc, batchWeek } : { batchWeek, notes: '' }),
  };
}

async function saveInterviewNotes(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const notes = typeof options.notes === 'string' ? options.notes : '';
  const updatedBy =
    req.user?.email ||
    req.user?.globalUserId ||
    req.user?.userId ||
    null;

  const { batchWeek } = normalized;
  const { PivotLabNotes } = getGlobalModels(req, 'PivotLabNotes');
  const doc = await PivotLabNotes.findOneAndUpdate(
    { batchWeek },
    { notes, updatedBy },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return { data: serializeLabNotes(doc) };
}

module.exports = {
  getInterviewNotes,
  saveInterviewNotes,
  serializeLabNotes,
};
