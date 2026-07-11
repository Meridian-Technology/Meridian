jest.mock('axios');
jest.mock('../../services/pivotIngestDuplicateService', () => ({
  annotateImportDrafts: jest.fn((drafts) => ({ drafts, duplicateWarnings: [] })),
  formatDuplicateWarning: jest.fn(),
  isBlockingDuplicate: jest.fn(() => false),
  loadCatalogDuplicateIndex: jest.fn().mockResolvedValue([]),
  resolveImportDuplicate: jest.fn().mockResolvedValue({ duplicate: null }),
}));

const axios = require('axios');
const {
  previewIngestUrl,
  normalizeUrl,
  buildDraft,
  classifyIngestUrl,
  parsePartifulExploreBatch,
  parseLumaDiscoverBatch,
  extractLumaDiscoverSlug,
  fetchLumaDiscoverApiBatch,
  extractMetaContent,
  extractJsonLdBlocks,
  LUMA_DISCOVER_API_URL,
} = require('../../services/pivotIngestPreviewService');

const PARTIFUL_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Sunset Listening Party" />
  <meta property="og:description" content="Bring a blanket and your favorite vinyl." />
  <meta property="og:image" content="https://partiful.imgix.net/sunset.jpg" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Sunset Listening Party",
    "startDate": "2026-07-12T18:00:00-04:00",
    "endDate": "2026-07-12T21:00:00-04:00",
    "location": {
      "@type": "Place",
      "name": "Brooklyn Bridge Park"
    },
    "organizer": {
      "@type": "Organization",
      "name": "Brooklyn Board Game Cafe",
      "image": "https://partiful.imgix.net/host.jpg"
    }
  }
  </script>
</head>
<body></body>
</html>`;

const LUMA_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Open Mic Night" />
  <meta property="og:description" content="Sign-ups at the door." />
  <meta property="og:image" content="https://images.lumacdn.com/open-mic.jpg" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Open Mic Night",
    "startDate": "2026-07-15T20:00:00-04:00",
    "location": { "@type": "Place", "name": "East Village Studio" },
    "organizer": { "@type": "Person", "name": "Luma Host Collective" }
  }
  </script>
</head>
<body></body>
</html>`;

describe('pivotIngestPreviewService normalizeUrl', () => {
  it('accepts Partiful URLs', () => {
    const result = normalizeUrl('https://partiful.com/e/sunset-listening');
    expect(result.url).toBe('https://partiful.com/e/sunset-listening');
    expect(result.provider).toBe('partiful');
  });

  it('accepts Luma URLs', () => {
    const result = normalizeUrl('https://lu.ma/open-mic-night');
    expect(result.provider).toBe('luma');
  });

  it('rejects garbage URLs', () => {
    const result = normalizeUrl('not-a-url');
    expect(result.error).toBeTruthy();
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_URL');
  });

  it('rejects unsupported hosts', () => {
    const result = normalizeUrl('https://example.com/event');
    expect(result.code).toBe('UNSUPPORTED_HOST');
    expect(result.status).toBe(400);
  });
});

