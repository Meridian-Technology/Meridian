/** In-memory rate limit for public landing endpoints (60 req/min/IP). */
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

function createLandingRateLimit({ message, code }) {
  const buckets = new Map();
  function pivotLandingRateLimit(req, res, next) {
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
  }
  pivotLandingRateLimit.reset = () => buckets.clear();
  return pivotLandingRateLimit;
}

const pivotLandingDropRateLimit = createLandingRateLimit({
  message: 'Too many drop previews. Please try again in a minute.',
  code: 'LANDING_DROP_RATE_LIMIT',
});

const pivotLandingCopyRateLimit = createLandingRateLimit({
  message: 'Too many copy requests. Please try again in a minute.',
  code: 'LANDING_COPY_RATE_LIMIT',
});

const pivotLandingEventRateLimit = createLandingRateLimit({
  message: 'Too many landing events. Please try again in a minute.',
  code: 'LANDING_EVENT_RATE_LIMIT',
});

const pivotLandingWaitlistRateLimit = createLandingRateLimit({
  message: 'Too many waitlist requests. Please try again in a minute.',
  code: 'WAITLIST_RATE_LIMIT',
});

const pivotLandingConfigRateLimit = createLandingRateLimit({
  message: 'Too many config requests. Please try again in a minute.',
  code: 'LANDING_CONFIG_RATE_LIMIT',
});

module.exports = {
  pivotLandingDropRateLimit,
  pivotLandingCopyRateLimit,
  pivotLandingEventRateLimit,
  pivotLandingWaitlistRateLimit,
  pivotLandingConfigRateLimit,
  WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW,
};
