const { isJustGoPublicHost } = require('./corsOrigins');
const { justGoPublicUrl } = require('./justGoPublicUrl');
const { formatPublicEventDate } = require('../services/justGoPublicEventShareImageService');

const JUSTGO_TITLE = 'just go. this week in your city';
const JUSTGO_DESCRIPTION =
  "stop planning. swipe what's on in your city this week. just go.";
const JUSTGO_THEME_COLOR = '#1E1A16';
const JUSTGO_SITE_NAME = 'just go';
const JUSTGO_OG_IMAGE_PATH = '/justgo/og.jpg';
const JUSTGO_OG_IMAGE_WIDTH = 1200;
const JUSTGO_OG_IMAGE_HEIGHT = 630;
const JUSTGO_OG_IMAGE_ALT =
  'just go wordmark — this week in your city. stop planning. swipe what\'s on in your city this week. just go.';
const JUSTGO_ICON_PATH = '/justgo-icon.svg';
const PUBLIC_EVENT_PATH = /^\/events\/([0-9a-f]{24})\/?$/;
const ANY_PUBLIC_EVENT_PATH = /^\/events\/([^/]+)\/?$/;

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function injectBeforeBodyClose(html, block) {
  return String(html || '').replace(/<\/body>/i, `    ${block}\n  </body>`);
}

function buildPublicEventShareFallbackBlock(event, language = null) {
  const venueLabel = resolveLanguageEntry(language, 'landing.web.event.venueLabel', 'where');
  const organizerLabel = resolveLanguageEntry(
    language,
    'landing.web.event.organizerLabel',
    'hosted by',
  );
  const dateSeparator = resolveLanguageEntry(language, 'landing.web.event.dateSeparator', 'to');
  const when = formatPublicEventDate(event, 'en-US');
  const lines = [
    '<div id="justgo-share-fallback">',
    `<h1>${escapeHtml(event.title)}</h1>`,
  ];
  if (when) {
    lines.push(`<p>${escapeHtml(when.date)}</p>`);
    lines.push(
      `<p>${escapeHtml(when.startTime)} ${escapeHtml(dateSeparator)} ${escapeHtml(when.endTime)}</p>`,
    );
  }
  const venueText = event.venue?.text;
  if (typeof venueText === 'string' && venueText.trim()) {
    lines.push(`<p>${escapeHtml(venueLabel)}: ${escapeHtml(venueText)}</p>`);
  }
  const organizerName = event.organizer?.name;
  if (typeof organizerName === 'string' && organizerName.trim()) {
    lines.push(`<p>${escapeHtml(organizerLabel)}: ${escapeHtml(organizerName)}</p>`);
  }
  const canonical = event.canonicalUrl;
  lines.push(`<p><a href="${escapeAttr(canonical)}">${escapeHtml(canonical)}</a></p>`);
  lines.push('</div>');
  return lines.join('\n    ');
}

function requestPath(req) {
  const raw = String(req?.originalUrl || req?.path || '/').split('?')[0];
  return raw && raw.trim() ? raw : '/';
}

function wantsJustGoHtmlMeta(req) {
  const host = req?.headers?.host || (typeof req?.get === 'function' ? req.get('host') : '');
  if (isJustGoPublicHost(host)) return true;
  const path = requestPath(req);
  return path === '/justgo' || path.startsWith('/justgo/');
}

function justGoCanonicalPath(req) {
  const path = requestPath(req);
  if (path === '/justgo' || path === '/justgo/') return '/';
  if (path.startsWith('/justgo/')) {
    const stripped = path.slice('/justgo'.length) || '/';
    return stripped;
  }
  return path;
}

function setMetaContent(html, attr, key, value) {
  const escaped = escapeAttr(value);
  const re = new RegExp(
    `(<meta\\s[^>]*${attr}\\s*=\\s*"${key}"[^>]*\\scontent\\s*=\\s*")[^"]*(")`,
    'gi',
  );
  const next = html.replace(re, `$1${escaped}$2`);
  if (next !== html) return next;
  return html.replace(
    /<\/head>/i,
    `    <meta ${attr}="${key}" content="${escaped}">\n  </head>`,
  );
}

function setLinkHref(html, rel, href) {
  const escaped = escapeAttr(href);
  const re = new RegExp(
    `(<link\\s[^>]*rel\\s*=\\s*"${rel}"[^>]*\\shref\\s*=\\s*")[^"]*(")`,
    'i',
  );
  const next = html.replace(re, `$1${escaped}$2`);
  if (next !== html) return next;
  return html.replace(
    /<\/head>/i,
    `    <link rel="${rel}" href="${escaped}">\n  </head>`,
  );
}

