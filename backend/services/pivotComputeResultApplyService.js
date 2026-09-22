const mongoose = require('mongoose');
const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { logPivot } = require('../utilities/pivotLogger');
const {
  CONTRACT_VERSION,
  validateExecutionResult,
  validateResultPreview,
  isStaleContextPreview,
} = require('../utilities/pivotAdminComputeJobContract');
const { recordVersion, isoTimestamp } = require('../utilities/pivotComputeContextVersion');
const { resolveEventBatchWeek } = require('../utilities/pivotIsoWeek');
const {
  findJobByExternalId,
  beginComputeJobApply,
  updateComputeJobApplyProgress,
  completeComputeJobApply,
} = require('./pivotComputeJobStore');
const {
  MAX_APPLICATION_AUDIT_BUCKETS,
  MAX_APPLICATION_AUDIT_ROWS,
  MAX_APPLICATION_AUDIT_MANIFEST_BYTES,
} = require('../schemas/pivotComputeJob');

const MAX_PREVIEW_ROWS = 5000;
const BACKGROUND_APPLY_ROW_THRESHOLD = 8;
const APPLY_PROGRESS_UPDATE_EVERY = 5;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function serviceError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function notifyComputeJobAdminsBestEffort(req, { job, type, tenant, policy } = {}) {
  if (!job || !type) return;
  if (process.env.NODE_ENV === 'test') return;
  try {
    const { notifyAdminsOnComputeJob } = require('./pivotComputeAdminNotifyService'); // eslint-disable-line global-require
    Promise.resolve(notifyAdminsOnComputeJob(req, { job, type, tenant, policy })).catch(() => undefined);
  } catch (_) {
    // Email is best-effort and must never fail apply.
  }
}

function dispositionForPreviewAction(action) {
  if (action === 'create') return 'created';
  if (action === 'update') return 'updated';
  return trimString(action) || 'applied';
}

function sanitizeApplyManifestRow(row) {
  return {
    entityType: trimString(row?.entityType).slice(0, 64) || 'event',
    disposition: trimString(row?.disposition).slice(0, 64) || 'applied',
    eventId: trimString(row?.eventId).slice(0, 128) || null,
    name: trimString(row?.name).slice(0, 512) || null,
    sourceUrl: trimString(row?.sourceUrl).slice(0, 2048) || null,
    batchWeek: trimString(row?.batchWeek).slice(0, 32) || null,
    ingestStatus: trimString(row?.ingestStatus).slice(0, 64) || null,
    curationJobId: trimString(row?.curationJobId).slice(0, 128) || null,
    curationJobLabel: trimString(row?.curationJobLabel).slice(0, 256) || null,
    message: trimString(row?.message).slice(0, 1000) || null,
  };
}

function applyManifestBucketKey(row) {
  return [row.entityType, row.disposition, row.ingestStatus || '', row.batchWeek || ''].join('\0');
}

function applyManifestByteLength(manifest) {
  return Buffer.byteLength(JSON.stringify({
    buckets: manifest.buckets || [],
    rows: manifest.rows || [],
    rowOverflowCount: manifest.rowOverflowCount || 0,
    manifestGeneratedAt: manifest.manifestGeneratedAt || null,
  }), 'utf8');
}

function buildBoundedApplyManifest(rawRows, now = new Date()) {
  const sanitized = (rawRows || []).map(sanitizeApplyManifestRow);
  const bucketMap = new Map();
  for (const row of sanitized) {
    const key = applyManifestBucketKey(row);
    const existing = bucketMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      bucketMap.set(key, {
        entityType: row.entityType,
        disposition: row.disposition,
        ingestStatus: row.ingestStatus,
        batchWeek: row.batchWeek,
        count: 1,
      });
    }
  }
  let buckets = [...bucketMap.values()].sort((a, b) => (
    b.count - a.count
    || a.entityType.localeCompare(b.entityType)
    || a.disposition.localeCompare(b.disposition)
  ));
  if (buckets.length > MAX_APPLICATION_AUDIT_BUCKETS) {
    buckets = buckets.slice(0, MAX_APPLICATION_AUDIT_BUCKETS);
  }

  let rows = sanitized.slice(0, MAX_APPLICATION_AUDIT_ROWS);
  let rowOverflowCount = Math.max(0, sanitized.length - rows.length);
  const manifest = {
    buckets,
    rows,
    rowOverflowCount,
    manifestGeneratedAt: now,
  };
  while (manifest.rows.length && applyManifestByteLength(manifest) > MAX_APPLICATION_AUDIT_MANIFEST_BYTES) {
    manifest.rows.pop();
    manifest.rowOverflowCount += 1;
  }
  while (manifest.buckets.length && applyManifestByteLength(manifest) > MAX_APPLICATION_AUDIT_MANIFEST_BYTES) {
    manifest.buckets.pop();
  }
  return manifest;
}

function sortedStrings(values) {
  return [...new Set((values || []).map((value) => trimString(value)).filter(Boolean))].sort();
}

function summarizePreviewRows(rows) {
  const summary = {
    creates: 0,
    updates: 0,
    unchanged: 0,
    conflicts: 0,
    rejected: 0,
    stale: 0,
  };
  const actionToSummaryKey = {
    create: 'creates',
    update: 'updates',
    unchanged: 'unchanged',
    conflict: 'conflicts',
    rejected: 'rejected',
    stale: 'stale',
  };
  for (const row of rows) {
    const summaryKey = actionToSummaryKey[row.action];
    if (summaryKey && summary[summaryKey] != null) summary[summaryKey] += 1;
  }
  return summary;
}

function comparablePreview(preview) {
  return JSON.stringify({
    jobId: preview?.jobId,
    contextVersion: preview?.contextVersion,
    basedOnContextVersion: preview?.basedOnContextVersion,
    applyAllowed: preview?.applyAllowed,
    blockingReasons: preview?.blockingReasons,
    applyWarnings: preview?.applyWarnings,
    rows: preview?.rows,
    summary: preview?.summary,
  });
}

function isApplyablePreviewRow(row) {
  return Boolean(row)
    && (row.action === 'create' || row.action === 'update');
}

function countApplicablePreviewRows(preview) {
  return (preview?.rows || []).filter(isApplyablePreviewRow).length;
}

async function buildApplyRequestContext(tenantKey, actor) {
  const normalizedTenantKey = trimString(tenantKey).toLowerCase();
  const [globalDb, db] = await Promise.all([
    connectToGlobalDatabase(),
    connectToDatabase(normalizedTenantKey),
  ]);
  return {
    globalDb,
    db,
    school: normalizedTenantKey,
    user: trimString(actor) ? { email: trimString(actor) } : {},
  };
}

function nativeTagsRequiredAbort(applied) {
  const writes = (Number(applied?.summary?.creates) || 0)
    + (Number(applied?.summary?.updates) || 0);
  if (writes > 0) return false;
  const skipped = applied?.skippedRows || [];
  return skipped.length > 0
    && skipped.every((row) => row.code === NATIVE_TAGS_REQUIRED);
}

