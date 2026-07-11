const axios = require('axios');
const {
  annotateImportDrafts,
  formatDuplicateWarning,
  isBlockingDuplicate,
  loadCatalogDuplicateIndex,
  resolveImportDuplicate,
} = require('./pivotIngestDuplicateService');

const FETCH_TIMEOUT_MS = 10_000;
/**
 * Optional hard ceiling only when callers pass an explicit `maxEvents`.
 * Default (null / omitted) = take every event found in the page HTML / API.
 */
const MAX_BATCH_EVENTS_CEILING = 10_000;
/** @deprecated Unlimited by default; kept for older imports that expect a number export. */
const DEFAULT_PREVIEW_BATCH_LIMIT = null;
/** @deprecated Unlimited by default; prefer omitting maxEvents. */
const MAX_CRAWL_BATCH_EVENTS = null;
/** @deprecated Alias of DEFAULT_PREVIEW_BATCH_LIMIT. */
const MAX_BATCH_EVENTS = DEFAULT_PREVIEW_BATCH_LIMIT;
const HOST_ENRICH_CONCURRENCY = 4;

/** Unauthenticated Luma city/category discover API (paginated JSON). */
const LUMA_DISCOVER_API_URL = 'https://api.luma.com/discover/get-paginated-events';
const LUMA_DISCOVER_PAGE_SIZE = 20;
/** Safety rail against runaway pagination. */
const MAX_LUMA_DISCOVER_PAGES = 100;

const ALLOWED_HOST_SUFFIXES = ['partiful.com', 'lu.ma', 'luma.com'];

const PROVIDER_LABELS = {
  partiful: 'Partiful',
  luma: 'Luma',
};

const LUMA_RESERVED_SLUGS = new Set([
  'user',
  'discover',
  'signin',
  'signup',
  'home',
  'login',
  'e',
  'event',
  'calendar',
  'create',
  'settings',
]);

/**
 * @param {unknown} maxEvents
 * @returns {number|null} Positive limit, or null for no artificial cap.
 */
function resolveBatchLimit(maxEvents) {
  if (maxEvents == null || maxEvents === '') {
    return null;
  }
  const n = Number(maxEvents);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.min(Math.floor(n), MAX_BATCH_EVENTS_CEILING);
}

function sliceToBatchLimit(items, limit) {
  if (limit == null) return items;
  return items.slice(0, limit);
}

function isBatchTruncated(discoveredTotal, limit) {
  return limit != null && discoveredTotal > limit;
}

