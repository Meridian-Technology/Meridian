const mongoose = require('mongoose');
const getModels = require('./getModelService');
const {
  computeJudgementWindowEndsAt,
  serializeCrewWeekEvent,
  resolveBatchWeek,
  resolveCrewConfig,
  recomputeCrewWeekState,
  invalidateCrewWeekProgressForCrewMembers,
  getPivotCrewWeekProgress,
} = require('./pivotCrewWeekStateService');
const {
  isJudgementWindowOpen,
  buildDecideQueueOrder,
  crewNeedsUserAction,
} = require('../utilities/pivotCrewDecideQueue');
const {
  OPEN_CONSENSUS_STATUSES,
  LOCKED_JUDGEMENT_STATUSES,
  resolveEffectiveConsensusEndsAt,
  startConsensusWindow,
  extendConsensusWindowOnSwap,
  isConsensusExpired,
  resolveLockedJudgementStatus,
  memberConfirmedCurrentProposal,
  countConfirmedOnCurrentProposal,
  isUnanimousOnCurrentProposal,
  upsertMemberJudgement,
  resolveViewerAction,
} = require('../utilities/pivotCrewConsensus');
const { isAppVersionAtLeast } = require('../utilities/appVersion');
const { APP_VERSION_HEADER } = require('../middlewares/requireMinAppVersion');
const { PIVOT_EVENT_STATUSES } = require('./pivotFeedService');

const RITUAL_MIN_APP_VERSION = String(
  process.env.PIVOT_RITUAL_MIN_APP_VERSION || '2.0.0',
).trim();
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { connectToDatabase } = require('../connectionsManager');
const { notifyCrewConsensusPeers } = require('./pivotCrewNudgeService');

const LEGACY_READY_STATUSES = new Set(['proposed', 'split']);

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function usesDemocraticConsensus(req) {
  const appVersion = req.get?.(APP_VERSION_HEADER)?.trim();
  return Boolean(appVersion && isAppVersionAtLeast(appVersion, RITUAL_MIN_APP_VERSION));
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

  if (weekState.judgementStatus === 'split' && !weekState.proposedEventId) {
    return weekState.voteBreakdown[1]?.eventId?.toString?.() || null;
  }

  const proposedId = weekState.proposedEventId?.toString?.() || null;
  const runnerEntry = weekState.voteBreakdown.find((entry) => {
    const eventId = entry.eventId.toString();
    return !proposedId || eventId !== proposedId;
  });
  return runnerEntry?.eventId?.toString?.() || null;
}

function resolveCurrentProposedEventId(weekState, voteBreakdown = []) {
  if (weekState?.proposedEventId) {
    return weekState.proposedEventId.toString();
  }
  if (
    weekState?.judgementStatus === 'split' ||
    weekState?.judgementStatus === 'deciding'
  ) {
    return voteBreakdown[0]?.eventId || null;
  }
  return null;
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

  return { crew, membership, crewObjectId, tenantKey, userId };
}