async function finalizeStoredComputeJobApply(req, {
  externalJobId,
  actor,
  idempotencyKey,
  applied = null,
  error = null,
  now = new Date(),
} = {}) {
  if (applied) {
    if (nativeTagsRequiredAbort(applied)) {
      const reviewedJob = await completeComputeJobApply(req, {
        externalJobId,
        actor,
        idempotencyKey,
        summary: applied.summary,
        outcome: 'rejected',
        errorCode: NATIVE_TAGS_REQUIRED,
        errorMessage: 'Native Luma/Partiful rows were not published without catalog tags.',
        previewDrift: Boolean(applied.previewDrift),
        manifest: applied.manifest || null,
        recordAppliedAt: false,
        now,
      });
      notifyComputeJobAdminsBestEffort(req, { job: reviewedJob, type: 'review-required' });
      return {
        job: reviewedJob,
        duplicate: false,
        summary: applied.summary,
        outcome: 'rejected',
        skipCode: NATIVE_TAGS_REQUIRED,
        skippedRows: applied.skippedRows || [],
        previewDrift: Boolean(applied.previewDrift),
      };
    }
    const skippedCount = Number(applied.summary?.skipped) || 0;
    const outcome = skippedCount > 0 ? 'partial' : 'completed';
    const completed = await completeComputeJobApply(req, {
      externalJobId,
      actor,
      idempotencyKey,
      summary: applied.summary,
      outcome,
      previewDrift: Boolean(applied.previewDrift),
      manifest: applied.manifest || null,
      now,
    });
    notifyComputeJobAdminsBestEffort(req, { job: completed, type: 'apply-complete' });
    return {
      job: completed,
      duplicate: false,
      summary: applied.summary,
      outcome,
      skippedRows: applied.skippedRows || [],
      previewDrift: Boolean(applied.previewDrift),
    };
  }

  const partialSummary = error?.partialSummary || {
    creates: 0,
    updates: 0,
    unchanged: 0,
    conflicts: 0,
    stale: 0,
    rejected: 0,
    skipped: 0,
  };
  const appliedCount = (Number(partialSummary.creates) || 0) + (Number(partialSummary.updates) || 0);
  const outcome = appliedCount > 0 ? 'partial' : 'rejected';
  const reviewedJob = await completeComputeJobApply(req, {
    externalJobId,
    actor,
    idempotencyKey: trimString(idempotencyKey) || `apply-failed:${externalJobId}`,
    summary: partialSummary,
    outcome,
    errorCode: error?.code || null,
    errorMessage: error?.message || null,
    manifest: error?.applyManifest || null,
    now,
  });
  notifyComputeJobAdminsBestEffort(req, {
    job: reviewedJob,
    type: outcome === 'rejected' ? 'review-required' : 'apply-complete',
  });
  const rejected = {
    outcome,
    job: reviewedJob,
    summary: partialSummary,
    failedRow: error?.failedRow || null,
    validationIssues: error?.validationIssues || [],
    code: error?.code || null,
    message: error?.message || null,
  };
  if (error) {
    error.applyResult = rejected;
    return rejected;
  }
  return rejected;
}

