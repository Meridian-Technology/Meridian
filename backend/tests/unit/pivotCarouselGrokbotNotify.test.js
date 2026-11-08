const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../utilities/pivotLogger', () => {
  const actual = jest.requireActual('../../utilities/pivotLogger');
  return { ...actual, logPivot: jest.fn() };
});
jest.mock('../../services/imageUploadService', () => ({
  uploadImageToS3: jest.fn(async (_file, folder, name) => `https://assets.example/${folder}/${name}`),
}));

const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const getGlobalModels = require('../../services/getGlobalModelService');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const {
  createComputeJob,
  claimNextPendingJob,
  startComputeJob,
  submitComputeJobResult,
  findJobByExternalId,
} = require('../../services/pivotComputeJobStore');
const { fetchJobContext } = require('../../services/pivotComputeWorkerService');
const { applyStoredComputeJob } = require('../../services/pivotComputeResultApplyService');
const crypto = require('crypto');
const {
  notifyCarouselJobEnded,
  sendTestNotice,
  whenNoticesSettled,
  delivery,
  RETRY_DELAYS_MS,
} = require('../../services/pivotCarouselGrokbotNotifyService');
const { clearGrokbotSettingsCache } = require('../../services/grokbotIntegrationService');
const { createSecretBox } = require('../../utilities/aesGcmSecret');
const {
  createCarouselAccount,
  createGeneratedCarouselIssue,
  approveCarouselIssue,
  requestCarouselRevision,
  updateCarouselIssue,
} = require('../../services/pivotCarouselIssueService');
const { loadFixture, validateExecutionResult } = require('../../utilities/pivotAdminComputeJobContract');
const { logPivot } = require('../../utilities/pivotLogger');

jest.setTimeout(120000);

const WEBHOOK = 'http://127.0.0.1:9/grokbot-carousel';
const SAVED_WEBHOOK = 'https://grokbot.example.com/routines/r1/webhook';
const ROUTINE_KEY = 'routine-key-0001';
const PUBLICATION = '2026-10-12T23:00:00.000Z';
const SHA = 'a'.repeat(64);
const WINDOW = {
  from: PUBLICATION,
  to: '2026-10-26T23:00:00.000Z',
  toExclusive: false,
  timezone: 'America/Chicago',
  mode: 'upcoming',
  days: 14,
};
const composeCapability = {
  contractVersion: '1',
  implementationRevision: 'relay-worker@test',
  supportedContractVersions: ['1'],
  supportedKinds: ['carousel-compose'],
};
const reviseCapability = { ...composeCapability, supportedKinds: ['carousel-revise'] };
const exportCapability = { ...composeCapability, supportedKinds: ['carousel-export'] };

function eventDoc(name) {
  return {
    name,
    description: 'Catalog description',
    type: 'social',
    location: 'Catalog venue',
    start_time: new Date('2026-10-13T23:00:00Z'),
    end_time: new Date('2026-10-14T00:00:00Z'),
    hostingType: 'Org',
    hostingId: new mongoose.Types.ObjectId(),
    expectedAttendance: 30,
    status: 'not-applicable',
    visibility: 'public',
    image: 'https://example.test/poster.jpg',
    customFields: { pivot: { ingestStatus: 'published', batchWeek: '2026-W42', tags: ['music'] } },
  };
}