function decodeHtmlEntities(value) {
  if (!value) return value;
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function extractMetaContent(html, key) {
  const patterns = [
    new RegExp(
      `<meta\\s+[^>]*(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      'i',
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const pattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match = pattern.exec(html);
  while (match) {
    const raw = match[1]?.trim();
    if (raw) {
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        // Skip malformed JSON-LD blocks.
      }
    }
    match = pattern.exec(html);
  }

  return blocks;
}

function flattenJsonLdNodes(block) {
  const nodes = [];

  function walk(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== 'object') return;

    nodes.push(value);
    if (Array.isArray(value['@graph'])) {
      value['@graph'].forEach(walk);
    }
  }

  walk(block);
  return nodes;
}

function hasType(node, typeName) {
  const type = node['@type'];
  if (Array.isArray(type)) {
    return type.some((entry) => String(entry).toLowerCase() === typeName.toLowerCase());
  }
  return String(type || '').toLowerCase() === typeName.toLowerCase();
}

function organizerNameFromNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.name === 'string' && node.name.trim()) {
    return node.name.trim();
  }
  return null;
}

function isInvalidHostName(name) {
  if (typeof name !== 'string') return true;
  const normalized = name.trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'partiful.com' ||
    normalized === 'luma.com' ||
    normalized === 'lu.ma' ||
    normalized === 'partiful' ||
    normalized === 'luma'
  );
}

function firstPlausibleHostName(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() && !isInvalidHostName(value)) {
      return value.trim();
    }
  }
  return null;
}

function isProfileOrAvatarImageUrl(raw) {
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!normalized) return false;

  return (
    /(?:^|[/])(?:avatars|profileimages)(?:[/]|$)/.test(normalized) ||
    normalized.includes('cdn.lu.ma/avatars') ||
    (normalized.includes('lumacdn.com/avatars') && normalized.includes('/uc/'))
  );
}

function sanitizeEventPosterImage(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || isProfileOrAvatarImageUrl(trimmed)) {
    return null;
  }
  return trimmed;
}

function joinHostNames(names, limit = 3) {
  const unique = [];
  for (const name of names) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || isInvalidHostName(trimmed)) continue;
    if (!unique.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      unique.push(trimmed);
    }
  }

  if (!unique.length) return null;
  return unique.slice(0, limit).join(' & ');
}

function organizerNamesFromNodes(organizer) {
  if (!organizer) return null;

  const nodes = Array.isArray(organizer) ? organizer : [organizer];
  const organizationNames = nodes
    .filter((node) => hasType(node, 'Organization'))
    .map(organizerNameFromNode)
    .filter(Boolean);
  if (organizationNames.length) {
    return joinHostNames(organizationNames, 2);
  }

  return joinHostNames(nodes.map(organizerNameFromNode).filter(Boolean));
}

function hostNamesFromPartifulHosts(hosts) {
  if (!Array.isArray(hosts) || !hosts.length) {
    return { hostName: null, hostImageUrl: null };
  }

  const normalized = hosts
    .map((host) => ({
      name: typeof host?.name === 'string' ? host.name.trim() : '',
      isManaged: host?.isManaged === true,
      host,
    }))
    .filter((entry) => entry.name && !isInvalidHostName(entry.name));

  if (!normalized.length) {
    return { hostName: null, hostImageUrl: null };
  }

  const managed = normalized.filter((entry) => entry.isManaged);
  const chosen = managed.length ? managed : normalized;
  const hostName = joinHostNames(
    chosen.map((entry) => entry.name),
    managed.length ? 2 : 3,
  );
  const primary = chosen[0];

  return {
    hostName,
    hostImageUrl: null,
  };
}

function hostNamesFromLumaHosts(hosts) {
  if (!Array.isArray(hosts) || !hosts.length) {
    return { hostName: null, hostImageUrl: null };
  }

  const normalized = hosts
    .map((host) => {
      if (typeof host === 'string') {
        return { name: host.trim(), avatarUrl: null };
      }

      const name =
        host?.name?.trim() ||
        [host?.first_name, host?.last_name]
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean)
          .join(' ')
          .trim();

      return {
        name,
        avatarUrl: host?.avatar_url?.trim() || null,
      };
    })
    .filter((entry) => entry.name && !isInvalidHostName(entry.name));

  if (!normalized.length) {
    return { hostName: null, hostImageUrl: null };
  }

  return {
    hostName: joinHostNames(
      normalized.map((entry) => entry.name),
      3,
    ),
    hostImageUrl: null,
  };
}

function parsePartifulPageProps(html) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1])?.props?.pageProps || null;
  } catch {
    return null;
  }
}
function organizerNodeFromEvent(eventNode) {
  const organizer = eventNode.organizer;
  if (!organizer) return null;

  if (Array.isArray(organizer)) {
    const organization = organizer.find(
      (node) => hasType(node, 'Organization') && organizerNameFromNode(node),
    );
    if (organization) return organization;

    return organizer.find((node) => organizerNameFromNode(node)) || null;
  }

  if (typeof organizer === 'object') {
    return organizer;
  }

  return null;
}

function organizerImageFromNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.image === 'string' && node.image.trim()) {
    return node.image.trim();
  }
  if (Array.isArray(node.image) && typeof node.image[0] === 'string') {
    return node.image[0].trim();
  }
  if (node.image && typeof node.image.url === 'string') {
    return node.image.url.trim();
  }
  return null;
}

function parseJsonLdEvent(nodes) {
  const eventNode = nodes.find((node) => hasType(node, 'Event'));
  if (!eventNode) {
    return {};
  }

  let location = null;
  if (eventNode.location) {
    if (typeof eventNode.location === 'string') {
      location = eventNode.location.trim();
    } else if (typeof eventNode.location === 'object') {
      location =
        eventNode.location.name?.trim() ||
        eventNode.location.address?.streetAddress?.trim() ||
        [
          eventNode.location.address?.addressLocality,
          eventNode.location.address?.addressRegion,
        ]
          .filter(Boolean)
          .join(', ')
          .trim() ||
        null;
    }
  }

  return {
    name: typeof eventNode.name === 'string' ? eventNode.name.trim() : null,
    description:
      typeof eventNode.description === 'string' ? eventNode.description.trim() : null,
    image: sanitizeEventPosterImage(
      typeof eventNode.image === 'string'
        ? eventNode.image.trim()
        : organizerImageFromNode({ image: eventNode.image }),
    ),
    start_time: eventNode.startDate || null,
    end_time: eventNode.endDate || null,
    location,
    hostName: organizerNamesFromNodes(eventNode.organizer),
    hostImageUrl: null,
  };
}

function parseNextDataHost(html) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return {};

  try {
    const payload = JSON.parse(match[1]);
    const serialized = JSON.stringify(payload);

    // Match hostName exactly — a case-insensitive pattern also matches `"hostname":"partiful.com"`.
    const hostNameMatch = serialized.match(/"hostName"\s*:\s*"([^"\\]+)"/);
    const hostImageMatch = serialized.match(/"host(?:Image|Avatar|Photo)(?:Url)?"\s*:\s*"([^"\\]+)"/i);
    const organizerMatch = serialized.match(/"organizerName"\s*:\s*"([^"\\]+)"/);

    return {
      hostName: firstPlausibleHostName(hostNameMatch?.[1], organizerMatch?.[1]),
      hostImageUrl: hostImageMatch?.[1] || null,
    };
  } catch {
    return {};
  }
}

function parsePartifulHost(html) {
  const fromHosts = hostNamesFromPartifulHosts(parsePartifulPageProps(html)?.hosts);
  if (fromHosts.hostName) {
    return fromHosts;
  }

  const fromNext = parseNextDataHost(html);
  if (fromNext.hostName) {
    return fromNext;
  }

  const profileMatch = html.match(/partiful\.com\/u\/([^/"'?]+)/i);
  if (profileMatch?.[1]) {
    const slug = decodeURIComponent(profileMatch[1]).replace(/[-_]/g, ' ');
    const hostName = slug.replace(/\b\w/g, (char) => char.toUpperCase());
    if (!isInvalidHostName(hostName)) {
      return {
        hostName,
        hostImageUrl: fromNext.hostImageUrl || null,
      };
    }
  }

  return fromNext;
}

function parseLumaHost(html, nodes) {
  const fromJson = nodes
    .filter((node) => hasType(node, 'Person') || hasType(node, 'Organization'))
    .map((node) => ({
      hostName: organizerNameFromNode(node),
      hostImageUrl: organizerImageFromNode(node),
    }))
    .find((row) => row.hostName);

  if (fromJson?.hostName) {
    return fromJson;
  }

  const hostLabel = extractMetaContent(html, 'luma:event:host_name');
  if (hostLabel) {
    return { hostName: hostLabel, hostImageUrl: null };
  }

  return parseNextDataHost(html);
}

function detectProvider(hostname) {
  const host = hostname.toLowerCase();
  if (host.includes('partiful')) return 'partiful';
  if (host.includes('lu.ma') || host.includes('luma')) return 'luma';
  return null;
}

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function normalizeUrl(rawUrl) {
  const trimmed = rawUrl?.trim();
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

  if (!isAllowedHost(parsed.hostname)) {
    return {
      error: 'URL must be a Partiful or Luma event or explore link.',
      status: 400,
      code: 'UNSUPPORTED_HOST',
    };
  }

  return { url: parsed.toString(), provider: detectProvider(parsed.hostname), parsed };
}

function classifyIngestUrl(parsed, provider) {
  const path = parsed.pathname.replace(/\/+$/, '') || '/';

  if (provider === 'partiful') {
    if (/^\/explore\/[^/]+$/i.test(path)) {
      return { kind: 'batch', batchType: 'partiful-explore' };
    }
    return { kind: 'single' };
  }

  if (provider === 'luma') {
    if (/^\/[^/]+$/i.test(path) && !/^\/(user|discover|signin|signup|home|login)/i.test(path)) {
      return { kind: 'batch-candidate', batchType: 'luma-discover' };
    }
    return { kind: 'single' };
  }

  return { kind: 'single' };
}

function draftWarnings(draft) {
  const warnings = [];
  if (!draft.name) {
    warnings.push('Could not parse event title — enter manually before publishing.');
  }
  if (!draft.hostName) {
    warnings.push('Could not parse organizer name — enter manually before publishing.');
  }
  if (!draft.start_time) {
    warnings.push('Could not parse start time — set manually before publishing.');
  }
  if (!draft.location) {
    warnings.push('Could not parse location — set manually before publishing.');
  }
  return warnings;
}

function partifulLocationFromInfo(locationInfo) {
  if (!locationInfo || typeof locationInfo !== 'object') return null;

  if (locationInfo.type === 'freeform' && typeof locationInfo.value === 'string') {
    return locationInfo.value.trim() || null;
  }

  if (locationInfo.mapsInfo?.name) {
    const lines = locationInfo.mapsInfo.addressLines || [];
    return [locationInfo.mapsInfo.name, ...lines].filter(Boolean).join(', ').trim() || null;
  }

  if (Array.isArray(locationInfo.displayAddressLines) && locationInfo.displayAddressLines.length) {
    return locationInfo.displayAddressLines.join(', ').trim() || null;
  }

  return locationInfo.approximateLocation?.trim() || null;
}

function partifulImageFromEvent(event) {
  if (!event?.image || typeof event.image !== 'object') return null;

  const uploadPath =
    typeof event.image.upload?.path === 'string' ? event.image.upload.path.trim() : null;
  if (uploadPath) {
    return sanitizeEventPosterImage(
      `https://partiful.imgix.net/${uploadPath}?w=598&h=642&fit=clip`,
    );
  }

  const directUrl = event.image.url?.trim() || event.image.upload?.url?.trim();
  return sanitizeEventPosterImage(directUrl);
}

function isInaccessiblePartifulImage(url) {
  return typeof url !== 'string' || !url.trim() || url.includes('firebasestorage.googleapis.com');
}

function buildPartifulExploreDraft(event) {
  const sourceUrl = event.id ? `https://partiful.com/e/${event.id}` : null;
  const draft = {
    name: typeof event.title === 'string' ? event.title.trim() : null,
    description: typeof event.description === 'string' ? event.description.trim() : null,
    image: partifulImageFromEvent(event),
    start_time: event.startDate || null,
    end_time: event.endDate || null,
    location: partifulLocationFromInfo(event.locationInfo),
    hostName: typeof event.hostName === 'string' ? event.hostName.trim() : null,
    hostImageUrl: null,
    sourceUrl,
    source: 'partiful',
    sourceTags: extractPartifulSourceTags(event),
  };

  return { draft, warnings: draftWarnings(draft), sourceUrl };
}

function extractPartifulSourceTags(event) {
  if (!event || typeof event !== 'object') return [];

  const tags = [];
  if (Array.isArray(event.tags)) {
    for (const entry of event.tags) {
      if (typeof entry === 'string' && entry.trim()) {
        tags.push(entry.trim());
      } else if (entry && typeof entry.name === 'string' && entry.name.trim()) {
        tags.push(entry.name.trim());
      }
    }
  }
  if (typeof event.category === 'string' && event.category.trim()) {
    tags.push(event.category.trim());
  }
  if (Array.isArray(event.categories)) {
    for (const entry of event.categories) {
      if (typeof entry === 'string' && entry.trim()) {
        tags.push(entry.trim());
      }
    }
  }

  return [...new Set(tags)];
}

function extractPartifulEventSlugFromUrl(sourceUrl) {
  if (!sourceUrl) return null;
  try {
    const match = new URL(sourceUrl).pathname.match(/\/e\/([^/]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function parsePartifulSingleEventDraft(html, sourceUrl) {
  const pageProps = parsePartifulPageProps(html);
  const event = pageProps?.event;
  if (!event || typeof event !== 'object') {
    return null;
  }

  const hostFields = hostNamesFromPartifulHosts(pageProps?.hosts);
  const built = buildPartifulExploreDraft({
    ...event,
    id: event.id || extractPartifulEventSlugFromUrl(sourceUrl),
    hostName: firstPlausibleHostName(
      typeof event.hostName === 'string' ? event.hostName.trim() : null,
      hostFields.hostName,
    ),
  });

  if (!built.draft.sourceUrl && sourceUrl) {
    built.draft.sourceUrl = sourceUrl;
  }

  return built.draft;
}

function extractPartifulExploreEvents(html) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return [];

  let pageProps;
  try {
    pageProps = JSON.parse(match[1])?.props?.pageProps;
  } catch {
    return [];
  }
  if (!pageProps) return [];

  const events = [];
  const seen = new Set();

  function collect(node) {
    if (!node || typeof node !== 'object') return;
    if (node.event?.id && !seen.has(node.event.id)) {
      seen.add(node.event.id);
      events.push(node.event);
    }
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    Object.values(node).forEach(collect);
  }

  collect(pageProps);
  return events;
}

function parsePartifulExploreBatch(html, sourceUrl, options = {}) {
  const limit = resolveBatchLimit(options.maxEvents);
  const allEvents = extractPartifulExploreEvents(html);
  const events = sliceToBatchLimit(allEvents, limit);
  const drafts = events.map((event) => buildPartifulExploreDraft(event));
  const listLabel = extractMetaContent(html, 'og:title') || 'Partiful explore';

  return {
    listLabel,
    drafts,
    truncated: isBatchTruncated(allEvents.length, limit),
    discoveredTotal: allEvents.length,
    limit,
  };
}

function organizerFromLumaEvent(eventNode) {
  return organizerNamesFromNodes(eventNode.organizer);
}

function imageFromLumaEvent(eventNode) {
  if (typeof eventNode.image === 'string') {
    return sanitizeEventPosterImage(eventNode.image);
  }
  if (Array.isArray(eventNode.image) && typeof eventNode.image[0] === 'string') {
    return sanitizeEventPosterImage(eventNode.image[0]);
  }
  return sanitizeEventPosterImage(organizerImageFromNode({ image: eventNode.image }));
}

function locationFromLumaEvent(eventNode) {
  if (!eventNode.location) return null;
  if (typeof eventNode.location === 'string') {
    return eventNode.location.trim();
  }
  if (typeof eventNode.location !== 'object') return null;

  return (
    eventNode.location.name?.trim() ||
    eventNode.location.address?.streetAddress?.trim() ||
    [
      eventNode.location.address?.addressLocality,
      eventNode.location.address?.addressRegion,
    ]
      .filter(Boolean)
      .join(', ')
      .trim() ||
    null
  );
}

function buildLumaDiscoverDraft(eventNode) {
  const rawUrl = eventNode.url || eventNode['@id'] || null;
  let sourceUrl = rawUrl;
  if (sourceUrl && sourceUrl.startsWith('/')) {
    sourceUrl = `https://luma.com${sourceUrl}`;
  } else if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    sourceUrl = `https://luma.com/${sourceUrl.replace(/^\/+/, '')}`;
  }

  const draft = {
    name: typeof eventNode.name === 'string' ? eventNode.name.trim() : null,
    description: typeof eventNode.description === 'string' ? eventNode.description.trim() : null,
    image: imageFromLumaEvent(eventNode),
    start_time: eventNode.startDate || eventNode.start_at || null,
    end_time: eventNode.endDate || eventNode.end_at || null,
    location: locationFromLumaEvent(eventNode),
    hostName: organizerFromLumaEvent(eventNode),
    hostImageUrl: null,
    sourceUrl,
    source: 'luma',
  };

  return { draft, warnings: draftWarnings(draft), sourceUrl };
}

function extractLumaDiscoverEventsFromNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    return { events: [], listLabel: null };
  }

  let initialData;
  try {
    initialData = JSON.parse(match[1])?.props?.pageProps?.initialData;
  } catch {
    return { events: [], listLabel: null };
  }

  const events = Array.isArray(initialData?.data?.events) ? initialData.data.events : [];
  const listLabel =
    initialData?.data?.place?.publication_name?.trim() ||
    initialData?.data?.place?.name?.trim() ||
    null;

  return { events, listLabel };
}

function hostFieldsFromLumaDiscoverEntry(entry) {
  const fromHosts = hostNamesFromLumaHosts(entry?.hosts);
  if (fromHosts.hostName) {
    return fromHosts;
  }

  const calendar = entry?.calendar;
  const user = calendar?.personal_user;
  if (user) {
    const fullName = [user.first_name, user.last_name]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (fullName) {
      return {
        hostName: fullName,
        hostImageUrl: null,
      };
    }
    if (typeof user.name === 'string' && user.name.trim()) {
      return {
        hostName: user.name.trim(),
        hostImageUrl: null,
      };
    }
  }

  if (typeof calendar?.name === 'string') {
    const calendarName = calendar.name.trim();
    if (calendarName && calendarName.toLowerCase() !== 'personal') {
      return {
        hostName: calendarName,
        hostImageUrl: null,
      };
    }
  }

  return { hostName: null, hostImageUrl: null };
}

function locationFromLumaDiscoverEvent(event) {
  const geo = event?.geo_address_info;
  if (!geo || typeof geo !== 'object') return null;

  return (
    geo.full_address?.trim() ||
    geo.short_address?.trim() ||
    geo.address?.trim() ||
    geo.city_state?.trim() ||
    null
  );
}

function imageFromLumaDiscoverEvent(event) {
  return (
    sanitizeEventPosterImage(event?.cover_url) ||
    sanitizeEventPosterImage(event?.social_image_url) ||
    null
  );
}

function buildLumaDiscoverDraftFromNextData(entry) {
  const event = entry?.event;
  if (!event) {
    return null;
  }

  const slug = typeof event.url === 'string' ? event.url.trim() : '';
  const sourceUrl = slug ? `https://luma.com/${slug.replace(/^\/+/, '')}` : null;
  const hostFields = hostFieldsFromLumaDiscoverEntry(entry);
  const draft = {
    name: typeof event.name === 'string' ? event.name.trim() : null,
    description: null,
    image: imageFromLumaDiscoverEvent(event),
    start_time: event.start_at || null,
    end_time: event.end_at || null,
    location: locationFromLumaDiscoverEvent(event),
    hostName: hostFields.hostName,
    hostImageUrl: hostFields.hostImageUrl,
    sourceUrl,
    source: 'luma',
  };

  return { draft, warnings: draftWarnings(draft), sourceUrl };
}

/**
 * City/category slug from a Luma discover URL (`https://luma.com/sf` → `sf`).
 * Calendar/event paths return null (not discover-API scoped).
 */
function extractLumaDiscoverSlug(parsedOrUrl) {
  let parsed = parsedOrUrl;
  if (typeof parsedOrUrl === 'string') {
    try {
      parsed = new URL(parsedOrUrl);
    } catch {
      return null;
    }
  }
  if (!parsed?.pathname) return null;
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  const match = path.match(/^\/([^/]+)$/i);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]).trim().toLowerCase();
  if (!slug || LUMA_RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

async function fetchLumaDiscoverApiPage({
  slug,
  cursor = null,
  pageSize = LUMA_DISCOVER_PAGE_SIZE,
  latitude = null,
  longitude = null,
} = {}) {
  if (!slug) {
    return {
      error: 'Luma discover slug is required.',
      status: 400,
      code: 'INVALID_LUMA_SLUG',
    };
  }

  const params = {
    slug,
    pagination_limit: Math.min(
      Math.max(1, Number(pageSize) || LUMA_DISCOVER_PAGE_SIZE),
      LUMA_DISCOVER_PAGE_SIZE,
    ),
  };
  if (cursor) params.pagination_cursor = cursor;
  if (latitude != null && longitude != null && latitude !== '' && longitude !== '') {
    params.latitude = latitude;
    params.longitude = longitude;
  }

  try {
    const response = await axios.get(LUMA_DISCOVER_API_URL, {
      params,
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        'User-Agent':
          'MeridianPivotLab/1.0 (+https://meridian.study; event ingest preview)',
        Accept: 'application/json',
      },
      validateStatus: (status) => status >= 200 && status < 500,
    });

    if (response.status >= 400 || response.data?.message) {
      return {
        error:
          response.data?.message ||
          `Luma discover API returned ${response.status}.`,
        status: response.status >= 400 ? response.status : 422,
        code: response.data?.code || 'LUMA_DISCOVER_FAILED',
      };
    }

    return {
      entries: Array.isArray(response.data?.entries) ? response.data.entries : [],
      hasMore: Boolean(response.data?.has_more),
      nextCursor: response.data?.next_cursor || null,
    };
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return {
        error: 'Luma discover API timed out.',
        status: 504,
        code: 'FETCH_TIMEOUT',
      };
    }
    return {
      error: err.message || 'Failed to reach Luma discover API.',
      status: 502,
      code: 'LUMA_DISCOVER_UNREACHABLE',
    };
  }
}