function scheduleStoredComputeJobApply(input) {
  setImmediate(async () => {
    let req;
    const startedAt = Date.now();
    try {
      req = await buildApplyRequestContext(input.tenantKey, input.actor);
      const applied = await applyComputeResult(req, {
        result: input.embedded,
        preview: input.preview,
        idempotencyKey: input.idempotencyKey,
        actor: input.actor,
        now: input.now,
        externalJobId: input.externalJobId,
        onProgress: (summary) => updateComputeJobApplyProgress(req, {
          externalJobId: input.externalJobId,
          summary,
          now: new Date(),
        }),
      });
      const finished = await finalizeStoredComputeJobApply(req, {
        externalJobId: input.externalJobId,
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
        applied,
        now: input.now,
      });
      logPivot('info', 'background compute apply completed', {
        externalJobId: input.externalJobId,
        tenantKey: input.tenantKey,
        outcome: finished.outcome,
        creates: finished.summary?.creates || 0,
        updates: finished.summary?.updates || 0,
        skipped: finished.summary?.skipped || 0,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      logPivot('error', 'background compute apply failed', {
        externalJobId: input.externalJobId,
        tenantKey: input.tenantKey,
        code: error.code || null,
        message: error.message,
        durationMs: Date.now() - startedAt,
      });
      if (req) {
        try {
          await finalizeStoredComputeJobApply(req, {
            externalJobId: input.externalJobId,
            actor: input.actor,
            idempotencyKey: input.idempotencyKey,
            error,
            now: input.now,
          });
        } catch (finalizeError) {
          logPivot('error', 'background compute apply finalize failed', {
            externalJobId: input.externalJobId,
            tenantKey: input.tenantKey,
            message: finalizeError.message,
          });
        }
      }
    }
  });
}

const NATIVE_AUTO_TAG_PROVIDERS = new Set(['luma', 'partiful']);
const MAX_NATIVE_ASSIGNED_TAGS = 3;
const NATIVE_TAGS_REQUIRED = 'NATIVE_TAGS_REQUIRED';

const SKIPPABLE_EVENT_PUBLISH_CODES = new Set([
  'MISSING_REQUIRED_FIELDS',
  'INVALID_START_TIME',
  'RICH_LOCATION_INVALID',
  'RICH_LOCATION_UNRESOLVED',
  'DUPLICATE_EVENT',
  'GOOGLE_LOCATION_RATE_LIMITED',
  'GOOGLE_LOCATION_AUTH_FAILED',
  'GOOGLE_LOCATION_FAILED',
]);

function sourceRowKey(host) {
  return `host:${trimString(host).toLowerCase()}`;
}

function curationJobRowKey(proposal) {
  if (proposal.jobId) return `jobId:${proposal.jobId}`;
  return `provider:${proposal.provider}|url:${proposal.url || ''}`;
}

function eventRowKey(sourceUrl) {
  return `sourceUrl:${trimString(sourceUrl)}`;
}

function serializeEventIdentity(eventDoc) {
  const row = eventDoc?.toObject ? eventDoc.toObject() : eventDoc;
  const sourceUrl = trimString(row?.customFields?.pivot?.sourceUrl);
  const name = trimString(row?.name);
  if (!sourceUrl || !name) return null;
  const material = {
    id: String(row._id || ''),
    sourceUrl,
    name,
    startTime: row.start_time instanceof Date ? row.start_time.toISOString() : isoTimestamp(row.start_time),
    batchWeek: trimString(row?.customFields?.pivot?.batchWeek) || null,
    location: trimString(row?.location) || null,
    tags: sortedStrings(row?.customFields?.pivot?.tags),
    updatedAt: isoTimestamp(row?.updatedAt),
  };
  return {
    recordVersion: recordVersion('event', material),
    sourceUrl,
    eventId: String(row._id),
  };
}

function sourceProposalMaterial(proposal) {
  return {
    host: proposal.host,
    url: proposal.url,
    label: proposal.label ?? null,
    provider: proposal.provider,
    status: proposal.status,
    enabled: proposal.enabled !== false,
    seedTags: sortedStrings(proposal.seedTags),
    rejectedReason: proposal.rejectedReason ?? null,
  };
}

function curationJobProposalMaterial(proposal) {
  return {
    label: proposal.label,
    url: proposal.url ?? null,
    provider: proposal.provider,
    enabled: proposal.enabled !== false,
    defaultTags: sortedStrings(proposal.defaultTags),
  };
}

function eventProposalMaterial(proposal) {
  const draft = proposal.draft || {};
  return {
    sourceUrl: proposal.sourceUrl,
    batchWeek: proposal.batchWeek,
    draft: {
      name: draft.name,
      description: draft.description ?? null,
      image: draft.image ?? null,
      location: draft.location ?? null,
      rawLocationText: draft.rawLocationText ?? null,
      start_time: draft.start_time,
      end_time: draft.end_time ?? null,
      hostName: draft.hostName ?? null,
      hostProfileUrl: draft.hostProfileUrl ?? null,
      tags: sortedStrings(draft.tags),
    },
  };
}

function boundedReviewValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => boundedReviewValue(item));
  if (typeof value === 'string') return value.length > 240 ? `${value.slice(0, 237)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

function materialChanges(currentMaterial, proposalMaterial) {
  const current = currentMaterial?.draft || {};
  const proposed = proposalMaterial?.draft || {};
  const fields = [
    'name',
    'start_time',
    'end_time',
    'location',
    'rawLocationText',
    'hostName',
    'hostProfileUrl',
    'tags',
    'image',
    'description',
  ];
  const changes = [];
  if (currentMaterial?.batchWeek !== proposalMaterial?.batchWeek) {
    changes.push({
      field: 'batchWeek',
      before: boundedReviewValue(currentMaterial?.batchWeek),
      after: boundedReviewValue(proposalMaterial?.batchWeek),
    });
  }
  for (const field of fields) {
    if (JSON.stringify(current[field] ?? null) === JSON.stringify(proposed[field] ?? null)) continue;
    changes.push({
      field,
      before: boundedReviewValue(current[field]),
      after: boundedReviewValue(proposed[field]),
    });
  }
  return changes;
}

const REVIEW_WARNING_COPY = {
  STALE_EVENT: {
    title: 'Stale production records',
    message: 'Production changed after the worker snapshot, so these proposals need a fresh review.',
  },
  EVENT_CONFLICT: {
    title: 'Event conflicts',
    message: 'These proposals conflict with the current production state.',
  },
  PUBLISHED_EVENT_UPDATE: {
    title: 'Published events changing',
    message: 'Applying will immediately change events that are already visible in the feed.',
  },
  PAST_EVENT: {
    title: 'Events starting in the past',
    message: 'These proposed events have a start time earlier than this review.',
  },
  MATERIAL_EVENT_UPDATE: {
    title: 'Material event updates',
    message: 'These updates change identity, time, week, or location fields.',
  },
  HIGH_VOLUME_SOURCE: {
    title: 'High-volume sources',
    message: 'These sources produced an unusually large set of mutations.',
  },
  CURATION_JOB_INCOMPLETE: {
    title: 'Incomplete curation jobs',
    message: 'These curation jobs failed or were skipped during the refresh.',
  },
};

function aggregateReviewWarnings(attention) {
  const warnings = new Map();
  for (const item of attention) {
    const copy = REVIEW_WARNING_COPY[item.code] || {
      title: item.title || 'Review warning',
      message: item.message || 'Review these results before applying.',
    };
    const warning = warnings.get(item.code) || {
      code: item.code,
      title: copy.title,
      message: copy.message,
      severity: item.severity || 'attention',
      count: 0,
      samples: [],
    };
    warning.count += 1;
    if (item.severity === 'high') warning.severity = 'high';
    const candidates = item.samples?.length ? item.samples : [{
      title: item.title,
      sourceUrl: item.sourceUrl,
      jobLabel: item.jobLabel,
      provider: item.provider,
    }];
    for (const sample of candidates) {
      if (warning.samples.length >= 3 || !sample?.title) break;
      if (!warning.samples.some((current) => current.title === sample.title
        && current.sourceUrl === sample.sourceUrl)) {
        warning.samples.push({
          title: sample.title,
          sourceUrl: sample.sourceUrl || null,
          jobLabel: sample.jobLabel || item.jobLabel || null,
          provider: sample.provider || item.provider || null,
        });
      }
    }
    warnings.set(item.code, warning);
  }
  return [...warnings.values()].sort((a, b) =>
    (a.severity === b.severity ? 0 : (a.severity === 'high' ? -1 : 1))
    || (b.count - a.count)
    || a.title.localeCompare(b.title));
}

function buildCurationQuality(result) {
  const proposals = result.proposals?.events || [];
  const tagCounts = new Map();
  const batchWeekCounts = new Map();
  const missing = {
    untagged: { key: 'untagged', label: 'No tags', count: 0, samples: [] },
    missingHost: { key: 'missing-host', label: 'Missing host', count: 0, samples: [] },
    missingDescription: { key: 'missing-description', label: 'Missing description', count: 0, samples: [] },
    missingImage: { key: 'missing-image', label: 'Missing image', count: 0, samples: [] },
    missingLocation: { key: 'missing-location', label: 'Missing location', count: 0, samples: [] },
  };
  const eventsMissingAny = new Set();

  const markMissing = (bucket, proposal, index) => {
    bucket.count += 1;
    eventsMissingAny.add(index);
    if (bucket.samples.length < 3) {
      bucket.samples.push({
        title: trimString(proposal.draft?.name) || proposal.sourceUrl,
        sourceUrl: proposal.sourceUrl,
      });
    }
  };

  proposals.forEach((proposal, index) => {
    const draft = proposal.draft || {};
    const tags = sortedStrings(draft.tags);
    if (!tags.length) markMissing(missing.untagged, proposal, index);
    for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);

    if (!trimString(draft.hostName)) markMissing(missing.missingHost, proposal, index);
    if (!trimString(draft.description)) markMissing(missing.missingDescription, proposal, index);
    if (!trimString(draft.image)) markMissing(missing.missingImage, proposal, index);
    if (!trimString(draft.location)) markMissing(missing.missingLocation, proposal, index);

    const batchWeek = trimString(proposal.batchWeek);
    if (batchWeek) batchWeekCounts.set(batchWeek, (batchWeekCounts.get(batchWeek) || 0) + 1);
  });

  const batchWeeks = [...batchWeekCounts.entries()]
    .map(([batchWeek, count]) => ({ batchWeek, count }))
    .sort((a, b) => a.batchWeek.localeCompare(b.batchWeek));
  const missingMetadata = Object.values(missing).filter((item) => item.count > 0);

  return {
    eventCount: proposals.length,
    metadataComplete: proposals.length - eventsMissingAny.size,
    eventsMissingMetadata: eventsMissingAny.size,
    needsRichData: proposals.filter((proposal) =>
      !trimString(proposal.draft?.description) || !trimString(proposal.draft?.image)).length,
    resolvedBatchWeek: batchWeeks.length === 1 ? batchWeeks[0].batchWeek : null,
    batchWeeks,
    tagBreakdown: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag)),
    missingMetadata,
  };
}

function buildApplyPlan(result, identities, preview, now = new Date()) {
  const rowByKey = new Map(preview.rows.map((row) => [row.key, row]));
  const destinationCounts = new Map();
  const batchWeekCounts = new Map();
  const batchWeekSourceCounts = new Map();

  for (const proposal of result.proposals?.events || []) {
    const row = rowByKey.get(eventRowKey(proposal.sourceUrl));
    if (!isApplyablePreviewRow(row)) continue;

    const currentDoc = identities.eventDocBySourceUrl.get(proposal.sourceUrl) || null;
    const currentStatus = trimString(currentDoc?.customFields?.pivot?.ingestStatus);
    const status = row.action === 'create'
      ? 'staged'
      : (['draft', 'staged', 'published'].includes(currentStatus) ? currentStatus : 'staged');
    const destinationKey = `${row.action}:${status}`;
    const destination = destinationCounts.get(destinationKey) || {
      action: row.action,
      status,
      count: 0,
    };
    destination.count += 1;
    destinationCounts.set(destinationKey, destination);

    const week = resolveEventBatchWeek({
      batchWeek: proposal.batchWeek,
      startTime: proposal.draft?.start_time,
      timeSlots: proposal.draft?.timeSlots,
      now,
    });
    if (!week.error) {
      batchWeekCounts.set(week.batchWeek, (batchWeekCounts.get(week.batchWeek) || 0) + 1);
      batchWeekSourceCounts.set(week.source, (batchWeekSourceCounts.get(week.source) || 0) + 1);
    }
  }

  const entityRows = (entityType) => preview.rows.filter((row) =>
    row.entityType === entityType && isApplyablePreviewRow(row));
  const summarizeEntityRows = (entityType) => {
    const rows = entityRows(entityType);
    return {
      creates: rows.filter((row) => row.action === 'create').length,
      updates: rows.filter((row) => row.action === 'update').length,
    };
  };

  return {
    eventDestinations: [...destinationCounts.values()].sort((a, b) =>
      ['published', 'staged', 'draft'].indexOf(a.status) - ['published', 'staged', 'draft'].indexOf(b.status)
      || a.action.localeCompare(b.action)),
    batchWeeks: [...batchWeekCounts.entries()]
      .map(([batchWeek, count]) => ({ batchWeek, count }))
      .sort((a, b) => a.batchWeek.localeCompare(b.batchWeek)),
    batchWeekSources: [...batchWeekSourceCounts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => (b.count - a.count) || a.source.localeCompare(b.source)),
    sources: summarizeEntityRows('source'),
    curationJobs: result.kind === 'city-source-discovery'
      ? summarizeEntityRows('curationJob')
      : { creates: 0, updates: 0 },
  };
}

function buildComputeReview(result, identities, preview, now = new Date()) {
  const rowByKey = new Map(preview.rows.map((row) => [row.key, row]));
  const jobGroups = new Map();
  const attention = [];
  const impact = {
    eventCreates: 0,
    eventUpdates: 0,
    publishedEventUpdates: 0,
    stagedEventUpdates: 0,
    unchangedEvents: 0,
    sourceMutations: preview.rows.filter((row) => row.entityType === 'source' && isApplyablePreviewRow(row)).length,
    curationJobMutations: result.kind === 'city-source-discovery'
      ? preview.rows.filter((row) => row.entityType === 'curationJob' && isApplyablePreviewRow(row)).length
      : 0,
    skippedEvents: preview.summary?.skipped || 0,
  };

  for (const proposal of result.proposals?.events || []) {
    const key = eventRowKey(proposal.sourceUrl);
    const row = rowByKey.get(key);
    const currentDoc = identities.eventDocBySourceUrl.get(proposal.sourceUrl) || null;
    const currentMaterial = currentDoc ? eventDocToProposalMaterial(currentDoc) : null;
    const proposalMaterial = eventProposalMaterial(proposal);
    const ingestStatus = trimString(currentDoc?.customFields?.pivot?.ingestStatus) || null;
    const job = proposal.linkedJobId ? identities.jobById.get(proposal.linkedJobId) : null;
    const groupKey = proposal.linkedJobId || proposal.evidence?.discoveredFromHost || 'unattributed';
    const group = jobGroups.get(groupKey) || {
      key: groupKey,
      jobId: proposal.linkedJobId || null,
      label: job?.label || proposal.evidence?.discoveredFromHost || 'Unattributed events',
      provider: job?.provider || proposal.evidence?.provider || null,
      host: job?.linkedSourceHost || proposal.evidence?.discoveredFromHost || null,
      creates: 0,
      updates: 0,
      unchanged: 0,
      attention: 0,
      samples: [],
    };
    if (row?.missingFields?.length) {
      // Counted in impact.skippedEvents; excluded from apply plan.
    } else if (row?.action === 'create') {
      impact.eventCreates += 1;
      group.creates += 1;
    } else if (row?.action === 'update') {
      impact.eventUpdates += 1;
      group.updates += 1;
      if (ingestStatus === 'published') impact.publishedEventUpdates += 1;
      else impact.stagedEventUpdates += 1;
    } else if (row?.action === 'unchanged') {
      impact.unchangedEvents += 1;
      group.unchanged += 1;
    }
    if (group.samples.length < 3 && row?.action !== 'unchanged') {
      group.samples.push({
        title: proposal.draft?.name || proposal.sourceUrl,
        start: proposal.draft?.start_time || null,
        action: row?.action || null,
        sourceUrl: proposal.sourceUrl,
      });
    }

    const changes = currentMaterial ? materialChanges(currentMaterial, proposalMaterial) : [];
    const proposedStart = Date.parse(proposal.draft?.start_time);
    let risk = null;
    if (row?.action === 'stale' || row?.action === 'conflict') {
      risk = {
        code: row.action === 'stale' ? 'STALE_EVENT' : 'EVENT_CONFLICT',
        severity: 'high',
        message: row.message || 'Production no longer matches the worker snapshot.',
      };
    } else if (row?.action === 'update' && ingestStatus === 'published') {
      risk = {
        code: 'PUBLISHED_EVENT_UPDATE',
        severity: 'high',
        message: 'Applying this row changes an event that is already visible in the feed.',
      };
    } else if (Number.isFinite(proposedStart) && proposedStart < now.getTime()) {
      risk = {
        code: 'PAST_EVENT',
        severity: 'attention',
        message: 'The proposed event start is already in the past.',
      };
    } else if (row?.action === 'update' && changes.some((change) => [
      'name', 'start_time', 'end_time', 'location', 'batchWeek',
    ].includes(change.field))) {
      risk = {
        code: 'MATERIAL_EVENT_UPDATE',
        severity: 'attention',
        message: 'This update changes identity, time, week, or location fields.',
      };
    }
    if (risk) {
      group.attention += 1;
      attention.push({
        ...risk,
        key,
        title: proposal.draft?.name || proposal.sourceUrl,
        sourceUrl: proposal.sourceUrl,
        jobId: proposal.linkedJobId || null,
        jobLabel: group.label,
        provider: group.provider,
        ingestStatus,
        changes: changes.slice(0, 12),
      });
    }
    jobGroups.set(groupKey, group);
  }

  for (const group of jobGroups.values()) {
    const mutationCount = group.creates + group.updates;
    if (mutationCount < 50) continue;
    group.attention += 1;
    attention.push({
      code: 'HIGH_VOLUME_SOURCE',
      severity: 'attention',
      key: `group:${group.key}`,
      title: group.label,
      sourceUrl: group.host ? `https://${group.host}` : null,
      jobId: group.jobId,
      jobLabel: group.label,
      provider: group.provider,
      ingestStatus: null,
      message: `${mutationCount} event mutations came from this curation job. Review its source health and sample its dates before applying.`,
      changes: [],
      samples: group.samples,
    });
  }

  const outcomes = (result.proposals?.jobOutcomes || []).map((outcome) => {
    const job = identities.jobById.get(outcome.jobId) || null;
    const row = rowByKey.get(curationJobRowKey({ jobId: outcome.jobId }));
    const entry = {
      jobId: outcome.jobId,
      label: job?.label || outcome.jobId,
      provider: job?.provider || null,
      host: job?.linkedSourceHost || null,
      outcome: outcome.outcome,
      message: outcome.failure?.message || row?.message || null,
    };
    if (outcome.outcome !== 'completed') {
      attention.push({
        code: 'CURATION_JOB_INCOMPLETE',
        severity: 'high',
        key: `jobId:${outcome.jobId}`,
        title: entry.label,
        jobId: outcome.jobId,
        jobLabel: entry.label,
        provider: entry.provider,
        sourceUrl: null,
        ingestStatus: null,
        message: entry.message || `Curation job ${outcome.outcome}.`,
        changes: [],
      });
    }
    return entry;
  });

  const starts = (result.proposals?.events || [])
    .map((proposal) => proposal.draft?.start_time)
    .filter((value) => !Number.isNaN(Date.parse(value)))
    .sort();

  return {
    executionSummary: result.summary || {},
    timezone: trimString(identities.tenant?.pivotDropTimezone) || 'UTC',
    impact,
    sourceHealth: {
      completed: outcomes.filter((row) => row.outcome === 'completed').length,
      failed: outcomes.filter((row) => row.outcome === 'failed').length,
      skipped: outcomes.filter((row) => row.outcome === 'skipped').length,
      outcomes,
    },
    eventWindow: {
      earliestStart: starts[0] || null,
      latestStart: starts[starts.length - 1] || null,
    },
    attention: attention.slice(0, 500),
    attentionTotal: attention.length,
    warningGroups: aggregateReviewWarnings(attention),
    curationQuality: buildCurationQuality(result),
    applyPlan: buildApplyPlan(result, identities, preview, now),
    groups: [...jobGroups.values()].sort((a, b) =>
      (b.attention - a.attention)
      || ((b.creates + b.updates) - (a.creates + a.updates))
      || a.label.localeCompare(b.label)),
  };
}

