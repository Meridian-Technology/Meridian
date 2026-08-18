const { connectToGlobalDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { buildDiscoveryQueries } = require('../constants/pivotDiscoverySeeds');
const {
  createDiscoveryRun,
  refuseIfPipelineBusy,
  watchDiscoveryRunCancel,
} = require('./pivotDiscoveryRunRecorder');
const { logPivot } = require('../utilities/pivotLogger');
const { resolvePivotDiscoveryConfig } = require('../utilities/pivotDiscoveryConfig');

class RehearsalCancelled extends Error {
  constructor() {
    super('Stopped by operator.');
    this.code = 'CANCELLED';
  }
}

/**
 * Walk a discovery run without making a single outbound call.
 *
 * Discovery needs a Firecrawl key, which means the console cannot be seen —
 * let alone reviewed — before that key exists and credits are being spent. A
 * rehearsal closes that gap: it resolves the real city, builds the real seed
 * queries, and emits the same step shapes in the same order as a live run, so
 * the pipeline's reasoning can be read and the UI exercised for free.
 *
 * The fixtures below are labelled as examples in their own step text, and the
 * run is flagged `rehearsal` so nothing it produces can be mistaken for a
 * finding. It writes only to the run document: no registry rows, no curation
 * jobs, no events.
 */

/** Paced so each decision can be read before the next lands (~40s full run). */
const STEP_DELAY_MS = 1200;

/**
 * Illustrative hosts, chosen to cover every decision the pipeline can make
 * rather than to be realistic for any particular city.
 */
const FIXTURE_HOSTS = [
  {
    host: 'example-theatre.org',
    outcome: 'qualified',
    mappedLinks: 14,
    indexPath: '/events',
    eventCount: 9,
    score: 16,
  },
  {
    host: 'instagram.com',
    outcome: 'filtered',
    filterReason: 'Not an event source — social, reference, or search host',
  },
  {
    host: 'example-brewery.com',
    outcome: 'qualified',
    mappedLinks: 6,
    indexPath: '/live-music',
    eventCount: 3,
    score: 11,
  },
  { host: 'example-city.gov', outcome: 'no-index', mappedLinks: 22 },
  {
    host: 'example-gallery.org',
    outcome: 'no-events',
    mappedLinks: 8,
    indexPath: '/calendar',
    undated: 4,
    score: 14,
  },
  { host: 'partiful.com', outcome: 'filtered-native', filterReason: 'Native parser — already covered before Firecrawl search' },
];

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (timer.unref) timer.unref();
  });
}

/** Slice long pauses so a Stop click lands within ~200ms instead of a full step. */
async function interruptibleSleep(ms, isCancelled) {
  if (!ms) {
    if (isCancelled()) throw new RehearsalCancelled();
    return;
  }
  let left = ms;
  while (left > 0) {
    if (isCancelled()) throw new RehearsalCancelled();
    const slice = Math.min(200, left);
    await sleep(slice);
    left -= slice;
  }
  if (isCancelled()) throw new RehearsalCancelled();
}

/**
 * Emit the rehearsal timeline.
 *
 * Kept separate from `discoverCitySources` on purpose. Threading a "pretend"
 * flag through the real pipeline would put a branch that must never fire in
 * production inside the code that spends money, and every one of those branches
 * is a place where a rehearsal could accidentally become a real run.
 */
