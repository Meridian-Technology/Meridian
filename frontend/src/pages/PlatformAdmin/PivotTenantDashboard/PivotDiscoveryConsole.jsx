import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { Icon } from '@iconify-icon/react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import useAdminDashboardTheme from '../../../hooks/useAdminDashboardTheme';
import './PivotDiscoveryConsole.scss';

const NO_FETCH_CACHE = { enabled: false };
const EMPTY_LIST = [];
const EMPTY_COUNTERS = {};
const EMPTY_PLAN = {};

/** Fast enough that steps land while the work is still happening. */
const POLL_MS = 1200;

/** Well under the library default — the scaled-up header orb reads frantic at 1. */
const ORB_SPEED = 0.45;

/**
 * Phase copy. The console does no phrasing of its own beyond this — every step
 * line is written server-side, next to the logic that knows why it happened.
 */
const PHASE_META = {
  native: {
    label: 'Luma and Partiful',
    hint: 'Running the native city-index jobs before any Firecrawl search',
  },
  searching: {
    label: 'Searching the web',
    hint: 'Running seed queries built from the tag catalog. Query count is unchanged by native skip.',
  },
  filtering: {
    label: 'Filtering candidates',
    hint: 'Dropping Luma/Partiful and known hosts from search hits — not fewer queries',
  },
  qualifying: {
    label: 'Checking sites',
    hint: 'Finding each site’s calendar, then proving it yields dated events',
  },
  registering: {
    label: 'Registering sources',
    hint: 'Saving sources, adding their events, and creating refresh jobs',
  },
  planning: {
    label: 'Planning the refresh',
    hint: 'Working out which sources are due a crawl',
  },
  crawling: {
    label: 'Refreshing sources',
    hint: 'Re-reading each calendar and adding anything new',
  },
  done: { label: 'Finished', hint: null },
};

/**
 * What differs between the two pipelines this console renders. Everything else —
 * the orb, the timeline, the clock, the scroll behaviour — is identical, which
 * is why they share a component rather than a copy.
 */
const KIND_META = {
  discovery: {
    path: 'discovery-runs',
    eyebrow: 'Discovery agent',
    feedLabel: 'Agent decisions',
    idleOrbLabel: 'Agent finished',
    empty: 'No discovery run for this city yet. Start the agent from the Sources panel.',
    waiting: 'Waiting for the first search to come back…',
  },
  'curation-batch': {
    path: 'curation-batches',
    eyebrow: 'Source refresh',
    feedLabel: 'Refresh progress',
    idleOrbLabel: 'Refresh finished',
    empty: 'No refresh has been run for this city yet.',
    waiting: 'Waiting for the first source to come back…',
  },
};

function kindMeta(kind) {
  return KIND_META[kind] || KIND_META.discovery;
}

/**
 * Map the work onto an orb animation.
 *
 * Deliberately keyed off the most recent step rather than the phase alone: the
 * qualifying phase spends most of its time alternating between mapping a site
 * and extracting from it, and those feel like different work.
 */
function orbStateFor(run, lastStep) {
  if (!run || run.status !== 'running') return 'breathing';

  if (run.phase === 'qualifying' && lastStep) {
    if (lastStep.kind === 'map') return 'connecting';
    if (lastStep.kind === 'index') return 'solving';
    if (lastStep.kind === 'scrape') return 'weaving';
  }

  if (run.phase === 'crawling' && lastStep?.kind === 'job-start') return 'weaving';

  switch (run.phase) {
    case 'native':
      return 'weaving';
    case 'searching':
      return 'searching';
    case 'filtering':
      return 'working';
    case 'qualifying':
      return 'working';
    case 'planning':
      return 'solving';
    case 'crawling':
      return 'working';
    case 'registering':
      return 'shaping';
    default:
      return 'breathing';
  }
}

