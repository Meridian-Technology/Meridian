jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
  connectToGlobalDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
  publishIngestEvent: jest.fn(),
}));
jest.mock('../../services/pivotIngestPreviewService', () => ({
  previewIngestUrl: jest.fn(),
  MAX_CRAWL_BATCH_EVENTS: null,
  resolveBatchLimit: (n) => {
    if (n == null || n === '') return null;
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.min(Math.floor(num), 10_000);
  },
}));
jest.mock('../../services/pivotBatchService', () => ({
  ensurePivotBatch: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  connectToDatabase,
  connectToGlobalDatabase,
} = require('../../connectionsManager');
const {
  resolvePivotTenant,
  publishIngestEvent,
} = require('../../services/pivotIngestPublishService');
const { previewIngestUrl } = require('../../services/pivotIngestPreviewService');
const { ensurePivotBatch } = require('../../services/pivotBatchService');
const {
  startCurationJobRun,
  getCurationRun,
  executeCurationRun,
  resolveRunBatchWeek,
  upsertDiscoveredEntry,
} = require('../../services/pivotCurationRunService');

const JOB_ID = '665a1b2c3d4e5f6789012345';
const RUN_ID = '665a1b2c3d4e5f6789012999';

function mockReq(overrides = {}) {
  return {
    globalDb: {},
    user: { email: 'ops@meridian.app', globalUserId: '507f191e810c19729de860ea' },
    ...overrides,
  };
}

function leanJob(overrides = {}) {
  return {
    _id: JOB_ID,
    tenantKey: 'nyc',
    label: 'Partiful explore',
    url: 'https://partiful.com/explore/brooklyn',
    provider: 'partiful',
    defaultBatchWeekStrategy: 'next-drop',
    defaultTags: ['nightlife'],
    enabled: true,
    ...overrides,
  };
}

describe('pivotCurationRunService', () => {
  let PivotCurationJob;
  let PivotCurationRun;

  beforeEach(() => {
    jest.clearAllMocks();
    PivotCurationJob = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    PivotCurationRun = {
      create: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    };
    getGlobalModels.mockReturnValue({ PivotCurationJob, PivotCurationRun });
    resolvePivotTenant.mockResolvedValue({
      tenant: { tenantKey: 'nyc', cityDisplayName: 'New York City', pivotPilot: true },
    });
    connectToDatabase.mockResolvedValue({});
    connectToGlobalDatabase.mockResolvedValue({});
    ensurePivotBatch.mockResolvedValue({ data: { batchWeek: '2026-W28', status: 'curating' } });
  });

  describe('resolveRunBatchWeek', () => {
    it('uses explicit batchWeek when provided', () => {
      const result = resolveRunBatchWeek({
        batchWeek: '2026-W28',
        strategy: 'next-drop',
        tenant: { tenantKey: 'nyc', pivotPilot: true },
      });
      expect(result.batchWeek).toBe('2026-W28');
    });

    it('requires batchWeek for explicit strategy', () => {
      const result = resolveRunBatchWeek({
        strategy: 'explicit',
        tenant: { tenantKey: 'nyc', pivotPilot: true },
      });
      expect(result.code).toBe('BATCH_WEEK_REQUIRED');
    });

    it('uses current ISO week for current-iso strategy', () => {
      const result = resolveRunBatchWeek({
        strategy: 'current-iso',
        tenant: { tenantKey: 'nyc', pivotPilot: true },
        now: new Date('2026-07-09T12:00:00.000Z'),
      });
      expect(result.batchWeek).toMatch(/^\d{4}-W\d{2}$/);
    });
  });

  describe('startCurationJobRun', () => {
    it('queues a run and schedules async execution', async () => {
      const immediateSpy = jest
        .spyOn(global, 'setImmediate')
        .mockImplementation(() => {});

      PivotCurationJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(leanJob()),
      });
      const runDoc = {
        _id: RUN_ID,
        tenantKey: 'nyc',
        jobId: JOB_ID,
        batchWeek: '2026-W28',
        status: 'queued',
        maxEvents: null,
        provider: 'partiful',
        url: 'https://partiful.com/explore/brooklyn',
        stats: {
          discovered: 0,
          upserted: 0,
          skipped: 0,
          failed: 0,
          updated: 0,
          message: null,
        },
        failures: [],
        createdBy: 'ops@meridian.app',
        toObject() {
          return this;
        },
      };
      PivotCurationRun.create.mockResolvedValue(runDoc);

      const result = await startCurationJobRun(mockReq(), {
        tenantKey: 'nyc',
        jobId: JOB_ID,
        batchWeek: '2026-W28',
        maxEvents: 120,
      });

      expect(result.data.run.status).toBe('queued');
      expect(result.data.run.batchWeek).toBe('2026-W28');
      expect(PivotCurationRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantKey: 'nyc',
          batchWeek: '2026-W28',
          status: 'queued',
          maxEvents: 120,
        }),
      );
      expect(immediateSpy).toHaveBeenCalled();
      immediateSpy.mockRestore();
    });

    it('defaults to unlimited maxEvents when omitted', async () => {
      const immediateSpy = jest
        .spyOn(global, 'setImmediate')
        .mockImplementation(() => {});

      PivotCurationJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(leanJob()),
      });
      PivotCurationRun.create.mockResolvedValue({
        _id: RUN_ID,
        tenantKey: 'nyc',
        jobId: JOB_ID,
        batchWeek: '2026-W28',
        status: 'queued',
        maxEvents: null,
        toObject() {
          return this;
        },
      });

      await startCurationJobRun(mockReq(), {
        tenantKey: 'nyc',
        jobId: JOB_ID,
        batchWeek: '2026-W28',
      });

      expect(PivotCurationRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          maxEvents: null,
        }),
      );
      immediateSpy.mockRestore();
    });

    it('rejects manual-json jobs', async () => {
      PivotCurationJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(
          leanJob({ provider: 'manual-json', url: null }),
        ),
      });

      const result = await startCurationJobRun(mockReq(), {
        tenantKey: 'nyc',
        jobId: JOB_ID,
        batchWeek: '2026-W28',
      });

      expect(result.code).toBe('PROVIDER_NOT_CRAWLABLE');
      expect(PivotCurationRun.create).not.toHaveBeenCalled();
    });

    it('returns JOB_NOT_FOUND for other tenant jobs', async () => {
      PivotCurationJob.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await startCurationJobRun(mockReq(), {
        tenantKey: 'nyc',
        jobId: JOB_ID,
        batchWeek: '2026-W28',
      });

      expect(result.code).toBe('JOB_NOT_FOUND');
      expect(PivotCurationJob.findOne).toHaveBeenCalledWith({
        _id: JOB_ID,
        tenantKey: 'nyc',
      });
    });
  });

  describe('getCurationRun', () => {
    it('returns a tenant-scoped run', async () => {
      PivotCurationRun.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: RUN_ID,
          tenantKey: 'nyc',
          jobId: JOB_ID,
          batchWeek: '2026-W28',
          status: 'completed',
          stats: {
            discovered: 60,
            upserted: 55,
            skipped: 3,
            failed: 2,
            updated: 10,
            message: null,
          },
          failures: [],
        }),
      });

      const result = await getCurationRun(mockReq(), {
        tenantKey: 'nyc',
        runId: RUN_ID,
      });

      expect(result.data.run.status).toBe('completed');
      expect(result.data.run.stats.discovered).toBe(60);
      expect(PivotCurationRun.findOne).toHaveBeenCalledWith({
        _id: RUN_ID,
        tenantKey: 'nyc',
      });
    });

    it('returns RUN_NOT_FOUND when missing', async () => {
      PivotCurationRun.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await getCurationRun(mockReq(), {
        tenantKey: 'nyc',
        runId: RUN_ID,
      });

      expect(result.code).toBe('RUN_NOT_FOUND');
    });
  });

  describe('upsertDiscoveredEntry', () => {
    it('upserts with draft override and optional tags', async () => {
      publishIngestEvent.mockResolvedValue({
        data: { event: { _id: 'e1' }, created: true, updated: false },
      });

      const result = await upsertDiscoveredEntry(mockReq(), {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        entry: {
          sourceUrl: 'https://partiful.com/e/abc',
          draft: {
            name: 'Party',
            hostName: 'Host',
            location: 'BK',
            start_time: '2026-07-10T20:00:00.000Z',
            source: 'partiful',
            sourceUrl: 'https://partiful.com/e/abc',
          },
        },
        defaultTags: ['nightlife'],
      });

      expect(result.upserted).toBe(true);
      expect(publishIngestEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          tenantKey: 'nyc',
          batchWeek: '2026-W28',
          forceBatchWeek: false,
          url: 'https://partiful.com/e/abc',
          tagsRequired: false,
          overrides: expect.objectContaining({
            tags: ['nightlife'],
            ingestStatus: 'staged',
          }),
        }),
      );
    });

    it('passes forceBatchWeek through to publish', async () => {
      publishIngestEvent.mockResolvedValue({
        data: {
          event: { _id: 'e1', batchWeek: '2026-W28' },
          created: true,
          batchWeek: '2026-W28',
          batchWeekSource: 'forced',
        },
      });

      await upsertDiscoveredEntry(mockReq(), {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        forceBatchWeek: true,
        entry: {
          sourceUrl: 'https://partiful.com/e/abc',
          draft: {
            name: 'Party',
            hostName: 'Host',
            location: 'BK',
            start_time: '2026-07-10T20:00:00.000Z',
            source: 'partiful',
            sourceUrl: 'https://partiful.com/e/abc',
          },
        },
        defaultTags: [],
      });

      expect(publishIngestEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ forceBatchWeek: true, batchWeek: '2026-W28' }),
      );
    });

    it('skips incomplete drafts without aborting', async () => {
      publishIngestEvent.mockResolvedValue({
        error: 'Missing required fields after merge: hostName.',
        status: 400,
        code: 'MISSING_REQUIRED_FIELDS',
      });

      const result = await upsertDiscoveredEntry(mockReq(), {
        tenantKey: 'nyc',
        batchWeek: '2026-W28',
        entry: {
          sourceUrl: 'https://partiful.com/e/abc',
          draft: { name: 'Incomplete', sourceUrl: 'https://partiful.com/e/abc' },
        },
        defaultTags: [],
      });

      expect(result.skipped).toBe(true);
      expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
    });
  });

  describe('executeCurationRun', () => {
    it('processes more than 50 discovered drafts and continues after one failure', async () => {
      const drafts = Array.from({ length: 60 }, (_, i) => ({
        sourceUrl: `https://partiful.com/e/event-${i}`,
        draft: {
          name: `Event ${i}`,
          hostName: 'Host',
          location: 'NYC',
          start_time: '2026-07-10T20:00:00.000Z',
          source: 'partiful',
          sourceUrl: `https://partiful.com/e/event-${i}`,
        },
      }));

      PivotCurationRun.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: RUN_ID,
          tenantKey: 'nyc',
          jobId: JOB_ID,
          batchWeek: '2026-W28',
          status: 'queued',
          maxEvents: null,
          createdBy: 'ops@meridian.app',
        }),
      });
      PivotCurationJob.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(leanJob()),
      });
      previewIngestUrl.mockResolvedValue({
        data: {
          mode: 'batch',
          drafts,
          truncated: false,
        },
      });

      let call = 0;
      publishIngestEvent.mockImplementation(async () => {
        call += 1;
        if (call === 2) {
          return {
            error: 'boom',
            status: 500,
            code: 'UPSERT_FAILED',
          };
        }
        // Alternate weeks so one crawl fills multiple batches.
        const week = call % 2 === 0 ? '2026-W29' : '2026-W28';
        return {
          data: {
            event: { _id: `e${call}`, batchWeek: week },
            created: true,
            updated: false,
            batchWeek: week,
            batchWeekSource: 'event-date',
          },
        };
      });

      const patches = [];
      PivotCurationRun.findByIdAndUpdate.mockImplementation((_id, update) => {
        patches.push(update.$set);
        return { lean: jest.fn().mockResolvedValue(update.$set) };
      });

      await executeCurationRun(RUN_ID);

      expect(previewIngestUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.not.objectContaining({ maxEvents: expect.anything() }),
      );
      expect(previewIngestUrl).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          url: 'https://partiful.com/explore/brooklyn',
          tenantKey: 'nyc',
        }),
      );
      expect(publishIngestEvent).toHaveBeenCalledTimes(60);
      expect(ensurePivotBatch).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ batchWeek: '2026-W28', status: 'curating' }),
      );
      expect(ensurePivotBatch).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ batchWeek: '2026-W29', status: 'curating' }),
      );

      const completed = patches.find((p) => p.status === 'completed');
      expect(completed).toBeTruthy();
      expect(completed.stats.discovered).toBe(60);
      expect(completed.stats.upserted).toBe(59);
      expect(completed.stats.failed).toBe(1);
      expect(completed.stats.byBatchWeek['2026-W28']).toBeGreaterThan(0);
      expect(completed.stats.byBatchWeek['2026-W29']).toBeGreaterThan(0);
      expect(PivotCurationJob.findByIdAndUpdate).toHaveBeenCalledWith(
        JOB_ID,
        expect.objectContaining({
          $set: expect.objectContaining({ lastRunStatus: 'completed' }),
        }),
      );
    });
  });
});
