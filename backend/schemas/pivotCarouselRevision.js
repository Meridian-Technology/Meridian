const mongoose = require('mongoose');

/**
 * Immutable revision history for a schema-version-2 issue.
 *
 * The editable head stays on the deck (`revision` plus `document`). These rows
 * are copies taken after an accepted write, or named checkpoints taken of a
 * head the caller has just read. Restoring a checkpoint writes a new head
 * revision; it does not change the checkpoint row.
 *
 * Retention, applied by pruneSaveSnapshots and nowhere else:
 * - Named checkpoints (`kind: 'checkpoint'`) and export pins (`kind: 'export'`)
 *   are retained. Cleanup never deletes them. An export pin is the document
 *   a queued render is allowed to read.
 * - Unnamed save snapshots (`kind: 'save'`) keep the newest 25 per issue,
 *   always including the snapshot of the current head revision.
 */
const RETENTION = Object.freeze({
  namedCheckpoints: 'retain',
  exportPins: 'retain',
  autosaveSnapshotsPerIssue: 25,
});

const pivotCarouselRevisionSchema = new mongoose.Schema(
  {
    issueId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    headRevision: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: ['save', 'checkpoint', 'export'], required: true },
    sourceRevision: { type: String, default: null, trim: true, maxlength: 40 },
    name: { type: String, default: null, trim: true, maxlength: 80 },
    schemaVersion: { type: Number, default: 2 },
    document: { type: mongoose.Schema.Types.Mixed, required: true },
    curation: { type: mongoose.Schema.Types.Mixed, default: null },
    sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    restoredFrom: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

pivotCarouselRevisionSchema.index({ issueId: 1, kind: 1, createdAt: -1 });
pivotCarouselRevisionSchema.index({ issueId: 1, headRevision: 1, kind: 1 });

module.exports = pivotCarouselRevisionSchema;
module.exports.RETENTION = RETENTION;
