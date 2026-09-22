const mongoose = require('mongoose');
const {
  classifyVersionedProposal,
  summarizePreviewRows,
  buildComputeReview,
  validateComputeExecutionResult,
  previewComputeResult,
  previewStoredComputeJob,
  applyComputeResult,
  applyStoredComputeJob,
  buildBoundedApplyManifest,
  countApplicablePreviewRows,
  BACKGROUND_APPLY_ROW_THRESHOLD,
  NATIVE_TAGS_REQUIRED,
} = require('../../services/pivotComputeResultApplyService');
const {
  createComputeJob,
  submitComputeJobResult,
  claimNextPendingJob,
  startComputeJob,
  findJobByExternalId,
} = require('../../services/pivotComputeJobStore');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { loadFixture } = require('../../utilities/pivotAdminComputeJobContract');
const { recordVersion } = require('../../utilities/pivotComputeContextVersion');
const { createMongoMemoryConnection, getOrCreateModel } = require('../helpers/mongoMemory');
const pivotCitySourceSchema = require('../../schemas/pivotCitySource');
const pivotCurationJobSchema = require('../../schemas/pivotCurationJob');
const eventSchema = require('../../events/schemas/event');
const tenantConfigSchema = require('../../schemas/tenantConfig');
const offloadedDiscoveryContextService = require('../../services/pivotOffloadedDiscoveryContextService');

jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
  publishIngestEvent: jest.fn(),
}));

jest.mock('../../utilities/pivotTagAssigner', () => ({
  assignTags: jest.fn(),
}));

jest.mock('../../services/pivotSourceDiscoveryService', () => ({
  persistOutcome: jest.fn(),
}));

jest.mock('../../services/pivotCurationJobService', () => ({
  createCurationJob: jest.fn(),
  updateCurationJob: jest.fn(),
}));

jest.mock('../../services/pivotOffloadedCurationRefreshContextService', () => ({
  buildCityCurationRefreshContextSnapshot: jest.fn(async () => ({
    data: { snapshot: { contextVersion: 'ctx:iowacity.refresh.v7' } },
  })),
  serializeRefreshJobIdentity: (row) => {
    const jobId = String(row?._id || '');
    const label = typeof row?.label === 'string' ? row.label.trim() : '';
    const provider = typeof row?.provider === 'string' ? row.provider.trim() : '';
    if (!/^[0-9a-f]{24}$/.test(jobId) || !label) return null;
    if (!['partiful', 'luma', 'generic-site'].includes(provider)) return null;
    return {
      recordVersion: `rv:job:${jobId}`,
      jobId,
      label,
      provider,
      url: row.url || null,
      enabled: row.enabled !== false,
      defaultTags: row.defaultTags || [],
    };
  },
}));

const { resolvePivotTenant, publishIngestEvent } = require('../../services/pivotIngestPublishService');
const { assignTags } = require('../../utilities/pivotTagAssigner');
const { persistOutcome } = require('../../services/pivotSourceDiscoveryService');
const { createCurationJob, updateCurationJob } = require('../../services/pivotCurationJobService');
const {
  MAX_APPLICATION_AUDIT_ROWS,
  MAX_APPLICATION_AUDIT_BUCKETS,
} = require('../../schemas/pivotComputeJob');

function tenantConfigRow(cityKey = 'iowacity') {
  return {
    tenantKey: cityKey,
    name: 'Iowa City',
    location: 'Iowa City, IA',
    pivotDropTimezone: 'America/Chicago',
    pivotCatalogOrgId: new mongoose.Types.ObjectId(),
    pivotDiscovery: { flow: 'native-then-firecrawl' },
  };
}