function classifyVersionedProposal({
  entityType,
  key,
  proposalAction,
  basedOnRecordVersion,
  current,
  proposalMaterial,
  currentMaterial,
  rejectedReason = null,
}) {
  const evidence = {};
  if (entityType === 'source') {
    evidence.host = key.replace(/^host:/, '');
  }
  if (entityType === 'event') {
    evidence.sourceUrl = key.replace(/^sourceUrl:/, '');
  }
  if (entityType === 'curationJob' && current?.jobId) {
    evidence.jobId = current.jobId;
  }

  if (rejectedReason) {
    return {
      entityType,
      action: 'rejected',
      key,
      basedOnRecordVersion: basedOnRecordVersion ?? null,
      currentRecordVersion: current?.recordVersion ?? null,
      message: rejectedReason,
      evidence,
    };
  }

  if (!current) {
    if (proposalAction === 'create' || proposalAction === 'upsert') {
      return {
        entityType,
        action: 'create',
        key,
        basedOnRecordVersion: basedOnRecordVersion ?? null,
        currentRecordVersion: null,
        message: null,
        evidence,
      };
    }
    return {
      entityType,
      action: 'rejected',
      key,
      basedOnRecordVersion: basedOnRecordVersion ?? null,
      currentRecordVersion: null,
      message: 'Cannot update a record that does not exist.',
      evidence,
    };
  }

  if (basedOnRecordVersion && basedOnRecordVersion !== current.recordVersion) {
    return {
      entityType,
      action: 'stale',
      key,
      basedOnRecordVersion,
      currentRecordVersion: current.recordVersion,
      message: 'Production record changed after the worker snapshot.',
      evidence,
    };
  }

  const proposalHash = recordVersion('preview', proposalMaterial);
  const currentHash = recordVersion('preview', currentMaterial);
  if (proposalHash === currentHash) {
    return {
      entityType,
      action: 'unchanged',
      key,
      basedOnRecordVersion: basedOnRecordVersion ?? current.recordVersion,
      currentRecordVersion: current.recordVersion,
      message: null,
      evidence,
    };
  }

  if (proposalAction === 'update' || proposalAction === 'upsert' || proposalAction === 'create') {
    return {
      entityType,
      action: 'update',
      key,
      basedOnRecordVersion: basedOnRecordVersion ?? current.recordVersion,
      currentRecordVersion: current.recordVersion,
      message: null,
      evidence,
    };
  }

  return {
    entityType,
    action: 'conflict',
    key,
    basedOnRecordVersion: basedOnRecordVersion ?? null,
    currentRecordVersion: current.recordVersion,
    message: 'Proposal action is incompatible with current production state.',
    evidence,
  };
}

