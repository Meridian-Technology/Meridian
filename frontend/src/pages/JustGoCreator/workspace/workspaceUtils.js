import justGoCreatorCopy from '../justGoCreatorCopy';

/**
 * Workspace composition + phase logic, ported from `EventDashboardFocused`.
 *
 * The original derives a single current phase from the event, then uses it to filter which nav
 * sections and tabs exist. We keep that model exactly and swap the inputs: campus `status` +
 * `stats.operationalStatus` become the creator's `ingestStatus`, because ops own the lifecycle and
 * a creator listing has no approval state of its own.
 */

export const CREATOR_PHASES = Object.freeze({
  DRAFTING: 'drafting',
  PLANNING: 'planning',
  RUN_OF_SHOW: 'runOfShow',
  POST_MORTEM: 'postMortem',
});

/** Rail order — also the completed/upcoming ordering. */
export const CREATOR_PHASE_ORDER = Object.freeze([
  CREATOR_PHASES.DRAFTING,
  CREATOR_PHASES.PLANNING,
  CREATOR_PHASES.RUN_OF_SHOW,
  CREATOR_PHASES.POST_MORTEM,
]);

/**
 * Phase from the plan's mapping: draft → Drafting; staged / published-future → Planning;
 * published inside start..end → Run of Show; past end → Post Mortem.
 *
 * Draft is checked first, mirroring the original's `status` precedence: a draft whose date has
 * already passed never went live, so calling it a post mortem would be a lie.
 */
export function inferCreatorPhase(event, now = new Date()) {
  const ingestStatus = event?.ingestStatus || 'draft';
  if (ingestStatus === 'draft') return CREATOR_PHASES.DRAFTING;

  const start = event?.start_time ? new Date(event.start_time) : null;
  const end = event?.end_time ? new Date(event.end_time) : start;
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
  const validEnd = end && !Number.isNaN(end.getTime()) ? end : null;

  if (validEnd && now > validEnd) return CREATOR_PHASES.POST_MORTEM;
  if (
    ingestStatus === 'published' &&
    validStart &&
    validEnd &&
    now >= validStart &&
    now <= validEnd
  ) {
    return CREATOR_PHASES.RUN_OF_SHOW;
  }
  return CREATOR_PHASES.PLANNING;
}

/** Rail steps with `complete` / `current` / `upcoming` states. */
export function resolvePhaseRail(currentPhase) {
  const labels = justGoCreatorCopy.workspace.phases;
  const currentIndex = CREATOR_PHASE_ORDER.indexOf(currentPhase);
  return CREATOR_PHASE_ORDER.map((phase, index) => {
    let state = 'upcoming';
    if (index === currentIndex) state = 'current';
    else if (currentIndex > -1 && index < currentIndex) state = 'complete';
    return { id: phase, label: labels[phase], state };
  });
}

export const WORKSPACE_TAB_IDS = Object.freeze({
  OVERVIEW: 'overview',
  DETAILS: 'details',
  INSIGHTS: 'insights',
  INTERESTS: 'interests',
  COMMUNICATIONS: 'communications',
  PROMO: 'promo',
});

const { OVERVIEW, DETAILS, INSIGHTS, INTERESTS, COMMUNICATIONS, PROMO } = WORKSPACE_TAB_IDS;

/**
 * v0 tab registry. Excluded on purpose (Phase 1): check-in, equipment, volunteer jobs, agenda,
 * campus reservation, collaborator orgs — none has a pivot-safe creator equivalent, and check-in
 * in particular would imply native door tools we do not ship yet.
 *
 * Promo and Communications are absent from Drafting: a listing nobody has curated yet has no
 * audience to reach and no drop to promote.
 */
export const WORKSPACE_TABS = Object.freeze([
  Object.freeze({
    id: OVERVIEW,
    icon: 'mingcute:chart-bar-fill',
    phases: CREATOR_PHASE_ORDER,
  }),
  Object.freeze({
    id: DETAILS,
    icon: 'mdi:pencil',
    phases: CREATOR_PHASE_ORDER,
  }),
  Object.freeze({
    id: INSIGHTS,
    icon: 'mingcute:chart-line-fill',
    phases: CREATOR_PHASE_ORDER,
  }),
  Object.freeze({
    id: INTERESTS,
    icon: 'mingcute:user-group-fill',
    phases: CREATOR_PHASE_ORDER,
  }),
  Object.freeze({
    id: COMMUNICATIONS,
    icon: 'mdi:message-text',
    phases: Object.freeze([
      CREATOR_PHASES.PLANNING,
      CREATOR_PHASES.RUN_OF_SHOW,
      CREATOR_PHASES.POST_MORTEM,
    ]),
  }),
  Object.freeze({
    id: PROMO,
    icon: 'mdi:qrcode',
    phases: Object.freeze([CREATOR_PHASES.PLANNING, CREATOR_PHASES.RUN_OF_SHOW]),
  }),
]);

