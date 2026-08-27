const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

function createPublicEventRateLimit(options = {}) {
  const windowMs = options.windowMs || WINDOW_MS;
  const max = options.max || MAX_REQUESTS_PER_WINDOW;
  const buckets = new Map();
  let requestCount = 0;

  function publicEventRateLimit(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    requestCount += 1;
    if (requestCount % 256 === 0) {
      for (const [bucketKey, value] of buckets) {
        if (now - value.startedAt >= windowMs) buckets.delete(bucketKey);
      }
    }
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(Math.ceil((bucket.startedAt + windowMs) / 1000)));
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      res.set('Cache-Control', 'no-store');
      return res.status(429).json({
        contractVersion: '1',
        error: { code: 'RATE_LIMITED' },
      });
    }
    return next();
  }

  publicEventRateLimit.reset = () => {
    buckets.clear();
    requestCount = 0;
  };
  publicEventRateLimit.max = max;
  return publicEventRateLimit;
}

const publicEventRateLimit = createPublicEventRateLimit();

module.exports = {
  WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW,
  createPublicEventRateLimit,
  publicEventRateLimit,
};
