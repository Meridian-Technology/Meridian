const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { isValidIsoWeek, toIsoWeek } = require('../utilities/pivotIsoWeek');
const { logPivot, pivotRequestContext } = require('../utilities/pivotLogger');
const {
  PIVOT_INTERACTION_SURFACES,
  PIVOT_INTERACTION_RETRIEVALS,
  PIVOT_INTERACTION_TYPES,
} = require('../schemas/pivotInteraction');

const SURFACE_SET = new Set(PIVOT_INTERACTION_SURFACES);
const RETRIEVAL_SET = new Set(PIVOT_INTERACTION_RETRIEVALS);
const TYPE_SET = new Set(PIVOT_INTERACTION_TYPES);

const DEFAULT_SURFACE = 'deck';
const DEFAULT_RETRIEVAL = 'weekly_batch';
const MAX_IMPRESSION_BATCH = 50;
const MAX_MICRO_INTERACTION_BATCH = 20;
const MAX_DWELL_MS = 5 * 60 * 1000;
const DEFAULT_IMPRESSION_RANKER_VERSION = 'rules_v0';

const MICRO_INTERACTION_TYPES = new Set(['dwell', 'detail_open']);

function clampDwellMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) {
    return null;
  }
  return Math.min(Math.max(0, Math.floor(Number(ms))), MAX_DWELL_MS);
}

/**
 * Optional interaction context from route bodies (Task 1.3).
 * Invalid surface/retrieval are left as-is here — `normalizePivotInteractionPayload`
 * coerces them on write so intent upserts never fail on typo'd tags.
 *
 * @param {object} body
 * @param {{ surface?: string, retrieval?: string }} [defaults]
 */
function pickInteractionContext(body = {}, defaults = {}) {
  const ctx = {
    surface: body.surface != null && body.surface !== ''
      ? body.surface
      : defaults.surface || DEFAULT_SURFACE,
    retrieval: body.retrieval != null && body.retrieval !== ''
      ? body.retrieval
      : defaults.retrieval || DEFAULT_RETRIEVAL,
  };

  if (body.rankInFeed != null && Number.isFinite(Number(body.rankInFeed))) {
    ctx.rankInFeed = Number(body.rankInFeed);
  }
  if (typeof body.sessionId === 'string' && body.sessionId.trim()) {
    ctx.sessionId = body.sessionId.trim();
  }
  if (typeof body.requestId === 'string' && body.requestId.trim()) {
    ctx.requestId = body.requestId.trim();
  }
  if (typeof body.rankerVersion === 'string' && body.rankerVersion.trim()) {
    ctx.rankerVersion = body.rankerVersion.trim();
  }

  return ctx;
}

/**
 * Coerce / validate a raw payload into a create-ready document.
 * Invalid `surface` / `retrieval` are coerced to deck defaults (append-only log should not drop rows on typos).
 * Invalid `type` or missing userId → returns `{ error }` (caller skips write).
 *
 * @param {object} payload
 * @returns {{ doc: object } | { error: string, code: string }}
 */
function normalizePivotInteractionPayload(payload = {}) {
  const type = String(payload.type || '')
    .trim()
    .toLowerCase();
  if (!TYPE_SET.has(type)) {
    return {
      error: `Invalid interaction type: ${payload.type}`,
      code: 'INVALID_INTERACTION_TYPE',
    };
  }

  const userIdRaw = payload.userId;
  if (!userIdRaw || !mongoose.Types.ObjectId.isValid(String(userIdRaw))) {
    return {
      error: 'A valid userId is required.',
      code: 'INVALID_USER_ID',
    };
  }

  let surface = String(payload.surface || DEFAULT_SURFACE)
    .trim()
    .toLowerCase();
  if (!SURFACE_SET.has(surface)) {
    surface = DEFAULT_SURFACE;
  }

  let retrieval = String(
    payload.retrieval != null && payload.retrieval !== ''
      ? payload.retrieval
      : DEFAULT_RETRIEVAL,
  )
    .trim()
    .toLowerCase();
  if (!RETRIEVAL_SET.has(retrieval)) {
    retrieval = DEFAULT_RETRIEVAL;
  }

  let batchWeek =
    typeof payload.batchWeek === 'string' ? payload.batchWeek.trim() : '';
  if (!isValidIsoWeek(batchWeek)) {
    batchWeek = toIsoWeek(new Date());
  }

  const eventIdRaw = payload.eventId;
  const eventId =
    eventIdRaw && mongoose.Types.ObjectId.isValid(String(eventIdRaw))
      ? String(eventIdRaw)
      : null;

  const seedRaw = payload.seedEventId;
  const seedEventId =
    seedRaw && mongoose.Types.ObjectId.isValid(String(seedRaw))
      ? String(seedRaw)
      : null;

  const doc = {
    userId: String(userIdRaw),
    eventId,
    batchWeek,
    surface,
    retrieval,
    type,
  };

  if (payload.rankInFeed != null && Number.isFinite(Number(payload.rankInFeed))) {
    doc.rankInFeed = Math.max(0, Math.floor(Number(payload.rankInFeed)));
  }
  if (payload.ms != null && Number.isFinite(Number(payload.ms))) {
    doc.ms = Math.max(0, Math.floor(Number(payload.ms)));
  }
  if (typeof payload.section === 'string' && payload.section.trim()) {
    doc.section = payload.section.trim();
  }
  if (typeof payload.query === 'string' && payload.query.trim()) {
    doc.query = payload.query.trim();
  }
  if (payload.filters != null && typeof payload.filters === 'object') {
    doc.filters = payload.filters;
  }
  if (seedEventId) {
    doc.seedEventId = seedEventId;
  }
  if (typeof payload.requestId === 'string' && payload.requestId.trim()) {
    doc.requestId = payload.requestId.trim();
  }
  if (typeof payload.rankerVersion === 'string' && payload.rankerVersion.trim()) {
    doc.rankerVersion = payload.rankerVersion.trim();
  }
  if (typeof payload.sessionId === 'string' && payload.sessionId.trim()) {
    doc.sessionId = payload.sessionId.trim();
  }
  if (payload.rating != null && Number.isFinite(Number(payload.rating))) {
    const rating = Math.round(Number(payload.rating));
    if (rating >= 1 && rating <= 5) {
      doc.rating = rating;
    }
  }

  return { doc };
}

