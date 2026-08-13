/**
 * Per-city discovery flow.
 *
 * Large cities get most of their inventory from Luma and Partiful, which have
 * native parsers and cost no Firecrawl credits. Long-tail cities need the
 * generic-site search. The flow is a tenant setting so SF and Iowa City do not
 * have to share a pipeline.
 */

const DISCOVERY_FLOWS = ['native-then-firecrawl', 'native-only', 'firecrawl-only'];
const DEFAULT_DISCOVERY_FLOW = 'native-then-firecrawl';

const NATIVE_SKIP_HOSTS = ['partiful.com', 'luma.com', 'lu.ma'];

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

const PIVOT_DISCOVERY_CONFIG_DEFAULTS = Object.freeze({
  flow: DEFAULT_DISCOVERY_FLOW,
  lumaSlug: null,
  partifulSlug: null,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDiscoverySlug(raw) {
  if (raw == null) return null;
  const slug = String(raw).trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!slug) return null;
  if (!SLUG_PATTERN.test(slug)) return undefined;
  return slug;
}

function mergePivotDiscoveryConfig(stored) {
  const merged = { ...PIVOT_DISCOVERY_CONFIG_DEFAULTS };
  if (!isPlainObject(stored)) return merged;

  if (DISCOVERY_FLOWS.includes(stored.flow)) {
    merged.flow = stored.flow;
  }
  if (Object.prototype.hasOwnProperty.call(stored, 'lumaSlug')) {
    const slug = normalizeDiscoverySlug(stored.lumaSlug);
    if (slug !== undefined) merged.lumaSlug = slug;
  }
  if (Object.prototype.hasOwnProperty.call(stored, 'partifulSlug')) {
    const slug = normalizeDiscoverySlug(stored.partifulSlug);
    if (slug !== undefined) merged.partifulSlug = slug;
  }
  return merged;
}

/**
 * Resolve the flow for a run. Request overrides win over the tenant default so
 * Configure-and-Run does not require a separate save, but the tenant row is
 * still what the next page load reads.
 */
function resolvePivotDiscoveryConfig(tenant = {}, overrides = {}) {
  const merged = mergePivotDiscoveryConfig(tenant?.pivotDiscovery);
  if (overrides.flow && DISCOVERY_FLOWS.includes(overrides.flow)) {
    merged.flow = overrides.flow;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'lumaSlug')) {
    const slug = normalizeDiscoverySlug(overrides.lumaSlug);
    if (slug !== undefined) merged.lumaSlug = slug;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, 'partifulSlug')) {
    const slug = normalizeDiscoverySlug(overrides.partifulSlug);
    if (slug !== undefined) merged.partifulSlug = slug;
  }

  const runNative = merged.flow !== 'firecrawl-only';
  const runFirecrawl = merged.flow !== 'native-only';
  return {
    ...merged,
    runNative,
    runFirecrawl,
    skipNativeHostsInSearch: runNative,
  };
}

function validatePivotDiscoveryConfigPatch(raw) {
  if (raw == null) {
    return { patch: null };
  }
  if (!isPlainObject(raw)) {
    return { error: 'pivotDiscovery must be an object.', status: 400, code: 'INVALID_DISCOVERY_CONFIG' };
  }

  const patch = {};
  if (raw.flow !== undefined) {
    const flow = trimString(raw.flow);
    if (!DISCOVERY_FLOWS.includes(flow)) {
      return {
        error: `flow must be one of: ${DISCOVERY_FLOWS.join(', ')}.`,
        status: 400,
        code: 'INVALID_DISCOVERY_FLOW',
      };
    }
    patch.flow = flow;
  }
  if (raw.lumaSlug !== undefined) {
    if (raw.lumaSlug === null || raw.lumaSlug === '') {
      patch.lumaSlug = null;
    } else {
      const slug = normalizeDiscoverySlug(raw.lumaSlug);
      if (slug === undefined) {
        return {
          error: 'lumaSlug must be a lowercase slug (letters, numbers, hyphens).',
          status: 400,
          code: 'INVALID_LUMA_SLUG',
        };
      }
      patch.lumaSlug = slug;
    }
  }
  if (raw.partifulSlug !== undefined) {
    if (raw.partifulSlug === null || raw.partifulSlug === '') {
      patch.partifulSlug = null;
    } else {
      const slug = normalizeDiscoverySlug(raw.partifulSlug);
      if (slug === undefined) {
        return {
          error: 'partifulSlug must be a lowercase slug (letters, numbers, hyphens).',
          status: 400,
          code: 'INVALID_PARTIFUL_SLUG',
        };
      }
      patch.partifulSlug = slug;
    }
  }
  return { patch };
}

function nativeSourceSpecs(config, city) {
  const specs = [];
  const cityLabel = trimString(city) || 'city';
  if (!config?.runNative) return specs;

  if (config.partifulSlug) {
    specs.push({
      provider: 'partiful',
      host: 'partiful.com',
      url: `https://partiful.com/explore/${config.partifulSlug}`,
      label: `Partiful · ${cityLabel}`,
    });
  }
  if (config.lumaSlug) {
    specs.push({
      provider: 'luma',
      host: 'luma.com',
      url: `https://luma.com/${config.lumaSlug}`,
      label: `Luma · ${cityLabel}`,
    });
  }
  return specs;
}

function isNativeSkipHost(hostname) {
  const host = trimString(hostname).toLowerCase().replace(/^www\./, '');
  return NATIVE_SKIP_HOSTS.includes(host);
}

function isNativeIndexUrl(provider, rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    if (provider === 'partiful') return /^\/explore\/[^/]+$/i.test(path);
    if (provider === 'luma') {
      return /^\/[^/]+$/i.test(path) && !/^\/(user|discover|signin|signup|home|login|e|event)$/i.test(path);
    }
  } catch {
    return false;
  }
  return false;
}

async function persistPivotDiscoveryConfig(req, tenant, patch) {
  const { getTenantByKey, upsertStoredTenantRow } = require('../services/tenantConfigService');
  const tenantKey = tenant?.tenantKey;
  if (!tenantKey || !patch || !Object.keys(patch).length) return tenant;

  const current = (await getTenantByKey(req, tenantKey)) || tenant;
  const nextDiscovery = mergePivotDiscoveryConfig({
    ...mergePivotDiscoveryConfig(current.pivotDiscovery),
    ...patch,
  });
  return upsertStoredTenantRow(
    req,
    { ...current, pivotDiscovery: nextDiscovery },
    req?.user?.email || null,
  );
}

module.exports = {
  DISCOVERY_FLOWS,
  DEFAULT_DISCOVERY_FLOW,
  NATIVE_SKIP_HOSTS,
  PIVOT_DISCOVERY_CONFIG_DEFAULTS,
  mergePivotDiscoveryConfig,
  resolvePivotDiscoveryConfig,
  validatePivotDiscoveryConfigPatch,
  nativeSourceSpecs,
  isNativeSkipHost,
  isNativeIndexUrl,
  persistPivotDiscoveryConfig,
  normalizeDiscoverySlug,
};
