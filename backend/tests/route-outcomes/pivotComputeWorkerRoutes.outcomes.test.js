const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { createComputeJob } = require('../../services/pivotComputeJobStore');
const { createWorkerCredentialVerifier } = require('../../services/pivotComputeWorkerAuth');
const { createPivotComputeWorkerRouter, WORKER_ID_HEADER } = require('../../routes/pivotComputeWorkerRoutes');
const { loadFixture } = require('../../utilities/pivotAdminComputeJobContract');

jest.mock('../../services/pivotOffloadedDiscoveryContextService', () => ({
  buildCityDiscoveryContextSnapshot: jest.fn(),
}));

jest.mock('../../services/pivotOffloadedCurationRefreshContextService', () => ({
  buildCityCurationRefreshContextSnapshot: jest.fn(),
}));

jest.mock('../../services/pivotCarouselComputeContextService', () => ({
  buildCarouselExportContextSnapshot: jest.fn(),
}));

const { buildCityDiscoveryContextSnapshot } = require('../../services/pivotOffloadedDiscoveryContextService');
const { buildCarouselExportContextSnapshot } = require('../../services/pivotCarouselComputeContextService');

const WORKER_ID = 'relay-mini-1';
const WORKER_SECRET = 'test-worker-secret';
const FIXED_NOW = new Date('2026-09-08T20:05:00.000Z');

function workerCapability(overrides = {}) {
  return {
    ...loadFixture('worker-capability-valid.json'),
    workerId: WORKER_ID,
    ...overrides,
  };
}

function workerAuth(requestBuilder) {
  return requestBuilder
    .set('Authorization', `Bearer ${WORKER_SECRET}`)
    .set(WORKER_ID_HEADER, WORKER_ID);
}

function discoveryContextSnapshot(jobId, cityKey = 'iowacity') {
  return {
    contractVersion: '1',
    jobId,
    scheduleOccurrenceId: null,
    kind: 'city-source-discovery',
    cityKey,
    implementationRevision: 'relay-worker@test',
    contextVersion: `ctx:${cityKey}.discovery.worker-test`,
    snapshotAt: FIXED_NOW.toISOString(),
    tenant: { cityKey, name: 'Iowa City', location: 'Iowa City', timezone: 'America/Chicago' },
    discovery: { flow: 'native-then-firecrawl', lumaSlug: null, partifulSlug: null, runNative: true, runFirecrawl: true },
    sources: [],
    curationJobs: [],
    organizers: [],
    providerCapabilities: { firecrawlConfigured: false, nativeProviders: ['luma', 'partiful'] },
  };
}

