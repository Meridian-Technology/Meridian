const PIVOT_PRICE_BANDS = Object.freeze(['free', 'low', 'mid', 'high']);
const MAX_VIBE_TAGS = 12;
const MAX_ENRICHMENT_FIELD_LENGTH = 120;

function trimEnrichmentString(value) {
  if (value == null) {
    return '';
  }
  return String(value).trim().slice(0, MAX_ENRICHMENT_FIELD_LENGTH);
}

function normalizeVibeTags(rawVibe) {
  const parts = Array.isArray(rawVibe)
    ? rawVibe
    : typeof rawVibe === 'string'
      ? rawVibe.split(',')
      : [];

  const seen = new Set();
  const vibe = [];
  for (const raw of parts) {
    const slug = trimEnrichmentString(raw).toLowerCase();
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    vibe.push(slug);
    if (vibe.length >= MAX_VIBE_TAGS) {
      break;
    }
  }

  return vibe;
}

function normalizePriceBand(rawPriceBand) {
  const band = trimEnrichmentString(rawPriceBand).toLowerCase();
  if (!band) {
    return null;
  }
  return PIVOT_PRICE_BANDS.includes(band) ? band : undefined;
}

function normalizePivotEnrichment(raw) {
  if (raw == null) {
    return null;
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const vibe = normalizeVibeTags(raw.vibe);
  const priceBand = normalizePriceBand(raw.priceBand);
  if (raw.priceBand != null && raw.priceBand !== '' && priceBand === undefined) {
    return { error: 'priceBand must be free, low, mid, or high.', code: 'INVALID_PRICE_BAND' };
  }

  const neighborhood = trimEnrichmentString(raw.neighborhood);
  const audience = trimEnrichmentString(raw.audience);

  if (!vibe.length && !priceBand && !neighborhood && !audience) {
    return null;
  }

  return {
    ...(vibe.length ? { vibe } : {}),
    ...(priceBand ? { priceBand } : {}),
    ...(neighborhood ? { neighborhood } : {}),
    ...(audience ? { audience } : {}),
  };
}

function hasPivotEnrichmentContent(enrichment) {
  const normalized = normalizePivotEnrichment(enrichment);
  return Boolean(normalized && !normalized.error);
}

function serializePivotEnrichment(pivot) {
  const normalized = normalizePivotEnrichment(pivot?.enrichment);
  if (!normalized || normalized.error) {
    return undefined;
  }
  return normalized;
}

function collectPivotEnrichmentSearchText(pivot) {
  const enrichment = serializePivotEnrichment(pivot);
  if (!enrichment) {
    return '';
  }

  return [
    ...(enrichment.vibe || []),
    enrichment.priceBand,
    enrichment.neighborhood,
    enrichment.audience,
  ]
    .filter(Boolean)
    .join(' ');
}

module.exports = {
  PIVOT_PRICE_BANDS,
  MAX_VIBE_TAGS,
  normalizePivotEnrichment,
  hasPivotEnrichmentContent,
  serializePivotEnrichment,
  collectPivotEnrichmentSearchText,
};
