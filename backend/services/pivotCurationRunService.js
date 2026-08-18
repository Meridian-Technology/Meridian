const mongoose = require('mongoose');
const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const { resolvePivotTenant, publishIngestEvent } = require('./pivotIngestPublishService');
const {
  previewIngestUrl,
  MAX_CRAWL_BATCH_EVENTS,
  resolveBatchLimit,
  GENERIC_SITE_PROVIDER,
} = require('./pivotIngestPreviewService');
const { isSiteScrapeConfigured } = require('./pivotSiteScrapeService');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { ensurePivotBatch } = require('./pivotBatchService');
const { toIsoWeek, shiftIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  resolvePivotDropInstant,
  resolvePivotDropConfig,
} = require('../utilities/pivotDropSchedule');
const { logPivot } = require('../utilities/pivotLogger');
const { rollupShowtimeDrafts } = require('./pivotIngestDuplicateService');
const { attachOrganizerIdsToDrafts } = require('./pivotOrganizerResolveService');

const MAX_FAILURES_STORED = 50;
const MAX_EVENTS_STORED = 100;

function actorFromReq(req) {
  return req?.user?.email || req?.user?.globalUserId || req?.user?.userId || null;
}

function parseJobId(jobId) {
  const id = String(jobId || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { error: 'Invalid curation job id.', status: 400, code: 'INVALID_JOB_ID' };
  }
  return { jobId: id };
}

function parseRunId(runId) {
  const id = String(runId || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { error: 'Invalid curation run id.', status: 400, code: 'INVALID_RUN_ID' };
  }
  return { runId: id };
}

function serializeRunEvent(row) {
  return {
    eventId: row?.eventId ? String(row.eventId) : null,
    name: row?.name || null,
    batchWeek: row?.batchWeek || null,
    sourceUrl: row?.sourceUrl || null,
    ingestStatus: row?.ingestStatus || null,
    updated: Boolean(row?.updated),
  };
}