function validateComputeExecutionResult(result) {
  if (trimString(result?.contractVersion) !== CONTRACT_VERSION) {
    throw serviceError(
      `Unsupported compute contract version: ${result?.contractVersion || 'unknown'}`,
      'UNSUPPORTED_COMPUTE_CONTRACT_VERSION',
      400,
    );
  }
  const validation = validateExecutionResult(result);
  if (!validation.valid) {
    throw serviceError(
      `Invalid compute execution result: ${validation.errors.join(', ')}`,
      'INVALID_COMPUTE_EXECUTION_RESULT',
      400,
    );
  }
  if (result.outcome !== 'completed') {
    throw serviceError(
      'Only completed compute results can be previewed or applied.',
      'COMPUTE_RESULT_NOT_APPLYABLE',
      409,
    );
  }
  return result;
}

async function resolvePivotTenant(req, tenantKey) {
  const { resolvePivotTenant: resolveTenant } = require('./pivotIngestPublishService');
  return resolveTenant(req, tenantKey);
}

async function resolveCurrentContextVersion(req, result, { authorize = null } = {}) {
  const options = {
    cityKey: result.cityKey,
    jobId: result.jobId,
    scheduleOccurrenceId: result.scheduleOccurrenceId ?? null,
    authorize: authorize || (async () => null),
  };
  if (result.kind === 'city-source-discovery') {
    const { buildCityDiscoveryContextSnapshot } = require('./pivotOffloadedDiscoveryContextService');
    const built = await buildCityDiscoveryContextSnapshot(req, options);
    if (built?.error) throw serviceError(built.error, built.code || 'DISCOVERY_CONTEXT_FAILED', built.status || 500);
    return built.data.snapshot.contextVersion;
  }
  const { buildCityCurationRefreshContextSnapshot } = require('./pivotOffloadedCurationRefreshContextService');
  const built = await buildCityCurationRefreshContextSnapshot(req, options);
  if (built?.error) throw serviceError(built.error, built.code || 'REFRESH_CONTEXT_FAILED', built.status || 500);
  return built.data.snapshot.contextVersion;
}

async function loadProductionIdentities(req, result) {
  const tenantResult = await resolvePivotTenant(req, result.cityKey);
  if (tenantResult.error) {
    throw serviceError(tenantResult.error, tenantResult.code || 'TENANT_NOT_FOUND', tenantResult.status || 404);
  }

  const {
    serializeSourceIdentity,
    serializeCurationJobIdentity,
  } = require('./pivotOffloadedDiscoveryContextService');

  const { PivotCitySource, PivotCurationJob } = getGlobalModels(req, 'PivotCitySource', 'PivotCurationJob');
  const [sourceRows, jobRows] = await Promise.all([
    PivotCitySource.find({ tenantKey: result.cityKey }).lean(),
    PivotCurationJob.find({ tenantKey: result.cityKey }).lean(),
  ]);

  const sources = sourceRows.map(serializeSourceIdentity).filter(Boolean);
  let curationJobs;
  if (result.kind === 'city-curation-refresh') {
    const { serializeRefreshJobIdentity } = require('./pivotOffloadedCurationRefreshContextService');
    curationJobs = jobRows.map((row) => serializeRefreshJobIdentity(row)).filter(Boolean);
  } else {
    curationJobs = jobRows.map(serializeCurationJobIdentity).filter(Boolean);
  }

  const sourceByHost = new Map(sources.map((row) => [row.host, row]));
  const jobById = new Map(curationJobs.map((row) => [row.jobId, row]));
  const jobByKey = new Map(curationJobs.map((row) => [curationJobRowKey(row), row]));

  let eventBySourceUrl = new Map();
  let eventDocBySourceUrl = new Map();
  const eventUrls = (result.proposals?.events || []).map((row) => trimString(row.sourceUrl)).filter(Boolean);
  if (eventUrls.length) {
    const { Event } = getModels(req, 'Event');
    const eventRows = await Event.find({
      'customFields.pivot.sourceUrl': { $in: eventUrls },
    }).lean();
    for (const eventDoc of eventRows) {
      const identity = serializeEventIdentity(eventDoc);
      if (!identity) continue;
      eventBySourceUrl.set(identity.sourceUrl, identity);
      eventDocBySourceUrl.set(identity.sourceUrl, eventDoc);
    }
  }

  return {
    tenant: tenantResult.tenant,
    sourceByHost,
    jobById,
    jobByKey,
    eventBySourceUrl,
    eventDocBySourceUrl,
  };
}

function eventDocToProposalMaterial(eventDoc) {
  const row = eventDoc?.toObject ? eventDoc.toObject() : eventDoc;
  return eventProposalMaterial({
    sourceUrl: trimString(row?.customFields?.pivot?.sourceUrl),
    batchWeek: trimString(row?.customFields?.pivot?.batchWeek) || null,
    draft: {
      name: row?.name,
      description: row?.description ?? null,
      image: row?.image ?? null,
      location: row?.location ?? null,
      rawLocationText: row?.customFields?.pivot?.rawLocationText ?? null,
      start_time: row?.start_time instanceof Date ? row.start_time.toISOString() : row?.start_time,
      end_time: row?.end_time instanceof Date ? row.end_time.toISOString() : row?.end_time ?? null,
      hostName: row?.customFields?.pivot?.host?.name ?? null,
      hostProfileUrl: row?.customFields?.pivot?.host?.profileUrl ?? null,
      tags: row?.customFields?.pivot?.tags,
    },
  });
}

function previewDiscoveryProposals(result, identities) {
  const rows = [];
  for (const proposal of result.proposals?.sources || []) {
    const current = identities.sourceByHost.get(proposal.host) || null;
    rows.push(classifyVersionedProposal({
      entityType: 'source',
      key: sourceRowKey(proposal.host),
      proposalAction: proposal.action,
      basedOnRecordVersion: proposal.basedOnRecordVersion,
      current,
      proposalMaterial: sourceProposalMaterial(proposal),
      currentMaterial: current ? sourceProposalMaterial({ ...current, action: 'update', seedTags: current.seedTags }) : null,
      rejectedReason: proposal.status === 'rejected' ? (proposal.rejectedReason || 'rejected') : null,
    }));
  }

  for (const proposal of result.proposals?.curationJobs || []) {
    const current = identities.jobByKey.get(curationJobRowKey(proposal)) || null;
    rows.push(classifyVersionedProposal({
      entityType: 'curationJob',
      key: curationJobRowKey(proposal),
      proposalAction: proposal.action,
      basedOnRecordVersion: proposal.basedOnRecordVersion,
      current,
      proposalMaterial: curationJobProposalMaterial(proposal),
      currentMaterial: current ? curationJobProposalMaterial(current) : null,
    }));
  }

  for (const proposal of result.proposals?.events || []) {
    const current = identities.eventBySourceUrl.get(proposal.sourceUrl) || null;
    const currentDoc = identities.eventDocBySourceUrl.get(proposal.sourceUrl) || null;
    rows.push(classifyVersionedProposal({
      entityType: 'event',
      key: eventRowKey(proposal.sourceUrl),
      proposalAction: proposal.action,
      basedOnRecordVersion: proposal.basedOnEventVersion,
      current,
      proposalMaterial: eventProposalMaterial(proposal),
      currentMaterial: currentDoc ? eventDocToProposalMaterial(currentDoc) : null,
    }));
  }

  return rows;
}

