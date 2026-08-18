jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
  connectToGlobalDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotIngestPreviewService', () => ({
  GENERIC_SITE_PROVIDER: 'generic-site',
}));
jest.mock('../../services/pivotSiteScrapeService', () => ({
  isSiteScrapeConfigured: jest.fn(() => true),
}));
jest.mock('../../services/pivotCurationRunService', () => ({
  executeCurationRun: jest.fn(),
  resolveRunBatchWeek: jest.fn(),
  // Pure phrasing over the stats a run wrote; stubbing it would only restate it.
  summarizeIngest: (stats = {}) => {
    const written = stats.upserted || 0;
    const refreshed = stats.updated || 0;
    return {
      written,
      refreshed,
      added: Math.max(written - refreshed, 0),
      skipped: stats.skipped || 0,
      failed: stats.failed || 0,
      phrase: written ? `${written} new` : 'nothing new',
    };
  },
  emptyStats: () => ({
    discovered: 0,
    upserted: 0,
    skipped: 0,
    failed: 0,
    updated: 0,
    byBatchWeek: null,
    message: null,
  }),
}));
jest.mock('../../services/pivotDiscoveryRunRecorder', () => ({
  createDiscoveryRun: jest.fn(),
  serializeDiscoveryRun: jest.fn((doc) => doc),
  findOrchestrationRun: jest.fn(),
  findLatestOrchestrationRun: jest.fn(),
  refuseIfPipelineBusy: jest.fn().mockResolvedValue(null),
  watchDiscoveryRunCancel: jest.fn(() => ({ stop: jest.fn() })),
}));
jest.mock('../../utilities/pivotLogger', () => ({ logPivot: jest.fn() }));

