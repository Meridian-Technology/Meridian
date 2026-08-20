/**
 * In-memory per-IP rate limits for public Just Go landing endpoints.
 *
 * Task 6.2 (tighten write/abuse surfaces; leave read-ish copy/config/drop at 60):
 * - waitlist POST: 10/min/IP  (`WAITLIST_RATE_LIMIT`)
 * - landing event POST: 30/min/IP  (`LANDING_EVENT_RATE_LIMIT`; was 60)
 * - QR hop POST: 30/min/IP  (`LANDING_QR_RATE_LIMIT`)
 * - copy / config / drop GET: 60/min/IP (unchanged)
 *
 * Admin GET/PATCH/DELETE are not limited here — `verifyToken` + `requirePlatformAdmin`.
 */
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;
const LANDING_EVENT_MAX_PER_WINDOW = 30;
const WAITLIST_MAX_PER_WINDOW = 10;
const QR_HOP_MAX_PER_WINDOW = 30;

function createLandingRateLimit({ message, code, max = MAX_REQUESTS_PER_WINDOW }) {
  const buckets = new Map();
  const limit = Number.isFinite(max) && max > 0 ? max : MAX_REQUESTS_PER_WINDOW;

  function pivotLandingRateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(ip);

    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      bucket = { windowStart: now, count: 0 };
      buckets.set(ip, bucket);
    }

    bucket.count += 1;

    if (bucket.count > limit) {
      return res.status(429).json({
        success: false,
        message,
        code,
      });
    }

    return next();
  }
  pivotLandingRateLimit.reset = () => buckets.clear();
  pivotLandingRateLimit.max = limit;
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
  max: LANDING_EVENT_MAX_PER_WINDOW,
});

const pivotLandingWaitlistRateLimit = createLandingRateLimit({
  message: 'Too many waitlist requests. Please try again in a minute.',
  code: 'WAITLIST_RATE_LIMIT',
  max: WAITLIST_MAX_PER_WINDOW,
});

const pivotLandingConfigRateLimit = createLandingRateLimit({
  message: 'Too many config requests. Please try again in a minute.',
  code: 'LANDING_CONFIG_RATE_LIMIT',
});

const pivotLandingQrHopRateLimit = createLandingRateLimit({
  message: 'Too many QR scans. Please try again in a minute.',
  code: 'LANDING_QR_RATE_LIMIT',
  max: QR_HOP_MAX_PER_WINDOW,
});

module.exports = {
  createLandingRateLimit,
  pivotLandingDropRateLimit,
  pivotLandingCopyRateLimit,
  pivotLandingEventRateLimit,
  pivotLandingWaitlistRateLimit,
  pivotLandingConfigRateLimit,
  pivotLandingQrHopRateLimit,
  WINDOW_MS,
  MAX_REQUESTS_PER_WINDOW,
  LANDING_EVENT_MAX_PER_WINDOW,
  WAITLIST_MAX_PER_WINDOW,
  QR_HOP_MAX_PER_WINDOW,
};
