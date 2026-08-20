const mongoose = require('mongoose');

/**
 * Narrated record of one orchestrated run — source discovery or batch curation.
 *
 * The registry (`PivotCitySource`) records *what* discovery concluded, but not
 * how it got there: a run that searched 45 queries and rejected everything looks
 * identical to one that aborted on its second call. That gap matters because the
 * pipeline makes judgement calls an operator needs to audit — which host got
 * filtered out and why, which of a site's URLs was chosen as its calendar, how
 * many events a page had to yield to qualify.
 *
 * So this stores the decisions as an ordered timeline alongside the counters.
 * It is a telemetry document, not a source of truth: nothing in the pipeline
 * reads it back, which is what lets every write here fail silently rather than
 * take a run down with it.
 *
 * Batch curation shares the document because it needs the identical narration —
 * an ordered list of decisions, per-stage counters, and the same abort semantics
 * — and reusing it means one console renders both. `kind` is what the reader
 * discriminates on.
 */

const RUN_STATUSES = ['running', 'completed', 'failed'];

/** Which pipeline produced this record. */
const RUN_KINDS = ['discovery', 'curation-batch'];

/**
 * Coarse stage, used to pick the orb animation and group the timeline. Finer
 * detail lives in each step's `kind`. Discovery uses searching -> filtering ->
 * qualifying -> registering; batch curation uses planning -> crawling -> done.
 */
const RUN_PHASES = [
  'native',
  'searching',
  'filtering',
  'qualifying',
  'registering',
  'planning',
  'crawling',
  'done',
];

/**
 * What a single decision was. Drives the icon and wording in the console, and
 * maps onto the orb state so the animation tracks the work actually happening.
 */
const STEP_KINDS = [
  'plan',
  'search',
  'candidates',
  'filter',
  'native',
  'map',
  'index',
  'scrape',
  'retry',
  'qualify',
  'reject',
  'job',
  'ingest',
  'job-start',
  'job-done',
  'abort',
  'done',
];

/** Reader-facing severity. `bad` is reserved for things that end or abort a run. */
const STEP_TONES = ['info', 'good', 'warn', 'bad'];

/**
 * Cap on retained steps. A full run emits a few hundred; keeping the most recent
 * slice bounds the document well under Mongo's 16MB limit without truncating
 * anything an operator would realistically scroll back to.
 */
const MAX_STEPS = 600;

const discoveryStepSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    phase: { type: String, enum: RUN_PHASES, required: true },
    kind: { type: String, enum: STEP_KINDS, required: true },
    tone: { type: String, enum: STEP_TONES, default: 'info' },
    /** One line, already written for a human — the console does no phrasing. */
    title: { type: String, required: true, trim: true },
    detail: { type: String, default: null, trim: true },
    host: { type: String, default: null, trim: true },
    url: { type: String, default: null, trim: true },
    /** Catalog slug whose seed query produced this, when there was one. */
    tag: { type: String, default: null, trim: true },
    eventCount: { type: Number, default: null },
    /** Event-index score, so URL choices can be second-guessed. */
    score: { type: Number, default: null },
    reason: { type: String, default: null, trim: true },
    code: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const pivotSourceDiscoveryRunSchema = new mongoose.Schema(
  {
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    city: { type: String, default: null, trim: true },
    kind: {
      type: String,
      enum: RUN_KINDS,
      default: 'discovery',
    },
    /**
     * A rehearsal walks the real query plan but makes no outbound calls and
     * writes nothing to the registry. Flagged on the document rather than
     * inferred, so the console can label it and its counts can never be mistaken
     * for findings.
     */
    rehearsal: { type: Boolean, default: false },
    status: {
      type: String,
      required: true,
      enum: RUN_STATUSES,
      default: 'running',
    },
    phase: {
      type: String,
      enum: RUN_PHASES,
      default: 'searching',
    },
    /** The cost ceiling agreed to when the run started. */
    plan: {
      queries: { type: Number, default: 0 },
      categories: { type: Number, default: 0 },
      maxCandidates: { type: Number, default: 0 },
      minEvents: { type: Number, default: 1 },
      maxOutboundCalls: { type: Number, default: 0 },
      flow: { type: String, default: null, trim: true },
      runNative: { type: Boolean, default: false },
      runFirecrawl: { type: Boolean, default: true },
      lumaSlug: { type: String, default: null, trim: true },
      partifulSlug: { type: String, default: null, trim: true },
      /** Batch curation: jobs queued, and the week they publish into. */
      jobs: { type: Number, default: 0 },
      batchWeek: { type: String, default: null, trim: true },
      forceBatchWeek: { type: Boolean, default: false },
    },
    options: {
      tags: { type: [String], default: [] },
      createJobs: { type: Boolean, default: true },
      recheckRejected: { type: Boolean, default: false },
    },
    counters: {
      candidatesFound: { type: Number, default: 0 },
      skippedKnown: { type: Number, default: 0 },
      skippedNonSource: { type: Number, default: 0 },
      skippedNative: { type: Number, default: 0 },
      evaluated: { type: Number, default: 0 },
      qualified: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      jobsCreated: { type: Number, default: 0 },
      /** Actual outbound calls, to compare against `plan.maxOutboundCalls`. */
      searches: { type: Number, default: 0 },
      maps: { type: Number, default: 0 },
      scrapes: { type: Number, default: 0 },
      /** Catalog writes. Both pipelines publish events, so both report these. */
      eventsUpserted: { type: Number, default: 0 },
      eventsSkipped: { type: Number, default: 0 },
      eventsFailed: { type: Number, default: 0 },
      /** Rows written that matched an existing catalog event (sourceUrl or fingerprint). */
      eventsUpdated: { type: Number, default: 0 },
      eventsUpdatedByFingerprint: { type: Number, default: 0 },
      /** Batch curation only. */
      jobsRun: { type: Number, default: 0 },
      jobsFailed: { type: Number, default: 0 },
    },
    steps: { type: [discoveryStepSchema], default: [] },
    /** Set when a fatal code stopped the run early; distinct from `error`. */
    aborted: {
      code: { type: String, default: null },
      error: { type: String, default: null },
    },
    /**
     * Operator stop. The worker polls this and turns it into `aborted` with
     * code `CANCELLED` — the HTTP handler only flips the flag, so a stop is
     * acknowledged immediately even while an outbound call is still in flight.
     */
    cancelRequested: { type: Boolean, default: false },
    error: { type: String, default: null },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    actor: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

pivotSourceDiscoveryRunSchema.index({ tenantKey: 1, createdAt: -1 });
// The panels poll for the latest run of one kind, so kind has to be in the index.
pivotSourceDiscoveryRunSchema.index({ tenantKey: 1, kind: 1, createdAt: -1 });

module.exports = pivotSourceDiscoveryRunSchema;
module.exports.RUN_STATUSES = RUN_STATUSES;
module.exports.RUN_KINDS = RUN_KINDS;
module.exports.RUN_PHASES = RUN_PHASES;
module.exports.STEP_KINDS = STEP_KINDS;
module.exports.STEP_TONES = STEP_TONES;
module.exports.MAX_STEPS = MAX_STEPS;
