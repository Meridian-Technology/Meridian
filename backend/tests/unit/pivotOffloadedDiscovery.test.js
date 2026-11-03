jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotCurationJobService', () => ({
  createCurationJob: jest.fn(),
  updateCurationJob: jest.fn(),
}));
jest.mock('../../services/pivotCurationRunService', () => ({
  ingestEntries: jest.fn(),
  resolveRunBatchWeek: jest.fn(() => ({ batchWeek: '2026-W37' })),
  executeCurationRun: jest.fn(),
  emptyStats: () => ({
    discovered: 0,
    upserted: 0,
    skipped: 0,
    failed: 0,
    updated: 0,
    message: null,
    byBatchWeek: null,
  }),
  summarizeIngest: (stats = {}) => ({
    written: stats.upserted || 0,
    refreshed: stats.updated || 0,
    added: Math.max((stats.upserted || 0) - (stats.updated || 0), 0),
    skipped: stats.skipped || 0,
    failed: stats.failed || 0,
    phrase: stats.upserted ? `${stats.upserted} new` : 'nothing new',
  }),
}));
jest.mock('../../services/pivotCurationBatchService', () => ({
  startCurationBatch: jest.fn(),
}));
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
  connectToGlobalDatabase: jest.fn(),
}));
jest.mock('../../utilities/pivotLogger', () => ({ logPivot: jest.fn() }));
jest.mock('../../services/pivotSiteScrapeService', () => {
  const actual = jest.requireActual('../../services/pivotSiteScrapeService');
  return {
    ...actual,
    searchSites: jest.fn(),
    mapSite: jest.fn(),
    scrapeSiteEvents: jest.fn(),
    isSiteScrapeConfigured: jest.fn(() => true),
  };
});

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  searchSites,
  mapSite,
  scrapeSiteEvents,
} = require('../../services/pivotSiteScrapeService');
const { nullRecorder } = require('../../services/pivotDiscoveryRunRecorder');
const {
  validateExecutionResult,
  collectForbiddenImportableViolations,
} = require('../../utilities/pivotAdminComputeJobContract');
const {
  executeOffloadedCitySourceDiscovery,
} = require('../../services/pivotOffloadedDiscoveryService');

