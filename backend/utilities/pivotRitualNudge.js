/** Ritual nudge directive + push bodies (Phase 4). */

const RITUAL_NUDGE_TYPES = Object.freeze([
  'swipe',
  'quorum_waiting',
  'decide',
  'decide_started',
  'decide_swap',
  'decide_pending',
  'recap',
]);

const RITUAL_NUDGE_COPY_KEYS = Object.freeze({
  swipe: 'crew.ritual.nudgeSwipe',
  quorum_waiting: 'crew.ritual.nudgeQuorumWaiting',
  decide: 'crew.ritual.nudgeDecide',
  decide_started: 'crew.ritual.nudgeDecideStarted',
  decide_swap: 'crew.ritual.nudgeDecideSwap',
  decide_pending: 'crew.ritual.nudgeDecidePending',
  recap: 'crew.ritual.nudgeRecap',
});

const RITUAL_NUDGE_PUSH_BODIES = Object.freeze({
  swipe: 'finish swiping for your crews this week',
  quorum_waiting: 'your crew is waiting on swipes',
  decide: "confirm where your crew's going — locks soon",
  decide_started: "confirm where you're going — locks in a few hours",
  decide_swap: 'new pick — confirm again',
  decide_pending: 'your crew is waiting on your confirm',
  recap: 'see where your crews landed this week',
});

function hasAnyCrewAwaitingQuorum(crews) {
  return crews.some((crew) => !crew.swipeProgress?.quorumMet);
}

/**
 * Returns at most one nudge directive for the ritual payload.
 */
function buildRitualNudge({ phase, decideQueueOrder, deck, crews }) {
  if (phase === 'decide' && decideQueueOrder.length) {
    return {
      type: 'decide',
      crewId: decideQueueOrder[0],
      copyKey: RITUAL_NUDGE_COPY_KEYS.decide,
    };
  }

  if (phase === 'recap') {
    return {
      type: 'recap',
      copyKey: RITUAL_NUDGE_COPY_KEYS.recap,
    };
  }

  if ((phase === 'swiping' || phase === 'solo') && deck.remaining > 0) {
    return {
      type: 'swipe',
      copyKey: RITUAL_NUDGE_COPY_KEYS.swipe,
    };
  }

  if (phase === 'drop_live' && hasAnyCrewAwaitingQuorum(crews)) {
    return {
      type: 'quorum_waiting',
      copyKey: RITUAL_NUDGE_COPY_KEYS.quorum_waiting,
    };
  }

  return undefined;
}

function resolveRitualNudgePushBody(nudgeType) {
  return RITUAL_NUDGE_PUSH_BODIES[nudgeType] || null;
}

function buildRitualPushData({
  batchWeek,
  ritualPhase,
  crewId = null,
  ritualNudgeType = null,
  pushType,
}) {
  return {
    type: pushType,
    edition: 'pivot',
    appEdition: 'pivot',
    batchWeek,
    ritualPhase,
    ...(crewId ? { crewId } : {}),
    ...(ritualNudgeType ? { ritualNudgeType } : {}),
    navigation: {
      type: 'navigate',
      route: 'PivotWeek',
      deepLink: 'meridian://pivot/week',
    },
  };
}

module.exports = {
  RITUAL_NUDGE_TYPES,
  RITUAL_NUDGE_COPY_KEYS,
  RITUAL_NUDGE_PUSH_BODIES,
  buildRitualNudge,
  resolveRitualNudgePushBody,
  buildRitualPushData,
  hasAnyCrewAwaitingQuorum,
};
