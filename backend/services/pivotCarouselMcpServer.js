const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { MAX_REVISION_REQUEST_TEXT } = require('../schemas/pivotCarouselDeck');
const {
  listEditorialAccounts,
  listAwaitingReview,
  getComposeRun,
  getIssue,
} = require('./pivotCarouselMcpReadService');
const {
  startCompose,
  requestRevision,
  pickOption,
  approve,
  markPosted,
} = require('./pivotCarouselMcpActionService');

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// Same arguments return the first result. Compose and revision only add records.
const ADDITIVE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// Pick, approve, and mark posted archive siblings or close a draft.
const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const issueId = z.string().regex(/^[0-9a-fA-F]{24}$/).describe('The carousel issue id.');
const revision = z.number().int().min(1).describe('The issue revision this action was read from. A stale revision is refused.');
const idempotencyKey = z.string().regex(/^[a-zA-Z0-9:_-]{8,128}$/).describe('Caller key. A repeat returns the first result and does not run again. A server error keeps nothing, so retry with the same key. IN_PROGRESS means a call with this key is still running; retry it shortly.');

function toolResult(result) {
  if (result?.error) {
    return {
      isError: true,
      content: [{ type: 'text', text: result.error }],
    };
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
}

function createCarouselMcpServer(req) {
  const server = new McpServer({
    name: 'meridian-carousel',
    version: '1.0.0',
  }, {
    instructions: 'Read carousel drafts and compose runs, or record a compose, revision, pick, approval, or posted action. Read tools do not change anything. Action tools do only what their descriptions say.',
  });

  server.registerTool('list_editorial_accounts', {
    description: 'List the fixed editorial accounts. Returns each account key, handle, format, timezone, owner tenant, and the linked carousel account id when one exists. Reads only.',
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => toolResult(await listEditorialAccounts(req)));

  server.registerTool('list_awaiting_review', {
    description: 'List every unapproved, unarchived generated issue and every carousel-compose or carousel-revise job that has not finished. Issues include their id and revision. A revise job includes the issue id and revision it is bound to. Reads only.',
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => toolResult(await listAwaitingReview(req)));

  server.registerTool('get_compose_run', {
    description: 'Read one carousel-compose job by job id. Returns its status, decision, and reason, and for a compose decision each option\'s issue id, revision, theme, rationale, caption, and events. Reads only.',
    inputSchema: z.object({
      jobId: z.string().min(1).max(128).describe('The compose job id.'),
    }),
    annotations: READ_ONLY,
  }, async ({ jobId }) => toolResult(await getComposeRun(req, jobId)));

  server.registerTool('get_issue', {
    description: 'Read one carousel issue by issue id. Returns its caption, events, revision-request thread, and preview. When the preview is ready, slide image URLs are in slide order. Reads only.',
    inputSchema: z.object({
      issueId: z.string().regex(/^[0-9a-fA-F]{24}$/).describe('The carousel issue id.'),
    }),
    annotations: READ_ONLY,
  }, async ({ issueId }) => toolResult(await getIssue(req, issueId)));

  server.registerTool('start_compose', {
    description: 'Queue one carousel-compose job. Required: accountKey (just.go.ic, just.go.sf, or sorry.u.missed.it), publicationTime (ISO-8601 date-time the draft is for), and idempotencyKey. Side effect: creates one pending compose job for that account and publication time, recorded as the token owner, and wakes the compose worker. It does not write a draft. Valid when that editorial account is linked to a carousel account with an owner tenant. Errors: unknown account key (EDITORIAL_ACCOUNT_UNKNOWN), no linked account (EDITORIAL_ACCOUNT_NOT_FOUND), wrong owner tenant, missing owner tenant, or an invalid publication time (INVALID_PUBLICATION_TIME). The same idempotency key returns the first result and does not queue another job.',
    inputSchema: z.object({
      accountKey: z.string().min(1).max(64).describe('Editorial account key, such as just.go.ic.'),
      publicationTime: z.string().min(1).max(64).describe('ISO-8601 publication time for the draft.'),
      idempotencyKey,
    }),
    annotations: ADDITIVE,
  }, async (args) => toolResult(await startCompose(req, args)));

  server.registerTool('request_revision', {
    description: 'Ask the compose agent to revise one generated draft. Required: issueId, revision, text, and idempotencyKey. Side effects: appends the request to that draft\'s revision-request thread, saves the same text as editorial feedback with disposition change, and queues one carousel-revise job bound to the issue id, revision, and new request id. The draft itself is not rewritten. Valid for an unposted agent-generated draft whose current revision matches and which has not been hand-edited since the agent last wrote it. Errors: issue not found (ISSUE_NOT_FOUND), stale revision (REVISION_CONFLICT), posted draft (POSTED_ISSUE), studio edits since the agent (EDITS_SINCE_AGENT), not a generated draft (NOT_GENERATED_ISSUE), empty or too-long text (INVALID_REVISION_REQUEST), or a full request thread (REVISION_THREAD_FULL). The same idempotency key returns the first result and does not record a second request.',
    inputSchema: z.object({
      issueId,
      revision,
      text: z.string().min(1).max(MAX_REVISION_REQUEST_TEXT).describe('What the agent should change.'),
      idempotencyKey,
    }),
    annotations: ADDITIVE,
  }, async (args) => toolResult(await requestRevision(req, args)));

  server.registerTool('pick_option', {
    description: 'Pick one option from a compose run. Required: issueId and revision. Side effects: records this issue as the picked option, as the token owner, then archives every other unarchived draft in the same option set except a posted one. The picked draft\'s revision does not change, a refused pick archives nothing, and restoring a sibling does not un-pick it. Valid for an agent-generated option that belongs to an option set and whose current revision matches. Errors: issue not found (ISSUE_NOT_FOUND), not an option (NOT_AN_OPTION), or a stale revision (REVISION_CONFLICT). Picking the same option again keeps the existing pick.',
    inputSchema: z.object({ issueId, revision }),
    annotations: DESTRUCTIVE,
  }, async (args) => toolResult(await pickOption(req, args)));

  server.registerTool('approve', {
    description: 'Approve one exact revision of a generated draft. Required: issueId and revision. Side effects: sets review state to approved for that revision, records the token owner as approver, and, when the draft is one of several options, picks it and archives the other unarchived, unposted options. A refused approval archives nothing. It does not post to Instagram. Valid for an agent-generated draft whose current revision matches and is still unapproved. Errors: issue not found (ISSUE_NOT_FOUND), not a generated draft (NOT_GENERATED_ISSUE), a stale revision (REVISION_CONFLICT), or the pick errors above. Approving the same revision again returns the existing approval.',
    inputSchema: z.object({ issueId, revision }),
    annotations: DESTRUCTIVE,
  }, async (args) => toolResult(await approve(req, args)));

  server.registerTool('mark_posted', {
    description: 'Record that a person posted this exact revision to Instagram by hand. Required: issueId and revision. Side effects: writes an immutable posted snapshot and post history, sets a generated draft\'s review state to posted, and records the token owner. It does not publish anywhere. Valid when a generated draft is already approved for this exact revision, or when a manual issue\'s current revision matches. Errors: issue not found (ISSUE_NOT_FOUND), a stale revision (REVISION_CONFLICT), or approval required when a generated draft is not approved for this revision (APPROVAL_REQUIRED). Recording the same revision again returns the first post.',
    inputSchema: z.object({ issueId, revision }),
    annotations: DESTRUCTIVE,
  }, async (args) => toolResult(await markPosted(req, args)));

  return server;
}

module.exports = { createCarouselMcpServer };