function serializeCurationRun(doc) {
  const row = doc?.toObject ? doc.toObject() : doc;
  return {
    _id: String(row._id),
    tenantKey: row.tenantKey,
    jobId: String(row.jobId),
    batchWeek: row.batchWeek,
    forceBatchWeek: Boolean(row.forceBatchWeek),
    status: row.status,
    maxEvents: row.maxEvents ?? null,
    provider: row.provider || null,
    url: row.url || null,
    startedAt: row.startedAt || null,
    finishedAt: row.finishedAt || null,
    stats: {
      discovered: row.stats?.discovered || 0,
      upserted: row.stats?.upserted || 0,
      skipped: row.stats?.skipped || 0,
      failed: row.stats?.failed || 0,
      updated: row.stats?.updated || 0,
      byBatchWeek: row.stats?.byBatchWeek || null,
      organizerResolved: row.stats?.organizerResolved || 0,
      organizerAmbiguous: row.stats?.organizerAmbiguous || 0,
      organizerUnlinked: row.stats?.organizerUnlinked || 0,
      organizerUniqueIdentities: row.stats?.organizerUniqueIdentities || 0,
      message: row.stats?.message || null,
    },
    failures: Array.isArray(row.failures)
      ? row.failures.map((f) => ({
          sourceUrl: f.sourceUrl || null,
          name: f.name || null,
          message: f.message || null,
          code: f.code || null,
        }))
      : [],
    events: Array.isArray(row.events) ? row.events.map(serializeRunEvent) : [],
    error: row.error || null,
    errorCode: row.errorCode || null,
    createdBy: row.createdBy || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

/**
 * Human-readable summary of how a crawl sourced its events, shown in the run
 * monitor. Each provider truncates for a different reason, so the wording has to
 * match the fetch path that actually ran.
 */
function describeDiscovery(previewData, entryCount, maxEvents) {
  const source = previewData?.discoverSource || null;

  if (previewData?.truncated) {
    if (source === 'luma-discover-api') {
      return `Luma discover results truncated (${previewData.discoveredTotal || entryCount} events across ${previewData.discoverPages || '?'} pages).`;
    }
    if (source === 'firecrawl-json') {
      return `Website listed more events than the crawl limit (${previewData.limit}); raise maxEvents to take more.`;
    }
    return `Source HTML listed more events than the crawl limit (${maxEvents}); provider pagination/scroll not yet supported.`;
  }

  if (source === 'luma-discover-api') {
    return `Fetched via Luma discover API (${previewData.discoverPages || 1} page(s)).`;
  }
  if (source === 'firecrawl-json') {
    return 'Extracted from rendered website HTML.';
  }
  return null;
}

function emptyStats(message = null) {
  return {
    discovered: 0,
    upserted: 0,
    skipped: 0,
    failed: 0,
    updated: 0,
    updatedBySourceUrl: 0,
    updatedByFingerprint: 0,
    updatedByShowtime: 0,
    updatedBySimilarity: 0,
    showtimesRolledUp: 0,
    byBatchWeek: null,
    organizerResolved: 0,
    organizerAmbiguous: 0,
    organizerUnlinked: 0,
    organizerUniqueIdentities: 0,
    message,
  };
}

/**
 * Resolve batchWeek for a run.
 * Prefer explicit body batchWeek; else job strategy (next-drop | current-iso | explicit).
 */
function resolveRunBatchWeek({ batchWeek, strategy, tenant, now = new Date() }) {
  if (batchWeek != null && String(batchWeek).trim()) {
    return normalizeBatchWeek(batchWeek, now);
  }

  const resolvedStrategy = strategy || 'next-drop';
  if (resolvedStrategy === 'current-iso') {
    return { batchWeek: toIsoWeek(now) };
  }
  if (resolvedStrategy === 'explicit') {
    return {
      error: 'batchWeek is required when defaultBatchWeekStrategy is explicit.',
      status: 400,
      code: 'BATCH_WEEK_REQUIRED',
    };
  }

  // next-drop: ISO week of the next upcoming drop instant (or current week if drop is later today).
  const currentWeek = toIsoWeek(now);
  try {
    const currentDrop = resolvePivotDropInstant(tenant, currentWeek, now);
    if (currentDrop.dropAt.getTime() > now.getTime()) {
      return { batchWeek: currentWeek };
    }
    return { batchWeek: shiftIsoWeek(currentWeek, 1) };
  } catch {
    return { batchWeek: shiftIsoWeek(currentWeek, 1) };
  }
}

function resolveMaxEvents(raw) {
  // Default: no artificial cap — take every event found in the page HTML.
  if (raw == null || raw === '') {
    return { maxEvents: null };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return {
      error: 'maxEvents must be a positive number.',
      status: 400,
      code: 'INVALID_MAX_EVENTS',
    };
  }
  return { maxEvents: resolveBatchLimit(n) };
}

async function buildWorkerReq(tenantKey, createdBy) {
  const [globalDb, db] = await Promise.all([
    connectToGlobalDatabase(),
    connectToDatabase(tenantKey),
  ]);
  return {
    globalDb,
    db,
    school: tenantKey,
    user: createdBy ? { email: createdBy } : {},
  };
}

/**
 * Best-effort city timezone for relative-date resolution during scraping.
 * Falls back to the pilot default rather than failing the run.
 */
async function resolveTenantTimezone(reqLike, tenantKey) {
  try {
    const tenantResult = await resolvePivotTenant(reqLike, tenantKey);
    if (tenantResult.error) return undefined;
    return resolvePivotDropConfig(tenantResult.tenant).timezone;
  } catch {
    return undefined;
  }
}

async function updateRunDoc(reqLike, runId, patch) {
  const { PivotCurationRun } = getGlobalModels(reqLike, 'PivotCurationRun');
  return PivotCurationRun.findByIdAndUpdate(
    runId,
    { $set: patch },
    { new: true, runValidators: true },
  ).lean();
}

async function syncJobLastRun(reqLike, jobId, { status, stats, finishedAt, events }) {
  const { PivotCurationJob } = getGlobalModels(reqLike, 'PivotCurationJob');
  await PivotCurationJob.findByIdAndUpdate(jobId, {
    $set: {
      lastRunAt: finishedAt || new Date(),
      lastRunStatus: status,
      lastRunStats: {
        discovered: stats.discovered || 0,
        upserted: stats.upserted || 0,
        skipped: stats.skipped || 0,
        failed: stats.failed || 0,
        message: stats.message || null,
        byBatchWeek: stats.byBatchWeek || null,
      },
      lastRunEvents: Array.isArray(events)
        ? events.slice(0, MAX_EVENTS_STORED).map(serializeRunEvent)
        : [],
    },
  });
}

function pickIngestStatus(defaultTags) {
  return Array.isArray(defaultTags) && defaultTags.length > 0 ? 'staged' : 'draft';
}

/**
 * Upsert one discovered explore draft into the city catalog.
 * Default: batchWeek from the event's start date (one crawl can fill many weeks).
 * Override: forceBatchWeek pins every event to the run's batchWeek.
 */
async function upsertDiscoveredEntry(
  req,
  { tenantKey, batchWeek, forceBatchWeek = false, entry, defaultTags },
) {
  const draft = entry?.draft || {};
  const sourceUrl = entry?.sourceUrl || draft.sourceUrl || null;
  if (!sourceUrl) {
    return {
      skipped: true,
      code: 'MISSING_SOURCE_URL',
      message: 'Discovered event has no source URL.',
      name: draft.name || null,
      sourceUrl: null,
    };
  }

  const tags = Array.isArray(defaultTags) ? defaultTags : [];
  const ingestStatus = pickIngestStatus(tags);

  const result = await publishIngestEvent(req, {
    tenantKey,
    batchWeek,
    forceBatchWeek: Boolean(forceBatchWeek),
    url: sourceUrl,
    draft,
    tagsRequired: false,
    overrides: {
      name: draft.name,
      description: draft.description,
      image: draft.image,
      location: draft.location,
      start_time: draft.start_time,
      end_time: draft.end_time,
      hostName: draft.hostName,
      hostImageUrl: draft.hostImageUrl,
      hostProfileUrl: draft.hostProfileUrl,
      hostIdentities: draft.hostIdentities,
      organizerIds: Array.isArray(draft.organizerIds) ? draft.organizerIds : undefined,
      source: draft.source,
      sourceUrl,
      tags,
      ingestStatus,
      timeSlots: draft.timeSlots,
      parsed: draft.parsed,
    },
  });

  if (result.error) {
    const skipCodes = new Set([
      'MISSING_REQUIRED_FIELDS',
      'INVALID_START_TIME',
      'DUPLICATE_EVENT',
    ]);
    if (skipCodes.has(result.code)) {
      return {
        skipped: true,
        code: result.code,
        message: result.error,
        name: draft.name || null,
        sourceUrl,
      };
    }
    return {
      failed: true,
      code: result.code || 'UPSERT_FAILED',
      message: result.error,
      name: draft.name || null,
      sourceUrl,
    };
  }

  return {
    upserted: true,
    updated: Boolean(result.data?.updated),
    duplicateMatch: result.data?.duplicateMatch || null,
    eventId: result.data?.event?._id || result.data?.event?.id || null,
    name: draft.name || result.data?.event?.name || null,
    batchWeek: result.data?.batchWeek || result.data?.event?.batchWeek || null,
    batchWeekSource: result.data?.batchWeekSource || null,
    ingestStatus:
      result.data?.event?.customFields?.pivot?.ingestStatus ||
      ingestStatus ||
      null,
    sourceUrl,
  };
}

/**
 * Upsert a list of extracted drafts into the city catalog.
 *
 * Shared by curation runs and source discovery: both end up holding a list of
 * drafts that need identical batch bookkeeping, so the per-week
 * ensurePivotBatch calls and the byBatchWeek tally live here rather than being
 * duplicated (and drifting) in each caller.
 *
 * @param {object} options.stats Mutated in place when supplied, so a caller can
 *   publish partial counts while the loop is still running.
 * @param {Function} options.onProgress Awaited every 10 outcomes.
 * @returns {Promise<{stats: object, events: Array, failures: Array}>}
 */
async function ingestEntries(req, options = {}) {
  const {
    tenantKey,
    batchWeek,
    forceBatchWeek = false,
    entries = [],
    defaultTags = [],
    onProgress = null,
    logContext = {},
  } = options;

  const stats = options.stats || emptyStats();
  if (!stats.byBatchWeek) stats.byBatchWeek = {};

  const rolled = rollupShowtimeDrafts(entries);
  const ingestList = rolled.drafts;
  stats.showtimesRolledUp = (stats.showtimesRolledUp || 0) + (rolled.rolledUpCount || 0);

  const tenantDb = req?.db || options.db;
  if (tenantDb && tenantKey) {
    try {
      await attachOrganizerIdsToDrafts({
        db: tenantDb,
        tenantKey,
        drafts: ingestList,
        stats,
      });
    } catch (err) {
      logPivot('warn', 'organizer resolve-once failed; ingest continues unlinked', {
        ...logContext,
        tenantKey,
        message: err.message,
      });
    }
  }

  if (stats.organizerAmbiguous) {
    const warn = `${stats.organizerAmbiguous} event(s) left unlinked (ambiguous organizer name).`;
    stats.message = stats.message ? `${stats.message} ${warn}` : warn;
  }

  const failures = [];
  const events = [];
  const tags = Array.isArray(defaultTags) ? defaultTags : [];
  const ensuredWeeks = new Set();

  // When forcing, ensure the pinned week exists up front. Otherwise ensure
  // each event's resolved week as we upsert.
  if (forceBatchWeek && batchWeek) {
    await ensurePivotBatch(req, { batchWeek, status: 'curating' });
    ensuredWeeks.add(batchWeek);
  }

  for (const entry of ingestList) {
    try {
      const outcome = await upsertDiscoveredEntry(req, {
        tenantKey,
        batchWeek,
        forceBatchWeek,
        entry,
        defaultTags: tags,
      });

      if (outcome.upserted) {
        stats.upserted += 1;
        if (outcome.updated) {
          stats.updated += 1;
          if (outcome.duplicateMatch === 'sourceUrl') stats.updatedBySourceUrl += 1;
          else if (outcome.duplicateMatch === 'fingerprint') stats.updatedByFingerprint += 1;
          else if (outcome.duplicateMatch === 'showtime') stats.updatedByShowtime += 1;
          else if (outcome.duplicateMatch === 'similarity') stats.updatedBySimilarity += 1;
        }
        const week = outcome.batchWeek || batchWeek;
        if (week) {
          stats.byBatchWeek[week] = (stats.byBatchWeek[week] || 0) + 1;
          if (!ensuredWeeks.has(week)) {
            await ensurePivotBatch(req, {
              batchWeek: week,
              status: 'curating',
            });
            ensuredWeeks.add(week);
          }
        }
        if (events.length < MAX_EVENTS_STORED) {
          events.push({
            eventId: outcome.eventId ? String(outcome.eventId) : null,
            name: outcome.name || null,
            batchWeek: week || null,
            sourceUrl: outcome.sourceUrl || null,
            ingestStatus: outcome.ingestStatus || null,
            updated: Boolean(outcome.updated),
          });
        }
      } else if (outcome.skipped) {
        stats.skipped += 1;
        if (failures.length < MAX_FAILURES_STORED) {
          failures.push({
            sourceUrl: outcome.sourceUrl,
            name: outcome.name,
            message: outcome.message,
            code: outcome.code,
          });
        }
      } else if (outcome.failed) {
        stats.failed += 1;
        if (failures.length < MAX_FAILURES_STORED) {
          failures.push({
            sourceUrl: outcome.sourceUrl,
            name: outcome.name,
            message: outcome.message,
            code: outcome.code,
          });
        }
      }
    } catch (err) {
      stats.failed += 1;
      if (failures.length < MAX_FAILURES_STORED) {
        failures.push({
          sourceUrl: entry?.sourceUrl || null,
          name: entry?.draft?.name || null,
          message: err.message || 'Unexpected upsert error.',
          code: 'UPSERT_EXCEPTION',
        });
      }
      logPivot('warn', 'curation ingest entry failed', {
        ...logContext,
        tenantKey,
        sourceUrl: entry?.sourceUrl || null,
        error: err.message,
      });
    }

    // Persist progress periodically so UI polling sees movement.
    if (onProgress && (stats.upserted + stats.skipped + stats.failed) % 10 === 0) {
      await onProgress({ stats, events, failures });
    }
  }

  const weekKeys = Object.keys(stats.byBatchWeek || {});
  if (!forceBatchWeek && weekKeys.length > 1) {
    const summary = weekKeys
      .sort()
      .map((w) => `${w}:${stats.byBatchWeek[w]}`)
      .join(', ');
    const multiMsg = `Assigned by event date across ${weekKeys.length} weeks (${summary}).`;
    stats.message = stats.message ? `${stats.message} ${multiMsg}` : multiMsg;
  }

  return { stats, events, failures };
}

/**
 * Split ingest counts into words an operator can act on.
 *
 * `stats.upserted` counts rows written, whether they were new or refreshed, so
 * reporting it as "added" overstates a re-crawl — which is what most runs are
 * once a source is established. The interesting number is how many events were
 * genuinely new.
 */
function summarizeIngest(stats = {}) {
  const written = stats.upserted || 0;
  const refreshed = stats.updated || 0;
  const added = Math.max(written - refreshed, 0);

  const parts = [];
  if (added) parts.push(`${added} new`);
  if (refreshed) parts.push(`${refreshed} refreshed`);

  return {
    added,
    refreshed,
    written,
    skipped: stats.skipped || 0,
    failed: stats.failed || 0,
    updatedBySourceUrl: stats.updatedBySourceUrl || 0,
    updatedByFingerprint: stats.updatedByFingerprint || 0,
    updatedByShowtime: stats.updatedByShowtime || 0,
    updatedBySimilarity: stats.updatedBySimilarity || 0,
    showtimesRolledUp: stats.showtimesRolledUp || 0,
    phrase: parts.length ? parts.join(', ') : 'nothing new',
  };
}

async function executeCurationRun(runId) {
  let workerReq;
  let tenantKey;
  let jobId;

  try {
    const globalDb = await connectToGlobalDatabase();
    const bootstrapReq = { globalDb };
    const { PivotCurationRun, PivotCurationJob } = getGlobalModels(
      bootstrapReq,
      'PivotCurationRun',
      'PivotCurationJob',
    );

    const run = await PivotCurationRun.findById(runId).lean();
    if (!run) {
      logPivot('error', 'curation run missing at execute', { runId: String(runId) });
      return;
    }

    tenantKey = run.tenantKey;
    jobId = run.jobId;
    workerReq = await buildWorkerReq(tenantKey, run.createdBy);

    const startedAt = new Date();
    await updateRunDoc(workerReq, runId, {
      status: 'running',
      startedAt,
      error: null,
      errorCode: null,
    });

    const job = await PivotCurationJob.findById(jobId).lean();
    if (!job || job.tenantKey !== tenantKey) {
      const stats = emptyStats('Curation job not found.');
      const finishedAt = new Date();
      await updateRunDoc(workerReq, runId, {
        status: 'failed',
        finishedAt,
        error: 'Curation job not found.',
        errorCode: 'JOB_NOT_FOUND',
        stats,
      });
      return;
    }

    if (job.provider === 'manual-json') {
      const stats = emptyStats(
        'manual-json jobs do not support crawl runs; use Lab JSON import.',
      );
      const finishedAt = new Date();
      await updateRunDoc(workerReq, runId, {
        status: 'failed',
        finishedAt,
        error: stats.message,
        errorCode: 'PROVIDER_NOT_CRAWLABLE',
        stats,
      });
      await syncJobLastRun(workerReq, jobId, {
        status: 'failed',
        stats,
        finishedAt,
        events: [],
      });
      return;
    }

    if (!job.url) {
      const stats = emptyStats('Job has no URL to crawl.');
      const finishedAt = new Date();
      await updateRunDoc(workerReq, runId, {
        status: 'failed',
        finishedAt,
        error: stats.message,
        errorCode: 'URL_REQUIRED',
        stats,
      });
      await syncJobLastRun(workerReq, jobId, {
        status: 'failed',
        stats,
        finishedAt,
        events: [],
      });
      return;
    }

    const maxEvents = run.maxEvents != null ? run.maxEvents : null;
    const preview = await previewIngestUrl(workerReq, {
      url: job.url,
      ...(maxEvents != null ? { maxEvents } : {}),
      tenantKey,
      // generic-site cannot be inferred from the host, and its extractor needs
      // the city timezone to resolve relative dates like "Fri 8pm".
      provider: job.provider,
      timezone: await resolveTenantTimezone(workerReq, tenantKey),
    });

    if (preview.error) {
      const stats = emptyStats(preview.error);
      const finishedAt = new Date();
      await updateRunDoc(workerReq, runId, {
        status: 'failed',
        finishedAt,
        error: preview.error,
        errorCode: preview.code || 'PREVIEW_FAILED',
        stats,
      });
      await syncJobLastRun(workerReq, jobId, {
        status: 'failed',
        stats,
        finishedAt,
        events: [],
      });
      return;
    }

    let entries = [];
    if (preview.data?.mode === 'batch') {
      entries = preview.data.drafts || [];
    } else if (preview.data?.mode === 'single' && preview.data.draft) {
      entries = [
        {
          draft: preview.data.draft,
          warnings: preview.data.warnings || [],
          sourceUrl: preview.data.draft.sourceUrl || job.url,
        },
      ];
    }

    const stats = emptyStats(describeDiscovery(preview.data, entries.length, maxEvents));
    // Note: when maxEvents is null we take every event embedded in the HTML /
    // returned by the Luma discover API; Partiful explore still has no API pagination.
    stats.discovered = entries.length;
    stats.byBatchWeek = {};

    await updateRunDoc(workerReq, runId, { stats });

    const forceBatchWeek = Boolean(run.forceBatchWeek);
    const defaultTags = Array.isArray(job.defaultTags) ? job.defaultTags : [];

    const { events, failures } = await ingestEntries(workerReq, {
      tenantKey,
      batchWeek: run.batchWeek,
      forceBatchWeek,
      entries,
      defaultTags,
      stats,
      logContext: { runId: String(runId) },
      onProgress: async (progress) => {
        await updateRunDoc(workerReq, runId, {
          stats: progress.stats,
          failures: progress.failures,
          events: progress.events,
        });
      },
    });

    const finishedAt = new Date();
    const status = 'completed';
    await updateRunDoc(workerReq, runId, {
      status,
      finishedAt,
      stats,
      failures,
      events,
      error: null,
      errorCode: null,
    });
    await syncJobLastRun(workerReq, jobId, {
      status,
      stats,
      finishedAt,
      events,
    });

    logPivot('info', 'curation run completed', {
      runId: String(runId),
      tenantKey,
      batchWeek: run.batchWeek,
      forceBatchWeek,
      byBatchWeek: stats.byBatchWeek,
      ...stats,
    });
  } catch (err) {
    logPivot('error', 'curation run crashed', {
      runId: String(runId),
      tenantKey,
      error: err.message,
    });
    try {
      const reqLike =
        workerReq ||
        (await buildWorkerReq(tenantKey || 'www', null));
      const stats = emptyStats(err.message || 'Curation run failed.');
      const finishedAt = new Date();
      await updateRunDoc(reqLike, runId, {
        status: 'failed',
        finishedAt,
        error: err.message || 'Curation run failed.',
        errorCode: 'RUN_CRASHED',
        stats,
      });
      if (jobId) {
        await syncJobLastRun(reqLike, jobId, {
          status: 'failed',
          stats,
          finishedAt,
          events: [],
        });
      }
    } catch (persistErr) {
      console.error('[curation-run] failed to persist crash state:', persistErr.message);
    }
  }
}

function scheduleCurationRun(runId) {
  setImmediate(() => {
    executeCurationRun(runId).catch((err) => {
      console.error('[curation-run] executeCurationRun error:', err);
    });
  });
}

async function startCurationJobRun(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const idResult = parseJobId(options.jobId);
  if (idResult.error) return idResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const { PivotCurationJob, PivotCurationRun } = getGlobalModels(
    req,
    'PivotCurationJob',
    'PivotCurationRun',
  );

  const job = await PivotCurationJob.findOne({
    _id: idResult.jobId,
    tenantKey,
  }).lean();
  if (!job) {
    return { error: 'Curation job not found.', status: 404, code: 'JOB_NOT_FOUND' };
  }
  if (job.enabled === false) {
    return { error: 'Curation job is disabled.', status: 400, code: 'JOB_DISABLED' };
  }
  if (job.provider === 'manual-json') {
    return {
      error: 'manual-json jobs cannot be crawled; use Lab JSON import.',
      status: 400,
      code: 'PROVIDER_NOT_CRAWLABLE',
    };
  }
  if (!job.url) {
    return { error: 'Job has no URL to crawl.', status: 400, code: 'URL_REQUIRED' };
  }
  // Fail fast rather than queueing a run that can only end in a failed record.
  if (job.provider === GENERIC_SITE_PROVIDER && !isSiteScrapeConfigured()) {
    return {
      error:
        'Website scraping is not configured. Set FIRECRAWL_API_KEY in the backend environment to run generic-site curation jobs.',
      status: 503,
      code: 'SITE_SCRAPE_NOT_CONFIGURED',
    };
  }

  const weekResult = resolveRunBatchWeek({
    batchWeek: options.batchWeek,
    strategy: job.defaultBatchWeekStrategy,
    tenant: tenantResult.tenant,
    now: options.now,
  });
  if (weekResult.error) return weekResult;

  const forceBatchWeek = Boolean(options.forceBatchWeek);

  const maxResult = resolveMaxEvents(options.maxEvents);
  if (maxResult.error) return maxResult;
  const maxEvents = maxResult.maxEvents;

  const createdBy = actorFromReq(req);
  const runDoc = await PivotCurationRun.create({
    tenantKey,
    jobId: job._id,
    batchWeek: weekResult.batchWeek,
    forceBatchWeek,
    status: 'queued',
    maxEvents,
    provider: job.provider,
    url: job.url,
    createdBy,
    stats: emptyStats(
      forceBatchWeek
        ? `All events forced into ${weekResult.batchWeek}.`
        : 'Events assigned to the ISO week of their start date.',
    ),
    failures: [],
    events: [],
  });

  await PivotCurationJob.findByIdAndUpdate(job._id, {
    $set: {
      lastRunAt: new Date(),
      lastRunStatus: 'queued',
      lastRunStats: emptyStats(),
      lastRunEvents: [],
    },
  });

  scheduleCurationRun(runDoc._id);

  return {
    data: {
      run: serializeCurationRun(runDoc),
    },
  };
}

async function getCurationRun(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const idResult = parseRunId(options.runId);
  if (idResult.error) return idResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const { PivotCurationRun } = getGlobalModels(req, 'PivotCurationRun');
  const doc = await PivotCurationRun.findOne({
    _id: idResult.runId,
    tenantKey,
  }).lean();

  if (!doc) {
    return { error: 'Curation run not found.', status: 404, code: 'RUN_NOT_FOUND' };
  }

  return { data: { run: serializeCurationRun(doc) } };
}

module.exports = {
  startCurationJobRun,
  getCurationRun,
  executeCurationRun,
  scheduleCurationRun,
  serializeCurationRun,
  resolveRunBatchWeek,
  upsertDiscoveredEntry,
  ingestEntries,
  summarizeIngest,
  emptyStats,
  MAX_CRAWL_BATCH_EVENTS,
};