function formatClock(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const ORB_TINT_ID = 'pivot-orb-tint';

/**
 * The orb paints greyscale ink onto a canvas and takes no colour prop, so brand
 * colour has to be applied downstream. This maps the ink ramp onto Just Go
 * orange — black becomes the accent, white stays white — and leaves alpha alone,
 * so the dots keep their depth and antialiasing rather than flattening into
 * silhouettes the way a hue-rotate would.
 *
 * Render once anywhere an orb carries `pivot-orb--brand`; the filter is
 * referenced by id, so it has to be in the document at paint time.
 */
function OrbTint() {
  return (
    <svg className="pivot-orb-defs" aria-hidden="true" focusable="false">
      <filter id={ORB_TINT_ID} colorInterpolationFilters="sRGB">
        <feColorMatrix
          type="matrix"
          values="0      0 0 0 1
                  0.6902 0 0 0 0.3098
                  0.8784 0 0 0 0.1216
                  0      0 0 1 0"
        />
      </filter>
    </svg>
  );
}

function CounterCell({ label, value, of }) {
  return (
    <div className="pivot-discovery__counter">
      <span className="pivot-discovery__counter-value">
        {value}
        {of != null ? <span className="pivot-discovery__counter-of">/{of}</span> : null}
      </span>
      <span className="pivot-discovery__counter-label">{label}</span>
    </div>
  );
}

/**
 * Live view of an orchestrated run — source discovery or a batch refresh.
 *
 * Both make judgement calls that are invisible in their results: which hosts
 * were filtered and why, which of a site's URLs was picked as its calendar, how
 * many events a page had to yield, which source a refresh gave up on. This
 * replays those decisions as they happen so the pipeline can be audited rather
 * than trusted, which matters most on a new city where the seeds are unproven.
 */
function PivotDiscoveryConsole({
  tenantKey,
  runId,
  kind = 'discovery',
  cityDisplayName,
  handleClose,
  onFinished,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  const feedRef = useRef(null);
  const pinnedToBottomRef = useRef(true);
  /** Ignore scroll events fired by our own smooth follow-scroll. */
  const autoScrollingRef = useRef(false);
  const finishedNotifiedRef = useRef(false);
  /** Only a run this console actually watched finish is worth announcing. */
  const sawRunningRef = useRef(false);
  const { isDark } = useAdminDashboardTheme();
  const orbTheme = isDark ? 'dark' : 'light';

  const meta = kindMeta(kind);
  const base = tenantKey
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/${meta.path}`
    : null;
  const runUrl = base
    ? runId
      ? `${base}/${encodeURIComponent(runId)}`
      : `${base}/latest?includeSteps=true`
    : null;

  const { data: runResponse, error: runError, refetch } = useFetch(runUrl, {
    cache: NO_FETCH_CACHE,
  });

  const run = runResponse?.success ? runResponse.data?.run : null;
  const steps = run?.steps ?? EMPTY_LIST;
  const lastStep = steps.length ? steps[steps.length - 1] : null;
  const isRunning = run?.status === 'running';
  const canStop = kind === 'discovery' && isRunning && Boolean(run?._id);

  const handleStop = useCallback(async () => {
    if (!tenantKey || !run?._id || !canStop) return;
    setStopping(true);
    await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/discovery-runs/${encodeURIComponent(
        run._id,
      )}/stop`,
      { method: 'POST' },
    );
    setStopping(false);
    refetch();
  }, [canStop, refetch, run?._id, tenantKey]);

  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = setInterval(() => {
      refetch();
      setNow(Date.now());
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [isRunning, refetch]);

  useEffect(() => {
    if (isRunning) {
      sawRunningRef.current = true;
      return;
    }
    // Reopening a finished run must not re-announce it as just-completed.
    if (!run || !sawRunningRef.current || finishedNotifiedRef.current) return;
    finishedNotifiedRef.current = true;
    onFinished?.(run);
  }, [isRunning, onFinished, run]);

  // Follow the feed, but stop following the moment the reader scrolls up to
  // re-read something — otherwise the next step yanks them back down.
  // Live padding under the latest step means scrollHeight still leaves the
  // active item mid-view rather than flush to the floor.
  // Use scrollTo(smooth) rather than assigning scrollTop — direct assignment
  // jumps and ignores CSS scroll-behavior in most browsers.
  useEffect(() => {
    const el = feedRef.current;
    if (!el || !pinnedToBottomRef.current) return undefined;
    autoScrollingRef.current = true;
    // jsdom (and a few older engines) lack Element.scrollTo — fall back to
    // scrollTop so tests and those clients still pin to the latest step.
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    const release = window.setTimeout(() => {
      autoScrollingRef.current = false;
    }, 500);
    return () => window.clearTimeout(release);
  }, [isRunning, steps.length]);

  const elapsed = useMemo(() => {
    if (!run?.startedAt) return 0;
    const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
    return end - Date.parse(run.startedAt);
  }, [now, run?.finishedAt, run?.startedAt]);

  const phase = PHASE_META[run?.phase] || PHASE_META.searching;
  // Stable identity: a fresh `{}` each render would re-run everything below it.
  const counters = useMemo(() => run?.counters || EMPTY_COUNTERS, [run?.counters]);
  const plan = run?.plan || EMPTY_PLAN;
  const callsMade = (counters.searches || 0) + (counters.maps || 0) + (counters.scrapes || 0);

  const statusLine = useMemo(() => {
    if (!run) return 'Loading…';
    if (run.status === 'running') return phase.label;
    if (run.aborted) return 'Stopped early';
    if (run.status === 'failed') return 'Failed';
    return 'Finished';
  }, [phase.label, run]);

  /**
   * One sentence on what the run produced, phrased for the pipeline that ran.
   * "Saved" rather than "added" because a refresh rewrites events that were
   * already on the calendar; the per-source steps carry the finer split.
   */
  const outcomeLine = useMemo(() => {
    if (!run) return null;
    const saved = counters.eventsUpserted || 0;
    if (kind === 'curation-batch') {
      return `${saved} event(s) saved from ${counters.jobsRun || 0} source(s).`;
    }
    const registered = `${counters.qualified || 0} source(s)`;
    if (run.rehearsal) {
      return `${registered} would have been registered from ${counters.evaluated || 0} site(s).`;
    }
    return `${registered} registered and ${saved} event(s) saved from ${
      counters.evaluated || 0
    } site(s) checked.`;
  }, [counters, kind, run]);

  return (
    <div className="pivot-discovery">
      <OrbTint />
      <header className="pivot-discovery__head">
        <div className="pivot-discovery__orb" aria-hidden={!isRunning}>
          <ThinkingOrb
            className="pivot-orb--brand"
            state={orbStateFor(run, lastStep)}
            size={64}
            speed={ORB_SPEED}
            theme={orbTheme}
            paused={!isRunning}
            aria-label={isRunning ? phase.label : meta.idleOrbLabel}
          />
        </div>
        <div className="pivot-discovery__head-text">
          <p className="pivot-discovery__eyebrow">
            {meta.eyebrow} · {run?.city || cityDisplayName || tenantKey}
          </p>
          <h2 className="pivot-discovery__title">{statusLine}</h2>
          <p className="pivot-discovery__subtitle">
            {isRunning && phase.hint ? phase.hint : null}
            {!isRunning && run?.aborted
              ? `${run.aborted.error} — the rest was skipped rather than retried.`
              : null}
            {!isRunning && !run?.aborted && run?.error ? run.error : null}
            {!isRunning && !run?.aborted && !run?.error ? outcomeLine : null}
          </p>
        </div>
        <div className="pivot-discovery__clock">
          <span className="pivot-discovery__clock-value">{formatClock(elapsed)}</span>
          <span className="pivot-discovery__clock-label">elapsed</span>
        </div>
      </header>

      {run?.rehearsal ? (
        <p className="pivot-discovery__rehearsal" role="note">
          <strong>Rehearsal.</strong> Real city and real seed queries, example hosts. Nothing was
          fetched, nothing was saved, and these counts are not findings.
        </p>
      ) : null}

      <div className="pivot-discovery__counters">
        {kind === 'curation-batch' ? (
          <>
            <CounterCell
              label="sources done"
              value={counters.jobsRun || 0}
              of={plan.jobs || null}
            />
            <CounterCell label="events saved" value={counters.eventsUpserted || 0} />
            <CounterCell label="already listed" value={counters.eventsSkipped || 0} />
            <CounterCell label="sources failed" value={counters.jobsFailed || 0} />
          </>
        ) : (
          <>
            <CounterCell label="searches" value={counters.searches || 0} />
            <CounterCell label="sites mapped" value={counters.maps || 0} />
            <CounterCell label="pages read" value={counters.scrapes || 0} />
            <CounterCell label="calls used" value={callsMade} of={plan.maxOutboundCalls || null} />
            <CounterCell label="qualified" value={counters.qualified || 0} />
            <CounterCell label="ruled out" value={counters.rejected || 0} />
            <CounterCell label="events saved" value={counters.eventsUpserted || 0} />
          </>
        )}
      </div>

      {kind !== 'curation-batch' && (counters.skippedNative || 0) > 0 ? (
        <p className="pivot-discovery__skip-note" role="note">
          {counters.skippedNative} Luma/Partiful hit(s) dropped from search results — searches
          still ran.
        </p>
      ) : null}

      {runError ? (
        <p className="pivot-discovery__error">
          Could not load this run. {String(runError)}
        </p>
      ) : null}

      {!run && !runError ? <p className="pivot-discovery__empty">{meta.empty}</p> : null}

      {run ? (
        <div
          className={`pivot-discovery__feed${isRunning ? ' pivot-discovery__feed--live' : ''}`}
          ref={feedRef}
          role="log"
          aria-live="polite"
          aria-label={meta.feedLabel}
          onScroll={(e) => {
            if (autoScrollingRef.current) return;
            const el = e.currentTarget;
            pinnedToBottomRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 64;
          }}
        >
          {steps.length ? (
            <ol className="pivot-discovery__steps">
              {steps.map((step, index) => {
                const isLatest = index === steps.length - 1;
                return (
                  <li
                    key={`${step.at}-${index}`}
                    className={`pivot-discovery__step pivot-discovery__step--${step.tone}${
                      isLatest && isRunning ? ' pivot-discovery__step--active' : ''
                    }`}
                  >
                    <span className="pivot-discovery__step-marker" aria-hidden="true">
                      {isLatest && isRunning ? (
                        <ThinkingOrb
                          className="pivot-orb--brand"
                          state={orbStateFor(run, step)}
                          size={20}
                          speed={ORB_SPEED}
                          theme={orbTheme}
                        />
                      ) : (
                        <span className="pivot-discovery__step-dot" />
                      )}
                    </span>
                    <span className="pivot-discovery__step-body">
                      <span className="pivot-discovery__step-title">
                        <span
                          className={
                            isLatest && isRunning
                              ? 'pivot-discovery__step-shimmer'
                              : undefined
                          }
                        >
                          {step.title}
                        </span>
                        {step.eventCount != null
                        && ['qualify', 'ingest', 'job-done'].includes(step.kind) ? (
                          <span className="pivot-discovery__step-badge">
                            {step.eventCount} events
                          </span>
                          ) : null}
                        {step.tag ? (
                          <span className="pivot-discovery__step-tag">{step.tag}</span>
                        ) : null}
                      </span>
                      {step.detail ? (
                        <span className="pivot-discovery__step-detail">{step.detail}</span>
                      ) : null}
                      {step.url ? (
                        <a
                          className="pivot-discovery__step-url"
                          href={step.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {step.url}
                        </a>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="pivot-discovery__empty">{meta.waiting}</p>
          )}
        </div>
      ) : null}

      <footer className="pivot-discovery__foot">
        <p className="pivot-discovery__foot-note">
          {isRunning
            ? 'Runs in the background — closing this does not stop it. Use Stop to end the agent.'
            : run?.rehearsal
              ? 'No outbound calls were made.'
              : kind === 'curation-batch'
                ? `Read ${counters.jobsRun || 0} of ${plan.jobs || 0} source(s).`
                : plan.maxOutboundCalls
                  ? `Used ${callsMade} of a ${plan.maxOutboundCalls}-call ceiling.`
                  : null}
        </p>
        <div className="pivot-discovery__foot-actions">
          {canStop ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary linear-btn--icon pivot-discovery__stop-btn"
              onClick={handleStop}
              disabled={stopping}
              aria-label={stopping ? 'Stopping' : 'Stop agent'}
              title={stopping ? 'Stopping…' : 'Stop agent'}
            >
              <Icon icon={stopping ? 'mdi:loading' : 'mdi:stop'} aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" className="linear-btn linear-btn--secondary" onClick={handleClose}>
            {isRunning ? 'Close' : 'Done'}
          </button>
        </div>
      </footer>
    </div>
  );
}

/** Shared with the panel so the two never disagree about what a phase is called. */
function phaseLabel(phase) {
  return (PHASE_META[phase] || PHASE_META.searching).label;
}

export default PivotDiscoveryConsole;
export { orbStateFor, formatClock, phaseLabel, OrbTint };
