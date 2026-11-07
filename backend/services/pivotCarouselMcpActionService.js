/**
 * Carousel MCP actions. They call the existing compose and issue services in
 * process. The actor on those records is the token owner. This collection
 * names the token and remembers the first result for an idempotency key.
 */
const { createHash } = require('crypto');
const getGlobalModels = require('./getGlobalModelService');
const { resolveEditorialAccount } = require('./pivotCarouselComposeContextService');
const {
  pickCarouselOption,
  approveCarouselIssue,
  requestCarouselRevision,
  markCarouselIssuePosted,
} = require('./pivotCarouselIssueService');
const { locateIssue } = require('./pivotCarouselMcpReadService');
const { CONTRACT_VERSION } = require('../utilities/pivotAdminComputeJobContract');
const { resolveImplementationRevision } = require('../utilities/pivotComputeContextVersion');

function fail(error, status, code) {
  return { error, status, code };
}

function ownerId(req) {
  return String(req.user?.globalUserId || '');
}

function composeIdentity(owner, idempotencyKey) {
  const digest = createHash('sha256')
    .update(`carousel-mcp:${owner}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 32);
  return {
    jobId: `job:compose:${digest}`,
    idempotencyKey: `mcp:${digest}`,
  };
}

/**
 * Return the stored result for this owner, tool and key. Otherwise run the
 * action once and store that result, including a service error.
 */
async function settle(req, tool, idempotencyKey, perform) {
  const owner = ownerId(req);
  const token = req.platformAccessToken;
  if (!owner || !token?.id || !token.label) {
    return fail('Platform admin required.', 403, 'NOT_PLATFORM_ADMIN');
  }
  const { CarouselMcpAction } = getGlobalModels(req, 'CarouselMcpAction');
  const key = idempotencyKey || null;
  if (key) {
    const prior = await CarouselMcpAction.findOne({
      globalUserId: owner,
      tool,
      idempotencyKey: key,
    }).lean();
    if (prior?.outcome) return prior.outcome;
  }

  let outcome;
  try {
    outcome = await perform();
  } catch (error) {
    outcome = fail(
      error.message || 'The action failed.',
      error.status || 500,
      error.code || 'MCP_ACTION_FAILED',
    );
  }

  try {
    await CarouselMcpAction.create({
      globalUserId: owner,
      tokenId: token.id,
      tokenLabel: token.label,
      tool,
      idempotencyKey: key,
      outcome,
    });
  } catch (error) {
    if (error?.code === 11000 && key) {
      const prior = await CarouselMcpAction.findOne({
        globalUserId: owner,
        tool,
        idempotencyKey: key,
      }).lean();
      if (prior?.outcome) return prior.outcome;
    }
    throw error;
  }
  return outcome;
}

async function startCompose(req, { accountKey, publicationTime, idempotencyKey }) {
  return settle(req, 'start_compose', idempotencyKey, async () => {
    const resolved = await resolveEditorialAccount(req, accountKey);
    if (resolved.error) return fail(resolved.error, resolved.status || 400, resolved.code);
    const publication = new Date(publicationTime);
    if (Number.isNaN(publication.getTime())) {
      return fail('A publication time must be a date.', 422, 'INVALID_PUBLICATION_TIME');
    }
    const cityKey = resolved.account.ownerTenantKey;
    if (!cityKey) {
      return fail('This editorial account has no owner tenant.', 409, 'EDITORIAL_ACCOUNT_TENANT_MISMATCH');
    }
    const identity = composeIdentity(ownerId(req), idempotencyKey);
    const { createAdminComputeJob } = require('./pivotComputeAdminService');
    const created = await createAdminComputeJob(req, {
      request: {
        contractVersion: CONTRACT_VERSION,
        jobId: identity.jobId,
        scheduleOccurrenceId: null,
        kind: 'carousel-compose',
        cityKey,
        implementationRevision: resolveImplementationRevision(),
        contextVersion: 'ctx:compose.pending',
        requestedAt: new Date().toISOString(),
        idempotencyKey: identity.idempotencyKey,
        options: {
          editorialAccountKey: resolved.definition.key,
          proposedPublicationAt: publication.toISOString(),
        },
      },
      actor: ownerId(req),
    });
    return {
      jobId: created.job.externalJobId,
      accountKey: resolved.definition.key,
      status: created.job.status,
      publicationTime: publication.toISOString(),
      created: Boolean(created.created),
    };
  });
}

async function requestRevision(req, { issueId, revision, text, idempotencyKey }) {
  return settle(req, 'request_revision', idempotencyKey, async () => {
    const located = await locateIssue(req, issueId);
    if (located.error) return located;
    const result = await requestCarouselRevision(req, located.accountId, issueId, { revision, text });
    if (result.error) return result;
    return {
      issueId: result.data.issue.id,
      revision: result.data.request.revision,
      requestId: result.data.request.id,
      jobId: result.data.job.externalJobId,
      reviewState: result.data.issue.reviewState,
    };
  });
}

async function pickOption(req, { issueId, revision }) {
  return settle(req, 'pick_option', null, async () => {
    const located = await locateIssue(req, issueId);
    if (located.error) return located;
    const result = await pickCarouselOption(req, located.accountId, issueId, { revision });
    if (result.error) return result;
    return {
      issueId: result.data.issue.id,
      revision: result.data.issue.revision,
      picked: Boolean(result.data.issue.optionPick),
      status: result.data.issue.status,
    };
  });
}

async function approve(req, { issueId, revision }) {
  return settle(req, 'approve', null, async () => {
    const located = await locateIssue(req, issueId);
    if (located.error) return located;
    const result = await approveCarouselIssue(req, located.accountId, issueId, { revision });
    if (result.error) return result;
    return {
      issueId: result.data.issue.id,
      revision: result.data.issue.revision,
      reviewState: result.data.issue.reviewState,
      alreadyApproved: Boolean(result.data.alreadyApproved),
    };
  });
}

async function markPosted(req, { issueId, revision }) {
  return settle(req, 'mark_posted', null, async () => {
    const located = await locateIssue(req, issueId);
    if (located.error) return located;
    const result = await markCarouselIssuePosted(req, located.accountId, issueId, { revision });
    if (result.error) return result;
    return {
      issueId: result.data.issue.id,
      revision: result.data.issue.revision,
      reviewState: result.data.issue.reviewState,
      alreadyPosted: Boolean(result.data.alreadyPosted),
      postedAt: result.data.issue.posting?.postedAt || null,
    };
  });
}

module.exports = {
  startCompose,
  requestRevision,
  pickOption,
  approve,
  markPosted,
  composeIdentity,
};