async function playRehearsal(recorder, context) {
  const { city, queries, timezone, maxCandidates } = context;
  // Pacing is presentational, so tests turn it off rather than waiting it out.
  const stepDelay = context.delayMs ?? STEP_DELAY_MS;
  let cancelled = false;
  const cancelWatch = watchDiscoveryRunCancel(context.req, recorder.runId, () => {
    cancelled = true;
  });
  const pause = () => interruptibleSleep(stepDelay, () => cancelled);

  try {
  recorder.step({
    phase: 'native',
    kind: 'plan',
    tone: 'info',
    title: `Rehearsing discovery for ${city}`,
    detail:
      'No pages are fetched and nothing is registered. Real queries and real ordering, example hosts.',
  });
  await pause();

  recorder.setPhase('native');
  recorder.step({
    phase: 'native',
    kind: 'native',
    tone: 'good',
    title: 'Would crawl Partiful and Luma first',
    detail: 'Native parsers — no Firecrawl credits. Those hosts are then skipped in search.',
  });
  await pause();

  // Real queries, so the seed coverage being rehearsed is the actual coverage.
  const shown = queries.slice(0, 6);
  for (const { query, tag } of shown) {
    recorder.step({
      phase: 'searching',
      kind: 'search',
      tone: 'info',
      title: `Searched “${query}”`,
      detail: 'Example result set — a live run would return real hosts here',
      tag: tag || null,
    });
    recorder.bumpCounters({ searches: 1, candidatesFound: 2 });
    await pause();
  }

  if (queries.length > shown.length) {
    recorder.step({
      phase: 'searching',
      kind: 'search',
      tone: 'info',
      title: `…and ${queries.length - shown.length} more queries`,
      detail: 'A live run issues one search per seed query',
    });
    await pause();
  }

  recorder.setPhase('filtering');
  recorder.step({
    phase: 'filtering',
    kind: 'candidates',
    tone: 'info',
    title: `${FIXTURE_HOSTS.length} candidate host(s) found`,
    detail: 'Filtering out social platforms, reference sites, and hosts already on record',
  });
  await pause();

  const evaluating = [];
  for (const fixture of FIXTURE_HOSTS) {
    if (fixture.outcome === 'filtered' || fixture.outcome === 'filtered-native') {
      recorder.bumpCounters(
        fixture.outcome === 'filtered-native' ? { skippedNative: 1 } : { skippedNonSource: 1 },
      );
      recorder.step({
        phase: 'filtering',
        kind: 'filter',
        tone: 'info',
        title: `Skipped ${fixture.host}`,
        detail: fixture.filterReason,
        host: fixture.host,
      });
      await pause();
      continue;
    }
    evaluating.push(fixture);
  }

  recorder.bumpCounters({ evaluated: evaluating.length });
  recorder.setPhase('qualifying');
  recorder.step({
    phase: 'qualifying',
    kind: 'candidates',
    tone: 'info',
    title: `Checking ${evaluating.length} host(s)`,
    detail: `Ordered by how many categories surfaced each host · budget allows ${maxCandidates}`,
  });
  await pause();

  const qualified = [];

  for (const fixture of evaluating) {
    if (fixture.outcome === 'native') {
      recorder.step({
        phase: 'qualifying',
        kind: 'native',
        tone: 'good',
        title: `${fixture.host} has a native parser`,
        detail: `Registering as ${fixture.provider} — no credits spent verifying it`,
        host: fixture.host,
      });
      qualified.push(fixture);
      await pause();
      continue;
    }

    recorder.step({
      phase: 'qualifying',
      kind: 'map',
      tone: 'info',
      title: `Looking for a calendar on ${fixture.host}`,
      detail: 'Mapping the site — one credit, versus five to extract a wrong page',
      host: fixture.host,
    });
    recorder.bumpCounters({ maps: 1 });
    await pause();

    if (fixture.outcome === 'no-index') {
      recorder.bumpCounters({ rejected: 1 });
      recorder.step({
        phase: 'qualifying',
        kind: 'reject',
        tone: 'warn',
        title: `No calendar page on ${fixture.host}`,
        detail: `Nothing among ${fixture.mappedLinks} mapped link(s) looked like an event index, so no scrape was spent`,
        host: fixture.host,
        reason: 'no-index-page',
      });
      await pause();
      continue;
    }

    const indexUrl = `https://${fixture.host}${fixture.indexPath}`;
    recorder.step({
      phase: 'qualifying',
      kind: 'index',
      tone: 'info',
      title: `Chose ${indexUrl}`,
      detail: `Best of ${fixture.mappedLinks} mapped links (score ${fixture.score})`,
      host: fixture.host,
      url: indexUrl,
      score: fixture.score,
    });
    await pause();

    recorder.step({
      phase: 'qualifying',
      kind: 'scrape',
      tone: 'info',
      title: `Extracting events from ${fixture.host}`,
      detail: `Resolving dates in ${timezone}`,
      host: fixture.host,
      url: indexUrl,
    });
    recorder.bumpCounters({ scrapes: 1 });
    await pause();

    if (fixture.outcome === 'no-events') {
      recorder.bumpCounters({ rejected: 1 });
      recorder.step({
        phase: 'qualifying',
        kind: 'reject',
        tone: 'warn',
        title: `No dated events on ${fixture.host}`,
        detail: `${fixture.undated} listing(s) had no resolvable start time, so they cannot be scheduled`,
        host: fixture.host,
        url: indexUrl,
        eventCount: 0,
        reason: 'no-events',
      });
      await pause();
      continue;
    }

    recorder.step({
      phase: 'qualifying',
      kind: 'qualify',
      tone: 'good',
      title: `${fixture.host} qualified with ${fixture.eventCount} event(s)`,
      host: fixture.host,
      url: indexUrl,
      eventCount: fixture.eventCount,
    });
    qualified.push({ ...fixture, url: indexUrl });
    await pause();
  }

  recorder.setPhase('registering');
  for (const fixture of qualified) {
    recorder.bumpCounters({ qualified: 1, jobsCreated: 1 });
    recorder.step({
      phase: 'registering',
      kind: 'job',
      tone: 'good',
      title: `Would save a job for ${fixture.host}`,
      detail: 'Rehearsal — no registry row and no curation job were created',
      host: fixture.host,
      url: fixture.url || null,
    });
    await pause();
  }

  recorder.step({
    phase: 'done',
    kind: 'done',
    tone: 'good',
    title: `Rehearsal complete — ${qualified.length} source(s) would have been registered`,
    detail: 'Nothing was fetched, nothing was saved, no credits were spent.',
  });

  await recorder.finish({ status: 'completed' });
  } catch (err) {
    if (err?.code !== 'CANCELLED') throw err;
    recorder.step({
      phase: 'done',
      kind: 'abort',
      tone: 'bad',
      title: 'Stopped by operator',
      detail: 'Remaining rehearsal steps were skipped.',
      code: 'CANCELLED',
    });
    await recorder.finish({
      status: 'failed',
      aborted: { code: 'CANCELLED', error: 'Stopped by operator.' },
    });
  } finally {
    cancelWatch.stop();
  }
}

