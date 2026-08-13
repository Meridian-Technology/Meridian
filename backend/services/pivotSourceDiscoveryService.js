const mongoose = require('mongoose');
const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { isAllowedHost, detectProvider } = require('./pivotIngestPreviewService');
const {
  searchSites,
  mapSite,
  scrapeSiteEvents,
  normalizeSiteUrl,
  isBlockedScrapeHost,
  isSiteScrapeConfigured,
  scrapeNotConfiguredResult,
} = require('./pivotSiteScrapeService');
const { createCurationJob, updateCurationJob } = require('./pivotCurationJobService');
const {
  createDiscoveryRun,
  serializeDiscoveryRun,
  findOrchestrationRun,
  findLatestOrchestrationRun,
  watchDiscoveryRunCancel,
} = require('./pivotDiscoveryRunRecorder');

const OPERATOR_CANCEL = {
  code: 'CANCELLED',
  error: 'Stopped by operator.',
};

function abortStepFor(aborted, phase) {
  const cancelled = aborted?.code === 'CANCELLED';
  return {
    phase: phase || 'searching',
    kind: 'abort',
    tone: 'bad',
    title: cancelled ? 'Stopped by operator' : 'Run stopped early',
    detail: cancelled
      ? 'Remaining work was skipped.'
      : `${aborted.error} — remaining hosts were skipped rather than retried into the same wall`,
    code: aborted?.code || null,
  };
}
const {
  createRunGuard,
  runPool,
  FATAL_RUN_CODES: FATAL_DISCOVERY_CODES,
  RATE_LIMIT_ABORT_STREAK,
} = require('./pivotRunGuard');
const {
  ingestEntries,
  resolveRunBatchWeek,
  summarizeIngest,
  executeCurationRun,
  emptyStats,
} = require('./pivotCurationRunService');
const { startCurationBatch } = require('./pivotCurationBatchService');
const {
  buildDiscoveryQueries,
  isNonSourceHost,
  EVENT_INDEX_PATH_HINTS,
  EVENT_INDEX_MAP_SEARCH,
} = require('../constants/pivotDiscoverySeeds');
const { logPivot } = require('../utilities/pivotLogger');
const { MAX_STEPS } = require('../schemas/pivotSourceDiscoveryRun');
const {
  resolvePivotDiscoveryConfig,
  nativeSourceSpecs,
  isNativeSkipHost,
  isNativeIndexUrl,
  persistPivotDiscoveryConfig,
  validatePivotDiscoveryConfigPatch,
  mergePivotDiscoveryConfig,
  NATIVE_SKIP_HOSTS,
} = require('../utilities/pivotDiscoveryConfig');

/**
 * Autonomous event-source discovery for a city.
 *
 * Replaces the manual CLI-agent loop that bootstrapped long-tail cities. That
 * loop did three things — search the web for candidate sites, read each one to
 * judge whether it was a real event calendar, and extract the events — and
 * needed a human watching because it drifted, re-searched ground it had already
 * covered, and lost its findings when the session ended.
 *
 * Each of those three steps maps onto a Firecrawl endpoint, so the loop becomes
 * an ordinary pipeline: search for candidates, map each candidate's site to find
 * its calendar index, then extract from that index to prove the source yields
 * events. Nothing here is agentic, which is the point — the same city produces
 * the same queries every run, findings persist in `PivotCitySource`, and the
 * cost of a run is bounded before it starts rather than discovered afterwards.
 *
 * A qualifying scrape already returns every event on the page — the size cap is
 * applied to the response, not the request — so discovery publishes what it
 * extracted instead of discarding it. Re-crawling to recover those events would
 * cost exactly what the first crawl cost. It still goes through the curation
 * run's `ingestEntries`, so there remains one publish path with one set of
 * batch-week, tag, and duplicate rules.
 *
 * The curation job a qualified source receives is therefore its *refresh*
 * mechanism rather than its initial load. The exception is a natively parsed
 * host (Partiful, Luma), which qualifies without a scrape and so has no events
 * to hand over; those jobs are handed to a follow-up batch run.
 */

/** Concurrency for outbound Firecrawl calls — enough to keep a run brisk, low enough to stay under rate limits. */
const DISCOVERY_CONCURRENCY = 4;
/**
 * Searches run narrower than the rest. The seed phase fires the most requests in
 * the shortest window, and on smaller Firecrawl plans four at once trips the
 * per-minute limit on the very first batch.
 */
const SEARCH_CONCURRENCY = 2;
/** Results requested per search query. */
const DEFAULT_RESULTS_PER_QUERY = 8;
/** Candidate hosts qualified per run. The primary cost lever: each one costs a map + a scrape. */
const DEFAULT_MAX_CANDIDATES = 20;
/** Events a candidate must yield to be registered. Permissive by design; small cities have thin calendars. */
const DEFAULT_MIN_EVENTS = 1;
/** Links requested per map call. */
const MAP_LINK_LIMIT = 60;

/** Path shapes that mark a single dated listing or archive rather than a live index. */
const DATED_PATH_PATTERN = /\/(19|20)\d{2}([/-]\d{1,2})?(?=\/|$)/;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hostFromUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function listEnabledJobs(req, tenantKey) {
  const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
  const jobs = await PivotCurationJob.find({ tenantKey, enabled: { $ne: false } }).lean();
  return Array.isArray(jobs) ? jobs : [];
}

async function persistBootstrappedSource(req, tenantKey, spec, now, jobId) {
  const { PivotCitySource } = getGlobalModels(req, 'PivotCitySource');
  await PivotCitySource.findOneAndUpdate(
    { tenantKey, host: spec.host },
    {
      $set: {
        url: spec.url,
        label: spec.label,
        provider: spec.provider,
        status: 'qualified',
        rejectedReason: null,
        lastQualifiedAt: now,
        ...(jobId ? { curationJobId: String(jobId) } : {}),
      },
      $setOnInsert: {
        tenantKey,
        host: spec.host,
        discoveredVia: 'native-bootstrap',
        discoveredAt: now,
        enabled: true,
        seedTags: [],
      },
    },
    { new: true, upsert: true },
  );
}

/**
 * Crawl one native job inline so Luma/Partiful finish before Firecrawl search.
 * Same create-run + execute path the batch orchestrator uses; the discovery
 * recorder just narrates it under the `native` phase.
 */