function previewRefreshProposals(result, identities) {
  const rows = [];
  for (const outcome of result.proposals?.jobOutcomes || []) {
    const current = identities.jobById.get(outcome.jobId) || null;
    rows.push(classifyVersionedProposal({
      entityType: 'curationJob',
      key: curationJobRowKey({ jobId: outcome.jobId }),
      proposalAction: 'update',
      basedOnRecordVersion: outcome.basedOnRecordVersion,
      current,
      proposalMaterial: { outcome: outcome.outcome },
      currentMaterial: current ? { outcome: 'completed' } : null,
      rejectedReason: outcome.outcome === 'failed' || outcome.outcome === 'skipped'
        ? (outcome.failure?.message || outcome.outcome)
        : null,
    }));
  }

  for (const proposal of result.proposals?.events || []) {
    const current = identities.eventBySourceUrl.get(proposal.sourceUrl) || null;
    const currentDoc = identities.eventDocBySourceUrl.get(proposal.sourceUrl) || null;
    rows.push(classifyVersionedProposal({
      entityType: 'event',
      key: eventRowKey(proposal.sourceUrl),
      proposalAction: proposal.action,
      basedOnRecordVersion: proposal.basedOnEventVersion,
      current,
      proposalMaterial: eventProposalMaterial(proposal),
      currentMaterial: currentDoc ? eventDocToProposalMaterial(currentDoc) : null,
    }));
  }

  return rows;
}

function buildPreviewEnvelope(result, currentContextVersion, rows, now = new Date()) {
  const blockingReasons = [];
  if (isStaleContextPreview({ basedOnContextVersion: result.basedOnContextVersion }, currentContextVersion)) {
    blockingReasons.push({
      code: 'STALE_CONTEXT',
      message: `Result was computed against ${result.basedOnContextVersion} but production is now ${currentContextVersion}.`,
    });
  }
  if (rows.some((row) => row.action === 'stale')) {
    blockingReasons.push({
      code: 'STALE_ROWS',
      message: 'One or more proposed rows are stale relative to current production records.',
    });
  }
  if (rows.some((row) => row.action === 'conflict')) {
    blockingReasons.push({
      code: 'ROW_CONFLICT',
      message: 'One or more proposed rows conflict with current production records.',
    });
  }

  const applyAllowed = blockingReasons.length === 0
    && rows.some((row) => row.action === 'create' || row.action === 'update');

  const preview = {
    contractVersion: CONTRACT_VERSION,
    jobId: result.jobId,
    scheduleOccurrenceId: result.scheduleOccurrenceId ?? null,
    kind: result.kind,
    cityKey: result.cityKey,
    implementationRevision: result.implementationRevision,
    contextVersion: currentContextVersion,
    basedOnContextVersion: result.basedOnContextVersion,
    previewedAt: isoTimestamp(now) || now.toISOString(),
    applyAllowed,
    blockingReasons,
    rows: rows.slice(0, MAX_PREVIEW_ROWS),
    summary: summarizePreviewRows(rows),
  };

  const validation = validateResultPreview(preview);
  if (!validation.valid) {
    throw serviceError(
      `Generated preview failed validation: ${validation.errors.join(', ')}`,
      'INVALID_COMPUTE_RESULT_PREVIEW',
      500,
    );
  }
  return preview;
}

function annotatePreviewMissingEventFields(result, preview) {
  const rowByKey = new Map(preview.rows.map((row) => [row.key, row]));
  const invalid = [];
  for (const proposal of result.proposals?.events || []) {
    const row = rowByKey.get(eventRowKey(proposal.sourceUrl));
    if (row?.action !== 'create' && row?.action !== 'update') continue;
    const missingFields = requiredEventFieldsMissing(proposal);
    if (!missingFields.length) continue;
    row.missingFields = missingFields;
    if (!trimString(row.message)) {
      row.message = `Likely skipped on apply. Missing: ${missingFields.join(', ')}.`;
    }
    invalid.push({ proposal, missingFields });
  }
  if (!invalid.length) return preview;

  const fields = sortedStrings(invalid.flatMap((item) => item.missingFields));
  preview.summary.skipped = invalid.length;
  preview.applyWarnings = preview.applyWarnings || [];
  preview.applyWarnings.push({
    code: 'MISSING_REQUIRED_EVENT_FIELDS',
    message: `${invalid.length} event proposal${invalid.length === 1 ? '' : 's'} may be skipped during apply. Missing: ${fields.join(', ')}. Apply uses the same ingest rules as legacy refresh (draft/staged by metadata quality).`,
    skippedCount: invalid.length,
  });
  return preview;
}

async function previewComputeResult(req, resultInput, {
  currentContextVersion = null,
  now = new Date(),
  authorize = null,
} = {}) {
  if (resultInput?.kind === 'carousel-export') {
    throw serviceError('Carousel export results do not support preview.', 'CAROUSEL_PREVIEW_UNSUPPORTED', 409);
  }
  const result = validateComputeExecutionResult(resultInput);
  const contextVersion = currentContextVersion
    || await resolveCurrentContextVersion(req, result, { authorize });
  const identities = await loadProductionIdentities(req, result);
  const rows = result.kind === 'city-curation-refresh'
    ? previewRefreshProposals(result, identities)
    : previewDiscoveryProposals(result, identities);
  return annotatePreviewMissingEventFields(
    result,
    buildPreviewEnvelope(result, contextVersion, rows, now),
  );
}

async function previewComputeResultWithReview(req, resultInput, {
  currentContextVersion = null,
  now = new Date(),
  authorize = null,
} = {}) {
  if (resultInput?.kind === 'carousel-export') {
    throw serviceError('Carousel export results do not support preview.', 'CAROUSEL_PREVIEW_UNSUPPORTED', 409);
  }
  const result = validateComputeExecutionResult(resultInput);
  const contextVersion = currentContextVersion
    || await resolveCurrentContextVersion(req, result, { authorize });
  const identities = await loadProductionIdentities(req, result);
  const rows = result.kind === 'city-curation-refresh'
    ? previewRefreshProposals(result, identities)
    : previewDiscoveryProposals(result, identities);
  const preview = annotatePreviewMissingEventFields(
    result,
    buildPreviewEnvelope(result, contextVersion, rows, now),
  );
  return {
    preview,
    review: buildComputeReview(result, identities, preview, now),
  };
}

async function applySourceRow(req, result, proposal) {
  const { persistOutcome } = require('./pivotSourceDiscoveryService');
  const outcome = {
    candidate: {
      host: proposal.host,
      seedTags: new Set(proposal.seedTags || []),
      discoveredVia: 'compute-apply',
    },
    status: proposal.status,
    provider: proposal.provider,
    url: proposal.url,
    label: proposal.label,
    eventCount: proposal.evidence?.eventCount || 0,
    rejectedReason: proposal.rejectedReason || null,
  };
  await persistOutcome(req, result.cityKey, outcome, new Date());
  return {
    applied: true,
    host: proposal.host || null,
    url: proposal.url || null,
    label: proposal.label || null,
  };
}

async function findCurationJobProposal(result, proposal, identities) {
  return identities.jobByKey.get(curationJobRowKey(proposal))
    || [...identities.jobById.values()].find((row) => row.label === proposal.label && row.provider === proposal.provider)
    || null;
}

async function applyCurationJobRow(req, result, proposal, identities) {
  const { createCurationJob, updateCurationJob } = require('./pivotCurationJobService');
  const existing = await findCurationJobProposal(result, proposal, identities);
  if (!existing) {
    const created = await createCurationJob(req, {
      tenantKey: result.cityKey,
      label: proposal.label,
      url: proposal.url,
      provider: proposal.provider,
      defaultTags: proposal.defaultTags || [],
      enabled: proposal.enabled !== false,
      defaultBatchWeekStrategy: 'next-drop',
    });
    const jobId = created?.data?.job?._id ? String(created.data.job._id) : null;
    return {
      created: true,
      jobId,
      label: proposal.label || null,
      url: proposal.url || null,
    };
  }
  await updateCurationJob(req, {
    tenantKey: result.cityKey,
    jobId: existing.jobId,
    url: proposal.url,
    defaultTags: proposal.defaultTags,
    enabled: proposal.enabled,
  });
  return {
    created: false,
    jobId: existing.jobId || null,
    label: existing.label || proposal.label || null,
    url: proposal.url || existing.url || null,
  };
}

function nonemptyTagSlugs(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((tag) => trimString(tag))
      .filter(Boolean),
  )];
}

function nativeEventProvider(proposal, linkedJob) {
  return (
    trimString(linkedJob?.provider).toLowerCase()
    || trimString(proposal?.evidence?.provider).toLowerCase()
  );
}

function storedEventTagSlugs(identities, sourceUrl) {
  const eventDoc = identities?.eventDocBySourceUrl?.get(sourceUrl);
  return nonemptyTagSlugs(eventDoc?.customFields?.pivot?.tags);
}