/**
 * Start a rehearsal and return its run id immediately.
 *
 * Mirrors `startCitySourceDiscovery` so the console needs no special casing:
 * same run document, same polling route, same step shapes.
 */
async function startCitySourceDiscoveryRehearsal(req, options = {}) {
  const busy = await refuseIfPipelineBusy(req);
  if (busy) return busy;

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const tenant = tenantResult.tenant;
  const city = String(tenant.name || tenant.tenantKey).trim();
  
  // Resolve discovery config first to check if Firecrawl is needed
  const discovery = resolvePivotDiscoveryConfig(tenant, options);
  
  const queries = buildDiscoveryQueries({
    city,
    tags: options.tags,
    maxQueries: options.maxQueries,
  });
  
  // Only require queries when Firecrawl is enabled
  if (!queries.length && discovery.runFirecrawl) {
    return {
      error: 'No discovery queries matched the requested tags.',
      status: 400,
      code: 'NO_DISCOVERY_QUERIES',
    };
  }

  const maxCandidates = Number(options.maxCandidates) > 0
    ? Math.floor(Number(options.maxCandidates))
    : 20;

  const recorder = await createDiscoveryRun(req, {
    tenantKey: tenant.tenantKey,
    city,
    rehearsal: true,
    actor: req?.user?.email || null,
    tags: options.tags,
    createJobs: false,
    plan: {
      queries: discovery.runFirecrawl ? queries.length : 0,
      categories: new Set(queries.map((row) => row.tag).filter(Boolean)).size,
      maxCandidates: discovery.runFirecrawl ? maxCandidates : 0,
      minEvents: 1,
      maxOutboundCalls: discovery.runFirecrawl ? queries.length + maxCandidates * 2 : 0,
      flow: discovery.flow,
      runNative: discovery.runNative,
      runFirecrawl: discovery.runFirecrawl,
    },
  });

  if (!recorder.enabled) {
    return {
      error: 'Could not open a rehearsal run to record into.',
      status: 500,
      code: 'REHEARSAL_NOT_RECORDABLE',
    };
  }

  const context = {
    city,
    queries,
    timezone: String(tenant.pivotDropTimezone || 'UTC'),
    maxCandidates,
  };

  setImmediate(async () => {
    try {
      // Keep the connection warm for the same reason the real worker does.
      const globalDb = await connectToGlobalDatabase();
      await playRehearsal(recorder, { ...context, req: { globalDb } });
    } catch (err) {
      logPivot('error', 'discovery rehearsal crashed', {
        tenantKey: tenant.tenantKey,
        error: err.message,
      });
      await recorder.finish?.({ status: 'failed', error: err.message });
    }
  });

  return {
    data: {
      started: true,
      rehearsal: true,
      runId: recorder.runId,
      tenantKey: tenant.tenantKey,
      city,
    },
  };
}

module.exports = {
  startCitySourceDiscoveryRehearsal,
  playRehearsal,
  FIXTURE_HOSTS,
  STEP_DELAY_MS,
};
