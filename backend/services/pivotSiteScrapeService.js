const axios = require('axios');

/**
 * Generic website event scraping for the `generic-site` curation provider.
 *
 * Partiful and Luma expose predictable HTML (`__NEXT_DATA__`, JSON-LD) and a
 * discover API, so `pivotIngestPreviewService` parses them directly. Long-tail
 * cities do not: venue calendars are client-rendered SPAs, plugin calendars with
 * their REST/ICS exports disabled, or bespoke pages with no structured markup.
 * This service delegates render + extraction to Firecrawl and normalizes the
 * result into the same draft shape the Partiful/Luma parsers return.
 *
 * It also exposes the search and map primitives that `pivotSourceDiscoveryService`
 * composes to find those sites in the first place, so the whole discover →
 * extract path runs on a single vendor credential.
 */

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape';
const FIRECRAWL_SEARCH_URL = 'https://api.firecrawl.dev/v2/search';
const FIRECRAWL_MAP_URL = 'https://api.firecrawl.dev/v2/map';
/** LLM extraction on a rendered page is slow; well above the 10s HTML fetch budget. */
const SCRAPE_TIMEOUT_MS = 90_000;
/** Search and map return metadata only (no render), so they settle far faster. */
const DISCOVERY_TIMEOUT_MS = 30_000;
/** Give client-rendered calendars a moment to paint before extraction. */
const SCRAPE_WAIT_FOR_MS = 3_000;
/**
 * Hard ceiling regardless of caller intent. Unlike HTML parsing, every page here
 * costs Firecrawl credits and LLM tokens, so an unbounded crawl is a cost risk.
 */
const MAX_SITE_EVENTS_CEILING = 250;

/**
 * Rate-limit retries.
 *
 * Safe to retry precisely because a 429 is refused before Firecrawl does any
 * work: no credits are consumed, so a retry costs only wall-clock time. That is
 * not true of timeouts or 5xx, which may already have burned a credit, so those
 * are deliberately not retried here.
 */
const RATE_LIMIT_MAX_ATTEMPTS = 3;
const RATE_LIMIT_BASE_DELAY_MS = 2_000;
/** Ceiling on any single wait, including a provider-supplied `Retry-After`. */
const RATE_LIMIT_MAX_DELAY_MS = 45_000;

/** Hosts that must never be scraped — link-local and private ranges (SSRF hygiene). */
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
];

const SITE_EVENT_SCHEMA = {
  type: 'object',
  properties: {
    listLabel: {
      type: 'string',
      description: 'Name of the venue, publication, or calendar this page belongs to.',
    },
    events: {
      type: 'array',
      description: 'Every distinct upcoming event listed on the page.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Event title as displayed.' },
          description: { type: 'string', description: 'Short listing copy, if present.' },
          startTime: {
            type: 'string',
            description: 'ISO-8601 start datetime with timezone offset.',
          },
          endTime: {
            type: 'string',
            description: 'ISO-8601 end datetime with timezone offset, if stated.',
          },
          location: {
            type: 'string',
            description: 'Venue name, and street address when shown.',
          },
          hostName: {
            type: 'string',
            description: 'Public-facing organizer, promoter, or venue presenting the event.',
          },
          imageUrl: { type: 'string', description: 'Absolute URL of the event poster image.' },
          eventUrl: { type: 'string', description: 'Absolute URL of this event detail page.' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Category or genre labels shown on the listing.',
          },
        },
        required: ['name'],
      },
    },
  },
  required: ['events'],
};

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (timer.unref) timer.unref();
  });
}

/**
 * Read `Retry-After`, which Firecrawl may send as either a seconds count or an
 * HTTP date. Preferred over our own backoff when present — the provider knows
 * when its window resets and we are only guessing.
 */
function parseRetryAfterMs(headers) {
  const raw = trimString(headers?.['retry-after'] || headers?.['Retry-After']);
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, RATE_LIMIT_MAX_DELAY_MS);
  }

  const when = Date.parse(raw);
  if (!Number.isNaN(when)) {
    return Math.min(Math.max(when - Date.now(), 0), RATE_LIMIT_MAX_DELAY_MS);
  }

  return null;
}

