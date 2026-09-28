const mongoose = require('mongoose');
const getGlobalModels = require('./getGlobalModelService');
const { GENERIC_SITE_PROVIDER } = require('./pivotIngestPreviewService');
const {
  executeCurationRun,
  summarizeIngest,
  emptyStats,
} = require('./pivotCurationRunService');
const { buildEventProposalFromEntry } = require('./pivotDiscoverySinks');

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function boundedFailure(error, fallbackCode = 'PREVIEW_FAILED', fallbackMessage = 'Crawl failed.') {
  const rawCode = trimString(error?.code) || fallbackCode;
  const safeCode = rawCode.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || fallbackCode;
  const safeMessage = (trimString(error?.error || error?.message) || fallbackMessage).slice(0, 1000);
  return { code: safeCode, message: safeMessage };
}

function createRefreshProposalCollector() {
  return {
    jobOutcomes: [],
    events: [],
  };
}

function entriesFromPreview(preview, jobUrl) {
  if (preview?.error) return { error: preview };
  let entries = [];
  if (preview.data?.mode === 'batch') {
    entries = preview.data.drafts || [];
  } else if (preview.data?.mode === 'single' && preview.data.draft) {
    entries = [{
      draft: preview.data.draft,
      warnings: preview.data.warnings || [],
      sourceUrl: preview.data.draft.sourceUrl || jobUrl,
    }];
  }
  return { entries };
}

function contextJobToRuntime(job) {
  return {
    _id: job.jobId,
    tenantKey: job.cityKey,
    label: job.label,
    url: job.url,
    provider: job.provider,
    enabled: job.enabled !== false,
    defaultTags: Array.isArray(job.defaultTags) ? job.defaultTags : [],
    promptHints: Array.isArray(job.promptHints) ? job.promptHints : [],
    extractionRules: Array.isArray(job.extractionRules) ? job.extractionRules : [],
    recordVersion: job.recordVersion,
    linkedSourceHost: job.linkedSourceHost || null,
  };
}

function hostFromJob(job) {
  if (job.linkedSourceHost) return job.linkedSourceHost;
  try {
    return new URL(job.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function createDatabaseCurationRefreshSinks() {
  return {
    mode: 'database',

    async runJob(ctx, job) {
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

      return { upserted, skipped, failed, added: summary.added, refreshed: summary.refreshed };
    },
  };
}

function createArtifactCurationRefreshSinks(contextSnapshot, collector) {
  const jobById = new Map(
    (contextSnapshot.jobs || []).map((job) => [job.jobId, job]),
  );

  return {
    mode: 'artifact',
    collector,

    async runJob(ctx, job) {
      const { recorder, guard, batchWeek, forceBatchWeek } = ctx;
      const contextJob = jobById.get(String(job._id)) || job;
      const basedOnRecordVersion = contextJob.recordVersion;
      const label = job.label || job.url || String(job._id);
      const host = hostFromJob(contextJob);
      const defaultTags = Array.isArray(job.defaultTags) ? job.defaultTags : [];

      recorder.step({
        phase: 'crawling',
        kind: 'job-start',
        tone: 'info',
        title: `Crawling ${label}`,
        detail: defaultTags.length ? `Tagged ${defaultTags.join(', ')}` : null,
        url: job.url || null,
      });

      if (job.provider === GENERIC_SITE_PROVIDER && contextSnapshot.providerCapabilities?.firecrawlConfigured === false) {
        collector.jobOutcomes.push({
          jobId: String(job._id),
          outcome: 'skipped',
          basedOnRecordVersion,
          hintCount: job.promptHints?.length || 0,
          extractionRequests: 0,
          failure: {
            code: 'SITE_SCRAPE_NOT_CONFIGURED',
            message: 'Website scraping is not configured.',
          },
        });
        recorder.bumpCounters({ jobsFailed: 1 });
        recorder.step({
          phase: 'crawling',
          kind: 'job-done',
          tone: 'warn',
          title: `${label} skipped`,
          detail: 'FIRECRAWL_API_KEY is not configured for generic-site jobs',
        });
        return { failed: true, skipped: true };
      }

      const preview = await ctx.previewIngestUrl({
        url: job.url,
        provider: job.provider,
        timezone: contextSnapshot.tenant.timezone,
        promptHints: job.promptHints,
        extractionRules: job.extractionRules,
      });

      const parsed = entriesFromPreview(preview, job.url);
      if (parsed.error) {
        const failure = boundedFailure(parsed.error);
        collector.jobOutcomes.push({
          jobId: String(job._id),
          outcome: 'failed',
          basedOnRecordVersion,
          hintCount: job.promptHints?.length || 0,
          extractionRequests: job.provider === GENERIC_SITE_PROVIDER ? 1 : 0,
          failure,
        });
        guard.noteFailure({ code: failure.code, error: failure.message });
        recorder.bumpCounters({ jobsFailed: 1 });
        recorder.step({
          phase: 'crawling',
          kind: 'job-done',
          tone: 'warn',
          title: `${label} failed`,
          detail: failure.message,
          code: failure.code,
          url: job.url || null,
        });
        return { failed: true };
      }

      let proposed = 0;
      let refreshed = 0;
      for (const entry of parsed.entries) {
        const proposal = buildEventProposalFromEntry(entry, {
          host,
          provider: job.provider,
          defaultTags,
          linkedJobId: String(job._id),
          batchWeek,
          forceBatchWeek,
        });
        if (!proposal) continue;
        collector.events.push(proposal);
        proposed += 1;
        refreshed += 1;
      }

      collector.jobOutcomes.push({
        jobId: String(job._id),
        outcome: 'completed',
        basedOnRecordVersion,
        hintCount: job.promptHints?.length || 0,
        extractionRequests: job.provider === GENERIC_SITE_PROVIDER ? 1 : 0,
      });

      guard.noteSuccess();
      recorder.bumpCounters({
        jobsRun: 1,
        eventsUpserted: proposed,
        eventsUpdated: refreshed,
        scrapes: 1,
      });
      recorder.step({
        phase: 'crawling',
        kind: 'job-done',
        tone: proposed > 0 ? 'good' : 'warn',
        title: `${label} — ${proposed ? `${proposed} event(s) proposed` : 'nothing new'}`,
        detail: forceBatchWeek ? `Forced into ${batchWeek}` : null,
        url: job.url || null,
        eventCount: proposed,
      });

      return { upserted: proposed, skipped: 0, failed: 0, added: proposed, refreshed };
    },
  };
}

module.exports = {
  createRefreshProposalCollector,
  createDatabaseCurationRefreshSinks,
  createArtifactCurationRefreshSinks,
  contextJobToRuntime,
  entriesFromPreview,
  hostFromJob,
  boundedFailure,
};
