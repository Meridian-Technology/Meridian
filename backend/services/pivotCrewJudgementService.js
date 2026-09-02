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
  OPEN_BALLOT_STATUSES,
} = require('../utilities/pivotCrewDecideQueue');
const {
  LOCKED_JUDGEMENT_STATUSES,
  LEGACY_OPEN_JUDGEMENT_STATUSES,
  isOpenBallotStatus,
  validateRankingAgainstShortlist,
  resolveBordaWinner,
  upsertMemberBallot,
  memberHasBalloted,
  getMemberRanking,
  countBallotsFromActives,
  allActivesHaveBalloted,
  isBallotExpired,
  toIdString,
} = require('../utilities/pivotCrewBorda');
const { PIVOT_EVENT_STATUSES } = require('./pivotFeedService');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');
const { getMergedTenants, getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { connectToDatabase } = require('../connectionsManager');
const { notifyCrewConsensusPeers } = require('./pivotCrewNudgeService');
const {
  resolveEffectiveMaxPickSlots,
  normalizeProposedEventIds,
  syncPrimaryProposedFields,
} = require('../utilities/pivotCrewPickSlots');
const {
  loadRichLocationViewerContext,
} = require('./justGoRichLocationProjectionService');

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function resolveShortlistEventIds(weekState) {
  if (Array.isArray(weekState?.shortlistEventIds) && weekState.shortlistEventIds.length) {
    return weekState.shortlistEventIds.map(toIdString).filter(Boolean);
  }
  return (weekState?.voteBreakdown || [])
    .slice(0, 5)
    .map((entry) => toIdString(entry.eventId))
    .filter(Boolean);
}

function getTopCandidateEventIds(weekState) {
  return resolveShortlistEventIds(weekState);
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
  for (const id of resolveShortlistEventIds(weekState)) {
    eventIds.add(id);
  }
  for (const id of normalizeProposedEventIds(weekState)) {
    eventIds.add(id);
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
    .select('name description location richLocation start_time end_time externalLink image customFields.pivot')
    .lean();

  return new Map(events.map((event) => [event._id.toString(), event]));
}

function resolveJudgementWindowEndsAt(weekState, eventsById, crewConfig) {
  if (!weekState?.swipeProgress?.quorumMet) {
    return null;
  }

  const candidateIds = resolveShortlistEventIds(weekState);
  const candidateStarts = (candidateIds.length
    ? candidateIds
    : (weekState.voteBreakdown || []).map((entry) => entry.eventId.toString())
  )
    .map((eventId) => eventsById.get(eventId)?.start_time?.getTime?.())
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
  for (const entry of weekState?.memberBallots || []) {
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

function serializeVoteBreakdown(
  weekState,
  eventsById,
  usersById,
  richLocationViewerContext,
) {
  return (weekState?.voteBreakdown || []).map((entry) => {
    const eventId = entry.eventId.toString();
    return {
      eventId,
      score: entry.score,
      interestedCount: entry.interestedCount,
      registeredCount: entry.registeredCount,
      event: serializeCrewWeekEvent(
        eventsById.get(eventId),
        entry,
        richLocationViewerContext,
      ),
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

function buildBallotPayload({
  weekState,
  judgementWindowEndsAt,
  activeMemberUserIds,
  usersById,
  viewerUserId,
  now,
  bordaScores = null,
}) {
  const shortlistEventIds = resolveShortlistEventIds(weekState);
  const ballotEndsAt = weekState?.ballotEndsAt
    ? new Date(weekState.ballotEndsAt).toISOString()
    : judgementWindowEndsAt;
  const effectiveEndsAt = (() => {
    const ballotMs = ballotEndsAt ? new Date(ballotEndsAt).getTime() : null;
    const hardMs = judgementWindowEndsAt
      ? new Date(judgementWindowEndsAt).getTime()
      : null;
    if (ballotMs == null && hardMs == null) return null;
    if (ballotMs == null) return judgementWindowEndsAt;
    if (hardMs == null) return ballotEndsAt;
    return new Date(Math.min(ballotMs, hardMs)).toISOString();
  })();

  const ballotedMembers = (weekState?.memberBallots || []).map((entry) => {
    const userId = entry.userId.toString();
    const user = usersById.get(userId);
    return {
      userId,
      ranking: (entry.ranking || []).map(toIdString).filter(Boolean),
      displayLabel: user?.displayLabel || 'member',
      picture: user?.picture || null,
      at: entry.at ? new Date(entry.at).toISOString() : null,
    };
  });

  const viewerHasBalloted = memberHasBalloted(weekState?.memberBallots, viewerUserId);
  const viewerRanking = getMemberRanking(weekState?.memberBallots, viewerUserId);
  const locked = LOCKED_JUDGEMENT_STATUSES.has(weekState?.judgementStatus);
  const endsAtForWindow = effectiveEndsAt || judgementWindowEndsAt;
  // Missing endsAt must not brick an open ballot (events without start_time
  // leave the hard window null; soft ballotEndsAt should usually be set).
  const windowOpen = endsAtForWindow
    ? isJudgementWindowOpen(endsAtForWindow, now)
    : isOpenBallotStatus(weekState?.judgementStatus);
  const ballotingOpen =
    isOpenBallotStatus(weekState?.judgementStatus) && windowOpen;

  return {
    shortlistEventIds,
    endsAt: ballotEndsAt,
    effectiveEndsAt,
    ballotedCount: countBallotsFromActives(
      weekState?.memberBallots,
      activeMemberUserIds,
    ),
    activeCount: activeMemberUserIds.length,
    members: ballotedMembers,
    viewerHasBalloted,
    viewerRanking,
    canBallot: Boolean(ballotingOpen && !locked && shortlistEventIds.length && !viewerHasBalloted),
    scores: bordaScores,
  };
}

/** Legacy consensus-shaped summary for older ritual consumers. */
function buildLegacyConsensusShim(ballot) {
  return {
    startedAt: null,
    endsAt: ballot.endsAt,
    effectiveEndsAt: ballot.effectiveEndsAt,
    swapsRemaining: 0,
    swapBudget: 0,
    confirms: {
      confirmedCount: ballot.ballotedCount,
      activeCount: ballot.activeCount,
      members: ballot.members.map((m) => ({
        userId: m.userId,
        action: 'confirmed',
        displayLabel: m.displayLabel,
        picture: m.picture,
        at: m.at,
      })),
    },
    viewerAction: ballot.viewerHasBalloted ? 'confirmed' : null,
    viewerHasConfirmedCurrent: ballot.viewerHasBalloted,
    canConfirm: false,
    canSwap: false,
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

  // Persist cutover: legacy confirm/swap open rows → Borda balloting.
  if (LEGACY_OPEN_JUDGEMENT_STATUSES.has(weekState.judgementStatus)) {
    const shortlistEventIds = resolveShortlistEventIds(weekState).map(
      (id) => toObjectId(id),
    ).filter(Boolean);
    const $set = {
      judgementStatus: 'balloting',
    };
    if (shortlistEventIds.length && !(weekState.shortlistEventIds || []).length) {
      $set.shortlistEventIds = shortlistEventIds;
    }
    await PivotCrewWeekState.updateOne(
      { _id: weekState._id },
      { $set },
    );
    weekState = {
      ...weekState,
      judgementStatus: 'balloting',
      shortlistEventIds:
        (weekState.shortlistEventIds || []).length > 0
          ? weekState.shortlistEventIds
          : shortlistEventIds,
    };
  }

  return { weekState };
}

function validateOpenBallotWindow(weekState, crewConfig, eventsById, now) {
  if (!weekState?.swipeProgress?.quorumMet) {
    return {
      error: 'Crew swipe quorum has not been met yet.',
      status: 409,
      code: 'QUORUM_NOT_MET',
    };
  }

  if (LOCKED_JUDGEMENT_STATUSES.has(weekState.judgementStatus)) {
    return {
      error: 'Crew pick is already locked.',
      status: 409,
      code: 'ALREADY_LOCKED',
    };
  }

  if (!isOpenBallotStatus(weekState.judgementStatus)) {
    return {
      error: 'Crew is not open for balloting.',
      status: 409,
      code: 'NOT_BALLOTING',
    };
  }

  const judgementWindowEndsAt = resolveJudgementWindowEndsAt(
    weekState,
    eventsById,
    crewConfig,
  );
  const ballotEndsAt = weekState.ballotEndsAt
    ? new Date(weekState.ballotEndsAt).toISOString()
    : judgementWindowEndsAt;
  const effectiveEndsAt = ballotEndsAt || judgementWindowEndsAt;

  if (!isJudgementWindowOpen(effectiveEndsAt, now)) {
    return {
      error: 'Ballot window has closed.',
      status: 409,
      code: 'JUDGEMENT_WINDOW_CLOSED',
    };
  }

  return { judgementWindowEndsAt, ballotEndsAt: effectiveEndsAt };
}

async function persistWeekStateUpdate(req, { crewObjectId, batchWeek, $set }) {
  const { PivotCrewWeekState } = getModels(req, 'PivotCrewWeekState');
  const updated = await PivotCrewWeekState.findOneAndUpdate(
    { crewId: crewObjectId, batchWeek },
    { $set },
    { new: true },
  ).lean();

  await invalidateCrewWeekProgressForCrewMembers(req, {
    crewId: crewObjectId.toString(),
    batchWeek,
  });

  return updated;
}

function buildEventTieBreakComparator(weekState, eventsById) {
  const voteById = new Map(
    (weekState?.voteBreakdown || []).map((entry) => [
      toIdString(entry.eventId),
      entry,
    ]),
  );

  return (aId, bId) => {
    const a = voteById.get(aId);
    const b = voteById.get(bId);
    const aReg = a?.registeredCount || 0;
    const bReg = b?.registeredCount || 0;
    if (bReg !== aReg) return bReg - aReg;

    const aStart = eventsById.get(aId)?.start_time?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
    const bStart = eventsById.get(bId)?.start_time?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  };
}

async function tallyAndLock(
  req,
  {
    crewObjectId,
    batchWeek,
    weekState,
    eventsById,
    crew = null,
    crewConfig = null,
    lockReason = 'unanimous_ballot',
  },
) {
  const shortlistEventIds = resolveShortlistEventIds(weekState);
  if (!shortlistEventIds.length) {
    return {
      error: 'No shortlist to tally.',
      status: 409,
      code: 'SHORTLIST_EMPTY',
    };
  }

  const maxPickSlots = resolveEffectiveMaxPickSlots({
    weekState,
    crew,
    crewConfig,
  });

  const { winnerEventId, winnerEventIds, scores } = resolveBordaWinner({
    ballots: weekState.memberBallots || [],
    shortlistEventIds,
    maxWinners: maxPickSlots,
    compareEvents: buildEventTieBreakComparator(weekState, eventsById),
  });

  if (!winnerEventId) {
    // No ballots cast — fall back to shortlist order (swipe-weighted top N).
    const fallbackIds = shortlistEventIds.slice(0, maxPickSlots);
    const synced = syncPrimaryProposedFields(fallbackIds, fallbackIds);
    const updated = await persistWeekStateUpdate(req, {
      crewObjectId,
      batchWeek,
      $set: {
        proposedEventId: toObjectId(synced.proposedEventId),
        proposedEventIds: synced.proposedEventIds.map(toObjectId).filter(Boolean),
        originalProposedEventId: toObjectId(synced.originalProposedEventId),
        originalProposedEventIds: synced.originalProposedEventIds
          .map(toObjectId)
          .filter(Boolean),
        judgementStatus: 'confirmed',
        proposedScore:
          (weekState.voteBreakdown || []).find(
            (entry) => toIdString(entry.eventId) === fallbackIds[0],
          )?.score ?? null,
      },
    });
    return {
      weekState: updated,
      lockReason: lockReason === 'deadline' ? 'deadline' : 'shortlist_fallback',
      scores,
    };
  }

  const synced = syncPrimaryProposedFields(winnerEventIds, winnerEventIds);
  const updated = await persistWeekStateUpdate(req, {
    crewObjectId,
    batchWeek,
    $set: {
      proposedEventId: toObjectId(synced.proposedEventId),
      proposedEventIds: synced.proposedEventIds.map(toObjectId).filter(Boolean),
      originalProposedEventId: toObjectId(synced.originalProposedEventId),
      originalProposedEventIds: synced.originalProposedEventIds
        .map(toObjectId)
        .filter(Boolean),
      judgementStatus: 'confirmed',
      proposedScore:
        scores.find((row) => row.eventId === winnerEventId)?.score ?? null,
    },
  });

  return { weekState: updated, lockReason, scores };
}

async function maybeResolveExpiredBallot(
  req,
  { crewObjectId, batchWeek, weekState, crewConfig, eventsById, now },
) {
  if (weekState?.judgementStatus !== 'balloting') {
    return { weekState };
  }

  const judgementWindowEndsAt = resolveJudgementWindowEndsAt(
    weekState,
    eventsById,
    crewConfig,
  );
  const expiredByBallot = isBallotExpired(weekState, now);
  const expiredByHard =
    judgementWindowEndsAt && !isJudgementWindowOpen(judgementWindowEndsAt, now);

  if (!expiredByBallot && !expiredByHard) {
    return { weekState };
  }

  const tallied = await tallyAndLock(req, {
    crewObjectId,
    batchWeek,
    weekState,
    eventsById,
    crewConfig,
    lockReason: 'deadline',
  });
  if (tallied.error) {
    return tallied;
  }

  return {
    weekState: tallied.weekState,
    lockReason: tallied.lockReason,
    scores: tallied.scores,
  };
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

  const expired = await maybeResolveExpiredBallot(req, {
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
  const tenant = await getTenantByKey(req, req.school).catch(() => null);
  const richLocationViewerContext = await loadRichLocationViewerContext(
    req,
    [...eventsById.keys()],
    { tenant },
  );
  const judgementWindowEndsAt = resolveJudgementWindowEndsAt(
    weekState,
    eventsById,
    crewConfig,
  );

  const voteBreakdown = serializeVoteBreakdown(
    weekState,
    eventsById,
    usersById,
    richLocationViewerContext,
  );
  const maxPickSlots = resolveEffectiveMaxPickSlots({
    weekState,
    crew,
    crewConfig,
  });
  const shortlistEventIds = resolveShortlistEventIds(weekState);
  const proposedEventIds = normalizeProposedEventIds(weekState, maxPickSlots);
  const proposedEventId =
    proposedEventIds[0] ||
    (weekState.proposedEventId ? weekState.proposedEventId.toString() : null);

  let bordaScores = null;
  if (
    LOCKED_JUDGEMENT_STATUSES.has(weekState.judgementStatus) ||
    (weekState.memberBallots || []).length
  ) {
    bordaScores = resolveBordaWinner({
      ballots: weekState.memberBallots || [],
      shortlistEventIds,
      compareEvents: buildEventTieBreakComparator(weekState, eventsById),
    }).scores;
  }

  const viewerUserId = req.user?.userId?.toString?.() || req.user?.userId || null;
  const ballot = buildBallotPayload({
    weekState,
    judgementWindowEndsAt,
    activeMemberUserIds,
    usersById,
    viewerUserId,
    now,
    bordaScores,
  });
  const consensus = buildLegacyConsensusShim(ballot);

  const eventFromBreakdownOrMap = (eventId) => {
    if (!eventId) return null;
    return (
      voteBreakdown.find((entry) => entry.eventId === eventId)?.event ||
      serializeCrewWeekEvent(eventsById.get(eventId), null, richLocationViewerContext) ||
      null
    );
  };

  const shortlistEvents = shortlistEventIds
    .map((eventId) => eventFromBreakdownOrMap(eventId))
    .filter(Boolean);

  const progressRow = {
    crewId: crew._id.toString(),
    quorumMet: weekState.swipeProgress.quorumMet,
    judgementStatus: weekState.judgementStatus,
    judgementWindowEndsAt: ballot.effectiveEndsAt || judgementWindowEndsAt,
    viewerHasBalloted: ballot.viewerHasBalloted,
    viewerHasConfirmedCurrent: ballot.viewerHasBalloted,
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
      judgementWindowOpen: (() => {
        const endsAt = ballot.effectiveEndsAt || judgementWindowEndsAt;
        if (endsAt) {
          return isJudgementWindowOpen(endsAt, now);
        }
        return isOpenBallotStatus(weekState.judgementStatus);
      })(),
      needsUserAction: crewNeedsUserAction(progressRow, now),
      topCandidates: shortlistEventIds,
      shortlistEventIds,
      shortlistEvents,
      maxPickSlots,
      proposedEvents: proposedEventIds
        .map((eventId) => eventFromBreakdownOrMap(eventId))
        .filter(Boolean),
      proposedEvent: proposedEventId
        ? eventFromBreakdownOrMap(proposedEventId)
        : null,
      runnerUp:
        shortlistEventIds.find((id) => id !== proposedEventId) != null
          ? eventFromBreakdownOrMap(
              shortlistEventIds.find((id) => id !== proposedEventId),
            )
          : null,
      voteBreakdown,
      ballot,
      consensus,
      locked: LOCKED_JUDGEMENT_STATUSES.has(weekState.judgementStatus),
      lockReason: expired.lockReason || null,
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

async function resetPivotCrewWeekPick(req, { crewId, batchWeek, now = new Date() }) {
  const access = await requireActiveCrewMembership(req, crewId);
  if (access.error) {
    return access;
  }

  const normalizedWeek = await resolveBatchWeek(req, batchWeek);
  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const { PivotCrewWeekState } = getModels(req, 'PivotCrewWeekState');
  await PivotCrewWeekState.deleteMany({
    crewId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
  });

  const recomputed = await recomputeCrewWeekState(req, {
    crewId: access.crewObjectId.toString(),
    batchWeek: normalizedWeek.batchWeek,
  });
  if (recomputed.error) {
    return recomputed;
  }

  await invalidateCrewWeekProgressForCrewMembers(req, {
    crewId: access.crewObjectId.toString(),
    batchWeek: normalizedWeek.batchWeek,
  });

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

async function castPivotCrewWeekBallot(
  req,
  { crewId, ranking, batchWeek, now = new Date() },
) {
  const access = await requireActiveCrewMembership(req, crewId);
  if (access.error) {
    return access;
  }

  const normalizedWeek = await resolveBatchWeek(req, batchWeek);
  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const loaded = await ensureCrewWeekState(
    req,
    access.crewObjectId,
    normalizedWeek.batchWeek,
  );
  if (loaded.error) {
    return loaded;
  }

  const crewConfig = await resolveCrewConfig(req);
  let weekState = loaded.weekState;
  const eventsById = await loadWeekStateEvents(
    req,
    weekState,
    normalizedWeek.batchWeek,
  );

  const expired = await maybeResolveExpiredBallot(req, {
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
      error: 'Crew pick is already locked.',
      status: 409,
      code: 'ALREADY_LOCKED',
    };
  }

  const windowCheck = validateOpenBallotWindow(
    weekState,
    crewConfig,
    eventsById,
    now,
  );
  if (windowCheck.error) {
    return windowCheck;
  }

  const shortlistEventIds = resolveShortlistEventIds(weekState);
  const validated = validateRankingAgainstShortlist(ranking, shortlistEventIds);
  if (!validated.ok) {
    return {
      error: validated.message,
      status: 400,
      code: validated.error,
    };
  }

  if (memberHasBalloted(weekState.memberBallots, access.userId)) {
    return {
      error: 'You have already cast a ballot for this crew week.',
      status: 409,
      code: 'BALLOT_ALREADY_CAST',
    };
  }

  const memberBallots = upsertMemberBallot(weekState.memberBallots, {
    userId: toObjectId(access.userId),
    ranking: validated.ranking.map((id) => toObjectId(id)),
    at: now instanceof Date ? now : new Date(now),
  });

  weekState = await persistWeekStateUpdate(req, {
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    $set: { memberBallots },
  });

  const activeMemberUserIds = await loadActiveMemberUserIds(
    req,
    access.crewObjectId,
  );

  if (allActivesHaveBalloted(memberBallots, activeMemberUserIds)) {
    const tallied = await tallyAndLock(req, {
      crewObjectId: access.crewObjectId,
      batchWeek: normalizedWeek.batchWeek,
      weekState,
      eventsById,
      crew: access.crew,
      crewConfig,
      lockReason: 'unanimous_ballot',
    });
    if (tallied.error) {
      return tallied;
    }
    weekState = tallied.weekState;

    void notifyCrewConsensusPeers(req, {
      crewId: access.crewObjectId.toString(),
      actorUserId: access.userId,
      batchWeek: normalizedWeek.batchWeek,
      kind: 'locked',
    }).catch(() => {});
  } else {
    void notifyCrewConsensusPeers(req, {
      crewId: access.crewObjectId.toString(),
      actorUserId: access.userId,
      batchWeek: normalizedWeek.batchWeek,
      kind: 'balloted',
    }).catch(() => {});
  }

  return buildCrewWeekJudgementPayload(req, {
    crew: access.crew,
    crewObjectId: access.crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    now,
  });
}

/** @deprecated confirm/swap removed — use castPivotCrewWeekBallot */
async function confirmPivotCrewWeekPick() {
  return {
    error: 'Confirm is retired. Rank the shortlist via POST …/week/ballot.',
    status: 410,
    code: 'CONFIRM_RETIRED',
  };
}

/** @deprecated confirm/swap removed — use castPivotCrewWeekBallot */
async function swapPivotCrewWeekPick() {
  return {
    error: 'Swap is retired. Rank the shortlist via POST …/week/ballot.',
    status: 410,
    code: 'SWAP_RETIRED',
  };
}

async function resolveExpiredCrewBallotsForTenant(req, { now = new Date() } = {}) {
  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  if (!tenantKey) {
    return { error: 'City tenant is required.', status: 400, code: 'TENANT_REQUIRED' };
  }

  const { PivotCrewWeekState } = getModels(req, 'PivotCrewWeekState');
  const openStates = await PivotCrewWeekState.find({
    tenantKey,
    judgementStatus: 'balloting',
    ballotEndsAt: { $ne: null, $lte: now },
  })
    .select('crewId batchWeek')
    .lean();

  let resolved = 0;
  for (const row of openStates) {
    const accessCrewId = row.crewId.toString();
    const loaded = await ensureCrewWeekState(req, row.crewId, row.batchWeek);
    if (loaded.error || !loaded.weekState) continue;

    const crewConfig = await resolveCrewConfig(req);
    const eventsById = await loadWeekStateEvents(req, loaded.weekState, row.batchWeek);
    const result = await maybeResolveExpiredBallot(req, {
      crewObjectId: row.crewId,
      batchWeek: row.batchWeek,
      weekState: loaded.weekState,
      crewConfig,
      eventsById,
      now,
    });
    if (!result.error && result.lockReason) {
      resolved += 1;
    }
    void accessCrewId;
  }

  return { data: { tenantKey, resolved, scanned: openStates.length } };
}

/** @deprecated alias — scheduler still imports consensus name */
async function resolveExpiredCrewConsensusForTenant(req, options) {
  return resolveExpiredCrewBallotsForTenant(req, options);
}

async function resolveAllExpiredCrewConsensus(reqLike = {}, options = {}) {
  const tenants = await getMergedTenants(reqLike);
  const results = [];

  for (const tenant of tenants) {
    if (!isPivotTenant(tenant)) continue;
    const tenantKey = tenant.tenantKey || tenant.key;
    if (!tenantKey) continue;

    try {
      const connection = await connectToDatabase(tenantKey);
      const tenantReq = { ...reqLike, school: tenantKey, db: connection };
      const result = await resolveExpiredCrewBallotsForTenant(tenantReq, options);
      results.push({
        tenantKey,
        ...(result.error
          ? { error: result.error, code: result.code }
          : result.data),
      });
    } catch (error) {
      results.push({ tenantKey, error: error.message });
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
    .select('name description location richLocation start_time end_time externalLink image customFields.pivot')
    .lean();

  const eventsById = new Map(events.map((event) => [event._id.toString(), event]));
  const crewById = new Map(crews.map((crew) => [crew._id.toString(), crew]));
  const tenant = await getTenantByKey(req, req.school).catch(() => null);
  const richLocationViewerContext = await loadRichLocationViewerContext(
    req,
    eventIds,
    { tenant },
  );

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
        event: serializeCrewWeekEvent(event, voteEntry, richLocationViewerContext),
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
  castPivotCrewWeekBallot,
  confirmPivotCrewWeekPick,
  swapPivotCrewWeekPick,
  resetPivotCrewWeekPick,
  loadLockedCrewPicksForUser,
  resolveExpiredCrewBallotsForTenant,
  resolveExpiredCrewConsensusForTenant,
  resolveAllExpiredCrewConsensus,
  tallyAndLock,
};
