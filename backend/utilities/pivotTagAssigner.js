/**
 * Catalog-tag assigner for compute apply (and other native ingest paths).
 *
 * Callers must use `assignTags` — never Anthropic/axios from apply or auto-apply.
 *
 * Providers (`PIVOT_TAG_ASSIGNER`, default `claude`):
 * - `claude` — Lab `suggestPivotEventTags` + catalog validation. JSON scrape/parse
 *   stays inside the Claude/suggest adapter, not here.
 * - `jev` — reserved. Fail closed until a real adapter exists. A future Jev
 *   adapter must return **validated catalog slugs** (Choice/Noul over the
 *   catalog; it cannot invent tags). If the catalog has more than 255 options,
 *   shortlist first — Jev’s option cap is 255.
 */

const DEFAULT_PROVIDER = 'claude';
const MAX_ASSIGNED_TAGS = 3;

const {
  suggestPivotEventTags,
} = require('../services/pivotTagSuggestService');
const { validatePivotEventTags } = require('../services/pivotTagCatalogService');

function resolveTagAssignerProvider(override) {
  const raw =
    typeof override === 'string'
      ? override
      : process.env.PIVOT_TAG_ASSIGNER;
  const provider = String(raw || DEFAULT_PROVIDER).trim().toLowerCase();
  return provider || DEFAULT_PROVIDER;
}

function catalogSlugSetFrom(catalogTags) {
  if (!Array.isArray(catalogTags) || !catalogTags.length) return null;
  return new Set(
    catalogTags
      .map((tag) => (typeof tag === 'string' ? tag : tag?.slug))
      .map((slug) => (typeof slug === 'string' ? slug.trim().toLowerCase() : ''))
      .filter(Boolean),
  );
}

function unavailable(message) {
  return {
    error: message,
    status: 503,
    code: 'TAG_ASSIGNER_UNAVAILABLE',
  };
}

async function assignWithJev() {
  return unavailable(
    'Jev tag assigner is not implemented. Keep PIVOT_TAG_ASSIGNER=claude until a catalog-slug adapter exists.',
  );
}

async function assignWithClaude({ event, catalogTags, req }) {
  const suggestOptions = Array.isArray(catalogTags) ? { catalogTags } : {};
  const suggested = await suggestPivotEventTags(req, event || {}, suggestOptions);
  if (suggested.error) {
    return {
      error: suggested.error,
      status: suggested.status,
      code: suggested.code,
    };
  }

  const rawTags = suggested.data?.tags || [];
  const catalogSlugSet = catalogSlugSetFrom(catalogTags);
  const validated = await validatePivotEventTags(req, rawTags, {
    required: true,
    ...(catalogSlugSet ? { catalogSlugSet } : {}),
  });
  if (validated.error) {
    return {
      error: validated.error,
      status: validated.status,
      code: validated.code,
    };
  }

  const tags = validated.tags.slice(0, MAX_ASSIGNED_TAGS);
  return {
    tags,
    provider: 'claude',
    model: suggested.data?.model || null,
  };
}

/**
 * Assign 1–3 catalog tag slugs for an event.
 *
 * @returns {Promise<{ tags: string[], provider: string, model?: string|null, confidence?: number } | { error: string, code: string, status: number }>}
 */
async function assignTags({ event, catalogTags, tenantKey, req } = {}) {
  void tenantKey;
  const provider = resolveTagAssignerProvider();

  if (provider === 'claude') {
    return assignWithClaude({ event, catalogTags, req });
  }
  if (provider === 'jev') {
    return assignWithJev();
  }

  return unavailable(
    `Unknown tag assigner "${provider}". Use claude (default) or jev.`,
  );
}

module.exports = {
  assignTags,
  resolveTagAssignerProvider,
  DEFAULT_PROVIDER,
  MAX_ASSIGNED_TAGS,
};