describe('pivotIngestPreviewService buildDraft', () => {
  it('parses Partiful Open Graph and JSON-LD including hostName', () => {
    const { draft, warnings } = buildDraft({
      html: PARTIFUL_HTML,
      provider: 'partiful',
      sourceUrl: 'https://partiful.com/e/sunset-listening',
    });

    expect(draft.name).toBe('Sunset Listening Party');
    expect(draft.description).toContain('blanket');
    expect(draft.image).toContain('sunset.jpg');
    expect(draft.hostName).toBe('Brooklyn Board Game Cafe');
    expect(draft.image).toContain('sunset.jpg');
    expect(draft.hostImageUrl).toBeNull();
    expect(draft.location).toBe('Brooklyn Bridge Park');
    expect(draft.start_time).toContain('2026-07-12');
    expect(warnings).toEqual([]);
  });

  it('parses Luma draft with organizer name', () => {
    const { draft } = buildDraft({
      html: LUMA_HTML,
      provider: 'luma',
      sourceUrl: 'https://lu.ma/open-mic-night',
    });

    expect(draft.name).toBe('Open Mic Night');
    expect(draft.hostName).toBe('Luma Host Collective');
    expect(draft.location).toBe('East Village Studio');
  });

  it('adds warnings when fields are missing', () => {
    const { warnings } = buildDraft({
      html: '<html><head><title>Empty</title></head></html>',
      provider: 'partiful',
      sourceUrl: 'https://partiful.com/e/empty',
    });

    expect(warnings.some((entry) => entry.includes('title'))).toBe(true);
    expect(warnings.some((entry) => entry.includes('organizer'))).toBe(true);
  });

  it('ignores Next.js hostname and reads JSON-LD organizer arrays', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Sunset Party | Partiful" />
  <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"hostname":"partiful.com"}}}</script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Sunset Party",
    "startDate": "2026-07-12T18:00:00-04:00",
    "location": { "@type": "Place", "name": "Brooklyn Bridge Park" },
    "organizer": [
      { "@type": "Person", "name": "basem" },
      { "@type": "Organization", "name": "Brooklyn Board Game Cafe" }
    ]
  }
  </script>
</head>
<body></body>
</html>`;

    const { draft } = buildDraft({
      html,
      provider: 'partiful',
      sourceUrl: 'https://partiful.com/e/sunset-party',
    });

    expect(draft.hostName).toBe('Brooklyn Board Game Cafe');
    expect(draft.hostName).not.toBe('partiful.com');
  });

  it('joins multiple JSON-LD organizers when no organization is present', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Co-hosted Meetup",
    "startDate": "2026-07-12T18:00:00-04:00",
    "organizer": [
      { "@type": "Person", "name": "Alice" },
      { "@type": "Person", "name": "Bob" }
    ]
  }
  </script>
</head>
<body></body>
</html>`;

    const { draft } = buildDraft({
      html,
      provider: 'partiful',
      sourceUrl: 'https://partiful.com/e/co-hosted',
    });

    expect(draft.hostName).toBe('Alice & Bob');
  });

  it('parses Partiful single-event NEXT_DATA when JSON-LD is absent', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Sunset Listening Party | Partiful" />
  <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"hosts":[{"name":"Roof Records","isManaged":true}],"event":{"id":"abc123","title":"Sunset Listening Party","description":"Vinyl on the roof","locationInfo":{"type":"freeform","value":"Williamsburg, Brooklyn"},"startDate":"2026-07-12T22:00:00.000Z","endDate":"2026-07-13T01:00:00.000Z","tags":["Music","Nightlife"],"image":{"upload":{"path":"external/user/poster"}}}}}}</script>
</head>
<body></body>
</html>`;

    const { draft, warnings } = buildDraft({
      html,
      provider: 'partiful',
      sourceUrl: 'https://partiful.com/e/abc123',
    });

    expect(draft.name).toBe('Sunset Listening Party');
    expect(draft.location).toBe('Williamsburg, Brooklyn');
    expect(draft.hostName).toBe('Roof Records');
    expect(draft.start_time).toContain('2026-07-12');
    expect(draft.sourceTags).toEqual(['Music', 'Nightlife']);
    expect(warnings).toEqual([]);
  });

  it('reads Partiful multi-host pages from NEXT_DATA hosts array', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"hostname":"partiful.com","hosts":[{"name":"basem","isManaged":false},{"name":"(un)PTO","isManaged":true}],"event":{"title":"Golden Gate Park Loop"}}}}</script>
</head>
<body></body>
</html>`;

    const { draft } = buildDraft({
      html,
      provider: 'partiful',
      sourceUrl: 'https://partiful.com/e/golden-gate',
    });

    expect(draft.hostName).toBe('(un)PTO');
  });
});

describe('pivotIngestPreviewService helpers', () => {
  it('extractMetaContent reads og tags', () => {
    expect(extractMetaContent(PARTIFUL_HTML, 'og:title')).toBe('Sunset Listening Party');
  });

  it('extractJsonLdBlocks parses script payloads', () => {
    const blocks = extractJsonLdBlocks(PARTIFUL_HTML);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]['@type']).toBe('Event');
  });
});

