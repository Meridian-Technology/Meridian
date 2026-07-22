const mongoose = require('mongoose');
const getModels = require('./getModelService');
const {
  computeJudgementWindowEndsAt,
  serializeCrewWeekEvent,
  resolveBatchWeek,
  resolveCrewConfig,
  recomputeCrewWeekState,
  invalidateCrewWeekProgressForCrewMembers,
} = require('./pivotCrewWeekStateService');
const {
  PIVOT_EVENT_STATUSES,
} = require('./pivotFeedService');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');

const LOCKED_JUDGEMENT_STATUSES = new Set(['confirmed', 'swapped']);
const JUDGEMENT_READY_STATUSES = new Set(['proposed', 'split']);

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function isJudgementWindowOpen(judgementWindowEndsAt, now = new Date()) {
  if (!judgementWindowEndsAt) {
    return false;
  }
  const endsAtMs = new Date(judgementWindowEndsAt).getTime();
  if (Number.isNaN(endsAtMs)) {
    return false;
  }
  return now.getTime() <= endsAtMs;
}

function getTopCandidateEventIds(weekState) {
  if (!weekState?.voteBreakdown?.length) {
    if (weekState?.proposedEventId) {
      return [weekState.proposedEventId.toString()];
    }
    return [];
  }

  if (weekState.judgementStatus === 'split') {
    return weekState.voteBreakdown.slice(0, 2).map((entry) => entry.eventId.toString());
  }

  const ids = weekState.voteBreakdown.slice(0, 2).map((entry) => entry.eventId.toString());
  if (weekState.proposedEventId) {
    ids.unshift(weekState.proposedEventId.toString());
  }
  return [...new Set(ids)];
}

function resolveSwapTargetEventId(weekState) {
  if (!weekState?.voteBreakdown?.length) {
    return null;
  }

  if (weekState.judgementStatus === 'split') {
    return weekState.voteBreakdown[1]?.eventId?.toString?.() || null;
  }

  const proposedId = weekState.proposedEventId?.toString?.() || null;
  const runnerEntry = weekState.voteBreakdown.find((entry) => {
    const eventId = entry.eventId.toString();
    return !proposedId || eventId !== proposedId;
  });
  return runnerEntry?.eventId?.toString?.() || null;
}

async function requireActiveCrewMembership(req, crewId) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const crewObjectId = toObjectId(crewId);
  if (!crewObjectId) {
    return { error: 'Crew not found.', status: 404, code: 'NOT_FOUND' };
  }

  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  if (!tenantKey) {
    return { error: 'City tenant is required.', status: 400, code: 'TENANT_REQUIRED' };
  }

  const { PivotCrew, PivotCrewMembership } = getModels(req, 'PivotCrew', 'PivotCrewMembership');
  const crew = await PivotCrew.findOne({
    _id: crewObjectId,
    tenantKey,
    archivedAt: null,
  }).lean();

  if (!crew) {
    return { error: 'Crew not found.', status: 404, code: 'NOT_FOUND' };
  }

  const membership = await PivotCrewMembership.findOne({
    crewId: crewObjectId,
    userId: toObjectId(userId),
    status: 'active',
  }).lean();

  if (!membership) {
    return {
      error: 'You are not a member of this crew.',
      status: 403,
      code: 'FORBIDDEN',
    };
  }

  return { crew, membership, crewObjectId, tenantKey };
}

async function loadWeekStateEvents(req, weekState, batchWeek) {
  const eventIds = new Set();
  if (weekState?.proposedEventId) {
    eventIds.add(weekState.proposedEventId.toString());
  }
  for (const entry of weekState?.voteBreakdown || []) {
    eventIds.add(entry.eventId.toString());
  }

  if (!eventIds.size) {
    return new Map();
  }

  const { Event } = getModels(req, 'Event');
  const events = await Event.find({
    _id: { $in: [...eventIds].map((id) => toObjectId(id)) },
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
  })
    .select('name location start_time end_time externalLink customFields.pivot')
    .lean();

  return new Map(events.map((event) => [event._id.toString(), event]));
}

