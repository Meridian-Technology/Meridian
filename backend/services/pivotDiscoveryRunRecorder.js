const getGlobalModels = require('./getGlobalModelService');
const { MAX_STEPS } = require('../schemas/pivotSourceDiscoveryRun');
const { logPivot } = require('../utilities/pivotLogger');

/**
 * Records what a discovery run is doing, so the admin console can narrate it.
 *
 * Two rules shape this module. First, recording is strictly observational —
 * nothing in the pipeline reads a run document back, so a failed write costs
 * visibility and nothing else, and every method swallows its own errors rather
 * than surfacing them into the caller's control flow. A telemetry outage must
 * not turn into a discovery outage.
 *
 * Second, steps are buffered. Discovery runs four candidates in parallel and
 * emits a step per decision, which would otherwise mean a write per step with
 * four writers contending on one document. Flushing on an interval collapses
 * that into a handful of appends per second while keeping the console close
 * enough to live that the animation still tracks the work.
 */

/** Long enough to batch a burst of parallel steps, short enough to feel live. */
const FLUSH_MS = 400;

function nullRecorder() {
  return {
    runId: null,
    enabled: false,
    step() {},
    setPhase() {},
    bumpCounters() {},
    async finish() {},
    async flush() {},
  };
}

/**
 * Start a run document and return a recorder for it.
 *
 * Returns an inert recorder when creation fails or no run is wanted, letting
 * callers stay free of null checks — the CLI path uses this to run entirely
 * unrecorded.
 */
async function createDiscoveryRun(req, options = {}) {
  if (options.record === false) return nullRecorder();

  let PivotSourceDiscoveryRun;
  try {
    ({ PivotSourceDiscoveryRun } = getGlobalModels(req, 'PivotSourceDiscoveryRun'));
  } catch (err) {
    logPivot('warn', 'discovery run recorder unavailable', { error: err.message });
    return nullRecorder();
  }

  let doc;
  try {
    doc = await PivotSourceDiscoveryRun.create({
      tenantKey: options.tenantKey,
      city: options.city || null,
      kind: options.kind || 'discovery',
      rehearsal: options.rehearsal === true,
      status: 'running',
      phase: options.phase || 'searching',
      plan: options.plan || {},
      options: {
        tags: Array.isArray(options.tags) ? options.tags : [],
        createJobs: options.createJobs !== false,
        recheckRejected: options.recheckRejected === true,
      },
      actor: options.actor || null,
      startedAt: new Date(),
    });
  } catch (err) {
    logPivot('warn', 'could not create discovery run', {
      tenantKey: options.tenantKey,
      error: err.message,
    });
    return nullRecorder();
  }

  const runId = String(doc._id);
  let buffer = [];
  let pendingCounters = {};
  let pendingPhase = null;
  let timer = null;
  let flushing = false;
  let closed = false;

  async function flush() {
    if (flushing) return;
    const steps = buffer;
    const counters = pendingCounters;
    const phase = pendingPhase;
    if (!steps.length && !Object.keys(counters).length && !phase) return;

    buffer = [];
    pendingCounters = {};
    pendingPhase = null;
    flushing = true;

    const update = {};
    if (steps.length) {
      // $slice keeps the most recent window, so a long run cannot grow the
      // document without bound.
      update.$push = { steps: { $each: steps, $slice: -MAX_STEPS } };
    }
    if (Object.keys(counters).length) {
      update.$inc = Object.fromEntries(
        Object.entries(counters).map(([key, value]) => [`counters.${key}`, value]),
      );
    }
    if (phase) {
      update.$set = { phase };
    }

    try {
      await PivotSourceDiscoveryRun.updateOne({ _id: runId }, update);
    } catch (err) {
      logPivot('warn', 'discovery run step flush failed', { runId, error: err.message });
    } finally {
      flushing = false;
    }
  }

  function scheduleFlush() {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_MS);
    // A pending flush must never hold the process open on its own.
    if (timer.unref) timer.unref();
  }

  return {
    runId,
    enabled: true,

    /**
     * Append one decision. `title` is written for a reader, because phrasing
     * belongs next to the logic that knows why the decision was made rather
     * than in the console guessing from a code.
     */
    step(entry) {
      if (closed || !entry?.title || !entry?.kind || !entry?.phase) return;
      buffer.push({ at: new Date(), ...entry });
      scheduleFlush();
    },

    setPhase(phase) {
      if (closed || !phase) return;
      pendingPhase = phase;
      scheduleFlush();
    },

    bumpCounters(counters) {
      if (closed || !counters) return;
      for (const [key, value] of Object.entries(counters)) {
        if (!value) continue;
        pendingCounters[key] = (pendingCounters[key] || 0) + value;
      }
      scheduleFlush();
    },

    flush,

    /** Drain the buffer, then close the run out. */
    async finish(result = {}) {
      if (closed) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flush();
      closed = true;

      try {
        // Only close a still-running doc — an operator Stop may have already
        // finalized it, and a late "completed" must not resurrect the run.
        await PivotSourceDiscoveryRun.updateOne(
          { _id: runId, status: 'running' },
          {
            $set: {
              status: result.status || 'completed',
              phase: 'done',
              finishedAt: new Date(),
              error: result.error || null,
              aborted: result.aborted || { code: null, error: null },
              ...(result.counters
                ? Object.fromEntries(
                    Object.entries(result.counters).map(([key, value]) => [
                      `counters.${key}`,
                      value,
                    ]),
                  )
                : {}),
            },
          },
        );
      } catch (err) {
        logPivot('warn', 'could not finalize discovery run', { runId, error: err.message });
      }
    },
  };
}