async function loadWeekStateEvents(req, weekState, batchWeek) {
  const eventIds = new Set();
  if (weekState?.proposedEventId) {
    eventIds.add(weekState.proposedEventId.toString());
  }
  if (weekState?.originalProposedEventId) {
    eventIds.add(weekState.originalProposedEventId.toString());
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
    .select('name description location start_time end_time externalLink image customFields.pivot')
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
  for (const entry of weekState?.memberJudgements || []) {
    if (entry.userId) {
      userIds.add(entry.userId.toString());
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

async function loadActiveMemberUserIds(req, crewObjectId) {
  const { PivotCrewMembership } = getModels(req, 'PivotCrewMembership');
  const memberships = await PivotCrewMembership.find({
    crewId: crewObjectId,
    status: 'active',
    userId: { $ne: null },
  })
    .select('userId')
    .lean();

  return memberships
    .map((row) => row.userId?.toString?.())
    .filter(Boolean);
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

function buildConsensusPayload({
  weekState,
  crewConfig,
  judgementWindowEndsAt,
  activeMemberUserIds,
  usersById,
  viewerUserId,
  now,
}) {
  const proposedEventId = weekState?.proposedEventId?.toString?.() || null;
  const swapBudget = Number(crewConfig?.judgement?.crewSwapBudget);
  const budget = Number.isInteger(swapBudget) ? swapBudget : 2;
  const swapsRemaining =
    weekState?.crewSwapsRemaining == null ? budget : Number(weekState.crewSwapsRemaining);

  const startedAt = weekState?.consensusStartedAt
    ? new Date(weekState.consensusStartedAt).toISOString()
    : null;
  const endsAt = weekState?.consensusEndsAt
    ? new Date(weekState.consensusEndsAt).toISOString()
    : null;
  const effectiveEndsAt = resolveEffectiveConsensusEndsAt(endsAt, judgementWindowEndsAt);

  const confirmedMembers = (weekState?.memberJudgements || [])
    .filter((entry) => {
      const eventId = entry.eventId?.toString?.() || entry.eventId;
      return (
        (entry.action === 'confirmed' || entry.action === 'swapped') &&
        eventId === proposedEventId
      );
    })
    .map((entry) => {
      const userId = entry.userId.toString();
      const user = usersById.get(userId);
      return {
        userId,
        action: entry.action,
        displayLabel: user?.displayLabel || 'member',
        picture: user?.picture || null,
        at: entry.at ? new Date(entry.at).toISOString() : null,
      };
    });

  const viewerHasConfirmedCurrent = memberConfirmedCurrentProposal(
    weekState?.memberJudgements,
    viewerUserId,
    proposedEventId,
  );
  const locked = LOCKED_JUDGEMENT_STATUSES.has(weekState?.judgementStatus);
  const windowOpen = isJudgementWindowOpen(judgementWindowEndsAt, now);
  const consensusOpen =
    OPEN_CONSENSUS_STATUSES.has(weekState?.judgementStatus) && windowOpen;

  return {
    startedAt,
    endsAt,
    effectiveEndsAt,
    swapsRemaining,
    swapBudget: budget,
    confirms: {
      confirmedCount: countConfirmedOnCurrentProposal(
        weekState?.memberJudgements,
        proposedEventId,
      ),
      activeCount: activeMemberUserIds.length,
      members: confirmedMembers,
    },
    viewerAction: resolveViewerAction(weekState?.memberJudgements, viewerUserId),
    viewerHasConfirmedCurrent,
    canConfirm: Boolean(consensusOpen && !locked && proposedEventId && !viewerHasConfirmedCurrent),
    canSwap: Boolean(
      consensusOpen &&
        !locked &&
        swapsRemaining > 0 &&
        resolveSwapTargetEventId(weekState),
    ),
  };
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

function validateOpenJudgementWindow(weekState, crewConfig, eventsById, now) {
  if (!weekState?.swipeProgress?.quorumMet) {
    return {
      error: 'Crew swipe quorum has not been met yet.',
      status: 400,
      code: 'JUDGEMENT_NOT_READY',
    };
  }

  if (LOCKED_JUDGEMENT_STATUSES.has(weekState.judgementStatus)) {
    return {
      error: 'This crew pick is already locked for the week.',
      status: 409,
      code: 'PICK_ALREADY_LOCKED',
    };
  }

  if (!OPEN_CONSENSUS_STATUSES.has(weekState.judgementStatus)) {
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

async function persistWeekStateUpdate(req, { crewObjectId, batchWeek, $set }) {
  const { PivotCrewWeekState } = getModels(req, 'PivotCrewWeekState');
  const updated = await PivotCrewWeekState.findOneAndUpdate(
    { crewId: crewObjectId, batchWeek },
    { $set },
    { new: true, runValidators: true },
  ).lean();

  await invalidateCrewWeekProgressForCrewMembers(req, {
    crewId: crewObjectId.toString(),
    batchWeek,
  });

  return updated;
}

async function resolveCrewWeekPick(
  req,
  {
    crewObjectId,
    batchWeek,
    weekState,
    eventId,
    now = new Date(),
    lockReason = 'manual',
  },
) {
  const eventObjectId = toObjectId(eventId);
  if (!eventObjectId) {
    return {
      error: 'A valid eventId is required.',
      status: 400,
      code: 'INVALID_EVENT_ID',
    };
  }

  const voteEntry = (weekState.voteBreakdown || []).find(
    (entry) => entry.eventId.toString() === eventObjectId.toString(),
  );
  const judgementStatus = resolveLockedJudgementStatus(
    weekState,
    eventObjectId.toString(),
  );

  const updated = await persistWeekStateUpdate(req, {
    crewObjectId,
    batchWeek,
    $set: {
      proposedEventId: eventObjectId,
      proposedScore: voteEntry?.score ?? weekState.proposedScore,
      judgementStatus,
      aggregatedAt: now,
    },
  });

  return {
    data: updated,
    lockReason,
    judgementStatus,
    eventId: eventObjectId.toString(),
  };
}

async function maybeResolveExpiredConsensus(
  req,
  { crewObjectId, batchWeek, weekState, crewConfig, eventsById, now },
) {
  const judgementWindowEndsAt = resolveJudgementWindowEndsAt(
    weekState,
    eventsById,
    crewConfig,
  );
  if (!isConsensusExpired(weekState, judgementWindowEndsAt, now)) {
    return { weekState, resolved: false };
  }

  const eventId =
    weekState.proposedEventId?.toString?.() ||
    weekState.voteBreakdown?.[0]?.eventId?.toString?.();
  if (!eventId) {
    return { weekState, resolved: false };
  }

  const locked = await resolveCrewWeekPick(req, {
    crewObjectId,
    batchWeek,
    weekState,
    eventId,
    now,
    lockReason: 'timer',
  });
  if (locked.error) {
    return locked;
  }

  return { weekState: locked.data, resolved: true, lockReason: 'timer' };
}

async function buildCrewWeekJudgementPayload(
  req,
  { crew, crewObjectId, batchWeek, now = new Date() },
) {
  const loaded = await ensureCrewWeekState(req, crewObjectId, batchWeek);
  if (loaded.error) {
    return loaded;
  }

  const crewConfig = await resolveCrewConfig(req);
  let weekState = loaded.weekState;
  const eventsById = await loadWeekStateEvents(req, weekState, batchWeek);

  const expired = await maybeResolveExpiredConsensus(req, {
    crewObjectId,
    batchWeek,
    weekState,
    crewConfig,
    eventsById,
    now,
  });
  if (expired.error) {
    return expired;
  }
  weekState = expired.weekState;

  const usersById = await loadJudgementVoteUsers(req, weekState);
  const activeMemberUserIds = await loadActiveMemberUserIds(req, crewObjectId);
  const judgementWindowEndsAt = resolveJudgementWindowEndsAt(
    weekState,
    eventsById,
    crewConfig,
  );

  const voteBreakdown = serializeVoteBreakdown(weekState, eventsById, usersById);
  const proposedEventId = resolveCurrentProposedEventId(weekState, voteBreakdown);
  const runnerUpEventId = resolveSwapTargetEventId(weekState);
  const viewerUserId = req.user?.userId?.toString?.() || req.user?.userId || null;
  const consensus = buildConsensusPayload({
    weekState,
    crewConfig,
    judgementWindowEndsAt,
    activeMemberUserIds,
    usersById,
    viewerUserId,
    now,
  });

  const progressRow = {
    crewId: crew._id.toString(),
    quorumMet: weekState.swipeProgress.quorumMet,
    judgementStatus: weekState.judgementStatus,
    judgementWindowEndsAt,
    viewerHasConfirmedCurrent: consensus.viewerHasConfirmedCurrent,
  };

  return {
    data: {
      batchWeek,
      crewId: crew._id.toString(),
      crewName: crew.name,
      judgementStatus: weekState.judgementStatus,
      quorumMet: weekState.swipeProgress.quorumMet,
      swipedCount: weekState.swipeProgress.swipedCount,
      activeCount: weekState.swipeProgress.activeMemberCount,
      invitedCount: weekState.swipeProgress.invitedCount,
      judgementWindowEndsAt,
      judgementWindowOpen: isJudgementWindowOpen(judgementWindowEndsAt, now),
      needsUserAction: crewNeedsUserAction(progressRow, now),
      topCandidates: getTopCandidateEventIds(weekState),
      proposedEvent: proposedEventId
        ? voteBreakdown.find((entry) => entry.eventId === proposedEventId)?.event || null
        : null,
      runnerUp: runnerUpEventId
        ? voteBreakdown.find((entry) => entry.eventId === runnerUpEventId)?.event || null
        : null,
      voteBreakdown,
      consensus,
      locked: LOCKED_JUDGEMENT_STATUSES.has(weekState.judgementStatus),
    },
  };
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

  return buildCrewWeekJudgementPayload(req, {
    crew: access.crew,
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    now,
  });
}

async function getPivotCrewWeekJudgements(req, { batchWeek, now = new Date() }) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  if (!tenantKey) {
    return { error: 'City tenant is required.', status: 400, code: 'TENANT_REQUIRED' };
  }

  const normalizedWeek = await resolveBatchWeek(req, batchWeek);
  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const progressResult = await getPivotCrewWeekProgress(req, {
    batchWeek: normalizedWeek.batchWeek,
    now,
  });
  if (progressResult.error) {
    return progressResult;
  }

  const crews = progressResult.data?.crews || [];
  const decideQueueOrder = buildDecideQueueOrder(crews, now);
  const judgements = [];

  for (const crewId of decideQueueOrder) {
    const access = await requireActiveCrewMembership(req, crewId);
    if (access.error) {
      return access;
    }

    const payload = await buildCrewWeekJudgementPayload(req, {
      crew: access.crew,
      crewObjectId: access.crewObjectId,
      batchWeek: normalizedWeek.batchWeek,
      now,
    });
    if (payload.error) {
      return payload;
    }
    judgements.push(payload.data);
  }

  return {
    data: {
      batchWeek: normalizedWeek.batchWeek,
      decideQueueOrder,
      judgements,
    },
  };
}

/** Legacy first-writer-wins lock for pre-ritual binaries. */
async function lockCrewWeekPickLegacy(
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

  if (!LEGACY_READY_STATUSES.has(loaded.weekState.judgementStatus)) {
    if (LOCKED_JUDGEMENT_STATUSES.has(loaded.weekState.judgementStatus)) {
      return {
        error: 'This crew pick is already locked for the week.',
        status: 409,
        code: 'PICK_ALREADY_LOCKED',
      };
    }
    if (loaded.weekState.judgementStatus === 'deciding') {
      return {
        error: 'App upgrade required to finish this crew decide.',
        status: 426,
        code: 'APP_UPGRADE_REQUIRED',
      };
    }
    return {
      error: 'No crew pick is ready for judgement yet.',
      status: 400,
      code: 'JUDGEMENT_NOT_READY',
    };
  }

  const crewConfig = await resolveCrewConfig(req);
  const eventsById = await loadWeekStateEvents(req, loaded.weekState, normalizedWeek.batchWeek);
  const validation = validateOpenJudgementWindow(
    loaded.weekState,
    crewConfig,
    eventsById,
    now,
  );
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

  const updated = await persistWeekStateUpdate(req, {
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    $set: {
      proposedEventId: eventObjectId,
      proposedScore: voteEntry?.score ?? loaded.weekState.proposedScore,
      judgementStatus,
      aggregatedAt: now,
    },
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
      locked: true,
    },
  };
}

async function castConfirmConsensus(req, { crewId, eventId, batchWeek, now = new Date() }) {
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
  let weekState = loaded.weekState;
  const eventsById = await loadWeekStateEvents(req, weekState, normalizedWeek.batchWeek);

  const expired = await maybeResolveExpiredConsensus(req, {
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    weekState,
    crewConfig,
    eventsById,
    now,
  });
  if (expired.error) {
    return expired;
  }
  weekState = expired.weekState;

  if (LOCKED_JUDGEMENT_STATUSES.has(weekState.judgementStatus)) {
    return {
      error: 'This crew pick is already locked for the week.',
      status: 409,
      code: 'PICK_ALREADY_LOCKED',
    };
  }

  const validation = validateOpenJudgementWindow(weekState, crewConfig, eventsById, now);
  if (validation.error) {
    return validation;
  }

  const currentProposedId = weekState.proposedEventId?.toString?.();
  if (!currentProposedId || currentProposedId !== eventObjectId.toString()) {
    return {
      error: 'eventId must match the current crew proposal.',
      status: 400,
      code: 'INVALID_CANDIDATE',
    };
  }

  const activeMemberUserIds = await loadActiveMemberUserIds(req, access.crewObjectId);
  let memberJudgements = weekState.memberJudgements || [];
  const alreadyConfirmed = memberConfirmedCurrentProposal(
    memberJudgements,
    access.userId,
    currentProposedId,
  );

  if (!alreadyConfirmed) {
    memberJudgements = upsertMemberJudgement(memberJudgements, {
      userId: access.userId,
      action: 'confirmed',
      eventId: eventObjectId.toString(),
      at: now,
    });
  }

  let consensusStartedAt = weekState.consensusStartedAt;
  let consensusEndsAt = weekState.consensusEndsAt;
  const isFirstAction = !consensusStartedAt;
  if (!consensusStartedAt) {
    const started = startConsensusWindow(
      now,
      crewConfig,
      validation.judgementWindowEndsAt,
    );
    consensusStartedAt = started.consensusStartedAt;
    consensusEndsAt = started.consensusEndsAt;
  }

  const unanimous = isUnanimousOnCurrentProposal({
    activeMemberUserIds,
    memberJudgements,
    proposedEventId: currentProposedId,
  });

  if (unanimous) {
    const locked = await resolveCrewWeekPick(req, {
      crewObjectId: access.crewObjectId,
      batchWeek: normalizedWeek.batchWeek,
      weekState: {
        ...weekState,
        memberJudgements,
        consensusStartedAt,
        consensusEndsAt,
      },
      eventId: currentProposedId,
      now,
      lockReason: 'unanimous',
    });
    if (locked.error) {
      return locked;
    }

    await persistWeekStateUpdate(req, {
      crewObjectId: access.crewObjectId,
      batchWeek: normalizedWeek.batchWeek,
      $set: {
        memberJudgements: memberJudgements.map((entry) => ({
          userId: toObjectId(entry.userId),
          action: entry.action,
          eventId: toObjectId(entry.eventId),
          at: entry.at instanceof Date ? entry.at : new Date(entry.at),
        })),
        consensusStartedAt: new Date(consensusStartedAt),
        consensusEndsAt: consensusEndsAt ? new Date(consensusEndsAt) : null,
      },
    });

    const payload = await buildCrewWeekJudgementPayload(req, {
      crew: access.crew,
      crewObjectId: access.crewObjectId,
      batchWeek: normalizedWeek.batchWeek,
      now,
    });
    if (payload.error) {
      return payload;
    }

    if (isFirstAction) {
      void notifyCrewConsensusPeers(req, {
        crewId: access.crew._id.toString(),
        batchWeek: normalizedWeek.batchWeek,
        actorUserId: access.userId,
        kind: 'decide_started',
      });
    }

    return {
      data: {
        ...payload.data,
        eventId: currentProposedId,
        event: payload.data.proposedEvent,
        locked: true,
        lockReason: 'unanimous',
      },
    };
  }

  const swapBudget = Number(crewConfig?.judgement?.crewSwapBudget);
  const defaultSwapBudget = Number.isInteger(swapBudget) ? swapBudget : 2;
  const crewSwapsRemaining =
    weekState.crewSwapsRemaining == null
      ? defaultSwapBudget
      : Number(weekState.crewSwapsRemaining);

  await persistWeekStateUpdate(req, {
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    $set: {
      judgementStatus: 'deciding',
      memberJudgements: memberJudgements.map((entry) => ({
        userId: toObjectId(entry.userId),
        action: entry.action,
        eventId: toObjectId(entry.eventId),
        at: entry.at instanceof Date ? entry.at : new Date(entry.at),
      })),
      consensusStartedAt: new Date(consensusStartedAt),
      consensusEndsAt: consensusEndsAt ? new Date(consensusEndsAt) : null,
      crewSwapsRemaining,
      originalProposedEventId:
        weekState.originalProposedEventId || weekState.proposedEventId || null,
      aggregatedAt: now,
    },
  });

  if (isFirstAction) {
    void notifyCrewConsensusPeers(req, {
      crewId: access.crew._id.toString(),
      batchWeek: normalizedWeek.batchWeek,
      actorUserId: access.userId,
      kind: 'decide_started',
    });
  }

  const payload = await buildCrewWeekJudgementPayload(req, {
    crew: access.crew,
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    now,
  });
  if (payload.error) {
    return payload;
  }

  return {
    data: {
      ...payload.data,
      eventId: currentProposedId,
      event: payload.data.proposedEvent,
      locked: false,
      lockReason: null,
    },
  };
}

async function castSwapConsensus(req, { crewId, batchWeek, now = new Date() }) {
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
  let weekState = loaded.weekState;
  const eventsById = await loadWeekStateEvents(req, weekState, normalizedWeek.batchWeek);

  const expired = await maybeResolveExpiredConsensus(req, {
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    weekState,
    crewConfig,
    eventsById,
    now,
  });
  if (expired.error) {
    return expired;
  }
  weekState = expired.weekState;

  if (LOCKED_JUDGEMENT_STATUSES.has(weekState.judgementStatus)) {
    return {
      error: 'This crew pick is already locked for the week.',
      status: 409,
      code: 'PICK_ALREADY_LOCKED',
    };
  }

  const validation = validateOpenJudgementWindow(weekState, crewConfig, eventsById, now);
  if (validation.error) {
    return validation;
  }

  const swapBudget = Number(crewConfig?.judgement?.crewSwapBudget);
  const defaultBudget = Number.isInteger(swapBudget) ? swapBudget : 2;
  const swapsRemaining =
    weekState.crewSwapsRemaining == null
      ? defaultBudget
      : Number(weekState.crewSwapsRemaining);

  if (swapsRemaining <= 0) {
    return {
      error: 'This crew has used all shared swaps for the week.',
      status: 409,
      code: 'SWAP_BUDGET_EXHAUSTED',
    };
  }

  const swapEventId = resolveSwapTargetEventId(weekState);
  if (!swapEventId) {
    return {
      error: 'No alternate crew pick is available to swap.',
      status: 400,
      code: 'SWAP_NOT_AVAILABLE',
    };
  }

  const allowedEventIds = getTopCandidateEventIds(weekState);
  if (!allowedEventIds.includes(swapEventId)) {
    return {
      error: 'Swap is only allowed among the top crew candidates.',
      status: 400,
      code: 'INVALID_CANDIDATE',
    };
  }

  const voteEntry = (weekState.voteBreakdown || []).find(
    (entry) => entry.eventId.toString() === swapEventId,
  );
  const timer = extendConsensusWindowOnSwap(
    weekState,
    now,
    crewConfig,
    validation.judgementWindowEndsAt,
  );

  // Implicit confirm for swapper on the new candidate; clear everyone else.
  const memberJudgements = [
    {
      userId: access.userId,
      action: 'swapped',
      eventId: swapEventId,
      at: now,
    },
  ];

  const activeMemberUserIds = await loadActiveMemberUserIds(req, access.crewObjectId);
  const unanimous = isUnanimousOnCurrentProposal({
    activeMemberUserIds,
    memberJudgements,
    proposedEventId: swapEventId,
  });

  if (unanimous) {
    await persistWeekStateUpdate(req, {
      crewObjectId: access.crewObjectId,
      batchWeek: normalizedWeek.batchWeek,
      $set: {
        proposedEventId: toObjectId(swapEventId),
        proposedScore: voteEntry?.score ?? weekState.proposedScore,
        crewSwapsRemaining: swapsRemaining - 1,
        memberJudgements: memberJudgements.map((entry) => ({
          userId: toObjectId(entry.userId),
          action: entry.action,
          eventId: toObjectId(entry.eventId),
          at: entry.at instanceof Date ? entry.at : new Date(entry.at),
        })),
        consensusStartedAt: new Date(timer.consensusStartedAt),
        consensusEndsAt: timer.consensusEndsAt
          ? new Date(timer.consensusEndsAt)
          : null,
        judgementStatus: 'deciding',
        aggregatedAt: now,
      },
    });

    const locked = await resolveCrewWeekPick(req, {
      crewObjectId: access.crewObjectId,
      batchWeek: normalizedWeek.batchWeek,
      weekState: {
        ...weekState,
        proposedEventId: toObjectId(swapEventId),
        originalProposedEventId: weekState.originalProposedEventId,
      },
      eventId: swapEventId,
      now,
      lockReason: 'unanimous',
    });
    if (locked.error) {
      return locked;
    }

    const payload = await buildCrewWeekJudgementPayload(req, {
      crew: access.crew,
      crewObjectId: access.crewObjectId,
      batchWeek: normalizedWeek.batchWeek,
      now,
    });
    if (payload.error) {
      return payload;
    }

    return {
      data: {
        ...payload.data,
        eventId: swapEventId,
        event: payload.data.proposedEvent,
        locked: true,
        lockReason: 'unanimous',
      },
    };
  }

  await persistWeekStateUpdate(req, {
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    $set: {
      proposedEventId: toObjectId(swapEventId),
      proposedScore: voteEntry?.score ?? weekState.proposedScore,
      judgementStatus: 'deciding',
      crewSwapsRemaining: swapsRemaining - 1,
      memberJudgements: memberJudgements.map((entry) => ({
        userId: toObjectId(entry.userId),
        action: entry.action,
        eventId: toObjectId(entry.eventId),
        at: entry.at instanceof Date ? entry.at : new Date(entry.at),
      })),
      consensusStartedAt: new Date(timer.consensusStartedAt),
      consensusEndsAt: timer.consensusEndsAt ? new Date(timer.consensusEndsAt) : null,
      aggregatedAt: now,
    },
  });

  void notifyCrewConsensusPeers(req, {
    crewId: access.crew._id.toString(),
    batchWeek: normalizedWeek.batchWeek,
    actorUserId: access.userId,
    kind: 'decide_swap',
  });

  const payload = await buildCrewWeekJudgementPayload(req, {
    crew: access.crew,
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    now,
  });
  if (payload.error) {
    return payload;
  }

  return {
    data: {
      ...payload.data,
      eventId: swapEventId,
      event: payload.data.proposedEvent,
      locked: false,
      lockReason: null,
    },
  };
}

async function confirmPivotCrewWeekPick(req, { crewId, eventId, batchWeek, now = new Date() }) {
  if (usesDemocraticConsensus(req)) {
    return castConfirmConsensus(req, { crewId, eventId, batchWeek, now });
  }

  return lockCrewWeekPickLegacy(req, {
    crewId,
    eventId,
    batchWeek,
    judgementStatus: 'confirmed',
    now,
  });
}

async function swapPivotCrewWeekPick(req, { crewId, batchWeek, now = new Date() }) {
  if (usesDemocraticConsensus(req)) {
    return castSwapConsensus(req, { crewId, batchWeek, now });
  }

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

  return lockCrewWeekPickLegacy(req, {
    crewId,
    eventId: swapEventId,
    batchWeek: normalizedWeek.batchWeek,
    judgementStatus: 'swapped',
    now,
  });
}

async function resolveExpiredCrewConsensusForTenant(req, { now = new Date() } = {}) {
  const { PivotCrewWeekState } = getModels(req, 'PivotCrewWeekState');
  const crewConfig = await resolveCrewConfig(req);
  const candidates = await PivotCrewWeekState.find({
    tenantKey: req.school,
    judgementStatus: 'deciding',
    consensusEndsAt: { $ne: null, $lte: now },
  }).lean();

  let resolved = 0;
  let failed = 0;

  for (const weekState of candidates) {
    try {
      const eventsById = await loadWeekStateEvents(req, weekState, weekState.batchWeek);
      const result = await maybeResolveExpiredConsensus(req, {
        crewObjectId: weekState.crewId,
        batchWeek: weekState.batchWeek,
        weekState,
        crewConfig,
        eventsById,
        now,
      });
      if (result.error) {
        failed += 1;
      } else if (result.resolved) {
        resolved += 1;
      }
    } catch (error) {
      failed += 1;
      console.error('[pivotCrewJudgement] expiry resolve failed', {
        crewId: weekState.crewId?.toString?.(),
        batchWeek: weekState.batchWeek,
        error: error.message,
      });
    }
  }

  return { data: { resolved, failed, scanned: candidates.length } };
}

async function resolveAllExpiredCrewConsensus(reqLike = {}, options = {}) {
  const pivotTenants = (await getMergedTenants(reqLike)).filter(isPivotTenant);
  const results = [];

  for (const tenant of pivotTenants) {
    try {
      const { db } = await connectToDatabase(tenant.key);
      const tenantReq = { ...reqLike, school: tenant.key, db };
      const result = await resolveExpiredCrewConsensusForTenant(tenantReq, options);
      results.push({ tenantKey: tenant.key, ...result.data });
    } catch (error) {
      results.push({
        tenantKey: tenant.key,
        resolved: 0,
        failed: 1,
        scanned: 0,
        error: error.message,
      });
    }
  }

  return { data: { tenants: results } };
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
    .select('name description location start_time end_time externalLink image customFields.pivot')
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
  buildCrewWeekJudgementPayload,
  getPivotCrewWeekJudgement,
  getPivotCrewWeekJudgements,
  confirmPivotCrewWeekPick,
  swapPivotCrewWeekPick,
  loadLockedCrewPicksForUser,
  resolveExpiredCrewConsensusForTenant,
  resolveAllExpiredCrewConsensus,
  usesDemocraticConsensus,
};