function publicEventIdFromRequest(req) {
  const match = requestPath(req).match(PUBLIC_EVENT_PATH);
  return match ? match[1] : null;
}

function isPublicEventRequest(req) {
  return ANY_PUBLIC_EVENT_PATH.test(requestPath(req));
}

function setTitle(html, title) {
  const tag = `<title>${escapeAttr(title)}</title>`;
  const next = String(html || '').replace(/<title>[^<]*<\/title>/i, tag);
  return next === html ? String(html || '').replace(/<\/head>/i, `    ${tag}\n  </head>`) : next;
}

function setJsonLd(html, value) {
  const json = JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return String(html || '').replace(
    /<\/head>/i,
    `    <script type="application/ld+json" data-justgo-event>${json}</script>\n  </head>`,
  );
}

function publicEventStructuredData(event) {
  const schemaStatus = event.lifecycleStatus === 'ended'
    ? 'https://schema.org/EventCompleted'
    : 'https://schema.org/EventScheduled';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description || undefined,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: schemaStatus,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.venue.text,
    },
    organizer: {
      '@type': 'Organization',
      name: event.organizer.name,
      url: event.organizer.profileUrl || undefined,
      image: event.organizer.imageUrl || undefined,
    },
    image: event.image?.url ? [event.image.url] : undefined,
    url: event.canonicalUrl,
  };
  const stripUndefined = (value) => {
    if (Array.isArray(value)) return value.map(stripUndefined);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefined(entry)]));
  };
  return stripUndefined(data);
}