/**
 * Paginate Luma's public discover API for a city/category slug until exhausted
 * (or optional maxEvents). Falls through to HTML scrape when this returns empty/error.
 */
async function fetchLumaDiscoverApiBatch(options = {}) {
  const slug = String(options.slug || '')
    .trim()
    .toLowerCase();
  if (!slug) {
    return {
      error: 'Luma discover slug is required.',
      status: 400,
      code: 'INVALID_LUMA_SLUG',
    };
  }

  const limit = resolveBatchLimit(options.maxEvents);
  const drafts = [];
  const seen = new Set();
  let cursor = null;
  let pages = 0;
  let truncated = false;
  let hitPageCap = false;

  while (pages < MAX_LUMA_DISCOVER_PAGES) {
    if (limit != null && drafts.length >= limit) {
      truncated = true;
      break;
    }

    const remaining =
      limit == null ? LUMA_DISCOVER_PAGE_SIZE : Math.min(LUMA_DISCOVER_PAGE_SIZE, limit - drafts.length);
    const page = await fetchLumaDiscoverApiPage({
      slug,
      cursor,
      pageSize: remaining,
      latitude: options.latitude,
      longitude: options.longitude,
    });

    if (page.error) {
      if (pages === 0) return page;
      // Partial success — return what we have.
      break;
    }

    pages += 1;
    for (const entry of page.entries) {
      if (limit != null && drafts.length >= limit) {
        truncated = true;
        break;
      }
      const built = buildLumaDiscoverDraftFromNextData(entry);
      if (!built?.sourceUrl) continue;
      if (seen.has(built.sourceUrl)) continue;
      seen.add(built.sourceUrl);
      drafts.push(built);
    }

    if (truncated || !page.hasMore || !page.nextCursor) {
      if (page.hasMore && limit != null && drafts.length >= limit) {
        truncated = true;
      }
      break;
    }
    cursor = page.nextCursor;
  }

  if (pages >= MAX_LUMA_DISCOVER_PAGES) {
    hitPageCap = true;
    truncated = true;
  }

  return {
    listLabel: options.listLabel || `Luma · ${slug}`,
    drafts,
    truncated,
    discoveredTotal: drafts.length,
    limit,
    source: 'luma-discover-api',
    pages,
    hitPageCap,
  };
}