describe('pivotIngestPreviewService previewIngestUrl', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  it('returns draft for a valid Partiful URL', async () => {
    axios.get.mockResolvedValue({ data: PARTIFUL_HTML });

    const result = await previewIngestUrl({}, {
      url: 'https://partiful.com/e/sunset-listening',
    });

    expect(result.data.mode).toBe('single');
    expect(result.data.draft.hostName).toBe('Brooklyn Board Game Cafe');
    expect(result.data.draft.source).toBe('partiful');
    expect(axios.get).toHaveBeenCalledWith(
      'https://partiful.com/e/sunset-listening',
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  it('returns 504 on fetch timeout', async () => {
    const timeoutError = new Error('timeout');
    timeoutError.code = 'ECONNABORTED';
    axios.get.mockRejectedValue(timeoutError);

    const result = await previewIngestUrl({}, {
      url: 'https://partiful.com/e/slow',
    });

    expect(result.status).toBe(504);
    expect(result.code).toBe('FETCH_TIMEOUT');
  });

  it('returns 400 for garbage URL without fetching', async () => {
    const result = await previewIngestUrl({}, { url: '%%%' });
    expect(result.status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
  });
});

const LUMA_DISCOVER_HTML = `<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Popular events in San Francisco",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "item": {
          "@type": "Event",
          "url": "https://luma.com/yg5x8n8b",
          "name": "Founders Cowork",
          "startDate": "2026-06-28T14:00:00.000-07:00",
          "location": { "@type": "Place", "name": "Corgi Cafe" },
          "organizer": { "@type": "Person", "name": "Vivian Cai" }
        }
      }
    ]
  }
  </script>
</head>
<body></body>
</html>`;

const PARTIFUL_EXPLORE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Discover Things to Do in San Francisco | Partiful" />
  <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"sections":[{"items":[{"event":{"id":"et4Dy1XUkStHaCOavIfo","title":"Golden Gate Park Loop","description":"A group walk","locationInfo":{"type":"freeform","value":"Golden Gate Park"},"startDate":"2026-06-29T17:30:00.000Z","hostName":"Trail Club","image":{"upload":{"path":"external/user/bdCN1QDusxUzOvf2utH7X2jNx0o1/L6dpZYZxU-hmzRYVUklAT"},"url":"https://firebasestorage.googleapis.com/v0/b/getpartiful.appspot.com/o/external%2Fuser%2Fexample"}}}]}]}}}</script>
</head>
<body></body>
</html>`;

const LUMA_DISCOVER_NEXT_DATA_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="What's happening in San Francisco" />
  <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"initialData":{"kind":"discover-place","data":{"place":{"name":"San Francisco","publication_name":"What's happening in San Francisco"},"events":[{"event":{"url":"yg5x8n8b","name":"Founders Cowork","start_at":"2026-06-28T21:00:00.000Z","end_at":"2026-06-29T00:00:00.000Z","cover_url":"https://images.lumacdn.com/uploads/xr/dc792c6b.jpg","geo_address_info":{"full_address":"Corgi Cafe, San Francisco, CA"}},"hosts":[{"name":"Vivian Cai","avatar_url":"https://images.lumacdn.com/avatars/vivian.jpg"},{"name":"Adrian Yumul","avatar_url":"https://images.lumacdn.com/avatars/adrian.jpg"}],"calendar":{"name":"Personal","personal_user":{"first_name":"Vivian","last_name":"Cai","avatar_url":"https://images.lumacdn.com/avatars/vivian.jpg"}}}]}}}}}</script>
</head>
<body></body>
</html>`;

