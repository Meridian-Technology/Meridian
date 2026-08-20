const mongoose = require('mongoose');
const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { GENERIC_SITE_PROVIDER } = require('./pivotIngestPreviewService');
const { isSiteScrapeConfigured } = require('./pivotSiteScrapeService');
const {
  executeCurationRun,
  resolveRunBatchWeek,
  summarizeIngest,
  emptyStats,
} = require('./pivotCurationRunService');
const {
  createDiscoveryRun,
  serializeDiscoveryRun,
  findOrchestrationRun,
  findLatestOrchestrationRun,
  refuseIfPipelineBusy,
} = require('./pivotDiscoveryRunRecorder');
const { createRunGuard, runPool } = require('./pivotRunGuard');
const { logPivot } = require('../utilities/pivotLogger');

/**
 * Run every curation job for a city as one narrated unit.
 *
 * Refreshing a city used to mean clicking Run on each job and waiting for it
 * before starting the next, which does not scale past a handful of sources and
 * gives no single place to watch. This is the same work with an orchestrator in
 * front of it: one record, one timeline, and one circuit breaker across all the
 * jobs rather than each job discovering the rate limit on its own.
 *
 * Each job still gets its own `PivotCurationRun`, and the per-job path is
 * `executeCurationRun` unchanged — the orchestrator schedules and narrates, it
 * does not reimplement crawling. That keeps job history, the per-job UI, and
 * batch runs all reading from the same records.
 */

/**
 * Jobs crawled at once.
 *
 * One job at a time. Refresh shares the web dyno; two parallel extractions
 * were enough to hold two full calendars in RAM next to user traffic.
 */
const BATCH_CONCURRENCY = 1;

/** Providers a batch can crawl. `manual-json` has no URL to fetch. */
function isCrawlable(job) {
  return job?.provider !== 'manual-json' && Boolean(job?.url);
}

/**
 * generic-site needs Firecrawl; luma/partiful do not.
 *
 * A mixed city must not 503 the whole Refresh all when the key is missing —
 * skip website jobs and still recrawl native indexes. A batch that is only
 * generic-site still fails closed (`SITE_SCRAPE_NOT_CONFIGURED`).
 */