function parseLumaDiscoverBatch(html, sourceUrl, options = {}) {
  const limit = resolveBatchLimit(options.maxEvents);
  const nextData = extractLumaDiscoverEventsFromNextData(html);
  if (nextData.events.length) {
    const drafts = sliceToBatchLimit(nextData.events, limit)
      .map((entry) => buildLumaDiscoverDraftFromNextData(entry))
      .filter(Boolean);

    return {
      listLabel: nextData.listLabel || extractMetaContent(html, 'og:title') || 'Luma discover',
      drafts,
      truncated: isBatchTruncated(nextData.events.length, limit),
      discoveredTotal: nextData.events.length,
      limit,
      source: 'luma-html',
    };
  }

  const jsonLdNodes = extractJsonLdBlocks(html).flatMap(flattenJsonLdNodes);
  const itemList = jsonLdNodes.find((node) => hasType(node, 'ItemList'));
  if (!itemList?.itemListElement?.length) {
    return {
      listLabel: null,
      drafts: [],
      truncated: false,
      discoveredTotal: 0,
      limit,
      source: 'luma-html',
    };
  }

  const eventNodes = itemList.itemListElement
    .map((entry) => entry?.item || entry)
    .filter((node) => node && hasType(node, 'Event'));

  const drafts = sliceToBatchLimit(eventNodes, limit).map((eventNode) =>
    buildLumaDiscoverDraft(eventNode),
  );
  const listLabel = itemList.name || extractMetaContent(html, 'og:title') || 'Luma discover';

  return {
    listLabel,
    drafts,
    truncated: isBatchTruncated(eventNodes.length, limit),
    discoveredTotal: eventNodes.length,
    limit,
    source: 'luma-html',
  };
}

