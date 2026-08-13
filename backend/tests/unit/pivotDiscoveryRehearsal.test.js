jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotDiscoveryRunRecorder', () => ({
  createDiscoveryRun: jest.fn(),
  watchDiscoveryRunCancel: jest.fn(() => ({ stop: jest.fn() })),
}));
jest.mock('../../services/pivotSiteScrapeService', () => ({
  searchSites: jest.fn(),
  mapSite: jest.fn(),
  scrapeSiteEvents: jest.fn(),
}));
jest.mock('../../services/pivotCurationJobService', () => ({
  createCurationJob: jest.fn(),
}));
jest.mock('../../connectionsManager', () => ({
  connectToGlobalDatabase: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../utilities/pivotLogger', () => ({ logPivot: jest.fn() }));

const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { createDiscoveryRun } = require('../../services/pivotDiscoveryRunRecorder');
const { searchSites, mapSite, scrapeSiteEvents } = require('../../services/pivotSiteScrapeService');
const { createCurationJob } = require('../../services/pivotCurationJobService');
const {
  startCitySourceDiscoveryRehearsal,
  playRehearsal,
} = require('../../services/pivotDiscoveryRehearsal');

const RUN_ID = '665a1b2c3d4e5f6789012377';

function mockReq() {
  return { globalDb: {}, user: { email: 'ops@meridian.app' } };
}

function fakeRecorder() {
  return {
    runId: RUN_ID,
    enabled: true,
    steps: [],
    counters: {},
    phases: [],
    finished: null,
    step(entry) {
      this.steps.push(entry);
    },
    setPhase(phase) {
      this.phases.push(phase);
    },
    bumpCounters(counters) {
      for (const [key, value] of Object.entries(counters)) {
        this.counters[key] = (this.counters[key] || 0) + value;
      }
    },
    async finish(result) {
      this.finished = result;
    },
  };
}

describe('pivotDiscoveryRehearsal', () => {
  let recorder;

  beforeEach(() => {
    jest.clearAllMocks();
    recorder = fakeRecorder();
    createDiscoveryRun.mockResolvedValue(recorder);
    resolvePivotTenant.mockResolvedValue({
      tenant: {
        tenantKey: 'iowacity',
        name: 'Iowa City',
        location: 'Iowa City, IA',
        pivotDropTimezone: 'America/Chicago',
      },
    });
  });

  describe('startCitySourceDiscoveryRehearsal', () => {
    it('flags the run as a rehearsal with a zero-call ceiling', async () => {
      const result = await startCitySourceDiscoveryRehearsal(mockReq(), {
        tenantKey: 'iowacity',
      });

      expect(result.data).toMatchObject({ started: true, rehearsal: true, runId: RUN_ID });
      expect(createDiscoveryRun).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          rehearsal: true,
          createJobs: false,
          plan: expect.objectContaining({ maxOutboundCalls: 0 }),
        }),
      );
    });

    it('uses the real seed queries, so what is rehearsed is the real coverage', async () => {
      await startCitySourceDiscoveryRehearsal(mockReq(), { tenantKey: 'iowacity' });

      const [, created] = createDiscoveryRun.mock.calls[0];
      expect(created.plan.queries).toBe(45);
      expect(created.plan.categories).toBe(18);
    });

    it('propagates an unknown tenant instead of rehearsing a nonexistent city', async () => {
      resolvePivotTenant.mockResolvedValue({
        error: 'Unknown tenant.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });

      const result = await startCitySourceDiscoveryRehearsal(mockReq(), { tenantKey: 'nope' });

      expect(result.code).toBe('TENANT_NOT_FOUND');
      expect(createDiscoveryRun).not.toHaveBeenCalled();
    });

    it('rejects a tag filter that yields no queries', async () => {
      const result = await startCitySourceDiscoveryRehearsal(mockReq(), {
        tenantKey: 'iowacity',
        tags: ['not-a-real-tag'],
      });

      expect(result.code).toBe('NO_DISCOVERY_QUERIES');
    });

    it('fails loudly when there is nowhere to record, since the console would be blank', async () => {
      createDiscoveryRun.mockResolvedValue({ runId: null, enabled: false });

      const result = await startCitySourceDiscoveryRehearsal(mockReq(), {
        tenantKey: 'iowacity',
      });

      expect(result.code).toBe('REHEARSAL_NOT_RECORDABLE');
    });
  });

  describe('playRehearsal', () => {
    const context = {
      city: 'Iowa City',
      queries: [
        { query: 'live music venues Iowa City', tag: 'live-music' },
        { query: 'Iowa City events calendar this week', tag: null },
      ],
      timezone: 'America/Chicago',
      maxCandidates: 20,
      delayMs: 0,
    };

    it('makes no outbound calls and creates nothing', async () => {
      await playRehearsal(recorder, context);

      expect(searchSites).not.toHaveBeenCalled();
      expect(mapSite).not.toHaveBeenCalled();
      expect(scrapeSiteEvents).not.toHaveBeenCalled();
      expect(createCurationJob).not.toHaveBeenCalled();
    });

    it('walks the same phases in the same order as a real run', async () => {
      await playRehearsal(recorder, context);

      expect(recorder.phases).toEqual(['filtering', 'qualifying', 'registering']);
      expect(recorder.finished).toMatchObject({ status: 'completed' });
    });

    it('demonstrates every decision the pipeline can make', async () => {
      await playRehearsal(recorder, context);

      const kinds = recorder.steps.map((step) => step.kind);
      expect(kinds).toEqual(
        expect.arrayContaining([
          'plan',
          'search',
          'candidates',
          'filter',
          'map',
          'index',
          'scrape',
          'qualify',
          'reject',
          'native',
          'job',
          'done',
        ]),
      );

      const reasons = recorder.steps.map((step) => step.reason).filter(Boolean);
      expect(reasons).toContain('no-index-page');
      expect(reasons).toContain('no-events');
    });

    it('says plainly in the steps themselves that nothing was saved', async () => {
      await playRehearsal(recorder, context);

      const job = recorder.steps.find((step) => step.kind === 'job');
      expect(job.title).toContain('Would save');
      expect(job.detail).toContain('no registry row');

      const done = recorder.steps.find((step) => step.kind === 'done');
      expect(done.detail).toContain('no credits were spent');
    });

    it('carries the city timezone into the extraction step', async () => {
      await playRehearsal(recorder, context);

      const scrape = recorder.steps.find((step) => step.kind === 'scrape');
      expect(scrape.detail).toContain('America/Chicago');
    });

    it('counts a filtered host as skipped rather than checked', async () => {
      await playRehearsal(recorder, context);

      expect(recorder.counters.skippedNonSource).toBe(1);
      expect(recorder.counters.evaluated).toBe(5);
      expect(recorder.counters.maps).toBe(4);
    });
  });
});
