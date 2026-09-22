/**
 * Option A in-process notification worker. `server.js` starts this after listen.
 * A future worker dyno can require this module and call `startMeridianJobWorkerLoop()`
 * without rewriting handlers.
 *
 * Env:
 *   MERIDIAN_JOB_POLL_MS          poll interval ms (default 30000)
 *   MERIDIAN_OPS_TENANT_KEY       ops tenant for admin failure push (default sf)
 *   DISABLE_MERIDIAN_JOB_WORKER   set true to skip starting the loop
 */
const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const { MAX_ATTEMPTS } = require('../schemas/meridianJobRun');
const {
  getMeridianJobHandler,
  MeridianJobHandlerError,
} = require('./meridianJobRegistry');
const { ensureMeridianJobHandlersLoaded } = require('./meridianJobHandlers');
const { evaluateMeridianNotificationSchedules } = require('./meridianNotificationDefinitionService');
const { ensureRitualCrewScanDefinition } = require('./meridianJobHandlers/ritualCrewScan');
const { ensureSoloSwipeReminderDefinition } = require('./meridianJobHandlers/soloSwipeReminder');
const { ensureEventDiscoveryDefinition } = require('./meridianJobHandlers/eventDiscoveryEnqueue');
const { notifyMeridianJobTerminalFailure } = require('./meridianOpsNotifyService');

const DEFAULT_MERIDIAN_JOB_POLL_MS = 30000;
const DEFAULT_MERIDIAN_OPS_TENANT_KEY = 'sf';

const MERIDIAN_JOB_BACKOFF_MS = Object.freeze([
  2 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
]);

const CLAIMABLE_STATUSES = Object.freeze(['pending', 'retry_wait']);

let inFlight = false;
let pollTimer = null;

function backoffMsAfterFailedAttempt(attemptNumber) {
  const index = Math.max(0, Math.min(attemptNumber, MERIDIAN_JOB_BACKOFF_MS.length) - 1);
  return MERIDIAN_JOB_BACKOFF_MS[index];
}

function isRetryableError(error) {
  if (error instanceof MeridianJobHandlerError) {
    return error.retryable !== false;
  }
  return true;
}

function errorMessage(error) {
  const message = error?.message || String(error || 'meridian job failed');
  return message.slice(0, 1000);
}

async function resolveJobReq(req, run) {
  if (req?.globalDb && (req.db || !run?.tenantKey)) {
    return req;
  }
  const globalDb = req?.globalDb || await connectToGlobalDatabase();
  let db = req?.db;
  if (!db && run?.tenantKey) {
    db = await connectToDatabase(run.tenantKey);
  }
  return {
    ...(req || {}),
    globalDb,
    db,
    school: req?.school || run?.tenantKey,
  };
}

function clipSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  return {
    attempted: summary.attempted || 0,
    accepted: summary.accepted || 0,
    failed: summary.failed || 0,
    skipped: summary.skipped || 0,
    recipientOverflowCount: summary.recipientOverflowCount || 0,
    message: summary.message ? String(summary.message).slice(0, 1000) : null,
  };
}

async function claimDueMeridianJob(req, { now = new Date() } = {}) {
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun, MeridianJobAttempt } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobAttempt',
  );

  const claimed = await MeridianJobRun.findOneAndUpdate(
    {
      status: { $in: CLAIMABLE_STATUSES },
      nextAttemptAt: { $lte: now },
      attemptCount: { $lt: MAX_ATTEMPTS },
    },
    {
      $set: {
        status: 'running',
        claimedAt: now,
        startedAt: now,
      },
      $inc: { attemptCount: 1 },
    },
    {
      sort: { nextAttemptAt: 1, createdAt: 1 },
      new: true,
    },
  );

  if (!claimed) {
    return { run: null, attempt: null };
  }

  const attempt = await MeridianJobAttempt.create({
    runId: claimed._id,
    attemptNumber: claimed.attemptCount,
    status: 'running',
    startedAt: now,
  });

  return { run: claimed, attempt };
}

async function finalizeAttempt(MeridianJobAttempt, attempt, fields) {
  if (!attempt?._id) return;
  await MeridianJobAttempt.updateOne({ _id: attempt._id }, { $set: fields });
}

