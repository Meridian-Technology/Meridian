const mongoose = require('mongoose');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const { ZINE_SLIDE_TYPE_KEYS } = require('../constants/zineSlideTypes');

/**
 * One "sorry u missed it" Instagram carousel for a Pivot city.
 *
 * Global DB keyed by tenantKey, following pivotPosterTemplate — the deck is
 * platform-admin content about a city rather than city data, and it has to be
 * listable across tenants from one connection.
 *
 * `values`, `options` and the per-event `values` are deliberately Mixed: their
 * shape is declared in constants/zineSlideTypes.js and coerced on write, so a
 * new slide type never needs a migration here.
 */

const EDITIONS = Object.freeze(['night', 'paper']);

/**
 * How an issue came to exist. Manual issues are everything a human started;
 * `agent-generated` is reserved for the carousel-compose pipeline and is the
 * only origin that carries a review state.
 */
const ORIGINS = Object.freeze(['manual', 'agent-generated']);

/**
 * Review state is deliberately separate from `status`. Archival (active or
 * archived) answers "is this in the list"; review state answers "has a human
 * signed off on this exact revision". Conflating them would make archiving an
 * issue look like approving it.
 */
const REVIEW_STATES = Object.freeze(['unapproved', 'approved', 'posted']);

const MAX_SOCIAL_CAPTION_LENGTH = 2200;
const EDITORIAL_FIELDS = Object.freeze(['events', 'cover-copy', 'event-copy', 'presets', 'images', 'caption']);
const FEEDBACK_DISPOSITIONS = Object.freeze(['approve', 'reject', 'change']);

const editorialChangeSchema = new mongoose.Schema({
  field: { type: String, enum: EDITORIAL_FIELDS, required: true },
  before: { type: mongoose.Schema.Types.Mixed, required: true },
  after: { type: mongoose.Schema.Types.Mixed, required: true },
}, { _id: false });

const editorialEditSchema = new mongoose.Schema({
  actor: { type: String, required: true },
  time: { type: Date, required: true },
  version: { type: Number, required: true, min: 1 },
  fromRevision: { type: Number, required: true, min: 1 },
  toRevision: { type: Number, required: true, min: 2 },
  changes: { type: [editorialChangeSchema], default: [] },
});

const feedbackNoteSchema = new mongoose.Schema({
  author: { type: String, required: true },
  time: { type: Date, required: true },
  version: { type: Number, required: true, min: 1 },
  revision: { type: Number, required: true, min: 1 },
  text: { type: String, required: true, trim: true },
  disposition: { type: String, enum: FEEDBACK_DISPOSITIONS, required: true },
});
/**
 * An approval covers one exact revision, slides and caption together. It is
 * cleared whenever that revision stops being current, so it can never describe
 * content nobody read.
 */
const optionPickSchema = new mongoose.Schema(
  {
    pickedAt: { type: Date, required: true },
    pickedBy: { type: String, default: null, trim: true, maxlength: 256 },
  },
  { _id: false },
);

const approvalSchema = new mongoose.Schema(
  {
    revision: { type: Number, required: true, min: 1 },
    approvedAt: { type: Date, required: true },
    approvedBy: { type: String, default: null, trim: true, maxlength: 256 },
  },
  { _id: false },
);

/**
 * A record that a human put this issue on Instagram by hand. `postedAt` is the
 * actual publication time, which is not the time this row was written and is
 * certainly not the time the issue was generated, exported or approved.
 */
const postingSchema = new mongoose.Schema(
  {
    revision: { type: Number, required: true, min: 1 },
    postedAt: { type: Date, required: true },
    postedBy: { type: String, default: null, trim: true, maxlength: 256 },
    recordedAt: { type: Date, required: true },
    instagramUrl: { type: String, default: null, trim: true, maxlength: 2048 },
    /** The immutable revision row holding exactly what went out. */
    snapshotRevisionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false },
);

/**
 * A catalog event copied onto a slide. This is a snapshot, not a reference:
 * eventId is kept for provenance only and is never read back, so a later
 * catalog correction cannot silently rewrite a deck that was already posted.
 */
const slideEventSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, default: null },
    label: { type: String, default: null, trim: true },
    snapshot: {
      name: { type: String, default: '', trim: true },
      host: { type: String, default: '', trim: true },
      startTime: { type: Date, default: null },
      whenLabel: { type: String, default: '', trim: true },
      location: { type: String, default: '', trim: true },
      image: { type: String, default: null },
    },
    // Set only when someone uploads instead of using the event's flier.
    imageOverride: {
      url: { type: String, default: null },
      key: { type: String, default: null },
    },
    values: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false },
);

const slideSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ZINE_SLIDE_TYPE_KEYS,
    },
    values: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    options: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    events: { type: [slideEventSchema], default: [] },
  },
  { _id: true },
);

const pivotCarouselDeckSchema = new mongoose.Schema(
  {
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    batchWeek: {
      type: String,
      default: null,
      trim: true,
      validate: {
        validator(value) {
          return value == null || value === '' || isValidIsoWeek(value);
        },
        message: 'batchWeek must be ISO week format YYYY-Www',
      },
    },
    edition: {
      type: String,
      enum: EDITIONS,
      default: 'night',
    },
    /*
     * The newsprint ink plate: a flat orange multiplied over every photograph.
     * It belongs to the issue rather than to a slide — an issue with the wash
     * on some pictures and not others is not a printing decision, it is a
     * mistake — so it sits beside the edition and not in slide options.
     */
    inkPlate: {
      type: Boolean,
      default: true,
    },
    /*
     * Whether the issue number is printed at all. An issue that is not numbered
     * is a real editorial choice, and it has to be all-or-nothing: a folio on
     * five slides and not the sixth reads as a missing value, not a decision.
     */
    showIssueNumber: {
      type: Boolean,
      default: true,
    },
    // The issue's own identity — what the folio, masthead and dateline read.
    issue: {
      number: { type: String, default: '', trim: true },
      city: { type: String, default: '', trim: true },
      dateline: { type: String, default: '', trim: true },
      week: { type: String, default: '', trim: true },
      scanned: { type: String, default: '', trim: true },
    },
    /**
     * Per-deck voice overrides. Same sparse shape sparseOverlayFromLayers()
     * produces, so the carousel voice panel reuses the copy pack's editor
     * without the copy pack itself being involved.
     */
    voice: {
      entries: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      tokens: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    },
    slides: { type: [slideSchema], default: [] },
    /*
     * Additive issue fields. Legacy decks leave these at the defaults and keep
     * using tenantKey, title, and updatedAt. schemaVersion 2 is the editable
     * document; revision is a monotonic integer, not updatedAt.
     */
    accountId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    name: { type: String, default: '', trim: true },
    format: { type: String, enum: ['city-picks', 'sorry-you-missed-it'] },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    schemaVersion: { type: Number, default: 1 },
    revision: { type: Number, default: 1, min: 1 },
    document: { type: mongoose.Schema.Types.Mixed, default: null },
    curation: { type: mongoose.Schema.Types.Mixed, default: null },
    sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    lastExportedAt: { type: Date, default: null },
    createdBy: { type: String, default: null, trim: true },
    updatedBy: { type: String, default: null, trim: true },
    /*
     * Editorial lifecycle. Every field below is additive and defaulted, so a
     * legacy deck that has never seen this code reads as a manual issue with
     * no caption, no review state, no approval and no posting history — which
     * is exactly what it is. Nothing here is inferred from an existing row.
     */
    origin: { type: String, enum: ORIGINS, default: 'manual' },
    // Internal provenance; the job also deterministically supplies the issue _id.
    composeJobId: { type: String, maxlength: 128, immutable: true },
    /*
     * Several themed drafts from one compose run. optionSetId is that run's job
     * id. A single stored composition has none of these fields.
     */
    optionSetId: { type: String, maxlength: 128, immutable: true },
    optionIndex: { type: Number, min: 0, max: 2, immutable: true },
    themeLabel: { type: String, maxlength: 80, trim: true, immutable: true },
    // Which option in the set was picked. Restoring a sibling does not clear it.
    optionPick: { type: optionPickSchema },
    /**
     * Online trends a generated draft cites (`trend:<source>:<slug>`), so a
     * reviewer can judge the reference. Absent on manual issues and on drafts
     * that use none.
     */
    trendRefs: {
      type: [{ type: String, maxlength: 128, match: /^trend:[a-z]+:[a-z0-9-]+$/ }],
      default: undefined,
      validate: { validator: (refs) => !refs || refs.length <= 10, message: 'At most ten trend references.' },
    },
    // Null for manual issues: "Unapproved draft" is a generated-only state.
    reviewState: {
      type: String,
      enum: REVIEW_STATES,
      default() { return this.origin === 'agent-generated' ? 'unapproved' : null; },
    },
    socialCaption: { type: String, default: '', trim: true, maxlength: MAX_SOCIAL_CAPTION_LENGTH },
    approval: { type: approvalSchema, default: null },
    posting: { type: postingSchema, default: null },
    postHistory: { type: [postingSchema], default: undefined },
    editorialVersion: { type: Number, default: 0, min: 0 },
    editLog: { type: [editorialEditSchema], default: [] },
    feedbackNotes: { type: [feedbackNoteSchema], default: [] },
  },
  { timestamps: true },
);