describe('pivotComputeResultApplyService', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = {
      globalDb: mongo.globalConnection,
      db: mongo.connection,
      user: { email: 'admin@example.com' },
    };
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  beforeEach(async () => {
    await mongo.reset();
    await ensurePivotComputeJobIndexes(req, { force: true });
    resolvePivotTenant.mockResolvedValue({ tenant: tenantConfigRow() });
    publishIngestEvent.mockReset();
    publishIngestEvent.mockResolvedValue({ data: { event: { _id: 'event-1' }, updated: false } });
    assignTags.mockReset();
    assignTags.mockResolvedValue({
      tags: ['nightlife'],
      provider: 'claude',
      model: 'claude-sonnet-4-6',
    });
    persistOutcome.mockResolvedValue({});
    createCurationJob.mockResolvedValue({ data: { job: { _id: 'job-1' } } });
    updateCurationJob.mockResolvedValue({ data: { job: { _id: 'job-1' } } });
    jest.spyOn(offloadedDiscoveryContextService, 'buildCityDiscoveryContextSnapshot')
      .mockResolvedValue({ data: { snapshot: { contextVersion: 'ctx:iowacity.discovery.v3' } } });
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('classification helpers', () => {
    it('classifies create, stale, and rejected rows deterministically', () => {
      const current = { recordVersion: 'rv:src-current' };
      expect(classifyVersionedProposal({
        entityType: 'source',
        key: 'host:example.org',
        proposalAction: 'create',
        basedOnRecordVersion: null,
        current: null,
        proposalMaterial: { host: 'example.org' },
        currentMaterial: null,
      }).action).toBe('create');

      expect(classifyVersionedProposal({
        entityType: 'source',
        key: 'host:example.org',
        proposalAction: 'update',
        basedOnRecordVersion: 'rv:src-old',
        current,
        proposalMaterial: { host: 'example.org', url: 'https://example.org/events' },
        currentMaterial: { host: 'example.org', url: 'https://example.org/old' },
      }).action).toBe('stale');

      expect(classifyVersionedProposal({
        entityType: 'source',
        key: 'host:bad.org',
        proposalAction: 'create',
        basedOnRecordVersion: null,
        current: null,
        proposalMaterial: { status: 'rejected' },
        currentMaterial: null,
        rejectedReason: 'below-threshold',
      }).action).toBe('rejected');
    });

    it('summarizes preview rows by action', () => {
      expect(summarizePreviewRows([
        { action: 'create' },
        { action: 'update' },
        { action: 'unchanged' },
        { action: 'stale' },
      ])).toEqual({
        creates: 1,
        updates: 1,
        unchanged: 1,
        conflicts: 0,
        rejected: 0,
        stale: 1,
      });
    });
  });

  describe('previewComputeResult', () => {
    it('surfaces published mutations, field changes, and incomplete curation jobs', () => {
      const result = loadFixture('result-refresh-valid-completed.json');
      result.proposals.jobOutcomes[0] = {
        ...result.proposals.jobOutcomes[0],
        outcome: 'failed',
        failure: { code: 'SCRAPE_FAILED', message: 'Provider timed out.' },
      };
      const proposal = result.proposals.events[0];
      const preview = {
        rows: [
          {
            entityType: 'curationJob',
            action: 'rejected',
            key: `jobId:${result.proposals.jobOutcomes[0].jobId}`,
            message: 'Provider timed out.',
          },
          {
            entityType: 'event',
            action: 'update',
            key: `sourceUrl:${proposal.sourceUrl}`,
          },
        ],
      };
      const currentEvent = {
        name: 'Old meetup name',
        start_time: new Date('2026-09-09T23:00:00.000Z'),
        end_time: new Date('2026-09-10T01:00:00.000Z'),
        location: 'Old venue',
        description: null,
        customFields: {
          pivot: {
            sourceUrl: proposal.sourceUrl,
            batchWeek: proposal.batchWeek,
            ingestStatus: 'published',
            tags: ['community'],
            rawLocationText: 'Old venue, Iowa City',
            host: {
              name: 'Old host',
              profileUrl: 'https://luma.com/user/old',
            },
          },
        },
      };
      const identities = {
        tenant: { pivotDropTimezone: 'America/Chicago' },
        eventDocBySourceUrl: new Map([[proposal.sourceUrl, currentEvent]]),
        jobById: new Map([[proposal.linkedJobId, {
          jobId: proposal.linkedJobId,
          label: 'Luma Iowa City',
          provider: 'luma',
          linkedSourceHost: 'luma.com',
        }]]),
      };

      const review = buildComputeReview(result, identities, preview, new Date('2026-09-08T20:00:00.000Z'));

      expect(review.impact).toMatchObject({
        eventUpdates: 1,
        publishedEventUpdates: 1,
        eventCreates: 0,
      });
      expect(review.sourceHealth.failed).toBe(1);
      expect(review.timezone).toBe('America/Chicago');
      expect(review.attention).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'PUBLISHED_EVENT_UPDATE', title: 'Community Meetup' }),
        expect.objectContaining({ code: 'CURATION_JOB_INCOMPLETE', title: 'Luma Iowa City' }),
      ]));
      expect(review.attention.find((row) => row.code === 'PUBLISHED_EVENT_UPDATE').changes)
        .toEqual(expect.arrayContaining([expect.objectContaining({ field: 'name' })]));
      expect(review.warningGroups).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'PUBLISHED_EVENT_UPDATE', count: 1 }),
        expect.objectContaining({ code: 'CURATION_JOB_INCOMPLETE', count: 1 }),
      ]));
      expect(review.curationQuality).toMatchObject({
        eventCount: 1,
        metadataComplete: 0,
        eventsMissingMetadata: 1,
        needsRichData: 1,
        resolvedBatchWeek: '2026-W37',
        batchWeeks: [{ batchWeek: '2026-W37', count: 1 }],
        tagBreakdown: [{ tag: 'community', count: 1 }],
      });
      expect(review.curationQuality.missingMetadata).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'missing-description', count: 1 }),
        expect.objectContaining({ key: 'missing-image', count: 1 }),
      ]));
      expect(review.applyPlan).toMatchObject({
        eventDestinations: [{ action: 'update', status: 'published', count: 1 }],
        batchWeeks: [{ batchWeek: '2026-W37', count: 1 }],
        batchWeekSources: [{ source: 'event-date', count: 1 }],
      });
    });

    it('flags source groups with a large production blast radius', () => {
      const result = loadFixture('result-refresh-valid-completed.json');
      const template = result.proposals.events[0];
      result.proposals.events = Array.from({ length: 50 }, (_, index) => ({
        ...template,
        sourceUrl: `https://luma.com/iowa-city/event-${index}`,
        draft: {
          ...template.draft,
          sourceUrl: `https://luma.com/iowa-city/event-${index}`,
        },
        basedOnEventVersion: null,
      }));
      const preview = {
        rows: result.proposals.events.map((proposal) => ({
          entityType: 'event',
          action: 'create',
          key: `sourceUrl:${proposal.sourceUrl}`,
        })),
      };
      const identities = {
        tenant: { pivotDropTimezone: 'America/Chicago' },
        eventDocBySourceUrl: new Map(),
        jobById: new Map([[template.linkedJobId, {
          jobId: template.linkedJobId,
          label: 'Luma Iowa City',
          provider: 'luma',
          linkedSourceHost: 'luma.com',
        }]]),
      };

      const review = buildComputeReview(result, identities, preview, new Date('2026-09-08T20:00:00.000Z'));

      expect(review.attention).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'HIGH_VOLUME_SOURCE',
          title: 'Luma Iowa City',
          message: expect.stringContaining('50 event mutations'),
        }),
      ]));
      expect(review.groups[0]).toMatchObject({ creates: 50, attention: 1 });
      expect(review.attention.find((row) => row.code === 'HIGH_VOLUME_SOURCE').samples)
        .toHaveLength(3);
      expect(review.warningGroups).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'HIGH_VOLUME_SOURCE', count: 1 }),
      ]));
      expect(review.applyPlan.eventDestinations).toEqual([
        { action: 'create', status: 'staged', count: 50 },
      ]);
    });

    it('builds an applyable discovery preview against empty production state', async () => {
      const result = loadFixture('result-discovery-valid-completed.json');
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      expect(preview.applyAllowed).toBe(true);
      expect(preview.summary.creates).toBeGreaterThan(0);
      expect(preview.rows.some((row) => row.entityType === 'source' && row.action === 'create')).toBe(true);
    });

    it('blocks apply when the result context version is stale', async () => {
      const result = loadFixture('result-discovery-valid-completed.json');
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: 'ctx:iowacity.discovery.v999',
      });

      expect(preview.applyAllowed).toBe(false);
      expect(preview.blockingReasons[0].code).toBe('STALE_CONTEXT');
    });

    it('rejects unknown contract versions fail-closed', () => {
      expect(() => validateComputeExecutionResult({
        ...loadFixture('result-discovery-valid-completed.json'),
        contractVersion: '99',
      })).toThrow(/Unsupported compute contract version/);
    });

    it('rejects failed execution results for preview/apply', () => {
      expect(() => validateComputeExecutionResult(loadFixture('result-discovery-failed.json')))
        .toThrow(/Only completed compute results/);
    });

    it('marks refresh events stale when production record versions drift', async () => {
      const result = loadFixture('result-refresh-valid-completed.json');
      const sourceUrl = result.proposals.events[0].sourceUrl;
      const Event = getOrCreateModel(mongo.connection, 'Event', eventSchema, 'events');
      await Event.collection.insertOne({
        name: 'Existing Event',
        startTime: new Date('2026-09-10T23:00:00.000Z'),
        customFields: {
          pivot: {
            sourceUrl,
            batchWeek: '2026-W37',
            tags: ['community'],
          },
        },
      });

      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      const eventRow = preview.rows.find((row) => row.entityType === 'event');
      expect(['update', 'unchanged', 'stale']).toContain(eventRow.action);
    });
  });

  describe('applyComputeResult', () => {
    it('rejects preview and apply operations for carousel export jobs', async () => {
      const fixture = loadFixture('job-request-carousel-valid.json');
      await createComputeJob(req, {
        externalJobId: fixture.jobId,
        kind: fixture.kind,
        cityKey: fixture.cityKey,
        contractVersion: fixture.contractVersion,
        contextVersion: fixture.contextVersion,
        createIdempotencyKey: fixture.idempotencyKey,
        requestedAt: fixture.requestedAt,
        origin: { type: 'admin' },
        options: fixture.options,
      });

      await expect(previewStoredComputeJob(req, fixture.jobId))
        .rejects.toMatchObject({ code: 'CAROUSEL_PREVIEW_UNSUPPORTED', status: 409 });
      await expect(applyStoredComputeJob(req, fixture.jobId, {
        tenantKey: fixture.cityKey,
        idempotencyKey: 'apply:carousel-not-allowed',
      })).rejects.toMatchObject({ code: 'CAROUSEL_APPLY_UNSUPPORTED', status: 409 });
    });

    it('warns on missing metadata but still allows apply like legacy refresh', async () => {
      const result = loadFixture('result-refresh-valid-completed.json');
      result.proposals.events[0].draft.hostName = null;
      result.proposals.events[0].draft.location = null;
      publishIngestEvent.mockResolvedValueOnce({
        error: 'Missing required fields after merge: hostName, location.',
        code: 'MISSING_REQUIRED_FIELDS',
        status: 400,
      });
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      expect(preview.applyAllowed).toBe(true);
      expect(preview.applyWarnings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_REQUIRED_EVENT_FIELDS',
          message: expect.stringContaining('hostName, location'),
        }),
      ]));
      expect(preview.rows.find((row) => row.entityType === 'event')).toMatchObject({
        missingFields: expect.arrayContaining(['hostName', 'location']),
      });

      const applied = await applyComputeResult(req, {
        result,
        preview,
        idempotencyKey: 'apply:missing-fields',
        actor: 'admin@example.com',
      });
      expect(applied.summary.skipped).toBe(1);
      expect(applied.summary.creates + applied.summary.updates).toBe(0);
      expect(publishIngestEvent).toHaveBeenCalled();
    });

    it('still allows apply for source and curation job rows when only events are invalid', async () => {
      const result = loadFixture('result-discovery-valid-completed.json');
      result.proposals.events[0].draft.hostName = null;
      result.proposals.events[0].draft.location = null;
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      expect(preview.applyAllowed).toBe(true);
      expect(preview.applyWarnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_REQUIRED_EVENT_FIELDS' }),
      ]));

      publishIngestEvent.mockResolvedValueOnce({
        error: 'Missing required fields after merge: hostName, location.',
        code: 'MISSING_REQUIRED_FIELDS',
        status: 400,
      });
      const applied = await applyComputeResult(req, {
        result,
        preview,
        idempotencyKey: 'apply:discovery-invalid-event-only',
        actor: 'admin@example.com',
      });

      expect(applied.summary.skipped).toBe(1);
      expect(persistOutcome).toHaveBeenCalled();
      expect(createCurationJob).toHaveBeenCalled();
      expect(publishIngestEvent).toHaveBeenCalled();
    });

    it('applies valid event rows while skipping rows missing required metadata', async () => {
      const result = loadFixture('result-discovery-valid-completed.json');
      const invalidEvent = {
        ...result.proposals.events[0],
        sourceUrl: 'https://example-theatre.org/events/show-2',
        draft: {
          ...result.proposals.events[0].draft,
          name: 'Incomplete Night',
          sourceUrl: 'https://example-theatre.org/events/show-2',
          hostName: null,
          location: null,
        },
      };
      result.proposals.events.push(invalidEvent);

      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      expect(preview.applyAllowed).toBe(true);
      publishIngestEvent
        .mockResolvedValueOnce({ data: { event: { _id: 'event-good' }, updated: false, ingestStatus: 'draft' } })
        .mockResolvedValueOnce({
          error: 'Missing required fields after merge: hostName, location.',
          code: 'MISSING_REQUIRED_FIELDS',
          status: 400,
        });
      expect(preview.applyWarnings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'MISSING_REQUIRED_EVENT_FIELDS',
          message: expect.stringContaining('may be skipped'),
        }),
      ]));
      expect(preview.summary.skipped).toBe(1);

      const applied = await applyComputeResult(req, {
        result,
        preview,
        idempotencyKey: 'apply:partial-missing-fields',
        actor: 'admin@example.com',
      });

      expect(applied.summary.skipped).toBe(1);
      expect(applied.summary.creates).toBeGreaterThan(0);
      expect(publishIngestEvent).toHaveBeenCalledTimes(2);
      expect(applied.skippedRows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          key: 'sourceUrl:https://example-theatre.org/events/show-2',
          missingFields: expect.arrayContaining(['hostName', 'location']),
        }),
      ]));
    });

    it('applies create rows through existing source, job, and event seams without replaying discovery', async () => {
      const result = loadFixture('result-discovery-valid-completed.json');
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      const applied = await applyComputeResult(req, {
        result,
        preview,
        idempotencyKey: 'apply:discovery-001',
        actor: 'admin@example.com',
      });

      expect(applied.summary.creates).toBeGreaterThan(0);
      expect(persistOutcome).toHaveBeenCalled();
      expect(createCurationJob).toHaveBeenCalled();
      expect(publishIngestEvent).toHaveBeenCalled();
      expect(applied.manifest.manifestGeneratedAt).toBeInstanceOf(Date);
      expect(applied.manifest.buckets).toEqual(expect.arrayContaining([
        expect.objectContaining({ entityType: 'source', disposition: 'created', count: 1 }),
        expect.objectContaining({ entityType: 'event', disposition: 'created' }),
      ]));
      expect(applied.manifest.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ entityType: 'event', name: 'Jazz Night', eventId: 'event-1' }),
      ]));
    });

    it('applies from a refreshed server preview when the browser preview drifted but apply is still allowed', async () => {
      const result = loadFixture('result-discovery-valid-completed.json');
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });
      const tampered = structuredClone(preview);
      tampered.rows[0].key = 'host:attacker.example';

      const applied = await applyComputeResult(req, {
        result,
        preview: tampered,
        idempotencyKey: 'apply:tampered-preview',
        actor: 'admin@example.com',
      });

      expect(applied.previewDrift).toBe(true);
      expect(applied.summary.creates + applied.summary.updates).toBeGreaterThan(0);
    });

    it('routes large previews to background apply', async () => {
      const externalJobId = 'job:refresh-bg-apply';
      const result = loadFixture('result-refresh-valid-completed.json');
      result.jobId = externalJobId;
      await createComputeJob(req, {
        externalJobId,
        kind: 'city-curation-refresh',
        cityKey: 'iowacity',
        contractVersion: '1',
        contextVersion: result.basedOnContextVersion,
        createIdempotencyKey: 'idem:create-bg-apply',
        requestedAt: new Date().toISOString(),
        origin: { type: 'admin' },
        options: {},
      });
      const claim = await claimNextPendingJob(req, {
        kind: 'city-curation-refresh',
        workerId: 'worker-1',
        now: new Date(),
      });
      await startComputeJob(req, {
        externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-1',
        now: new Date(),
      });
      const template = result.proposals.events[0];
      result.proposals.events = Array.from({ length: BACKGROUND_APPLY_ROW_THRESHOLD + 2 }, (_, index) => ({
        ...template,
        sourceUrl: `https://luma.com/iowa-city/event-${index}`,
        draft: {
          ...template.draft,
          sourceUrl: `https://luma.com/iowa-city/event-${index}`,
        },
        basedOnEventVersion: null,
      }));
      await submitComputeJobResult(req, {
        externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-1',
        result,
        now: new Date(),
      });
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });
      expect(countApplicablePreviewRows(preview)).toBeGreaterThan(BACKGROUND_APPLY_ROW_THRESHOLD);

      const queued = [];
      const setImmediateSpy = jest.spyOn(global, 'setImmediate').mockImplementation((fn) => {
        queued.push(fn);
      });
      try {
        const accepted = await applyStoredComputeJob(req, externalJobId, {
          tenantKey: 'iowacity',
          idempotencyKey: 'apply:bg-001',
          preview,
          actor: 'admin@example.com',
        });
        expect(accepted.async).toBe(true);
        expect(accepted.job.status).toBe('applying');
        expect(queued).toHaveLength(1);
      } finally {
        setImmediateSpy.mockRestore();
      }
    });

    it('returns the stored outcome for duplicate apply idempotency keys', async () => {
      const externalJobId = 'job:discovery-apply-dup';
      await createComputeJob(req, {
        externalJobId,
        kind: 'city-source-discovery',
        cityKey: 'iowacity',
        contractVersion: '1',
        contextVersion: 'ctx:iowacity.discovery.v1',
        createIdempotencyKey: 'idem:create-apply-dup',
        requestedAt: new Date().toISOString(),
        origin: { type: 'admin' },
        options: {},
      });
      const claim = await claimNextPendingJob(req, {
        kind: 'city-source-discovery',
        workerId: 'worker-1',
        now: new Date(),
      });
      await startComputeJob(req, {
        externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-1',
        now: new Date(),
      });
      const result = loadFixture('result-discovery-valid-completed.json');
      result.jobId = externalJobId;
      await submitComputeJobResult(req, {
        externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-1',
        result,
        now: new Date(),
      });

      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      await expect(applyStoredComputeJob(req, externalJobId, {
        tenantKey: 'nyc',
        idempotencyKey: 'apply:wrong-tenant',
        preview,
        actor: 'admin@example.com',
      })).rejects.toMatchObject({ code: 'COMPUTE_JOB_TENANT_MISMATCH' });
      expect(await findJobByExternalId(req, externalJobId)).toMatchObject({ status: 'review-required' });

      const first = await applyStoredComputeJob(req, externalJobId, {
        tenantKey: 'iowacity',
        idempotencyKey: 'apply:dup-001',
        preview,
        actor: 'admin@example.com',
      });
      expect(first.job.status).toBe('completed');
      expect(first.job.applicationAudit.manifestGeneratedAt).toBeTruthy();
      expect(first.job.applicationAudit.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ entityType: 'event', disposition: 'created' }),
      ]));
      expect(first.job.applicationAudit.buckets.length).toBeGreaterThan(0);

      const second = await applyStoredComputeJob(req, externalJobId, {
        tenantKey: 'iowacity',
        idempotencyKey: 'apply:dup-001',
        preview,
        actor: 'admin@example.com',
      });
      expect(second.duplicate).toBe(true);
      expect(second.job.status).toBe('completed');
      expect(await findJobByExternalId(req, externalJobId)).toMatchObject({ status: 'completed' });
    });

    it('assigns catalog tags before publishing an untagged luma create', async () => {
      const result = loadFixture('result-refresh-valid-completed.json');
      result.proposals.events[0].draft.tags = [];
      result.proposals.events[0].draft.description = 'A community meetup downtown.';
      result.proposals.events[0].draft.image = 'https://luma.com/iowa-city/event-abc.jpg';
      result.proposals.events[0].basedOnEventVersion = null;
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      const applied = await applyComputeResult(req, {
        result,
        preview,
        idempotencyKey: 'apply:native-untagged-luma',
        actor: 'admin@example.com',
      });

      expect(assignTags).toHaveBeenCalledTimes(1);
      expect(assignTags).toHaveBeenCalledWith(expect.objectContaining({
        tenantKey: 'iowacity',
        req,
        event: expect.objectContaining({ name: 'Community Meetup' }),
      }));
      expect(publishIngestEvent).toHaveBeenCalledWith(req, expect.objectContaining({
        overrides: expect.objectContaining({
          tags: ['nightlife'],
          ingestStatus: 'staged',
        }),
      }));
      expect(applied.manifest.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          entityType: 'event',
          name: 'Community Meetup',
          ingestStatus: 'staged',
          message: 'tagAssigner:claude:claude-sonnet-4-6',
        }),
      ]));
    });

    it('does not replace tags that are already on a luma draft', async () => {
      const result = loadFixture('result-refresh-valid-completed.json');
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      await applyComputeResult(req, {
        result,
        preview,
        idempotencyKey: 'apply:native-already-tagged',
        actor: 'admin@example.com',
      });

      expect(assignTags).not.toHaveBeenCalled();
      expect(publishIngestEvent).toHaveBeenCalledWith(req, expect.objectContaining({
        overrides: expect.objectContaining({
          tags: ['community'],
        }),
      }));
    });

    it('applies untagged generic-site events without calling the tag assigner', async () => {
      const result = loadFixture('result-discovery-valid-completed.json');
      result.proposals.events[0].draft.tags = [];
      result.proposals.curationJobs[0].defaultTags = [];
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      const applied = await applyComputeResult(req, {
        result,
        preview,
        idempotencyKey: 'apply:generic-untagged',
        actor: 'admin@example.com',
      });

      expect(assignTags).not.toHaveBeenCalled();
      expect(publishIngestEvent).toHaveBeenCalledWith(req, expect.objectContaining({
        overrides: expect.objectContaining({
          tags: [],
        }),
      }));
      expect(applied.summary.creates).toBeGreaterThan(0);
    });

    it('does not publish untagged luma rows when the tag assigner is down', async () => {
      assignTags.mockResolvedValue({
        error: 'Anthropic API key is not configured.',
        status: 503,
        code: 'LLM_NOT_CONFIGURED',
      });
      const result = loadFixture('result-refresh-valid-completed.json');
      result.proposals.events[0].draft.tags = [];
      result.proposals.events[0].basedOnEventVersion = null;
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      const applied = await applyComputeResult(req, {
        result,
        preview,
        idempotencyKey: 'apply:native-assigner-down',
        actor: 'admin@example.com',
      });

      expect(publishIngestEvent).not.toHaveBeenCalled();
      expect(applied.summary.skipped).toBe(1);
      expect(applied.summary.creates + applied.summary.updates).toBe(0);
      expect(applied.skippedRows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: NATIVE_TAGS_REQUIRED,
          message: expect.stringContaining('Anthropic'),
        }),
      ]));
    });

    it('still applies tagged luma rows when the tag assigner is down', async () => {
      assignTags.mockResolvedValue({
        error: 'Anthropic API key is not configured.',
        status: 503,
        code: 'LLM_NOT_CONFIGURED',
      });
      const result = loadFixture('result-refresh-valid-completed.json');
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      await applyComputeResult(req, {
        result,
        preview,
        idempotencyKey: 'apply:native-tagged-assigner-down',
        actor: 'admin@example.com',
      });

      expect(assignTags).not.toHaveBeenCalled();
      expect(publishIngestEvent).toHaveBeenCalledWith(req, expect.objectContaining({
        overrides: expect.objectContaining({
          tags: ['community'],
        }),
      }));
    });

    it('leaves a stored job review-required when every native row needs tags', async () => {
      assignTags.mockResolvedValue({
        error: 'Anthropic API key is not configured.',
        status: 503,
        code: 'LLM_NOT_CONFIGURED',
      });
      const externalJobId = 'job:refresh-native-tags-required';
      const result = loadFixture('result-refresh-valid-completed.json');
      result.jobId = externalJobId;
      result.proposals.events[0].draft.tags = [];
      result.proposals.events[0].basedOnEventVersion = null;
      await createComputeJob(req, {
        externalJobId,
        kind: 'city-curation-refresh',
        cityKey: 'iowacity',
        contractVersion: '1',
        contextVersion: result.basedOnContextVersion,
        createIdempotencyKey: 'idem:create-native-tags-required',
        requestedAt: new Date().toISOString(),
        origin: { type: 'admin' },
        options: {},
      });
      const claim = await claimNextPendingJob(req, {
        kind: 'city-curation-refresh',
        workerId: 'worker-1',
        now: new Date(),
      });
      await startComputeJob(req, {
        externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-1',
        now: new Date(),
      });
      await submitComputeJobResult(req, {
        externalJobId,
        leaseToken: claim.job.lease.token,
        workerId: 'worker-1',
        result,
        now: new Date(),
      });
      const preview = await previewComputeResult(req, result, {
        currentContextVersion: result.basedOnContextVersion,
      });

      const applied = await applyStoredComputeJob(req, externalJobId, {
        tenantKey: 'iowacity',
        idempotencyKey: 'apply:native-tags-required',
        preview,
        actor: 'admin@example.com',
      });

      expect(applied.skipCode).toBe(NATIVE_TAGS_REQUIRED);
      expect(applied.job.status).toBe('review-required');
      expect(applied.job.applicationAudit.appliedAt).toBeFalsy();
      expect(applied.job.applicationAudit.errorCode).toBe(NATIVE_TAGS_REQUIRED);
      expect(publishIngestEvent).not.toHaveBeenCalled();
      expect(await findJobByExternalId(req, externalJobId)).toMatchObject({
        status: 'review-required',
      });
    });

    it('bounds apply-manifest rows and buckets to schema caps', () => {
      const overflow = buildBoundedApplyManifest(
        Array.from({ length: MAX_APPLICATION_AUDIT_ROWS + 12 }, (_, index) => ({
          entityType: 'event',
          disposition: 'created',
          name: `Event ${index}`,
        })),
      );
      expect(overflow.rows).toHaveLength(MAX_APPLICATION_AUDIT_ROWS);
      expect(overflow.rowOverflowCount).toBe(12);
      expect(overflow.buckets.length).toBeLessThanOrEqual(MAX_APPLICATION_AUDIT_BUCKETS);
      expect(overflow.manifestGeneratedAt).toBeInstanceOf(Date);
    });
  });
});
