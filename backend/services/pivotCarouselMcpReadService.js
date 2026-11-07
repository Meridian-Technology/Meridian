/**
 * Read models for the carousel MCP tools. They call the existing account,
 * issue, preview, and compute-job services and do not write.
 */
const getGlobalModels = require('./getGlobalModelService');
const { editorialAccountFor } = require('../constants/pivotCarouselEditorialAccounts');
const { TERMINAL_COMPUTE_JOB_STATUSES } = require('../utilities/pivotComputeJobTransitions');
const { resolveEditorialAccount } = require('./pivotCarouselComposeContextService');
const { getCarouselIssue, getCarouselIssuePreview } = require('./pivotCarouselIssueService');
const { findJobByExternalId } = require('./pivotComputeJobStore');

const ISSUE_ID = /^[0-9a-f]{24}$/i;

function fail(error, status, code) {
  return { error, status, code };
}

function accountKeyFromHandle(handle) {
  return editorialAccountFor(String(handle || '').replace(/^@/, ''))?.key || null;
}

function eventsOf(issue) {
  const composition = issue?.composition || null;
  const slides = Array.isArray(composition?.eventSlides) ? composition.eventSlides : [];
  if (slides.length) {
    return slides.map((slide) => ({
      sourceTenantKey: slide.eventRef?.sourceTenantKey || null,
      eventId: slide.eventRef?.eventId || null,
      ...(slide.blurb ? { blurb: slide.blurb } : {}),
    }));
  }
  const refs = Array.isArray(composition?.selectedEventRefs) ? composition.selectedEventRefs : [];
  return refs.map((ref) => ({
    sourceTenantKey: ref.sourceTenantKey,
    eventId: ref.eventId,
  }));
}

function optionView(issue) {
  return {
    issueId: issue.id,
    revision: issue.revision,
    theme: issue.themeLabel || issue.composition?.themeLabel || null,
    rationale: issue.composition?.rationale || null,
    caption: issue.socialCaption || '',
    events: eventsOf(issue),
  };
}

function presentPreview(result) {
  if (result.error) {
    return { status: 'failed', message: result.error, code: result.code || null };
  }
  const preview = result.data;
  const slides = (preview.slides || []).map((slide) => ({
    slideNumber: slide.slideNumber,
    logicalName: slide.logicalName,
    url: slide.url,
  }));
  return {
    status: preview.status,
    revision: preview.revision,
    ...(preview.expiresInSeconds != null ? { expiresInSeconds: preview.expiresInSeconds } : {}),
    ...(slides.length ? {
      slides,
      slideImageUrls: slides.map((slide) => slide.url),
    } : {}),
  };
}

