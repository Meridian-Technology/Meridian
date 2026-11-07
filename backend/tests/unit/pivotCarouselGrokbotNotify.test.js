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
const { notifyCarouselJobEnded } = require('../../services/pivotCarouselGrokbotNotifyService');
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
    global.fetch = jest.fn(async (url, init) => {
      if (String(url) !== WEBHOOK) return { ok: false, status: 404 };
      if (webhookThrows) throw new Error('webhook down');
      const body = JSON.parse(init.body);
      if (webhookFailuresLeft > 0) {
        webhookFailuresLeft -= 1;
        return { ok: false, status: 503 };
      }
      posts.push({ body, method: init.method, contentType: init.headers['content-type'] });
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

  function notices(event) {
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
      expect(notices(decision)).toHaveLength(1);
      expectContentFree(notices(decision)[0], decision);
      expect(notices(decision)[0]).toMatchObject({ jobId: externalJobId, issues: [] });
      expect(posts.at(-1).method).toBe('POST');
      expect(posts.at(-1).contentType).toBe('application/json');

      await applyStoredComputeJob(req, externalJobId, { tenantKey: 'ic', actor: 'editor' });
      const stored = await findJobByExternalId(req, externalJobId);
      await notifyCarouselJobEnded(req, stored);
      expect(notices(decision)).toHaveLength(1);
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
    expect(notices('cannot-revise')).toEqual([{
      event: 'cannot-revise',
      accountKey: 'just.go.ic',
      jobId: cannot.job.externalJobId,
      issues: [{ issueId: cannot.issue.id, revision: 1 }],
    }]);
    expect(JSON.stringify(notices('cannot-revise'))).not.toMatch(/cover line|Before caption/);
    await applyStoredComputeJob(req, cannot.job.externalJobId, { tenantKey: 'ic', actor: 'editor' });
    expect(notices('cannot-revise')).toHaveLength(1);

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
    expect(notices('conflict')).toEqual([{
      event: 'conflict',
      accountKey: 'just.go.ic',
      jobId: conflict.job.externalJobId,
      issues: [{ issueId: conflict.issue.id, revision: 1 }],
    }]);
    expect(JSON.stringify(notices('conflict'))).not.toMatch(/Hand edited|Revised caption/);
    await applyStoredComputeJob(req, conflict.job.externalJobId, { tenantKey: 'ic', actor: 'editor' });
    expect(notices('conflict')).toHaveLength(1);
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
    expect(notices('preview-ready')).toEqual([{
      event: 'preview-ready',
      accountKey: 'just.go.ic',
      jobId: 'job:compose-preview-001',
      issues: [{ issueId: id, revision: 1 }],
    }]);
    expect(JSON.stringify(notices('preview-ready'))).not.toMatch(/caption|slide-01|s3/);

    await submitComputeJobResult(req, {
      externalJobId,
      workerId: 'export-worker',
      leaseToken: running.lease.token,
      result,
      requiresReview: false,
      now,
    });
    expect(notices('preview-ready')).toHaveLength(1);
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
    expect(notices('failure')).toEqual([{
      event: 'failure',
      accountKey: 'just.go.ic',
      jobId: externalJobId,
      issues: [],
    }]);
    expect(JSON.stringify(notices('failure'))).not.toMatch(/scraping|SITE_SCRAPE/);
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
    expect(notices('failure').some((body) => body.jobId === reviseId)).toBe(false);
    expect(logPivot).toHaveBeenCalledWith('warn', 'grokbot carousel webhook failed', expect.objectContaining({
      event: 'failure',
      jobId: reviseId,
    }));
    expect((await findJobByExternalId(req, reviseId)).status).toBe('failed');
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
});