describe('pivotOffloadedDiscoveryService (Phase 2, Step 2.2)', () => {
  const now = new Date('2026-09-08T20:45:00.000Z');
  const jobId = 'job:discovery-iowacity-001';
  const idempotencyKey = 'idem:discovery-iowacity-001';

  const contextSnapshot = {
    contractVersion: '1',
    jobId,
    scheduleOccurrenceId: null,
    kind: 'city-source-discovery',
    cityKey: 'iowacity',
    implementationRevision: 'meridian-backend@2026.09.08',
    contextVersion: 'ctx:iowacity.discovery.v3',
    snapshotAt: '2026-09-08T20:00:00.000Z',
    tenant: {
      cityKey: 'iowacity',
      name: 'Iowa City',
      location: 'Iowa City, IA',
      timezone: 'America/Chicago',
    },
    discovery: {
      flow: 'firecrawl-only',
      lumaSlug: null,
      partifulSlug: null,
      runNative: false,
      runFirecrawl: true,
    },
    sources: [
      {
        recordVersion: 'rv:src-luma-1',
        host: 'luma.com',
        url: 'https://luma.com/iowa-city',
        label: 'Luma Iowa City',
        provider: 'luma',
        status: 'qualified',
        enabled: true,
        seedTags: ['community'],
        rejectedReason: null,
      },
    ],
    curationJobs: [],
    organizers: [],
    providerCapabilities: {
      firecrawlConfigured: true,
      nativeProviders: ['luma', 'partiful'],
    },
  };

  let PivotCitySource;
  let PivotCurationJob;
  let PivotCurationRun;
  let PivotOrganizer;

  beforeEach(() => {
    jest.clearAllMocks();

    PivotCitySource = {
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
    };
    PivotCurationJob = {
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      create: jest.fn(),
    };
    PivotCurationRun = {
      create: jest.fn(),
      findById: jest.fn(),
    };
    PivotOrganizer = { find: jest.fn() };

    getGlobalModels.mockImplementation((_req, ...names) => {
      const all = {
        PivotCitySource,
        PivotCurationJob,
        PivotCurationRun,
        PivotOrganizer,
      };
      const out = {};
      for (const name of names) {
        if (all[name]) out[name] = all[name];
      }
      return out;
    });

    searchSites.mockResolvedValue({
      results: [{ url: 'https://example-theatre.org/', title: 'Example Theatre' }],
    });
    mapSite.mockResolvedValue({ links: [{ url: 'https://example-theatre.org/events' }] });
    scrapeSiteEvents.mockResolvedValue({
      listLabel: 'Example Theatre Events',
      drafts: [
        {
          draft: {
            name: 'Jazz Night',
            start_time: '2026-09-12T01:00:00.000Z',
            sourceUrl: 'https://example-theatre.org/events/show-1',
            location: 'Example Theatre',
            hostName: 'Example Theatre',
          },
        },
      ],
    });
  });

  async function runDiscovery(overrides = {}) {
    return executeOffloadedCitySourceDiscovery({
      contextSnapshot,
      jobId,
      idempotencyKey,
      now,
      implementationRevision: 'relay-worker@2026.09.08',
      progressRecorder: nullRecorder(),
      providers: {
        searchSites,
        mapSite,
        scrapeSiteEvents,
      },
      runOptions: {
        maxQueries: 1,
        createJobs: true,
        ingestEvents: true,
      },
      ...overrides,
    });
  }

  it('returns contract-valid source, job, and event proposals from a context snapshot', async () => {
    const result = await runDiscovery();
    expect(result.data?.result).toBeDefined();

    const executionResult = result.data.result;
    expect(validateExecutionResult(executionResult)).toEqual({ valid: true });
    expect(collectForbiddenImportableViolations(executionResult)).toEqual([]);
    expect(executionResult).toMatchObject({
      jobId,
      idempotencyKey,
      kind: 'city-source-discovery',
      cityKey: 'iowacity',
      basedOnContextVersion: 'ctx:iowacity.discovery.v3',
      outcome: 'completed',
    });
    expect(executionResult.proposals.sources).toEqual([
      expect.objectContaining({
        action: 'create',
        host: 'example-theatre.org',
        status: 'qualified',
        provider: 'generic-site',
      }),
    ]);
    expect(executionResult.proposals.curationJobs).toEqual([
      expect.objectContaining({
        action: 'create',
        label: 'Example Theatre Events',
        provider: 'generic-site',
        linkedSourceHost: 'example-theatre.org',
      }),
    ]);
    expect(executionResult.proposals.events).toEqual([
      expect.objectContaining({
        action: 'upsert',
        sourceUrl: 'https://example-theatre.org/events/show-1',
        draft: expect.objectContaining({ name: 'Jazz Night' }),
      }),
    ]);
    expect(executionResult.summary).toMatchObject({
      searched: 1,
      qualified: 1,
      eventsProposed: 1,
    });
  });

  it('does not write through production repositories when providers succeed', async () => {
    await runDiscovery();

    expect(PivotCitySource.findOneAndUpdate).not.toHaveBeenCalled();
    expect(PivotCitySource.create).not.toHaveBeenCalled();
    expect(PivotCurationJob.create).not.toHaveBeenCalled();
    expect(PivotCurationJob.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(PivotCurationRun.create).not.toHaveBeenCalled();
  });

  it('returns the complete candidate when a computed result fails contract validation', async () => {
    const response = await runDiscovery({ implementationRevision: 'invalid revision' });

    expect(response).toMatchObject({
      code: 'DISCOVERY_RESULT_INVALID',
      repairCandidate: {
        jobId,
        kind: 'city-source-discovery',
        proposals: {
          events: [expect.objectContaining({ sourceUrl: 'https://example-theatre.org/events/show-1' })],
        },
      },
    });
    expect(response.data).toBeUndefined();
  });

  it('upgrades an http calendar page to https in source and job proposals', async () => {
    mapSite.mockResolvedValue({ links: [{ url: 'http://example-theatre.org/events' }] });

    const result = await runDiscovery();
    expect(result.data?.result).toBeDefined();

    const executionResult = result.data.result;
    expect(validateExecutionResult(executionResult)).toEqual({ valid: true });
    expect(executionResult.proposals.sources).toEqual([
      expect.objectContaining({
        url: 'https://example-theatre.org/events',
        evidence: expect.objectContaining({ indexUrl: 'https://example-theatre.org/events' }),
      }),
    ]);
    expect(executionResult.proposals.curationJobs).toEqual([
      expect.objectContaining({ url: 'https://example-theatre.org/events' }),
    ]);
  });

  it('completes with its proposals when one site map times out', async () => {
    searchSites.mockResolvedValue({
      results: [
        { url: 'https://example-theatre.org/', title: 'Example Theatre' },
        { url: 'https://slow-music-hall.org/', title: 'Slow Music Hall' },
      ],
    });
    mapSite.mockImplementation(async ({ url }) => (url.includes('slow-music-hall.org')
      ? { error: 'Website map timed out after 30 seconds.', status: 504, code: 'SITE_SCRAPE_TIMEOUT' }
      : { links: [{ url: 'https://example-theatre.org/events' }] }));

    const result = await runDiscovery();
    expect(result.data?.result).toBeDefined();

    const executionResult = result.data.result;
    expect(validateExecutionResult(executionResult)).toEqual({ valid: true });
    expect(executionResult.outcome).toBe('completed');
    expect(executionResult.failure).toBeUndefined();
    expect(executionResult.proposals.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ host: 'example-theatre.org', status: 'qualified' }),
    ]));
    expect(executionResult.proposals.curationJobs).toHaveLength(1);
    expect(executionResult.proposals.events).toHaveLength(1);
  });

  it('fails with a reason when a provider failure aborts the run', async () => {
    mapSite.mockResolvedValue({
      error: 'Firecrawl rejected the API key.',
      status: 401,
      code: 'SITE_SCRAPE_AUTH_FAILED',
    });

    const result = await runDiscovery();
    const executionResult = result.data.result;
    expect(executionResult.outcome).toBe('failed');
    expect(executionResult.failure).toEqual({
      code: 'SITE_SCRAPE_AUTH_FAILED',
      message: 'Firecrawl rejected the API key.',
    });
  });

  it('includes rejected source proposals without creating curation jobs', async () => {
    scrapeSiteEvents.mockResolvedValue({
      listLabel: 'Empty Calendar',
      drafts: [],
    });

    const result = await runDiscovery();
    expect(result.data.result.proposals.sources).toEqual([
      expect.objectContaining({
        host: 'example-theatre.org',
        status: 'rejected',
        rejectedReason: 'no-events',
      }),
    ]);
    expect(result.data.result.proposals.curationJobs).toEqual([]);
    expect(result.data.result.summary.rejected).toBe(1);
  });

  it('records progress through an injected job-local recorder', async () => {
    const progressRecorder = {
      runId: 'worker-attempt-1',
      enabled: true,
      step: jest.fn(),
      setPhase: jest.fn(),
      bumpCounters: jest.fn(),
      finish: jest.fn(),
      flush: jest.fn(),
    };

    await runDiscovery({ progressRecorder });

    expect(progressRecorder.step).toHaveBeenCalled();
    expect(progressRecorder.finish).toHaveBeenCalled();
  });

  it('rejects stale expected context versions', async () => {
    const result = await runDiscovery({
      expectedContextVersion: 'ctx:iowacity.discovery.v2',
    });

    expect(result.status).toBe(409);
    expect(result.code).toBe('DISCOVERY_CONTEXT_STALE');
  });

  it('fails closed when Firecrawl is required but unavailable in context', async () => {
    const result = await runDiscovery({
      contextSnapshot: {
        ...contextSnapshot,
        providerCapabilities: {
          firecrawlConfigured: false,
          nativeProviders: ['luma', 'partiful'],
        },
      },
    });

    expect(result.status).toBe(503);
    expect(result.code).toBe('SITE_SCRAPE_NOT_CONFIGURED');
  });

  it('uses actual worker capabilities instead of trusting production provider flags', async () => {
    const result = await runDiscovery({
      workerCapabilities: {
        firecrawlConfigured: false,
        nativeProviders: ['luma', 'partiful'],
      },
    });

    expect(result.status).toBe(503);
    expect(result.code).toBe('SITE_SCRAPE_NOT_CONFIGURED');
    expect(searchSites).not.toHaveBeenCalled();
  });

  it('returns a cancelled artifact when the worker cancellation signal is set', async () => {
    const result = await runDiscovery({ shouldCancel: () => true });

    expect(result.data.result.outcome).toBe('cancelled');
    expect(searchSites).not.toHaveBeenCalled();
  });
});