async function mapWithConcurrency(items, limit, iteratee) {
  if (!items.length) return [];

  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function enrichPartifulBatchDrafts(entries, options = {}) {
  const enrichLimit = resolveBatchLimit(
    options.maxEnrich != null ? options.maxEnrich : options.maxEvents,
  );
  const needingEnrichment = entries.filter((entry) => {
    if (!entry.sourceUrl) return false;
    const needsHost = !entry.draft.hostName;
    const needsImage = isInaccessiblePartifulImage(entry.draft.image);
    return needsHost || needsImage;
  });
  const toEnrich = sliceToBatchLimit(needingEnrichment, enrichLimit);

  await mapWithConcurrency(toEnrich, HOST_ENRICH_CONCURRENCY, async (entry) => {
    const fetched = await fetchEventPage(entry.sourceUrl);
    if (fetched.error || !fetched.html) {
      return;
    }

    const { draft } = buildDraft({
      html: fetched.html,
      provider: 'partiful',
      sourceUrl: entry.sourceUrl,
    });

    if (draft.hostName && !entry.draft.hostName && !isInvalidHostName(draft.hostName)) {
      entry.draft.hostName = draft.hostName;
    }
    if (draft.image && isInaccessiblePartifulImage(entry.draft.image)) {
      entry.draft.image = draft.image;
    }
    entry.warnings = draftWarnings(entry.draft);
  });
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function buildDraft({ html, provider, sourceUrl }) {
  const jsonLdNodes = extractJsonLdBlocks(html).flatMap(flattenJsonLdNodes);
  const jsonLdEvent = parseJsonLdEvent(jsonLdNodes);

  const openGraph = {
    name: extractMetaContent(html, 'og:title'),
    description: extractMetaContent(html, 'og:description'),
    image: extractMetaContent(html, 'og:image'),
  };

  let hostFields = {};
  let partifulPageDraft = null;
  if (provider === 'partiful') {
    partifulPageDraft = parsePartifulSingleEventDraft(html, sourceUrl);
    hostFields = parsePartifulHost(html);
  } else if (provider === 'luma') {
    hostFields = parseLumaHost(html, jsonLdNodes);
  }

  const draft = {
    name: firstNonEmpty(partifulPageDraft?.name, openGraph.name, jsonLdEvent.name),
    description: firstNonEmpty(partifulPageDraft?.description, openGraph.description, jsonLdEvent.description),
    image: sanitizeEventPosterImage(
      firstNonEmpty(partifulPageDraft?.image, openGraph.image, jsonLdEvent.image),
    ),
    start_time: firstNonEmpty(partifulPageDraft?.start_time, jsonLdEvent.start_time),
    end_time: firstNonEmpty(partifulPageDraft?.end_time, jsonLdEvent.end_time),
    location: firstNonEmpty(partifulPageDraft?.location, jsonLdEvent.location),
    hostName: firstPlausibleHostName(
      partifulPageDraft?.hostName,
      jsonLdEvent.hostName,
      hostFields.hostName,
    ),
    hostImageUrl: null,
    sourceUrl: firstNonEmpty(partifulPageDraft?.sourceUrl, sourceUrl),
    source: provider,
    sourceTags: partifulPageDraft?.sourceTags || [],
  };

  return { draft, warnings: draftWarnings(draft), providerLabel: PROVIDER_LABELS[provider] || provider };
}

async function fetchEventPage(url) {
  try {
    const response = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: 5,
      headers: {
        'User-Agent':
          'MeridianPivotLab/1.0 (+https://meridian.study; event ingest preview)',
        Accept: 'text/html,application/xhtml+xml',
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (typeof response.data !== 'string') {
      return {
        error: 'Unexpected response from event page.',
        status: 422,
        code: 'UNPARSEABLE_RESPONSE',
      };
    }

    return { html: response.data };
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      return {
        error: 'Event page fetch timed out after 10 seconds.',
        status: 504,
        code: 'FETCH_TIMEOUT',
      };
    }

    if (err.response?.status === 404) {
      return {
        error: 'Event page not found (404).',
        status: 404,
        code: 'PAGE_NOT_FOUND',
      };
    }

    if (err.response?.status >= 400 && err.response?.status < 500) {
      return {
        error: `Unable to fetch event page (${err.response.status}).`,
        status: 422,
        code: 'FETCH_FAILED',
      };
    }

    return {
      error: 'Unable to fetch event page.',
      status: 502,
      code: 'FETCH_FAILED',
    };
  }
}

async function attachPreviewDuplicates(data, options = {}) {
  const tenantKey = options.tenantKey?.trim()?.toLowerCase();
  if (!tenantKey || !data?.mode) {
    return data;
  }

  if (data.mode === 'batch') {
    const catalogIndex = await loadCatalogDuplicateIndex(tenantKey);
    const annotated = annotateImportDrafts(data.drafts || [], catalogIndex);
    const blockingCount = annotated.drafts.filter(
      (entry) => entry.duplicate && isBlockingDuplicate(entry.duplicate),
    ).length;

    return {
      ...data,
      drafts: annotated.drafts,
      warnings: [...(data.warnings || []), ...annotated.duplicateWarnings],
      duplicateCount: blockingCount,
    };
  }

  if (data.mode === 'single' && data.draft) {
    const { duplicate } = await resolveImportDuplicate(null, {
      tenantKey,
      candidate: {
        name: data.draft.name,
        start_time: data.draft.start_time,
        location: data.draft.location,
        sourceUrl: data.draft.sourceUrl,
      },
    });

    const warnings = [...(data.warnings || [])];
    if (duplicate) {
      warnings.push(formatDuplicateWarning(duplicate, data.draft.name));
    }

    return {
      ...data,
      duplicate: duplicate || null,
      warnings,
    };
  }

  return data;
}

async function previewIngestUrl(_req, options = {}) {
  const normalized = normalizeUrl(options.url);
  if (normalized.error) {
    return normalized;
  }

  const batchLimit = resolveBatchLimit(options.maxEvents);
  const classification = classifyIngestUrl(normalized.parsed, normalized.provider);
  const parseOptions = batchLimit == null ? {} : { maxEvents: batchLimit };
  let batchResult = null;
  let pageHtml = null;

  // Luma city/category discover: prefer paginated JSON API over SSR HTML (~20 events).
  const lumaDiscoverSlug =
    normalized.provider === 'luma' &&
    (classification.kind === 'batch' || classification.kind === 'batch-candidate')
      ? extractLumaDiscoverSlug(normalized.parsed)
      : null;

  if (lumaDiscoverSlug) {
    const apiBatch = await fetchLumaDiscoverApiBatch({
      slug: lumaDiscoverSlug,
      maxEvents: batchLimit,
      latitude: options.latitude,
      longitude: options.longitude,
    });
    if (!apiBatch.error && apiBatch.drafts?.length) {
      batchResult = apiBatch;
    }
  }

  if (!batchResult) {
    const fetched = await fetchEventPage(normalized.url);
    if (fetched.error) {
      // City discover with a failed HTML fallback still surfaces the fetch error.
      return fetched;
    }
    pageHtml = fetched.html;

    if (normalized.provider === 'partiful' && classification.kind === 'batch') {
      batchResult = parsePartifulExploreBatch(pageHtml, normalized.url, parseOptions);
    } else if (normalized.provider === 'luma') {
      batchResult = parseLumaDiscoverBatch(pageHtml, normalized.url, parseOptions);
    }
  }

  if (batchResult?.drafts?.length) {
    if (normalized.provider === 'partiful') {
      await enrichPartifulBatchDrafts(batchResult.drafts, parseOptions);
    }

    const batchWarnings = [];
    if (batchResult.truncated) {
      if (batchResult.source === 'luma-discover-api' && batchResult.hitPageCap) {
        batchWarnings.push(
          `Stopped after ${MAX_LUMA_DISCOVER_PAGES} Luma discover pages (${batchResult.drafts.length} events).`,
        );
      } else if (batchResult.limit != null) {
        batchWarnings.push(
          `Only the first ${batchResult.limit} events were imported from this page.`,
        );
      } else {
        batchWarnings.push('Discover results were truncated.');
      }
    }
    const missingOrganizerCount = batchResult.drafts.filter((entry) => !entry.draft.hostName).length;
    if (missingOrganizerCount) {
      batchWarnings.push(
        `${missingOrganizerCount} event(s) still need an organizer name before publishing.`,
      );
    }

    return {
      data: await attachPreviewDuplicates(
        {
          mode: 'batch',
          listLabel: batchResult.listLabel,
          drafts: batchResult.drafts,
          warnings: batchWarnings,
          provider: normalized.provider,
          providerLabel: PROVIDER_LABELS[normalized.provider] || normalized.provider,
          truncated: batchResult.truncated,
          discoveredTotal: batchResult.discoveredTotal,
          limit: batchResult.limit,
          discoverSource: batchResult.source || null,
          discoverPages: batchResult.pages || null,
        },
        options,
      ),
    };
  }

  if (classification.kind === 'batch') {
    return {
      error: 'No events found on this explore page.',
      status: 422,
      code: 'NO_EVENTS_FOUND',
    };
  }

  // Luma single-segment URLs are batch-candidates; if discover API + HTML list
  // parsing found nothing, treat the URL as a single event page.
  if (!pageHtml) {
    const fetched = await fetchEventPage(normalized.url);
    if (fetched.error) {
      return fetched;
    }
    pageHtml = fetched.html;
  }

  const { draft, warnings, providerLabel } = buildDraft({
    html: pageHtml,
    provider: normalized.provider,
    sourceUrl: normalized.url,
  });

  return {
    data: await attachPreviewDuplicates(
      {
        mode: 'single',
        draft,
        warnings,
        provider: normalized.provider,
        providerLabel,
      },
      options,
    ),
  };
}

module.exports = {
  previewIngestUrl,
  normalizeUrl,
  buildDraft,
  classifyIngestUrl,
  parsePartifulExploreBatch,
  parseLumaDiscoverBatch,
  extractLumaDiscoverSlug,
  fetchLumaDiscoverApiPage,
  fetchLumaDiscoverApiBatch,
  extractPartifulExploreEvents,
  buildPartifulExploreDraft,
  buildLumaDiscoverDraft,
  enrichPartifulBatchDrafts,
  resolveBatchLimit,
  sliceToBatchLimit,
  isInvalidHostName,
  firstPlausibleHostName,
  extractMetaContent,
  extractJsonLdBlocks,
  sanitizeEventPosterImage,
  parsePartifulSingleEventDraft,
  extractPartifulSourceTags,
  FETCH_TIMEOUT_MS,
  MAX_BATCH_EVENTS,
  DEFAULT_PREVIEW_BATCH_LIMIT,
  MAX_CRAWL_BATCH_EVENTS,
  MAX_BATCH_EVENTS_CEILING,
  LUMA_DISCOVER_API_URL,
  LUMA_DISCOVER_PAGE_SIZE,
  MAX_LUMA_DISCOVER_PAGES,
  HOST_ENRICH_CONCURRENCY,
};