async function crawlNativeJob(req, { state, tenantKey, job, actor }) {
  const { PivotCurationRun, PivotCurationJob } = getGlobalModels(
    req,
    'PivotCurationRun',
    'PivotCurationJob',
  );
  const label = job.label || job.url || String(job._id);

  state.recorder.step({
    phase: 'native',
    kind: 'job-start',
    tone: 'info',
    title: `Crawling ${label}`,
    detail: 'Native parser — no Firecrawl credits',
    host: hostFromUrl(job.url),
    url: job.url || null,
  });

  let runDoc;
  try {
    runDoc = await PivotCurationRun.create({
      tenantKey,
      jobId: job._id,
      parentBatchId: mongoose.Types.ObjectId.isValid(state.recorder.runId)
        ? state.recorder.runId
        : null,
      batchWeek: state.nativeBatchWeek || null,
      forceBatchWeek: false,
      status: 'queued',
      maxEvents: null,
      provider: job.provider,
      url: job.url,
      createdBy: actor || null,
      stats: emptyStats('Events assigned to the ISO week of their start date.'),
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
    state.failures.push({ code: 'RUN_CREATE_FAILED', error: err.message });
    state.recorder.step({
      phase: 'native',
      kind: 'job-done',
      tone: 'warn',
      title: `Could not queue ${label}`,
      detail: err.message,
    });
    return { upserted: 0, skipped: 0, failed: 0 };
  }

  await executeCurationRun(runDoc._id);
  const finished = await PivotCurationRun.findById(runDoc._id).lean();
  const stats = finished?.stats || {};
  const summary = summarizeIngest(stats);
  const { written: upserted, skipped, failed } = summary;

  state.recorder.bumpCounters({
    eventsUpserted: upserted,
    eventsSkipped: skipped,
    eventsFailed: failed,
  });

  if (finished?.status === 'failed') {
    state.failures.push({
      code: finished.errorCode || 'PREVIEW_FAILED',
      error: finished.error || 'Crawl failed.',
    });
    state.recorder.step({
      phase: 'native',
      kind: 'job-done',
      tone: 'warn',
      title: `${label} failed`,
      detail: finished.error || 'Crawl failed.',
      code: finished.errorCode || null,
      url: job.url || null,
    });
    return { upserted: 0, skipped: 0, failed: failed || 1 };
  }

  const weeks = Object.keys(stats.byBatchWeek || {}).sort();
  const detailParts = [`no Firecrawl credits`];
  if (weeks.length === 1) detailParts.push(`into ${weeks[0]}`);
  if (skipped) detailParts.push(`${skipped} already on the calendar`);

  state.recorder.step({
    phase: 'native',
    kind: 'job-done',
    tone: upserted > 0 ? 'good' : 'warn',
    title: `${label} — ${summary.phrase}`,
    detail: detailParts.join(' · '),
    host: hostFromUrl(job.url),
    url: job.url || null,
    eventCount: summary.added,
  });
  return { upserted, skipped, failed };
}

async function bootstrapNativeSources(req, options) {
  const {
    state,
    tenantKey,
    city,
    config,
    createJobs,
    ingestEvents,
    now,
    actor,
  } = options;

  const skipHosts = new Set();
  const nativeJobIds = [];
  const jobsToRun = [];
  const existingJobs = await listEnabledJobs(req, tenantKey);

  for (const job of existingJobs) {
    const host = hostFromUrl(job.url);
    if (host) skipHosts.add(host);
  }

  if (config.skipNativeHostsInSearch) {
    for (const host of NATIVE_SKIP_HOSTS) skipHosts.add(host);
  }

  if (!config.runNative) {
    return { nativeJobIds, skipHosts, crawledJobIds: [], events: { upserted: 0, skipped: 0, failed: 0 } };
  }

  state.setPhase('native');
  const specs = nativeSourceSpecs(config, city);
  const existingNative = existingJobs.filter(
    (job) => job.provider === 'partiful' || job.provider === 'luma',
  );

  if (!specs.length && !existingNative.length) {
    state.recorder.step({
      phase: 'native',
      kind: 'native',
      tone: 'warn',
      title: 'No Luma or Partiful city jobs to run first',
      detail:
        'Set this city’s luma / Partiful slugs, or add those saved jobs. Firecrawl will still skip those hosts.',
    });
    return { nativeJobIds, skipHosts, crawledJobIds: [], events: { upserted: 0, skipped: 0, failed: 0 } };
  }

  for (const spec of specs) {
    const existing = existingJobs.find((job) => job.provider === spec.provider);
    if (existing) {
      nativeJobIds.push(String(existing._id));
      let job = existing;
      if (
        createJobs !== false &&
        spec.url &&
        !isNativeIndexUrl(spec.provider, existing.url)
      ) {
        const updated = await updateCurationJob(req, {
          tenantKey,
          jobId: String(existing._id),
          url: spec.url,
        });
        if (updated.data?.job) {
          job = { ...existing, url: updated.data.job.url };
        }
      }
      jobsToRun.push(job);
      state.recorder.step({
        phase: 'native',
        kind: 'native',
        tone: 'good',
        title: `${spec.host} already has a saved job`,
        detail: `${job.url} — crawling it before Firecrawl search`,
        host: spec.host,
        url: job.url,
      });
      continue;
    }

    if (createJobs === false) {
      state.recorder.step({
        phase: 'native',
        kind: 'native',
        tone: 'info',
        title: `Would save ${spec.label}`,
        detail: spec.url,
        host: spec.host,
        url: spec.url,
      });
      continue;
    }

    const jobResult = await createCurationJob(req, {
      tenantKey,
      label: spec.label,
      provider: spec.provider,
      url: spec.url,
      defaultBatchWeekStrategy: 'next-drop',
    });
    if (!jobResult.data?.job?._id) {
      state.failures.push({
        code: jobResult.code || null,
        error: jobResult.error,
      });
      state.recorder.step({
        phase: 'native',
        kind: 'job',
        tone: 'warn',
        title: `Could not save ${spec.label}`,
        detail: jobResult.error,
        host: spec.host,
      });
      continue;
    }

    nativeJobIds.push(String(jobResult.data.job._id));
    jobsToRun.push({ ...jobResult.data.job, _id: jobResult.data.job._id });
    state.recorder.bumpCounters({ jobsCreated: 1 });
    state.recorder.step({
      phase: 'native',
      kind: 'job',
      tone: 'good',
      title: `Saved job for ${spec.host}`,
      detail: `${spec.url} — crawling it before Firecrawl search`,
      host: spec.host,
      url: spec.url,
    });
    await persistBootstrappedSource(
      req,
      tenantKey,
      spec,
      now,
      jobResult.data.job._id,
    );
  }

  for (const job of existingNative) {
    const id = String(job._id);
    if (!nativeJobIds.includes(id)) {
      nativeJobIds.push(id);
      jobsToRun.push(job);
    }
  }

  const crawledJobIds = [];
  const events = { upserted: 0, skipped: 0, failed: 0 };
  if (ingestEvents !== false) {
    for (const job of jobsToRun) {
      if (state.shouldStop()) break;
      const crawled = await crawlNativeJob(req, { state, tenantKey, job, actor });
      crawledJobIds.push(String(job._id));
      if (crawled) {
        events.upserted += crawled.upserted || 0;
        events.skipped += crawled.skipped || 0;
        events.failed += crawled.failed || 0;
      }
    }
  }

  return { nativeJobIds, skipHosts, crawledJobIds, events };
}

/**
 * Score a URL on how much it looks like a recurring event index.
 *
 * Search engines hand back homepages and one-off event pages; neither is what a
 * refresh crawl wants. An index keeps yielding events every week, so hinted
 * paths win, shallower paths beat deeper ones, and a year in the path is treated
 * as evidence of a single dated listing or an archive.
 *
 * @returns {number} Higher is better. Zero means no event-index signal at all.
 */
function scoreEventIndexUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 0;
  }

  const path = parsed.pathname.toLowerCase();
  const segments = path.split('/').filter(Boolean);

  const hintIndex = EVENT_INDEX_PATH_HINTS.findIndex((hint) =>
    segments.some((segment) => segment === hint || segment.includes(hint)),
  );
  if (hintIndex === -1) return 0;

  let score = (EVENT_INDEX_PATH_HINTS.length - hintIndex) * 10;
  score -= segments.length * 2;
  if (DATED_PATH_PATTERN.test(path)) score -= 15;
  if (parsed.search) score -= 3;

  return Math.max(score, 1);
}

