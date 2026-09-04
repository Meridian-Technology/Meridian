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
  resolveRunBatchWeek: jest.fn(),
  executeCurationRun: jest.fn(),
  emptyStats: (message = null) => ({
    discovered: 0,
    upserted: 0,
    skipped: 0,
    failed: 0,
    updated: 0,
    message,
    byBatchWeek: null,
  }),
  // Pure phrasing over the stats above; stubbing it would only restate it.
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
}));
jest.mock('../../services/pivotCurationBatchService', () => ({
  startCurationBatch: jest.fn(),
}));
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
  connectToGlobalDatabase: jest.fn(),
}));
jest.mock('../../utilities/pivotLogger', () => ({ logPivot: jest.fn() }));
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn().mockResolvedValue(null),
  upsertStoredTenantRow: jest.fn().mockResolvedValue({}),
}));
// Only the network-bound helpers are stubbed; the URL and host guards stay real
// so the tests exercise the filtering discovery actually relies on.
jest.mock('../../services/pivotSiteScrapeService', () => {
  const actual = jest.requireActual('../../services/pivotSiteScrapeService');
  return {
    ...actual,
    searchSites: jest.fn(),
    mapSite: jest.fn(),
    scrapeSiteEvents: jest.fn(),
  };
});

const getGlobalModels = require('../../services/getGlobalModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { createCurationJob, updateCurationJob } = require('../../services/pivotCurationJobService');
const {
  ingestEntries,
  resolveRunBatchWeek,
  executeCurationRun,
} = require('../../services/pivotCurationRunService');
const { startCurationBatch } = require('../../services/pivotCurationBatchService');
const { getTenantByKey, upsertStoredTenantRow } = require('../../services/tenantConfigService');
const {
  searchSites,
  mapSite,
  scrapeSiteEvents,
} = require('../../services/pivotSiteScrapeService');
const {
  discoverCitySources,
  listCitySources,
  startCitySourceDiscovery,
  previewCitySourceDiscovery,
  updateCitySource,
  updateCityDiscoveryConfig,
  getCitySourceDiscoveryRun,
  getLatestCitySourceDiscoveryRun,
  scoreEventIndexUrl,
  pickEventIndexUrl,
  hostFromUrl,
  runPool,
  SEARCH_CONCURRENCY,
  RATE_LIMIT_ABORT_STREAK,
} = require('../../services/pivotSourceDiscoveryService');
const {
  buildDiscoveryQueries,
  isNonSourceHost,
} = require('../../constants/pivotDiscoverySeeds');

const JOB_ID = '665a1b2c3d4e5f6789012345';

function mockReq(overrides = {}) {
  return {
    globalDb: {},
    user: { email: 'ops@meridian.app' },
    ...overrides,
  };
}

/** Echo the upsert back as a saveable doc, matching what Mongoose would return. */
function upsertedDoc(filter, update) {
  return {
    _id: '665a1b2c3d4e5f6789099999',
    tenantKey: filter.tenantKey,
    host: filter.host,
    seedTags: update.$addToSet?.seedTags?.$each || [],
    discoveredVia: update.$setOnInsert?.discoveredVia || null,
    discoveredAt: update.$setOnInsert?.discoveredAt || null,
    enabled: true,
    curationJobId: null,
    ...update.$set,
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe('pivotSourceDiscoveryService', () => {
  let PivotCitySource;
  let PivotCurationJob;
  let PivotCurationRun;
  const originalKey = process.env.FIRECRAWL_API_KEY;

  afterAll(() => {
    if (originalKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = originalKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FIRECRAWL_API_KEY = 'fc-test-key';

    PivotCitySource = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      }),
      findOneAndUpdate: jest.fn((filter, update) =>
        Promise.resolve(upsertedDoc(filter, update)),
      ),
    };
    PivotCurationJob = {
      find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      findByIdAndUpdate: jest.fn().mockResolvedValue(undefined),
    };
    PivotCurationRun = {
      create: jest.fn().mockResolvedValue({ _id: '665a1b2c3d4e5f6789012301' }),
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          status: 'completed',
          stats: { upserted: 0, skipped: 0, failed: 0, updated: 0, byBatchWeek: {} },
        }),
      }),
    };
    const PivotSourceDiscoveryRun = {
      create: jest.fn().mockResolvedValue({ _id: '665a1b2c3d4e5f6789012388' }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      updateMany: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      }),
    };
    getGlobalModels.mockImplementation((req, ...names) => {
      const all = { PivotCitySource, PivotCurationJob, PivotCurationRun, PivotSourceDiscoveryRun };
      const out = {};
      for (const name of names) {
        if (all[name]) out[name] = all[name];
      }
      return out;
    });
    resolvePivotTenant.mockResolvedValue({
      tenant: {
        tenantKey: 'iowacity',
        name: 'Iowa City',
        location: 'Iowa City, IA',
        pivotDropTimezone: 'America/Chicago',
      },
    });
    createCurationJob.mockResolvedValue({ data: { job: { _id: JOB_ID } } });
    updateCurationJob.mockResolvedValue({ data: { job: { _id: JOB_ID } } });
    executeCurationRun.mockResolvedValue(undefined);
    searchSites.mockResolvedValue({ results: [] });
    mapSite.mockResolvedValue({ links: [] });
    scrapeSiteEvents.mockResolvedValue({ listLabel: null, drafts: [] });
    resolveRunBatchWeek.mockReturnValue({ batchWeek: '2026-W33' });
    ingestEntries.mockResolvedValue({
      stats: { upserted: 0, skipped: 0, failed: 0, byBatchWeek: {} },
      events: [],
      failures: [],
    });
    startCurationBatch.mockResolvedValue({ data: { runId: 'batch-1', jobs: 1 } });
  });

  describe('buildDiscoveryQueries', () => {
    it('covers every catalog tag plus city-wide probes', () => {
      const queries = buildDiscoveryQueries({ city: 'Iowa City' });
      const tags = new Set(queries.map((row) => row.tag).filter(Boolean));

      expect(tags.size).toBe(18);
      expect(queries.some((row) => row.query === 'live music venues Iowa City')).toBe(true);
      expect(queries.some((row) => row.query === 'Iowa City events calendar this week')).toBe(true);
    });

    it('trims depth rather than dropping whole categories when capped', () => {
      const queries = buildDiscoveryQueries({ city: 'Iowa City', maxQueries: 23 });
      const tags = new Set(queries.map((row) => row.tag).filter(Boolean));

      expect(queries).toHaveLength(23);
      // 5 city-wide + one phrasing for each of the 18 tags.
      expect(tags.size).toBe(18);
    });

    it('honours a tag filter and ignores slugs outside the catalog', () => {
      const queries = buildDiscoveryQueries({
        city: 'Iowa City',
        tags: ['live-music', 'not-a-real-tag'],
      });
      const tags = new Set(queries.map((row) => row.tag).filter(Boolean));

      expect([...tags]).toEqual(['live-music']);
    });

    it('returns nothing without a city', () => {
      expect(buildDiscoveryQueries({ city: '  ' })).toEqual([]);
    });

    it('returns nothing when a tag filter names only unknown slugs', () => {
      expect(buildDiscoveryQueries({ city: 'Iowa City', tags: ['nope'] })).toEqual([]);
    });
  });

  describe('isNonSourceHost', () => {
    it('rejects social and reference hosts but keeps venues and aggregators', () => {
      expect(isNonSourceHost('facebook.com')).toBe(true);
      expect(isNonSourceHost('www.instagram.com')).toBe(true);
      expect(isNonSourceHost('en.wikipedia.org')).toBe(true);
      expect(isNonSourceHost('englert.org')).toBe(false);
      expect(isNonSourceHost('eventbrite.com')).toBe(false);
      // Native parsers handle these, so discovery routes rather than rejects them.
      expect(isNonSourceHost('partiful.com')).toBe(false);
      expect(isNonSourceHost('lu.ma')).toBe(false);
    });
  });

  describe('scoreEventIndexUrl', () => {
    it('scores an event index above a homepage', () => {
      expect(scoreEventIndexUrl('https://englert.org/events')).toBeGreaterThan(
        scoreEventIndexUrl('https://englert.org/'),
      );
    });

    it('gives a homepage no event-index signal', () => {
      expect(scoreEventIndexUrl('https://englert.org/')).toBe(0);
    });

    it('prefers an index over a dated single listing', () => {
      expect(scoreEventIndexUrl('https://englert.org/events')).toBeGreaterThan(
        scoreEventIndexUrl('https://englert.org/events/2026/03/some-show'),
      );
    });

    it('prefers a shallow index over a deep one', () => {
      expect(scoreEventIndexUrl('https://englert.org/events')).toBeGreaterThan(
        scoreEventIndexUrl('https://englert.org/visit/plan/events'),
      );
    });
  });

  describe('pickEventIndexUrl', () => {
    it('picks the strongest mapped index', () => {
      const picked = pickEventIndexUrl(
        [
          { url: 'https://englert.org/about' },
          { url: 'https://englert.org/events/2026/03/show' },
          { url: 'https://englert.org/events' },
        ],
        'https://englert.org/',
      );

      expect(picked).toEqual({ url: 'https://englert.org/events', fromMap: true });
    });

    it('falls back to a hinted search result when mapping finds nothing', () => {
      const picked = pickEventIndexUrl([], 'https://englert.org/calendar');

      expect(picked).toEqual({ url: 'https://englert.org/calendar', fromMap: false });
    });

    it('gives up on a bare homepage rather than paying for a scrape', () => {
      expect(pickEventIndexUrl([], 'https://englert.org/')).toBeNull();
    });
  });

  describe('hostFromUrl', () => {
    it('strips www so a host dedupes consistently', () => {
      expect(hostFromUrl('https://www.englert.org/events')).toBe('englert.org');
    });

    it('keeps subdomains distinct so one institution can hold several calendars', () => {
      expect(hostFromUrl('https://arts.uiowa.edu/events')).toBe('arts.uiowa.edu');
      expect(hostFromUrl('https://athletics.uiowa.edu/events')).toBe('athletics.uiowa.edu');
    });

    it('returns null for an unparseable URL', () => {
      expect(hostFromUrl('nope')).toBeNull();
    });
  });

  describe('runPool', () => {
    it('processes every item without exceeding the concurrency limit', async () => {
      let active = 0;
      let peak = 0;

      const results = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return item * 2;
      });

      expect(results.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12, 14]);
      expect(peak).toBeLessThanOrEqual(3);
    });

    it('stops pulling new work once the stop signal trips', async () => {
      const seen = [];
      let stop = false;

      await runPool(
        [1, 2, 3, 4, 5, 6],
        1,
        async (item) => {
          seen.push(item);
          if (item === 2) stop = true;
        },
        () => stop,
      );

      expect(seen).toEqual([1, 2]);
    });
  });

  describe('discoverCitySources', () => {
    it('qualifies a candidate and registers it with a curation job', async () => {
      searchSites.mockResolvedValue({
        results: [{ url: 'https://englert.org/', title: 'The Englert Theatre' }],
      });
      mapSite.mockResolvedValue({ links: [{ url: 'https://englert.org/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: 'The Englert Theatre',
        drafts: [
          { draft: { name: 'Show A', start_time: '2026-08-14T01:00:00.000Z' } },
          { draft: { name: 'Show B', start_time: '2026-08-21T01:00:00.000Z' } },
        ],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.qualified).toHaveLength(1);
      expect(result.data.qualified[0]).toMatchObject({
        host: 'englert.org',
        url: 'https://englert.org/events',
        label: 'The Englert Theatre',
        provider: 'generic-site',
        status: 'qualified',
        lastEventCount: 2,
        curationJobId: JOB_ID,
      });
      expect(result.data.rejected).toEqual([]);
      expect(result.data.calls).toEqual({ searches: 1, maps: 1, scrapes: 1 });
    });

    it('retains unresolved physical listings for staging review', async () => {
      searchSites.mockResolvedValue({
        results: [{ url: 'https://englert.org/events', title: 'The Englert Theatre' }],
      });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: 'The Englert Theatre',
        drafts: [
          {
            draft: {
              name: 'Resolved later',
              start_time: '2026-08-14T01:00:00.000Z',
              location: 'Raw venue',
              richLocation: {
                mode: 'physical',
                originalInput: 'Raw venue',
                resolutionStatus: 'unresolved',
                publicDisplayLabel: 'Raw venue',
                revealPolicy: 'public',
              },
            },
          },
          {
            draft: {
              name: 'Legacy-compatible show',
              start_time: '2026-08-21T01:00:00.000Z',
              location: 'Legacy venue',
            },
          },
        ],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.qualified[0].lastEventCount).toBe(2);
      expect(ingestEntries).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({
              draft: expect.objectContaining({ name: 'Resolved later' }),
            }),
            expect.objectContaining({
              draft: expect.objectContaining({ name: 'Legacy-compatible show' }),
            }),
          ]),
        }),
      );
    });

    it('passes the city timezone to the qualifying scrape', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://englert.org/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: null,
        drafts: [{ draft: { name: 'Show', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      await discoverCitySources(mockReq(), { tenantKey: 'iowacity', maxQueries: 1 });

      expect(scrapeSiteEvents).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: 'America/Chicago' }),
      );
    });

    it('creates the curation job with the seed tag that found the source', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://gabeslive.com/shows' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: "Gabe's",
        drafts: [{ draft: { name: 'Show', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        tags: ['live-music'],
      });

      expect(createCurationJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantKey: 'iowacity',
          provider: 'generic-site',
          url: 'https://gabeslive.com/shows',
          defaultTags: ['live-music'],
          defaultBatchWeekStrategy: 'next-drop',
        }),
      );
    });

    it('routes a Partiful host to its native parser without spending credits', async () => {
      searchSites.mockResolvedValue({
        results: [{ url: 'https://partiful.com/explore/iowa-city', title: 'Iowa City' }],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
        flow: 'firecrawl-only',
      });

      expect(result.data.qualified[0]).toMatchObject({
        host: 'partiful.com',
        provider: 'partiful',
        status: 'qualified',
      });
      expect(mapSite).not.toHaveBeenCalled();
      expect(scrapeSiteEvents).not.toHaveBeenCalled();
    });

    it('drops Luma and Partiful from Firecrawl search when native jobs run first', async () => {
      searchSites.mockResolvedValue({
        results: [
          { url: 'https://partiful.com/explore/iowa-city', title: 'Iowa City' },
          { url: 'https://englert.org/events', title: 'Englert' },
        ],
      });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: 'Englert',
        drafts: [{ draft: { name: 'Show', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
        partifulSlug: 'iowa-city',
      });

      expect(createCurationJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          provider: 'partiful',
          url: 'https://partiful.com/explore/iowa-city',
        }),
      );
      expect(executeCurationRun).toHaveBeenCalled();
      expect(result.data.qualified.map((row) => row.host)).toEqual(['englert.org']);
      expect(mapSite).not.toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining('partiful.com') }),
      );
    });

    it('skips Firecrawl entirely on a native-only city', async () => {
      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        lumaSlug: 'iowa-city',
      });

      expect(searchSites).not.toHaveBeenCalled();
      expect(mapSite).not.toHaveBeenCalled();
      expect(scrapeSiteEvents).not.toHaveBeenCalled();
      expect(createCurationJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          provider: 'luma',
          url: 'https://luma.com/iowa-city',
          defaultBatchWeekStrategy: 'next-drop',
        }),
      );
      expect(result.data.candidates.evaluated).toBe(0);
    });

    it('upserts a qualified registry row when a native job is created', async () => {
      PivotCurationRun.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          status: 'completed',
          stats: { upserted: 12, skipped: 0, failed: 0, updated: 0, byBatchWeek: { '2026-W33': 12 } },
        }),
      });

      await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        lumaSlug: 'iowa-city',
      });

      const nativeWrites = PivotCitySource.findOneAndUpdate.mock.calls.filter(
        ([filter]) => filter.host === 'luma.com',
      );
      expect(nativeWrites).toHaveLength(1);
      const [filter, update] = nativeWrites[0];
      expect(filter).toEqual({ tenantKey: 'iowacity', host: 'luma.com' });
      expect(update.$set).toMatchObject({
        provider: 'luma',
        status: 'qualified',
        url: 'https://luma.com/iowa-city',
        curationJobId: JOB_ID,
        lastEventCount: 12,
      });
      expect(update.$setOnInsert).toMatchObject({
        discoveredVia: 'native-bootstrap',
        enabled: true,
      });
    });

    it('upserts a qualified registry row when an existing native job is reused', async () => {
      PivotCurationJob.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: JOB_ID,
            provider: 'partiful',
            url: 'https://partiful.com/explore/iowa-city',
            label: 'Partiful · Iowa City',
            enabled: true,
          },
        ]),
      });
      PivotCurationRun.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          status: 'completed',
          stats: { upserted: 7, skipped: 1, failed: 0, updated: 7, byBatchWeek: {} },
        }),
      });

      await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        partifulSlug: 'iowa-city',
      });

      expect(createCurationJob).not.toHaveBeenCalled();
      const nativeWrites = PivotCitySource.findOneAndUpdate.mock.calls.filter(
        ([filter]) => filter.host === 'partiful.com',
      );
      expect(nativeWrites).toHaveLength(1);
      expect(nativeWrites[0][1].$set).toMatchObject({
        provider: 'partiful',
        status: 'qualified',
        url: 'https://partiful.com/explore/iowa-city',
        curationJobId: JOB_ID,
        lastEventCount: 7,
      });
    });

    it('does not persist native registry rows in preview', async () => {
      PivotCurationJob.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: JOB_ID,
            provider: 'luma',
            url: 'https://luma.com/iowa-city',
            enabled: true,
          },
        ]),
      });

      await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        lumaSlug: 'iowa-city',
        createJobs: false,
        ingestEvents: false,
      });

      expect(PivotCitySource.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('does not write lastEventCount 0 over a reused native source', async () => {
      PivotCurationJob.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: JOB_ID,
            provider: 'luma',
            url: 'https://lu.ma/iowa-city',
            enabled: true,
          },
        ]),
      });

      await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        lumaSlug: 'iowa-city',
      });

      const [, update] = PivotCitySource.findOneAndUpdate.mock.calls.find(
        ([filter]) => filter.host === 'luma.com',
      );
      expect(update.$set.lastEventCount).toBeUndefined();
      expect(update.$set.provider).toBe('luma');
    });

    it('still skips a host that already has a saved job during Firecrawl search', async () => {
      PivotCurationJob.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: JOB_ID,
            provider: 'generic-site',
            url: 'https://englert.org/events',
            label: 'Englert',
            enabled: true,
          },
        ]),
      });
      searchSites.mockResolvedValue({
        results: [
          { url: 'https://englert.org/events' },
          { url: 'https://gabeslive.com/shows' },
        ],
      });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: "Gabe's",
        drafts: [{ draft: { name: 'Show', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
        flow: 'firecrawl-only',
      });

      expect(result.data.qualified.map((row) => row.host)).toEqual(['gabeslive.com']);
    });

    describe('publishing what it extracted', () => {
      const twoShows = {
        listLabel: 'The Englert Theatre',
        drafts: [
          { draft: { name: 'Show A', start_time: '2026-08-14T01:00:00.000Z' } },
          { draft: { name: 'Show B', start_time: '2026-08-21T01:00:00.000Z' } },
        ],
      };

      it('takes the whole page rather than a sample, since the cap is free', async () => {
        searchSites.mockResolvedValue({ results: [{ url: 'https://englert.org/events' }] });
        scrapeSiteEvents.mockResolvedValue(twoShows);

        await discoverCitySources(mockReq(), { tenantKey: 'iowacity', maxQueries: 1 });

        // maxEvents only slices the response, so asking for a sample would cost
        // the same and throw away events already paid for.
        expect(scrapeSiteEvents).toHaveBeenCalledWith(
          expect.not.objectContaining({ maxEvents: expect.anything() }),
        );
      });

      it('persists and publishes one host before scraping the next', async () => {
        searchSites.mockResolvedValue({
          results: [
            { url: 'https://englert.org/events' },
            { url: 'https://gabeslive.com/shows' },
          ],
        });
        mapSite.mockImplementation(async ({ url }) => ({
          links: [{ url: `${new URL(url).origin}/events` }],
        }));
        const order = [];
        scrapeSiteEvents.mockImplementation(async ({ url }) => {
          order.push(`scrape:${new URL(url).hostname}`);
          return twoShows;
        });
        ingestEntries.mockImplementation(async (_req, { logContext }) => {
          order.push(`ingest:${logContext.host}`);
          return {
            stats: { upserted: 2, skipped: 0, failed: 0, byBatchWeek: {} },
            events: [],
            failures: [],
          };
        });

        await discoverCitySources(mockReq(), { tenantKey: 'iowacity', maxQueries: 1 });

        expect(order).toEqual([
          'scrape:englert.org',
          'ingest:englert.org',
          'scrape:gabeslive.com',
          'ingest:gabeslive.com',
        ]);
      });

      it('publishes a qualified source’s events with the tags its job will use', async () => {
        searchSites.mockResolvedValue({ results: [{ url: 'https://gabeslive.com/shows' }] });
        scrapeSiteEvents.mockResolvedValue(twoShows);
        ingestEntries.mockResolvedValue({
          stats: { upserted: 2, skipped: 0, failed: 0, byBatchWeek: { '2026-W33': 2 } },
          events: [],
          failures: [],
        });

        const result = await discoverCitySources(mockReq(), {
          tenantKey: 'iowacity',
          tags: ['live-music'],
        });

        expect(ingestEntries).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            tenantKey: 'iowacity',
            batchWeek: '2026-W33',
            // Events belong to the week of their own date; one crawl fills many.
            forceBatchWeek: false,
            defaultTags: ['live-music'],
            entries: twoShows.drafts,
          }),
        );
        expect(result.data.events).toEqual({ upserted: 2, skipped: 0, failed: 0 });
      });

      it('leaves a rejected host’s stray events out of the catalog', async () => {
        searchSites.mockResolvedValue({ results: [{ url: 'https://example.com/events' }] });
        scrapeSiteEvents.mockResolvedValue({
          listLabel: null,
          drafts: [{ draft: { name: 'Only one', start_time: '2026-08-14T01:00:00.000Z' } }],
        });

        const result = await discoverCitySources(mockReq(), {
          tenantKey: 'iowacity',
          maxQueries: 1,
          minEvents: 3,
        });

        expect(result.data.rejected).toHaveLength(1);
        expect(ingestEntries).not.toHaveBeenCalled();
      });

      it('still registers the source when its events cannot be added', async () => {
        searchSites.mockResolvedValue({ results: [{ url: 'https://englert.org/events' }] });
        scrapeSiteEvents.mockResolvedValue(twoShows);
        ingestEntries.mockRejectedValue(new Error('catalog unavailable'));

        const result = await discoverCitySources(mockReq(), {
          tenantKey: 'iowacity',
          maxQueries: 1,
        });

        expect(result.data.qualified).toHaveLength(1);
        expect(result.data.events.failed).toBe(2);
        expect(result.error).toBeUndefined();
      });

      it('hands native sources to a batch, having no events of its own for them', async () => {
        searchSites.mockResolvedValue({
          results: [{ url: 'https://partiful.com/explore/iowa-city', title: 'Iowa City' }],
        });

        const result = await discoverCitySources(mockReq(), {
          tenantKey: 'iowacity',
          maxQueries: 1,
          flow: 'firecrawl-only',
        });

        expect(ingestEntries).not.toHaveBeenCalled();
        expect(startCurationBatch).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ tenantKey: 'iowacity', jobIds: [JOB_ID] }),
        );
        expect(result.data.nativeJobIds).toEqual([JOB_ID]);
      });

      it('finishes as a success when the follow-up batch cannot be queued', async () => {
        searchSites.mockResolvedValue({
          results: [{ url: 'https://partiful.com/explore/iowa-city', title: 'Iowa City' }],
        });
        startCurationBatch.mockRejectedValue(new Error('batch service down'));

        const result = await discoverCitySources(mockReq(), {
          tenantKey: 'iowacity',
          maxQueries: 1,
          flow: 'firecrawl-only',
        });

        expect(result.data.qualified).toHaveLength(1);
        expect(result.error).toBeUndefined();
      });
    });

    it('records a rejection when a candidate yields no dated events', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://example.com/events' }] });
      scrapeSiteEvents.mockResolvedValue({ listLabel: null, drafts: [] });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.qualified).toEqual([]);
      expect(result.data.rejected[0]).toMatchObject({
        host: 'example.com',
        status: 'rejected',
        rejectedReason: 'no-events',
      });
      expect(createCurationJob).not.toHaveBeenCalled();
    });

    it('ignores extracted listings that have no start time', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://example.com/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: null,
        drafts: [{ draft: { name: 'Undated thing', start_time: null } }],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.rejected[0].rejectedReason).toBe('no-events');
    });

    it('rejects below-threshold yield when a higher minimum is requested', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://example.com/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: null,
        drafts: [{ draft: { name: 'Only one', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
        minEvents: 3,
      });

      expect(result.data.rejected[0]).toMatchObject({
        rejectedReason: 'below-threshold',
        lastEventCount: 1,
      });
    });

    it('skips hosts already in the registry, including past rejections', async () => {
      searchSites.mockResolvedValue({
        results: [{ url: 'https://englert.org/events' }, { url: 'https://deadend.com/events' }],
      });
      PivotCitySource.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { host: 'englert.org', status: 'qualified' },
            { host: 'deadend.com', status: 'rejected' },
          ]),
        }),
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.candidates.skippedKnown).toBe(2);
      expect(result.data.candidates.evaluated).toBe(0);
      expect(scrapeSiteEvents).not.toHaveBeenCalled();
    });

    it('re-checks rejected hosts when asked, but still skips qualified ones', async () => {
      searchSites.mockResolvedValue({
        results: [{ url: 'https://englert.org/events' }, { url: 'https://deadend.com/events' }],
      });
      PivotCitySource.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { host: 'englert.org', status: 'qualified' },
            { host: 'deadend.com', status: 'rejected' },
          ]),
        }),
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
        recheckRejected: true,
      });

      expect(result.data.candidates.skippedKnown).toBe(1);
      expect(result.data.candidates.evaluated).toBe(1);
    });

    it('filters social and reference hosts before spending anything', async () => {
      searchSites.mockResolvedValue({
        results: [
          { url: 'https://www.facebook.com/events/iowa-city' },
          { url: 'https://en.wikipedia.org/wiki/Iowa_City' },
        ],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.candidates.skippedNonSource).toBe(2);
      expect(mapSite).not.toHaveBeenCalled();
    });

    it('unions seed tags for a host surfaced by several categories', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://gabeslive.com/shows' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: "Gabe's",
        drafts: [{ draft: { name: 'Show', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        tags: ['live-music', 'nightlife'],
      });

      const [, update] = PivotCitySource.findOneAndUpdate.mock.calls[0];
      expect(update.$addToSet.seedTags.$each.sort()).toEqual(['live-music', 'nightlife']);
    });

    it('caps the number of candidates it qualifies', async () => {
      searchSites.mockResolvedValue({
        results: [
          { url: 'https://one.com/events' },
          { url: 'https://two.com/events' },
          { url: 'https://three.com/events' },
        ],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
        maxCandidates: 2,
      });

      expect(result.data.candidates.found).toBe(3);
      expect(result.data.candidates.evaluated).toBe(2);
      expect(scrapeSiteEvents).toHaveBeenCalledTimes(2);
    });

    it('aborts the run when credits are exhausted instead of burning the rest', async () => {
      searchSites.mockResolvedValue({
        results: [{ url: 'https://one.com/events' }, { url: 'https://two.com/events' }],
      });
      scrapeSiteEvents.mockResolvedValue({
        error: 'Website scraping credits are exhausted.',
        status: 402,
        code: 'SITE_SCRAPE_QUOTA_EXCEEDED',
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.aborted).toMatchObject({ code: 'SITE_SCRAPE_QUOTA_EXCEEDED' });
      expect(result.data.qualified).toEqual([]);
      expect(scrapeSiteEvents.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('records a scrape failure as a rejection and keeps going', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://blocked.com/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        error: 'Unable to scrape this website.',
        status: 502,
        code: 'SITE_SCRAPE_FAILED',
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.aborted).toBeNull();
      expect(result.data.rejected[0].rejectedReason).toBe('scrape-failed');
    });

    it('rejects a host whose site has no locatable event index', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://brochure.com/' }] });
      mapSite.mockResolvedValue({ links: [{ url: 'https://brochure.com/about' }] });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.rejected[0].rejectedReason).toBe('no-index-page');
      expect(scrapeSiteEvents).not.toHaveBeenCalled();
    });

    it('skips job creation when asked to only register sources', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://englert.org/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: 'Englert',
        drafts: [{ draft: { name: 'Show', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
        createJobs: false,
      });

      expect(result.data.qualified).toHaveLength(1);
      expect(createCurationJob).not.toHaveBeenCalled();
    });

    it('propagates an unknown tenant', async () => {
      resolvePivotTenant.mockResolvedValue({
        error: 'Pivot tenant not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });

      const result = await discoverCitySources(mockReq(), { tenantKey: 'nope' });

      expect(result.code).toBe('TENANT_NOT_FOUND');
      expect(searchSites).not.toHaveBeenCalled();
    });

    it('records a search failure without aborting on a non-fatal code', async () => {
      searchSites.mockResolvedValue({
        error: 'Unable to search for event sources.',
        status: 502,
        code: 'SITE_SCRAPE_FAILED',
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.aborted).toBeNull();
      expect(result.data.failures).toHaveLength(1);
      expect(result.data.candidates.found).toBe(0);
    });
  });

  describe('startCitySourceDiscovery', () => {
    it('acknowledges immediately with the run plan and its cost ceiling', async () => {
      const result = await startCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 10,
        maxCandidates: 5,
      });

      expect(result.data).toMatchObject({
        started: true,
        tenantKey: 'iowacity',
        city: 'Iowa City',
        plan: { queries: 10, maxCandidates: 5, maxOutboundCalls: 20 },
      });
    });

    it('refuses to start when the scrape key is missing', async () => {
      delete process.env.FIRECRAWL_API_KEY;

      const result = await startCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-then-firecrawl',
      });

      expect(result.code).toBe('SITE_SCRAPE_NOT_CONFIGURED');
      expect(result.status).toBe(503);
    });

    it('starts a native-only run without a Firecrawl key', async () => {
      delete process.env.FIRECRAWL_API_KEY;

      const result = await startCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        lumaSlug: 'iowa-city',
      });

      expect(result.data.started).toBe(true);
      expect(result.data.plan.runFirecrawl).toBe(false);
      expect(result.data.plan.maxOutboundCalls).toBe(0);
    });

    it('rejects an unknown tenant before scheduling work', async () => {
      resolvePivotTenant.mockResolvedValue({
        error: 'Pivot tenant not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });

      const result = await startCitySourceDiscovery(mockReq(), { tenantKey: 'nope' });

      expect(result.code).toBe('TENANT_NOT_FOUND');
    });

    it('rejects a tag filter that matches nothing in the catalog', async () => {
      const result = await startCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        tags: ['not-a-real-tag'],
      });

      expect(result.code).toBe('NO_DISCOVERY_QUERIES');
    });

    it('native-only does not require discovery queries', async () => {
      const result = await startCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        lumaSlug: 'iowa-city',
        tags: ['not-a-real-tag'], // No queries match
      });

      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      // Should succeed even with empty queries when runFirecrawl is false
    });

    it('refuses a second run while any discovery or refresh is still open', async () => {
      getGlobalModels.mockImplementation((req, ...names) => {
        const PivotSourceDiscoveryRun = {
          updateMany: jest.fn().mockResolvedValue({ acknowledged: true }),
          findOne: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue({
              _id: '665a1b2c3d4e5f6789012999',
              tenantKey: 'sf',
              kind: 'curation-batch',
              city: 'San Francisco',
              status: 'running',
            }),
          }),
        };
        const all = { PivotCitySource, PivotCurationJob, PivotCurationRun, PivotSourceDiscoveryRun };
        const out = {};
        for (const name of names) {
          if (all[name]) out[name] = all[name];
        }
        return out;
      });

      const result = await startCitySourceDiscovery(mockReq(), { tenantKey: 'iowacity' });

      expect(result.code).toBe('PIPELINE_BUSY');
      expect(result.status).toBe(409);
      expect(result.data.tenantKey).toBe('sf');
    });

    it('hybrid flow still requires queries when Firecrawl is enabled', async () => {
      const result = await startCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-then-firecrawl',
        tags: ['not-a-real-tag'], // No queries match
      });

      expect(result.code).toBe('NO_DISCOVERY_QUERIES');
      expect(result.error).toContain('No discovery queries matched');
    });

    describe('native URL canonicalization', () => {
      beforeEach(() => {
        // Mock existing jobs with non-index URLs
        PivotCurationJob.find.mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: '665a1b2c3d4e5f6789012388',
              tenantKey: 'iowacity',
              provider: 'luma',
              url: 'https://luma.com/e/evt-abc123',
              enabled: true,
            },
            {
              _id: '665a1b2c3d4e5f6789012389',
              tenantKey: 'iowacity',
              provider: 'partiful',
              url: 'https://partiful.com/e/xyz789',
              enabled: true,
            },
          ]),
        });
        
        updateCurationJob.mockImplementation(async (_req, options) => ({
          data: { job: { _id: options.jobId, url: options.url } },
        }));
        
        executeCurationRun.mockResolvedValue({ upserted: 2, skipped: 0, failed: 0 });
      });

      it('rewrites existing non-index URLs when slugs are configured', async () => {
        await discoverCitySources(mockReq(), {
          tenantKey: 'iowacity',
          flow: 'native-only',
          lumaSlug: 'iowa-city',
          partifulSlug: 'iowa-city',
        });

        expect(updateCurationJob).toHaveBeenCalledWith(expect.any(Object), {
          tenantKey: 'iowacity',
          jobId: '665a1b2c3d4e5f6789012388',
          url: 'https://luma.com/iowa-city',
        });
        
        expect(updateCurationJob).toHaveBeenCalledWith(expect.any(Object), {
          tenantKey: 'iowacity',
          jobId: '665a1b2c3d4e5f6789012389',
          url: 'https://partiful.com/explore/iowa-city',
        });

        expect(PivotCurationRun.create).toHaveBeenCalledWith(
          expect.objectContaining({
            jobId: '665a1b2c3d4e5f6789012388',
            url: 'https://luma.com/iowa-city',
          }),
        );
        expect(PivotCurationRun.create).toHaveBeenCalledWith(
          expect.objectContaining({
            jobId: '665a1b2c3d4e5f6789012389',
            url: 'https://partiful.com/explore/iowa-city',
          }),
        );
      });

      it('does not rewrite URLs that are already index URLs', async () => {
        // Mock jobs with index URLs
        PivotCurationJob.find.mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: '665a1b2c3d4e5f6789012388',
              tenantKey: 'iowacity',
              provider: 'luma',
              url: 'https://luma.com/iowa-city',
              enabled: true,
            },
          ]),
        });

        await discoverCitySources(mockReq(), {
          tenantKey: 'iowacity',
          flow: 'native-only',
          lumaSlug: 'iowa-city',
        });

        expect(updateCurationJob).not.toHaveBeenCalled();
      });

      it('does not rewrite URLs in preview mode', async () => {
        const result = await previewCitySourceDiscovery(mockReq(), {
          tenantKey: 'iowacity',
          flow: 'native-only',
          lumaSlug: 'iowa-city',
          partifulSlug: 'iowa-city',
        });

        expect(result.data.plan).toBeDefined();
        
        // Preview mode should not persist URL changes
        expect(updateCurationJob).not.toHaveBeenCalled();
      });
    });
  });

  describe('previewCitySourceDiscovery', () => {
    it('reports the plan without starting a run or spending anything', async () => {
      const result = await previewCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        maxCandidates: 4,
        minEvents: 2,
      });

      expect(result.data.plan).toMatchObject({
        queries: 45,
        categories: 18,
        maxCandidates: 4,
        minEvents: 2,
        maxOutboundCalls: 53,
        configured: true,
      });
      expect(searchSites).not.toHaveBeenCalled();
      expect(scrapeSiteEvents).not.toHaveBeenCalled();
    });

    it('surfaces a missing scrape key so the UI can disable the trigger', async () => {
      delete process.env.FIRECRAWL_API_KEY;

      const result = await previewCitySourceDiscovery(mockReq(), { tenantKey: 'iowacity' });

      expect(result.data.plan.configured).toBe(false);
    });

    it('native-only plan succeeds with empty queries', async () => {
      const result = await previewCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        tags: ['not-a-real-tag'], // No queries match
      });

      expect(result.error).toBeUndefined();
      expect(result.data.plan).toMatchObject({
        queries: 0,
        maxOutboundCalls: 0,
        runFirecrawl: false,
        runNative: true,
        flow: 'native-only',
      });
    });

    it('native-only plan with slugs has a zero Firecrawl credit ceiling', async () => {
      const result = await previewCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        lumaSlug: 'iowa-city',
        partifulSlug: 'iowa-city',
      });

      expect(result.error).toBeUndefined();
      expect(result.data.plan).toMatchObject({
        flow: 'native-only',
        runFirecrawl: false,
        runNative: true,
        queries: 0,
        maxOutboundCalls: 0,
        configured: true,
        nativeReady: true,
      });
      expect(result.data.plan.nativeJobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: 'https://luma.com/iowa-city' }),
          expect.objectContaining({ url: 'https://partiful.com/explore/iowa-city' }),
        ]),
      );
    });

    it('hybrid plan still fails with empty queries', async () => {
      const result = await previewCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-then-firecrawl',
        tags: ['not-a-real-tag'], // No queries match
      });

      expect(result.code).toBe('NO_DISCOVERY_QUERIES');
      expect(result.error).toContain('No discovery queries matched');
    });

    it('shows native warning when no slugs configured for native flow', async () => {
      const result = await previewCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-then-firecrawl',
        lumaSlug: null,
        partifulSlug: null,
      });

      expect(result.error).toBeUndefined();
      expect(result.data.plan.nativeReady).toBe(false);
      expect(result.data.plan.nativeWarning).toContain('Native discovery requires');
      expect(result.data.plan.nativeJobs).toHaveLength(0);
    });

    it('native-only blocks execution when no sources configured', async () => {
      const result = await startCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
        lumaSlug: null,
        partifulSlug: null,
      });

      expect(result.code).toBe('NATIVE_SOURCES_REQUIRED');
      expect(result.error).toContain('Native-only discovery requires configured city slugs');
    });
  });

  describe('updateCitySource', () => {
    it('mutes a source without changing its qualified status', async () => {
      PivotCitySource.findOneAndUpdate = jest.fn().mockResolvedValue({
        _id: '665a1b2c3d4e5f6789012399',
        tenantKey: 'iowacity',
        host: 'englert.org',
        url: 'https://englert.org/events',
        provider: 'generic-site',
        status: 'qualified',
        enabled: false,
      });

      const result = await updateCitySource(mockReq(), {
        tenantKey: 'iowacity',
        sourceId: '665a1b2c3d4e5f6789012399',
        enabled: false,
      });

      expect(result.data.source).toMatchObject({ enabled: false, status: 'qualified' });
      const [filter, update] = PivotCitySource.findOneAndUpdate.mock.calls[0];
      expect(filter).toMatchObject({ tenantKey: 'iowacity' });
      expect(update).toEqual({ $set: { enabled: false } });
    });

    it('rejects a malformed source id', async () => {
      const result = await updateCitySource(mockReq(), {
        tenantKey: 'iowacity',
        sourceId: 'nope',
        enabled: true,
      });

      expect(result.code).toBe('INVALID_SOURCE_ID');
    });

    it('requires an explicit enabled value', async () => {
      const result = await updateCitySource(mockReq(), {
        tenantKey: 'iowacity',
        sourceId: '665a1b2c3d4e5f6789012399',
      });

      expect(result.code).toBe('NO_CHANGES');
    });

    it('404s for a source in another city', async () => {
      PivotCitySource.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      const result = await updateCitySource(mockReq(), {
        tenantKey: 'iowacity',
        sourceId: '665a1b2c3d4e5f6789012399',
        enabled: true,
      });

      expect(result.code).toBe('SOURCE_NOT_FOUND');
    });
  });

  describe('updateCityDiscoveryConfig', () => {
    beforeEach(() => {
      getTenantByKey.mockResolvedValue(null);
      upsertStoredTenantRow.mockImplementation(async (_req, row) => row);
    });

    it('merges a flow patch onto the stored slugs', async () => {
      getTenantByKey.mockResolvedValue({
        tenantKey: 'iowacity',
        pivotDiscovery: {
          flow: 'native-then-firecrawl',
          lumaSlug: 'iowa-city',
          partifulSlug: 'iowa-city',
        },
      });

      const result = await updateCityDiscoveryConfig(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'native-only',
      });

      expect(result.error).toBeUndefined();
      expect(result.data).toMatchObject({
        tenantKey: 'iowacity',
        discovery: {
          flow: 'native-only',
          lumaSlug: 'iowa-city',
          partifulSlug: 'iowa-city',
          runFirecrawl: false,
          runNative: true,
        },
      });
      expect(upsertStoredTenantRow).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantKey: 'iowacity',
          pivotDiscovery: expect.objectContaining({
            flow: 'native-only',
            lumaSlug: 'iowa-city',
            partifulSlug: 'iowa-city',
          }),
        }),
        'ops@meridian.app',
      );
    });

    it('rejects an unknown flow', async () => {
      const result = await updateCityDiscoveryConfig(mockReq(), {
        tenantKey: 'iowacity',
        flow: 'agentic',
      });

      expect(result.code).toBe('INVALID_DISCOVERY_FLOW');
      expect(result.status).toBe(400);
      expect(upsertStoredTenantRow).not.toHaveBeenCalled();
    });

    it('rejects an invalid luma slug', async () => {
      const result = await updateCityDiscoveryConfig(mockReq(), {
        tenantKey: 'iowacity',
        lumaSlug: 'NYC!!',
      });

      expect(result.code).toBe('INVALID_LUMA_SLUG');
      expect(upsertStoredTenantRow).not.toHaveBeenCalled();
    });

    it('rejects an invalid partiful slug', async () => {
      const result = await updateCityDiscoveryConfig(mockReq(), {
        tenantKey: 'iowacity',
        partifulSlug: 'San Francisco',
      });

      expect(result.code).toBe('INVALID_PARTIFUL_SLUG');
      expect(upsertStoredTenantRow).not.toHaveBeenCalled();
    });

    it('returns NO_CHANGES when the patch is empty', async () => {
      const result = await updateCityDiscoveryConfig(mockReq(), {
        tenantKey: 'iowacity',
      });

      expect(result.code).toBe('NO_CHANGES');
      expect(result.status).toBe(400);
      expect(upsertStoredTenantRow).not.toHaveBeenCalled();
    });

    it('rejects an unknown tenant before writing', async () => {
      resolvePivotTenant.mockResolvedValue({
        error: 'Pivot tenant not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });

      const result = await updateCityDiscoveryConfig(mockReq(), {
        tenantKey: 'nope',
        flow: 'native-only',
      });

      expect(result.code).toBe('TENANT_NOT_FOUND');
      expect(upsertStoredTenantRow).not.toHaveBeenCalled();
    });
  });

  /**
   * A throttle is temporary, so it must not end a run — but sustained throttling
   * means the plan cannot support a run of this size, and grinding through every
   * remaining query proves nothing.
   */
  describe('rate limiting', () => {
    const rateLimited = {
      error: 'Website scraping is rate limited by Firecrawl (gave up after 3 attempts).',
      code: 'SITE_SCRAPE_RATE_LIMITED',
    };

    it('keeps going when a single search is throttled', async () => {
      searchSites
        .mockResolvedValueOnce(rateLimited)
        .mockResolvedValue({ results: [{ url: 'https://englert.org/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: null,
        drafts: [{ draft: { name: 'Show', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 3,
      });

      expect(result.data.aborted).toBeNull();
      expect(result.data.qualified).toHaveLength(1);
      expect(searchSites).toHaveBeenCalledTimes(3);
    });

    it('stops once throttling is sustained, and says why', async () => {
      searchSites.mockResolvedValue(rateLimited);

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 40,
      });

      expect(result.data.aborted?.code).toBe('SITE_SCRAPE_RATE_LIMITED');
      expect(result.data.aborted.error).toContain("plan's limit is below what a run of this size needs");
      // Bounded by the streak plus whatever the concurrent workers had in flight,
      // nowhere near all 40 queries.
      expect(searchSites.mock.calls.length).toBeLessThanOrEqual(
        RATE_LIMIT_ABORT_STREAK + SEARCH_CONCURRENCY,
      );
    });

    it('resets the streak when calls start getting through again', async () => {
      searchSites
        .mockResolvedValueOnce(rateLimited)
        .mockResolvedValueOnce(rateLimited)
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce(rateLimited)
        .mockResolvedValueOnce(rateLimited)
        .mockResolvedValue({ results: [] });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 8,
      });

      expect(result.data.aborted).toBeNull();
      expect(searchSites).toHaveBeenCalledTimes(8);
    });

    it('still aborts immediately on a genuinely fatal code', async () => {
      searchSites.mockResolvedValue({
        error: 'Website scraping credits are exhausted.',
        code: 'SITE_SCRAPE_QUOTA_EXCEEDED',
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 40,
      });

      expect(result.data.aborted?.code).toBe('SITE_SCRAPE_QUOTA_EXCEEDED');
      expect(searchSites.mock.calls.length).toBeLessThanOrEqual(SEARCH_CONCURRENCY);
    });

    it('passes a retry reporter into every outbound call', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://englert.org/' }] });
      mapSite.mockResolvedValue({ links: [{ url: 'https://englert.org/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: null,
        drafts: [{ draft: { name: 'Show', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      await discoverCitySources(mockReq(), { tenantKey: 'iowacity', maxQueries: 1 });

      for (const fn of [searchSites, mapSite, scrapeSiteEvents]) {
        expect(fn).toHaveBeenCalledWith(
          expect.objectContaining({ onRetry: expect.any(Function) }),
        );
      }
    });
  });

  describe('run recording', () => {
    let PivotSourceDiscoveryRun;

    /** Every step the run wrote, in order, across the recorder's batched flushes. */
    function recordedSteps() {
      return PivotSourceDiscoveryRun.updateOne.mock.calls.flatMap(
        ([, update]) => update.$push?.steps?.$each || [],
      );
    }

    beforeEach(() => {
      PivotSourceDiscoveryRun = {
        create: jest.fn().mockResolvedValue({ _id: '665a1b2c3d4e5f6789012388' }),
        updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
        updateMany: jest.fn().mockResolvedValue({ acknowledged: true }),
        findOne: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(null),
        }),
      };
      getGlobalModels.mockImplementation((req, ...names) => {
        const all = { PivotCitySource, PivotCurationJob, PivotCurationRun, PivotSourceDiscoveryRun };
        const out = {};
        for (const name of names) {
          if (all[name]) out[name] = all[name];
        }
        return out;
      });
    });

    it('narrates the decisions behind a qualified source', async () => {
      searchSites.mockResolvedValue({
        results: [{ url: 'https://englert.org/', title: 'The Englert Theatre' }],
      });
      mapSite.mockResolvedValue({ links: [{ url: 'https://englert.org/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: 'The Englert Theatre',
        drafts: [
          { draft: { name: 'Show A', start_time: '2026-08-14T01:00:00.000Z' } },
          { draft: { name: 'Show B', start_time: '2026-08-21T01:00:00.000Z' } },
        ],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.runId).toBe('665a1b2c3d4e5f6789012388');

      const kinds = recordedSteps().map((step) => step.kind);
      expect(kinds).toEqual(
        expect.arrayContaining([
          'plan',
          'search',
          'candidates',
          'map',
          'index',
          'scrape',
          'qualify',
          'job',
          'done',
        ]),
      );

      const qualify = recordedSteps().find((step) => step.kind === 'qualify');
      expect(qualify).toMatchObject({
        tone: 'good',
        host: 'englert.org',
        eventCount: 2,
        title: 'englert.org qualified with 2 event(s)',
      });

      // The URL choice is the least obvious decision in the pipeline, so its
      // score is recorded to make it reviewable.
      const index = recordedSteps().find((step) => step.kind === 'index');
      expect(index).toMatchObject({ url: 'https://englert.org/events' });
      expect(index.score).toBeGreaterThan(0);
    });

    it('records why a host was filtered out before costing anything', async () => {
      searchSites.mockResolvedValue({
        results: [{ url: 'https://www.instagram.com/some-venue' }],
      });

      await discoverCitySources(mockReq(), { tenantKey: 'iowacity', maxQueries: 1 });

      const filtered = recordedSteps().find((step) => step.kind === 'filter');
      expect(filtered).toMatchObject({
        host: 'instagram.com',
        detail: 'Not an event source — social, reference, or search host',
      });
      expect(mapSite).not.toHaveBeenCalled();
    });

    it('records a rejection with the reason and the events it did find', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://quiet.org/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: null,
        drafts: [{ draft: { name: 'Undated thing' } }],
      });

      await discoverCitySources(mockReq(), { tenantKey: 'iowacity', maxQueries: 1 });

      const reject = recordedSteps().find((step) => step.kind === 'reject');
      expect(reject).toMatchObject({
        tone: 'warn',
        reason: 'no-events',
        eventCount: 0,
        host: 'quiet.org',
      });
      expect(reject.detail).toContain('no resolvable start time');
    });

    it('marks an aborted run as failed rather than complete', async () => {
      searchSites.mockResolvedValue({ results: [{ url: 'https://englert.org/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        error: 'Out of credits.',
        code: 'SITE_SCRAPE_QUOTA_EXCEEDED',
      });

      await discoverCitySources(mockReq(), { tenantKey: 'iowacity', maxQueries: 1 });

      const abort = recordedSteps().find((step) => step.kind === 'abort');
      expect(abort).toMatchObject({ tone: 'bad', code: 'SITE_SCRAPE_QUOTA_EXCEEDED' });

      const close = PivotSourceDiscoveryRun.updateOne.mock.calls
        .map(([, update]) => update.$set)
        .find((set) => set?.status);
      expect(close).toMatchObject({ status: 'failed', phase: 'done' });
    });

    it('hands back a run id before the work starts, so the console can poll', async () => {
      const result = await startCitySourceDiscovery(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.runId).toBe('665a1b2c3d4e5f6789012388');
      expect(PivotSourceDiscoveryRun.create).toHaveBeenCalledTimes(1);
    });

    it('reads a run back for the console', async () => {
      PivotSourceDiscoveryRun.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: '665a1b2c3d4e5f6789012388',
          tenantKey: 'iowacity',
          status: 'running',
          phase: 'qualifying',
          steps: [{ at: new Date(), phase: 'qualifying', kind: 'map', title: 'Looking…' }],
        }),
      });

      const result = await getCitySourceDiscoveryRun(mockReq(), {
        tenantKey: 'iowacity',
        runId: '665a1b2c3d4e5f6789012388',
      });

      expect(result.data.run).toMatchObject({ status: 'running', phase: 'qualifying' });
      expect(result.data.run.steps).toHaveLength(1);
      expect(PivotSourceDiscoveryRun.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ tenantKey: 'iowacity' }),
      );
    });

    it('rejects a malformed run id', async () => {
      const result = await getCitySourceDiscoveryRun(mockReq(), {
        tenantKey: 'iowacity',
        runId: 'nope',
      });

      expect(result.code).toBe('INVALID_RUN_ID');
    });

    it('404s a run belonging to another city', async () => {
      PivotSourceDiscoveryRun.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await getCitySourceDiscoveryRun(mockReq(), {
        tenantKey: 'iowacity',
        runId: '665a1b2c3d4e5f6789012388',
      });

      expect(result.code).toBe('RUN_NOT_FOUND');
    });

    it('returns a null latest run instead of erroring on a fresh city', async () => {
      const chain = { lean: jest.fn().mockResolvedValue(null) };
      chain.select = jest.fn().mockReturnValue(chain);
      PivotSourceDiscoveryRun.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue(chain),
      });

      const result = await getLatestCitySourceDiscoveryRun(mockReq(), { tenantKey: 'iowacity' });

      expect(result.data.run).toBeNull();
    });

    /**
     * The panel polls the latest run continuously just to know whether one is
     * alive, so the timeline has to be opt-in rather than shipped every time.
     */
    describe('latest-run projection', () => {
      const latestDoc = {
        _id: '665a1b2c3d4e5f6789012388',
        tenantKey: 'iowacity',
        status: 'running',
        phase: 'qualifying',
        counters: { qualified: 2, searches: 6 },
        steps: [{ at: new Date(), phase: 'qualifying', kind: 'map', title: 'Looking…' }],
      };

      function mockLatest() {
        const select = jest.fn();
        const lean = jest.fn().mockResolvedValue(latestDoc);
        const chain = { select, lean };
        select.mockReturnValue(chain);
        PivotSourceDiscoveryRun.findOne.mockReturnValue({
          sort: jest.fn().mockReturnValue(chain),
        });
        return { select };
      }

      it('omits the timeline by default and excludes it from the query', async () => {
        const { select } = mockLatest();

        const result = await getLatestCitySourceDiscoveryRun(mockReq(), {
          tenantKey: 'iowacity',
        });

        expect(select).toHaveBeenCalledWith('-steps');
        expect(result.data.run.steps).toBeUndefined();
        // Everything the banner needs still comes through.
        expect(result.data.run).toMatchObject({
          status: 'running',
          phase: 'qualifying',
          counters: { qualified: 2, searches: 6 },
        });
      });

      it('includes the timeline when the console asks for it', async () => {
        const { select } = mockLatest();

        const result = await getLatestCitySourceDiscoveryRun(mockReq(), {
          tenantKey: 'iowacity',
          includeSteps: true,
        });

        expect(select).not.toHaveBeenCalled();
        expect(result.data.run.steps).toHaveLength(1);
      });
    });

    it('keeps discovering when the run cannot be recorded', async () => {
      PivotSourceDiscoveryRun.create.mockRejectedValue(new Error('telemetry down'));
      searchSites.mockResolvedValue({ results: [{ url: 'https://englert.org/events' }] });
      scrapeSiteEvents.mockResolvedValue({
        listLabel: null,
        drafts: [{ draft: { name: 'Show', start_time: '2026-08-14T01:00:00.000Z' } }],
      });

      const result = await discoverCitySources(mockReq(), {
        tenantKey: 'iowacity',
        maxQueries: 1,
      });

      expect(result.data.qualified).toHaveLength(1);
      expect(result.data.runId).toBeNull();
    });
  });

  describe('listCitySources', () => {
    it('returns the registry for a city', async () => {
      PivotCitySource.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: '665a1b2c3d4e5f6789012399',
              tenantKey: 'iowacity',
              host: 'englert.org',
              url: 'https://englert.org/events',
              provider: 'generic-site',
              status: 'qualified',
              seedTags: ['live-music'],
              lastEventCount: 4,
            },
          ]),
        }),
      });

      const result = await listCitySources(mockReq(), { tenantKey: 'iowacity' });

      expect(result.data.sources).toHaveLength(1);
      expect(result.data.sources[0]).toMatchObject({
        host: 'englert.org',
        status: 'qualified',
        lastEventCount: 4,
      });
    });

    it('filters by status when requested', async () => {
      const lean = jest.fn().mockResolvedValue([]);
      PivotCitySource.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ lean }) });

      await listCitySources(mockReq(), { tenantKey: 'iowacity', status: 'rejected' });

      expect(PivotCitySource.find).toHaveBeenCalledWith({
        tenantKey: 'iowacity',
        status: 'rejected',
      });
    });
  });
});