async function accountKeysById(req, accountIds) {
  const ids = [...new Set(accountIds.filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const { PivotCarouselAccount } = getGlobalModels(req, 'PivotCarouselAccount');
  const accounts = await PivotCarouselAccount.find({ _id: { $in: ids } }).select('handle').lean();
  return new Map(accounts.map((account) => [String(account._id), accountKeyFromHandle(account.handle)]));
}

async function listEditorialAccounts(req) {
  const { EDITORIAL_ACCOUNTS } = require('../constants/pivotCarouselEditorialAccounts');
  const accounts = [];
  for (const definition of EDITORIAL_ACCOUNTS) {
    const resolved = await resolveEditorialAccount(req, definition.key);
    const linked = !resolved.error;
    accounts.push({
      key: definition.key,
      displayName: linked ? resolved.account.displayName : definition.displayName,
      handle: definition.handle,
      format: definition.format,
      ownerTenantKey: linked ? resolved.account.ownerTenantKey : definition.ownerTenantKey,
      timezone: linked ? resolved.timezone : definition.timezone,
      accountId: linked ? String(resolved.account._id) : null,
    });
  }
  return { accounts };
}

async function listAwaitingReview(req) {
  const { PivotCarouselDeck, PivotComputeJob } = getGlobalModels(
    req,
    'PivotCarouselDeck',
    'PivotComputeJob',
  );
  const [issueDocs, jobDocs] = await Promise.all([
    PivotCarouselDeck.find({
      origin: 'agent-generated',
      reviewState: 'unapproved',
      status: { $ne: 'archived' },
    }).sort({ updatedAt: -1, _id: -1 })
      .select('accountId revision themeLabel composition.themeLabel optionSetId')
      .lean(),
    PivotComputeJob.find({
      kind: { $in: ['carousel-compose', 'carousel-revise'] },
      status: { $nin: [...TERMINAL_COMPUTE_JOB_STATUSES] },
    }).sort({ requestedAt: 1, externalJobId: 1 })
      .select('externalJobId kind status options requestedAt')
      .lean(),
  ]);
  const keys = await accountKeysById(req, issueDocs.map((issue) => issue.accountId));
  return {
    issues: issueDocs.map((issue) => ({
      issueId: String(issue._id),
      accountId: issue.accountId ? String(issue.accountId) : null,
      accountKey: keys.get(String(issue.accountId)) || null,
      revision: issue.revision || 1,
      themeLabel: issue.themeLabel || issue.composition?.themeLabel || null,
      optionSetId: issue.optionSetId || null,
    })),
    jobs: jobDocs.map((job) => {
      const options = job.options || {};
      const revision = Number.isInteger(options.revision) ? options.revision : null;
      return {
        jobId: job.externalJobId,
        kind: job.kind,
        status: job.status,
        accountKey: options.editorialAccountKey || null,
        issueId: options.issueId ? String(options.issueId) : null,
        revision,
        requestId: options.requestId ? String(options.requestId) : null,
      };
    }),
  };
}

function outcomeIssueIds(outcome) {
  if (Array.isArray(outcome?.issueIds) && outcome.issueIds.length) {
    return outcome.issueIds.map(String);
  }
  return outcome?.issueId ? [String(outcome.issueId)] : [];
}

async function getComposeRun(req, jobId) {
  const job = await findJobByExternalId(req, jobId);
  if (!job || job.kind !== 'carousel-compose') {
    return fail('Compose run not found.', 404, 'COMPOSE_RUN_NOT_FOUND');
  }
  const ids = job.composeOutcome?.decision === 'compose' ? outcomeIssueIds(job.composeOutcome) : [];
  const options = [];
  for (const issueId of ids) {
    const located = await locateIssue(req, issueId);
    if (located.error) {
      options.push({
        issueId,
        revision: null,
        theme: null,
        rationale: null,
        caption: '',
        events: [],
      });
      continue;
    }
    options.push(optionView(located.issue));
  }
  return {
    jobId: job.externalJobId,
    accountKey: job.options?.editorialAccountKey || null,
    status: job.status,
    decision: job.composeOutcome?.decision || null,
    reason: job.composeOutcome?.reason || null,
    options,
  };
}

async function locateIssue(req, issueId) {
  if (!ISSUE_ID.test(String(issueId || ''))) {
    return fail('Issue not found.', 404, 'ISSUE_NOT_FOUND');
  }
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findById(issueId).select('accountId').lean();
  if (!doc?.accountId) return fail('Issue not found.', 404, 'ISSUE_NOT_FOUND');
  const loaded = await getCarouselIssue(req, String(doc.accountId), issueId);
  if (loaded.error) return loaded;
  return { accountId: String(doc.accountId), issue: loaded.data.issue };
}

async function getIssue(req, issueId) {
  const located = await locateIssue(req, issueId);
  if (located.error) return located;
  const { issue, accountId } = located;
  const keys = await accountKeysById(req, [accountId]);
  const preview = await getCarouselIssuePreview(req, accountId, issue.id);
  return {
    issueId: issue.id,
    accountId,
    accountKey: keys.get(accountId) || null,
    revision: issue.revision,
    reviewState: issue.reviewState,
    archived: issue.status === 'archived',
    theme: issue.themeLabel || issue.composition?.themeLabel || null,
    caption: issue.socialCaption || '',
    events: eventsOf(issue),
    revisionRequests: issue.revisionRequests || [],
    preview: presentPreview(preview),
  };
}

module.exports = {
  listEditorialAccounts,
  listAwaitingReview,
  getComposeRun,
  getIssue,
  locateIssue,
};