/**
 * Choose the best event-index URL among mapped links, falling back to the URL
 * search produced.
 *
 * @returns {{url: string, fromMap: boolean}|null} Null when neither the mapped
 *   links nor the fallback show any event-index signal, which is grounds for
 *   rejecting the host before paying for a scrape.
 */
function pickEventIndexUrl(links, fallbackUrl) {
  let best = null;
  let bestScore = 0;

  for (const link of Array.isArray(links) ? links : []) {
    const url = trimString(link?.url);
    if (!url) continue;
    const score = scoreEventIndexUrl(url);
    if (score > bestScore || (score === bestScore && score > 0 && url.length < best.length)) {
      best = url;
      bestScore = score;
    }
  }

  if (best) return { url: best, fromMap: true };

  const fallback = trimString(fallbackUrl);
  if (!fallback) return null;

  // Keep a hinted search result even when mapping found nothing better, but do
  // not spend a scrape on a bare homepage that mapping could not tie to a
  // calendar — that host almost certainly has no event index.
  if (scoreEventIndexUrl(fallback) > 0) {
    return { url: fallback, fromMap: false };
  }
  return null;
}

function serializeCitySource(doc) {
  const row = doc?.toObject ? doc.toObject() : doc;
  return {
    _id: String(row._id),
    tenantKey: row.tenantKey,
    host: row.host,
    url: row.url,
    label: row.label || null,
    provider: row.provider,
    status: row.status,
    rejectedReason: row.rejectedReason || null,
    enabled: row.enabled !== false,
    seedTags: Array.isArray(row.seedTags) ? row.seedTags : [],
    discoveredVia: row.discoveredVia || null,
    discoveredAt: row.discoveredAt || null,
    lastQualifiedAt: row.lastQualifiedAt || null,
    lastEventCount: row.lastEventCount || 0,
    curationJobId: row.curationJobId || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

async function listCitySources(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const { PivotCitySource } = getGlobalModels(req, 'PivotCitySource');
  const query = { tenantKey: tenantResult.tenant.tenantKey };
  if (options.status) query.status = options.status;

  const rows = await PivotCitySource.find(query)
    .sort({ status: 1, lastEventCount: -1, host: 1 })
    .lean();

  return { data: { sources: rows.map(serializeCitySource) } };
}

/**
 * Mute or re-enable a registered source.
 *
 * Separate from `status` so an operator can stop crawling a noisy but genuinely
 * qualified source without the registry making it look like discovery failed to
 * find it — and without it being re-discovered on the next run.
 */
async function updateCitySource(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const sourceId = trimString(options.sourceId);
  if (!sourceId || !mongoose.Types.ObjectId.isValid(sourceId)) {
    return { error: 'Invalid source id.', status: 400, code: 'INVALID_SOURCE_ID' };
  }

  if (options.enabled === undefined) {
    return { error: 'enabled is required.', status: 400, code: 'NO_CHANGES' };
  }

  const { PivotCitySource } = getGlobalModels(req, 'PivotCitySource');
  const doc = await PivotCitySource.findOneAndUpdate(
    { _id: sourceId, tenantKey: tenantResult.tenant.tenantKey },
    { $set: { enabled: Boolean(options.enabled) } },
    { new: true },
  );

  if (!doc) {
    return { error: 'Source not found.', status: 404, code: 'SOURCE_NOT_FOUND' };
  }

  return { data: { source: serializeCitySource(doc) } };
}

/**
 * Collect candidate hosts by running the seed queries.
 *
 * Dedupes to one candidate per host and unions the seed tags that found it, so a
 * venue surfaced by both the live-music and nightlife queries carries both tags
 * into its curation job.
 */
async function collectCandidates(state, queries, resultsPerQuery, skipHosts) {
  const candidates = new Map();
  const skipped = new Set();
  const blocked = skipHosts instanceof Set ? skipHosts : new Set();

  await runPool(
    queries,
    SEARCH_CONCURRENCY,
    async ({ query, tag }) => {
      const result = await searchSites({
        query,
        location: state.location,
        limit: resultsPerQuery,
        onRetry: state.onRetry,
      });
      state.calls.searches += 1;
      state.recorder.bumpCounters({ searches: 1 });

      if (result.error) {
        state.noteFailure(result);
        state.recorder.step({
          phase: 'searching',
          kind: 'search',
          tone: 'warn',
          title: `Search failed: “${query}”`,
          detail: result.error,
          code: result.code || null,
          tag: tag || null,
        });
        return;
      }

      state.noteSuccess();

      let newHosts = 0;
      for (const row of result.results) {
        const host = hostFromUrl(row.url);
        if (!host) continue;

        if (blocked.has(host)) {
          if (!skipped.has(host)) {
            skipped.add(host);
            const native = isNativeSkipHost(host);
            state.recorder.bumpCounters(
              native ? { skippedNative: 1 } : { skippedKnown: 1 },
            );
            state.recorder.step({
              phase: 'searching',
              kind: 'filter',
              tone: 'info',
              title: `Skipped ${host}`,
              detail: native
                ? 'Native parser — already covered before Firecrawl search'
                : 'Already has a saved job or registry row',
              host,
              url: row.url,
            });
          }
          continue;
        }

        const existing = candidates.get(host);
        if (existing) {
          if (tag) existing.seedTags.add(tag);
          continue;
        }
        newHosts += 1;
        candidates.set(host, {
          host,
          url: row.url,
          title: row.title,
          seedTags: new Set(tag ? [tag] : []),
          discoveredVia: query,
        });
      }

      state.recorder.step({
        phase: 'searching',
        kind: 'search',
        tone: 'info',
        title: `Searched “${query}”`,
        detail: `${result.results.length} result${result.results.length === 1 ? '' : 's'}, ${newHosts} new host${newHosts === 1 ? '' : 's'}`,
        tag: tag || null,
      });
      state.recorder.bumpCounters({ candidatesFound: newHosts });
    },
    state.shouldStop,
  );

  return candidates;
}

/**
 * Publish one qualified source's events, narrating the result.
 *
 * Ingest failures are reported and then dropped: a source that registered fine
 * but whose events collided with existing rows is still a good source, and its
 * curation job will retry the same drafts on the next crawl.
 */
async function ingestEvents(req, { state, tenantKey, source, entries, batchWeek }) {
  try {
    const { stats } = await ingestEntries(req, {
      tenantKey,
      batchWeek,
      forceBatchWeek: false,
      entries,
      // The seed query that found the source is the same category signal its job
      // uses, so events land with identical tags either way.
      defaultTags: source.seedTags,
      logContext: { runId: state.recorder.runId, host: source.host },
    });

    const summary = summarizeIngest(stats);
    const { written: upserted, skipped, failed } = summary;

    state.recorder.bumpCounters({
      eventsUpserted: upserted,
      eventsSkipped: skipped,
      eventsFailed: failed,
    });

    const weeks = Object.keys(stats.byBatchWeek || {}).sort();
    const detailParts = [];
    if (weeks.length > 1) detailParts.push(`across ${weeks.length} weeks (${weeks.join(', ')})`);
    else if (weeks.length === 1) detailParts.push(`into ${weeks[0]}`);
    if (skipped) detailParts.push(`${skipped} already on the calendar`);
    if (failed) detailParts.push(`${failed} could not be added`);

    state.recorder.step({
      phase: 'registering',
      kind: 'ingest',
      tone: upserted > 0 ? 'good' : 'warn',
      title: `${source.host} — ${summary.phrase}`,
      detail: detailParts.length ? detailParts.join(' · ') : null,
      host: source.host,
      url: source.url,
      eventCount: summary.added,
    });

    return { upserted, skipped, failed };
  } catch (err) {
    logPivot('warn', 'discovery ingest failed', {
      tenantKey,
      host: source.host,
      error: err.message,
    });
    state.recorder.step({
      phase: 'registering',
      kind: 'ingest',
      tone: 'warn',
      title: `Could not add events from ${source.host}`,
      detail: `${err.message} — the source is still registered and its job will retry`,
      host: source.host,
    });
    return { upserted: 0, skipped: 0, failed: entries.length };
  }
}

/**
 * Qualify one candidate: locate its event index, then prove the index yields
 * events. Hosts with a native parser skip both steps — Partiful and Luma are
 * parsed directly and for free, so spending Firecrawl credits to verify them
 * would be pure waste.
 */
async function qualifyCandidate(state, candidate) {
  const nativeProvider = isAllowedHost(candidate.host) ? detectProvider(candidate.host) : null;
  if (nativeProvider) {
    state.recorder.step({
      phase: 'qualifying',
      kind: 'native',
      tone: 'good',
      title: `${candidate.host} has a native parser`,
      detail: `Registering as ${nativeProvider} — no credits spent verifying it`,
      host: candidate.host,
      url: candidate.url,
    });
    return {
      candidate,
      status: 'qualified',
      provider: nativeProvider,
      url: candidate.url,
      label: candidate.title,
      eventCount: 0,
    };
  }

  state.recorder.step({
    phase: 'qualifying',
    kind: 'map',
    tone: 'info',
    title: `Looking for a calendar on ${candidate.host}`,
    detail: 'Mapping the site — one credit, versus five to extract a wrong page',
    host: candidate.host,
    url: candidate.url,
  });

  const mapped = await mapSite({
    url: candidate.url,
    search: EVENT_INDEX_MAP_SEARCH,
    limit: MAP_LINK_LIMIT,
    onRetry: state.onRetry,
  });
  state.calls.maps += 1;
  state.recorder.bumpCounters({ maps: 1 });

  if (mapped.error) {
    state.noteFailure(mapped);
    const stopping = state.shouldStop();
    state.recorder.step({
      phase: 'qualifying',
      kind: 'map',
      tone: stopping ? 'bad' : 'warn',
      title: `Could not map ${candidate.host}`,
      detail: mapped.error,
      code: mapped.code || null,
      host: candidate.host,
    });
    if (stopping) return null;
  } else {
    state.noteSuccess();
  }

  const picked = pickEventIndexUrl(mapped.links, candidate.url);
  if (!picked) {
    state.recorder.step({
      phase: 'qualifying',
      kind: 'reject',
      tone: 'warn',
      title: `No calendar page on ${candidate.host}`,
      detail: `Nothing among ${mapped.links?.length || 0} mapped link(s) looked like an event index, so no scrape was spent`,
      host: candidate.host,
      reason: 'no-index-page',
    });
    return {
      candidate,
      status: 'rejected',
      provider: 'generic-site',
      url: candidate.url,
      rejectedReason: 'no-index-page',
    };
  }

  state.recorder.step({
    phase: 'qualifying',
    kind: 'index',
    tone: 'info',
    title: `Chose ${picked.url}`,
    detail: picked.fromMap
      ? `Best of ${mapped.links?.length || 0} mapped links (score ${scoreEventIndexUrl(picked.url)})`
      : 'Mapping found nothing better, keeping the search result',
    host: candidate.host,
    url: picked.url,
    score: scoreEventIndexUrl(picked.url),
  });

  state.recorder.step({
    phase: 'qualifying',
    kind: 'scrape',
    tone: 'info',
    title: `Extracting events from ${candidate.host}`,
    detail: `Resolving dates in ${state.timezone}`,
    host: candidate.host,
    url: picked.url,
  });

  // No maxEvents: the cap is applied to the response, not the request, so asking
  // for ten costs exactly what asking for all of them costs. Since discovery now
  // publishes what it extracts, taking the whole page is strictly better.
  const scraped = await scrapeSiteEvents({
    url: picked.url,
    timezone: state.timezone,
    onRetry: state.onRetry,
  });
  state.calls.scrapes += 1;
  state.recorder.bumpCounters({ scrapes: 1 });

  if (scraped.error) {
    state.noteFailure(scraped);
    const stopping = state.shouldStop();
    state.recorder.step({
      phase: 'qualifying',
      kind: 'reject',
      tone: stopping ? 'bad' : 'warn',
      title: `Extraction failed on ${candidate.host}`,
      detail: scraped.error,
      code: scraped.code || null,
      host: candidate.host,
      reason: 'scrape-failed',
    });
    if (stopping) return null;
    return {
      candidate,
      status: 'rejected',
      provider: 'generic-site',
      url: picked.url,
      rejectedReason: 'scrape-failed',
    };
  }

  state.noteSuccess();

  // A listing without a resolvable start time is not schedulable, so it does not
  // count toward the threshold even though the extractor returned it.
  const dated = scraped.drafts.filter((entry) => entry.draft?.start_time);
  const undated = scraped.drafts.length - dated.length;

  if (dated.length < state.minEvents) {
    const reason = dated.length === 0 ? 'no-events' : 'below-threshold';
    state.recorder.step({
      phase: 'qualifying',
      kind: 'reject',
      tone: 'warn',
      title:
        reason === 'no-events'
          ? `No dated events on ${candidate.host}`
          : `Only ${dated.length} dated event(s) on ${candidate.host}`,
      detail:
        undated > 0
          ? `${undated} listing(s) had no resolvable start time, so they cannot be scheduled`
          : `Below the threshold of ${state.minEvents}`,
      host: candidate.host,
      url: picked.url,
      eventCount: dated.length,
      reason,
    });
    return {
      candidate,
      status: 'rejected',
      provider: 'generic-site',
      url: picked.url,
      rejectedReason: reason,
      eventCount: dated.length,
    };
  }

  state.recorder.step({
    phase: 'qualifying',
    kind: 'qualify',
    tone: 'good',
    title: `${candidate.host} qualified with ${dated.length} event(s)`,
    detail: undated > 0 ? `${undated} undated listing(s) ignored` : null,
    host: candidate.host,
    url: picked.url,
    eventCount: dated.length,
  });

  return {
    candidate,
    status: 'qualified',
    provider: 'generic-site',
    url: picked.url,
    label: scraped.listLabel || candidate.title,
    eventCount: dated.length,
    // Carried so the registering phase can publish them. These are already paid
    // for; dropping them here is what used to force a second identical scrape.
    entries: dated,
  };
}

async function persistOutcome(req, tenantKey, outcome, now) {
  const { PivotCitySource } = getGlobalModels(req, 'PivotCitySource');
  const seedTags = [...outcome.candidate.seedTags];
  const qualified = outcome.status === 'qualified';

  const doc = await PivotCitySource.findOneAndUpdate(
    { tenantKey, host: outcome.candidate.host },
    {
      $set: {
        url: outcome.url,
        label: trimString(outcome.label) || null,
        provider: outcome.provider,
        status: outcome.status,
        rejectedReason: outcome.rejectedReason || null,
        lastEventCount: outcome.eventCount || 0,
        ...(qualified ? { lastQualifiedAt: now } : {}),
      },
      $setOnInsert: {
        tenantKey,
        host: outcome.candidate.host,
        discoveredVia: outcome.candidate.discoveredVia,
        discoveredAt: now,
        enabled: true,
      },
      $addToSet: { seedTags: { $each: seedTags } },
    },
    // No setDefaultsOnInsert: the schema default for `seedTags` would collide
    // with the $addToSet on the same path. Insert-time values are set explicitly
    // in $setOnInsert instead.
    { new: true, upsert: true },
  );

  return doc;
}

/**
 * Discover event sources for a city.
 *
 * @param {object} req - request carrying `req.globalDb`
 * @param {object} options
 * @param {string} options.tenantKey - the city; the only required input
 * @param {string[]} [options.tags] - catalog slugs to cover; defaults to all
 * @param {number} [options.maxQueries] - cap on seed queries
 * @param {number} [options.maxCandidates] - cap on hosts qualified this run
 * @param {number} [options.minEvents] - events required to qualify a host
 * @param {boolean} [options.createJobs=true] - create curation jobs for qualified sources
 * @param {boolean} [options.recheckRejected=false] - re-evaluate previously rejected hosts
 */
async function discoverCitySources(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenant = tenantResult.tenant;
  const tenantKey = tenant.tenantKey;
  const city = trimString(tenant.name) || tenantKey;
  const location = trimString(tenant.location) || city;

  const queries = buildDiscoveryQueries({
    city,
    tags: options.tags,
    maxQueries: options.maxQueries,
  });
  if (!queries.length) {
    return {
      error: 'Unable to build discovery queries for this city.',
      status: 400,
      code: 'NO_DISCOVERY_QUERIES',
    };
  }

  const maxCandidates = Number(options.maxCandidates) > 0
    ? Math.floor(Number(options.maxCandidates))
    : DEFAULT_MAX_CANDIDATES;
  const minEvents = Number(options.minEvents) > 0
    ? Math.floor(Number(options.minEvents))
    : DEFAULT_MIN_EVENTS;
  const discovery = resolvePivotDiscoveryConfig(tenant, options);
  const firecrawlCalls = discovery.runFirecrawl
    ? queries.length + maxCandidates * 2
    : 0;

  // Reuse a run document when the caller already created one, so the id can be
  // handed back over HTTP before the work starts.
  const recorder = options.recorder
    || (await createDiscoveryRun(req, {
      record: options.record,
      tenantKey,
      city,
      actor: options.actor,
      tags: options.tags,
      createJobs: options.createJobs,
      recheckRejected: options.recheckRejected,
      plan: {
        queries: discovery.runFirecrawl ? queries.length : 0,
        categories: new Set(queries.map((row) => row.tag).filter(Boolean)).size,
        maxCandidates: discovery.runFirecrawl ? maxCandidates : 0,
        minEvents,
        maxOutboundCalls: firecrawlCalls,
        flow: discovery.flow,
        runNative: discovery.runNative,
        runFirecrawl: discovery.runFirecrawl,
        lumaSlug: discovery.lumaSlug,
        partifulSlug: discovery.partifulSlug,
      },
    }));

  // The guard owns aborted/failures/rateLimitStreak; assigning onto it keeps
  // `state.aborted` reading the same object the guard mutates.
  const state = Object.assign(
    createRunGuard({ recorder, getPhase: () => state.phase }),
    {
      location,
      timezone: trimString(tenant.pivotDropTimezone) || 'UTC',
      minEvents,
      calls: { searches: 0, maps: 0, scrapes: 0 },
      recorder,
    },
  );

  state.phase = 'searching';
  state.setPhase = (phase) => {
    state.phase = phase;
    recorder.setPhase(phase);
  };

  const cancelWatch = watchDiscoveryRunCancel(req, recorder.runId, () => {
    if (!state.aborted) state.aborted = { ...OPERATOR_CANCEL };
  });

  try {
  const now = options.now instanceof Date ? options.now : new Date();
  const weekResult = resolveRunBatchWeek({
    strategy: 'next-drop',
    tenant,
    now,
  });
  state.nativeBatchWeek = weekResult.error ? null : weekResult.batchWeek;

  const resultsPerQuery = Number(options.resultsPerQuery) > 0
    ? Math.floor(Number(options.resultsPerQuery))
    : DEFAULT_RESULTS_PER_QUERY;

  const nativeBootstrap = await bootstrapNativeSources(req, {
    state,
    tenantKey,
    city,
    config: discovery,
    createJobs: options.createJobs,
    ingestEvents: options.ingestEvents,
    now,
    actor: options.actor,
  });
  const crawledNativeIds = new Set(nativeBootstrap.crawledJobIds);

  if (state.aborted) {
    recorder.step(abortStepFor(state.aborted, state.phase));
    await recorder.finish({ status: 'failed', aborted: state.aborted });
    return {
      data: {
        runId: recorder.runId,
        tenantKey,
        city,
        location,
        queries: queries.length,
        candidates: {
          found: 0,
          skippedKnown: 0,
          skippedNonSource: 0,
          skippedNative: recorder.counters?.skippedNative || 0,
          evaluated: 0,
        },
        qualified: [],
        rejected: [],
        events: { upserted: 0, skipped: 0, failed: 0 },
        nativeJobIds: nativeBootstrap.nativeJobIds,
        calls: state.calls,
        aborted: state.aborted,
        failures: state.failures,
      },
    };
  }

  const { PivotCitySource } = getGlobalModels(req, 'PivotCitySource');
  const knownRows = await PivotCitySource.find({ tenantKey }).select('host status').lean();
  const known = new Set(
    knownRows
      .filter((row) => options.recheckRejected !== true || row.status !== 'rejected')
      .map((row) => row.host),
  );
  const skipHosts = new Set(nativeBootstrap.skipHosts);

  let candidates = new Map();
  if (discovery.runFirecrawl) {
    state.setPhase('searching');
    recorder.step({
      phase: 'searching',
      kind: 'plan',
      tone: 'info',
      title: `Searching the web for ${city} event sources`,
      detail: `${queries.length} queries seeded from the tag catalog · at most ${
        firecrawlCalls
      } outbound Firecrawl calls · dates resolved in ${state.timezone}`,
    });

    candidates = await collectCandidates(state, queries, resultsPerQuery, skipHosts);
  } else {
    recorder.step({
      phase: 'native',
      kind: 'plan',
      tone: 'info',
      title: `Native-only flow for ${city}`,
      detail: 'Skipping Firecrawl search — this city is configured to use Luma and Partiful only',
    });
  }

  if (state.aborted) {
    recorder.step(abortStepFor(state.aborted, state.phase));
    await recorder.finish({ status: 'failed', aborted: state.aborted });
    return {
      data: {
        runId: recorder.runId,
        tenantKey,
        city,
        location,
        queries: queries.length,
        candidates: {
          found: candidates.size,
          skippedKnown: 0,
          skippedNonSource: 0,
          skippedNative: 0,
          evaluated: 0,
        },
        qualified: [],
        rejected: [],
        events: { upserted: 0, skipped: 0, failed: 0 },
        nativeJobIds: nativeBootstrap.nativeJobIds,
        calls: state.calls,
        aborted: state.aborted,
        failures: state.failures,
      },
    };
  }

  let outcomes = [];
  const skipped = { known: 0, nonSource: 0 };
  let evaluatedCount = 0;
  if (discovery.runFirecrawl) {
  state.setPhase('filtering');
  recorder.step({
    phase: 'filtering',
    kind: 'candidates',
    tone: 'info',
    title: `${candidates.size} candidate host(s) found`,
    detail: 'Filtering out social platforms, reference sites, and hosts already on record',
  });

  const fresh = [];
  for (const candidate of candidates.values()) {
    if (isNonSourceHost(candidate.host) || isBlockedScrapeHost(candidate.host)) {
      skipped.nonSource += 1;
      recorder.step({
        phase: 'filtering',
        kind: 'filter',
        tone: 'info',
        title: `Skipped ${candidate.host}`,
        detail: 'Not an event source — social, reference, or search host',
        host: candidate.host,
      });
      continue;
    }
    if (known.has(candidate.host) || skipHosts.has(candidate.host)) {
      skipped.known += 1;
      recorder.step({
        phase: 'filtering',
        kind: 'filter',
        tone: 'info',
        title: `Skipped ${candidate.host}`,
        detail: skipHosts.has(candidate.host) && isNativeSkipHost(candidate.host)
          ? 'Native parser — already covered before Firecrawl search'
          : 'Already on record from an earlier run',
        host: candidate.host,
      });
      continue;
    }
    if (normalizeSiteUrl(candidate.url).error) {
      skipped.nonSource += 1;
      recorder.step({
        phase: 'filtering',
        kind: 'filter',
        tone: 'info',
        title: `Skipped ${candidate.host}`,
        detail: 'URL is not safely scrapable',
        host: candidate.host,
      });
      continue;
    }
    fresh.push(candidate);
  }

  // Hosts surfaced by more seed queries are the ones the city's own web keeps
  // pointing at, so they earn the limited qualification budget first.
  fresh.sort((a, b) => b.seedTags.size - a.seedTags.size);

  const evaluating = fresh.slice(0, maxCandidates);
  evaluatedCount = evaluating.length;

  recorder.bumpCounters({
    skippedKnown: skipped.known,
    skippedNonSource: skipped.nonSource,
    evaluated: evaluating.length,
  });
  state.setPhase('qualifying');
  recorder.step({
    phase: 'qualifying',
    kind: 'candidates',
    tone: 'info',
    title: `Checking ${evaluating.length} host(s)`,
    detail:
      fresh.length > evaluating.length
        ? `${fresh.length} passed filtering; taking the ${evaluating.length} surfaced by the most categories to stay inside the budget`
        : 'Ordered by how many categories surfaced each host',
  });

  outcomes = await runPool(
    evaluating,
    DISCOVERY_CONCURRENCY,
    (candidate) => qualifyCandidate(state, candidate),
    state.shouldStop,
  );

  if (state.aborted) {
    recorder.step(abortStepFor(state.aborted, 'qualifying'));
  }
  }

  state.setPhase('registering');

  const qualified = [];
  const rejected = [];

  // Events publish into the week of their own start date; this is only the
  // fallback for anything the extractor dated loosely. `next-drop` matches the
  // strategy assigned to the jobs created below, so a source's first load and
  // its later refreshes agree on where events belong.
  const ingestBatchWeek = state.nativeBatchWeek;
  const ingestTotals = {
    upserted: nativeBootstrap.events?.upserted || 0,
    skipped: nativeBootstrap.events?.skipped || 0,
    failed: nativeBootstrap.events?.failed || 0,
  };
  const nativeJobIds = [...nativeBootstrap.nativeJobIds];

  for (const outcome of outcomes) {
    if (!outcome) continue;

    const doc = await persistOutcome(req, tenantKey, outcome, now);
    const source = serializeCitySource(doc);

    if (outcome.status !== 'qualified') {
      rejected.push(source);
      recorder.bumpCounters({ rejected: 1 });
      continue;
    }

    if (options.createJobs !== false) {
      const jobResult = await createCurationJob(req, {
        tenantKey,
        label: source.label || source.host,
        provider: source.provider,
        url: source.url,
        // The seed query that found a source is a reliable category signal, so it
        // becomes the job's default tag set.
        defaultTags: source.seedTags,
        defaultBatchWeekStrategy: 'next-drop',
      });

      if (jobResult.data?.job?._id) {
        doc.curationJobId = jobResult.data.job._id;
        await doc.save();
        source.curationJobId = jobResult.data.job._id;
        recorder.bumpCounters({ jobsCreated: 1 });
        // A native source was qualified without a scrape, so discovery holds no
        // events for it. Its job is queued for the follow-up crawl instead.
        if (!outcome.entries?.length) {
          const id = String(jobResult.data.job._id);
          if (!crawledNativeIds.has(id) && !nativeJobIds.includes(id)) {
            nativeJobIds.push(id);
          }
        }
        recorder.step({
          phase: 'registering',
          kind: 'job',
          tone: 'good',
          title: `Saved job for ${source.host}`,
          detail: source.seedTags.length
            ? `Tagged ${source.seedTags.join(', ')} — will refresh on the weekly crawl`
            : 'Will refresh on the weekly crawl',
          host: source.host,
          url: source.url,
        });
      } else if (jobResult.error) {
        state.failures.push({ code: jobResult.code || null, error: jobResult.error });
        recorder.step({
          phase: 'registering',
          kind: 'job',
          tone: 'warn',
          title: `Registered ${source.host}, but no job was created`,
          detail: jobResult.error,
          code: jobResult.code || null,
          host: source.host,
        });
      }
    }

    // Publish the events this run already extracted. Re-crawling to get them
    // back would cost exactly what the qualifying scrape cost, so the only
    // reason a source waits for its job is that discovery never scraped it.
    if (options.ingestEvents !== false && outcome.entries?.length) {
      const ingest = await ingestEvents(req, {
        state,
        tenantKey,
        source,
        entries: outcome.entries,
        batchWeek: ingestBatchWeek,
      });
      ingestTotals.upserted += ingest.upserted;
      ingestTotals.skipped += ingest.skipped;
      ingestTotals.failed += ingest.failed;
      source.eventsUpserted = ingest.upserted;
    }

    qualified.push(source);
    recorder.bumpCounters({ qualified: 1 });
  }

  // Native sources qualified without a scrape, so discovery has no events to
  // hand over for them. Chaining a batch means the operator still gets one
  // action rather than a registry entry they have to notice and run themselves.
  const pendingNativeIds = nativeJobIds.filter((id) => !crawledNativeIds.has(id));
  const chainNative =
    pendingNativeIds.length > 0
    && options.ingestEvents !== false
    && options.chainNativeJobs !== false
    && !state.aborted;

  if (chainNative) {
    // The sources are already registered by this point, so a follow-up that
    // cannot be queued is a nuisance rather than a failure — report it and let
    // the run finish as the success it was.
    let batchError = null;
    try {
      const batchResult = await startCurationBatch(req, {
        tenantKey,
        jobIds: pendingNativeIds,
        batchWeek: ingestBatchWeek,
        now,
      });
      batchError = batchResult.error ? batchResult : null;
    } catch (err) {
      batchError = { error: err.message, code: 'BATCH_START_FAILED' };
    }

    recorder.step({
      phase: 'registering',
      kind: 'job',
      tone: batchError ? 'warn' : 'info',
      title: batchError
        ? `Could not queue ${pendingNativeIds.length} native source(s)`
        : `Queued ${pendingNativeIds.length} native source(s) for a crawl`,
      detail: batchError
        ? `${batchError.error} — run them from the curation page instead`
        : 'Partiful and Luma are parsed directly rather than scraped, so their events arrive on a follow-up run',
      code: batchError?.code || null,
    });
  }

  recorder.step({
    phase: 'done',
    kind: 'done',
    tone: qualified.length ? 'good' : 'warn',
    title: qualified.length
      ? `Done — ${qualified.length} source(s) registered for ${city}, ${ingestTotals.upserted} event(s) added`
      : `Done — nothing qualified for ${city}`,
    detail: `${state.calls.searches} searches, ${state.calls.maps} maps, ${state.calls.scrapes} scrapes`,
  });

  await recorder.finish({
    status: state.aborted ? 'failed' : 'completed',
    aborted: state.aborted || undefined,
  });

  return {
    data: {
      runId: recorder.runId,
      tenantKey,
      city,
      location,
      queries: queries.length,
      candidates: {
        found: candidates.size,
        skippedKnown: skipped.known,
        skippedNonSource: skipped.nonSource,
        skippedNative: 0,
        evaluated: evaluatedCount,
      },
      qualified,
      rejected,
      events: ingestTotals,
      nativeJobIds,
      batchWeek: ingestBatchWeek,
      calls: state.calls,
      aborted: state.aborted,
      failures: state.failures,
    },
  };
  } finally {
    cancelWatch.stop();
  }
}

/**
 * Kick off discovery outside the request/response cycle.
 *
 * A full run makes tens of outbound calls and takes minutes, well past any proxy
 * timeout, so the caller gets an immediate acknowledgement and watches the run
 * document fill in. The recorder is created by the caller rather than here, so
 * the run id can be returned over HTTP before any work begins — otherwise the
 * console would have nothing to poll for its first few seconds.
 */
function scheduleCitySourceDiscovery(options = {}) {
  const tenantKey = trimString(options.tenantKey);
  const actor = trimString(options.actor) || null;
  const recorder = options.recorder || null;

  setImmediate(async () => {
    try {
      const [globalDb, db] = await Promise.all([
        connectToGlobalDatabase(),
        connectToDatabase(tenantKey),
      ]);
      const workerReq = {
        globalDb,
        db,
        school: tenantKey,
        user: actor ? { email: actor } : {},
      };

      const result = await discoverCitySources(workerReq, { ...options, tenantKey });
      if (result.error) {
        logPivot('error', 'source discovery failed', {
          tenantKey,
          error: result.error,
          code: result.code,
        });
        // discoverCitySources bails before it owns the recorder, so closing the
        // run out is this wrapper's job — otherwise it reads as running forever.
        await recorder?.finish({ status: 'failed', error: result.error });
        return;
      }

      logPivot('info', 'source discovery completed', {
        tenantKey,
        qualified: result.data.qualified.length,
        rejected: result.data.rejected.length,
        calls: result.data.calls,
        aborted: result.data.aborted?.code || null,
      });
    } catch (err) {
      logPivot('error', 'source discovery crashed', { tenantKey, error: err.message });
      await recorder?.finish({ status: 'failed', error: err.message });
    }
  });
}

/**
 * Ask a running discovery/rehearsal agent to stop.
 *
 * Finalizes the run document immediately so the panel/console stop counting
 * without waiting for the worker. The worker notices via cancel watch and
 * abandons remaining work; its own `finish` will not overwrite this close.
 */
async function stopCitySourceDiscoveryRun(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenantKey = tenantResult.tenant.tenantKey;
  const runId = trimString(options.runId);
  const { PivotSourceDiscoveryRun } = getGlobalModels(req, 'PivotSourceDiscoveryRun');

  const filter = {
    tenantKey,
    status: 'running',
    kind: { $in: ['discovery', null] },
  };
  if (runId) {
    if (!mongoose.Types.ObjectId.isValid(runId)) {
      return { error: 'Invalid run id.', status: 400, code: 'INVALID_RUN_ID' };
    }
    filter._id = runId;
  }

  const aborted = { ...OPERATOR_CANCEL };
  const updated = await PivotSourceDiscoveryRun.findOneAndUpdate(
    filter,
    {
      $set: {
        cancelRequested: true,
        status: 'failed',
        phase: 'done',
        finishedAt: new Date(),
        aborted,
      },
      $push: {
        steps: {
          $each: [
            {
              at: new Date(),
              phase: 'done',
              kind: 'abort',
              tone: 'bad',
              title: 'Stopped by operator',
              detail: 'Remaining work was skipped.',
              code: 'CANCELLED',
            },
          ],
          $slice: -MAX_STEPS,
        },
      },
    },
    { sort: { createdAt: -1 }, new: true },
  )
    .select('_id status cancelRequested rehearsal aborted finishedAt')
    .lean();

  if (!updated) {
    return {
      error: 'No running discovery agent to stop.',
      status: 404,
      code: 'NO_RUNNING_RUN',
    };
  }

  return {
    data: {
      stopped: true,
      runId: String(updated._id),
      cancelRequested: true,
      rehearsal: updated.rehearsal === true,
      aborted: updated.aborted,
    },
  };
}

/**
 * Read one run, for the console to poll.
 */
async function getCitySourceDiscoveryRun(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const runId = trimString(options.runId);
  if (!runId || !mongoose.Types.ObjectId.isValid(runId)) {
    return { error: 'Invalid run id.', status: 400, code: 'INVALID_RUN_ID' };
  }

  const doc = await findOrchestrationRun(req, {
    tenantKey: tenantResult.tenant.tenantKey,
    runId,
    kind: 'discovery',
  });

  if (!doc) {
    return { error: 'Discovery run not found.', status: 404, code: 'RUN_NOT_FOUND' };
  }

  return { data: { run: serializeDiscoveryRun(doc) } };
}

/**
 * Most recent run for a city.
 *
 * Serves two callers with different appetites: the console wants the full
 * timeline, while the panel polls this only to know whether a run is still in
 * flight. `includeSteps` keeps the second case from paying for the first.
 */
async function getLatestCitySourceDiscoveryRun(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  // Opt-in, because this is the endpoint the panel polls: the costly payload
  // should be the one you ask for, not the one you forget to exclude.
  const includeSteps = options.includeSteps === true;

  const doc = await findLatestOrchestrationRun(req, {
    tenantKey: tenantResult.tenant.tenantKey,
    kind: 'discovery',
    includeSteps,
  });

  return { data: { run: doc ? serializeDiscoveryRun(doc, { includeSteps }) : null } };
}

/**
 * Resolve the city and query plan for a discovery request.
 *
 * Shared by the preview and start paths so the ceiling the UI shows before you
 * commit is computed by the same code that will run, rather than by a duplicate
 * of the seed logic in the frontend.
 */
async function buildCityDiscoveryPlan(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenant = tenantResult.tenant;
  const city = trimString(tenant.name) || tenant.tenantKey;
  const queries = buildDiscoveryQueries({
    city,
    tags: options.tags,
    maxQueries: options.maxQueries,
  });
  if (!queries.length) {
    return {
      error: 'No discovery queries matched the requested tags.',
      status: 400,
      code: 'NO_DISCOVERY_QUERIES',
    };
  }

  const maxCandidates = Number(options.maxCandidates) > 0
    ? Math.floor(Number(options.maxCandidates))
    : DEFAULT_MAX_CANDIDATES;

  const discovery = resolvePivotDiscoveryConfig(tenant, options);
  const categories = new Set(queries.map((row) => row.tag).filter(Boolean));
  const firecrawlCalls = discovery.runFirecrawl
    ? queries.length + maxCandidates * 2
    : 0;

  return {
    tenant,
    city,
    plan: {
      queries: discovery.runFirecrawl ? queries.length : 0,
      categories: categories.size,
      maxCandidates: discovery.runFirecrawl ? maxCandidates : 0,
      minEvents: Number(options.minEvents) > 0
        ? Math.floor(Number(options.minEvents))
        : DEFAULT_MIN_EVENTS,
      // Upper bound, not a prediction: one search per query, then at most a map
      // plus a qualifying scrape for each candidate that clears the filters.
      maxOutboundCalls: firecrawlCalls,
      configured: isSiteScrapeConfigured(),
      flow: discovery.flow,
      runNative: discovery.runNative,
      runFirecrawl: discovery.runFirecrawl,
      lumaSlug: discovery.lumaSlug,
      partifulSlug: discovery.partifulSlug,
      nativeJobs: nativeSourceSpecs(discovery, city),
    },
  };
}

/**
 * Report what a discovery run would do without starting one or spending credits.
 */
async function previewCitySourceDiscovery(req, options = {}) {
  const planResult = await buildCityDiscoveryPlan(req, options);
  if (planResult.error) return planResult;

  return {
    data: {
      tenantKey: planResult.tenant.tenantKey,
      city: planResult.city,
      plan: planResult.plan,
    },
  };
}

/**
 * Validate a discovery request, then hand it to the background worker.
 *
 * Resolving the tenant and building the query plan up front means a bad city or
 * an unusable tag filter fails the HTTP call instead of dying silently in a
 * background task nobody is watching.
 */
async function startCitySourceDiscovery(req, options = {}) {
  const planResult = await buildCityDiscoveryPlan(req, options);
  if (planResult.error) return planResult;

  // Refuse rather than queue work that would abort on its first Firecrawl call.
  // Native-only cities do not need a key.
  if (planResult.plan.runFirecrawl && !planResult.plan.configured) {
    return scrapeNotConfiguredResult();
  }

  if (
    options.flow != null ||
    Object.prototype.hasOwnProperty.call(options, 'lumaSlug') ||
    Object.prototype.hasOwnProperty.call(options, 'partifulSlug')
  ) {
    try {
      await persistPivotDiscoveryConfig(req, planResult.tenant, {
        flow: planResult.plan.flow,
        lumaSlug: planResult.plan.lumaSlug,
        partifulSlug: planResult.plan.partifulSlug,
      });
    } catch (err) {
      logPivot('warn', 'could not persist discovery flow', {
        tenantKey: planResult.tenant.tenantKey,
        error: err.message,
      });
    }
  }

  // Created here, not in the worker, so the caller gets an id it can poll
  // immediately instead of racing the first flush.
  const recorder = await createDiscoveryRun(req, {
    record: options.record,
    tenantKey: planResult.tenant.tenantKey,
    city: planResult.city,
    actor: req?.user?.email || null,
    tags: options.tags,
    createJobs: options.createJobs,
    recheckRejected: options.recheckRejected,
    plan: planResult.plan,
  });

  scheduleCitySourceDiscovery({
    ...options,
    tenantKey: planResult.tenant.tenantKey,
    actor: req?.user?.email || null,
    recorder,
  });

  return {
    data: {
      started: true,
      runId: recorder.runId,
      tenantKey: planResult.tenant.tenantKey,
      city: planResult.city,
      plan: planResult.plan,
    },
  };
}

async function updateCityDiscoveryConfig(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const validation = validatePivotDiscoveryConfigPatch({
    flow: options.flow,
    lumaSlug: options.lumaSlug,
    partifulSlug: options.partifulSlug,
  });
  if (validation.error) return validation;
  if (!validation.patch || !Object.keys(validation.patch).length) {
    return { error: 'No discovery config changes.', status: 400, code: 'NO_CHANGES' };
  }

  try {
    const saved = await persistPivotDiscoveryConfig(req, tenantResult.tenant, validation.patch);
    const discovery = mergePivotDiscoveryConfig(saved?.pivotDiscovery || {
      ...mergePivotDiscoveryConfig(tenantResult.tenant.pivotDiscovery),
      ...validation.patch,
    });
    return {
      data: {
        tenantKey: tenantResult.tenant.tenantKey,
        discovery: resolvePivotDiscoveryConfig({ pivotDiscovery: discovery }),
      },
    };
  } catch (err) {
    return { error: err.message, status: 500, code: 'DISCOVERY_CONFIG_SAVE_FAILED' };
  }
}

module.exports = {
  discoverCitySources,
  startCitySourceDiscovery,
  stopCitySourceDiscoveryRun,
  previewCitySourceDiscovery,
  scheduleCitySourceDiscovery,
  listCitySources,
  updateCitySource,
  updateCityDiscoveryConfig,
  getCitySourceDiscoveryRun,
  getLatestCitySourceDiscoveryRun,
  serializeCitySource,
  pickEventIndexUrl,
  scoreEventIndexUrl,
  hostFromUrl,
  runPool,
  DISCOVERY_CONCURRENCY,
  SEARCH_CONCURRENCY,
  DEFAULT_MAX_CANDIDATES,
  DEFAULT_MIN_EVENTS,
  FATAL_DISCOVERY_CODES,
  RATE_LIMIT_ABORT_STREAK,
};
