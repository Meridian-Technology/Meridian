jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => {
    const tenantKey = String(key || '').toLowerCase();
    if (tenantKey === 'sf' || tenantKey === 'ic') {
      return {
        tenantKey,
        pivotPilot: true,
        pivotDropTimezone: tenantKey === 'ic' ? 'America/Chicago' : 'America/Los_Angeles',
      };
    }
    return null;
  }),
}));

jest.mock('../../aws-config', () => ({
  getSignedUrlPromise: jest.fn(),
}));

const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');

const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { createComputeJob } = require('../../services/pivotComputeJobStore');
const getGlobalModels = require('../../services/getGlobalModelService');
const { mintPlatformAccessToken } = require('../../services/platformAccessTokenService');
const {
  createCarouselAccount,
  createCarouselIssue,
  createGeneratedCarouselIssue,
  approveCarouselIssue,
  archiveCarouselIssue,
  requestCarouselRevision,
} = require('../../services/pivotCarouselIssueService');
const carouselMcpRoutes = require('../../routes/carouselMcpRoutes');
const s3 = require('../../aws-config');

jest.setTimeout(120000);

const ACCEPT = 'application/json, text/event-stream';
const WINDOW = {
  from: '2026-11-01T00:00:00.000Z',
  to: '2026-11-15T00:00:00.000Z',
  toExclusive: false,
  timezone: 'America/Los_Angeles',
  mode: 'upcoming',
  days: 14,
};
const EVENTS = ['c'.repeat(24), 'a'.repeat(24), 'b'.repeat(24)];
const SHA = 'd'.repeat(64);

function composition({ theme, rationale, caption }) {
  return {
    themeLabel: theme,
    rationale,
    selectedEventRefs: EVENTS.map((eventId) => ({ sourceTenantKey: 'sf', eventId })),
    eventSlides: EVENTS.map((eventId, index) => ({
      eventRef: { sourceTenantKey: 'sf', eventId },
      blurb: `Night ${index + 1}`,
      presetId: 'event',
    })),
    socialCaption: caption,
  };
}