const getGlobalModels = require('../../services/getGlobalModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { isSiteScrapeConfigured } = require('../../services/pivotSiteScrapeService');
const {
  executeCurationRun,
  resolveRunBatchWeek,
} = require('../../services/pivotCurationRunService');
const {
  createDiscoveryRun,
  findLatestOrchestrationRun,
  refuseIfPipelineBusy,
} = require('../../services/pivotDiscoveryRunRecorder');
const {
  startCurationBatch,
  executeCurationBatch,
  selectBatchJobs,
  getLatestCurationBatch,
} = require('../../services/pivotCurationBatchService');
const { RATE_LIMIT_ABORT_STREAK } = require('../../services/pivotRunGuard');

const BATCH_ID = '665a1b2c3d4e5f6789012aaa';

function mockReq(overrides = {}) {
  return {
    globalDb: {},
    user: { email: 'ops@meridian.app' },
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    _id: '665a1b2c3d4e5f678901200a',
    tenantKey: 'iowacity',
    label: 'The Englert',
    url: 'https://englert.org/events',
    provider: 'generic-site',
    defaultTags: ['live-music'],
    enabled: true,
    ...overrides,
  };
}

/** A recorder that remembers what it was told, so steps can be asserted. */
function fakeRecorder() {
  const steps = [];
  const counters = {};
  return {
    runId: BATCH_ID,
    enabled: true,
    steps,
    counters,
    finished: null,
    step: (entry) => steps.push(entry),
    setPhase: jest.fn(),
    bumpCounters: (next) => {
      for (const [key, value] of Object.entries(next || {})) {
        counters[key] = (counters[key] || 0) + value;
      }
    },
    flush: jest.fn(),
    finish: jest.fn(function finish(result) {
      this.finished = result;
      return Promise.resolve();
    }),
  };
}

describe('pivotCurationBatchService', () => {
  let PivotCurationJob;
  let PivotCurationRun;
  let jobList;
  let finishedRuns;

  beforeEach(() => {
    jest.clearAllMocks();
    jobList = [job()];
    finishedRuns = {};

    PivotCurationJob = {
      find: jest.fn(() => ({
        sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(jobList) })),
      })),
      findByIdAndUpdate: jest.fn().mockResolvedValue(undefined),
    };
    PivotCurationRun = {
      create: jest.fn(async (doc) => ({ ...doc, _id: `run-${doc.jobId}` })),
      findById: jest.fn((id) => ({
        lean: jest.fn().mockResolvedValue(
          finishedRuns[id] || {
            status: 'completed',
            stats: { upserted: 3, skipped: 1, failed: 0, byBatchWeek: { '2026-W33': 3 } },
          },
        ),
      })),
    };

    getGlobalModels.mockReturnValue({ PivotCurationJob, PivotCurationRun });
    resolvePivotTenant.mockResolvedValue({
      tenant: { tenantKey: 'iowacity', name: 'Iowa City' },
    });
    resolveRunBatchWeek.mockReturnValue({ batchWeek: '2026-W33' });
    createDiscoveryRun.mockImplementation(async () => fakeRecorder());
    executeCurationRun.mockResolvedValue(undefined);
    isSiteScrapeConfigured.mockReturnValue(true);
  });

  describe('selectBatchJobs', () => {
    it('leaves out jobs a crawl could not run', async () => {
      jobList = [
        job({ _id: 'a' }),
        job({ _id: 'b', provider: 'manual-json' }),
        job({ _id: 'c', url: null }),
      ];

      const jobs = await selectBatchJobs(mockReq(), { tenantKey: 'iowacity' });

      expect(jobs.map((row) => row._id)).toEqual(['a']);
    });

    it('includes luma and partiful jobs alongside generic-site', async () => {
      jobList = [
        job({ _id: 'site', provider: 'generic-site' }),
        job({
          _id: 'luma',
          provider: 'luma',
          url: 'https://luma.com/iowa-city',
        }),
        job({
          _id: 'partiful',
          provider: 'partiful',
          url: 'https://partiful.com/explore/iowa-city',
        }),
        job({ _id: 'paste', provider: 'manual-json', url: null }),
      ];

      const jobs = await selectBatchJobs(mockReq(), { tenantKey: 'iowacity' });

      expect(jobs.map((row) => row._id)).toEqual(['site', 'luma', 'partiful']);
    });

    it('asks the database for enabled jobs, oldest run first', async () => {
      const sort = jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) }));
      PivotCurationJob.find.mockReturnValue({ sort });

      await selectBatchJobs(mockReq(), { tenantKey: 'iowacity' });

      expect(PivotCurationJob.find).toHaveBeenCalledWith({
        tenantKey: 'iowacity',
        enabled: { $ne: false },
      });
      // Oldest first, so a batch cut short by throttling makes progress on a
      // different part of the city next time.
      expect(sort).toHaveBeenCalledWith({ lastRunAt: 1, createdAt: 1 });
    });

    it('narrows to the requested ids, ignoring ones that are not ids', async () => {
      await selectBatchJobs(mockReq(), {
        tenantKey: 'iowacity',
        jobIds: ['665a1b2c3d4e5f678901200a', 'nonsense'],
      });

      expect(PivotCurationJob.find).toHaveBeenCalledWith(
        expect.objectContaining({ _id: { $in: ['665a1b2c3d4e5f678901200a'] } }),
      );
    });
  });

  describe('startCurationBatch', () => {
    it('refuses while another discovery or refresh is still open', async () => {
      refuseIfPipelineBusy.mockResolvedValueOnce({
        error: 'A discovery or refresh run is already in progress. Wait for it to finish, or Stop it.',
        status: 409,
        code: 'PIPELINE_BUSY',
      });

      const result = await startCurationBatch(mockReq(), { tenantKey: 'iowacity' });

      expect(result.code).toBe('PIPELINE_BUSY');
      expect(createDiscoveryRun).not.toHaveBeenCalled();
    });

    it('returns a run id to watch without waiting for the crawl', async () => {
      const result = await startCurationBatch(mockReq(), { tenantKey: 'iowacity' });

      expect(result.data).toMatchObject({
        runId: BATCH_ID,
        tenantKey: 'iowacity',
        batchWeek: '2026-W33',
        jobs: 1,
      });
      expect(createDiscoveryRun).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'curation-batch', phase: 'planning' }),
      );
    });

    it('refuses a city with nothing to crawl rather than recording an empty run', async () => {
      jobList = [];

      const result = await startCurationBatch(mockReq(), { tenantKey: 'iowacity' });

      expect(result.code).toBe('NO_BATCH_JOBS');
      expect(createDiscoveryRun).not.toHaveBeenCalled();
    });

    it('refuses before spending a record when scraping is unconfigured', async () => {
      isSiteScrapeConfigured.mockReturnValue(false);

      const result = await startCurationBatch(mockReq(), { tenantKey: 'iowacity' });

      expect(result.code).toBe('SITE_SCRAPE_NOT_CONFIGURED');
      expect(createDiscoveryRun).not.toHaveBeenCalled();
    });

    it('allows native-only batches without a scrape key', async () => {
      isSiteScrapeConfigured.mockReturnValue(false);
      jobList = [
        job({ _id: 'luma', provider: 'luma', url: 'https://luma.com/iowa-city' }),
        job({
          _id: 'partiful',
          provider: 'partiful',
          url: 'https://partiful.com/explore/iowa-city',
        }),
      ];

      const result = await startCurationBatch(mockReq(), { tenantKey: 'iowacity' });

      expect(result.error).toBeUndefined();
      expect(result.data.jobs).toBe(2);
      expect(result.data.skippedGenericSite).toBe(0);
    });

    it('skips generic-site in a mixed batch when the scrape key is missing', async () => {
      isSiteScrapeConfigured.mockReturnValue(false);
      jobList = [
        job({ _id: 'site', provider: 'generic-site' }),
        job({ _id: 'luma', provider: 'luma', url: 'https://luma.com/iowa-city' }),
      ];

      const result = await startCurationBatch(mockReq(), { tenantKey: 'iowacity' });

      expect(result.error).toBeUndefined();
      expect(result.data.jobs).toBe(1);
      expect(result.data.skippedGenericSite).toBe(1);
    });

    it('crawls generic-site and native together when scraping is configured', async () => {
      jobList = [
        job({ _id: 'site', provider: 'generic-site' }),
        job({ _id: 'luma', provider: 'luma', url: 'https://luma.com/iowa-city' }),
      ];

      const result = await startCurationBatch(mockReq(), { tenantKey: 'iowacity' });

      expect(result.error).toBeUndefined();
      expect(result.data.jobs).toBe(2);
      expect(result.data.skippedGenericSite).toBe(0);
    });
  });

  describe('executeCurationBatch', () => {
    it('gives each job its own run record, tagged with the batch', async () => {
      const recorder = fakeRecorder();

      await executeCurationBatch({
        tenantKey: 'iowacity',
        batchWeek: '2026-W33',
        recorder,
      });

      expect(PivotCurationRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantKey: 'iowacity',
          batchWeek: '2026-W33',
          parentBatchId: BATCH_ID,
          status: 'queued',
        }),
      );
      // Per-job history has to survive, so the job's own last-run fields update
      // exactly as they would from a single Run click.
      expect(PivotCurationJob.findByIdAndUpdate).toHaveBeenCalled();
      expect(executeCurationRun).toHaveBeenCalledTimes(1);
    });

    it('recrawls native jobs without a scrape key and skips generic-site', async () => {
      isSiteScrapeConfigured.mockReturnValue(false);
      jobList = [
        job({ _id: 'site', provider: 'generic-site' }),
        job({ _id: 'luma', provider: 'luma', url: 'https://luma.com/iowa-city' }),
      ];
      const recorder = fakeRecorder();

      await executeCurationBatch({
        tenantKey: 'iowacity',
        batchWeek: '2026-W33',
        recorder,
      });

      expect(PivotCurationRun.create).toHaveBeenCalledTimes(1);
      expect(PivotCurationRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'luma',
          provider: 'luma',
          url: 'https://luma.com/iowa-city',
        }),
      );
      expect(recorder.steps[0]).toMatchObject({
        kind: 'plan',
        tone: 'warn',
      });
      expect(recorder.steps[0].detail).toMatch(/website job/);
    });

    it('totals what the jobs published', async () => {
      jobList = [job({ _id: 'a' }), job({ _id: 'b' })];
      const recorder = fakeRecorder();

      const result = await executeCurationBatch({
        tenantKey: 'iowacity',
        batchWeek: '2026-W33',
        recorder,
      });

      expect(result.jobsRun).toBe(2);
      expect(result.events).toEqual({ upserted: 6, added: 6, skipped: 2, failed: 0 });
      expect(recorder.counters.eventsUpserted).toBe(6);
      expect(recorder.finished.status).toBe('completed');
    });

    it('keeps going when one source fails', async () => {
      jobList = [job({ _id: 'a' }), job({ _id: 'b' })];
      finishedRuns['run-a'] = {
        status: 'failed',
        errorCode: 'SITE_SCRAPE_UNPARSEABLE',
        error: 'Website scrape returned no structured data.',
        stats: {},
      };
      const recorder = fakeRecorder();

      const result = await executeCurationBatch({
        tenantKey: 'iowacity',
        batchWeek: '2026-W33',
        recorder,
      });

      expect(result.aborted).toBeFalsy();
      expect(result.jobsRun).toBe(1);
      expect(recorder.counters.jobsFailed).toBe(1);
    });

    it('stops the batch once throttling is sustained, and says why', async () => {
      jobList = Array.from({ length: RATE_LIMIT_ABORT_STREAK + 4 }, (_, i) =>
        job({ _id: `j${i}` }),
      );
      for (let i = 0; i < jobList.length; i += 1) {
        finishedRuns[`run-j${i}`] = {
          status: 'failed',
          errorCode: 'SITE_SCRAPE_RATE_LIMITED',
          error: 'Website scraping is rate limited; retry shortly.',
          stats: {},
        };
      }
      const recorder = fakeRecorder();

      const result = await executeCurationBatch({
        tenantKey: 'iowacity',
        batchWeek: '2026-W33',
        recorder,
      });

      expect(result.aborted?.code).toBe('SITE_SCRAPE_RATE_LIMITED');
      expect(recorder.finished.status).toBe('failed');
      expect(recorder.steps.some((step) => step.kind === 'abort')).toBe(true);
      // The point of stopping is not crawling the rest into the same wall.
      expect(executeCurationRun.mock.calls.length).toBeLessThan(jobList.length);
    });

    it('finishes cleanly when every job disappeared before it started', async () => {
      jobList = [];
      const recorder = fakeRecorder();

      const result = await executeCurationBatch({
        tenantKey: 'iowacity',
        batchWeek: '2026-W33',
        recorder,
      });

      expect(result.jobsRun).toBe(0);
      expect(recorder.finished.status).toBe('completed');
      expect(executeCurationRun).not.toHaveBeenCalled();
    });
  });

  describe('getLatestCurationBatch', () => {
    it('asks only for batch runs, and omits the timeline by default', async () => {
      findLatestOrchestrationRun.mockResolvedValue(null);

      await getLatestCurationBatch(mockReq(), { tenantKey: 'iowacity' });

      expect(findLatestOrchestrationRun).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'curation-batch', includeSteps: false }),
      );
    });
  });
});