describe('grokbot carousel webhook notices', () => {
  let mongo;
  let req;
  let account;
  let dbs;
  let posts;
  let webhookFailuresLeft;
  let webhookThrows;
  let previousWebhook;
  let previousWake;

  beforeAll(async () => {
    previousWebhook = process.env.GROKBOT_CAROUSEL_WEBHOOK_URL;
    previousWake = process.env.PIVOT_COMPUTE_WAKE_URL;
    delete process.env.PIVOT_COMPUTE_WAKE_URL;
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'editor' } };
  });

  beforeEach(async () => {
    await mongo.reset();
    logPivot.mockClear();
    posts = [];
    webhookFailuresLeft = 0;
    webhookThrows = false;
    process.env.GROKBOT_CAROUSEL_WEBHOOK_URL = WEBHOOK;
    delete process.env.GROKBOT_CAROUSEL_WEBHOOK_SECRET;
    // Same number of attempts as production, without the 30 second wait.
    delivery.retryDelaysMs = RETRY_DELAYS_MS.map((delay) => (delay ? 1 : 0));
    clearGrokbotSettingsCache(req);
    global.fetch = jest.fn(async (url, init) => {
      if (String(url) !== WEBHOOK && String(url) !== SAVED_WEBHOOK) return { ok: false, status: 404 };
      if (webhookThrows) throw new Error('webhook down');
      const body = JSON.parse(init.body);
      if (webhookFailuresLeft > 0) {
        webhookFailuresLeft -= 1;
        return { ok: false, status: 503 };
      }
      posts.push({
        url: String(url),
        body,
        raw: init.body,
        method: init.method,
        contentType: init.headers['content-type'],
        signature: init.headers['x-meridian-signature'],
        authorization: init.headers.authorization,
      });
      return { ok: true, status: 204 };
    });
    dbs = new Map();
    connectToDatabase.mockReset();
    connectToDatabase.mockImplementation(async (key) => {
      if (!dbs.has(key)) dbs.set(key, mongo.connection.useDb(key, { useCache: true }));
      return dbs.get(key);
    });
    await ensurePivotComputeJobIndexes(req, { force: true });
    const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
    await TenantConfig.create({
      configKey: 'default',
      tenants: [{
        tenantKey: 'ic',
        subdomain: 'ic',
        name: 'Iowa City',
        tenantType: 'pivot',
        pivotDropTimezone: 'America/Chicago',
      }],
    });
    account = (await createCarouselAccount(req, {
      displayName: 'Just Go Curation Iowa City',
      handle: '@just.go.ic',
      ownerTenantKey: 'ic',
      sourceTenantKeys: ['ic'],
      defaultFormat: 'city-picks',
    })).data.account;
    const db = await connectToDatabase('ic');
    await getModels({ db }, 'Event').Event.create(['One', 'Two', 'Three'].map((name) => eventDoc(name)));
  });

  afterEach(async () => {
    await whenNoticesSettled();
    delivery.retryDelaysMs = RETRY_DELAYS_MS;
    delete process.env.GROKBOT_CAROUSEL_WEBHOOK_SECRET;
    if (dbs) {
      for (const db of dbs.values()) await db.dropDatabase();
    }
  });

  afterAll(async () => {
    if (previousWebhook === undefined) delete process.env.GROKBOT_CAROUSEL_WEBHOOK_URL;
    else process.env.GROKBOT_CAROUSEL_WEBHOOK_URL = previousWebhook;
    if (previousWake === undefined) delete process.env.PIVOT_COMPUTE_WAKE_URL;
    else process.env.PIVOT_COMPUTE_WAKE_URL = previousWake;
    if (mongo) await mongo.cleanup();
  });

  // Notices are posted in the background; read them once those posts are done.
  async function notices(event) {
    await whenNoticesSettled();
    return posts.filter((post) => post.body.event === event).map((post) => post.body);
  }

  function expectContentFree(body, event) {
    expect(Object.keys(body).sort()).toEqual(['accountKey', 'event', 'issues', 'jobId']);
    expect(body.event).toBe(event);
    expect(body.accountKey).toBe('just.go.ic');
    expect(JSON.stringify(body)).not.toMatch(/https?:|caption|headline|blurb|reason|theme/i);
    for (const issue of body.issues) {
      expect(Object.keys(issue).sort()).toEqual(['issueId', 'revision']);
    }
  }

  async function prepare(externalJobId, decision) {
    const now = new Date();
    const { job } = await createComputeJob(req, {
      externalJobId,
      kind: 'carousel-compose',
      cityKey: 'ic',
      contextVersion: 'ctx:compose.pending',
      createIdempotencyKey: `idem:${externalJobId}`,
      origin: { type: 'admin' },
      options: { editorialAccountKey: 'just.go.ic', proposedPublicationAt: PUBLICATION },
    });
    const claim = await claimNextPendingJob(req, {
      externalJobId,
      workerId: 'compose-worker',
      capability: composeCapability,
      now,
    });
    const { context } = await fetchJobContext(req, {
      externalJobId,
      workerId: 'compose-worker',
      leaseToken: claim.job.lease.token,
      now,
    });
    await startComputeJob(req, {
      externalJobId,
      workerId: 'compose-worker',
      leaseToken: claim.job.lease.token,
      now,
    });
    const result = loadFixture('result-compose-valid.json');
    result.jobId = job.externalJobId;
    result.cityKey = 'ic';
    result.editorialAccountKey = 'just.go.ic';
    result.basedOnContextVersion = context.contextVersion;
    result.idempotencyKey = `idem:result:${externalJobId}`;
    if (decision === 'compose') {
      const selected = context.candidates.slice(0, 3).map((candidate) => candidate.ref);
      result.composition.selectedEventRefs = selected;
      result.composition.cover.assetRef = { kind: 'event-poster', eventRef: selected[0] };
      result.composition.eventSlides = selected.map((ref, index) => ({
        eventRef: ref,
        blurb: `Authored blurb ${index}`,
        presetId: ['photo-note', 'on-the-bill', 'in-the-room'][index],
        assetRef: { kind: 'event-poster', eventRef: ref },
        crop: { focalX: 0.4, focalY: 0.6, scale: 1.2 },
      }));
    } else {
      result.decision = decision;
      delete result.composition;
      result.reason = 'The available catalog does not support a coherent issue.';
    }
    expect(validateExecutionResult(result)).toEqual({ valid: true });
    await submitComputeJobResult(req, {
      externalJobId,
      workerId: 'compose-worker',
      leaseToken: claim.job.lease.token,
      result,
      requiresReview: false,
      now,
    });
    return { result, now };
  }

  async function queueRevision() {
    const { Event } = getModels({ db: await connectToDatabase('ic') }, 'Event');
    const [event] = await Event.find().sort({ name: 1 });
    const created = await createGeneratedCarouselIssue(req, account.id, {
      name: 'Draft',
      socialCaption: 'Before caption',
    }, {
      composition: { socialCaption: 'Before caption' },
      contextWindow: WINDOW,
      agentRevision: 1,
    });
    const issue = created.data.issue;
    expect((await approveCarouselIssue(req, account.id, issue.id, { revision: 1 })).error).toBeUndefined();
    const requested = await requestCarouselRevision(req, account.id, issue.id, {
      revision: 1,
      text: 'Swap the cover line.',
    });
    expect(requested.error).toBeUndefined();
    const job = requested.data.job;
    const now = new Date();
    const claim = await claimNextPendingJob(req, {
      externalJobId: job.externalJobId,
      workerId: 'revise-worker',
      capability: reviseCapability,
      now,
    });
    const { context } = await fetchJobContext(req, {
      externalJobId: job.externalJobId,
      workerId: 'revise-worker',
      leaseToken: claim.job.lease.token,
      now,
    });
    await startComputeJob(req, {
      externalJobId: job.externalJobId,
      workerId: 'revise-worker',
      leaseToken: claim.job.lease.token,
      now,
    });
    return { issue, job, context, now };
  }

  function reviseResult(job, context, decision) {
    const result = loadFixture('result-compose-valid.json');
    delete result.editorialAccountKey;
    Object.assign(result, {
      kind: 'carousel-revise',
      decision,
      jobId: job.externalJobId,
      cityKey: job.cityKey,
      basedOnContextVersion: context.contextVersion,
      issueId: job.options.issueId,
      requestId: job.options.requestId,
      idempotencyKey: `idem:revise:${job.options.requestId}`,
    });
    if (decision === 'revise') {
      const selected = context.candidates.slice(0, 3).map((candidate) => candidate.ref);
      result.composition.socialCaption = 'Revised caption';
      result.composition.cover.headline = 'Revised headline';
      result.composition.selectedEventRefs = selected;
      result.composition.cover.assetRef = { kind: 'event-poster', eventRef: selected[0] };
      result.composition.eventSlides = selected.map((ref, index) => ({
        eventRef: ref,
        blurb: `Revised blurb ${index}`,
        presetId: ['photo-note', 'on-the-bill', 'in-the-room'][index],
        assetRef: { kind: 'event-poster', eventRef: ref },
        crop: { focalX: 0.4, focalY: 0.6, scale: 1.2 },
      }));
    } else {
      delete result.composition;
      result.reason = 'The cover line is already what they asked for.';
    }
    expect(validateExecutionResult(result)).toEqual({ valid: true });
    return result;
  }

  it('notifies each no-draft ending once, with no content', async () => {
    for (const decision of ['wait', 'needs-editor']) {
      const externalJobId = `job:compose-${decision}`;
      await prepare(externalJobId, decision);
      const applied = await applyStoredComputeJob(req, externalJobId, { tenantKey: 'ic', actor: 'editor' });
      expect(applied.job.status).toBe('completed');
      expect(await notices(decision)).toHaveLength(1);
      expectContentFree((await notices(decision))[0], decision);
      expect((await notices(decision))[0]).toMatchObject({ jobId: externalJobId, issues: [] });
      expect(posts.at(-1).method).toBe('POST');
      expect(posts.at(-1).contentType).toBe('application/json');

      await applyStoredComputeJob(req, externalJobId, { tenantKey: 'ic', actor: 'editor' });
      const stored = await findJobByExternalId(req, externalJobId);
      await notifyCarouselJobEnded(req, stored);
      expect(await notices(decision)).toHaveLength(1);
    }

    const cannot = await queueRevision();
    await submitComputeJobResult(req, {
      externalJobId: cannot.job.externalJobId,
      workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, cannot.job.externalJobId)).lease.token,
      result: reviseResult(cannot.job, cannot.context, 'cannot-revise'),
      requiresReview: false,
      now: cannot.now,
    });
    await applyStoredComputeJob(req, cannot.job.externalJobId, { tenantKey: 'ic', actor: 'editor' });
    expect(await notices('cannot-revise')).toEqual([{
      event: 'cannot-revise',
      accountKey: 'just.go.ic',
      jobId: cannot.job.externalJobId,
      issues: [{ issueId: cannot.issue.id, revision: 1 }],
    }]);
    expect(JSON.stringify(await notices('cannot-revise'))).not.toMatch(/cover line|Before caption/);
    await applyStoredComputeJob(req, cannot.job.externalJobId, { tenantKey: 'ic', actor: 'editor' });
    expect(await notices('cannot-revise')).toHaveLength(1);

    const conflict = await queueRevision();
    await submitComputeJobResult(req, {
      externalJobId: conflict.job.externalJobId,
      workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, conflict.job.externalJobId)).lease.token,
      result: reviseResult(conflict.job, conflict.context, 'revise'),
      requiresReview: false,
      now: conflict.now,
    });
    await updateCarouselIssue(req, account.id, conflict.issue.id, {
      revision: 1,
      socialCaption: 'Hand edited caption',
    });
    await applyStoredComputeJob(req, conflict.job.externalJobId, { tenantKey: 'ic', actor: 'editor' });
    expect(await notices('conflict')).toEqual([{
      event: 'conflict',
      accountKey: 'just.go.ic',
      jobId: conflict.job.externalJobId,
      issues: [{ issueId: conflict.issue.id, revision: 1 }],
    }]);
    expect(JSON.stringify(await notices('conflict'))).not.toMatch(/Hand edited|Revised caption/);
    await applyStoredComputeJob(req, conflict.job.externalJobId, { tenantKey: 'ic', actor: 'editor' });
    expect(await notices('conflict')).toHaveLength(1);
  });

  it('notifies when an agent-written preview becomes ready, and not twice', async () => {
    const issueId = new mongoose.Types.ObjectId();
    const created = await createGeneratedCarouselIssue(req, account.id, {
      name: 'Preview',
      socialCaption: 'A caption that must stay out of the notice.',
    }, {
      issueId,
      composeJobId: 'job:compose-preview-001',
      composition: { socialCaption: 'A caption that must stay out of the notice.' },
      contextWindow: WINDOW,
      agentRevision: 1,
    });
    expect(created.error).toBeUndefined();
    const id = String(issueId);
    const externalJobId = `job:export:${id}:r1`;
    const now = new Date('2026-11-06T20:00:00.000Z');
    await createComputeJob(req, {
      externalJobId,
      kind: 'carousel-export',
      cityKey: 'ic',
      contextVersion: 'ctx:carousel.pending',
      createIdempotencyKey: `export:${id}:r1`,
      requestedAt: now.toISOString(),
      origin: { type: 'admin' },
      options: { deckId: id, deckRevision: '2026-11-06T19:00:00.000Z' },
    });
    const claim = await claimNextPendingJob(req, {
      externalJobId,
      workerId: 'export-worker',
      capability: exportCapability,
      now,
    });
    await startComputeJob(req, {
      externalJobId,
      workerId: 'export-worker',
      leaseToken: claim.job.lease.token,
      now,
    });
    const running = await findJobByExternalId(req, externalJobId);
    const artifact = {
      logicalName: 'slide-01.png',
      artifactId: 'artifact:slide-01',
      mimeType: 'image/png',
      byteCount: 1000,
      sha256: SHA,
      slideNumber: 1,
    };
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne({ externalJobId }, {
      $set: {
        exportArtifacts: {
          attemptId: running.lease.attemptId,
          attemptNumber: 1,
          prefix: `pivot-exports/ic/${externalJobId}/1/`,
          grantId: 'grant:preview-001',
          finalizedAt: now,
          expiresAt: new Date('2026-11-20T20:00:00.000Z'),
          expired: false,
          artifacts: [{ ...artifact, objectKey: `pivot-exports/ic/${externalJobId}/1/slide-01.png` }],
        },
      },
    });
    const result = {
      contractVersion: '1',
      jobId: externalJobId,
      scheduleOccurrenceId: null,
      kind: 'carousel-export',
      tenantKey: 'ic',
      cityKey: 'ic',
      deckId: id,
      attemptId: String(running.lease.attemptId),
      implementationRevision: 'relay-worker@test',
      basedOnContextVersion: 'ctx:carousel.pending',
      completedAt: '2026-11-06T20:10:00.000Z',
      outcome: 'completed',
      idempotencyKey: `idem:export:${id}`,
      renderedDeckRevision: '2026-11-06T19:00:00.000Z',
      slideCount: 1,
      renderDurationMs: 10,
      artifacts: [artifact],
      warnings: [],
    };
    expect(validateExecutionResult(result).valid).toBe(true);
    const submitted = await submitComputeJobResult(req, {
      externalJobId,
      workerId: 'export-worker',
      leaseToken: running.lease.token,
      result,
      requiresReview: false,
      now,
    });
    expect(submitted.status).toBe('completed');
    expect(await notices('preview-ready')).toEqual([{
      event: 'preview-ready',
      accountKey: 'just.go.ic',
      jobId: 'job:compose-preview-001',
      issues: [{ issueId: id, revision: 1 }],
    }]);
    expect(JSON.stringify(await notices('preview-ready'))).not.toMatch(/caption|slide-01|s3/);

    await submitComputeJobResult(req, {
      externalJobId,
      workerId: 'export-worker',
      leaseToken: running.lease.token,
      result,
      requiresReview: false,
      now,
    });
    expect(await notices('preview-ready')).toHaveLength(1);
  });

  it('notifies a failed compose or revise job and retries the post without failing the job', async () => {
    webhookFailuresLeft = 2;
    const now = new Date();
    const externalJobId = 'job:compose-failed';
    await createComputeJob(req, {
      externalJobId,
      kind: 'carousel-compose',
      cityKey: 'ic',
      contextVersion: 'ctx:compose.pending',
      createIdempotencyKey: 'idem:compose-failed',
      origin: { type: 'admin' },
      options: { editorialAccountKey: 'just.go.ic', proposedPublicationAt: PUBLICATION },
    });
    const claim = await claimNextPendingJob(req, {
      externalJobId,
      workerId: 'compose-worker',
      capability: composeCapability,
      now,
    });
    await startComputeJob(req, {
      externalJobId,
      workerId: 'compose-worker',
      leaseToken: claim.job.lease.token,
      now,
    });
    const failed = loadFixture('result-discovery-failed.json');
    Object.assign(failed, {
      jobId: externalJobId,
      cityKey: 'ic',
      basedOnContextVersion: 'ctx:compose.pending',
      idempotencyKey: 'idem:compose-failed-result',
    });
    const submitted = await submitComputeJobResult(req, {
      externalJobId,
      workerId: 'compose-worker',
      leaseToken: claim.job.lease.token,
      result: failed,
      retryable: false,
      requiresReview: false,
      now,
    });
    expect(submitted.status).toBe('failed');
    expect(await notices('failure')).toEqual([{
      event: 'failure',
      accountKey: 'just.go.ic',
      jobId: externalJobId,
      issues: [],
    }]);
    expect(JSON.stringify(await notices('failure'))).not.toMatch(/scraping|SITE_SCRAPE/);
    expect(global.fetch.mock.calls.filter((call) => call[0] === WEBHOOK)).toHaveLength(3);

    const issue = (await createGeneratedCarouselIssue(req, account.id, {
      name: 'Stuck',
      socialCaption: 'Still a draft.',
    }, {
      composition: { socialCaption: 'Still a draft.' },
      contextWindow: WINDOW,
      agentRevision: 1,
    })).data.issue;
    const reviseId = `job:revise:${issue.id}:failed01`;
    await createComputeJob(req, {
      externalJobId: reviseId,
      kind: 'carousel-revise',
      cityKey: 'ic',
      contextVersion: 'ctx:revise.pending',
      createIdempotencyKey: `idem:${reviseId}`,
      origin: { type: 'admin' },
      options: { issueId: issue.id, revision: 1, requestId: 'a'.repeat(24) },
    });
    const reviseClaim = await claimNextPendingJob(req, {
      externalJobId: reviseId,
      workerId: 'revise-worker',
      capability: reviseCapability,
      now,
    });
    await startComputeJob(req, {
      externalJobId: reviseId,
      workerId: 'revise-worker',
      leaseToken: reviseClaim.job.lease.token,
      now,
    });
    webhookThrows = true;
    const reviseFailed = { ...failed, jobId: reviseId, idempotencyKey: 'idem:revise-failed-result' };
    await expect(submitComputeJobResult(req, {
      externalJobId: reviseId,
      workerId: 'revise-worker',
      leaseToken: reviseClaim.job.lease.token,
      result: reviseFailed,
      retryable: false,
      requiresReview: false,
      now,
    })).resolves.toMatchObject({ status: 'failed' });
    expect((await notices('failure')).some((body) => body.jobId === reviseId)).toBe(false);
    expect(logPivot).toHaveBeenCalledWith('warn', 'grokbot carousel webhook failed', expect.objectContaining({
      event: 'failure',
      jobId: reviseId,
    }));
    expect((await findJobByExternalId(req, reviseId)).status).toBe('failed');
  });

  async function failCompose(externalJobId) {
    const now = new Date();
    await createComputeJob(req, {
      externalJobId,
      kind: 'carousel-compose',
      cityKey: 'ic',
      contextVersion: 'ctx:compose.pending',
      createIdempotencyKey: `idem:${externalJobId}`,
      origin: { type: 'admin' },
      options: { editorialAccountKey: 'just.go.ic', proposedPublicationAt: PUBLICATION },
    });
    const claim = await claimNextPendingJob(req, {
      externalJobId,
      workerId: 'compose-worker',
      capability: composeCapability,
      now,
    });
    await startComputeJob(req, {
      externalJobId,
      workerId: 'compose-worker',
      leaseToken: claim.job.lease.token,
      now,
    });
    const failed = loadFixture('result-discovery-failed.json');
    Object.assign(failed, {
      jobId: externalJobId,
      cityKey: 'ic',
      basedOnContextVersion: 'ctx:compose.pending',
      idempotencyKey: `idem:result:${externalJobId}`,
    });
    return submitComputeJobResult(req, {
      externalJobId,
      workerId: 'compose-worker',
      leaseToken: claim.job.lease.token,
      result: failed,
      retryable: false,
      requiresReview: false,
      now,
    });
  }

  async function makeCatalogIneligible() {
    const { Event } = getModels({ db: await connectToDatabase('ic') }, 'Event');
    await Event.updateMany({}, { $set: { 'customFields.pivot.ingestStatus': 'draft' } });
  }

  it('spreads delivery attempts over about thirty seconds', () => {
    const total = RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);
    expect(RETRY_DELAYS_MS[0]).toBe(0);
    expect(RETRY_DELAYS_MS).toEqual([...RETRY_DELAYS_MS].sort((a, b) => a - b));
    expect(total).toBeGreaterThanOrEqual(25000);
    expect(total).toBeLessThanOrEqual(35000);
  });

  it('posts in the background, so neither apply nor a failed submission waits on the webhook', async () => {
    let open;
    const gate = new Promise((resolve) => { open = resolve; });
    const answer = global.fetch.getMockImplementation();
    global.fetch.mockImplementation(async (url, init) => {
      if (String(url) === WEBHOOK) await gate;
      return answer(url, init);
    });
    const blocked = Symbol('blocked');
    const within = (promise) => Promise.race([
      promise,
      new Promise((resolve) => { setTimeout(() => resolve(blocked), 1000); }),
    ]);

    await prepare('job:compose-slow-webhook', 'wait');
    const applied = await within(applyStoredComputeJob(req, 'job:compose-slow-webhook', { tenantKey: 'ic', actor: 'editor' }));
    expect(applied).not.toBe(blocked);
    expect(applied.job.status).toBe('completed');

    const submitted = await within(failCompose('job:compose-slow-failure'));
    expect(submitted).not.toBe(blocked);
    expect(submitted.status).toBe('failed');

    expect(posts).toEqual([]);
    open();
    expect((await notices('wait')).map((body) => body.jobId)).toEqual(['job:compose-slow-webhook']);
    expect((await notices('failure')).map((body) => body.jobId)).toEqual(['job:compose-slow-failure']);
  });

  it('releases a notice no attempt delivered, so a later trigger sends it', async () => {
    const externalJobId = 'job:compose-unreached';
    webhookThrows = true;
    expect((await failCompose(externalJobId)).status).toBe('failed');
    await whenNoticesSettled();
    expect(global.fetch.mock.calls.filter((call) => call[0] === WEBHOOK)).toHaveLength(RETRY_DELAYS_MS.length);
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    expect((await PivotComputeJob.findOne({ externalJobId }).lean()).notifications.grokbot).toEqual([]);

    webhookThrows = false;
    await notifyCarouselJobEnded(req, await findJobByExternalId(req, externalJobId));
    expect(await notices('failure')).toEqual([{
      event: 'failure',
      accountKey: 'just.go.ic',
      jobId: externalJobId,
      issues: [],
    }]);
    await notifyCarouselJobEnded(req, await findJobByExternalId(req, externalJobId));
    expect(await notices('failure')).toHaveLength(1);
  });

  it('sends a failure notice when a compose or revise result is rejected at apply', async () => {
    await prepare('job:compose-rejected', 'compose');
    const revise = await queueRevision();
    await submitComputeJobResult(req, {
      externalJobId: revise.job.externalJobId,
      workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, revise.job.externalJobId)).lease.token,
      result: reviseResult(revise.job, revise.context, 'revise'),
      requiresReview: false,
      now: revise.now,
    });
    await makeCatalogIneligible();

    await expect(applyStoredComputeJob(req, 'job:compose-rejected', { tenantKey: 'ic', actor: 'editor' }))
      .rejects.toMatchObject({ code: expect.stringMatching(/^COMPOSE_/) });
    await expect(applyStoredComputeJob(req, revise.job.externalJobId, { tenantKey: 'ic', actor: 'editor' }))
      .rejects.toMatchObject({ code: expect.stringMatching(/^COMPOSE_/) });
    expect((await findJobByExternalId(req, 'job:compose-rejected')).status).toBe('review-required');

    const failures = await notices('failure');
    expect(failures).toEqual([
      { event: 'failure', accountKey: 'just.go.ic', jobId: 'job:compose-rejected', issues: [] },
      {
        event: 'failure',
        accountKey: 'just.go.ic',
        jobId: revise.job.externalJobId,
        issues: [{ issueId: revise.issue.id, revision: 1 }],
      },
    ]);
    for (const body of failures) expectContentFree(body, 'failure');
  });

  it('signs a notice with the shared secret when one is set', async () => {
    await prepare('job:compose-unsigned', 'wait');
    await applyStoredComputeJob(req, 'job:compose-unsigned', { tenantKey: 'ic', actor: 'editor' });
    await whenNoticesSettled();
    expect(posts.find((post) => post.body.jobId === 'job:compose-unsigned').signature).toBeUndefined();

    process.env.GROKBOT_CAROUSEL_WEBHOOK_SECRET = 'grokbot-shared-secret';
    await prepare('job:compose-signed', 'needs-editor');
    await applyStoredComputeJob(req, 'job:compose-signed', { tenantKey: 'ic', actor: 'editor' });
    await whenNoticesSettled();
    const signed = posts.find((post) => post.body.jobId === 'job:compose-signed');
    const expected = crypto.createHmac('sha256', 'grokbot-shared-secret').update(signed.raw).digest('hex');
    expect(signed.signature).toBe(`sha256=${expected}`);
  });

  it('does not post when the webhook url is unset', async () => {
    delete process.env.GROKBOT_CAROUSEL_WEBHOOK_URL;
    await prepare('job:compose-unset', 'wait');
    const applied = await applyStoredComputeJob(req, 'job:compose-unset', { tenantKey: 'ic', actor: 'editor' });
    expect(applied.job.status).toBe('completed');
    expect(applied.job.composeOutcome.decision).toBe('wait');
    expect(posts).toEqual([]);
    expect(global.fetch.mock.calls.some((call) => String(call[0]).includes('grokbot'))).toBe(false);
  });

  // Platform Admin → Integrations writes this record; tests write it directly.
  async function saveSettings({ webhookUrl = SAVED_WEBHOOK, webhookKey = ROUTINE_KEY, enabled = true } = {}) {
    const { PlatformIntegrationSetting } = getGlobalModels(req, 'PlatformIntegrationSetting');
    const box = createSecretBox(['INTEGRATION_ENCRYPTION_KEY', 'JWT_SECRET']);
    await PlatformIntegrationSetting.findOneAndUpdate(
      { key: 'grokbot' },
      {
        $set: {
          webhookUrl,
          webhookKey: webhookKey ? box.encryptSecret(webhookKey) : null,
          enabled,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    clearGrokbotSettingsCache(req);
  }

  async function deliveries() {
    await whenNoticesSettled();
    const { PlatformIntegrationSetting } = getGlobalModels(req, 'PlatformIntegrationSetting');
    const record = await PlatformIntegrationSetting.findOne({ key: 'grokbot' }).lean();
    return (record?.deliveries || []).map(({ at, ...rest }) => {
      expect(at).toBeInstanceOf(Date);
      return rest;
    });
  }

  it('sends the saved routine key as a bearer token to the saved URL, over the env URL', async () => {
    await saveSettings();
    process.env.GROKBOT_CAROUSEL_WEBHOOK_SECRET = 'grokbot-shared-secret';
    await prepare('job:compose-bearer', 'wait');
    await applyStoredComputeJob(req, 'job:compose-bearer', { tenantKey: 'ic', actor: 'editor' });
    await whenNoticesSettled();

    expect(posts).toHaveLength(1);
    const [post] = posts;
    expect(post.url).toBe(SAVED_WEBHOOK);
    expect(post.authorization).toBe(`Bearer ${ROUTINE_KEY}`);
    expect(post.body).toEqual({ event: 'wait', accountKey: 'just.go.ic', jobId: 'job:compose-bearer', issues: [] });
    const expected = crypto.createHmac('sha256', 'grokbot-shared-secret').update(post.raw).digest('hex');
    expect(post.signature).toBe(`sha256=${expected}`);
    expect(global.fetch.mock.calls.some((call) => call[0] === WEBHOOK)).toBe(false);
  });

  it('sends no bearer header from the env fallback, which has no key', async () => {
    await prepare('job:compose-env', 'wait');
    await applyStoredComputeJob(req, 'job:compose-env', { tenantKey: 'ic', actor: 'editor' });
    await whenNoticesSettled();
    expect(posts.map((post) => [post.url, post.authorization])).toEqual([[WEBHOOK, undefined]]);
  });

  it('sends nothing while the saved setting is disabled, even with the env URL set', async () => {
    await saveSettings({ enabled: false });
    await prepare('job:compose-disabled', 'wait');
    const applied = await applyStoredComputeJob(req, 'job:compose-disabled', { tenantKey: 'ic', actor: 'editor' });
    expect(applied.job.status).toBe('completed');
    await whenNoticesSettled();
    expect(posts).toEqual([]);
    expect(global.fetch.mock.calls.some((call) => [WEBHOOK, SAVED_WEBHOOK].includes(call[0]))).toBe(false);
    expect(await deliveries()).toEqual([]);
  });

  it('records every attempt, without body content, in the delivery list', async () => {
    await saveSettings();
    webhookFailuresLeft = 2;
    await prepare('job:compose-recorded', 'needs-editor');
    await applyStoredComputeJob(req, 'job:compose-recorded', { tenantKey: 'ic', actor: 'editor' });

    const rows = await deliveries();
    expect(rows).toEqual([1, 2, 3].map((attempt) => ({
      event: 'needs-editor',
      jobId: 'job:compose-recorded',
      attempt,
      status: attempt < 3 ? 503 : 204,
      error: attempt < 3 ? 'Webhook returned 503' : null,
    })));

    webhookThrows = true;
    expect((await failCompose('job:compose-recorded-down')).status).toBe('failed');
    const failed = (await deliveries()).filter((row) => row.jobId === 'job:compose-recorded-down');
    expect(failed).toHaveLength(RETRY_DELAYS_MS.length);
    expect(failed.every((row) => row.status === null && row.error === 'webhook down')).toBe(true);
    expect(JSON.stringify(await deliveries())).not.toMatch(/accountKey|issues|caption|reason/);
  });

  it('records env-only deliveries and keeps using the env URL', async () => {
    await prepare('job:compose-env-recorded', 'wait');
    await applyStoredComputeJob(req, 'job:compose-env-recorded', { tenantKey: 'ic', actor: 'editor' });
    expect(await deliveries()).toEqual([
      { event: 'wait', jobId: 'job:compose-env-recorded', attempt: 1, status: 204, error: null },
    ]);
    clearGrokbotSettingsCache(req);
    await prepare('job:compose-env-again', 'wait');
    await applyStoredComputeJob(req, 'job:compose-env-again', { tenantKey: 'ic', actor: 'editor' });
    await whenNoticesSettled();
    expect(posts.map((post) => post.url)).toEqual([WEBHOOK, WEBHOOK]);
  });

  it('keeps only the last 20 delivery attempts', async () => {
    await saveSettings();
    for (let index = 0; index < 22; index += 1) {
      await sendTestNotice(req);
    }
    const rows = await deliveries();
    expect(rows).toHaveLength(20);
  });

  it('sends a test notice with the saved key, even when disabled, and records it', async () => {
    await saveSettings({ enabled: false });
    const result = await sendTestNotice(req);
    expect(result).toEqual({ data: { ok: true, status: 204, error: null } });
    expect(posts).toEqual([expect.objectContaining({
      url: SAVED_WEBHOOK,
      body: { event: 'test' },
      authorization: `Bearer ${ROUTINE_KEY}`,
    })]);
    expect(await deliveries()).toEqual([{ event: 'test', jobId: null, attempt: 1, status: 204, error: null }]);

    webhookFailuresLeft = 1;
    expect((await sendTestNotice(req)).data).toEqual({ ok: false, status: 503, error: 'Webhook returned 503' });

    await saveSettings({ webhookUrl: null });
    delete process.env.GROKBOT_CAROUSEL_WEBHOOK_URL;
    expect(await sendTestNotice(req)).toMatchObject({ status: 400, code: 'WEBHOOK_URL_UNSET' });
  });
});
