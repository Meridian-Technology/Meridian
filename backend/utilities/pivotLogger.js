const LOG_PREFIX = '[pivot]';

function isPivotLoggingEnabled() {
  const flag = process.env.PIVOT_LOG;
  if (flag === '0' || flag === 'false') {
    return false;
  }
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return true;
}

function serializeMeta(meta) {
  if (meta == null) {
    return '';
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ' [meta unserializable]';
  }
}

function logPivot(level, message, meta) {
  if (!isPivotLoggingEnabled()) {
    return;
  }

  const line = `${LOG_PREFIX} ${message}${serializeMeta(meta)}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

function pivotRequestContext(req) {
  return {
    tenant: req.school || undefined,
    userId: req.user?.userId ? String(req.user.userId) : undefined,
    method: req.method,
    path: req.originalUrl || req.url,
  };
}

/** Express middleware — logs completed pivot requests with latency. */
function pivotRequestLogger(req, res, next) {
  if (!isPivotLoggingEnabled()) {
    next();
    return;
  }

  const startedAt = Date.now();
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logPivot(level, 'request', {
      ...pivotRequestContext(req),
      status: res.statusCode,
      ms: Date.now() - startedAt,
    });
  });
  next();
}

function logPivotRouteError(routeLabel, err, req) {
  logPivot('error', `${routeLabel} failed`, {
    ...pivotRequestContext(req),
    error: err?.message || String(err),
  });
}

function logPivotServiceReject(routeLabel, result, req, extra) {
  logPivot('warn', `${routeLabel} rejected`, {
    ...pivotRequestContext(req),
    code: result.code,
    message: result.error,
    ...extra,
  });
}

function logPivotServiceSuccess(routeLabel, req, extra) {
  logPivot('info', `${routeLabel} ok`, {
    ...pivotRequestContext(req),
    ...extra,
  });
}

module.exports = {
  logPivot,
  pivotRequestContext,
  pivotRequestLogger,
  logPivotRouteError,
  logPivotServiceReject,
  logPivotServiceSuccess,
  isPivotLoggingEnabled,
};
