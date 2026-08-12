jest.mock('axios');

const axios = require('axios');
const {
  scrapeSiteEvents,
  searchSites,
  mapSite,
  normalizeSiteUrl,
  buildSiteEventDraft,
  isSiteScrapeConfigured,
  isBlockedScrapeHost,
  resolveSiteBatchLimit,
  buildExtractionPrompt,
  normalizeIsoDateTime,
  parseRetryAfterMs,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_MAX_DELAY_MS,
  FIRECRAWL_SCRAPE_URL,
  FIRECRAWL_SEARCH_URL,
  FIRECRAWL_MAP_URL,
  MAX_SITE_EVENTS_CEILING,
} = require('../../services/pivotSiteScrapeService');

const PAGE_URL = 'https://icfilmscene.org/calendar';

function firecrawlResponse(events, listLabel = 'FilmScene') {
  return { data: { success: true, data: { json: { listLabel, events } } } };
}

describe('pivotSiteScrapeService', () => {
  const originalKey = process.env.FIRECRAWL_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FIRECRAWL_API_KEY = 'fc-test-key';
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.FIRECRAWL_API_KEY;
    } else {
      process.env.FIRECRAWL_API_KEY = originalKey;
    }
  });

  describe('normalizeSiteUrl', () => {
    it('accepts any public http(s) host', () => {
      const result = normalizeSiteUrl('https://littlevillagemag.com/calendar/');
      expect(result.error).toBeUndefined();
      expect(result.url).toBe('https://littlevillagemag.com/calendar/');
    });

    it('rejects non-http protocols', () => {
      expect(normalizeSiteUrl('ftp://example.com').code).toBe('INVALID_URL');
    });

    it('requires a URL', () => {
      expect(normalizeSiteUrl('   ').code).toBe('URL_REQUIRED');
    });

    it('blocks private and link-local hosts', () => {
      expect(normalizeSiteUrl('http://localhost:3000/events').code).toBe('BLOCKED_HOST');
      expect(normalizeSiteUrl('http://127.0.0.1/events').code).toBe('BLOCKED_HOST');
      expect(normalizeSiteUrl('http://10.0.0.5/events').code).toBe('BLOCKED_HOST');
      expect(normalizeSiteUrl('http://169.254.169.254/latest/meta-data').code).toBe('BLOCKED_HOST');
      expect(normalizeSiteUrl('http://192.168.1.20/events').code).toBe('BLOCKED_HOST');
      expect(normalizeSiteUrl('http://172.16.4.4/events').code).toBe('BLOCKED_HOST');
    });

    it('allows public hosts that merely resemble private ranges', () => {
      expect(isBlockedScrapeHost('172.32.1.1')).toBe(false);
      expect(isBlockedScrapeHost('englert.org')).toBe(false);
    });
  });

  describe('normalizeIsoDateTime', () => {
    it('normalizes an offset datetime to UTC ISO', () => {
      expect(normalizeIsoDateTime('2026-07-10T20:00:00-05:00')).toBe('2026-07-11T01:00:00.000Z');
    });

    it('returns null for unparseable values', () => {
      expect(normalizeIsoDateTime('next friday-ish')).toBeNull();
      expect(normalizeIsoDateTime('')).toBeNull();
    });
  });

  describe('resolveSiteBatchLimit', () => {
    it('defaults to the ceiling when unset', () => {
      expect(resolveSiteBatchLimit(null)).toBe(MAX_SITE_EVENTS_CEILING);
    });

    it('caps explicit limits at the ceiling', () => {
      expect(resolveSiteBatchLimit(999_999)).toBe(MAX_SITE_EVENTS_CEILING);
      expect(resolveSiteBatchLimit(12)).toBe(12);
    });
  });

  describe('buildExtractionPrompt', () => {
    it('anchors relative dates to today and the city timezone', () => {
      const prompt = buildExtractionPrompt({
        now: new Date('2026-08-10T12:00:00.000Z'),
        timezone: 'America/Chicago',
      });
      expect(prompt).toContain('2026-08-10');
      expect(prompt).toContain('America/Chicago');
    });
  });

  describe('buildSiteEventDraft', () => {
    it('maps an extracted row onto the shared draft shape', () => {
      const { draft } = buildSiteEventDraft(
        {
          name: '  Open Mic  ',
          description: 'Sign-ups at the door.',
          startTime: '2026-07-10T20:00:00-05:00',
          endTime: '2026-07-10T23:00:00-05:00',
          location: 'Gabe\u2019s, 330 E Washington St',
          hostName: 'Gabe\u2019s',
          imageUrl: '/img/openmic.jpg',
          eventUrl: '/events/open-mic',
          tags: ['music', 'music', ' live '],
        },
        { pageUrl: PAGE_URL },
      );

      expect(draft.name).toBe('Open Mic');
      expect(draft.start_time).toBe('2026-07-11T01:00:00.000Z');
      expect(draft.end_time).toBe('2026-07-11T04:00:00.000Z');
      expect(draft.source).toBe('generic-site');
      expect(draft.sourceTags).toEqual(['music', 'live']);
    });

    it('resolves relative image and event URLs against the page', () => {
      const { draft, sourceUrl } = buildSiteEventDraft(
        { name: 'Show', imageUrl: '/img/a.jpg', eventUrl: '/events/show' },
        { pageUrl: PAGE_URL },
      );

      expect(draft.image).toBe('https://icfilmscene.org/img/a.jpg');
      expect(sourceUrl).toBe('https://icfilmscene.org/events/show');
    });

    it('derives a distinct sourceUrl when a listing has no per-event link', () => {
      const first = buildSiteEventDraft(
        { name: 'Movie A', startTime: '2026-07-10T20:00:00Z' },
        { pageUrl: PAGE_URL },
      );
      const second = buildSiteEventDraft(
        { name: 'Movie B', startTime: '2026-07-10T20:00:00Z' },
        { pageUrl: PAGE_URL },
      );

      expect(first.sourceUrl).not.toBe(second.sourceUrl);
      expect(first.sourceUrl).toBe('https://icfilmscene.org/calendar#movie-a-2026-07-10');
      expect(second.sourceUrl).toBe('https://icfilmscene.org/calendar#movie-b-2026-07-10');
    });

    it('drops unusable image URLs rather than passing them through', () => {
      const { draft } = buildSiteEventDraft(
        { name: 'Show', imageUrl: 'data:image/png;base64,AAAA' },
        { pageUrl: PAGE_URL },
      );
      expect(draft.image).toBeNull();
    });
  });

  describe('scrapeSiteEvents', () => {
    it('reports when the API key is missing', async () => {
      delete process.env.FIRECRAWL_API_KEY;
      expect(isSiteScrapeConfigured()).toBe(false);

      const result = await scrapeSiteEvents({ url: PAGE_URL });

      expect(result.code).toBe('SITE_SCRAPE_NOT_CONFIGURED');
      expect(result.status).toBe(503);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('requests JSON extraction and returns normalized drafts', async () => {
      axios.post.mockResolvedValue(
        firecrawlResponse([
          {
            name: 'Late Shift',
            startTime: '2026-07-10T20:00:00-05:00',
            location: 'FilmScene',
            hostName: 'FilmScene',
            eventUrl: 'https://icfilmscene.org/events/late-shift',
          },
        ]),
      );

      const result = await scrapeSiteEvents({ url: PAGE_URL, timezone: 'America/Chicago' });

      expect(axios.post).toHaveBeenCalledWith(
        FIRECRAWL_SCRAPE_URL,
        expect.objectContaining({
          url: PAGE_URL,
          formats: [expect.objectContaining({ type: 'json' })],
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer fc-test-key' }),
        }),
      );
      expect(result.drafts).toHaveLength(1);
      expect(result.drafts[0].draft.name).toBe('Late Shift');
      expect(result.source).toBe('firecrawl-json');
      expect(result.listLabel).toBe('FilmScene');
    });

    it('skips rows with no name and dedupes repeated events', async () => {
      axios.post.mockResolvedValue(
        firecrawlResponse([
          { name: 'Real Event', eventUrl: 'https://icfilmscene.org/e/1' },
          { description: 'nav link with no title' },
          { name: 'Duplicate', eventUrl: 'https://icfilmscene.org/e/2' },
          { name: 'Duplicate', eventUrl: 'https://icfilmscene.org/e/2' },
        ]),
      );

      const result = await scrapeSiteEvents({ url: PAGE_URL });

      expect(result.drafts).toHaveLength(2);
      expect(result.discoveredTotal).toBe(2);
    });

    it('truncates to maxEvents and flags it', async () => {
      const events = Array.from({ length: 5 }, (_, i) => ({
        name: `Event ${i}`,
        eventUrl: `https://icfilmscene.org/e/${i}`,
      }));
      axios.post.mockResolvedValue(firecrawlResponse(events));

      const result = await scrapeSiteEvents({ url: PAGE_URL, maxEvents: 2 });

      expect(result.drafts).toHaveLength(2);
      expect(result.truncated).toBe(true);
      expect(result.discoveredTotal).toBe(5);
      expect(result.limit).toBe(2);
    });

    it('returns an empty batch when the page has no events', async () => {
      axios.post.mockResolvedValue(firecrawlResponse([]));

      const result = await scrapeSiteEvents({ url: PAGE_URL });

      expect(result.error).toBeUndefined();
      expect(result.drafts).toEqual([]);
    });

    it('flags an unparseable extraction payload', async () => {
      axios.post.mockResolvedValue({ data: { success: true, data: {} } });

      const result = await scrapeSiteEvents({ url: PAGE_URL });

      expect(result.code).toBe('SITE_SCRAPE_UNPARSEABLE');
    });

    it('surfaces an explicit provider failure', async () => {
      axios.post.mockResolvedValue({ data: { success: false, error: 'render failed' } });

      const result = await scrapeSiteEvents({ url: PAGE_URL });

      expect(result.code).toBe('SITE_SCRAPE_FAILED');
      expect(result.error).toContain('render failed');
    });

    it('maps auth, quota, rate limit, and timeout failures to distinct codes', async () => {
      axios.post.mockRejectedValueOnce({ response: { status: 401 } });
      expect((await scrapeSiteEvents({ url: PAGE_URL })).code).toBe('SITE_SCRAPE_AUTH_FAILED');

      axios.post.mockRejectedValueOnce({ response: { status: 402 } });
      expect((await scrapeSiteEvents({ url: PAGE_URL })).code).toBe('SITE_SCRAPE_QUOTA_EXCEEDED');

      // Persistent, not `Once`: a 429 is retried, so a single rejection no longer
      // reaches the caller. Backoff is zeroed so the test does not wait it out.
      axios.post.mockRejectedValue({ response: { status: 429 } });
      expect(
        (await scrapeSiteEvents({ url: PAGE_URL, retry: { baseDelayMs: 0 } })).code,
      ).toBe('SITE_SCRAPE_RATE_LIMITED');

      axios.post.mockRejectedValueOnce({ code: 'ECONNABORTED' });
      expect((await scrapeSiteEvents({ url: PAGE_URL })).code).toBe('SITE_SCRAPE_TIMEOUT');
    });

    it('validates the URL before spending a request', async () => {
      const result = await scrapeSiteEvents({ url: 'http://127.0.0.1/events' });

      expect(result.code).toBe('BLOCKED_HOST');
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  /**
   * Rate limits are transient by definition, and a refused request costs no
   * credits, so waiting one out is strictly better than failing.
   */
  describe('rate limit retries', () => {
    const noWait = { retry: { baseDelayMs: 0 } };

    it('waits out a throttle and succeeds on a later attempt', async () => {
      axios.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce(firecrawlResponse([{ name: 'Show', startTime: '2026-08-14T01:00:00Z' }]));

      const result = await scrapeSiteEvents({ url: PAGE_URL, ...noWait });

      expect(result.error).toBeUndefined();
      expect(result.drafts).toHaveLength(1);
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('gives up after the attempt ceiling and reports how hard it tried', async () => {
      axios.post.mockRejectedValue({
        response: { status: 429, data: { error: 'Rate limit exceeded for /v2/search' } },
      });

      const result = await searchSites({ query: 'live music Iowa City', ...noWait });

      expect(result.code).toBe('SITE_SCRAPE_RATE_LIMITED');
      expect(axios.post).toHaveBeenCalledTimes(RATE_LIMIT_MAX_ATTEMPTS);
      // The upstream reason distinguishes a per-minute window from a plan limit.
      expect(result.error).toContain('Rate limit exceeded for /v2/search');
      expect(result.error).toContain(`${RATE_LIMIT_MAX_ATTEMPTS} attempts`);
    });

    it('reports each wait so a throttled run does not look stalled', async () => {
      axios.post.mockRejectedValue({ response: { status: 429 } });
      const onRetry = jest.fn();

      await mapSite({ url: PAGE_URL, onRetry, ...noWait });

      expect(onRetry).toHaveBeenCalledTimes(RATE_LIMIT_MAX_ATTEMPTS - 1);
      expect(onRetry).toHaveBeenLastCalledWith(
        expect.objectContaining({ attempt: 2, maxAttempts: RATE_LIMIT_MAX_ATTEMPTS }),
      );
    });

    it('never lets a reporting error turn a recoverable throttle into a failure', async () => {
      axios.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce(firecrawlResponse([]));

      const result = await scrapeSiteEvents({
        url: PAGE_URL,
        onRetry: () => {
          throw new Error('recorder exploded');
        },
        ...noWait,
      });

      expect(result.error).toBeUndefined();
    });

    it('does not retry failures that may already have cost a credit', async () => {
      axios.post.mockRejectedValue({ response: { status: 500 } });
      await scrapeSiteEvents({ url: PAGE_URL, ...noWait });
      expect(axios.post).toHaveBeenCalledTimes(1);

      axios.post.mockClear();
      axios.post.mockRejectedValue({ code: 'ECONNABORTED' });
      await scrapeSiteEvents({ url: PAGE_URL, ...noWait });
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Auth and quota are settled facts, not conditions that clear on a retry.
      axios.post.mockClear();
      axios.post.mockRejectedValue({ response: { status: 402 } });
      await scrapeSiteEvents({ url: PAGE_URL, ...noWait });
      expect(axios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('parseRetryAfterMs', () => {
    it('prefers the provider’s own window over our guess', () => {
      expect(parseRetryAfterMs({ 'retry-after': '12' })).toBe(12_000);
    });

    it('accepts an HTTP date', () => {
      const soon = new Date(Date.now() + 8_000).toUTCString();
      const parsed = parseRetryAfterMs({ 'retry-after': soon });

      expect(parsed).toBeGreaterThan(5_000);
      expect(parsed).toBeLessThanOrEqual(9_000);
    });

    it('clamps an absurd wait rather than hanging the run', () => {
      expect(parseRetryAfterMs({ 'retry-after': '99999' })).toBe(RATE_LIMIT_MAX_DELAY_MS);
    });

    it('falls back to backoff when the header is absent or junk', () => {
      expect(parseRetryAfterMs({})).toBeNull();
      expect(parseRetryAfterMs({ 'retry-after': 'soon-ish' })).toBeNull();
    });

    it('treats an elapsed date as no wait rather than a negative one', () => {
      const past = new Date(Date.now() - 60_000).toUTCString();
      expect(parseRetryAfterMs({ 'retry-after': past })).toBe(0);
    });
  });

  describe('searchSites', () => {
    it('requests web results without scraping them', async () => {
      axios.post.mockResolvedValue({
        data: {
          success: true,
          data: {
            web: [
              { url: 'https://englert.org/', title: 'The Englert Theatre', description: 'Shows' },
            ],
          },
        },
      });

      const result = await searchSites({
        query: 'live music venues Iowa City',
        location: 'Iowa City, IA',
        limit: 5,
      });

      expect(result.results).toEqual([
        { url: 'https://englert.org/', title: 'The Englert Theatre', description: 'Shows' },
      ]);

      const [url, payload] = axios.post.mock.calls[0];
      expect(url).toBe(FIRECRAWL_SEARCH_URL);
      expect(payload).toMatchObject({
        query: 'live music venues Iowa City',
        location: 'Iowa City, IA',
        limit: 5,
        sources: ['web'],
      });
      // Scraping every search hit would cost credits on results discovery is
      // about to filter out anyway.
      expect(payload.scrapeOptions).toBeUndefined();
    });

    it('drops unusable and duplicate result URLs', async () => {
      axios.post.mockResolvedValue({
        data: {
          success: true,
          data: {
            web: [
              { url: 'https://englert.org/events' },
              { url: 'https://englert.org/events' },
              { url: 'http://localhost:3000/events' },
              { url: 'not-a-url' },
            ],
          },
        },
      });

      const result = await searchSites({ query: 'events' });

      expect(result.results.map((row) => row.url)).toEqual(['https://englert.org/events']);
    });

    it('requires a query and never calls the provider without one', async () => {
      const result = await searchSites({ query: '  ' });

      expect(result.code).toBe('QUERY_REQUIRED');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('reports a missing API key without a request', async () => {
      delete process.env.FIRECRAWL_API_KEY;

      const result = await searchSites({ query: 'events' });

      expect(result.code).toBe('SITE_SCRAPE_NOT_CONFIGURED');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('maps quota exhaustion to the shared code so discovery can abort', async () => {
      axios.post.mockRejectedValueOnce({ response: { status: 402 } });

      expect((await searchSites({ query: 'events' })).code).toBe('SITE_SCRAPE_QUOTA_EXCEEDED');
    });
  });

  describe('mapSite', () => {
    it('maps a host for calendar pages including subdomains', async () => {
      axios.post.mockResolvedValue({
        data: {
          success: true,
          links: [
            { url: 'https://englert.org/events', title: 'Events' },
            'https://arts.englert.org/calendar',
          ],
        },
      });

      const result = await mapSite({ url: 'https://englert.org/', search: 'events', limit: 20 });

      expect(result.links.map((row) => row.url)).toEqual([
        'https://englert.org/events',
        'https://arts.englert.org/calendar',
      ]);

      const [url, payload] = axios.post.mock.calls[0];
      expect(url).toBe(FIRECRAWL_MAP_URL);
      expect(payload).toMatchObject({
        url: 'https://englert.org/',
        search: 'events',
        limit: 20,
        includeSubdomains: true,
      });
    });

    it('tolerates a payload with no links', async () => {
      axios.post.mockResolvedValue({ data: { success: true } });

      expect((await mapSite({ url: 'https://englert.org/' })).links).toEqual([]);
    });

    it('validates the URL before spending a request', async () => {
      const result = await mapSite({ url: 'http://10.0.0.5/' });

      expect(result.code).toBe('BLOCKED_HOST');
      expect(axios.post).not.toHaveBeenCalled();
    });
  });
});