describe('pivotIngestPreviewService batch parsing', () => {
  it('classifies Partiful explore URLs as batch links', () => {
    const normalized = normalizeUrl('https://partiful.com/explore/sf');
    expect(normalized.provider).toBe('partiful');
    expect(classifyIngestUrl(normalized.parsed, normalized.provider).kind).toBe('batch');
  });

  it('parses Partiful explore events from NEXT_DATA', () => {
    const result = parsePartifulExploreBatch(
      PARTIFUL_EXPLORE_HTML,
      'https://partiful.com/explore/sf',
    );

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].draft.name).toBe('Golden Gate Park Loop');
    expect(result.drafts[0].sourceUrl).toBe('https://partiful.com/e/et4Dy1XUkStHaCOavIfo');
    expect(result.drafts[0].draft.hostName).toBe('Trail Club');
    expect(result.drafts[0].draft.image).toBe(
      'https://partiful.imgix.net/external/user/bdCN1QDusxUzOvf2utH7X2jNx0o1/L6dpZYZxU-hmzRYVUklAT?w=598&h=642&fit=clip',
    );
  });

  it('takes all discovered events by default (no 50 cap)', () => {
    const manyEvents = Array.from({ length: 60 }, (_, i) => ({
      id: `event-${i}`,
      title: `Event ${i}`,
      description: 'desc',
      startDate: '2026-07-10T20:00:00.000Z',
      endDate: '2026-07-10T22:00:00.000Z',
      hostName: 'Host',
      locationInfo: { name: 'NYC' },
    }));
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { events: manyEvents.map((event) => ({ event })) } },
    })}</script></html>`;

    const uncapped = parsePartifulExploreBatch(html, 'https://partiful.com/explore/sf');
    expect(uncapped.drafts).toHaveLength(60);
    expect(uncapped.truncated).toBe(false);
    expect(uncapped.limit).toBeNull();
    expect(uncapped.discoveredTotal).toBe(60);

    const capped = parsePartifulExploreBatch(html, 'https://partiful.com/explore/sf', {
      maxEvents: 50,
    });
    expect(capped.drafts).toHaveLength(50);
    expect(capped.truncated).toBe(true);
    expect(capped.discoveredTotal).toBe(60);

    const raised = parsePartifulExploreBatch(html, 'https://partiful.com/explore/sf', {
      maxEvents: 120,
    });
    expect(raised.drafts).toHaveLength(60);
    expect(raised.truncated).toBe(false);
  });

  it('parses Luma discover events from NEXT_DATA with cover images', () => {
    const result = parseLumaDiscoverBatch(LUMA_DISCOVER_NEXT_DATA_HTML, 'https://luma.com/sf');

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].draft.name).toBe('Founders Cowork');
    expect(result.drafts[0].draft.hostName).toBe('Vivian Cai & Adrian Yumul');
    expect(result.drafts[0].draft.image).toBe('https://images.lumacdn.com/uploads/xr/dc792c6b.jpg');
    expect(result.drafts[0].sourceUrl).toBe('https://luma.com/yg5x8n8b');
  });

  it('extracts Luma city slugs from discover URLs', () => {
    expect(extractLumaDiscoverSlug('https://luma.com/sf')).toBe('sf');
    expect(extractLumaDiscoverSlug('https://lu.ma/nyc/')).toBe('nyc');
    expect(extractLumaDiscoverSlug('https://luma.com/discover')).toBeNull();
    expect(extractLumaDiscoverSlug('https://luma.com/e/abc')).toBeNull();
  });

  it('paginates Luma discover API until exhausted', async () => {
    axios.get
      .mockResolvedValueOnce({
        status: 200,
        data: {
          entries: [
            {
              event: {
                name: 'Event One',
                url: 'one',
                start_at: '2026-07-11T20:00:00.000Z',
                cover_url: 'https://images.lumacdn.com/one.jpg',
                geo_address_info: { city_state: 'San Francisco, CA' },
              },
              hosts: [{ name: 'Host A' }],
            },
          ],
          has_more: true,
          next_cursor: 'cursor-1',
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          entries: [
            {
              event: {
                name: 'Event Two',
                url: 'two',
                start_at: '2026-07-12T20:00:00.000Z',
                cover_url: 'https://images.lumacdn.com/two.jpg',
                geo_address_info: { full_address: 'SF' },
              },
              hosts: [{ name: 'Host B' }],
              calendar: { name: 'Community Cal' },
            },
          ],
          has_more: false,
          next_cursor: null,
        },
      });

    const result = await fetchLumaDiscoverApiBatch({ slug: 'sf' });

    expect(result.error).toBeUndefined();
    expect(result.source).toBe('luma-discover-api');
    expect(result.pages).toBe(2);
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0].draft.name).toBe('Event One');
    expect(result.drafts[1].draft.hostName).toBe('Host B');
    expect(axios.get).toHaveBeenNthCalledWith(
      1,
      LUMA_DISCOVER_API_URL,
      expect.objectContaining({
        params: expect.objectContaining({ slug: 'sf', pagination_limit: 20 }),
      }),
    );
    expect(axios.get).toHaveBeenNthCalledWith(
      2,
      LUMA_DISCOVER_API_URL,
      expect.objectContaining({
        params: expect.objectContaining({
          slug: 'sf',
          pagination_cursor: 'cursor-1',
        }),
      }),
    );
  });

  it('honors maxEvents across Luma discover pages', async () => {
    axios.get
      .mockResolvedValueOnce({
        status: 200,
        data: {
          entries: Array.from({ length: 20 }, (_, i) => ({
            event: {
              name: `Event ${i}`,
              url: `evt-${i}`,
              start_at: '2026-07-11T20:00:00.000Z',
            },
            hosts: [{ name: 'Host' }],
          })),
          has_more: true,
          next_cursor: 'more',
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          entries: Array.from({ length: 20 }, (_, i) => ({
            event: {
              name: `Event ${i + 20}`,
              url: `evt-${i + 20}`,
              start_at: '2026-07-11T20:00:00.000Z',
            },
            hosts: [{ name: 'Host' }],
          })),
          has_more: true,
          next_cursor: 'more-2',
        },
      });

    const result = await fetchLumaDiscoverApiBatch({ slug: 'nyc', maxEvents: 25 });

    expect(result.drafts).toHaveLength(25);
    expect(result.truncated).toBe(true);
    expect(result.pages).toBe(2);
  });

  it('parses Luma discover ItemList events', () => {
    const result = parseLumaDiscoverBatch(LUMA_DISCOVER_HTML, 'https://luma.com/sf');

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].draft.name).toBe('Founders Cowork');
    expect(result.drafts[0].draft.hostName).toBe('Vivian Cai');
    expect(result.drafts[0].sourceUrl).toBe('https://luma.com/yg5x8n8b');
  });

  it('returns batch preview for Luma discover pages via API', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: {
        entries: [
          {
            event: {
              name: 'Founders Cowork',
              url: 'yg5x8n8b',
              start_at: '2026-06-28T21:00:00.000Z',
              cover_url: 'https://images.lumacdn.com/uploads/xr/dc792c6b.jpg',
              geo_address_info: { full_address: 'Corgi Cafe, San Francisco, CA' },
            },
            hosts: [{ name: 'Vivian Cai' }, { name: 'Adrian Yumul' }],
          },
        ],
        has_more: false,
      },
    });

    const result = await previewIngestUrl({}, { url: 'https://luma.com/sf' });

    expect(result.data.mode).toBe('batch');
    expect(result.data.discoverSource).toBe('luma-discover-api');
    expect(result.data.drafts).toHaveLength(1);
    expect(result.data.drafts[0].draft.name).toBe('Founders Cowork');
    expect(axios.get).toHaveBeenCalledWith(
      LUMA_DISCOVER_API_URL,
      expect.objectContaining({
        params: expect.objectContaining({ slug: 'sf' }),
      }),
    );
  });

  it('falls back to HTML when Luma discover API misses', async () => {
    axios.get
      .mockResolvedValueOnce({
        status: 404,
        data: { message: 'Sorry, we could not find what you were looking for.', code: null },
      })
      .mockResolvedValueOnce({ data: LUMA_DISCOVER_NEXT_DATA_HTML });

    const result = await previewIngestUrl({}, { url: 'https://luma.com/sf' });

    expect(result.data.mode).toBe('batch');
    expect(result.data.discoverSource).toBe('luma-html');
    expect(result.data.drafts).toHaveLength(1);
  });
});