function resolveJudgementWindowEndsAt(weekState, eventsById, crewConfig) {
  if (!weekState?.swipeProgress?.quorumMet) {
    return null;
  }

  const candidateStarts = (weekState.voteBreakdown || [])
    .map((entry) => eventsById.get(entry.eventId.toString())?.start_time?.getTime?.())
    .filter((value) => Number.isFinite(value));

  if (!candidateStarts.length) {
    return null;
  }

  return computeJudgementWindowEndsAt({
    candidateEventStarts: candidateStarts,
    quorumMetAt: weekState.aggregatedAt,
    crewConfig,
  });
}

async function loadJudgementVoteUsers(req, weekState) {
  const userIds = new Set();
  for (const entry of weekState?.voteBreakdown || []) {
    for (const vote of entry.memberVotes || []) {
      if (vote.userId) {
        userIds.add(vote.userId.toString());
      }
    }
  }

  if (!userIds.size) {
    return new Map();
  }

  const { User } = getModels(req, 'User');
  const users = await User.find({ _id: { $in: [...userIds].map((id) => toObjectId(id)) } })
    .select('name picture')
    .lean();

  return new Map(
    users.map((user) => [
      user._id.toString(),
      { displayLabel: user.name || 'member', picture: user.picture || null },
    ]),
  );
}

function serializeVoteBreakdown(weekState, eventsById, usersById) {
  return (weekState?.voteBreakdown || []).map((entry) => {
    const eventId = entry.eventId.toString();
    return {
      eventId,
      score: entry.score,
      interestedCount: entry.interestedCount,
      registeredCount: entry.registeredCount,
      event: serializeCrewWeekEvent(eventsById.get(eventId), entry),
      memberVotes: (entry.memberVotes || []).map((vote) => {
        const userId = vote.userId.toString();
        const user = usersById.get(userId);
        return {
          userId,
          status: vote.status,
          displayLabel: user?.displayLabel || 'member',
          picture: user?.picture || null,
        };
      }),
    };
  });
}

async function ensureCrewWeekState(req, crewObjectId, batchWeek) {
  const { PivotCrewWeekState } = getModels(req, 'PivotCrewWeekState');
  let weekState = await PivotCrewWeekState.findOne({
    crewId: crewObjectId,
    batchWeek,
  }).lean();

  if (!weekState) {
    const recomputed = await recomputeCrewWeekState(req, {
      crewId: crewObjectId.toString(),
      batchWeek,
    });
    if (recomputed.error) {
      return recomputed;
    }
    weekState = recomputed.data;
  }

  return { weekState };
}

function validateJudgementAction(weekState, crewConfig, eventsById, now) {
  if (!weekState?.swipeProgress?.quorumMet) {
    return {
      error: 'Crew swipe quorum has not been met yet.',
      status: 400,
      code: 'JUDGEMENT_NOT_READY',
    };
  }

  if (!JUDGEMENT_READY_STATUSES.has(weekState.judgementStatus)) {
    if (LOCKED_JUDGEMENT_STATUSES.has(weekState.judgementStatus)) {
      return {
        error: 'This crew pick is already locked for the week.',
        status: 409,
        code: 'PICK_ALREADY_LOCKED',
      };
    }
    return {
      error: 'No crew pick is ready for judgement yet.',
      status: 400,
      code: 'JUDGEMENT_NOT_READY',
    };
  }

  const judgementWindowEndsAt = resolveJudgementWindowEndsAt(weekState, eventsById, crewConfig);
  if (!isJudgementWindowOpen(judgementWindowEndsAt, now)) {
    return {
      error: 'The judgement window for this crew has closed.',
      status: 409,
      code: 'JUDGEMENT_WINDOW_CLOSED',
      judgementWindowEndsAt,
    };
  }

  return { judgementWindowEndsAt };
}