function tagAssignerManifestMessage(tagAssigner) {
  const provider = trimString(tagAssigner?.provider);
  const model = trimString(tagAssigner?.model);
  const parts = [provider, model].filter(Boolean);
  return parts.length ? `tagAssigner:${parts.join(':')}` : null;
}

async function resolveApplyEventTags(req, result, proposal, identities, linkedJob, defaultTags) {
  const draft = proposal?.draft || {};
  const draftTags = nonemptyTagSlugs(draft.tags);
  const jobDefaultTags = nonemptyTagSlugs(defaultTags);
  const storedTags = storedEventTagSlugs(identities, proposal?.sourceUrl);
  const existingTags = draftTags.length ? draftTags : (storedTags.length ? storedTags : jobDefaultTags);
  const provider = nativeEventProvider(proposal, linkedJob);
  const needsNativeAssign = NATIVE_AUTO_TAG_PROVIDERS.has(provider)
    && !draftTags.length
    && !jobDefaultTags.length
    && !storedTags.length;

  if (!needsNativeAssign) {
    return { tags: existingTags, tagAssigner: null, nativeTagsRequired: false };
  }

  const { assignTags } = require('../utilities/pivotTagAssigner');
  const assigned = await assignTags({
    event: draft,
    tenantKey: result.cityKey,
    req,
  });
  if (!assigned?.error && Array.isArray(assigned?.tags) && assigned.tags.length) {
    return {
      tags: assigned.tags.slice(0, MAX_NATIVE_ASSIGNED_TAGS),
      tagAssigner: {
        provider: assigned.provider || null,
        model: assigned.model || null,
      },
      nativeTagsRequired: false,
    };
  }

  return {
    tags: existingTags,
    tagAssigner: null,
    nativeTagsRequired: true,
    assignerError: trimString(assigned?.error)
      || 'Catalog tags could not be assigned for this native listing.',
    assignerCode: trimString(assigned?.code) || null,
  };
}

async function applyEventRow(req, result, proposal, identities) {
  const { pickIngestStatus } = require('./pivotCurationRunService');
  const { publishIngestEvent } = require('./pivotIngestPublishService');
  const draft = proposal?.draft || {};
  const linkedJob = proposal?.linkedJobId
    ? identities?.jobById?.get(proposal.linkedJobId)
    : null;
  const defaultTags = Array.isArray(linkedJob?.defaultTags) ? linkedJob.defaultTags : [];
  const {
    tags,
    tagAssigner,
    nativeTagsRequired,
    assignerError,
  } = await resolveApplyEventTags(
    req,
    result,
    proposal,
    identities,
    linkedJob,
    defaultTags,
  );
  if (nativeTagsRequired && !tags.length) {
    return {
      skipped: true,
      code: NATIVE_TAGS_REQUIRED,
      message: assignerError,
      title: trimString(draft.name) || proposal.sourceUrl || eventRowKey(proposal.sourceUrl),
      sourceUrl: proposal.sourceUrl || null,
      batchWeek: proposal.batchWeek || null,
      curationJobId: linkedJob?.jobId || proposal.linkedJobId || null,
      curationJobLabel: linkedJob?.label || null,
      missingFields: [NATIVE_TAGS_REQUIRED],
    };
  }
  const ingestStatus = pickIngestStatus(tags, draft);

  const published = await publishIngestEvent(req, {
    tenantKey: result.cityKey,
    draft,
    batchWeek: proposal.batchWeek,
    url: proposal.sourceUrl,
    tagsRequired: false,
    resolveRichLocation: true,
    overrides: {
      name: draft.name,
      description: draft.description,
      image: draft.image,
      location: draft.location,
      rawLocationText: draft.rawLocationText,
      richLocation: draft.richLocation,
      locationReview: draft.locationReview,
      start_time: draft.start_time,
      end_time: draft.end_time,
      hostName: draft.hostName,
      hostImageUrl: draft.hostImageUrl,
      hostProfileUrl: draft.hostProfileUrl,
      hostIdentities: draft.hostIdentities,
      organizerIds: Array.isArray(draft.organizerIds) ? draft.organizerIds : undefined,
      source: draft.source,
      sourceUrl: proposal.sourceUrl,
      tags,
      ingestStatus,
      timeSlots: draft.timeSlots,
      parsed: draft.parsed,
    },
  });

  if (published?.error) {
    const code = published.code || 'EVENT_APPLY_FAILED';
    if (SKIPPABLE_EVENT_PUBLISH_CODES.has(code) || published.status === 503) {
      return {
        skipped: true,
        code,
        message: published.error,
        title: trimString(draft.name) || proposal.sourceUrl || eventRowKey(proposal.sourceUrl),
        sourceUrl: proposal.sourceUrl || null,
        batchWeek: proposal.batchWeek || null,
        curationJobId: linkedJob?.jobId || proposal.linkedJobId || null,
        curationJobLabel: linkedJob?.label || null,
        missingFields: code === 'MISSING_REQUIRED_FIELDS'
          ? requiredEventFieldsMissing(proposal)
          : [],
      };
    }
    throw serviceError(published.error, code, published.status || 500);
  }

  const eventId = published.data?.event?._id ? String(published.data.event._id) : null;
  return {
    applied: true,
    created: !published.data?.updated,
    eventId,
    ingestStatus: published.data?.ingestStatus || ingestStatus || null,
    batchWeek: proposal.batchWeek || null,
    curationJobId: linkedJob?.jobId || proposal.linkedJobId || null,
    curationJobLabel: linkedJob?.label || null,
    tagAssigner,
    message: tagAssignerManifestMessage(tagAssigner),
  };
}

function requiredEventFieldsMissing(proposal) {
  const draft = proposal?.draft || {};
  const missing = [];
  if (!trimString(draft.hostName)) missing.push('hostName');
  if (!trimString(draft.name)) missing.push('name');
  if (!trimString(draft.location)) missing.push('location');
  if (!trimString(draft.start_time) && !draft.timeSlots?.length) missing.push('start_time');
  return missing;
}