/**
 * Persist one interaction row. Awaitable for tests / batching.
 * Returns the created lean doc, or `{ skipped: true, ... }` / `{ error }` on failure.
 */
async function writePivotInteraction(req, payload = {}) {
  const normalized = normalizePivotInteractionPayload(payload);
  if (normalized.error) {
    return {
      error: normalized.error,
      code: normalized.code,
      skipped: true,
    };
  }

  try {
    const { PivotInteraction } = getModels(req, 'PivotInteraction');
    const created = await PivotInteraction.create(normalized.doc);
    return { data: created.toObject ? created.toObject() : created };
  } catch (err) {
    logPivot('error', 'interaction write failed', {
      ...pivotRequestContext(req),
      type: normalized.doc?.type,
      surface: normalized.doc?.surface,
      error: err.message,
    });
    return {
      error: err.message,
      code: 'INTERACTION_WRITE_FAILED',
      skipped: true,
    };
  }
}

/**
 * Fire-and-forget writer for routes. Never throws; never blocks the caller.
 * Prefer this from HTTP handlers; use `writePivotInteraction` in tests / jobs.
 */
function recordPivotInteraction(req, payload = {}) {
  if (!req) {
    return;
  }

  const enriched = { ...payload };
  if (!enriched.userId && req.user?.userId) {
    enriched.userId = req.user.userId;
  }

  setImmediate(() =>
    writePivotInteraction(req, enriched).catch((err) => {
      logPivot('error', 'interaction write unexpected failure', {
        ...pivotRequestContext(req),
        error: err?.message || String(err),
      });
    }),
  );
}

/**
 * Batch deck (or explore) impressions. Schedules fire-and-forget writes;
 * returns immediately so swipe UX is never blocked.
 *
 * Body: `{ impressions: [{ eventId, rankInFeed, batchWeek? }], batchWeek?, sessionId?, requestId? }`
 */
function recordPivotImpressions(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'UNAUTHORIZED',
    };
  }

  const raw = Array.isArray(body.impressions) ? body.impressions : null;
  if (!raw) {
    return {
      error: 'impressions must be an array.',
      status: 400,
      code: 'INVALID_IMPRESSIONS',
    };
  }

  if (raw.length === 0) {
    return { data: { accepted: 0, received: 0, skipped: 0 } };
  }

  if (raw.length > MAX_IMPRESSION_BATCH) {
    return {
      error: `At most ${MAX_IMPRESSION_BATCH} impressions per request.`,
      status: 400,
      code: 'IMPRESSION_BATCH_TOO_LARGE',
    };
  }

  const defaultBatchWeek =
    typeof body.batchWeek === 'string' && isValidIsoWeek(body.batchWeek.trim())
      ? body.batchWeek.trim()
      : null;
  const sessionId =
    typeof body.sessionId === 'string' && body.sessionId.trim()
      ? body.sessionId.trim()
      : null;
  const requestId =
    typeof body.requestId === 'string' && body.requestId.trim()
      ? body.requestId.trim()
      : null;
  const rankerVersion =
    typeof body.rankerVersion === 'string' && body.rankerVersion.trim()
      ? body.rankerVersion.trim()
      : DEFAULT_IMPRESSION_RANKER_VERSION;

  let accepted = 0;
  let skipped = 0;

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      skipped += 1;
      continue;
    }

    const eventId = String(item.eventId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      skipped += 1;
      continue;
    }

    const itemBatchWeek =
      typeof item.batchWeek === 'string' && isValidIsoWeek(item.batchWeek.trim())
        ? item.batchWeek.trim()
        : defaultBatchWeek;

    if (!itemBatchWeek) {
      skipped += 1;
      continue;
    }

    const rankRaw = item.rankInFeed;
    if (rankRaw == null || !Number.isFinite(Number(rankRaw))) {
      skipped += 1;
      continue;
    }

    recordPivotInteraction(req, {
      userId,
      eventId,
      batchWeek: itemBatchWeek,
      type: 'impression',
      surface: item.surface || DEFAULT_SURFACE,
      retrieval: item.retrieval || DEFAULT_RETRIEVAL,
      rankInFeed: Number(rankRaw),
      rankerVersion: item.rankerVersion || rankerVersion,
      sessionId: item.sessionId || sessionId || undefined,
      requestId: item.requestId || requestId || undefined,
    });
    accepted += 1;
  }

  return {
    data: {
      accepted,
      skipped,
      received: raw.length,
    },
  };
}

