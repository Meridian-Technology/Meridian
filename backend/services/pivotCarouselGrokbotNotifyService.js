/**
 * Content-free notices for grokbot. A notice is reserved on the job after the
 * job write, at most once per event, then posted in the background with
 * backoff. A notice that never gets through releases its reservation so a
 * later trigger can send it. Delivery never fails or delays the job.
 *
 * The URL, routine key, and on/off switch come from Platform Admin →
 * Integrations (grokbotIntegrationService); GROKBOT_CAROUSEL_WEBHOOK_URL
 * applies only until those are saved. Each attempt's outcome is kept in the
 * settings record's delivery list.
 */
const { createHmac } = require('crypto');
const getGlobalModels = require('./getGlobalModelService');
const {
  resolveGrokbotWebhook,
  recordGrokbotDelivery,
} = require('./grokbotIntegrationService');
const { editorialAccountFor } = require('../constants/pivotCarouselEditorialAccounts');
const { logPivot } = require('../utilities/pivotLogger');

const WEBHOOK_ENV = 'GROKBOT_CAROUSEL_WEBHOOK_URL';
const SECRET_ENV = 'GROKBOT_CAROUSEL_WEBHOOK_SECRET';
const SIGNATURE_HEADER = 'x-meridian-signature';
const TEST_TIMEOUT_MS = 5000;
// About 30 seconds from the first attempt to the last.
const RETRY_DELAYS_MS = [0, 2000, 5000, 9000, 14000];
const REQUEST_TIMEOUT_MS = 1500;
// Tests shorten the schedule here; production reads RETRY_DELAYS_MS.
const delivery = { retryDelaysMs: RETRY_DELAYS_MS };
const inFlight = new Set();
const EXPORT_JOB_ID = /^job:export:([0-9a-f]{24}):r([1-9]\d*)$/;
const SLIDE_PNG = /^slide-\d{2}\.png$/;
const NO_DRAFT_EVENTS = new Set(['wait', 'needs-editor', 'cannot-revise', 'conflict', 'failure']);

function webhookUrl(env = process.env) {
  const value = typeof env[WEBHOOK_ENV] === 'string' ? env[WEBHOOK_ENV].trim() : '';
  return value || null;
}

function webhookSecret(env = process.env) {
  const value = typeof env[SECRET_ENV] === 'string' ? env[SECRET_ENV].trim() : '';
  return value || null;
}

/** `sha256=<hex>` over the exact bytes posted. */
function signBody(raw, secret) {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}

function wait(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

function noticeBody({ event, accountKey, jobId, issues }) {
  return {
    event,
    accountKey: accountKey || null,
    jobId: jobId || null,
    issues: (issues || []).map((issue) => ({
      issueId: String(issue.issueId),
      revision: issue.revision,
    })),
  };
}

function accountKeyFromHandle(handle) {
  return editorialAccountFor(String(handle || '').replace(/^@/, ''))?.key || null;
}

async function accountKeyForIssue(req, issueId) {
  if (!issueId) return null;
  const { PivotCarouselDeck, PivotCarouselAccount } = getGlobalModels(
    req,
    'PivotCarouselDeck',
    'PivotCarouselAccount',
  );
  const issue = await PivotCarouselDeck.findById(issueId).select('accountId').lean();
  if (!issue?.accountId) return null;
  const account = await PivotCarouselAccount.findById(issue.accountId).select('handle').lean();
  return accountKeyFromHandle(account?.handle);
}

async function reserveNotice(req, externalJobId, event) {
  const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
  await PivotComputeJob.updateOne(
    { externalJobId, notifications: null },
    { $set: { notifications: { grokbot: [] } } },
  );
  return PivotComputeJob.findOneAndUpdate(
    { externalJobId, 'notifications.grokbot.event': { $ne: event } },
    { $push: { 'notifications.grokbot': { event, sentAt: new Date() } } },
    { new: true },
  );
}

/** Give the event back, so the next trigger for it sends again. */
async function releaseNotice(req, externalJobId, event) {
  const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
  await PivotComputeJob.updateOne(
    { externalJobId },
    { $pull: { 'notifications.grokbot': { event } } },
  );
}

/** Grokbot routines accept only `Authorization: Bearer <routine key>`. */
function noticeHeaders(raw, key) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;
  const secret = webhookSecret();
  if (secret) headers[SIGNATURE_HEADER] = signBody(raw, secret);
  return headers;
}

/** One POST. Resolves `{ ok, status, error }` and never throws. */
async function postOnce(url, raw, headers, { fetchImpl = global.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: raw,
      signal: controller.signal,
    });
    const status = Number.isInteger(response?.status) ? response.status : null;
    if (response?.ok) return { ok: true, status, error: null };
    return { ok: false, status, error: new Error(`Webhook returned ${status || 'no status'}`) };
  } catch (error) {
    return { ok: false, status: null, error };
  } finally {
    clearTimeout(timer);
  }
}

