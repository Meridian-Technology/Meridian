/**
 * Shared failure policy for long-running Firecrawl pipelines.
 *
 * Source discovery and batch curation both fan a lot of outbound scrapes into
 * the same rate-limited account, so they need the same answer to the same two
 * questions: which failures make every later call pointless, and how much
 * throttling is worth waiting out before a run is simply too big for the plan.
 * Keeping one copy means a fix to that policy reaches both callers.
 */

/**
 * Failures that make every subsequent call futile. Aborting on these is what
 * keeps a misconfigured or exhausted key from burning a full run's worth of
 * credits one doomed request at a time.
 *
 * Rate limiting is deliberately absent: it is the one failure here that resolves
 * on its own. `pivotSiteScrapeService` waits it out, and sustained throttling is
 * caught by the streak breaker below rather than by killing a run over a
 * condition that clears in seconds.
 */
const FATAL_RUN_CODES = new Set([
  'SITE_SCRAPE_NOT_CONFIGURED',
  'SITE_SCRAPE_AUTH_FAILED',
  'SITE_SCRAPE_QUOTA_EXCEEDED',
]);

/**
 * Consecutive rate-limit exhaustions that end a run.
 *
 * Absorbing a throttle is right; grinding through dozens of calls against a wall
 * that is not moving is not. A streak this long means the plan's limit is below
 * what a run needs, which no amount of further waiting inside this run will fix.
 */
const RATE_LIMIT_ABORT_STREAK = 4;

const RATE_LIMIT_CODE = 'SITE_SCRAPE_RATE_LIMITED';

/**
 * Build the abort/backoff half of a run's state object.
 *
 * Returns methods rather than a class so callers can spread them onto their own
 * state and keep passing that single object down through the pipeline.
 *
 * @param {object} deps.recorder Discovery-run recorder, used to narrate waits.
 * @param {Function} deps.getPhase Current phase, read lazily so retry steps land
 *   under whichever phase was running when the wait began.
 * @returns {{failures: Array, noteFailure: Function, noteSuccess: Function,
 *   onRetry: Function, shouldStop: Function, getAborted: Function}}
 */
function createRunGuard({ recorder, getPhase = () => null } = {}) {
  const guard = {
    aborted: null,
    failures: [],
    rateLimitStreak: 0,
  };

  guard.noteFailure = (failure = {}) => {
    guard.failures.push({ code: failure.code || null, error: failure.error || null });

    if (failure.code === RATE_LIMIT_CODE) {
      guard.rateLimitStreak += 1;
      if (!guard.aborted && guard.rateLimitStreak >= RATE_LIMIT_ABORT_STREAK) {
        guard.aborted = {
          code: RATE_LIMIT_CODE,
          error: `Rate limited on ${guard.rateLimitStreak} calls in a row even after waiting between retries. The Firecrawl plan's limit is below what a run of this size needs — reduce the category count or raise the limit.`,
        };
      }
      return;
    }

    // Any other outcome proves requests are getting through, so the streak is not
    // a standing condition.
    guard.rateLimitStreak = 0;

    if (!guard.aborted && FATAL_RUN_CODES.has(failure.code)) {
      guard.aborted = { code: failure.code, error: failure.error };
    }
  };

  guard.noteSuccess = () => {
    guard.rateLimitStreak = 0;
  };

  /** Report a retry wait, so a throttled run reads as waiting rather than stalled. */
  guard.onRetry = ({ attempt, maxAttempts, waitMs }) => {
    if (!recorder) return;
    recorder.step({
      phase: getPhase(),
      kind: 'retry',
      tone: 'warn',
      title: `Rate limited — waiting ${Math.ceil(waitMs / 1000)}s`,
      detail: `Attempt ${attempt} of ${maxAttempts}. A refused call costs no credits.`,
      code: RATE_LIMIT_CODE,
    });
  };

  guard.shouldStop = () => Boolean(guard.aborted);

  return guard;
}

/**
 * Run `worker` over `items` with bounded parallelism, stopping early once
 * `shouldStop` reports a fatal failure.
 *
 * Lives beside the guard because the two are always used together: the pool is
 * how a run spends its budget, and `shouldStop` is how it decides to stop.
 */
async function runPool(items, limit, worker, shouldStop = () => false) {
  const results = [];
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      if (shouldStop()) return;
      const item = items[cursor];
      cursor += 1;
      const result = await worker(item);
      if (result !== undefined) results.push(result);
    }
  });

  await Promise.all(runners);
  return results;
}

module.exports = {
  createRunGuard,
  runPool,
  FATAL_RUN_CODES,
  RATE_LIMIT_ABORT_STREAK,
  RATE_LIMIT_CODE,
};