/**
 * Batch dwell / detail_open rows (Task 4.3). Fire-and-forget writes.
 *
 * Body: `{ interactions: [{ eventId, type, ms?, batchWeek?, surface?, retrieval?, rankInFeed? }], batchWeek?, rankerVersion? }`
 */
function recordPivotMicroInteractions(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'UNAUTHORIZED',
    };
  }

  const raw = Array.isArray(body.interactions) ? body.interactions : null;
  if (!raw) {
    return {
      error: 'interactions must be an array.',
      status: 400,
      code: 'INVALID_MICRO_INTERACTIONS',
    };
  }

  if (raw.length === 0) {
    return { data: { accepted: 0, received: 0, skipped: 0 } };
  }

  if (raw.length > MAX_MICRO_INTERACTION_BATCH) {
    return {
      error: `At most ${MAX_MICRO_INTERACTION_BATCH} interactions per request.`,
      status: 400,
      code: 'MICRO_INTERACTION_BATCH_TOO_LARGE',
    };
  }

  const defaultBatchWeek =
    typeof body.batchWeek === 'string' && isValidIsoWeek(body.batchWeek.trim())
      ? body.batchWeek.trim()
      : null;
  const rankerVersion =
    typeof body.rankerVersion === 'string' && body.rankerVersion.trim()
      ? body.rankerVersion.trim()
      : DEFAULT_IMPRESSION_RANKER_VERSION;

  let accepted = 0;
  let skipped = 0;

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      skipped += 1;
      continue;
    }

    const type = String(item.type || '')
      .trim()
      .toLowerCase();
    if (!MICRO_INTERACTION_TYPES.has(type)) {
      skipped += 1;
      continue;
    }

    const eventId = String(item.eventId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      skipped += 1;
      continue;
    }

    const itemBatchWeek =
      typeof item.batchWeek === 'string' && isValidIsoWeek(item.batchWeek.trim())
        ? item.batchWeek.trim()
        : defaultBatchWeek;

    if (!itemBatchWeek) {
      skipped += 1;
      continue;
    }

    const ms = type === 'dwell' ? clampDwellMs(item.ms) : null;
    if (type === 'dwell' && (ms == null || ms <= 0)) {
      skipped += 1;
      continue;
    }

    recordPivotInteraction(req, {
      userId,
      eventId,
      batchWeek: itemBatchWeek,
      type,
      surface: item.surface || DEFAULT_SURFACE,
      retrieval: item.retrieval || DEFAULT_RETRIEVAL,
      rankInFeed: item.rankInFeed,
      rankerVersion: item.rankerVersion || rankerVersion,
      ms: ms ?? undefined,
      sessionId: item.sessionId,
      requestId: item.requestId,
    });
    accepted += 1;
  }

  return {
    data: {
      accepted,
      skipped,
      received: raw.length,
    },
  };
}

module.exports = {
  normalizePivotInteractionPayload,
  writePivotInteraction,
  recordPivotInteraction,
  recordPivotImpressions,
  recordPivotMicroInteractions,
  pickInteractionContext,
  PIVOT_INTERACTION_SURFACES,
  PIVOT_INTERACTION_RETRIEVALS,
  PIVOT_INTERACTION_TYPES,
  DEFAULT_SURFACE,
  DEFAULT_RETRIEVAL,
  MAX_IMPRESSION_BATCH,
  MAX_MICRO_INTERACTION_BATCH,
  MAX_DWELL_MS,
  DEFAULT_IMPRESSION_RANKER_VERSION,
};