pivotCarouselDeckSchema.pre('validate', function normalizeFields() {
  if (this.tenantKey) {
    this.tenantKey = String(this.tenantKey).trim().toLowerCase();
  }
  if (this.title) {
    this.title = String(this.title).trim();
  }
  if (this.batchWeek === '') {
    this.batchWeek = null;
  }
  // A manual issue never carries the generated-only review state, and nothing
  // may be marked approved without an approval record describing which exact
  // revision was approved.
  if (this.origin !== 'agent-generated' && this.reviewState != null) {
    this.invalidate('reviewState', 'review state is only used by generated issues');
  }
  if (this.origin === 'agent-generated' && this.reviewState == null) {
    this.invalidate('reviewState', 'a generated issue needs a review state');
  }
  if (['approved', 'posted'].includes(this.reviewState) && !this.approval) {
    this.invalidate('reviewState', 'an approved issue needs an approval record');
  }
  if (this.approval && !['approved', 'posted'].includes(this.reviewState)) {
    this.invalidate('approval', 'an approval record requires an approved or posted review state');
  }
  if (this.approval && this.approval.revision !== (this.revision || 1)) {
    this.invalidate('approval', 'an approval must name the current revision');
  }
  if (this.reviewState === 'posted' && (!this.posting || this.posting.revision !== this.revision)) {
    this.invalidate('reviewState', 'a posted issue needs a posting record for its current revision');
  }
  const optionFields = [this.optionSetId, this.optionIndex, this.themeLabel];
  const optionCount = optionFields.filter(value => value != null && value !== '').length;
  if (optionCount !== 0 && optionCount !== optionFields.length) {
    this.invalidate('optionSetId', 'an option needs a set, an index, and a theme');
  }
});

pivotCarouselDeckSchema.index({ tenantKey: 1, updatedAt: -1 });
pivotCarouselDeckSchema.index({ accountId: 1, status: 1, updatedAt: -1 });
pivotCarouselDeckSchema.index({ tenantKey: 1, status: 1, updatedAt: -1 });
pivotCarouselDeckSchema.index({ optionSetId: 1, optionIndex: 1 }, { sparse: true });

module.exports = pivotCarouselDeckSchema;
module.exports.EDITIONS = EDITIONS;
module.exports.ORIGINS = ORIGINS;
module.exports.REVIEW_STATES = REVIEW_STATES;
module.exports.MAX_SOCIAL_CAPTION_LENGTH = MAX_SOCIAL_CAPTION_LENGTH;
module.exports.EDITORIAL_FIELDS = EDITORIAL_FIELDS;
module.exports.FEEDBACK_DISPOSITIONS = FEEDBACK_DISPOSITIONS;