/**
 * @param {object} [options.includeSteps=true] - false omits the timeline entirely.
 *   The panel polls this record only to know whether a run is alive, and shipping
 *   a few hundred steps on every poll to answer that would be wasteful.
 */
function serializeDiscoveryRun(doc, options = {}) {
  const row = doc?.toObject ? doc.toObject() : doc;
  if (!row) return null;

  const steps =
    options.includeSteps === false
      ? {}
      : {
          steps: (Array.isArray(row.steps) ? row.steps : []).map((step) => ({
            at: step.at,
            phase: step.phase,
            kind: step.kind,
            tone: step.tone || 'info',
            title: step.title,
            detail: step.detail || null,
            host: step.host || null,
            url: step.url || null,
            tag: step.tag || null,
            eventCount: step.eventCount ?? null,
            score: step.score ?? null,
            reason: step.reason || null,
            code: step.code || null,
          })),
        };

  return {
    _id: String(row._id),
    tenantKey: row.tenantKey,
    city: row.city || null,
    kind: row.kind || 'discovery',
    rehearsal: row.rehearsal === true,
    status: row.status,
    phase: row.phase,
    plan: row.plan || null,
    options: row.options || null,
    counters: row.counters || null,
    ...steps,
    aborted: row.aborted?.code ? row.aborted : null,
    error: row.error || null,
    startedAt: row.startedAt || null,
    finishedAt: row.finishedAt || null,
    actor: row.actor || null,
  };
}

/**
 * Match one run kind, tolerating documents written before `kind` existed — every
 * one of those is a discovery run.
 */
function kindFilter(kind) {
  return kind === 'discovery' ? { kind: { $in: ['discovery', null] } } : { kind };
}

/**
 * Read one run of a given kind.
 *
 * Both pipelines store their narration in the same collection, so `kind` is what
 * keeps a curation batch from being served to the discovery console and vice
 * versa. Takes an already-resolved tenantKey so this stays free of tenant
 * plumbing and can be shared by both services.
 */
async function findOrchestrationRun(req, { tenantKey, runId, kind = 'discovery' }) {
  const { PivotSourceDiscoveryRun } = getGlobalModels(req, 'PivotSourceDiscoveryRun');
  return PivotSourceDiscoveryRun.findOne({
    _id: runId,
    tenantKey,
    ...kindFilter(kind),
  }).lean();
}

/**
 * Most recent run of a given kind.
 *
 * @param {boolean} [options.includeSteps=false] Serves two callers with
 *   different appetites: a console wants the full timeline, while a panel polls
 *   this only to learn whether a run is still in flight.
 */
async function findLatestOrchestrationRun(
  req,
  { tenantKey, kind = 'discovery', includeSteps = false },
) {
  const { PivotSourceDiscoveryRun } = getGlobalModels(req, 'PivotSourceDiscoveryRun');
  const query = PivotSourceDiscoveryRun.findOne({
    tenantKey,
    ...kindFilter(kind),
  }).sort({ createdAt: -1 });
  if (!includeSteps) query.select('-steps');
  return query.lean();
}

/**
 * Poll a run document for an operator stop and invoke `onCancel` once.
 *
 * Stop finalizes the run in the HTTP handler so the UI stops immediately; this
 * watch is what makes the in-process worker notice and bail. Fires on
 * `cancelRequested` or when the doc is no longer `running`.
 */
function watchDiscoveryRunCancel(req, runId, onCancel, { intervalMs = 400 } = {}) {
  if (!req || !runId || typeof onCancel !== 'function') {
    return { stop() {} };
  }

  let stopped = false;
  let timer = null;
  let fired = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const { PivotSourceDiscoveryRun } = getGlobalModels(req, 'PivotSourceDiscoveryRun');
      const row = await PivotSourceDiscoveryRun.findById(runId)
        .select('cancelRequested status')
        .lean();
      if (!row) {
        stopped = true;
        return;
      }
      const cancelled = row.cancelRequested === true || row.status !== 'running';
      if (cancelled && !fired) {
        fired = true;
        onCancel();
      }
      if (row.status !== 'running') {
        stopped = true;
        return;
      }
    } catch (err) {
      logPivot('warn', 'discovery cancel watch failed', {
        runId,
        error: err.message,
      });
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
      if (timer.unref) timer.unref();
    }
  };

  timer = setTimeout(tick, intervalMs);
  if (timer.unref) timer.unref();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

module.exports = {
  createDiscoveryRun,
  nullRecorder,
  serializeDiscoveryRun,
  findOrchestrationRun,
  findLatestOrchestrationRun,
  watchDiscoveryRunCancel,
  FLUSH_MS,
};