describe('pivotComputeWorkerRoutes outcomes', () => {
  let mongo;
  let app;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
    await ensurePivotComputeJobIndexes(req, { force: true });

    const secretHash = bcrypt.hashSync(WORKER_SECRET, 4);
    const verifyWorkerCredential = createWorkerCredentialVerifier([
      { workerId: WORKER_ID, secretHash },
    ]);

    app = express();
    app.use((incomingReq, _res, next) => {
      incomingReq.globalDb = mongo.globalConnection;
      next();
    });
    app.use('/worker/pivot/compute/v1', createPivotComputeWorkerRouter({
      verifyWorkerCredential,
      now: () => FIXED_NOW,
    }));
  });

  afterEach(async () => {
    await mongo.reset();
    await ensurePivotComputeJobIndexes(req, { force: true });
    buildCityDiscoveryContextSnapshot.mockReset();
    buildCityDiscoveryContextSnapshot.mockResolvedValue({
      data: { snapshot: discoveryContextSnapshot('job:placeholder') },
    });
    buildCarouselExportContextSnapshot.mockReset();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('rejects unauthenticated worker requests', async () => {
    const response = await request(app)
      .post('/worker/pivot/compute/v1/jobs/claim')
      .send({ kind: 'city-source-discovery', capability: workerCapability() });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('COMPUTE_WORKER_AUTH_REQUIRED');
  });

  it('authenticates read-only compose scheduling metadata and returns no credentials', async () => {
    const route = '/worker/pivot/compute/v1/carousel-compose-accounts';
    expect((await request(app).get(route)).status).toBe(401);
    const response = await workerAuth(request(app).get(route));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accounts: [
      { key: 'just.go.ic', cityKey: 'iowacity', timezone: 'America/Chicago' },
      { key: 'just.go.sf', cityKey: 'sf', timezone: 'America/Los_Angeles' },
      { key: 'sorry.u.missed.it', cityKey: null, timezone: null },
    ] });
    expect(JSON.stringify(response.body)).not.toContain(WORKER_SECRET);
  });

  it('registers and leases a schedule occurrence before returning its context', async () => {
    const occurrenceId = 'sched:discovery-iowacity@2026-09-08T12:00:00.000Z';
    buildCityDiscoveryContextSnapshot.mockImplementation(async (_req, options) => {
      expect(options.authorize).toEqual(expect.any(Function));
      expect(options.jobId).toBe('job:scheduled-discovery-001');
      expect(options.tags).toEqual(['live-music']);
      expect(options.discoveryOverrides).toMatchObject({
        flow: 'native-only',
        lumaSlug: 'iowa-city',
      });
      return {
        data: {
          snapshot: discoveryContextSnapshot('job:scheduled-discovery-001'),
        },
      };
    });

    const response = await workerAuth(request(app)
      .post('/worker/pivot/compute/v1/schedule-occurrences'))
      .send({
        jobId: 'job:scheduled-discovery-001',
        scheduleOccurrenceId: occurrenceId,
        scheduleId: 'discovery-iowacity',
        kind: 'city-source-discovery',
        cityKey: 'iowacity',
        contractVersion: '1',
        idempotencyKey: 'idem:scheduled-discovery-001',
        options: {
          tags: ['live-music'],
          flow: 'native-only',
          lumaSlug: 'iowa-city',
        },
        capability: workerCapability(),
      });

    expect(response.status).toBe(201);
    expect(response.body.created).toBe(true);
    expect(response.body.job.status).toBe('leased');
    expect(response.body.lease.leaseToken).toBeTruthy();
    expect(response.body.lease.workerId).toBe(WORKER_ID);
    expect(response.body.job.contextVersion).toBe('ctx:iowacity.discovery.worker-test');
    expect(response.body.context.contextVersion).toBe('ctx:iowacity.discovery.worker-test');
    expect(buildCityDiscoveryContextSnapshot).toHaveBeenCalled();
  });

  it('claims, starts, heartbeats, observes cancellation, and submits a terminal result idempotently', async () => {
    await createComputeJob(req, {
      externalJobId: 'job:discovery-claim-001',
      kind: 'city-source-discovery',
      cityKey: 'iowacity',
      contractVersion: '1',
      contextVersion: 'ctx:iowacity.discovery.v1',
      createIdempotencyKey: 'idem:discovery-claim-001',
      requestedAt: FIXED_NOW.toISOString(),
      origin: { type: 'admin' },
      options: {},
    });

    const claim = await workerAuth(request(app)
      .post('/worker/pivot/compute/v1/jobs/claim'))
      .send({
        kind: 'city-source-discovery',
        cityKey: 'iowacity',
        capability: workerCapability(),
      });

    expect(claim.status).toBe(200);
    expect(claim.body.job.status).toBe('leased');
    expect(claim.body.lease.leaseToken).toBeTruthy();

    const leaseToken = claim.body.lease.leaseToken;
    const externalJobId = claim.body.job.externalJobId;

    const start = await workerAuth(request(app)
      .post(`/worker/pivot/compute/v1/jobs/${externalJobId}/start`))
      .send({ leaseToken, capability: workerCapability() });
    expect(start.status).toBe(200);
    expect(start.body.job.status).toBe('running');

    const heartbeat = await workerAuth(request(app)
      .post(`/worker/pivot/compute/v1/jobs/${externalJobId}/heartbeat`))
      .send({
        leaseToken,
        capability: workerCapability(),
        progress: { phase: 'searching', message: 'Searching', counters: { candidatesFound: 2 } },
      });
    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.job.progress.counters.candidatesFound).toBe(2);

    const observation = await workerAuth(request(app)
      .get(`/worker/pivot/compute/v1/jobs/${externalJobId}/observation`))
      .set('x-pivot-compute-lease-token', leaseToken);
    expect(observation.status).toBe(200);
    expect(observation.body.cancelRequested).toBe(false);

    const result = loadFixture('result-discovery-valid-completed.json');
    result.jobId = externalJobId;
    const submit = await workerAuth(request(app)
      .post(`/worker/pivot/compute/v1/jobs/${externalJobId}/result`))
      .send({
        leaseToken,
        capability: workerCapability(),
        result,
      });
    expect(submit.status).toBe(200);
    expect(submit.body.job.status).toBe('review-required');

    const duplicate = await workerAuth(request(app)
      .post(`/worker/pivot/compute/v1/jobs/${externalJobId}/result`))
      .send({
        leaseToken,
        capability: workerCapability(),
        result,
      });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.job.status).toBe('review-required');
  });

  it('mints carousel render context only after a worker owns an attempt', async () => {
    const requestFixture = loadFixture('job-request-carousel-valid.json');
    const contextFixture = loadFixture('context-carousel-valid.json');
    await createComputeJob(req, {
      externalJobId: requestFixture.jobId,
      kind: requestFixture.kind,
      cityKey: requestFixture.cityKey,
      contractVersion: requestFixture.contractVersion,
      contextVersion: requestFixture.contextVersion,
      createIdempotencyKey: requestFixture.idempotencyKey,
      requestedAt: requestFixture.requestedAt,
      origin: { type: 'admin' },
      options: requestFixture.options,
    });
    buildCarouselExportContextSnapshot.mockImplementation(async (_req, { job }) => {
      expect(job.status).toBe('leased');
      expect(job.lease.attemptId).toBeTruthy();
      return { data: { snapshot: { ...contextFixture, attemptId: job.lease.attemptId } } };
    });

    const claim = await workerAuth(request(app)
      .post('/worker/pivot/compute/v1/jobs/claim'))
      .send({ kind: 'carousel-export', cityKey: 'iowacity', capability: workerCapability() });
    expect(claim.status).toBe(200);

    const context = await workerAuth(request(app)
      .get(`/worker/pivot/compute/v1/jobs/${requestFixture.jobId}/context`))
      .set('x-pivot-compute-lease-token', claim.body.lease.leaseToken);
    expect(context.status).toBe(200);
    expect(context.body.context.kind).toBe('carousel-export');
    expect(context.body.context.attemptId).toBe(claim.body.lease.attemptId);
    expect(buildCarouselExportContextSnapshot).toHaveBeenCalledTimes(1);
  });

  it('reports retryable failures through the dedicated endpoint', async () => {
    await createComputeJob(req, {
      externalJobId: 'job:discovery-retry-001',
      kind: 'city-source-discovery',
      cityKey: 'iowacity',
      contractVersion: '1',
      contextVersion: 'ctx:iowacity.discovery.v1',
      createIdempotencyKey: 'idem:discovery-retry-001',
      requestedAt: FIXED_NOW.toISOString(),
      origin: { type: 'admin' },
      options: {},
    });

    const claim = await workerAuth(request(app)
      .post('/worker/pivot/compute/v1/jobs/claim'))
      .send({
        kind: 'city-source-discovery',
        capability: workerCapability(),
      });
    const leaseToken = claim.body.lease.leaseToken;
    const externalJobId = claim.body.job.externalJobId;

    await workerAuth(request(app)
      .post(`/worker/pivot/compute/v1/jobs/${externalJobId}/start`))
      .send({ leaseToken, capability: workerCapability() });

    const failure = await workerAuth(request(app)
      .post(`/worker/pivot/compute/v1/jobs/${externalJobId}/retryable-failure`))
      .send({
        leaseToken,
        capability: workerCapability(),
        idempotencyKey: 'idem:retry-001',
        basedOnContextVersion: 'ctx:iowacity.discovery.v1',
        failure: {
          code: 'PROVIDER_TIMEOUT',
          message: 'Firecrawl timed out',
          details: ['$.proposals.events[12].draft.description: exceeds 5000 characters'],
        },
      });

    expect(failure.status).toBe(200);
    expect(failure.body.job.status).toBe('retryable');
    expect(failure.body.job.failure.retryable).toBe(true);
    expect(failure.body.job.failure.details).toEqual([
      '$.proposals.events[12].draft.description: exceeds 5000 characters',
    ]);
  });

  it('reports contract-valid refresh failures and releases the active lease', async () => {
    await createComputeJob(req, {
      externalJobId: 'job:refresh-retry-001',
      kind: 'city-curation-refresh',
      cityKey: 'iowacity',
      contractVersion: '1',
      contextVersion: 'ctx:iowacity.refresh.v1',
      createIdempotencyKey: 'idem:refresh-retry-001',
      requestedAt: FIXED_NOW.toISOString(),
      origin: { type: 'admin' },
      options: {},
    });

    const claim = await workerAuth(request(app)
      .post('/worker/pivot/compute/v1/jobs/claim'))
      .send({
        kind: 'city-curation-refresh',
        capability: workerCapability(),
      });
    const leaseToken = claim.body.lease.leaseToken;
    const externalJobId = claim.body.job.externalJobId;

    await workerAuth(request(app)
      .post(`/worker/pivot/compute/v1/jobs/${externalJobId}/start`))
      .send({ leaseToken, capability: workerCapability() });

    const failure = await workerAuth(request(app)
      .post(`/worker/pivot/compute/v1/jobs/${externalJobId}/retryable-failure`))
      .send({
        leaseToken,
        capability: workerCapability(),
        idempotencyKey: 'idem:refresh-failure-001',
        basedOnContextVersion: 'ctx:iowacity.refresh.v1',
        failure: { code: 'PREVIEW_FAILED', message: 'Refresh extraction failed' },
      });

    expect(failure.status).toBe(200);
    expect(failure.body.job.status).toBe('retryable');
    expect(failure.body.job.lease).toBeNull();
    expect(failure.body.job.result.embedded.proposals).toEqual({ jobOutcomes: [], events: [] });
    expect(failure.body.job.result.embedded.summary).toEqual({
      jobsRun: 0,
      jobsFailed: 1,
      eventsProposed: 0,
      eventsRefreshed: 0,
    });
  });

  it('returns 204 when no compatible pending job is available', async () => {
    const response = await workerAuth(request(app)
      .post('/worker/pivot/compute/v1/jobs/claim'))
      .send({
        capability: workerCapability({
          supportedKinds: ['city-curation-refresh'],
        }),
      });

    expect(response.status).toBe(204);
  });

  it('claims the oldest pending job supported by the worker when kind is omitted', async () => {
    await createComputeJob(req, {
      externalJobId: 'job:unsupported-discovery-001',
      kind: 'city-source-discovery',
      cityKey: 'iowacity',
      contractVersion: '1',
      contextVersion: 'ctx:iowacity.discovery.v1',
      createIdempotencyKey: 'idem:unsupported-discovery-001',
      requestedAt: '2026-09-08T19:00:00.000Z',
      origin: { type: 'admin' },
      options: {},
    });
    await createComputeJob(req, {
      externalJobId: 'job:supported-refresh-001',
      kind: 'city-curation-refresh',
      cityKey: 'iowacity',
      contractVersion: '1',
      contextVersion: 'ctx:iowacity.refresh.v1',
      createIdempotencyKey: 'idem:supported-refresh-001',
      requestedAt: '2026-09-08T20:00:00.000Z',
      origin: { type: 'admin' },
      options: {},
    });

    const response = await workerAuth(request(app)
      .post('/worker/pivot/compute/v1/jobs/claim'))
      .send({
        capability: workerCapability({
          supportedKinds: ['city-curation-refresh'],
        }),
      });

    expect(response.status).toBe(200);
    expect(response.body.job.externalJobId).toBe('job:supported-refresh-001');
    expect(response.body.job.kind).toBe('city-curation-refresh');
  });

  it('rejects unknown request fields before parsing business logic', async () => {
    const response = await workerAuth(request(app)
      .post('/worker/pivot/compute/v1/jobs/claim'))
      .send({
        kind: 'city-source-discovery',
        capability: workerCapability(),
        callbackUrl: 'https://evil.example/hook',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNKNOWN_REQUEST_FIELD');
  });
});
