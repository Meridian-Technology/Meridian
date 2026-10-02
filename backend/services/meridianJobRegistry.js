const handlers = new Map();

/**
 * `city` handlers run once per Just Go city a schedule targets. `fleet` handlers
 * run once per schedule slot for the whole product: no city scope, no city
 * overrides, no quiet hours.
 */
const HANDLER_SCOPES = Object.freeze(['city', 'fleet']);

class MeridianJobHandlerError extends Error {
  constructor(message, {
    retryable = true,
    statusCode = null,
    code = null,
    defer = false,
    retryAfterMs = null,
  } = {}) {
    super(message);
    this.name = 'MeridianJobHandlerError';
    this.retryable = retryable;
    this.statusCode = statusCode;
    this.code = code;
    this.defer = defer === true;
    this.retryAfterMs = Number.isFinite(retryAfterMs) ? retryAfterMs : null;
  }
}

function assertHandlerSpec(handlerKey, spec) {
  if (!handlerKey || typeof handlerKey !== 'string') {
    throw new Error('handlerKey is required');
  }
  if (!spec || typeof spec !== 'object') {
    throw new Error(`handler spec is required for ${handlerKey}`);
  }
  if (!spec.category || typeof spec.category !== 'string') {
    throw new Error(`category is required for handler ${handlerKey}`);
  }
  if (typeof spec.buildRunKey !== 'function') {
    throw new Error(`buildRunKey is required for handler ${handlerKey}`);
  }
  if (typeof spec.execute !== 'function') {
    throw new Error(`execute is required for handler ${handlerKey}`);
  }
  if (spec.scope !== undefined && !HANDLER_SCOPES.includes(spec.scope)) {
    throw new Error(`scope must be one of ${HANDLER_SCOPES.join(', ')} for handler ${handlerKey}`);
  }
}

function registerMeridianJobHandler(handlerKey, spec) {
  assertHandlerSpec(handlerKey, spec);
  const existing = handlers.get(handlerKey);
  if (existing) {
    throw new Error(`Meridian job handler already registered: ${handlerKey}`);
  }
  const handler = {
    handlerKey,
    category: spec.category,
    scope: spec.scope || 'city',
    channel: spec.channel || 'push',
    buildRunKey: spec.buildRunKey,
    execute: spec.execute,
  };
  handlers.set(handlerKey, handler);
  return handler;
}

function getMeridianJobHandler(handlerKey) {
  return handlers.get(handlerKey) || null;
}

function listMeridianJobHandlers() {
  return Array.from(handlers.values()).map((handler) => ({
    handlerKey: handler.handlerKey,
    category: handler.category,
    scope: handler.scope,
    channel: handler.channel,
  }));
}

function isFleetMeridianJobHandler(handlerKey) {
  return getMeridianJobHandler(handlerKey)?.scope === 'fleet';
}

function resetMeridianJobHandlers() {
  handlers.clear();
}

module.exports = {
  HANDLER_SCOPES,
  MeridianJobHandlerError,
  registerMeridianJobHandler,
  getMeridianJobHandler,
  isFleetMeridianJobHandler,
  listMeridianJobHandlers,
  resetMeridianJobHandlers,
};
