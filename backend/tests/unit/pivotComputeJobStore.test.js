const getGlobalModels = require('../../services/getGlobalModelService');
const pivotComputeJobSchema = require('../../schemas/pivotComputeJob');
const pivotComputeJobAttemptSchema = require('../../schemas/pivotComputeJobAttempt');
const {
  ensurePivotComputeJobIndexes,
  dropPivotComputeJobIndexes,
} = require('../../services/ensurePivotComputeJobIndexes');
const {
  createComputeJob,
  findJobByExternalId,
  findJobByCreateIdempotencyKey,
  claimNextPendingJob,
  startComputeJob,
  heartbeatComputeJobLease,
  recordComputeJobProgress,
  submitComputeJobResult,
  cancelComputeJob,
  retryComputeJob,
  expireComputeJobLease,
  beginComputeJobApply,
  completeComputeJobApply,
  listComputeJobAttempts,
  listExpiredLeaseJobs,
} = require('../../services/pivotComputeJobStore');
const {
  canTransitionComputeJob,
  assertComputeJobTransition,
} = require('../../utilities/pivotComputeJobTransitions');
const { loadFixture } = require('../../utilities/pivotAdminComputeJobContract');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

const { PIVOT_COMPUTE_JOB_INDEX_NAMES } = pivotComputeJobSchema;
const { PIVOT_COMPUTE_JOB_ATTEMPT_INDEX_NAMES } = pivotComputeJobAttemptSchema;

function buildCreateInput(overrides = {}) {
  return {
    externalJobId: 'job:discovery-iowacity-store-001',
    kind: 'city-source-discovery',
    cityKey: 'iowacity',
    contractVersion: '1',
    contextVersion: 'ctx:iowacity.discovery.v1',
    implementationRevision: 'meridian-backend@test',
    createIdempotencyKey: 'idem:create-discovery-iowacity-001',
    requestedAt: '2026-09-08T20:00:00.000Z',
    origin: {
      type: 'admin',
      requestedBy: 'admin@example.com',
    },
    options: {
      tags: ['live-music'],
      maxQueries: 5,
    },
    ...overrides,
  };
}