async function getPivotCrewWeekJudgement(req, { crewId, batchWeek, now = new Date() }) {
  const access = await requireActiveCrewMembership(req, crewId);
  if (access.error) {
    return access;
  }

  const normalizedWeek = await resolveBatchWeek(req, batchWeek);
  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const loaded = await ensureCrewWeekState(req, access.crewObjectId, normalizedWeek.batchWeek);
  if (loaded.error) {
    return loaded;
  }

  const crewConfig = await resolveCrewConfig(req);
  const eventsById = await loadWeekStateEvents(req, loaded.weekState, normalizedWeek.batchWeek);
  const usersById = await loadJudgementVoteUsers(req, loaded.weekState);
  const judgementWindowEndsAt = resolveJudgementWindowEndsAt(
    loaded.weekState,
    eventsById,
    crewConfig,
  );

  const voteBreakdown = serializeVoteBreakdown(loaded.weekState, eventsById, usersById);
  const proposedEventId =
    loaded.weekState.proposedEventId?.toString?.()
    || (loaded.weekState.judgementStatus === 'split'
      ? voteBreakdown[0]?.eventId
      : null);
  const runnerUpEventId = resolveSwapTargetEventId(loaded.weekState);

  return {
    data: {
      batchWeek: normalizedWeek.batchWeek,
      crewId: access.crew._id.toString(),
      crewName: access.crew.name,
      judgementStatus: loaded.weekState.judgementStatus,
      quorumMet: loaded.weekState.swipeProgress.quorumMet,
      swipedCount: loaded.weekState.swipeProgress.swipedCount,
      activeCount: loaded.weekState.swipeProgress.activeMemberCount,
      invitedCount: loaded.weekState.swipeProgress.invitedCount,
      judgementWindowEndsAt,
      judgementWindowOpen: isJudgementWindowOpen(judgementWindowEndsAt, now),
      topCandidates: getTopCandidateEventIds(loaded.weekState),
      proposedEvent: proposedEventId
        ? voteBreakdown.find((entry) => entry.eventId === proposedEventId)?.event || null
        : null,
      runnerUp: runnerUpEventId
        ? voteBreakdown.find((entry) => entry.eventId === runnerUpEventId)?.event || null
        : null,
      voteBreakdown,
    },
  };
}

async function lockCrewWeekPick(
  req,
  {
    crewId,
    eventId,
    batchWeek,
    judgementStatus,
    now = new Date(),
  },
) {
  const access = await requireActiveCrewMembership(req, crewId);
  if (access.error) {
    return access;
  }

  const normalizedWeek = await resolveBatchWeek(req, batchWeek);
  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const eventObjectId = toObjectId(eventId);
  if (!eventObjectId) {
    return {
      error: 'A valid eventId is required.',
      status: 400,
      code: 'INVALID_EVENT_ID',
    };
  }

  const loaded = await ensureCrewWeekState(req, access.crewObjectId, normalizedWeek.batchWeek);
  if (loaded.error) {
    return loaded;
  }

  const crewConfig = await resolveCrewConfig(req);
  const eventsById = await loadWeekStateEvents(req, loaded.weekState, normalizedWeek.batchWeek);
  const validation = validateJudgementAction(loaded.weekState, crewConfig, eventsById, now);
  if (validation.error) {
    return validation;
  }

  const allowedEventIds = getTopCandidateEventIds(loaded.weekState);
  if (!allowedEventIds.includes(eventObjectId.toString())) {
    return {
      error: 'eventId must be one of the top crew candidates for this week.',
      status: 400,
      code: 'INVALID_CANDIDATE',
    };
  }

  const voteEntry = (loaded.weekState.voteBreakdown || []).find(
    (entry) => entry.eventId.toString() === eventObjectId.toString(),
  );

  const { PivotCrewWeekState } = getModels(req, 'PivotCrewWeekState');
  const updated = await PivotCrewWeekState.findOneAndUpdate(
    { crewId: access.crewObjectId, batchWeek: normalizedWeek.batchWeek },
    {
      $set: {
        proposedEventId: eventObjectId,
        proposedScore: voteEntry?.score ?? loaded.weekState.proposedScore,
        judgementStatus,
        aggregatedAt: new Date(),
      },
    },
    { new: true, runValidators: true },
  ).lean();

  await invalidateCrewWeekProgressForCrewMembers(req, {
    crewId: access.crewObjectId.toString(),
    batchWeek: normalizedWeek.batchWeek,
  });

  const lockedEvent = eventsById.get(eventObjectId.toString());

  return {
    data: {
      batchWeek: normalizedWeek.batchWeek,
      crewId: access.crew._id.toString(),
      crewName: access.crew.name,
      judgementStatus: updated.judgementStatus,
      eventId: eventObjectId.toString(),
      event: serializeCrewWeekEvent(lockedEvent, voteEntry),
      judgementWindowEndsAt: validation.judgementWindowEndsAt,
    },
  };
}