/** Exponential backoff with jitter, so parallel callers do not retry in lockstep. */
function backoffDelayMs(attempt, baseDelayMs = RATE_LIMIT_BASE_DELAY_MS) {
  if (!baseDelayMs) return 0;
  const base = Math.min(baseDelayMs * 2 ** (attempt - 1), RATE_LIMIT_MAX_DELAY_MS);
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/**
 * POST to Firecrawl, waiting out rate limits instead of failing on them.
 *
 * Discovery fires many requests in parallel, so brushing a per-minute limit is
 * routine rather than exceptional; treating it as failure throws away a whole
 * run over a condition that resolves itself in seconds.
 *
 * @param {function} [options.onRetry] - notified before each wait, so callers can
 *   report the delay rather than appearing to hang.
 * @param {number} [options.maxAttempts]
 * @param {number} [options.baseDelayMs] - 0 disables waiting between attempts.
 */
async function postWithRateLimitRetry(url, payload, config, options = {}) {
  const maxAttempts = Number(options.maxAttempts) > 0
    ? Math.floor(Number(options.maxAttempts))
    : RATE_LIMIT_MAX_ATTEMPTS;
  const baseDelayMs = Number.isFinite(options.baseDelayMs)
    ? options.baseDelayMs
    : RATE_LIMIT_BASE_DELAY_MS;

  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await axios.post(url, payload, config);
    } catch (err) {
      if (err.response?.status !== 429 || attempt >= maxAttempts) {
        err.rateLimitAttempts = attempt;
        throw err;
      }

      const waitMs =
        parseRetryAfterMs(err.response?.headers) ?? backoffDelayMs(attempt, baseDelayMs);
      try {
        options.onRetry?.({ attempt, maxAttempts, waitMs });
      } catch {
        // Reporting must never turn a recoverable throttle into a failure.
      }
      await sleep(waitMs);
    }
  }
}

function resolveFirecrawlApiKey() {
  return trimString(process.env.FIRECRAWL_API_KEY);
}

function isSiteScrapeConfigured() {
  return Boolean(resolveFirecrawlApiKey());
}

function scrapeNotConfiguredResult() {
  return {
    error:
      'Website scraping is not configured. Set FIRECRAWL_API_KEY in the backend environment to run generic-site curation jobs.',
    status: 503,
    code: 'SITE_SCRAPE_NOT_CONFIGURED',
  };
}

