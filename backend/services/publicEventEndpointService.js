const crypto = require('crypto');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { lookupPublicEvent } = require('../events/services/publicEventService');

const SUCCESS_TTL_MS = 60 * 1000;
const UNAVAILABLE_TTL_MS = 5 * 1000;
const MAX_CACHE_ENTRIES = 500;
const responseCache = new Map();
const inFlight = new Map();

function opaqueEventKey(eventId) {
  return crypto.createHash('sha256').update(eventId).digest('hex').slice(0, 12);
}

function pruneCache(now) {
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now) responseCache.delete(key);
  }
  while (responseCache.size >= MAX_CACHE_ENTRIES) {
    responseCache.delete(responseCache.keys().next().value);
  }
}

function logPublicEvent(level, message, fields = {}) {
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  logger('[public-event]', message, fields);
}

function createDependencies(req, eventKey, state) {
  return {
    getTenants: () => getMergedTenants(req),
    connectToDatabase,
    getModels,
    onTenantError: ({ tenantKey, error }) => {
      logPublicEvent('warn', 'tenant lookup failed', {
        eventKey,
        tenantKey,
        errorName: error?.name || 'Error',
      });
    },
    onResolutionError: ({ error }) => {
      logPublicEvent('error', 'resolution failed', {
        eventKey,
        errorName: error?.name || 'Error',
      });
    },
    onResolutionComplete: (classification) => {
      state.internalState = classification.internalState;
      state.resolvedTenant = classification.available ? classification.tenantKey : null;
    },
  };
}

async function loadPublicEvent(req, eventId, options = {}) {
  const nowMs = Date.now();
  pruneCache(nowMs);
  const cached = responseCache.get(eventId);
  if (cached && cached.expiresAt > nowMs) {
    return { ...cached.value, cacheStatus: 'hit' };
  }
  if (inFlight.has(eventId)) {
    const value = await inFlight.get(eventId);
    return { ...value, cacheStatus: 'coalesced' };
  }

  const startedAt = process.hrtime.bigint();
  const eventKey = opaqueEventKey(eventId);
  const state = { internalState: 'incomplete', resolvedTenant: null };
  const work = (async () => {
    const body = await lookupPublicEvent(
      eventId,
      options.dependencies || createDependencies(req, eventKey, state),
      { now: options.now },
    );
    const available = Boolean(body.data);
    const result = { body, available };
    responseCache.set(eventId, {
      value: result,
      expiresAt: Date.now() + (available ? SUCCESS_TTL_MS : UNAVAILABLE_TTL_MS),
    });
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logPublicEvent('info', 'resolution completed', {
      eventKey,
      outcome: state.internalState,
      resolvedTenant: state.resolvedTenant,
      durationMs: Number(durationMs.toFixed(1)),
    });
    return result;
  })();
  inFlight.set(eventId, work);
  try {
    return { ...(await work), cacheStatus: 'miss' };
  } finally {
    inFlight.delete(eventId);
  }
}

function resetPublicEventEndpointState() {
  responseCache.clear();
  inFlight.clear();
}

module.exports = {
  SUCCESS_TTL_MS,
  UNAVAILABLE_TTL_MS,
  MAX_CACHE_ENTRIES,
  opaqueEventKey,
  loadPublicEvent,
  resetPublicEventEndpointState,
};
