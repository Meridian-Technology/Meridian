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

function inProgress() {
  return {
    ...fail('This action is still running. Retry with the same idempotency key.', 409, 'IN_PROGRESS'),
    retryable: true,
  };
}

// A success or a deliberate refusal. A thrown error or a server fault is not
// kept, so the same key can run again.
function storable(outcome) {
  if (!outcome?.error) return true;
  return outcome.status >= 400 && outcome.status < 500;
}

/**
 * Claim the key with a pending row. The unique index lets one caller in. Any
 * other finds the pending row and is told to retry, or finds the stored result.
 */
async function claim(CarouselMcpAction, row) {
  const identity = { globalUserId: row.globalUserId, tool: row.tool, idempotencyKey: row.idempotencyKey };
  // Two tries: the holder may release the key between our insert and our read.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return { claimed: await CarouselMcpAction.create({ ...row, state: 'pending' }) };
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    const prior = await CarouselMcpAction.findOne(identity).lean();
    if (!prior) continue;
    if (prior.state === 'pending') return { outcome: inProgress() };
    return { outcome: prior.outcome };
  }
  return { outcome: inProgress() };
}

async function release(CarouselMcpAction, claimed) {
  try {
    await CarouselMcpAction.deleteOne({ _id: claimed._id, state: 'pending' });
  } catch (error) {
    console.error('[carouselMcp] could not release an idempotency key', error);
  }
}

/**
 * Return the stored result for this owner, tool and key. Otherwise run the
 * action once and store a success or a deliberate refusal. A thrown error or
 * a 5xx releases the key, so the caller can retry it.
 */
async function settle(req, tool, idempotencyKey, perform) {
  const owner = ownerId(req);
  const token = req.platformAccessToken;
  if (!owner || !token?.id || !token.label) {
    return fail('Platform admin required.', 403, 'NOT_PLATFORM_ADMIN');
  }
  const { CarouselMcpAction } = getGlobalModels(req, 'CarouselMcpAction');
  const row = {
    globalUserId: owner,
    tokenId: token.id,
    tokenLabel: token.label,
    tool,
    idempotencyKey: idempotencyKey || null,
  };

  let claimed = null;
  if (row.idempotencyKey) {
    const result = await claim(CarouselMcpAction, row);
    if (!result.claimed) return result.outcome;
    claimed = result.claimed;
  }

  let outcome;
  try {
    outcome = await perform();
  } catch (error) {
    console.error(`[carouselMcp] ${tool} failed`, error);
    if (claimed) await release(CarouselMcpAction, claimed);
    return fail(
      error.message || 'The action failed.',
      error.status || 500,
      error.code || 'MCP_ACTION_FAILED',
    );
  }

  if (!storable(outcome)) {
    if (claimed) await release(CarouselMcpAction, claimed);
    return outcome;
  }
  if (claimed) {
    await CarouselMcpAction.updateOne(
      { _id: claimed._id, state: 'pending' },
      { $set: { state: 'done', outcome } },
    );
  } else {
    await CarouselMcpAction.create({ ...row, state: 'done', outcome });
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