async function confirmPivotCrewWeekPick(req, { crewId, eventId, batchWeek, now = new Date() }) {
  return lockCrewWeekPick(req, {
    crewId,
    eventId,
    batchWeek,
    judgementStatus: 'confirmed',
    now,
  });
}

async function swapPivotCrewWeekPick(req, { crewId, batchWeek, now = new Date() }) {
  const access = await requireActiveCrewMembership(req, crewId);
  if (access.error) {
    return access;
  }

  const normalizedWeek = await resolveBatchWeek(req, batchWeek);
  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const loaded = await ensureCrewWeekState(req, access.crewObjectId, normalizedWeek.batchWeek);
  if (loaded.error) {
    return loaded;
  }

  const swapEventId = resolveSwapTargetEventId(loaded.weekState);
  if (!swapEventId) {
    return {
      error: 'No alternate crew pick is available to swap.',
      status: 400,
      code: 'SWAP_NOT_AVAILABLE',
    };
  }

  const allowedEventIds = getTopCandidateEventIds(loaded.weekState);
  if (!allowedEventIds.includes(swapEventId)) {
    return {
      error: 'Swap is only allowed among the top crew candidates.',
      status: 400,
      code: 'INVALID_CANDIDATE',
    };
  }

  return lockCrewWeekPick(req, {
    crewId,
    eventId: swapEventId,
    batchWeek: normalizedWeek.batchWeek,
    judgementStatus: 'swapped',
    now,
  });
}

async function loadLockedCrewPicksForUser(req, batchWeek) {
  const userId = req.user?.userId;
  if (!userId) {
    return [];
  }

  const userObjectId = toObjectId(userId);
  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  if (!userObjectId || !tenantKey) {
    return [];
  }

  const { PivotCrew, PivotCrewMembership, PivotCrewWeekState, Event } = getModels(
    req,
    'PivotCrew',
    'PivotCrewMembership',
    'PivotCrewWeekState',
    'Event',
  );

  const memberships = await PivotCrewMembership.find({
    userId: userObjectId,
    status: 'active',
  })
    .select('crewId')
    .lean();

  if (!memberships.length) {
    return [];
  }

  const crewIds = memberships.map((row) => row.crewId);
  const [crews, weekStates] = await Promise.all([
    PivotCrew.find({ _id: { $in: crewIds }, archivedAt: null, tenantKey })
      .select('name')
      .lean(),
    PivotCrewWeekState.find({
      crewId: { $in: crewIds },
      batchWeek,
      judgementStatus: { $in: ['confirmed', 'swapped'] },
      proposedEventId: { $ne: null },
    }).lean(),
  ]);

  if (!weekStates.length) {
    return [];
  }

  const eventIds = weekStates.map((row) => row.proposedEventId);
  const events = await Event.find({
    _id: { $in: eventIds },
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
    status: { $in: PIVOT_EVENT_STATUSES },
    isDeleted: { $ne: true },
  })
    .select('name location start_time end_time externalLink customFields.pivot')
    .lean();

  const eventsById = new Map(events.map((event) => [event._id.toString(), event]));
  const crewById = new Map(crews.map((crew) => [crew._id.toString(), crew]));

  return weekStates
    .map((weekState) => {
      const crew = crewById.get(weekState.crewId.toString());
      const eventId = weekState.proposedEventId.toString();
      const event = eventsById.get(eventId);
      if (!crew || !event) {
        return null;
      }

      const voteEntry = (weekState.voteBreakdown || []).find(
        (entry) => entry.eventId.toString() === eventId,
      );

      return {
        crewId: crew._id.toString(),
        crewName: crew.name,
        judgementStatus: weekState.judgementStatus,
        event: serializeCrewWeekEvent(event, voteEntry),
      };
    })
    .filter(Boolean);
}

module.exports = {
  getTopCandidateEventIds,
  isJudgementWindowOpen,
  getPivotCrewWeekJudgement,
  confirmPivotCrewWeekPick,
  swapPivotCrewWeekPick,
  loadLockedCrewPicksForUser,
};