describe('carousel MCP read tools', () => {
  let mongo;
  let req;
  let app;
  let token;
  let sfAccountId;
  let icAccountId;
  let previousBucket;
  let previousWakeUrl;

  beforeAll(async () => {
    previousBucket = process.env.AWS_S3_BUCKET_NAME;
    previousWakeUrl = process.env.PIVOT_COMPUTE_WAKE_URL;
    process.env.AWS_S3_BUCKET_NAME = 'pivot-exports-test';
    delete process.env.PIVOT_COMPUTE_WAKE_URL;
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'admin-1' } };
    app = express();
    app.use(express.json());
    app.use((requestContext, _res, next) => {
      requestContext.globalDb = mongo.globalConnection;
      requestContext.school = 'www';
      next();
    });
    app.use('/mcp/carousel', carouselMcpRoutes);
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  beforeEach(async () => {
    await mongo.reset();
    await ensurePivotComputeJobIndexes(req, { force: true });
    // The idempotency claim relies on this unique index; reset drops it.
    await getGlobalModels(req, 'CarouselMcpAction').CarouselMcpAction.createIndexes();
    s3.getSignedUrlPromise.mockReset();
    s3.getSignedUrlPromise.mockImplementation(async (_operation, params) => (
      `https://s3.test/${params.Key}?expires=${params.Expires}`
    ));
    const { GlobalUser, PlatformRole } = getGlobalModels(req, 'GlobalUser', 'PlatformRole');
    const user = await GlobalUser.create({ email: 'mcp@example.com', name: 'MCP Admin' });
    await PlatformRole.create({ globalUserId: user._id, roles: ['platform_admin'] });
    req.user = { globalUserId: user._id, mfaVerified: false };
    const minted = await mintPlatformAccessToken(req, { globalUserId: user._id, label: 'grokbot' });
    token = minted.data.secret;
    icAccountId = (await createCarouselAccount(req, {
      displayName: 'Just Go Iowa City',
      handle: '@just.go.ic',
      ownerTenantKey: 'ic',
      sourceTenantKeys: ['ic'],
    })).data.account.id;
    sfAccountId = (await createCarouselAccount(req, {
      displayName: 'Just Go San Francisco',
      handle: '@just.go.sf',
      ownerTenantKey: 'sf',
      sourceTenantKeys: ['sf'],
    })).data.account.id;
  });

  afterAll(async () => {
    process.env.AWS_S3_BUCKET_NAME = previousBucket;
    if (previousWakeUrl === undefined) delete process.env.PIVOT_COMPUTE_WAKE_URL;
    else process.env.PIVOT_COMPUTE_WAKE_URL = previousWakeUrl;
    if (mongo) await mongo.cleanup();
  });

  async function generated(accountId, { name, theme, rationale, caption, optionSetId, optionIndex }) {
    const body = composition({ theme, rationale, caption });
    const trusted = {
      composition: body,
      contextWindow: WINDOW,
      agentRevision: 1,
    };
    if (optionSetId) {
      trusted.optionSetId = optionSetId;
      trusted.optionIndex = optionIndex;
      trusted.themeLabel = theme;
    }
    const created = await createGeneratedCarouselIssue(req, accountId, {
      name,
      socialCaption: caption,
    }, trusted);
    expect(created.error).toBeUndefined();
    return created.data.issue;
  }

  async function computeJob({ externalJobId, kind, cityKey, options, status, composeOutcome, requestedAt }) {
    await createComputeJob(req, {
      externalJobId,
      kind,
      cityKey,
      contractVersion: '1',
      contextVersion: 'ctx:compose.pending',
      createIdempotencyKey: externalJobId,
      requestedAt: requestedAt || '2026-11-06T18:00:00.000Z',
      origin: { type: 'admin', requestedBy: String(req.user.globalUserId) },
      options,
    });
    if (status || composeOutcome) {
      const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
      await PivotComputeJob.updateOne({ externalJobId }, {
        $set: {
          ...(status ? { status } : {}),
          ...(composeOutcome ? { composeOutcome } : {}),
        },
      });
    }
  }

  async function rpc(body, headers = {}) {
    return request(app)
      .post('/mcp/carousel')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', ACCEPT)
      .set('Content-Type', 'application/json')
      .set(headers)
      .send(body);
  }

  async function callTool(name, args) {
    const response = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args || {} },
    });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['mcp-session-id']).toBeUndefined();
    expect(String(response.text)).not.toMatch(/text\/event-stream/);
    return response.body.result;
  }

  function readJson(result) {
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: 'text', text: expect.any(String) }]);
    return JSON.parse(result.content[0].text);
  }

  it('answers with JSON and no session id, and lists read-only tools', async () => {
    const initialized = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'grokbot', version: '1.0.0' },
      },
    });
    expect(initialized.status).toBe(200);
    expect(initialized.headers['mcp-session-id']).toBeUndefined();
    expect(initialized.body.result.serverInfo).toMatchObject({ name: 'meridian-carousel' });
    expect(initialized.headers['content-type']).toMatch(/application\/json/);

    const listed = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = listed.body.result.tools;
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    expect(Object.keys(byName).sort()).toEqual([
      'approve',
      'get_compose_run',
      'get_issue',
      'list_awaiting_review',
      'list_editorial_accounts',
      'mark_posted',
      'pick_option',
      'request_revision',
      'start_compose',
    ]);
    for (const name of ['get_compose_run', 'get_issue', 'list_awaiting_review', 'list_editorial_accounts']) {
      expect(byName[name].annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    }
    for (const name of ['start_compose', 'request_revision']) {
      expect(byName[name].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
      expect(byName[name].description).toMatch(/Side effect/);
      expect(byName[name].description).toMatch(/Error/);
      expect(byName[name].description).toMatch(/idempotency key/i);
    }
    for (const name of ['pick_option', 'approve', 'mark_posted']) {
      expect(byName[name].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true });
      expect(byName[name].description).toMatch(/Side effect/);
      expect(byName[name].description).toMatch(/revision/);
      expect(byName[name].description).toMatch(/Error/);
    }

    const session = await rpc(
      { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      { 'mcp-session-id': 'sess-1' },
    );
    expect(session.status).toBe(400);
    expect(session.body.error.message).toMatch(/session ids/);

    const anonymous = await request(app)
      .post('/mcp/carousel')
      .set('Accept', ACCEPT)
      .send({ jsonrpc: '2.0', id: 4, method: 'tools/list' });
    expect(anonymous.status).toBe(401);

    const get = await request(app)
      .get('/mcp/carousel')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', ACCEPT);
    expect(get.status).toBe(405);
    expect(get.headers['mcp-session-id']).toBeUndefined();
  });

  it('lists editorial accounts from the linked carousel accounts', async () => {
    const body = readJson(await callTool('list_editorial_accounts'));
    expect(body.accounts).toEqual([
      expect.objectContaining({
        key: 'just.go.ic',
        handle: '@just.go.ic',
        format: 'city-picks',
        ownerTenantKey: 'ic',
        timezone: 'America/Chicago',
        accountId: icAccountId,
      }),
      expect.objectContaining({
        key: 'just.go.sf',
        handle: '@just.go.sf',
        ownerTenantKey: 'sf',
        accountId: sfAccountId,
      }),
      expect.objectContaining({
        key: 'sorry.u.missed.it',
        handle: '@sorry.u.missed.it',
        accountId: null,
        ownerTenantKey: null,
      }),
    ]);
  });

  it('lists unapproved drafts and compose or revise jobs that are still running', async () => {
    const late = await generated(sfAccountId, {
      name: 'Late shows',
      theme: 'Late shows',
      rationale: 'Three late rooms.',
      caption: 'Out late.',
      optionSetId: 'job:compose-done',
      optionIndex: 0,
    });
    const jazz = await generated(sfAccountId, {
      name: 'Jazz rooms',
      theme: 'Jazz rooms',
      rationale: 'A separate jazz night.',
      caption: 'Jazz tonight.',
      optionSetId: 'job:compose-done',
      optionIndex: 1,
    });
    const archived = await generated(sfAccountId, {
      name: 'Archived',
      theme: 'Archived',
      rationale: 'Put away.',
      caption: 'Gone.',
    });
    await archiveCarouselIssue(req, sfAccountId, archived.id, { revision: 1 });
    const approved = await generated(icAccountId, {
      name: 'Approved',
      theme: 'Approved',
      rationale: 'Already chosen.',
      caption: 'Go.',
    });
    await approveCarouselIssue(req, icAccountId, approved.id, { revision: 1 });
    await createCarouselIssue(req, sfAccountId, { name: 'Hand made', socialCaption: 'Mine.' });

    const revising = await generated(sfAccountId, {
      name: 'Needs a cut',
      theme: 'Needs a cut',
      rationale: 'Too long.',
      caption: 'Cut me.',
    });
    const requested = await requestCarouselRevision(req, sfAccountId, revising.id, {
      revision: 1,
      text: 'Drop the third event.',
    });
    expect(requested.error).toBeUndefined();

    await computeJob({
      externalJobId: 'job:compose-running',
      kind: 'carousel-compose',
      cityKey: 'sf',
      options: { editorialAccountKey: 'just.go.sf', proposedPublicationAt: '2026-11-07T03:00:00.000Z' },
      status: 'running',
      requestedAt: '2026-11-06T17:00:00.000Z',
    });
    await computeJob({
      externalJobId: 'job:compose-done',
      kind: 'carousel-compose',
      cityKey: 'sf',
      options: { editorialAccountKey: 'just.go.sf' },
      status: 'completed',
      composeOutcome: { decision: 'compose', issueIds: [late.id, jazz.id] },
    });
    await computeJob({
      externalJobId: 'job:compose-failed',
      kind: 'carousel-compose',
      cityKey: 'sf',
      options: { editorialAccountKey: 'just.go.sf' },
      status: 'failed',
    });
    await computeJob({
      externalJobId: `job:export:${late.id}:r1`,
      kind: 'carousel-export',
      cityKey: 'sf',
      options: { deckId: late.id },
      status: 'running',
    });

    const body = readJson(await callTool('list_awaiting_review'));
    expect(body.issues.map((issue) => [issue.issueId, issue.revision, issue.accountKey, issue.themeLabel]).sort())
      .toEqual([
        [jazz.id, 1, 'just.go.sf', 'Jazz rooms'],
        [late.id, 1, 'just.go.sf', 'Late shows'],
        [revising.id, 1, 'just.go.sf', 'Needs a cut'],
      ].sort());
    expect(body.issues.find((issue) => issue.issueId === late.id).optionSetId).toBe('job:compose-done');
    expect(body.jobs.map((job) => [job.jobId, job.kind, job.status, job.issueId, job.revision])).toEqual([
      ['job:compose-running', 'carousel-compose', 'running', null, null],
      [requested.data.job.externalJobId, 'carousel-revise', 'pending', revising.id, 1],
    ]);
    expect(body.jobs.find((job) => job.kind === 'carousel-revise').requestId).toBe(requested.data.request.id);
    expect(body.jobs.find((job) => job.jobId === 'job:compose-running').accountKey).toBe('just.go.sf');
  });

  it('reads a compose run with each option and a run that made no draft', async () => {
    const caption = 'Three nights, in this order.';
    const first = await generated(sfAccountId, {
      name: 'Late shows',
      theme: 'Late shows',
      rationale: 'The late rooms hold together.',
      caption,
      optionSetId: 'job:compose-sf-001',
      optionIndex: 0,
    });
    const second = await generated(sfAccountId, {
      name: 'Jazz rooms',
      theme: 'Jazz rooms',
      rationale: 'Jazz is a different night.',
      caption: 'Jazz, separately.',
      optionSetId: 'job:compose-sf-001',
      optionIndex: 1,
    });
    await computeJob({
      externalJobId: 'job:compose-sf-001',
      kind: 'carousel-compose',
      cityKey: 'sf',
      options: { editorialAccountKey: 'just.go.sf' },
      status: 'completed',
      composeOutcome: {
        decision: 'compose',
        reason: null,
        issueId: first.id,
        issueIds: [first.id, second.id],
      },
    });
    await computeJob({
      externalJobId: 'job:compose-sf-wait',
      kind: 'carousel-compose',
      cityKey: 'sf',
      options: { editorialAccountKey: 'just.go.sf' },
      status: 'completed',
      composeOutcome: { decision: 'wait', reason: 'One theme is not enough to offer a choice.' },
    });
    await computeJob({
      externalJobId: 'job:compose-sf-open',
      kind: 'carousel-compose',
      cityKey: 'sf',
      options: { editorialAccountKey: 'just.go.sf' },
      status: 'pending',
    });

    const composed = readJson(await callTool('get_compose_run', { jobId: 'job:compose-sf-001' }));
    expect(composed).toMatchObject({
      jobId: 'job:compose-sf-001',
      accountKey: 'just.go.sf',
      status: 'completed',
      decision: 'compose',
      reason: null,
    });
    expect(composed.options.map((option) => option.issueId)).toEqual([first.id, second.id]);
    expect(composed.options[0]).toMatchObject({
      revision: 1,
      theme: 'Late shows',
      rationale: 'The late rooms hold together.',
      caption,
    });
    expect(composed.options[0].events).toEqual(EVENTS.map((eventId, index) => ({
      sourceTenantKey: 'sf',
      eventId,
      blurb: `Night ${index + 1}`,
    })));

    const waiting = readJson(await callTool('get_compose_run', { jobId: 'job:compose-sf-wait' }));
    expect(waiting).toMatchObject({
      status: 'completed',
      decision: 'wait',
      reason: 'One theme is not enough to offer a choice.',
      options: [],
    });

    const open = readJson(await callTool('get_compose_run', { jobId: 'job:compose-sf-open' }));
    expect(open).toMatchObject({ status: 'pending', decision: null, reason: null, options: [] });

    const missing = await callTool('get_compose_run', { jobId: 'job:missing' });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toMatch(/not found/i);
  });

  it('reads an issue with its request thread and slide image urls in order', async () => {
    const draft = await generated(sfAccountId, {
      name: 'Late shows',
      theme: 'Late shows',
      rationale: 'The late rooms hold together.',
      caption: 'Come out late.',
    });
    const requested = await requestCarouselRevision(req, sfAccountId, draft.id, {
      revision: 1,
      text: 'Make the caption shorter.',
    });
    expect(requested.error).toBeUndefined();

    const externalJobId = `job:export:${draft.id}:r1`;
    await computeJob({
      externalJobId,
      kind: 'carousel-export',
      cityKey: 'sf',
      options: { deckId: draft.id, deckRevision: '2026-11-06T19:00:00.000Z' },
      status: 'completed',
    });
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne({ externalJobId }, {
      $set: {
        exportArtifacts: {
          attemptId: new mongoose.Types.ObjectId(),
          attemptNumber: 1,
          prefix: `pivot-exports/sf/${externalJobId}/1/`,
          grantId: 'grant:preview-001',
          finalizedAt: new Date('2026-11-06T20:05:00.000Z'),
          expiresAt: new Date('2026-11-20T20:05:00.000Z'),
          expired: false,
          artifacts: [
            { logicalName: 'slide-02.png', mimeType: 'image/png', slideNumber: 2 },
            { logicalName: 'carousel.zip', mimeType: 'application/zip', slideNumber: null },
            { logicalName: 'slide-01.png', mimeType: 'image/png', slideNumber: 1 },
          ].map((artifact) => ({
            artifactId: `artifact:${artifact.logicalName}`,
            mimeType: artifact.mimeType,
            byteCount: 1000,
            sha256: SHA,
            slideNumber: artifact.slideNumber,
            logicalName: artifact.logicalName,
            objectKey: `pivot-exports/sf/${externalJobId}/1/${artifact.logicalName}`,
          })),
        },
      },
    });

    const body = readJson(await callTool('get_issue', { issueId: draft.id }));
    expect(body).toMatchObject({
      issueId: draft.id,
      accountId: sfAccountId,
      accountKey: 'just.go.sf',
      revision: 1,
      reviewState: 'unapproved',
      theme: 'Late shows',
      caption: 'Come out late.',
    });
    expect(body.events.map((event) => event.eventId)).toEqual(EVENTS);
    expect(body.revisionRequests).toEqual([
      expect.objectContaining({
        id: requested.data.request.id,
        revision: 1,
        text: 'Make the caption shorter.',
      }),
    ]);
    expect(body.preview).toMatchObject({ status: 'ready', revision: 1, expiresInSeconds: 3600 });
    expect(body.preview.slides.map((slide) => slide.logicalName)).toEqual(['slide-01.png', 'slide-02.png']);
    expect(body.preview.slideImageUrls).toEqual(body.preview.slides.map((slide) => slide.url));
    expect(body.preview.slideImageUrls[0]).toMatch(/slide-01\.png/);
    expect(body.preview.slideImageUrls[1]).toMatch(/slide-02\.png/);

    const missing = await callTool('get_issue', { issueId: 'f'.repeat(24) });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toMatch(/not found/i);
  });

  it('runs each action as the token owner and replays an idempotency key', async () => {
    const ownerId = String(req.user.globalUserId);
    const publicationTime = '2026-11-08T18:00:00.000Z';
    const started = readJson(await callTool('start_compose', {
      accountKey: 'just.go.ic',
      publicationTime,
      idempotencyKey: 'compose-ic-day',
    }));
    expect(started).toMatchObject({
      accountKey: 'just.go.ic',
      status: 'pending',
      publicationTime,
      created: true,
    });
    const again = readJson(await callTool('start_compose', {
      accountKey: 'just.go.sf',
      publicationTime: '2026-11-09T18:00:00.000Z',
      idempotencyKey: 'compose-ic-day',
    }));
    expect(again).toEqual(started);

    const { PivotComputeJob, PivotCarouselDeck, CarouselMcpAction } = getGlobalModels(
      req,
      'PivotComputeJob',
      'PivotCarouselDeck',
      'CarouselMcpAction',
    );
    const jobs = await PivotComputeJob.find({ kind: 'carousel-compose' }).lean();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      externalJobId: started.jobId,
      status: 'pending',
      origin: { type: 'admin', requestedBy: ownerId },
      options: { editorialAccountKey: 'just.go.ic', proposedPublicationAt: publicationTime },
    });

    const draft = await generated(sfAccountId, {
      name: 'Revise me',
      theme: 'Late shows',
      rationale: 'A second pass',
      caption: 'Come out late.',
    });
    const revision = readJson(await callTool('request_revision', {
      issueId: draft.id,
      revision: 1,
      text: 'Shorten the caption.',
      idempotencyKey: 'revise-draft-1',
    }));
    expect(revision).toMatchObject({ issueId: draft.id, revision: 1, reviewState: 'unapproved' });
    expect(revision.requestId).toMatch(/^[0-9a-f]{24}$/);
    expect(revision.jobId).toMatch(/^job:revise:/);
    const revisionAgain = readJson(await callTool('request_revision', {
      issueId: draft.id,
      revision: 1,
      text: 'A different request that must not be recorded.',
      idempotencyKey: 'revise-draft-1',
    }));
    expect(revisionAgain).toEqual(revision);

    const revised = await PivotCarouselDeck.findById(draft.id).lean();
    expect(revised.revisionRequests).toHaveLength(1);
    expect(revised.revisionRequests[0].requester).toBe(ownerId);
    expect(revised.revisionRequests[0].text).toBe('Shorten the caption.');
    expect(revised.feedbackNotes).toEqual([
      expect.objectContaining({ author: ownerId, text: 'Shorten the caption.', disposition: 'change' }),
    ]);
    const reviseJob = await PivotComputeJob.findOne({ externalJobId: revision.jobId }).lean();
    expect(reviseJob).toMatchObject({
      kind: 'carousel-revise',
      origin: { requestedBy: ownerId },
      options: { issueId: draft.id, revision: 1, requestId: revision.requestId },
    });

    const kept = await generated(sfAccountId, {
      name: 'Keep',
      theme: 'Keep this',
      rationale: 'The one to pick',
      caption: 'Keep.',
      optionSetId: 'job:compose:options',
      optionIndex: 0,
    });
    const sibling = await generated(sfAccountId, {
      name: 'Archive',
      theme: 'Archive this',
      rationale: 'The other option',
      caption: 'Archive.',
      optionSetId: 'job:compose:options',
      optionIndex: 1,
    });
    const picked = readJson(await callTool('pick_option', { issueId: kept.id, revision: 1 }));
    expect(picked).toMatchObject({ issueId: kept.id, revision: 1, picked: true, status: 'active' });
    expect((await PivotCarouselDeck.findById(sibling.id).lean()).status).toBe('archived');
    expect((await PivotCarouselDeck.findById(kept.id).lean()).optionPick.pickedBy).toBe(ownerId);

    const approved = readJson(await callTool('approve', { issueId: kept.id, revision: 1 }));
    expect(approved).toMatchObject({ issueId: kept.id, revision: 1, reviewState: 'approved', alreadyApproved: false });
    expect((await PivotCarouselDeck.findById(kept.id).lean()).approval.approvedBy).toBe(ownerId);

    const posted = readJson(await callTool('mark_posted', { issueId: kept.id, revision: 1 }));
    expect(posted).toMatchObject({ issueId: kept.id, revision: 1, reviewState: 'posted', alreadyPosted: false });
    expect((await PivotCarouselDeck.findById(kept.id).lean()).posting.postedBy).toBe(ownerId);

    const audits = await CarouselMcpAction.find({}).lean();
    expect(audits.map((row) => row.tool).sort()).toEqual([
      'approve',
      'mark_posted',
      'pick_option',
      'request_revision',
      'start_compose',
    ]);
    for (const row of audits) {
      expect(String(row.globalUserId)).toBe(ownerId);
      expect(row.tokenLabel).toBe('grokbot');
    }
  });

  it('does not keep a thrown error under an idempotency key, so a retry runs', async () => {
    const adminService = require('../../services/pivotComputeAdminService');
    const create = jest.spyOn(adminService, 'createAdminComputeJob')
      .mockRejectedValueOnce(new Error('connection reset'));
    const args = {
      accountKey: 'just.go.ic',
      publicationTime: '2026-11-08T18:00:00.000Z',
      idempotencyKey: 'compose-ic-retry',
    };
    try {
      const failed = await callTool('start_compose', args);
      expect(failed.isError).toBe(true);
      expect(failed.content[0].text).toMatch(/connection reset/);
      const { CarouselMcpAction, PivotComputeJob } = getGlobalModels(req, 'CarouselMcpAction', 'PivotComputeJob');
      expect(await CarouselMcpAction.countDocuments({ idempotencyKey: args.idempotencyKey })).toBe(0);

      const retried = readJson(await callTool('start_compose', args));
      expect(retried).toMatchObject({ accountKey: 'just.go.ic', status: 'pending', created: true });
      expect(await PivotComputeJob.countDocuments({ kind: 'carousel-compose' })).toBe(1);
      const stored = await CarouselMcpAction.findOne({ idempotencyKey: args.idempotencyKey }).lean();
      expect(stored).toMatchObject({ state: 'done', outcome: retried });
    } finally {
      create.mockRestore();
    }
  });

  it('runs one request_revision when two calls share a key', async () => {
    const { CarouselMcpAction, PivotCarouselDeck, PivotComputeJob } = getGlobalModels(
      req,
      'CarouselMcpAction',
      'PivotCarouselDeck',
      'PivotComputeJob',
    );
    const draft = await generated(sfAccountId, {
      name: 'Twice',
      theme: 'Twice',
      rationale: 'Sent twice at once',
      caption: 'Once only.',
    });
    const args = {
      issueId: draft.id,
      revision: 1,
      text: 'Shorten the caption.',
      idempotencyKey: 'revise-twice-1',
    };
    const results = await Promise.all([
      callTool('request_revision', args),
      callTool('request_revision', args),
    ]);

    const stored = await PivotCarouselDeck.findById(draft.id).lean();
    expect(stored.revisionRequests).toHaveLength(1);
    expect(stored.feedbackNotes).toHaveLength(1);
    expect(await PivotComputeJob.countDocuments({ kind: 'carousel-revise' })).toBe(1);
    const succeeded = results.filter((result) => !result.isError).map(readJson);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    for (const body of succeeded) expect(body.requestId).toBe(String(stored.revisionRequests[0]._id));
    for (const result of results.filter((entry) => entry.isError)) {
      expect(result.content[0].text).toMatch(/still running/);
    }
  });

  it('answers IN_PROGRESS while a key is claimed and does not act', async () => {
    const { CarouselMcpAction, PivotCarouselDeck, PivotComputeJob } = getGlobalModels(
      req,
      'CarouselMcpAction',
      'PivotCarouselDeck',
      'PivotComputeJob',
    );
    const draft = await generated(sfAccountId, {
      name: 'Claimed',
      theme: 'Claimed',
      rationale: 'Another call holds the key',
      caption: 'Wait.',
    });
    await CarouselMcpAction.create({
      globalUserId: req.user.globalUserId,
      tokenId: new mongoose.Types.ObjectId(),
      tokenLabel: 'grokbot',
      tool: 'request_revision',
      idempotencyKey: 'revise-claimed-1',
      state: 'pending',
    });

    const service = require('../../services/pivotCarouselMcpActionService');
    const answer = await service.requestRevision({
      globalDb: mongo.globalConnection,
      user: { globalUserId: req.user.globalUserId },
      platformAccessToken: { id: String(new mongoose.Types.ObjectId()), label: 'grokbot' },
    }, { issueId: draft.id, revision: 1, text: 'Shorten it.', idempotencyKey: 'revise-claimed-1' });
    expect(answer).toMatchObject({ status: 409, code: 'IN_PROGRESS', retryable: true });
    expect((await PivotCarouselDeck.findById(draft.id).lean()).revisionRequests).toHaveLength(0);
    expect(await PivotComputeJob.countDocuments({ kind: 'carousel-revise' })).toBe(0);
  });

  it('refuses a stale revision and returns service errors as tool errors', async () => {
    const draft = await generated(sfAccountId, {
      name: 'Stale',
      theme: 'Stale',
      rationale: 'Wrong revision',
      caption: 'Still unapproved.',
    });
    const stale = await callTool('request_revision', {
      issueId: draft.id,
      revision: 2,
      text: 'This revision is not current.',
      idempotencyKey: 'revise-stale',
    });
    expect(stale.isError).toBe(true);
    expect(stale.content[0].text).toMatch(/changed since it was opened/);
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    const stored = await PivotCarouselDeck.findById(draft.id).lean();
    expect(stored.revision).toBe(1);
    expect(stored.revisionRequests).toHaveLength(0);
    expect(stored.reviewState).toBe('unapproved');

    const notAnOption = await callTool('pick_option', { issueId: draft.id, revision: 1 });
    expect(notAnOption.isError).toBe(true);
    expect(notAnOption.content[0].text).toMatch(/Only a generated option can be picked/);

    const unknown = await callTool('start_compose', {
      accountKey: 'no.such.account',
      publicationTime: '2026-11-08T18:00:00.000Z',
      idempotencyKey: 'compose-missing',
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0].text).toMatch(/Unknown editorial account/);
  });
});