async function applyComputeResult(req, {
  result: resultInput,
  preview,
  idempotencyKey,
  actor = null,
  now = new Date(),
  externalJobId = null,
  onProgress = null,
} = {}) {
  const result = validateComputeExecutionResult(resultInput);
  const normalizedKey = trimString(idempotencyKey);
  if (!normalizedKey) {
    throw serviceError('Apply idempotencyKey is required.', 'APPLY_IDEMPOTENCY_REQUIRED');
  }
  if (!preview || preview.jobId !== result.jobId) {
    throw serviceError('Accepted preview is required.', 'PREVIEW_REQUIRED', 409);
  }
  if (!preview.applyAllowed) {
    throw serviceError('Preview does not allow apply.', 'PREVIEW_APPLY_BLOCKED', 409);
  }

  const freshPreview = await previewComputeResult(req, result, { now });
  const previewDrift = comparablePreview(freshPreview) !== comparablePreview(preview);
  if (previewDrift && !freshPreview.applyAllowed) {
    throw serviceError(
      'Preview is stale relative to current production state. Re-run Preview before applying.',
      'PREVIEW_STALE',
      409,
    );
  }
  if (!freshPreview.applyAllowed) {
    throw serviceError('Fresh preview does not allow apply.', 'PREVIEW_APPLY_BLOCKED', 409);
  }
  if (previewDrift) {
    logPivot('info', 'compute apply using refreshed preview after production drift', {
      externalJobId: externalJobId || result.jobId || null,
      cityKey: result.cityKey || null,
      applicableRows: freshPreview.rows.filter(isApplyablePreviewRow).length,
    });
  }

  const identities = await loadProductionIdentities(req, result);
  const applicable = freshPreview.rows.filter(isApplyablePreviewRow);
  const skippedRows = [];
  const manifestRows = [];
  const summary = {
    creates: 0,
    updates: 0,
    unchanged: freshPreview.summary.unchanged,
    conflicts: 0,
    stale: 0,
    rejected: freshPreview.summary.rejected,
    skipped: 0,
  };

  let activeRow = null;
  const reportProgress = async () => {
    if (!externalJobId || typeof onProgress !== 'function') return;
    const processed = summary.creates + summary.updates + summary.skipped;
    if (processed > 0 && processed % APPLY_PROGRESS_UPDATE_EVERY === 0) {
      await onProgress({ ...summary });
    }
  };
  try {
    for (const row of applicable) {
      activeRow = row;
      if (row.entityType === 'source') {
        const proposal = (result.proposals.sources || []).find((item) => sourceRowKey(item.host) === row.key);
        if (!proposal) continue;
        await applySourceRow(req, result, proposal);
        summary[row.action === 'create' ? 'creates' : 'updates'] += 1;
        manifestRows.push({
          entityType: 'source',
          disposition: dispositionForPreviewAction(row.action),
          name: proposal.label || proposal.host || null,
          sourceUrl: proposal.url || null,
        });
        await reportProgress();
        continue;
      }
      if (row.entityType === 'curationJob' && result.kind === 'city-source-discovery') {
        const proposal = (result.proposals.curationJobs || []).find((item) => curationJobRowKey(item) === row.key);
        if (!proposal) continue;
        const appliedJob = await applyCurationJobRow(req, result, proposal, identities);
        summary[row.action === 'create' ? 'creates' : 'updates'] += 1;
        manifestRows.push({
          entityType: 'curationJob',
          disposition: dispositionForPreviewAction(row.action),
          name: appliedJob?.label || proposal.label || null,
          sourceUrl: appliedJob?.url || proposal.url || null,
          curationJobId: appliedJob?.jobId || null,
          curationJobLabel: appliedJob?.label || proposal.label || null,
        });
        await reportProgress();
        continue;
      }
      if (row.entityType === 'event') {
        const proposal = (result.proposals.events || []).find((item) => eventRowKey(item.sourceUrl) === row.key);
        if (!proposal) continue;
        const outcome = await applyEventRow(req, result, proposal, identities);
        if (outcome?.skipped) {
          summary.skipped += 1;
          skippedRows.push({
            entityType: 'event',
            key: row.key,
            title: outcome.title || row.key,
            sourceUrl: outcome.sourceUrl || null,
            missingFields: outcome.missingFields?.length
              ? outcome.missingFields
              : [outcome.code || 'SKIPPED'],
            code: outcome.code || null,
            message: outcome.message || null,
          });
          manifestRows.push({
            entityType: 'event',
            disposition: 'skipped',
            name: outcome.title || proposal.draft?.name || null,
            sourceUrl: outcome.sourceUrl || proposal.sourceUrl || null,
            batchWeek: outcome.batchWeek || proposal.batchWeek || null,
            curationJobId: outcome.curationJobId || null,
            curationJobLabel: outcome.curationJobLabel || null,
            message: outcome.message || outcome.code || null,
          });
          await reportProgress();
          continue;
        }
        summary[outcome?.created ? 'creates' : 'updates'] += 1;
        manifestRows.push({
          entityType: 'event',
          disposition: outcome?.created ? 'created' : 'updated',
          eventId: outcome?.eventId || null,
          name: proposal.draft?.name || null,
          sourceUrl: proposal.sourceUrl || null,
          batchWeek: outcome?.batchWeek || proposal.batchWeek || null,
          ingestStatus: outcome?.ingestStatus || null,
          curationJobId: outcome?.curationJobId || null,
          curationJobLabel: outcome?.curationJobLabel || null,
          message: outcome?.message || null,
        });
        await reportProgress();
      }
    }
    if (externalJobId && typeof onProgress === 'function') {
      await onProgress({ ...summary });
    }
  } catch (error) {
    error.partialSummary = summary;
    error.applyManifest = buildBoundedApplyManifest(manifestRows, now);
    error.failedRow = error.failedRow || (activeRow ? {
      entityType: activeRow.entityType,
      key: activeRow.key,
      action: activeRow.action,
    } : null);
    throw error;
  }

  return {
    summary,
    preview: freshPreview,
    skippedRows: skippedRows.slice(0, 100),
    previewDrift,
    manifest: buildBoundedApplyManifest(manifestRows, now),
  };
}

async function previewStoredComputeJob(req, externalJobId, options = {}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) throw serviceError('Compute job not found.', 'COMPUTE_JOB_NOT_FOUND', 404);
  if (job.kind === 'carousel-export') {
    throw serviceError('Carousel export jobs do not support preview.', 'CAROUSEL_PREVIEW_UNSUPPORTED', 409);
  }
  if (!job.result?.embedded) {
    throw serviceError('Compute job has no stored result to preview.', 'COMPUTE_JOB_RESULT_MISSING', 409);
  }
  const { preview, review } = await previewComputeResultWithReview(
    req,
    job.result.embedded,
    options,
  );
  return { job, preview, review };
}

async function applyStoredComputeJob(req, externalJobId, {
  idempotencyKey,
  preview,
  tenantKey,
  actor = null,
  now = new Date(),
} = {}) {
  const job = await findJobByExternalId(req, externalJobId);
  if (!job) throw serviceError('Compute job not found.', 'COMPUTE_JOB_NOT_FOUND', 404);
  if (job.kind === 'carousel-export') {
    throw serviceError('Carousel export jobs do not support apply.', 'CAROUSEL_APPLY_UNSUPPORTED', 409);
  }
  const requestedTenantKey = trimString(tenantKey).toLowerCase();
  if (!requestedTenantKey) {
    throw serviceError('A tenantKey is required to apply a compute job.', 'APPLY_TENANT_REQUIRED', 400);
  }
  const jobTenantKey = trimString(job.tenantKey || job.cityKey).toLowerCase();
  const resultTenantKey = trimString(job.result?.embedded?.cityKey || job.cityKey).toLowerCase();
  if (requestedTenantKey !== jobTenantKey || requestedTenantKey !== resultTenantKey) {
    throw serviceError(
      `Compute job belongs to tenant ${jobTenantKey || 'unknown'}, not ${requestedTenantKey}.`,
      'COMPUTE_JOB_TENANT_MISMATCH',
      409,
    );
  }
  if (job.status === 'completed') {
    if (job.applicationAudit?.idempotencyKey === trimString(idempotencyKey)) {
      return { job, duplicate: true };
    }
    throw serviceError('Compute job result has already been applied.', 'COMPUTE_JOB_ALREADY_APPLIED', 409);
  }
  if (job.status !== 'review-required') {
    throw serviceError(`Compute job cannot be applied from status ${job.status}.`, 'COMPUTE_JOB_NOT_REVIEWABLE', 409);
  }
  if (!job.result?.embedded) {
    throw serviceError('Compute job has no stored result to apply.', 'COMPUTE_JOB_RESULT_MISSING', 409);
  }

  const applicableCount = countApplicablePreviewRows(preview);
  const useBackgroundApply = applicableCount > BACKGROUND_APPLY_ROW_THRESHOLD;

  await beginComputeJobApply(req, {
    externalJobId,
    actor,
    previewId: preview?.previewedAt || null,
    idempotencyKey,
    now,
  });

  if (useBackgroundApply) {
    scheduleStoredComputeJobApply({
      externalJobId,
      tenantKey: requestedTenantKey,
      actor,
      idempotencyKey,
      preview,
      embedded: job.result.embedded,
      now,
    });
    const applyingJob = await findJobByExternalId(req, externalJobId);
    return {
      job: applyingJob,
      async: true,
      accepted: true,
      applicableCount,
      message: `Applying ${applicableCount} rows in the background. Poll this job until it leaves applying.`,
    };
  }

  try {
    const applied = await applyComputeResult(req, {
      result: job.result.embedded,
      preview,
      idempotencyKey,
      actor,
      now,
      externalJobId,
      onProgress: (summary) => updateComputeJobApplyProgress(req, {
        externalJobId,
        summary,
        now: new Date(),
      }),
    });
    return finalizeStoredComputeJobApply(req, {
      externalJobId,
      actor,
      idempotencyKey,
      applied,
      now,
    });
  } catch (error) {
    return finalizeStoredComputeJobApply(req, {
      externalJobId,
      actor,
      idempotencyKey,
      error,
      now,
    });
  }
}

async function previewManualComputeResult(req, resultInput, options = {}) {
  return previewComputeResult(req, resultInput, options);
}

module.exports = {
  sourceRowKey,
  curationJobRowKey,
  eventRowKey,
  serializeEventIdentity,
  classifyVersionedProposal,
  summarizePreviewRows,
  buildPreviewEnvelope,
  buildComputeReview,
  validateComputeExecutionResult,
  previewComputeResult,
  previewStoredComputeJob,
  previewManualComputeResult,
  countApplicablePreviewRows,
  applyComputeResult,
  applyStoredComputeJob,
  buildBoundedApplyManifest,
  BACKGROUND_APPLY_ROW_THRESHOLD,
  NATIVE_TAGS_REQUIRED,
};
