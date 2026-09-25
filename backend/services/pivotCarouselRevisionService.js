/**
 * Immutable carousel revision history.
 *
 * Save snapshots are written after a compare-and-swap succeeds. Named
 * checkpoints copy the current head and do not advance it. Restore copies a
 * checkpoint onto a new head revision through the existing issue write.
 */

const getGlobalModels = require('./getGlobalModelService');
const { RETENTION } = require('../schemas/pivotCarouselRevision');

function fail(error, status, code, extra = {}) {
  return { error, status, code, ...extra };
}

function actorId(req) {
  return req.user?.globalUserId || req.user?.userId || null;
}

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function serializeCheckpoint(row) {
  const doc = row.toObject ? row.toObject() : row;
  return {
    id: String(doc._id),
    issueId: String(doc.issueId),
    accountId: String(doc.accountId),
    name: doc.name,
    headRevision: doc.headRevision,
    schemaVersion: doc.schemaVersion || 2,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy || null,
  };
}

async function recordHeadSnapshot(req, saved, meta = {}) {
  if (!saved?.document || (saved.schemaVersion || 1) !== 2) return null;
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  const row = await PivotCarouselRevision.create({
    issueId: saved._id,
    accountId: saved.accountId,
    headRevision: saved.revision,
    kind: 'save',
    schemaVersion: 2,
    document: saved.document,
    curation: saved.curation || null,
    sources: saved.sources || [],
    restoredFrom: meta.restoredFrom || null,
    createdBy: actorId(req),
  });
  await pruneSaveSnapshots(req, saved._id, saved.revision);
  return row;
}

async function pruneSaveSnapshots(req, issueId, currentRevision) {
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  const saves = await PivotCarouselRevision.find({ issueId, kind: 'save' })
    .sort({ createdAt: -1, _id: -1 })
    .select('_id headRevision')
    .lean();
  const keep = new Set();
  saves.forEach((row, index) => {
    if (index < RETENTION.autosaveSnapshotsPerIssue || row.headRevision === currentRevision) {
      keep.add(String(row._id));
    }
  });
  const drop = saves.filter((row) => !keep.has(String(row._id))).map((row) => row._id);
  if (drop.length) {
    await PivotCarouselRevision.deleteMany({ _id: { $in: drop }, kind: 'save' });
  }
  return { kept: keep.size, removed: drop.length };
}

async function pinExportRevision(req, deck, sourceRevision) {
  if (!deck?.document || (deck.schemaVersion || 1) !== 2) {
    return fail('Only an editable issue can be pinned for export.', 409, 'SCHEMA_VERSION_UNSUPPORTED');
  }
  if (!deck.accountId) return fail('This issue is not on an account.', 403, 'ACCOUNT_NOT_FOUND');
  const pinned = await require('./pivotCarouselAssetService').pinRemoteAssets(req, deck.accountId, deck.document);
  if (pinned.error) return pinned;
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  const row = await PivotCarouselRevision.create({
    issueId: deck._id,
    accountId: deck.accountId,
    headRevision: deck.revision || 1,
    kind: 'export',
    sourceRevision,
    schemaVersion: 2,
    document: pinned.document,
    curation: deck.curation || null,
    sources: deck.sources || [],
    createdBy: actorId(req),
  });
  return { data: { pin: row } };
}

async function findExportPin(req, issueId, sourceRevision) {
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  return PivotCarouselRevision.findOne({ issueId, kind: 'export', sourceRevision }).lean();
}

async function findExportPinById(req, issueId, revisionId) {
  if (!/^[0-9a-f]{24}$/i.test(String(revisionId || ''))) return null;
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  return PivotCarouselRevision.findOne({ _id: revisionId, issueId, kind: 'export' }).lean();
}

async function listCheckpoints(req, accountId, issueId) {
  const { getCarouselIssue } = require('./pivotCarouselIssueService');
  const loaded = await getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  const rows = await PivotCarouselRevision.find({ issueId, accountId, kind: 'checkpoint' })
    .sort({ createdAt: -1 })
    .lean();
  return { data: { checkpoints: rows.map(serializeCheckpoint), retention: RETENTION } };
}

async function createCheckpoint(req, accountId, issueId, body = {}) {
  const name = text(body.name, 80);
  if (!name) return fail('A checkpoint name is required.', 400, 'NAME_REQUIRED');
  const { getCarouselIssue } = require('./pivotCarouselIssueService');
  const loaded = await getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  const issue = loaded.data.issue;
  if ((issue.schemaVersion || 1) !== 2 || !issue.document) {
    return fail('Checkpoints are available for editable issues.', 409, 'SCHEMA_VERSION_UNSUPPORTED');
  }
  const { checkRevision } = require('./pivotCarouselIssueService');
  const conflict = checkRevision(issue.revision || 1, body.revision);
  if (conflict) return { ...conflict, issue };
  const { PivotCarouselDeck, PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselDeck', 'PivotCarouselRevision');
  const head = await PivotCarouselDeck.findOne({ _id: issueId, accountId }).lean();
  if (!head || (head.revision || 1) !== issue.revision) {
    return fail('The issue changed since it was opened.', 409, 'REVISION_CONFLICT', {
      storedRevision: head?.revision,
      presentedRevision: body.revision,
    });
  }
  const row = await PivotCarouselRevision.create({
    issueId: head._id,
    accountId: head.accountId,
    headRevision: head.revision,
    kind: 'checkpoint',
    name,
    schemaVersion: head.schemaVersion || 2,
    document: head.document,
    curation: head.curation || null,
    sources: head.sources || [],
    createdBy: actorId(req),
  });
  return { data: { checkpoint: serializeCheckpoint(row), issue } };
}

async function restoreCheckpoint(req, accountId, issueId, checkpointId, body = {}) {
  const { getCarouselIssue, updateCarouselIssue } = require('./pivotCarouselIssueService');
  const loaded = await getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  if (!/^[0-9a-f]{24}$/i.test(String(checkpointId || ''))) {
    return fail('Checkpoint not found.', 404, 'CHECKPOINT_NOT_FOUND');
  }
  const checkpoint = await PivotCarouselRevision.findOne({
    _id: checkpointId,
    issueId,
    accountId,
    kind: 'checkpoint',
  }).lean();
  if (!checkpoint) return fail('Checkpoint not found.', 404, 'CHECKPOINT_NOT_FOUND');
  const next = { revision: body.revision, document: checkpoint.document };
  if (checkpoint.curation && typeof checkpoint.curation === 'object') next.curation = checkpoint.curation;
  if (Array.isArray(checkpoint.sources)) next.sources = checkpoint.sources;
  const restored = await updateCarouselIssue(req, accountId, issueId, next, { restoredFrom: checkpoint._id });
  if (restored.error) return restored;
  const still = await PivotCarouselRevision.findById(checkpoint._id).lean();
  if (!still || JSON.stringify(still.document) !== JSON.stringify(checkpoint.document)) {
    return fail('The checkpoint changed while restoring.', 500, 'CHECKPOINT_MUTATED');
  }
  return {
    data: {
      issue: restored.data.issue,
      checkpoint: serializeCheckpoint(still),
    },
  };
}

module.exports = {
  RETENTION,
  recordHeadSnapshot,
  pinExportRevision,
  findExportPin,
  findExportPinById,
  pruneSaveSnapshots,
  listCheckpoints,
  createCheckpoint,
  restoreCheckpoint,
};
