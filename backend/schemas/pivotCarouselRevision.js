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
 * - Protected editorial baselines (`generation`, `approval`, `posted`) are
 *   retained forever. They are the record of what an agent produced, what a
 *   human signed off on, and what actually went out; routine autosave pruning
 *   must never be able to reach them.
 * - Unnamed save snapshots (`kind: 'save'`) keep the newest 25 per issue,
 *   always including the snapshot of the current head revision.
 *
 * `status` exists so a content write can persist its history row *before* the
 * head moves. A pending row is not history yet; reconciliation either commits
 * it (the head write landed) or deletes it (it did not). Every legacy row
 * defaults to committed.
 */
const RETENTION = Object.freeze({
  namedCheckpoints: 'retain',
  exportPins: 'retain',
  protectedBaselines: 'retain',
  autosaveSnapshotsPerIssue: 25,
});

const REVISION_KINDS = Object.freeze(['save', 'checkpoint', 'export', 'generation', 'approval', 'posted']);
/** Kinds routine pruning is not allowed to touch. */
const PROTECTED_REVISION_KINDS = Object.freeze(['checkpoint', 'export', 'generation', 'approval', 'posted']);
const REVISION_STATUSES = Object.freeze(['pending', 'committed']);

const pivotCarouselRevisionSchema = new mongoose.Schema(
  {
    issueId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    headRevision: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: REVISION_KINDS, required: true },
    status: { type: String, enum: REVISION_STATUSES, default: 'committed' },
    sourceRevision: { type: String, default: null, trim: true, maxlength: 40 },
    name: { type: String, default: null, trim: true, maxlength: 80 },
    schemaVersion: { type: Number, default: 2 },
    document: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Legacy schema-version-1 content, captured only by editorial baselines. */
    slides: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    socialCaption: { type: String, default: null, maxlength: 2200 },
    captionRevision: { type: Number, default: null, min: 1 },
    curation: { type: mongoose.Schema.Types.Mixed, default: null },
    sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    restoredFrom: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Set on `approval` and `posted` rows; never edited afterwards. */
    actedAt: { type: Date, default: null },
    actedBy: { type: String, default: null, trim: true, maxlength: 256 },
    instagramUrl: { type: String, default: null, trim: true, maxlength: 2048 },
    createdBy: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

pivotCarouselRevisionSchema.pre('validate', function requireContent() {
  // Editing kinds have always carried a document and still must. Editorial
  // baselines may instead capture a legacy deck's slides, because a manual
  // issue that was posted is still worth recording exactly.
  const hasDocument = this.document != null;
  const hasSlides = Array.isArray(this.slides) && this.slides.length > 0;
  if (['save', 'checkpoint', 'export'].includes(this.kind) && !hasDocument) {
    this.invalidate('document', 'a document is required for this revision kind');
  }
  if (!hasDocument && !hasSlides) {
    this.invalidate('document', 'a revision must capture a document or legacy slides');
  }
});

pivotCarouselRevisionSchema.index({ issueId: 1, kind: 1, createdAt: -1 });
pivotCarouselRevisionSchema.index({ issueId: 1, headRevision: 1, kind: 1 });

module.exports = pivotCarouselRevisionSchema;
module.exports.RETENTION = RETENTION;
module.exports.REVISION_KINDS = REVISION_KINDS;
module.exports.PROTECTED_REVISION_KINDS = PROTECTED_REVISION_KINDS;
module.exports.REVISION_STATUSES = REVISION_STATUSES;