async function executeClaimedMeridianJob(req, { run, attempt, now = new Date() }) {
  ensureMeridianJobHandlersLoaded();
  const handler = getMeridianJobHandler(run.type);
  const jobReq = await resolveJobReq(req, run);
  const { MeridianJobRun, MeridianJobAttempt } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobAttempt',
  );

  if (!handler) {
    const message = `Unknown meridian job handler: ${run.type}`;
    await finalizeAttempt(MeridianJobAttempt, attempt, {
      status: 'failed',
      error: message,
      finishedAt: now,
    });
    await MeridianJobRun.updateOne(
      { _id: run._id },
      {
        $set: {
          status: 'failed',
          lastError: message,
          finishedAt: now,
        },
      },
    );
    await notifyMeridianJobTerminalFailure(jobReq, { runId: run._id });
    return { status: 'failed', retryable: false };
  }

  try {
    const result = await handler.execute({ run, attempt, req: jobReq });
    const terminalStatus = result?.terminalStatus === 'preview' ? 'preview' : 'succeeded';
    await finalizeAttempt(MeridianJobAttempt, attempt, {
      status: 'succeeded',
      error: null,
      finishedAt: now,
    });
    const setFields = {
      status: terminalStatus,
      lastError: null,
      finishedAt: now,
      summary: clipSummary(result?.summary),
    };
    if (result?.pivotDropPushRunId) {
      setFields.pivotDropPushRunId = result.pivotDropPushRunId;
    }
    await MeridianJobRun.updateOne({ _id: run._id }, { $set: setFields });
    return { status: terminalStatus, result };
  } catch (error) {
    const message = errorMessage(error);
    const retryable = isRetryableError(error);
    const attemptNumber = run.attemptCount;
    const canRetry = retryable && attemptNumber < (run.maxAttempts || MAX_ATTEMPTS);
    await finalizeAttempt(MeridianJobAttempt, attempt, {
      status: 'failed',
      error: message,
      finishedAt: now,
    });

    if (canRetry) {
      const nextAttemptAt = new Date(now.getTime() + backoffMsAfterFailedAttempt(attemptNumber));
      await MeridianJobRun.updateOne(
        { _id: run._id },
        {
          $set: {
            status: 'retry_wait',
            lastError: message,
            nextAttemptAt,
            claimedAt: null,
          },
        },
      );
      return { status: 'retry_wait', retryable: true, nextAttemptAt };
    }

    await MeridianJobRun.updateOne(
      { _id: run._id },
      {
        $set: {
          status: 'failed',
          lastError: message,
          finishedAt: now,
          claimedAt: null,
        },
      },
    );
    await notifyMeridianJobTerminalFailure(jobReq, { runId: run._id });
    return { status: 'failed', retryable };
  }
}

async function tickMeridianJobWorker(req, { now = new Date() } = {}) {
  if (inFlight) {
    return { skipped: true, reason: 'mutex' };
  }
  inFlight = true;
  try {
    let schedule = null;
    try {
      schedule = await evaluateMeridianNotificationSchedules(req, { now });
    } catch (error) {
      console.error('[meridianJobWorker] schedule evaluate failed', error);
    }
    const claimed = await claimDueMeridianJob(req, { now });
    if (!claimed.run) {
      return { skipped: false, claimed: false, schedule };
    }
    const outcome = await executeClaimedMeridianJob(req, {
      run: claimed.run,
      attempt: claimed.attempt,
      now,
    });
    return { skipped: false, claimed: true, runId: claimed.run._id, outcome, schedule };
  } finally {
    inFlight = false;
  }
}

function getMeridianOpsTenantKey(env = process.env) {
  const raw = env.MERIDIAN_OPS_TENANT_KEY || DEFAULT_MERIDIAN_OPS_TENANT_KEY;
  return String(raw).trim().toLowerCase() || DEFAULT_MERIDIAN_OPS_TENANT_KEY;
}

function getMeridianJobPollMs(env = process.env) {
  const parsed = Number(env.MERIDIAN_JOB_POLL_MS);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MERIDIAN_JOB_POLL_MS;
}

function shouldStartMeridianJobWorkerLoop({ force = false, env = process.env } = {}) {
  if (force) return true;
  if (env.NODE_ENV === 'test') return false;
  if (env.DISABLE_MERIDIAN_JOB_WORKER === 'true') return false;
  return true;
}

function startMeridianJobWorkerLoop(options = {}) {
  if (!shouldStartMeridianJobWorkerLoop(options)) {
    return null;
  }
  if (pollTimer) return pollTimer;
  const pollMs = Number(options.pollMs || getMeridianJobPollMs());
  const getReq = options.getReq;
  pollTimer = setInterval(() => {
    Promise.resolve()
      .then(() => (typeof getReq === 'function' ? getReq() : options.req))
      .then((req) => tickMeridianJobWorker(req))
      .catch((error) => {
        console.error('[meridianJobWorker] tick failed', error);
      });
  }, pollMs);
  if (typeof pollTimer.unref === 'function') {
    pollTimer.unref();
  }
  console.log(
    `[meridianJobWorker] in-process loop started pollMs=${pollMs} opsTenant=${getMeridianOpsTenantKey()}`,
  );
  Promise.resolve()
    .then(() => (typeof getReq === 'function' ? getReq() : options.req))
    .then(async (req) => {
      await ensureRitualCrewScanDefinition(req);
      await ensureSoloSwipeReminderDefinition(req);
      await ensureEventDiscoveryDefinition(req);
    })
    .catch((error) => {
      console.error('[meridianJobWorker] notification definition ensure failed', error);
    });
  return pollTimer;
}

function stopMeridianJobWorkerLoop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function resetMeridianJobWorkerMutex() {
  inFlight = false;
}

function isMeridianJobWorkerInFlight() {
  return inFlight;
}

module.exports = {
  DEFAULT_MERIDIAN_JOB_POLL_MS,
  DEFAULT_MERIDIAN_OPS_TENANT_KEY,
  MERIDIAN_JOB_BACKOFF_MS,
  backoffMsAfterFailedAttempt,
  getMeridianJobPollMs,
  getMeridianOpsTenantKey,
  shouldStartMeridianJobWorkerLoop,
  claimDueMeridianJob,
  executeClaimedMeridianJob,
  tickMeridianJobWorker,
  startMeridianJobWorkerLoop,
  stopMeridianJobWorkerLoop,
  resetMeridianJobWorkerMutex,
  isMeridianJobWorkerInFlight,
};
