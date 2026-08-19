/** In-memory rate limit for public landing endpoints (60 req/min/IP). */
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

function createLandingRateLimit({ message, code }) {
  const buckets = new Map();
  return function pivotLandingRateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(ip);

    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      bucket = { windowStart: now, count: 0 };
      buckets.set(ip, bucket);
    }

    bucket.count += 1;

    if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
      return res.status(429).json({
        success: false,
        message,
        code,
      });
    }

    return next();
  };
}

const pivotLandingDropRateLimit = createLandingRateLimit({
  message: 'Too many drop previews. Please try again in a minute.',
  code: 'LANDING_DROP_RATE_LIMIT',
});

const pivotLandingCopyRateLimit = createLandingRateLimit({
  message: 'Too many copy requests. Please try again in a minute.',
  code: 'LANDING_COPY_RATE_LIMIT',
});

module.exports = {
  pivotLandingDropRateLimit,
  pivotLandingCopyRateLimit,
  WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW,
};