function jobsReadyForScrapeConfig(jobs) {
  if (isSiteScrapeConfigured()) {
    return { jobs, skippedGenericSite: 0 };
  }
  const ready = jobs.filter((job) => job.provider !== GENERIC_SITE_PROVIDER);
  return { jobs: ready, skippedGenericSite: jobs.length - ready.length };
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function actorFromReq(req) {
  return req?.user?.email || req?.user?.globalUserId || req?.user?.userId || null;
}

/**
 * The jobs a batch would run, in a stable order.
 *
 * Oldest-run-first, so a batch interrupted by the rate limiter makes progress on
 * a different part of the city next time rather than re-crawling the same head
 * of the list. Luma and Partiful are crawlable here the same as generic-site —
 * do not special-case them out of weekly refresh.
 */
async function selectBatchJobs(req, { tenantKey, jobIds }) {
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');

  const filter = { tenantKey, enabled: { $ne: false } };
  const requested = Array.isArray(jobIds)
    ? jobIds.map((id) => trimString(id)).filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    : null;
  if (requested?.length) {
    filter._id = { $in: requested };
  }

  const jobs = await PivotCurationJob.find(filter)
    .sort({ lastRunAt: 1, createdAt: 1 })
    .lean();

  return jobs.filter(isCrawlable);
}

/**
 * Queue a batch and hand back its run id immediately.
 *
 * A city with twenty sources takes far longer than any request timeout, so the
 * caller gets the record to watch rather than the result.
 */
async function startCurationBatch(req, options = {}) {
  const busy = await refuseIfPipelineBusy(req);
  if (busy) return busy;

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenant = tenantResult.tenant;
  const tenantKey = tenant.tenantKey;

  const selected = await selectBatchJobs(req, { tenantKey, jobIds: options.jobIds });
  if (!selected.length) {
    return {
      error: 'No enabled, crawlable curation jobs for this city.',
      status: 400,
      code: 'NO_BATCH_JOBS',
    };
  }

  const { jobs, skippedGenericSite } = jobsReadyForScrapeConfig(selected);
  // Fail before creating a record that could only end in failure. Native jobs
  // in a mixed city still run; only a generic-site-only set 503s.
  if (!jobs.length) {
    return {
      error:
        'Website scraping is not configured. Set FIRECRAWL_API_KEY in the backend environment to run generic-site curation jobs.',
      status: 503,
      code: 'SITE_SCRAPE_NOT_CONFIGURED',
    };
  }

  const weekResult = resolveRunBatchWeek({
    batchWeek: options.batchWeek,
    strategy: 'next-drop',
    tenant,
    now: options.now,
  });
  if (weekResult.error) return weekResult;

  const forceBatchWeek = Boolean(options.forceBatchWeek);
  const actor = actorFromReq(req);
  const city = trimString(tenant.name) || tenantKey;

  const recorder = await createDiscoveryRun(req, {
    record: options.record,
    kind: 'curation-batch',
    phase: 'planning',
    tenantKey,
    city,
    actor,
    plan: {
      jobs: jobs.length,
      batchWeek: weekResult.batchWeek,
      forceBatchWeek,
      skippedGenericSite,
      // One extraction per job, which for generic-site is the expensive call.
      maxOutboundCalls: jobs.length,
    },
  });

  scheduleCurationBatch({
    tenantKey,
    jobIds: jobs.map((job) => String(job._id)),
    batchWeek: weekResult.batchWeek,
    forceBatchWeek,
    actor,
    recorder,
    skippedGenericSite,
  });

  return {
    data: {
      runId: recorder.runId,
      tenantKey,
      batchWeek: weekResult.batchWeek,
      forceBatchWeek,
      jobs: jobs.length,
      skippedGenericSite,
    },
  };
}

/**
 * Crawl one job under batch control.
 *
 * Delegates to `executeCurationRun` and then reads the record back, so the batch
 * learns the outcome from the same document the per-job UI shows. Nothing about
 * how a job crawls is duplicated here.
 */
async function runOneJob(ctx, job) {
  const { req, recorder, guard, tenantKey, batchWeek, forceBatchWeek, batchRunId } = ctx;
  const { PivotCurationRun, PivotCurationJob } = getGlobalModels(
    req,
    'PivotCurationRun',
    'PivotCurationJob',
  );

  const label = job.label || job.url || String(job._id);

  recorder.step({
    phase: 'crawling',
    kind: 'job-start',
    tone: 'info',
    title: `Crawling ${label}`,
    detail: job.defaultTags?.length ? `Tagged ${job.defaultTags.join(', ')}` : null,
    url: job.url || null,
  });

  let runDoc;
  try {
    runDoc = await PivotCurationRun.create({
      tenantKey,
      jobId: job._id,
      parentBatchId: batchRunId,
      batchWeek,
      forceBatchWeek,
      status: 'queued',
      maxEvents: null,
      provider: job.provider,
      url: job.url,
      createdBy: ctx.actor,
      stats: emptyStats(
        forceBatchWeek
          ? `All events forced into ${batchWeek}.`
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
  } catch (err) {
    guard.noteFailure({ code: 'RUN_CREATE_FAILED', error: err.message });
    recorder.bumpCounters({ jobsFailed: 1 });
    recorder.step({
      phase: 'crawling',
      kind: 'job-done',
      tone: 'warn',
      title: `Could not queue ${label}`,
      detail: err.message,
    });
    return { failed: true };
  }

  await executeCurationRun(runDoc._id);

  const finished = await PivotCurationRun.findById(runDoc._id).lean();
  const stats = finished?.stats || {};
  const summary = summarizeIngest(stats);
  const { written: upserted, skipped, failed } = summary;

  recorder.bumpCounters({
    jobsRun: 1,
    eventsUpserted: upserted,
    eventsSkipped: skipped,
    eventsFailed: failed,
    eventsUpdated: summary.refreshed,
    eventsUpdatedByFingerprint: summary.updatedByFingerprint,
    scrapes: 1,
  });

  if (finished?.status === 'failed') {
    // The per-job path already recorded the reason; the batch only needs to know
    // whether it should keep going.
    guard.noteFailure({ code: finished.errorCode, error: finished.error });
    recorder.bumpCounters({ jobsFailed: 1 });
    const stopping = guard.shouldStop();
    recorder.step({
      phase: 'crawling',
      kind: 'job-done',
      tone: stopping ? 'bad' : 'warn',
      title: `${label} failed`,
      detail: finished.error || 'Crawl failed.',
      code: finished.errorCode || null,
      url: job.url || null,
    });
    return { failed: true };
  }

  guard.noteSuccess();

  const weeks = Object.keys(stats.byBatchWeek || {}).sort();
  const detailParts = [];
  if (weeks.length > 1) detailParts.push(`across ${weeks.length} weeks (${weeks.join(', ')})`);
  else if (weeks.length === 1) detailParts.push(`into ${weeks[0]}`);
  if (skipped) detailParts.push(`${skipped} already on the calendar`);
  if (failed) detailParts.push(`${failed} could not be added`);

  recorder.step({
    phase: 'crawling',
    kind: 'job-done',
    tone: upserted > 0 ? 'good' : 'warn',
    title: `${label} — ${summary.phrase}`,
    detail: detailParts.length ? detailParts.join(' · ') : null,
    url: job.url || null,
    eventCount: summary.added,
  });

  return { upserted, skipped, failed, added: summary.added };
}

/**
 * Run the batch. Assumes the recorder already exists so the caller could return
 * its id before any crawling started.
 */
async function executeCurationBatch(options = {}) {
  const tenantKey = trimString(options.tenantKey);
  const recorder = options.recorder;
  const guard = createRunGuard({ recorder, getPhase: () => 'crawling' });

  const [globalDb, db] = await Promise.all([
    connectToGlobalDatabase(),
    connectToDatabase(tenantKey),
  ]);
  const req = {
    globalDb,
    db,
    school: tenantKey,
    user: options.actor ? { email: options.actor } : {},
  };

  const selected = await selectBatchJobs(req, { tenantKey, jobIds: options.jobIds });
  const { jobs, skippedGenericSite } = jobsReadyForScrapeConfig(selected);
  const skipped = skippedGenericSite || options.skippedGenericSite || 0;

  recorder.step({
    phase: 'planning',
    kind: 'plan',
    tone: skipped ? 'warn' : 'info',
    title: `Refreshing ${jobs.length} source(s) for ${tenantKey}`,
    detail: [
      options.forceBatchWeek
        ? `Every event forced into ${options.batchWeek}`
        : `Events land in the week of their own date · ${options.batchWeek} for anything undated`,
      skipped
        ? `${skipped} website job(s) skipped — FIRECRAWL_API_KEY is not set`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
  });

  if (!jobs.length) {
    recorder.step({
      phase: 'done',
      kind: 'done',
      tone: 'warn',
      title: 'Nothing to run',
      detail: 'No enabled, crawlable jobs remained by the time the batch started',
    });
    await recorder.finish({ status: 'completed' });
    return { jobsRun: 0, events: { upserted: 0, skipped: 0, failed: 0 } };
  }

  recorder.setPhase('crawling');

  const ctx = {
    req,
    recorder,
    guard,
    tenantKey,
    batchWeek: options.batchWeek,
    forceBatchWeek: Boolean(options.forceBatchWeek),
    batchRunId: recorder.runId,
    actor: options.actor || null,
  };

  const results = await runPool(
    jobs,
    BATCH_CONCURRENCY,
    (job) => runOneJob(ctx, job),
    guard.shouldStop,
  );

  const totals = results.reduce(
    (acc, row) => {
      acc.upserted += row?.upserted || 0;
      acc.added += row?.added || 0;
      acc.skipped += row?.skipped || 0;
      acc.failed += row?.failed || 0;
      return acc;
    },
    { upserted: 0, added: 0, skipped: 0, failed: 0 },
  );
  const jobsRun = results.filter((row) => row && !row.failed).length;

  if (guard.aborted) {
    recorder.step({
      phase: 'crawling',
      kind: 'abort',
      tone: 'bad',
      title: 'Batch stopped early',
      detail: `${guard.aborted.error} — the remaining jobs were left for a later run rather than crawled into the same wall`,
      code: guard.aborted.code,
    });
  }

  const missed = jobs.length - jobsRun;
  recorder.step({
    phase: 'done',
    kind: 'done',
    tone: totals.added > 0 ? 'good' : 'warn',
    title: totals.added
      ? `Done — ${totals.added} new event(s) from ${jobsRun} source(s)`
      : `Done — nothing new from ${jobsRun} source(s)`,
    detail: [
      totals.upserted - totals.added > 0
        ? `${totals.upserted - totals.added} existing event(s) refreshed`
        : null,
      missed > 0 ? `${missed} source(s) did not complete` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null,
  });

  await recorder.finish({
    status: guard.aborted ? 'failed' : 'completed',
    aborted: guard.aborted || undefined,
  });

  return { jobsRun, events: totals, aborted: guard.aborted };
}

function scheduleCurationBatch(options = {}) {
  const recorder = options.recorder || null;

  setImmediate(async () => {
    try {
      const result = await executeCurationBatch(options);
      logPivot('info', 'curation batch completed', {
        tenantKey: options.tenantKey,
        jobsRun: result.jobsRun,
        events: result.events,
        aborted: result.aborted?.code || null,
      });
    } catch (err) {
      logPivot('error', 'curation batch crashed', {
        tenantKey: options.tenantKey,
        error: err.message,
      });
      await recorder?.finish({ status: 'failed', error: err.message });
    }
  });
}

async function getCurationBatch(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const runId = trimString(options.runId);
  if (!runId || !mongoose.Types.ObjectId.isValid(runId)) {
    return { error: 'Invalid run id.', status: 400, code: 'INVALID_RUN_ID' };
  }

  const doc = await findOrchestrationRun(req, {
    tenantKey: tenantResult.tenant.tenantKey,
    runId,
    kind: 'curation-batch',
  });

  if (!doc) {
    return { error: 'Curation batch not found.', status: 404, code: 'RUN_NOT_FOUND' };
  }

  return { data: { run: serializeDiscoveryRun(doc) } };
}

async function getLatestCurationBatch(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const includeSteps = options.includeSteps === true;
  const doc = await findLatestOrchestrationRun(req, {
    tenantKey: tenantResult.tenant.tenantKey,
    kind: 'curation-batch',
    includeSteps,
  });

  return { data: { run: doc ? serializeDiscoveryRun(doc, { includeSteps }) : null } };
}

module.exports = {
  startCurationBatch,
  executeCurationBatch,
  scheduleCurationBatch,
  selectBatchJobs,
  getCurationBatch,
  getLatestCurationBatch,
  BATCH_CONCURRENCY,
};
