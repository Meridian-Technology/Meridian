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
});

pivotCarouselDeckSchema.index({ tenantKey: 1, updatedAt: -1 });
pivotCarouselDeckSchema.index({ accountId: 1, status: 1, updatedAt: -1 });
pivotCarouselDeckSchema.index({ tenantKey: 1, status: 1, updatedAt: -1 });

module.exports = pivotCarouselDeckSchema;
module.exports.EDITIONS = EDITIONS;
