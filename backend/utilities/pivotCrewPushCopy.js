/** User-facing weekly drop push bodies for crew coordination (Task 6.1). */

const { resolveOverlayPushBody } = require('./pivotCopyPushResolve');
const { resolveRitualNudgePushBody } = require('./pivotRitualNudge');

/** Bundled fallbacks — empty pack must keep these strings. */
const CREW_WEEKLY_DROP_PUSH_BODIES = Object.freeze({
  /** Default crew ritual at drop — A/B default until tenant config ships. */
  ritual: "where's your crew going this week?",
  unfinished: "your crew hasn't swiped yet",
  decide: resolveRitualNudgePushBody('decide'),
  recap: resolveRitualNudgePushBody('recap'),
});

/**
 * Catalog keys for Voice overlay. Ritual decide/recap resolve the same
 * weekly-drop keys so one PATCH updates both send paths.
 */
const CREW_WEEKLY_DROP_PUSH_KEYS = Object.freeze({
  ritual: 'crew.push.weeklyDrop.ritualBody',
  unfinished: 'crew.push.weeklyDrop.unfinishedBody',
  decide: 'crew.push.weeklyDrop.decideBody',
  recap: 'crew.push.weeklyDrop.recapBody',
});

const CREW_WEEKLY_DROP_VARIANTS = Object.freeze([
  'ritual',
  'unfinished',
  'decide',
  'recap',
]);

function countUnfinishedSwipers(swipeProgress = {}) {
  const activeCount = Number(swipeProgress.activeMemberCount) || 0;
  const swipedCount = Number(swipeProgress.swipedCount) || 0;
  return Math.max(0, activeCount - swipedCount);
}

/**
 * Pick crew weekly-drop body variant for a recipient.
 * Solo users should use the standard tenant/default drop copy instead.
 */
function resolveCrewWeeklyDropVariant({
  hasCrew = false,
  userSwiped = false,
  anyCrewUnfinished = false,
  ritualPhase = null,
} = {}) {
  if (!hasCrew) {
    return null;
  }

  if (ritualPhase === 'decide') {
    return 'decide';
  }

  if (ritualPhase === 'recap') {
    return 'recap';
  }

  if (!userSwiped || anyCrewUnfinished) {
    return 'unfinished';
  }
  return 'ritual';
}

function resolveCrewWeeklyDropBody(variant, pack) {
  const fallback = CREW_WEEKLY_DROP_PUSH_BODIES[variant];
  if (fallback == null) {
    return null;
  }
  const path = CREW_WEEKLY_DROP_PUSH_KEYS[variant];
  return resolveOverlayPushBody(path, pack, fallback);
}

module.exports = {
  CREW_WEEKLY_DROP_PUSH_BODIES,
  CREW_WEEKLY_DROP_PUSH_KEYS,
  CREW_WEEKLY_DROP_VARIANTS,
  countUnfinishedSwipers,
  resolveCrewWeeklyDropVariant,
  resolveCrewWeeklyDropBody,
};