function resolveLanguageEntry(language, key, fallback) {
  const tokens = { 'brand.name': JUSTGO_SITE_NAME, ...(language?.tokens || {}) };
  let value = language?.entries?.[key] || fallback;
  for (const [name, replacement] of Object.entries(tokens)) {
    if (typeof replacement === 'string' && replacement.trim()) {
      value = String(value).split(`{${name}}`).join(replacement);
    }
  }
  return /[{}]/.test(value) ? fallback : value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolvePublicEventShareImage(event, req) {
  const photoUrl = nonEmptyString(event.socialPreview?.imageUrl)
    || nonEmptyString(event.image?.url);
  if (photoUrl) {
    return { image: photoUrl, useGeneratedCard: false };
  }
  return {
    image: justGoPublicUrl(`/api/public/events/${event.id}/opengraph.png`, req, {
      nodeEnv: 'production',
    }),
    useGeneratedCard: true,
  };
}

function applyPublicEventIndexHtml(html, req, event, language = null) {
  const brandName = language?.tokens?.['brand.name'] || JUSTGO_SITE_NAME;
  const title = `${event.title} | ${brandName}`;
  const description = event.socialPreview?.description || event.description || event.title;
  const { image, useGeneratedCard } = resolvePublicEventShareImage(event, req);
  const imageAlt = event.title;
  let out = applyJustGoIndexHtml(html, req);
  out = setTitle(out, title);
  out = setLinkHref(out, 'canonical', event.canonicalUrl);
  out = setMetaContent(out, 'name', 'description', description);
  out = setMetaContent(out, 'name', 'robots', 'index, follow');
  out = setMetaContent(out, 'property', 'og:title', title);
  out = setMetaContent(out, 'property', 'og:description', description);
  out = setMetaContent(out, 'property', 'og:image', image);
  if (useGeneratedCard) {
    out = setMetaContent(out, 'property', 'og:image:width', String(JUSTGO_OG_IMAGE_WIDTH));
    out = setMetaContent(out, 'property', 'og:image:height', String(JUSTGO_OG_IMAGE_HEIGHT));
  }
  out = setMetaContent(out, 'property', 'og:image:alt', imageAlt);
  out = setMetaContent(out, 'property', 'og:url', event.canonicalUrl);
  out = setMetaContent(out, 'property', 'og:type', 'event');
  out = setMetaContent(out, 'property', 'og:site_name', brandName);
  out = setMetaContent(out, 'name', 'twitter:title', title);
  out = setMetaContent(out, 'name', 'twitter:description', description);
  out = setMetaContent(out, 'name', 'twitter:image', image);
  out = setMetaContent(out, 'name', 'twitter:image:alt', imageAlt);
  out = setJsonLd(out, publicEventStructuredData(event));
  return injectBeforeBodyClose(out, buildPublicEventShareFallbackBlock(event, language));
}

function applyUnavailablePublicEventIndexHtml(html, req, language = null) {
  const brandName = language?.tokens?.['brand.name'] || JUSTGO_SITE_NAME;
  const title = resolveLanguageEntry(
    language,
    'landing.web.event.unavailableTitle',
    'this event isn’t available',
  );
  const description = resolveLanguageEntry(
    language,
    'landing.web.event.unavailableBody',
    `find something else happening in ${brandName}`,
  );
  const id = publicEventIdFromRequest(req);
  const canonical = justGoPublicUrl(`/events/${id || ''}`.replace(/\/$/, ''), req, {
    nodeEnv: 'production',
  });
  let out = applyJustGoIndexHtml(html, req);
  out = setTitle(out, title);
  out = setLinkHref(out, 'canonical', canonical);
  out = setMetaContent(out, 'name', 'description', description);
  out = setMetaContent(out, 'name', 'robots', 'noindex, nofollow');
  out = setMetaContent(out, 'property', 'og:title', title);
  out = setMetaContent(out, 'property', 'og:description', description);
  out = setMetaContent(out, 'property', 'og:url', canonical);
  out = setMetaContent(out, 'property', 'og:type', 'website');
  out = setMetaContent(out, 'name', 'twitter:title', title);
  out = setMetaContent(out, 'name', 'twitter:description', description);
  return out;
}

async function renderPublicEventIndexHtml(html, req, dependencies = {}) {
  const id = publicEventIdFromRequest(req);
  if (!id) return applyUnavailablePublicEventIndexHtml(html, req);
  try {
    const loadPublicEvent = dependencies.loadPublicEvent
      || require('../services/publicEventEndpointService').loadPublicEvent;
    const result = await loadPublicEvent(req, id);
    if (!result.available) return applyUnavailablePublicEventIndexHtml(html, req);
    let language = null;
    try {
      const getLanguage = dependencies.getPublicEventLanguage
        || require('../services/publicEventLanguageService').getPublicEventLanguage;
      language = (await getLanguage(req, id))?.language || null;
    } catch (_) {}
    return applyPublicEventIndexHtml(html, req, result.body.data, language);
  } catch (_) {
    return applyUnavailablePublicEventIndexHtml(html, req);
  }
}

function applyJustGoIndexHtml(html, req) {
  const urlOpts = { nodeEnv: 'production' };
  const canonical = justGoPublicUrl(justGoCanonicalPath(req), req, urlOpts);
  const image = justGoPublicUrl(JUSTGO_OG_IMAGE_PATH, req, urlOpts);
  const icon = justGoPublicUrl(JUSTGO_ICON_PATH, req, urlOpts);
  let out = String(html || '');
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(JUSTGO_TITLE)}</title>`);
  out = setMetaContent(out, 'name', 'description', JUSTGO_DESCRIPTION);
  out = setMetaContent(out, 'name', 'theme-color', JUSTGO_THEME_COLOR);
  out = setMetaContent(out, 'property', 'og:title', JUSTGO_TITLE);
  out = setMetaContent(out, 'property', 'og:description', JUSTGO_DESCRIPTION);
  out = setMetaContent(out, 'property', 'og:image', image);
  out = setMetaContent(out, 'property', 'og:image:width', String(JUSTGO_OG_IMAGE_WIDTH));
  out = setMetaContent(out, 'property', 'og:image:height', String(JUSTGO_OG_IMAGE_HEIGHT));
  out = setMetaContent(out, 'property', 'og:image:alt', JUSTGO_OG_IMAGE_ALT);
  out = setMetaContent(out, 'property', 'og:url', canonical);
  out = setMetaContent(out, 'property', 'og:type', 'website');
  out = setMetaContent(out, 'property', 'og:site_name', JUSTGO_SITE_NAME);
  out = setMetaContent(out, 'name', 'twitter:card', 'summary_large_image');
  out = setMetaContent(out, 'name', 'twitter:title', JUSTGO_TITLE);
  out = setMetaContent(out, 'name', 'twitter:description', JUSTGO_DESCRIPTION);
  out = setMetaContent(out, 'name', 'twitter:image', image);
  out = setMetaContent(out, 'name', 'twitter:image:alt', JUSTGO_OG_IMAGE_ALT);
  out = setLinkHref(out, 'icon', icon);
  out = setLinkHref(out, 'apple-touch-icon', icon);
  return out;
}

module.exports = {
  JUSTGO_TITLE,
  JUSTGO_DESCRIPTION,
  JUSTGO_OG_IMAGE_PATH,
  JUSTGO_OG_IMAGE_WIDTH,
  JUSTGO_OG_IMAGE_HEIGHT,
  JUSTGO_OG_IMAGE_ALT,
  wantsJustGoHtmlMeta,
  justGoCanonicalPath,
  applyJustGoIndexHtml,
  isPublicEventRequest,
  publicEventIdFromRequest,
  publicEventStructuredData,
  applyPublicEventIndexHtml,
  applyUnavailablePublicEventIndexHtml,
  renderPublicEventIndexHtml,
  resolvePublicEventShareImage,
  buildPublicEventShareFallbackBlock,
};
