const {
  CATALOG_SHIPPED_ENTRIES,
  CATALOG_SHIPPED_TOKENS,
  PIVOT_COPY_SCHEMA_VERSION,
} = require('../utilities/pivotCopyCatalog');
const {
  getMergedCopyPackOrEmpty,
  formatCopyRevision,
} = require('./pivotCopyService');
const { loadPublicEvent } = require('./publicEventEndpointService');

const PUBLIC_EVENT_LANGUAGE_KEYS = Object.freeze([
  'landing.web.event.skipToEvent',
  'landing.web.event.loading',
  'landing.web.event.unavailableTitle',
  'landing.web.event.unavailableBody',
  'landing.web.event.retry',
  'landing.web.event.ended',
  'landing.web.event.ongoing',
  'landing.web.event.registerCta',
  'landing.web.event.openAppCta',
  'landing.web.event.downloadPrompt',
  'landing.web.event.appStore',
  'landing.web.event.googlePlay',
  'landing.web.event.storeChoicesLabel',
  'landing.web.event.openAppA11y',
  'landing.web.event.registerA11y',
  'landing.web.event.share',
  'landing.web.event.shareA11y',
  'landing.web.event.dateSeparator',
  'landing.web.event.timezoneLabel',
  'landing.web.event.venueLabel',
  'landing.web.event.organizerLabel',
  'landing.web.event.imageAlt',
  'landing.web.event.missingImageAlt',
  'landing.web.event.cityMismatch',
]);

const PUBLIC_EVENT_TOKEN_KEYS = Object.freeze(['brand.name', 'brand.cta']);
const PLACEHOLDER_PATTERN = /\{([a-zA-Z][a-zA-Z0-9_.]*)\}/g;

function placeholders(value) {
  if (typeof value !== 'string') return null;
  const names = [];
  let match;
  while ((match = PLACEHOLDER_PATTERN.exec(value)) != null) names.push(match[1]);
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return names.sort();
}

function isValidOverride(value, fallback) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return false;
  const expected = placeholders(fallback);
  const actual = placeholders(value);
  if (!expected || !actual || expected.join('|') !== actual.join('|')) return false;
  const residue = value.replace(PLACEHOLDER_PATTERN, '');
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return !/[{}]/.test(residue);
}

function resolvePublicEventLanguage(pack) {
  const entries = {};
  for (const key of PUBLIC_EVENT_LANGUAGE_KEYS) {
    const fallback = CATALOG_SHIPPED_ENTRIES[key];
    if (typeof fallback !== 'string') {
      throw new Error(`Missing shipped public event language key: ${key}`);
    }
    const override = pack?.entries?.[key];
    entries[key] = isValidOverride(override, fallback) ? override : fallback;
  }

  const tokens = {};
  for (const key of PUBLIC_EVENT_TOKEN_KEYS) {
    const fallback = CATALOG_SHIPPED_TOKENS[key];
    const override = pack?.tokens?.[key];
    tokens[key] = typeof override === 'string' && override.trim() && override.length <= 240
      ? override
      : fallback;
  }
  return { entries, tokens };
}

async function getPublicEventLanguage(req, eventId, options = {}) {
  const eventResult = await (options.loadPublicEvent || loadPublicEvent)(req, eventId);
  const cityId = eventResult.available ? eventResult.body.data.cityId : null;
  const pack = await (options.getCopyPack || getMergedCopyPackOrEmpty)(req, {
    tenantKey: cityId,
    schemaVersion: PIVOT_COPY_SCHEMA_VERSION,
  });
  const language = resolvePublicEventLanguage(pack);
  return {
    contractVersion: '1',
    context: { product: 'justgo', cityId },
    language: {
      revision: pack?.revision || formatCopyRevision(0, 0),
      schemaVersion: PIVOT_COPY_SCHEMA_VERSION,
      ...language,
    },
  };
}

module.exports = {
  PUBLIC_EVENT_LANGUAGE_KEYS,
  PUBLIC_EVENT_TOKEN_KEYS,
  isValidOverride,
  resolvePublicEventLanguage,
  getPublicEventLanguage,
};