describe('pivotComputeJobStore', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  afterEach(async () => {
    await mongo.reset();
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('schema indexes and migration seam', () => {
    it('registers compute job models on the global connection', () => {
      const models = getGlobalModels(req, 'PivotComputeJob', 'PivotComputeJobAttempt');
      expect(models.PivotComputeJob.collection.name).toBe('pivot_compute_jobs');
      expect(models.PivotComputeJobAttempt.collection.name).toBe('pivot_compute_job_attempts');
    });

    it('declares required unique and query indexes', () => {
      expect(PIVOT_COMPUTE_JOB_INDEX_NAMES).toEqual([
        'pivot_compute_job_external_job_id_unique',
        'pivot_compute_job_create_idempotency_unique',
        'pivot_compute_job_schedule_occurrence_unique',
        'pivot_compute_job_claim_queue',
        'pivot_compute_job_lease_expiry',
        'pivot_compute_job_city_createdAt',
        'pivot_compute_job_city_status_updatedAt',
        'pivot_compute_job_export_artifact_expiry',
      ]);
      expect(PIVOT_COMPUTE_JOB_ATTEMPT_INDEX_NAMES).toEqual([
        'pivot_compute_job_attempt_job_attempt_unique',
        'pivot_compute_job_attempt_lease_token_unique',
        'pivot_compute_job_attempt_job_createdAt',
      ]);

      const jobIndexes = new Map(
        pivotComputeJobSchema.indexes().map(([keys, options]) => [options.name, { keys, options }]),
      );
      expect(jobIndexes.get('pivot_compute_job_external_job_id_unique').options.unique).toBe(true);
      expect(jobIndexes.get('pivot_compute_job_create_idempotency_unique').options.unique).toBe(true);
      expect(jobIndexes.get('pivot_compute_job_schedule_occurrence_unique').options.unique).toBe(true);
      expect(jobIndexes.get('pivot_compute_job_lease_expiry').keys).toEqual({
        status: 1,
        'lease.expiresAt': 1,
      });
    });

    it('supports reversible index migration via drop helper', async () => {
      await dropPivotComputeJobIndexes(req);
      const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
      const names = (await PivotComputeJob.collection.indexes()).map((row) => row.name);
      expect(names).not.toContain('pivot_compute_job_external_job_id_unique');
      await ensurePivotComputeJobIndexes(req, { force: true });
      const restored = (await PivotComputeJob.collection.indexes()).map((row) => row.name);
      expect(restored).toContain('pivot_compute_job_external_job_id_unique');
    });
  });

  describe('transition guards', () => {
    it('allows the documented lifecycle transitions and rejects illegal ones', () => {
      expect(canTransitionComputeJob('pending', 'leased')).toBe(true);
      expect(canTransitionComputeJob('running', 'review-required')).toBe(true);
      expect(canTransitionComputeJob('review-required', 'applying')).toBe(true);
      expect(canTransitionComputeJob('retryable', 'pending')).toBe(true);
      expect(canTransitionComputeJob('completed', 'pending')).toBe(false);
      expect(() => assertComputeJobTransition('completed', 'running')).toThrow(/Illegal compute job transition/);
    });
  });

  describe('create and idempotency', () => {
    it('creates a pending job with normalized cityKey and origin metadata', async () => {
      const { job, created } = await createComputeJob(req, buildCreateInput());
      expect(created).toBe(true);
      expect(job.status).toBe('pending');
      expect(job.cityKey).toBe('iowacity');
      expect(job.tenantKey).toBe('iowacity');
      expect(job.origin.type).toBe('admin');
      expect(job.attemptCount).toBe(0);
      expect(job.lease).toBeNull();
    });

    it('returns the existing job for duplicate create idempotency keys', async () => {
      await createComputeJob(req, buildCreateInput());
      const second = await createComputeJob(req, buildCreateInput({
        externalJobId: 'job:discovery-iowacity-store-dup',
      }));
      expect(second.created).toBe(false);
      expect(second.job.externalJobId).toBe('job:discovery-iowacity-store-001');
      expect(await findJobByCreateIdempotencyKey(req, 'idem:create-discovery-iowacity-001')).toMatchObject({
        externalJobId: 'job:discovery-iowacity-store-001',
      });
    });

    it('returns the existing job for duplicate schedule occurrence ids', async () => {
      const occurrenceId = 'sched:discovery-iowacity@2026-09-08T12:00:00.000Z';
      await createComputeJob(req, buildCreateInput({
        externalJobId: 'job:scheduled-001',
        createIdempotencyKey: 'idem:scheduled-001',
        scheduleOccurrenceId: occurrenceId,
        origin: { type: 'schedule', scheduleOccurrenceId: occurrenceId },
      }));

      const duplicate = await createComputeJob(req, buildCreateInput({
        externalJobId: 'job:scheduled-002',
        createIdempotencyKey: 'idem:scheduled-002',
        scheduleOccurrenceId: occurrenceId,
        origin: { type: 'schedule', scheduleOccurrenceId: occurrenceId },
      }));
      expect(duplicate.created).toBe(false);
      expect(duplicate.job.externalJobId).toBe('job:scheduled-001');
    });
  });

  describe('worker lease lifecycle', () => {
    it('claims, starts, heartbeats, records progress, and submits a review-required result', async () => {
      await createComputeJob(req, buildCreateInput());
      const now = new Date('2026-09-08T20:05:00.000Z');

      const claim = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        cityKey: 'iowacity',
        workerId: 'worker-mini-1',
        leaseMs: 60_000,
        now,
      });
      expect(claim.job.status).toBe('leased');
      expect(claim.attempt.attemptNumber).toBe(1);
      expect(claim.job.lease.workerId).toBe('worker-mini-1');

      const started = await startComputeJob(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        now: new Date(now.getTime() + 1000),
      });
      expect(started.status).toBe('running');
      expect(started.startedAt).toEqual(new Date('2026-09-08T20:05:01.000Z'));

      const heartbeat = await heartbeatComputeJobLease(req, {
        externalJobId: started.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        leaseMs: 120_000,
        now: new Date(now.getTime() + 5000),
      });
      expect(heartbeat.lease.expiresAt).toEqual(new Date('2026-09-08T20:07:05.000Z'));

      const progressed = await recordComputeJobProgress(req, {
        externalJobId: started.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        phase: 'searching',
        message: 'Searching candidates',
        counters: { candidatesFound: 3 },
        now: new Date(now.getTime() + 6000),
      });
      expect(progressed.progress.phase).toBe('searching');
      expect(progressed.progress.counters.candidatesFound).toBe(3);

      const result = loadFixture('result-discovery-valid-completed.json');
      const submitted = await submitComputeJobResult(req, {
        externalJobId: started.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        result,
        now: new Date(now.getTime() + 10_000),
      });
      expect(submitted.status).toBe('review-required');
      expect(submitted.result.resultIdempotencyKey).toBe(result.idempotencyKey);
      expect(submitted.lease).toBeNull();

      const attempts = await listComputeJobAttempts(req, started.externalJobId);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].status).toBe('completed');
      expect(attempts[0].terminalOutcome).toBe('completed');
    });

    it('returns the stored job for duplicate result idempotency keys', async () => {
      await createComputeJob(req, buildCreateInput());
      const claim = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:00.000Z'),
      });
      await startComputeJob(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:01.000Z'),
      });
      const result = loadFixture('result-discovery-valid-completed.json');
      const first = await submitComputeJobResult(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        result,
        now: new Date('2026-09-08T20:06:00.000Z'),
      });
      const second = await submitComputeJobResult(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        result,
        now: new Date('2026-09-08T20:06:01.000Z'),
      });
      expect(second.status).toBe('review-required');
      expect(second.id).toBe(first.id);
    });

    it('binds carousel results to tenant, deck, revision, context, and attempt and completes directly', async () => {
      const fixture = loadFixture('result-carousel-valid-completed.json');
      await createComputeJob(req, buildCreateInput({
        externalJobId: fixture.jobId,
        kind: 'carousel-export',
        contextVersion: fixture.basedOnContextVersion,
        createIdempotencyKey: 'idem:create-carousel-iowacity-001',
        options: {
          deckId: fixture.deckId,
          deckRevision: fixture.renderedDeckRevision,
        },
      }));
      const claim = await claimNextPendingJob(req, {
        kind: 'carousel-export',
        workerId: 'worker-mini-1',
        now: new Date('2026-09-11T20:05:00.000Z'),
      });
      await startComputeJob(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        now: new Date('2026-09-11T20:05:01.000Z'),
      });

      const result = { ...fixture, attemptId: claim.attempt.id };
      const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
      await PivotComputeJob.updateOne(
        { externalJobId: claim.job.externalJobId },
        {
          $set: {
            exportArtifacts: {
              attemptId: claim.attempt.id,
              attemptNumber: claim.job.lease.attemptNumber,
              prefix: `pivot-exports/iowacity/${fixture.jobId}/1/`,
              grantId: 'grant:carousel-fixture-001',
              finalizedAt: new Date('2026-09-11T20:07:00.000Z'),
              expiresAt: new Date('2026-09-25T20:07:00.000Z'),
              expired: false,
              artifacts: result.artifacts.map((artifact) => ({
                ...artifact,
                objectKey: `pivot-exports/iowacity/${fixture.jobId}/1/${artifact.logicalName}`,
              })),
            },
          },
        },
      );
      await expect(submitComputeJobResult(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        result: { ...result, tenantKey: 'chicago' },
      })).rejects.toMatchObject({ code: 'COMPUTE_RESULT_BINDING_MISMATCH' });

      const submitted = await submitComputeJobResult(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        result,
        requiresReview: true,
        now: new Date('2026-09-11T20:08:00.000Z'),
      });
      expect(submitted.status).toBe('completed');
      expect(submitted.applicationAudit).toBeNull();
      expect(submitted.exportArtifacts.artifacts).toHaveLength(3);
    });

    it('rejects a completed carousel result before artifacts are finalized', async () => {
      const fixture = loadFixture('result-carousel-valid-completed.json');
      await createComputeJob(req, buildCreateInput({
        externalJobId: 'job:carousel-missing-artifacts-001',
        kind: 'carousel-export',
        contextVersion: fixture.basedOnContextVersion,
        createIdempotencyKey: 'idem:create-carousel-missing-artifacts-001',
        options: {
          deckId: fixture.deckId,
          deckRevision: fixture.renderedDeckRevision,
        },
      }));
      const claim = await claimNextPendingJob(req, {
        kind: 'carousel-export',
        workerId: 'worker-mini-1',
        now: new Date('2026-09-11T20:05:00.000Z'),
      });
      await startComputeJob(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        now: new Date('2026-09-11T20:05:01.000Z'),
      });
      await expect(submitComputeJobResult(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        result: {
          ...fixture,
          jobId: claim.job.externalJobId,
          attemptId: claim.attempt.id,
        },
      })).rejects.toMatchObject({ code: 'CAROUSEL_ARTIFACTS_NOT_FINALIZED' });
    });

    it('marks retryable failures and supports retry back to pending', async () => {
      await createComputeJob(req, buildCreateInput());
      const claim = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:00.000Z'),
      });
      await startComputeJob(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:01.000Z'),
      });
      const result = loadFixture('result-discovery-failed.json');
      const failed = await submitComputeJobResult(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        result,
        retryable: true,
        now: new Date('2026-09-08T20:06:00.000Z'),
      });
      expect(failed.status).toBe('retryable');
      expect(failed.failure.retryable).toBe(true);

      const retried = await retryComputeJob(req, {
        externalJobId: failed.externalJobId,
        contextVersion: 'ctx:iowacity.discovery.v2',
        now: new Date('2026-09-08T20:10:00.000Z'),
      });
      expect(retried.status).toBe('pending');
      expect(retried.contextVersion).toBe('ctx:iowacity.discovery.v2');
      expect(retried.result).toBeNull();
    });
  });

  describe('admin cancellation and apply audit', () => {
    it('cancels pending jobs without a lease', async () => {
      const { job } = await createComputeJob(req, buildCreateInput());
      const cancelled = await cancelComputeJob(req, {
        externalJobId: job.externalJobId,
        actor: 'admin@example.com',
        now: new Date('2026-09-08T20:01:00.000Z'),
      });
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.failure.code).toBe('CANCELLED');
    });

    it('retains an active lease so the worker can observe cancellation', async () => {
      await createComputeJob(req, buildCreateInput());
      const claim = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:00.000Z'),
      });
      const cancelled = await cancelComputeJob(req, {
        externalJobId: claim.job.externalJobId,
        actor: 'admin@example.com',
        now: new Date('2026-09-08T20:05:01.000Z'),
      });
      expect(cancelled.status).toBe('leased');
      expect(cancelled.cancelRequested).toBe(true);
      expect(cancelled.lease.token).toBe(claim.job.lease.token);
    });

    it('applies a reviewed result and records bounded application audit', async () => {
      await createComputeJob(req, buildCreateInput());
      const claim = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:00.000Z'),
      });
      await startComputeJob(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:01.000Z'),
      });
      await submitComputeJobResult(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        result: loadFixture('result-discovery-valid-completed.json'),
        now: new Date('2026-09-08T20:06:00.000Z'),
      });

      const applying = await beginComputeJobApply(req, {
        externalJobId: claim.job.externalJobId,
        actor: 'admin@example.com',
        previewId: 'preview-001',
        idempotencyKey: 'apply:discovery-iowacity-001',
        now: new Date('2026-09-08T20:20:00.000Z'),
      });
      expect(applying.status).toBe('applying');
      await expect(beginComputeJobApply(req, {
        externalJobId: claim.job.externalJobId,
        actor: 'other-admin@example.com',
        previewId: 'preview-002',
        idempotencyKey: 'apply:concurrent',
      })).rejects.toMatchObject({ code: 'COMPUTE_JOB_APPLY_IN_PROGRESS' });

      const completed = await completeComputeJobApply(req, {
        externalJobId: claim.job.externalJobId,
        actor: 'admin@example.com',
        idempotencyKey: 'apply:discovery-iowacity-001',
        summary: { creates: 1, updates: 0, unchanged: 0, conflicts: 0, stale: 0, rejected: 0 },
        now: new Date('2026-09-08T20:20:05.000Z'),
      });
      expect(completed.status).toBe('completed');
      expect(completed.applicationAudit.outcome).toBe('completed');
      expect(completed.applicationAudit.summary.creates).toBe(1);

      const duplicateApply = await completeComputeJobApply(req, {
        externalJobId: claim.job.externalJobId,
        actor: 'admin@example.com',
        idempotencyKey: 'apply:discovery-iowacity-001',
        now: new Date('2026-09-08T20:20:06.000Z'),
      });
      expect(duplicateApply.status).toBe('completed');
      expect(duplicateApply.applicationAudit.appliedAt).toEqual(completed.applicationAudit.appliedAt);
    });

    it('returns a partial apply to review-required instead of completing', async () => {
      await createComputeJob(req, buildCreateInput());
      const claim = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:00.000Z'),
      });
      await startComputeJob(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:01.000Z'),
      });
      await submitComputeJobResult(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        result: loadFixture('result-discovery-valid-completed.json'),
        now: new Date('2026-09-08T20:06:00.000Z'),
      });
      await beginComputeJobApply(req, {
        externalJobId: claim.job.externalJobId,
        actor: 'admin@example.com',
        idempotencyKey: 'apply:partial-001',
      });
      const partial = await completeComputeJobApply(req, {
        externalJobId: claim.job.externalJobId,
        actor: 'admin@example.com',
        idempotencyKey: 'apply:partial-001',
        outcome: 'partial',
        summary: { conflicts: 1 },
      });
      expect(partial.status).toBe('review-required');
      expect(partial.applicationAudit.outcome).toBe('partial');
    });
  });

  describe('lease expiry sweep', () => {
    it('expires active leases and surfaces them through the expiry query helper', async () => {
      await createComputeJob(req, buildCreateInput());
      const claim = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-1',
        leaseMs: 120_000,
        now: new Date('2026-09-08T20:05:00.000Z'),
      });
      await startComputeJob(req, {
        externalJobId: claim.job.externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:01.000Z'),
      });

      const expiredAt = new Date('2026-09-08T20:10:00.000Z');
      const expiredCandidates = await listExpiredLeaseJobs(req, { now: expiredAt });
      expect(expiredCandidates).toHaveLength(1);

      const expired = await expireComputeJobLease(req, {
        externalJobId: claim.job.externalJobId,
        now: expiredAt,
      });
      expect(expired.status).toBe('expired');
      expect(expired.failure.code).toBe('LEASE_EXPIRED');
      expect(await findJobByExternalId(req, claim.job.externalJobId)).toMatchObject({
        status: 'expired',
      });
    });

    it('can release an expired lease back to pending for reclaim', async () => {
      await createComputeJob(req, buildCreateInput());
      const claim = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-1',
        leaseMs: 1000,
        now: new Date('2026-09-08T20:05:00.000Z'),
      });
      const released = await expireComputeJobLease(req, {
        externalJobId: claim.job.externalJobId,
        releaseToPending: true,
        now: new Date('2026-09-08T20:10:00.000Z'),
      });
      expect(released.status).toBe('pending');
      expect(released.lease).toBeNull();
    });

    it('reclaims an expired running lease so the next worker can claim it', async () => {
      await createComputeJob(req, buildCreateInput());
      const first = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-1',
        leaseMs: 120_000,
        now: new Date('2026-09-08T20:05:00.000Z'),
      });
      await startComputeJob(req, {
        externalJobId: first.job.externalJobId,
        leaseToken: first.job.lease.token,
        workerId: 'worker-mini-1',
        now: new Date('2026-09-08T20:05:01.000Z'),
      });

      const second = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-2',
        leaseMs: 1000,
        now: new Date('2026-09-08T20:08:00.000Z'),
      });
      expect(second.job.externalJobId).toBe(first.job.externalJobId);
      expect(second.job.status).toBe('leased');
      expect(second.job.lease.workerId).toBe('worker-mini-2');
      expect(second.job.attemptCount).toBe(2);
    });

    it('automatically reclaims expired work before the next claim', async () => {
      await createComputeJob(req, buildCreateInput());
      const first = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-1',
        leaseMs: 1000,
        now: new Date('2026-09-08T20:05:00.000Z'),
      });
      const second = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-mini-2',
        leaseMs: 1000,
        now: new Date('2026-09-08T20:06:00.000Z'),
      });
      expect(second.job.externalJobId).toBe(first.job.externalJobId);
      expect(second.job.lease.workerId).toBe('worker-mini-2');
      expect(second.job.attemptCount).toBe(2);
    });
  });
});