async function postNotice(url, body, {
  key = null,
  onAttempt = () => {},
  fetchImpl = global.fetch,
  delays = delivery.retryDelaysMs,
} = {}) {
  const raw = JSON.stringify(body);
  const headers = noticeHeaders(raw, key);
  let lastError = null;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (attempt > 0) await wait(delays[attempt]);
    const result = await postOnce(url, raw, headers, { fetchImpl });
    onAttempt({ attempt: attempt + 1, ...result });
    if (result.ok) return { ok: true };
    lastError = result.error;
  }
  return { ok: false, error: lastError };
}

function deliveryRow(event, jobId, { attempt = 1, status = null, error = null } = {}) {
  return {
    event,
    jobId: jobId || null,
    attempt,
    status,
    error: error ? error.message || String(error) : null,
  };
}

function logFailure(event, jobId, error) {
  logPivot('warn', 'grokbot carousel webhook failed', {
    event,
    jobId: jobId || null,
    message: error?.message || 'webhook failed',
  });
}

async function sendReserved(req, { target, body, externalJobId }) {
  try {
    const result = await postNotice(target.url, body, {
      key: target.key,
      onAttempt: (outcome) => {
        inBackground(recordGrokbotDelivery(req, deliveryRow(body.event, body.jobId, outcome)));
      },
    });
    if (result.ok) return;
    logFailure(body.event, body.jobId, result.error);
  } catch (error) {
    logFailure(body.event, body.jobId, error);
  }
  try {
    await releaseNotice(req, externalJobId, body.event);
  } catch (error) {
    logFailure(body.event, body.jobId, error);
  }
}

function inBackground(promise) {
  const tracked = promise.catch(() => {}).finally(() => inFlight.delete(tracked));
  inFlight.add(tracked);
}

