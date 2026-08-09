/**
 * Just Go Creator Console publish knobs — defaults, merge, and week/status helpers.
 * Keep in sync with Meridian-Mintlify/strategy/just-go-creator-console-phase1-plan.mdx
 * and pivot-metadata-contract.mdx (creatorPublish + source: justgo).
 */

const {
  batchWeekFromEventDate,
  isValidIsoWeek,
  resolveEventBatchWeek,
  toIsoWeek,
} = require('./pivotIsoWeek');

const CREATOR_INGEST_STATUSES = new Set(['draft', 'staged']);
const CREATOR_WEEK_ASSIGNMENTS = new Set(['event_start', 'force']);

const CREATOR_PUBLISH_CONFIG_DEFAULTS = Object.freeze({
  defaultIngestStatus: 'draft',
  weekAssignment: 'event_start',
  forceBatchWeek: null,
  requireTagsToSubmit: false,
  notifyAdminsOnCreate: true,
  notifyAdminsOnLiveWeekSubmit: true,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneDefaults() {
  return { ...CREATOR_PUBLISH_CONFIG_DEFAULTS };
}

/**
 * Merge tenant-stored sparse overrides onto shipped defaults.
 * @param {object|null|undefined} stored - tenant.creatorPublish
 */
function mergeCreatorPublishConfig(stored) {
  const merged = cloneDefaults();
  if (!isPlainObject(stored)) {
    return merged;
  }

  if (CREATOR_INGEST_STATUSES.has(stored.defaultIngestStatus)) {
    merged.defaultIngestStatus = stored.defaultIngestStatus;
  }
  if (CREATOR_WEEK_ASSIGNMENTS.has(stored.weekAssignment)) {
    merged.weekAssignment = stored.weekAssignment;
  }
  if (stored.forceBatchWeek !== undefined) {
    if (stored.forceBatchWeek === null || stored.forceBatchWeek === '') {
      merged.forceBatchWeek = null;
    } else if (isValidIsoWeek(stored.forceBatchWeek)) {
      merged.forceBatchWeek = String(stored.forceBatchWeek).trim();
    }
  }
  if (typeof stored.requireTagsToSubmit === 'boolean') {
    merged.requireTagsToSubmit = stored.requireTagsToSubmit;
  }
  if (typeof stored.notifyAdminsOnCreate === 'boolean') {
    merged.notifyAdminsOnCreate = stored.notifyAdminsOnCreate;
  }
  if (typeof stored.notifyAdminsOnLiveWeekSubmit === 'boolean') {
    merged.notifyAdminsOnLiveWeekSubmit = stored.notifyAdminsOnLiveWeekSubmit;
  }

  return merged;
}

/**
 * Resolve creator publish config for a pivot tenant row.
 * Missing / empty creatorPublish → pilot defaults (draft, event_start week).
 * @param {object|null|undefined} tenant
 */
function resolveCreatorPublishConfig(tenant = {}) {
  return mergeCreatorPublishConfig(tenant?.creatorPublish);
}

/**
 * Compute batchWeek for a host-created listing from event start + resolved config.
 * Never returns ingestStatus published — callers stamp status separately.
 *
 * @param {Date|string|number|null|undefined} eventStart
 * @param {object} [config] - resolved creatorPublish config (or sparse override)
 * @param {{ timeSlots?: Array<{ start_time?: Date|string }>, now?: Date }} [options]
 * @returns {{ batchWeek: string, source: string } | { error: string, status: number, code: string }}
 */
function computeCreatorBatchWeek(eventStart, config = {}, options = {}) {
  const resolved = mergeCreatorPublishConfig(config);

  if (resolved.weekAssignment === 'force') {
    const forced = typeof resolved.forceBatchWeek === 'string' ? resolved.forceBatchWeek.trim() : '';
    if (!forced || !isValidIsoWeek(forced)) {
      return {
        error: 'forceBatchWeek is required when weekAssignment is "force" (YYYY-Www).',
        status: 400,
        code: 'FORCE_BATCH_WEEK_REQUIRED',
      };
    }
    return { batchWeek: forced, source: 'forced' };
  }

  const fromStart = batchWeekFromEventDate(eventStart);
  if (fromStart) {
    return { batchWeek: fromStart, source: 'event-date' };
  }

  return resolveEventBatchWeek({
    startTime: eventStart,
    timeSlots: options.timeSlots,
    now: options.now || new Date(),
  });
}

/**
 * Default ingest status for host create/submit. Always draft|staged — never published.
 * @param {object} [config]
 * @returns {'draft'|'staged'}
 */
function resolveCreatorDefaultIngestStatus(config = {}) {
  const resolved = mergeCreatorPublishConfig(config);
  return CREATOR_INGEST_STATUSES.has(resolved.defaultIngestStatus)
    ? resolved.defaultIngestStatus
    : 'draft';
}

/**
 * Validate a sparse creatorPublish patch (tenant admin / stored override).
 */
function validateCreatorPublishConfigPatch(body = {}) {
  if (body === null || body === undefined) {
    return { ok: true, patch: undefined };
  }
  if (!isPlainObject(body)) {
    return { error: 'creatorPublish must be an object.' };
  }

  const out = {};

  if (body.defaultIngestStatus !== undefined) {
    const status = String(body.defaultIngestStatus).trim();
    if (!CREATOR_INGEST_STATUSES.has(status)) {
      return {
        error: 'creatorPublish.defaultIngestStatus must be "draft" or "staged".',
      };
    }
    out.defaultIngestStatus = status;
  }

  if (body.weekAssignment !== undefined) {
    const weekAssignment = String(body.weekAssignment).trim();
    if (!CREATOR_WEEK_ASSIGNMENTS.has(weekAssignment)) {
      return {
        error: 'creatorPublish.weekAssignment must be "event_start" or "force".',
      };
    }
    out.weekAssignment = weekAssignment;
  }

  if (body.forceBatchWeek !== undefined) {
    if (body.forceBatchWeek === null || body.forceBatchWeek === '') {
      out.forceBatchWeek = null;
    } else {
      const week = String(body.forceBatchWeek).trim();
      if (!isValidIsoWeek(week)) {
        return {
          error: 'creatorPublish.forceBatchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
        };
      }
      out.forceBatchWeek = week;
    }
  }

  if (body.requireTagsToSubmit !== undefined) {
    if (typeof body.requireTagsToSubmit !== 'boolean') {
      return { error: 'creatorPublish.requireTagsToSubmit must be a boolean.' };
    }
    out.requireTagsToSubmit = body.requireTagsToSubmit;
  }

  if (body.notifyAdminsOnCreate !== undefined) {
    if (typeof body.notifyAdminsOnCreate !== 'boolean') {
      return { error: 'creatorPublish.notifyAdminsOnCreate must be a boolean.' };
    }
    out.notifyAdminsOnCreate = body.notifyAdminsOnCreate;
  }

  if (body.notifyAdminsOnLiveWeekSubmit !== undefined) {
    if (typeof body.notifyAdminsOnLiveWeekSubmit !== 'boolean') {
      return { error: 'creatorPublish.notifyAdminsOnLiveWeekSubmit must be a boolean.' };
    }
    out.notifyAdminsOnLiveWeekSubmit = body.notifyAdminsOnLiveWeekSubmit;
  }

  return { ok: true, patch: Object.keys(out).length ? out : {} };
}

function mergeCreatorPublishConfigOverrides(existing = {}, delta = {}) {
  if (!isPlainObject(delta) || Object.keys(delta).length === 0) {
    return isPlainObject(existing) ? { ...existing } : {};
  }
  return { ...(isPlainObject(existing) ? existing : {}), ...delta };
}

module.exports = {
  CREATOR_PUBLISH_CONFIG_DEFAULTS,
  CREATOR_INGEST_STATUSES,
  CREATOR_WEEK_ASSIGNMENTS,
  mergeCreatorPublishConfig,
  mergeCreatorPublishConfigOverrides,
  resolveCreatorPublishConfig,
  computeCreatorBatchWeek,
  resolveCreatorDefaultIngestStatus,
  validateCreatorPublishConfigPatch,
  // Re-export for callers that only import this module
  toIsoWeek,
};