function isBlockedScrapeHost(hostname) {
  const host = trimString(hostname).toLowerCase();
  if (!host) return true;
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

/**
 * Validate a generic website URL. Unlike `normalizeUrl` in the preview service
 * there is no host allowlist — any public HTTP(S) origin is fair game.
 */
function normalizeSiteUrl(rawUrl) {
  const trimmed = trimString(rawUrl);
  if (!trimmed) {
    return { error: 'URL is required.', status: 400, code: 'URL_REQUIRED' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: 'Invalid URL.', status: 400, code: 'INVALID_URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { error: 'Only HTTP(S) URLs are supported.', status: 400, code: 'INVALID_URL' };
  }

  if (isBlockedScrapeHost(parsed.hostname)) {
    return {
      error: 'This host cannot be scraped.',
      status: 400,
      code: 'BLOCKED_HOST',
    };
  }

  return { url: parsed.toString(), parsed };
}

function resolveSiteBatchLimit(maxEvents) {
  if (maxEvents == null || maxEvents === '') {
    return MAX_SITE_EVENTS_CEILING;
  }
  const n = Number(maxEvents);
  if (!Number.isFinite(n) || n <= 0) {
    return MAX_SITE_EVENTS_CEILING;
  }
  return Math.min(Math.floor(n), MAX_SITE_EVENTS_CEILING);
}

/**
 * Listing pages routinely show dates as "Fri 8pm" with no year, so the extractor
 * needs today's date and the city's timezone to resolve them correctly.
 */
function buildExtractionPrompt({ now = new Date(), timezone = 'UTC' } = {}) {
  const today = now.toISOString().slice(0, 10);
  return [
    'Extract every distinct upcoming event listed on this page.',
    `Today's date is ${today}. The venue is in the ${timezone} timezone.`,
    'Resolve relative or partial dates (for example "Fri 8pm" or "March 4") against that date and timezone, choosing the next future occurrence.',
    'Return startTime and endTime as ISO-8601 with an explicit timezone offset.',
    'Set eventUrl to the absolute URL of the event detail page whenever the listing links to one.',
    'hostName is the public-facing organizer, promoter, or presenting venue — never the website name if a more specific organizer is shown.',
    'Ignore navigation links, newsletter signups, past events, and generic venue pages that are not a specific dated event.',
    'Omit any field you cannot read from the page. Do not guess dates, URLs, or venues.',
  ].join(' ');
}

function absoluteUrl(candidate, baseUrl) {
  const value = trimString(candidate);
  if (!value) return null;
  try {
    const resolved = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(resolved.protocol)) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function normalizeIsoDateTime(value) {
  const raw = trimString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function slugForFragment(value) {
  return trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Every draft needs a distinct `sourceUrl`: the publish path upserts catalog
 * events on `customFields.pivot.sourceUrl`, so reusing the listing page URL for
 * every event on it would make them overwrite one another. When a listing has no
 * per-event link, derive a stable fragment from the event itself.
 */
function resolveDraftSourceUrl(row, pageUrl) {
  const direct = absoluteUrl(row?.eventUrl, pageUrl);
  if (direct) return direct;

  const slug = slugForFragment(row?.name);
  const day = normalizeIsoDateTime(row?.startTime)?.slice(0, 10) || '';
  const fragment = [slug, day].filter(Boolean).join('-');
  if (!fragment) return pageUrl;

  try {
    const derived = new URL(pageUrl);
    derived.hash = fragment;
    return derived.toString();
  } catch {
    return pageUrl;
  }
}

function normalizeSourceTags(raw) {
  if (!Array.isArray(raw)) return [];
  const tags = raw.map((tag) => trimString(tag)).filter(Boolean);
  return [...new Set(tags)];
}

/**
 * Map one extracted row onto the draft shape produced by the Partiful/Luma
 * parsers, so downstream publish/duplicate handling is provider-agnostic.
 */
function buildSiteEventDraft(row, { pageUrl }) {
  const sourceUrl = resolveDraftSourceUrl(row, pageUrl);
  const draft = {
    name: trimString(row?.name) || null,
    description: trimString(row?.description) || null,
    image: absoluteUrl(row?.imageUrl, pageUrl),
    start_time: normalizeIsoDateTime(row?.startTime),
    end_time: normalizeIsoDateTime(row?.endTime),
    location: trimString(row?.location) || null,
    hostName: trimString(row?.hostName) || null,
    hostImageUrl: null,
    sourceUrl,
    source: 'generic-site',
    sourceTags: normalizeSourceTags(row?.tags),
  };

  return { draft, sourceUrl };
}

/**
 * Firecrawl's auth, quota, and rate-limit failures mean the same thing on every
 * endpoint, so scrape/search/map share the mapping and only vary the wording of
 * the timeout and catch-all cases.
 */
function mapScrapeRequestError(err, options = {}) {
  const timeoutMs = options.timeoutMs ?? SCRAPE_TIMEOUT_MS;
  const failureText = options.failureText || 'Unable to scrape this website';

  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return {
      error: `${options.timeoutSubject || 'Website scrape'} timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
      status: 504,
      code: 'SITE_SCRAPE_TIMEOUT',
    };
  }

  const status = err.response?.status;
  if (status === 401 || status === 403) {
    return {
      error: 'Website scraping rejected the configured FIRECRAWL_API_KEY.',
      status: 502,
      code: 'SITE_SCRAPE_AUTH_FAILED',
    };
  }
  if (status === 402) {
    return {
      error: 'Website scraping credits are exhausted.',
      status: 402,
      code: 'SITE_SCRAPE_QUOTA_EXCEEDED',
    };
  }
  if (status === 429) {
    // Say what the provider said and how hard we already tried, because the
    // remedy differs: a per-minute window clears itself, a plan limit does not.
    const attempts = Number(err.rateLimitAttempts) || 1;
    const detail = trimString(err.response?.data?.error);
    const retryAfterMs = parseRetryAfterMs(err.response?.headers);

    return {
      error: [
        `Website scraping is rate limited by Firecrawl (gave up after ${attempts} attempt${attempts === 1 ? '' : 's'}).`,
        detail || null,
        retryAfterMs ? `It asked to wait ${Math.ceil(retryAfterMs / 1000)}s.` : null,
      ]
        .filter(Boolean)
        .join(' '),
      status: 429,
      code: 'SITE_SCRAPE_RATE_LIMITED',
    };
  }

  const detail = trimString(err.response?.data?.error) || trimString(err.message);
  return {
    error: detail ? `${failureText}: ${detail}` : `${failureText}.`,
    status: 502,
    code: 'SITE_SCRAPE_FAILED',
  };
}

/**
 * Render `url` and extract its event listings.
 *
 * @returns {Promise<{listLabel: string|null, drafts: Array<{draft: object, sourceUrl: string}>,
 *   truncated: boolean, discoveredTotal: number, limit: number, source: string}
 *   | {error: string, status: number, code: string}>}
 */
async function scrapeSiteEvents(options = {}) {
  const apiKey = resolveFirecrawlApiKey();
  if (!apiKey) {
    return scrapeNotConfiguredResult();
  }

  const normalized = normalizeSiteUrl(options.url);
  if (normalized.error) {
    return normalized;
  }

  const limit = resolveSiteBatchLimit(options.maxEvents);

  let response;
  try {
    response = await postWithRateLimitRetry(
      FIRECRAWL_SCRAPE_URL,
      {
        url: normalized.url,
        onlyMainContent: false,
        waitFor: SCRAPE_WAIT_FOR_MS,
        formats: [
          {
            type: 'json',
            schema: SITE_EVENT_SCHEMA,
            prompt: buildExtractionPrompt({ now: options.now, timezone: options.timezone }),
          },
        ],
      },
      {
        timeout: SCRAPE_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      { onRetry: options.onRetry, ...(options.retry || {}) },
    );
  } catch (err) {
    return mapScrapeRequestError(err);
  }

  const body = response?.data;
  if (body && body.success === false) {
    return {
      error: trimString(body.error) || 'Unable to scrape this website.',
      status: 502,
      code: 'SITE_SCRAPE_FAILED',
    };
  }

  const extracted = body?.data?.json || body?.json;
  if (!extracted || typeof extracted !== 'object') {
    return {
      error: 'Website scrape returned no structured data.',
      status: 422,
      code: 'SITE_SCRAPE_UNPARSEABLE',
    };
  }

  const rows = Array.isArray(extracted.events) ? extracted.events : [];
  const named = rows.filter((row) => trimString(row?.name));

  // Distinct sourceUrl per draft — see resolveDraftSourceUrl.
  const seen = new Set();
  const deduped = [];
  for (const row of named) {
    const built = buildSiteEventDraft(row, { pageUrl: normalized.url });
    if (seen.has(built.sourceUrl)) continue;
    seen.add(built.sourceUrl);
    deduped.push(built);
  }

  return {
    listLabel: trimString(extracted.listLabel) || null,
    drafts: deduped.slice(0, limit),
    truncated: deduped.length > limit,
    discoveredTotal: deduped.length,
    limit,
    source: 'firecrawl-json',
  };
}

/**
 * Firecrawl returns result rows as `{url, title, description}` under a
 * source-specific key, but older payloads put a bare array on `data`. Accept
 * both and drop anything that is not a scrapable public URL.
 */
function normalizeResultRows(rows) {
  if (!Array.isArray(rows)) return [];

  const seen = new Set();
  const normalized = [];
  for (const row of rows) {
    const rawUrl = typeof row === 'string' ? row : trimString(row?.url);
    const candidate = normalizeSiteUrl(rawUrl);
    if (candidate.error || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    normalized.push({
      url: candidate.url,
      title: typeof row === 'string' ? null : trimString(row?.title) || null,
      description: typeof row === 'string' ? null : trimString(row?.description) || null,
    });
  }

  return normalized;
}

/**
 * Web search without a separate search vendor — the same key that powers
 * `scrapeSiteEvents`. Metadata only: no `scrapeOptions`, because discovery
 * qualifies candidates with a targeted scrape later instead of paying to render
 * every search hit.
 *
 * @returns {Promise<{results: Array<{url: string, title: string|null,
 *   description: string|null}>} | {error: string, status: number, code: string}>}
 */
async function searchSites(options = {}) {
  const apiKey = resolveFirecrawlApiKey();
  if (!apiKey) {
    return scrapeNotConfiguredResult();
  }

  const query = trimString(options.query);
  if (!query) {
    return { error: 'query is required.', status: 400, code: 'QUERY_REQUIRED' };
  }

  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 50);
  const payload = { query, limit, sources: ['web'] };
  if (trimString(options.location)) payload.location = trimString(options.location);
  if (trimString(options.country)) payload.country = trimString(options.country);

  let response;
  try {
    response = await postWithRateLimitRetry(
      FIRECRAWL_SEARCH_URL,
      payload,
      {
        timeout: DISCOVERY_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      { onRetry: options.onRetry, ...(options.retry || {}) },
    );
  } catch (err) {
    return mapScrapeRequestError(err, {
      timeoutMs: DISCOVERY_TIMEOUT_MS,
      timeoutSubject: 'Website search',
      failureText: 'Unable to search for event sources',
    });
  }

  const body = response?.data;
  if (body && body.success === false) {
    return {
      error: trimString(body.error) || 'Unable to search for event sources.',
      status: 502,
      code: 'SITE_SCRAPE_FAILED',
    };
  }

  const rows = Array.isArray(body?.data?.web)
    ? body.data.web
    : Array.isArray(body?.data)
      ? body.data
      : [];

  return { results: normalizeResultRows(rows) };
}

/**
 * List a site's URLs so discovery can find its calendar index rather than
 * settling for whichever page the search engine surfaced. Costs one credit per
 * call regardless of how many links come back, which is why it runs before the
 * far pricier qualifying scrape.
 *
 * @returns {Promise<{links: Array<{url: string, title: string|null,
 *   description: string|null}>} | {error: string, status: number, code: string}>}
 */
async function mapSite(options = {}) {
  const apiKey = resolveFirecrawlApiKey();
  if (!apiKey) {
    return scrapeNotConfiguredResult();
  }

  const normalized = normalizeSiteUrl(options.url);
  if (normalized.error) {
    return normalized;
  }

  const payload = {
    url: normalized.url,
    limit: Math.min(Math.max(Number(options.limit) || 50, 1), 500),
    // Venue calendars often live on a subdomain (arts.example.edu); keeping them
    // in scope is the point of mapping rather than guessing paths.
    includeSubdomains: true,
  };
  if (trimString(options.search)) payload.search = trimString(options.search);

  let response;
  try {
    response = await postWithRateLimitRetry(
      FIRECRAWL_MAP_URL,
      payload,
      {
        timeout: DISCOVERY_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      { onRetry: options.onRetry, ...(options.retry || {}) },
    );
  } catch (err) {
    return mapScrapeRequestError(err, {
      timeoutMs: DISCOVERY_TIMEOUT_MS,
      timeoutSubject: 'Website map',
      failureText: 'Unable to map this website',
    });
  }

  const body = response?.data;
  if (body && body.success === false) {
    return {
      error: trimString(body.error) || 'Unable to map this website.',
      status: 502,
      code: 'SITE_SCRAPE_FAILED',
    };
  }

  const rows = Array.isArray(body?.links)
    ? body.links
    : Array.isArray(body?.data?.links)
      ? body.data.links
      : [];

  return { links: normalizeResultRows(rows) };
}

module.exports = {
  scrapeSiteEvents,
  searchSites,
  mapSite,
  normalizeSiteUrl,
  buildSiteEventDraft,
  isSiteScrapeConfigured,
  scrapeNotConfiguredResult,
  isBlockedScrapeHost,
  resolveSiteBatchLimit,
  parseRetryAfterMs,
  postWithRateLimitRetry,
  buildExtractionPrompt,
  normalizeIsoDateTime,
  SITE_EVENT_SCHEMA,
  FIRECRAWL_SCRAPE_URL,
  FIRECRAWL_SEARCH_URL,
  FIRECRAWL_MAP_URL,
  SCRAPE_TIMEOUT_MS,
  DISCOVERY_TIMEOUT_MS,
  SCRAPE_WAIT_FOR_MS,
  MAX_SITE_EVENTS_CEILING,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_MAX_DELAY_MS,
};
