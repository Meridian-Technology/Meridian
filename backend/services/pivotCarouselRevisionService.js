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

/**
 * Writes the history row for a revision that has not been accepted yet.
 *
 * Ordering matters: the content is durable *before* the head moves, so a crash
 * can never leave an acknowledged save with no record of what was saved. The
 * row is not history until it is committed — readers skip pending rows — and
 * reconciliation resolves anything left behind.
 */
async function beginHeadSnapshot(req, { doc, targetRevision, meta = {} }) {
  if (!doc?.document || (doc.schemaVersion || 1) !== 2) return null;
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  return PivotCarouselRevision.create({
    issueId: doc._id,
    accountId: doc.accountId,
    headRevision: targetRevision,
    kind: 'save',
    status: 'pending',
    schemaVersion: 2,
    document: doc.document,
    socialCaption: doc.socialCaption ?? '',
    captionRevision: doc.captionRevision || 1,
    curation: doc.curation || null,
    sources: doc.sources || [],
    restoredFrom: meta.restoredFrom || null,
    createdBy: actorId(req),
  });
}

async function commitHeadSnapshot(req, pending, currentRevision) {
  if (!pending) return null;
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  const row = await PivotCarouselRevision.findOneAndUpdate(
    { _id: pending._id, status: 'pending' },
    { $set: { status: 'committed' } },
    { new: true },
  );
  await pruneSaveSnapshots(req, pending.issueId, currentRevision);
  return row;
}

/** The head write never landed, so its history row describes nothing. */
async function abandonHeadSnapshot(req, pending) {
  if (!pending) return null;
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  await PivotCarouselRevision.deleteOne({ _id: pending._id, status: 'pending' });
  return null;
}

/**
 * Resolve history rows for an issue that was interrupted between its head
 * write and its commit.
 *
 * Revisions advance by exactly one, so a pending row whose headRevision has
 * already been reached means the head write succeeded and the row is real
 * history. A pending row ahead of the head means the compare-and-swap lost,
 * and the row describes a save that never happened.
 */
async function reconcileIssueSnapshots(req, issueId) {
  const { PivotCarouselDeck, PivotCarouselRevision } = getGlobalModels(
    req,
    'PivotCarouselDeck',
    'PivotCarouselRevision',
  );
  const head = await PivotCarouselDeck.findById(issueId).select('revision pendingSnapshot').lean();
  if (!head) return { committed: 0, discarded: 0 };
  const pendingRows = await PivotCarouselRevision.find({ issueId, status: 'pending' })
    .select('_id headRevision')
    .lean();

  const commit = pendingRows.filter((row) => row.headRevision <= (head.revision || 1)).map((row) => row._id);
  const discard = pendingRows.filter((row) => row.headRevision > (head.revision || 1)).map((row) => row._id);

  if (commit.length) {
    await PivotCarouselRevision.updateMany(
      { _id: { $in: commit }, status: 'pending' },
      { $set: { status: 'committed' } },
    );
  }
  if (discard.length) {
    await PivotCarouselRevision.deleteMany({ _id: { $in: discard }, status: 'pending' });
  }
  if (head.pendingSnapshot) {
    await PivotCarouselDeck.updateOne({ _id: issueId }, { $set: { pendingSnapshot: null } });
  }
  if (commit.length) await pruneSaveSnapshots(req, issueId, head.revision || 1);
  return { committed: commit.length, discarded: discard.length };
}

/** Issues whose last content write did not get to commit its history row. */
async function findUnreconciledIssues(req, { limit = 50 } = {}) {
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  return PivotCarouselDeck.find({ 'pendingSnapshot.requestedAt': { $type: 'date' } })
    .sort({ 'pendingSnapshot.requestedAt': 1 })
    .limit(limit)
    .select('_id accountId revision pendingSnapshot')
    .lean();
}

async function pruneSaveSnapshots(req, issueId, currentRevision) {
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  // Only committed autosaves are candidates. Protected baselines and pending
  // rows are not reachable from here at all.
  const saves = await PivotCarouselRevision.find({ issueId, kind: 'save', status: 'committed' })
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
    await PivotCarouselRevision.deleteMany({ _id: { $in: drop }, kind: 'save', status: 'committed' });
  }
  return { kept: keep.size, removed: drop.length };
}

/**
 * An immutable editorial baseline: what the agent generated, what an admin
 * approved, or what actually went out. These are never pruned and never
 * updated, so a later edit cannot rewrite them.
 */
async function recordProtectedBaseline(req, doc, kind, extra = {}) {
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  const isEditable = Boolean(doc.document) && (doc.schemaVersion || 1) === 2;
  return PivotCarouselRevision.create({
    issueId: doc._id,
    accountId: doc.accountId,
    headRevision: doc.revision || 1,
    kind,
    status: 'committed',
    schemaVersion: doc.schemaVersion || 1,
    document: isEditable ? doc.document : null,
    ...(isEditable ? {} : { slides: JSON.parse(JSON.stringify(doc.slides || [])) }),
    socialCaption: doc.socialCaption ?? '',
    captionRevision: doc.captionRevision || 1,
    curation: doc.curation || null,
    sources: doc.sources || [],
    createdBy: actorId(req),
    ...extra,
  });
}

async function findProtectedBaseline(req, issueId, kind, headRevision = null) {
  const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
  return PivotCarouselRevision.findOne({
    issueId,
    kind,
    status: 'committed',
    ...(headRevision == null ? {} : { headRevision }),
  }).sort({ createdAt: -1 }).lean();
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
  beginHeadSnapshot,
  commitHeadSnapshot,
  abandonHeadSnapshot,
  reconcileIssueSnapshots,
  findUnreconciledIssues,
  recordProtectedBaseline,
  findProtectedBaseline,
  pinExportRevision,
  findExportPin,
  findExportPinById,
  pruneSaveSnapshots,
  listCheckpoints,
  createCheckpoint,
  restoreCheckpoint,
};