/** Resolves once every notice already queued has been sent or released. */
async function whenNoticesSettled() {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

/**
 * Reserve this event on the job, then POST in the background. A second call
 * for the same event does not send again while the first holds it. Errors are
 * logged and swallowed.
 */
/** The resolved webhook, or why nothing should be sent. */
async function webhookTarget(req) {
  const target = await resolveGrokbotWebhook(req);
  if (!target.url) return { skip: 'unset' };
  if (!target.enabled) return { skip: 'disabled' };
  return { target };
}

async function deliverNotice(req, { event, accountKey, jobId, issues, reserveJobId }) {
  let target;
  try {
    const resolved = await webhookTarget(req);
    if (resolved.skip) return { skipped: true, reason: resolved.skip };
    target = resolved.target;
  } catch (error) {
    logFailure(event, jobId, error);
    return { skipped: true, reason: 'notify_error' };
  }
  if (target.keyError) {
    logFailure(event, jobId, new Error(target.keyError));
    inBackground(recordGrokbotDelivery(req, deliveryRow(event, jobId, { error: target.keyError })));
    return { skipped: true, reason: 'key_error' };
  }
  const externalJobId = reserveJobId || jobId;
  if (!externalJobId) return { skipped: true, reason: 'missing_job' };
  try {
    const reserved = await reserveNotice(req, externalJobId, event);
    if (!reserved) return { skipped: true, reason: 'already_notified' };
  } catch (error) {
    logFailure(event, jobId, error);
    return { skipped: true, reason: 'notify_error' };
  }
  const body = noticeBody({ event, accountKey, jobId, issues });
  inBackground(sendReserved(req, { target, body, externalJobId }));
  return { skipped: false, queued: true };
}

function noDraftNotice(job) {
  if (!job || (job.kind !== 'carousel-compose' && job.kind !== 'carousel-revise')) return null;
  // A worker failure, or a result Meridian refused to apply.
  const rejected = job.status === 'review-required' && job.applicationAudit?.outcome === 'rejected';
  if (job.status === 'failed' || rejected) {
    const issueId = job.kind === 'carousel-revise' ? job.options?.issueId : null;
    const revision = Number(job.options?.revision);
    return {
      event: 'failure',
      issues: issueId && Number.isInteger(revision) ? [{ issueId: String(issueId), revision }] : [],
    };
  }
  const decision = job.kind === 'carousel-compose'
    ? job.composeOutcome?.decision
    : job.reviseOutcome?.decision;
  if (!NO_DRAFT_EVENTS.has(decision)) return null;
  if (job.kind === 'carousel-compose') return { event: decision, issues: [] };
  const issueId = job.reviseOutcome?.issueId || job.options?.issueId;
  const revision = Number(job.options?.revision);
  return {
    event: decision,
    issues: issueId && Number.isInteger(revision) ? [{ issueId: String(issueId), revision }] : [],
  };
}

/** After a compose or revise job is saved with no new draft. */
async function notifyCarouselJobEnded(req, job) {
  try {
    const notice = noDraftNotice(job);
    if (!notice) return { skipped: true, reason: 'not_terminal' };
    const accountKey = job.kind === 'carousel-compose'
      ? job.options?.editorialAccountKey || null
      : await accountKeyForIssue(req, notice.issues[0]?.issueId || job.options?.issueId);
    return deliverNotice(req, {
      event: notice.event,
      accountKey,
      jobId: job.externalJobId,
      issues: notice.issues,
    });
  } catch (error) {
    logPivot('warn', 'grokbot carousel webhook failed', {
      event: job?.composeOutcome?.decision || job?.reviseOutcome?.decision || 'failure',
      jobId: job?.externalJobId || null,
      message: error?.message || 'webhook failed',
    });
    return { skipped: true, reason: 'notify_error' };
  }
}

async function sourceJobId(req, issue, revision) {
  if (revision > 1) {
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    const revise = await PivotComputeJob.findOne({
      kind: 'carousel-revise',
      'options.issueId': String(issue._id),
      'options.revision': revision - 1,
      'reviseOutcome.decision': 'revise',
    }).select('externalJobId').lean();
    if (revise?.externalJobId) return revise.externalJobId;
  }
  return issue.composeJobId || null;
}

/**
 * After an export result is saved. Sends only when that revision's preview is
 * ready and the agent wrote the revision.
 */
async function notifyPreviewReady(req, job) {
  try {
    return await deliverPreviewReady(req, job);
  } catch (error) {
    logPivot('warn', 'grokbot carousel webhook failed', {
      event: 'preview-ready',
      jobId: job?.externalJobId || null,
      message: error?.message || 'webhook failed',
    });
    return { skipped: true, reason: 'notify_error' };
  }
}

async function deliverPreviewReady(req, job) {
  if (job?.kind !== 'carousel-export' || job.status !== 'completed') {
    return { skipped: true, reason: 'not_ready' };
  }
  if ((await webhookTarget(req)).skip) return { skipped: true, reason: 'not_ready' };
  const match = EXPORT_JOB_ID.exec(job.externalJobId || '');
  if (!match) return { skipped: true, reason: 'not_ready' };
  const issueId = match[1];
  const revision = Number(match[2]);
  const slides = (job.exportArtifacts?.artifacts || [])
    .filter((artifact) => SLIDE_PNG.test(String(artifact?.logicalName || '')) && !job.exportArtifacts?.expired);
  if (!slides.length) return { skipped: true, reason: 'not_ready' };
  const { PivotCarouselDeck, PivotCarouselAccount } = getGlobalModels(
    req,
    'PivotCarouselDeck',
    'PivotCarouselAccount',
  );
  const issue = await PivotCarouselDeck.findById(issueId)
    .select('origin revision agentRevision composeJobId accountId')
    .lean();
  if (!issue || issue.origin !== 'agent-generated') return { skipped: true, reason: 'not_agent_revision' };
  if ((issue.revision || 1) !== revision || issue.agentRevision !== revision) {
    return { skipped: true, reason: 'not_agent_revision' };
  }
  const account = issue.accountId
    ? await PivotCarouselAccount.findById(issue.accountId).select('handle').lean()
    : null;
  return deliverNotice(req, {
    event: 'preview-ready',
    accountKey: accountKeyFromHandle(account?.handle),
    jobId: await sourceJobId(req, issue, revision),
    issues: [{ issueId, revision }],
    reserveJobId: job.externalJobId,
  });
}

/**
 * Platform Admin's "Send test": one `{ "event": "test" }` POST with the saved
 * key, sent even while notices are switched off. Records the outcome.
 */
async function sendTestNotice(req, { fetchImpl = global.fetch } = {}) {
  const target = await resolveGrokbotWebhook(req, { fresh: true });
  if (!target.url) {
    return { error: 'Save a webhook URL first.', status: 400, code: 'WEBHOOK_URL_UNSET' };
  }
  if (target.keyError) {
    await recordGrokbotDelivery(req, deliveryRow('test', null, { error: target.keyError }));
    return { error: target.keyError, status: 409, code: 'WEBHOOK_KEY_UNREADABLE' };
  }
  const raw = JSON.stringify({ event: 'test' });
  const result = await postOnce(target.url, raw, noticeHeaders(raw, target.key), {
    fetchImpl,
    timeoutMs: TEST_TIMEOUT_MS,
  });
  const row = deliveryRow('test', null, result);
  await recordGrokbotDelivery(req, row);
  return { data: { ok: result.ok, status: result.status, error: row.error } };
}

module.exports = {
  webhookUrl,
  sendTestNotice,
  noticeBody,
  signBody,
  notifyCarouselJobEnded,
  notifyPreviewReady,
  whenNoticesSettled,
  delivery,
  RETRY_DELAYS_MS,
};
