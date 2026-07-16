const mongoose = require('mongoose');
const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const { resolvePivotTenant, publishIngestEvent } = require('./pivotIngestPublishService');
const {
  previewIngestUrl,
  MAX_CRAWL_BATCH_EVENTS,
  resolveBatchLimit,
} = require('./pivotIngestPreviewService');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { ensurePivotBatch } = require('./pivotBatchService');
const { toIsoWeek, shiftIsoWeek } = require('../utilities/pivotIsoWeek');
const { resolvePivotDropInstant } = require('../utilities/pivotDropSchedule');
const { logPivot } = require('../utilities/pivotLogger');

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

function emptyStats(message = null) {
  return {
    discovered: 0,
    upserted: 0,
    skipped: 0,
    failed: 0,
    updated: 0,
    byBatchWeek: null,
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
      source: draft.source,
      sourceUrl,
      tags,
      ingestStatus,
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

    const stats = emptyStats(
      preview.data?.truncated
        ? preview.data?.discoverSource === 'luma-discover-api'
          ? `Luma discover results truncated (${preview.data.discoveredTotal || entries.length} events across ${preview.data.discoverPages || '?'} pages).`
          : `Source HTML listed more events than the crawl limit (${maxEvents}); provider pagination/scroll not yet supported.`
        : preview.data?.discoverSource === 'luma-discover-api'
          ? `Fetched via Luma discover API (${preview.data.discoverPages || 1} page(s)).`
          : null,
    );
    // Note: when maxEvents is null we take every event embedded in the HTML /
    // returned by the Luma discover API; Partiful explore still has no API pagination.
    stats.discovered = entries.length;
    stats.byBatchWeek = {};

    await updateRunDoc(workerReq, runId, { stats });

    const forceBatchWeek = Boolean(run.forceBatchWeek);
    // When forcing, ensure the pinned week exists up front. Otherwise ensure
    // each event's resolved week as we upsert.
    if (forceBatchWeek) {
      await ensurePivotBatch(workerReq, {
        batchWeek: run.batchWeek,
        status: 'curating',
      });
    }

    const failures = [];
    const events = [];
    const defaultTags = Array.isArray(job.defaultTags) ? job.defaultTags : [];
    const ensuredWeeks = new Set(forceBatchWeek ? [run.batchWeek] : []);

    for (const entry of entries) {
      try {
        const outcome = await upsertDiscoveredEntry(workerReq, {
          tenantKey,
          batchWeek: run.batchWeek,
          forceBatchWeek,
          entry,
          defaultTags,
        });

        if (outcome.upserted) {
          stats.upserted += 1;
          if (outcome.updated) stats.updated += 1;
          const week = outcome.batchWeek || run.batchWeek;
          if (week) {
            stats.byBatchWeek[week] = (stats.byBatchWeek[week] || 0) + 1;
            if (!ensuredWeeks.has(week)) {
              await ensurePivotBatch(workerReq, {
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
        logPivot('warn', 'curation run entry failed', {
          runId: String(runId),
          tenantKey,
          sourceUrl: entry?.sourceUrl || null,
          error: err.message,
        });
      }

      // Persist progress periodically so UI polling sees movement.
      if ((stats.upserted + stats.skipped + stats.failed) % 10 === 0) {
        await updateRunDoc(workerReq, runId, { stats, failures, events });
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
  MAX_CRAWL_BATCH_EVENTS,
};
