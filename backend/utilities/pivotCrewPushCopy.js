/** User-facing weekly drop push bodies for crew coordination (Task 6.3). */

const { resolveRitualNudgePushBody } = require('./pivotRitualNudge');

const CREW_WEEKLY_DROP_PUSH_BODIES = Object.freeze({
  /** Default crew ritual at drop — A/B default until tenant config ships. */
  ritual: "where's your crew going this week?",
  unfinished: "your crew hasn't swiped yet",
  decide: resolveRitualNudgePushBody('decide'),
  recap: resolveRitualNudgePushBody('recap'),
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

function resolveCrewWeeklyDropBody(variant) {
  if (variant === 'unfinished') {
    return CREW_WEEKLY_DROP_PUSH_BODIES.unfinished;
  }
  if (variant === 'ritual') {
    return CREW_WEEKLY_DROP_PUSH_BODIES.ritual;
  }
  if (variant === 'decide') {
    return CREW_WEEKLY_DROP_PUSH_BODIES.decide;
  }
  if (variant === 'recap') {
    return CREW_WEEKLY_DROP_PUSH_BODIES.recap;
  }
  return null;
}

module.exports = {
  CREW_WEEKLY_DROP_PUSH_BODIES,
  CREW_WEEKLY_DROP_VARIANTS,
  countUnfinishedSwipers,
  resolveCrewWeeklyDropVariant,
  resolveCrewWeeklyDropBody,
};
