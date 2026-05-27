/** In-memory rate limit for unauthenticated referral validation (20 req/min/IP). */
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

const buckets = new Map();

function pivotReferralValidateRateLimit(req, res, next) {
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
      message: 'Too many validation attempts. Please try again in a minute.',
      code: 'REFERRAL_VALIDATE_RATE_LIMIT',
    });
  }

  return next();
}

module.exports = {
  pivotReferralValidateRateLimit,
  WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW,
};
