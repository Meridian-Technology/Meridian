const handlers = new Map();

class MeridianJobHandlerError extends Error {
  constructor(message, { retryable = true, statusCode = null, code = null } = {}) {
    super(message);
    this.name = 'MeridianJobHandlerError';
    this.retryable = retryable;
    this.statusCode = statusCode;
    this.code = code;
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
  }));
}

function resetMeridianJobHandlers() {
  handlers.clear();
}

module.exports = {
  MeridianJobHandlerError,
  registerMeridianJobHandler,
  getMeridianJobHandler,
  listMeridianJobHandlers,
  resetMeridianJobHandlers,
};