/** Nav sections per phase, same grouping idea as the original's `sidebarSectionsByPhase`. */
const SECTIONS_BY_PHASE = Object.freeze({
  [CREATOR_PHASES.DRAFTING]: Object.freeze([
    Object.freeze({ id: 'drafting-core', tabIds: [OVERVIEW, DETAILS] }),
    Object.freeze({ id: 'audience', tabIds: [INTERESTS, INSIGHTS] }),
  ]),
  [CREATOR_PHASES.PLANNING]: Object.freeze([
    Object.freeze({ id: 'planning', tabIds: [OVERVIEW, DETAILS] }),
    Object.freeze({ id: 'audience', tabIds: [INTERESTS, PROMO, COMMUNICATIONS] }),
    Object.freeze({ id: 'insights', tabIds: [INSIGHTS] }),
  ]),
  [CREATOR_PHASES.RUN_OF_SHOW]: Object.freeze([
    Object.freeze({ id: 'live', tabIds: [OVERVIEW, INTERESTS] }),
    Object.freeze({ id: 'audience', tabIds: [PROMO, COMMUNICATIONS] }),
    Object.freeze({ id: 'monitoring', tabIds: [INSIGHTS, DETAILS] }),
  ]),
  [CREATOR_PHASES.POST_MORTEM]: Object.freeze([
    Object.freeze({ id: 'retrospective', tabIds: [INSIGHTS, OVERVIEW] }),
    Object.freeze({ id: 'records', tabIds: [INTERESTS, DETAILS] }),
  ]),
});

/**
 * Resolve the nav for a phase: sections keep their declared order, tabs not available in the phase
 * drop out, and empty sections disappear.
 *
 * @returns {{ sections: Array, visibleTabs: Array }}
 */
export function resolveWorkspaceNav(phase) {
  const copy = justGoCreatorCopy.workspace;
  const visibleTabs = WORKSPACE_TABS.filter((tab) => tab.phases.includes(phase));
  const visibleIds = new Set(visibleTabs.map((tab) => tab.id));
  const byId = new Map(WORKSPACE_TABS.map((tab) => [tab.id, tab]));

  const sections = (SECTIONS_BY_PHASE[phase] || [])
    .map((section) => ({
      id: section.id,
      label: copy.sections[section.id],
      tabs: section.tabIds
        .filter((id) => visibleIds.has(id))
        .map((id) => ({ ...byId.get(id), label: copy.tabs[id] })),
    }))
    .filter((section) => section.tabs.length > 0);

  return {
    sections,
    visibleTabs: visibleTabs.map((tab) => ({ ...tab, label: copy.tabs[tab.id] })),
  };
}

/**
 * The public web page for a listing. There is no server-provided canonical URL or slug — the
 * consumer page is keyed by Mongo id — so the client composes it from its own origin, which is
 * already the city tenant host the console is served from.
 */
export function buildPublicEventUrl(eventId, origin) {
  if (!eventId) return null;
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return null;
  return `${base}/event/${eventId}`;
}

/** Catalog slugs are kebab-case of their label, so this avoids a tag fetch just to render chips. */
export function prettifyTagSlug(slug) {
  return typeof slug === 'string' ? slug.replace(/-/g, ' ') : '';
}

export function formatWorkspaceDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatWorkspaceTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Countdown for the header stat — mirrors the original's "Time Until" block. */
export function formatTimeUntil(startTime, now = new Date()) {
  if (!startTime) return null;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return null;

  const diffMs = start.getTime() - now.getTime();
  const copy = justGoCreatorCopy.workspace.timeUntil;
  if (diffMs <= 0) return copy.started;

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return copy.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy.hours(hours);
  const days = Math.floor(hours / 24);
  return copy.days(days);
}
