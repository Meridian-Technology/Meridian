const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { connectToDatabase } = require('../connectionsManager');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant, resolvePivotLiveBatchWeek } = require('../utilities/pivotDropSchedule');
const { mergePivotCrewConfig, PIVOT_CREW_CONFIG_DEFAULTS } = require('../utilities/pivotCrewConfig');
const { toIsoWeek, isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  PIVOT_CREW_JUDGEMENT_STATUSES,
} = require('../schemas/pivotCrewWeekState');
const {
  resolveDisplayHost,
  PIVOT_EVENT_STATUSES,
} = require('./pivotFeedService');
const { resolvePivotCoverImageUrl } = require('../utilities/pivotMovieMetadata');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');
const {
  computeBallotEndsAt,
  LEGACY_OPEN_JUDGEMENT_STATUSES,
} = require('../utilities/pivotCrewBorda');

const LOCKED_JUDGEMENT_STATUSES = new Set(['confirmed', 'swapped']);
const PRESERVED_JUDGEMENT_STATUSES = new Set([
  'balloting',
  'confirmed',
  // Legacy in-flight / historical rows.
  'proposed',
  'split',
  'deciding',
  'swapped',
]);
/** Peers persisted on voteBreakdown — matches mobile decide dial capacity. */
const PIVOT_CREW_VOTE_BREAKDOWN_LIMIT = 5;
/** Ballot eligibility pool — matches dial capacity (rank still uses top 3 slots). */
const SHORTLIST_LIMIT = PIVOT_CREW_VOTE_BREAKDOWN_LIMIT;
const CREW_WEEK_PROGRESS_CACHE_TTL_MS = 30_000;
const crewWeekProgressCache = new Map();
const invalidatedCrewWeekProgressKeys = new Set();

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function buildCrewWeekProgressCacheKey(tenantKey, userId, batchWeek) {
  return `${tenantKey}:${userId}:${batchWeek}`;
}

function readCrewWeekProgressCache(cacheKey) {
  const entry = crewWeekProgressCache.get(cacheKey);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    crewWeekProgressCache.delete(cacheKey);
    return null;
  }
  return entry.payload;
}

function writeCrewWeekProgressCache(cacheKey, payload) {
  crewWeekProgressCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + CREW_WEEK_PROGRESS_CACHE_TTL_MS,
  });
}

function invalidateCrewWeekProgressCache(tenantKey, userId, batchWeek) {
  if (!tenantKey || !userId || !batchWeek) {
    return;
  }
  const cacheKey = buildCrewWeekProgressCacheKey(tenantKey, userId, batchWeek);
  crewWeekProgressCache.delete(cacheKey);
  invalidatedCrewWeekProgressKeys.add(cacheKey);
}

function clearCrewWeekProgressInvalidation(cacheKey) {
  invalidatedCrewWeekProgressKeys.delete(cacheKey);
}

function wasCrewWeekProgressInvalidated(cacheKey) {
  return invalidatedCrewWeekProgressKeys.has(cacheKey);
}

function computeJudgementWindowEndsAt({
  candidateEventStarts = [],
  quorumMetAt,
  crewConfig = PIVOT_CREW_CONFIG_DEFAULTS,
}) {
  const starts = candidateEventStarts.filter((value) => Number.isFinite(value));
  if (!starts.length) {
    return null;
  }

  const earliestStartMs = Math.min(...starts);
  const { windowHoursBeforeEvent, minHoursAfterDeckComplete } = crewConfig.judgement;
  const eventDeadlineMs =
    earliestStartMs - windowHoursBeforeEvent * 60 * 60 * 1000;

  if (!quorumMetAt) {
    return new Date(eventDeadlineMs).toISOString();
  }

  const quorumMetMs = quorumMetAt instanceof Date ? quorumMetAt.getTime() : new Date(quorumMetAt).getTime();
  if (Number.isNaN(quorumMetMs)) {
    return new Date(eventDeadlineMs).toISOString();
  }

  const minEndMs = quorumMetMs + minHoursAfterDeckComplete * 60 * 60 * 1000;
  return new Date(Math.max(minEndMs, eventDeadlineMs)).toISOString();
}

function serializeCrewWeekEvent(event, voteEntry) {
  if (!event) {
    return null;
  }

  const pivot = event.customFields?.pivot || {};
  const coverImageUrl = resolvePivotCoverImageUrl(event);
  const tags = Array.isArray(pivot.tags) ? pivot.tags.filter(Boolean).slice(0, 4) : [];
  const description =
    typeof event.description === 'string' && event.description.trim()
      ? event.description.trim()
      : typeof pivot.movie?.synopsis === 'string' && pivot.movie.synopsis.trim()
        ? pivot.movie.synopsis.trim()
        : null;

  return {
    id: event._id.toString(),
    name: event.name,
    startTime: event.start_time,
    endTime: event.end_time,
    location: event.location,
    externalLink: event.externalLink || null,
    displayHost: resolveDisplayHost(pivot),
    ...(coverImageUrl ? { coverImageUrl } : {}),
    ...(tags.length ? { tags } : {}),
    ...(description ? { description } : {}),
    score: voteEntry?.score ?? null,
    interestedCount: voteEntry?.interestedCount ?? 0,
    registeredCount: voteEntry?.registeredCount ?? 0,
  };
}

function resolveShortlistEventIds(weekState) {
  if (Array.isArray(weekState?.shortlistEventIds) && weekState.shortlistEventIds.length) {
    return weekState.shortlistEventIds
      .map((id) => id?.toString?.() || String(id))
      .filter(Boolean);
  }

  if (Array.isArray(weekState?.voteBreakdown) && weekState.voteBreakdown.length) {
    return weekState.voteBreakdown
      .slice(0, SHORTLIST_LIMIT)
      .map((entry) => entry.eventId?.toString?.() || String(entry.eventId))
      .filter(Boolean);
  }

  return [];
}

function resolveRunnerUpEventId(weekState) {
  const shortlist = resolveShortlistEventIds(weekState);
  if (shortlist.length >= 2) {
    const proposedId = weekState?.proposedEventId?.toString?.() || null;
    if (proposedId) {
      return shortlist.find((id) => id !== proposedId) || shortlist[1] || null;
    }
    return shortlist[1] || null;
  }

  if (!weekState?.voteBreakdown?.length) {
    return null;
  }

  if (weekState.judgementStatus === 'split') {
    return weekState.voteBreakdown[1]?.eventId?.toString?.() || null;
  }

  const proposedId = weekState.proposedEventId?.toString?.() || null;
  const runnerEntry = weekState.voteBreakdown.find((entry) => {
    const eventId = entry.eventId?.toString?.() || String(entry.eventId);
    return !proposedId || eventId !== proposedId;
  });

  return runnerEntry?.eventId?.toString?.() || null;
}

function resolveProposedEventId(weekState) {
  if (weekState?.proposedEventId) {
    return weekState.proposedEventId.toString();
  }

  if (weekState?.judgementStatus === 'split' && weekState.voteBreakdown?.length) {
    return weekState.voteBreakdown[0].eventId.toString();
  }

  return null;
}

function serializeCrewWeekProgressRow(crew, weekState, eventsById, crewConfig) {
  // Viewer only appears here with an active membership — if week state is not
  // recomputed yet (brand-new solo circle), treat as 1 active so invite-waiting
  // surfaces instead of a zeroed-out row that looks empty/broken.
  const swipeProgress = weekState?.swipeProgress || {
    activeMemberCount: 1,
    swipedCount: 0,
    invitedCount: 0,
    participationRate: 0,
    quorumMet: false,
  };

  const voteBreakdown = weekState?.voteBreakdown || [];
  const voteByEventId = new Map(
    voteBreakdown.map((entry) => [entry.eventId.toString(), entry]),
  );

  const proposedEventId = resolveProposedEventId(weekState);
  const runnerUpEventId = resolveRunnerUpEventId(weekState);

  const candidateEventIds = voteBreakdown.length
    ? voteBreakdown.map((entry) => entry.eventId.toString())
    : [proposedEventId, runnerUpEventId].filter(Boolean);

  const candidateStarts = candidateEventIds
    .map((eventId) => eventsById.get(eventId)?.start_time?.getTime?.())
    .filter((value) => Number.isFinite(value));

  const judgementWindowEndsAt =
    swipeProgress.quorumMet && candidateStarts.length
      ? computeJudgementWindowEndsAt({
          candidateEventStarts: candidateStarts,
          quorumMetAt: weekState?.aggregatedAt,
          crewConfig,
        })
      : null;

  const shortlistEventIds = resolveShortlistEventIds(weekState);
  const memberBallots = weekState?.memberBallots || [];
  const ballotedCount = memberBallots.length;

  return {
    crewId: crew._id.toString(),
    name: crew.name,
    swipedCount: swipeProgress.swipedCount,
    activeCount: swipeProgress.activeMemberCount,
    invitedCount: swipeProgress.invitedCount,
    quorumMet: swipeProgress.quorumMet,
    judgementStatus: weekState?.judgementStatus || 'awaiting_quorum',
    shortlistEventIds,
    proposedEvent: proposedEventId
      ? serializeCrewWeekEvent(eventsById.get(proposedEventId), voteByEventId.get(proposedEventId))
      : null,
    runnerUp: runnerUpEventId
      ? serializeCrewWeekEvent(eventsById.get(runnerUpEventId), voteByEventId.get(runnerUpEventId))
      : null,
    judgementWindowEndsAt,
    ballot: {
      endsAt: weekState?.ballotEndsAt
        ? new Date(weekState.ballotEndsAt).toISOString()
        : judgementWindowEndsAt,
      ballotedCount,
      activeCount: swipeProgress.activeMemberCount,
    },
    // Legacy shape for older ritual consumers during cutover.
    consensus: {
      startedAt: null,
      endsAt: weekState?.ballotEndsAt
        ? new Date(weekState.ballotEndsAt).toISOString()
        : judgementWindowEndsAt,
      swapsRemaining: 0,
      swapBudget: 0,
      confirmedCount: ballotedCount,
      activeCount: swipeProgress.activeMemberCount,
    },
  };
}

async function buildCrewWeekProgressPayload(req, batchWeek) {
  const userId = req.user?.userId;
  const userObjectId = toObjectId(userId);
  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';

  const {
    PivotCrew,
    PivotCrewMembership,
    PivotCrewWeekState,
    Event,
  } = getModels(
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
    return {
      batchWeek,
      crews: [],
    };
  }

  const crewIds = memberships.map((row) => row.crewId);
  const [crews, weekStates, crewConfig] = await Promise.all([
    PivotCrew.find({ _id: { $in: crewIds }, archivedAt: null, tenantKey })
      .select('name')
      .lean(),
    PivotCrewWeekState.find({ crewId: { $in: crewIds }, batchWeek }).lean(),
    resolveCrewConfig(req),
  ]);

  const weekStateByCrewId = new Map(
    weekStates.map((row) => [row.crewId.toString(), row]),
  );

  const eventIds = new Set();
  for (const weekState of weekStates) {
    if (weekState.proposedEventId) {
      eventIds.add(weekState.proposedEventId.toString());
    }
    for (const entry of weekState.voteBreakdown || []) {
      eventIds.add(entry.eventId.toString());
    }
  }

  const events = eventIds.size
    ? await Event.find({
        _id: { $in: [...eventIds].map((id) => toObjectId(id)) },
        'customFields.pivot.batchWeek': batchWeek,
        'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
        status: { $in: PIVOT_EVENT_STATUSES },
        isDeleted: { $ne: true },
      })
        .select('name description location start_time end_time externalLink image customFields.pivot')
        .lean()
    : [];

  const eventsById = new Map(events.map((event) => [event._id.toString(), event]));
  const crewById = new Map(crews.map((crew) => [crew._id.toString(), crew]));

  const crewsPayload = memberships
    .map((membership) => {
      const crewId = membership.crewId.toString();
      const crew = crewById.get(crewId);
      if (!crew) {
        return null;
      }
      return serializeCrewWeekProgressRow(
        crew,
        weekStateByCrewId.get(crewId),
        eventsById,
        crewConfig,
      );
    })
    .filter(Boolean);

  return {
    batchWeek,
    crews: crewsPayload,
  };
}

async function getPivotCrewWeekProgress(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  if (!tenantKey) {
    return { error: 'City tenant is required.', status: 400, code: 'TENANT_REQUIRED' };
  }

  const normalizedWeek = await resolveBatchWeek(req, options.batchWeek);
  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const cacheKey = buildCrewWeekProgressCacheKey(
    tenantKey,
    userId,
    normalizedWeek.batchWeek,
  );
  const invalidated = wasCrewWeekProgressInvalidated(cacheKey);

  if (!invalidated) {
    const cached = readCrewWeekProgressCache(cacheKey);
    if (cached) {
      return { data: cached, cacheHit: true };
    }
  }

  if (invalidated) {
    await recomputeCrewWeekStatesForUser(req, {
      userId,
      batchWeek: normalizedWeek.batchWeek,
    });
    clearCrewWeekProgressInvalidation(cacheKey);
  } else {
    const { PivotCrewMembership, PivotCrewWeekState } = getModels(
      req,
      'PivotCrewMembership',
      'PivotCrewWeekState',
    );
    const memberships = await PivotCrewMembership.find({
      userId: toObjectId(userId),
      status: 'active',
    })
      .select('crewId')
      .lean();

    if (memberships.length) {
      const existingStates = await PivotCrewWeekState.countDocuments({
        crewId: { $in: memberships.map((row) => row.crewId) },
        batchWeek: normalizedWeek.batchWeek,
      });
      if (existingStates < memberships.length) {
        await recomputeCrewWeekStatesForUser(req, {
          userId,
          batchWeek: normalizedWeek.batchWeek,
        });
      }
    }
  }

  const payload = await buildCrewWeekProgressPayload(req, normalizedWeek.batchWeek);
  writeCrewWeekProgressCache(cacheKey, payload);

  return { data: payload, cacheHit: false };
}

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function getQuorumEligibleMembers(memberships) {
  return memberships.filter((row) => row.status === 'active' && row.userId != null);
}

function computeSwipeProgress(activeMembers, swipedUserIds, invitedCount, quorumConfig) {
  const activeMemberCount = activeMembers.length;
  const swipedCount = activeMembers.filter((row) =>
    swipedUserIds.has(row.userId.toString()),
  ).length;
  const participationRate =
    activeMemberCount > 0 ? swipedCount / activeMemberCount : 0;
  const quorumMet =
    activeMemberCount >= quorumConfig.minActiveMembers &&
    participationRate >= quorumConfig.minSwipeParticipation;

  return {
    activeMemberCount,
    swipedCount,
    invitedCount,
    participationRate,
    quorumMet,
  };
}

function buildEventScores(intents, activeMemberUserIds, pickConfig) {
  const scoresByEventId = new Map();

  for (const intent of intents) {
    const userId = intent.userId?.toString?.() || String(intent.userId);
    if (!activeMemberUserIds.has(userId)) {
      continue;
    }
    if (intent.status !== 'interested' && intent.status !== 'registered') {
      continue;
    }

    const eventId = intent.eventId?.toString?.() || String(intent.eventId);
    const current = scoresByEventId.get(eventId) || {
      eventId,
      interestedCount: 0,
      registeredCount: 0,
      score: 0,
      memberVotes: [],
    };

    if (intent.status === 'interested') {
      current.interestedCount += 1;
      current.score += pickConfig.interestedWeight;
    } else {
      current.registeredCount += 1;
      current.score += pickConfig.registeredWeight;
    }

    current.memberVotes.push({
      userId,
      status: intent.status,
    });
    scoresByEventId.set(eventId, current);
  }

  return Array.from(scoresByEventId.values());
}

function sortCandidates(candidates, tieBreak, eventStartById) {
  return [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (tieBreak === 'most_registered_then_earliest_start') {
      if (right.registeredCount !== left.registeredCount) {
        return right.registeredCount - left.registeredCount;
      }

      const leftStart = eventStartById.get(left.eventId);
      const rightStart = eventStartById.get(right.eventId);
      const leftValue =
        leftStart == null ? Number.MAX_SAFE_INTEGER : Number(leftStart);
      const rightValue =
        rightStart == null ? Number.MAX_SAFE_INTEGER : Number(rightStart);
      return leftValue - rightValue;
    }

    return 0;
  });
}

function serializeVoteBreakdown(entries = []) {
  return entries.map((entry) => ({
    eventId: entry.eventId,
    score: entry.score,
    interestedCount: entry.interestedCount,
    registeredCount: entry.registeredCount,
    memberVotes: entry.memberVotes.map((vote) => ({
      userId: vote.userId,
      status: vote.status,
    })),
  }));
}

function emptyBallotAggregation(swipeProgress) {
  return {
    swipeProgress,
    proposedEventId: null,
    proposedEventIds: [],
    originalProposedEventId: null,
    originalProposedEventIds: [],
    shortlistEventIds: [],
    proposedScore: null,
    voteBreakdown: [],
    judgementStatus: 'awaiting_quorum',
    ballotEndsAt: null,
    memberBallots: [],
    consensusStartedAt: null,
    consensusEndsAt: null,
    crewSwapsRemaining: null,
    memberJudgements: [],
  };
}

/**
 * Pure aggregation for unit tests and recompute path.
 * Quorum → balloting + live shortlist; single candidate → confirmed.
 * Shortlist freezes once the first ranking ballot is in (see buildLockedPick).
 */
function aggregateCrewWeekState({
  memberships,
  intents,
  eventStartById = new Map(),
  crewConfig = PIVOT_CREW_CONFIG_DEFAULTS,
  lockedPick = null,
  now = new Date(),
}) {
  const quorumConfig = crewConfig.quorum;
  const pickConfig = crewConfig.pick;
  const invitedCount = memberships.filter((row) => row.status === 'invited').length;
  const activeMembers = getQuorumEligibleMembers(memberships);
  const activeMemberUserIds = new Set(
    activeMembers.map((row) => row.userId.toString()),
  );

  const swipedUserIds = new Set();
  for (const intent of intents) {
    const userId = intent.userId?.toString?.() || String(intent.userId);
    if (activeMemberUserIds.has(userId)) {
      swipedUserIds.add(userId);
    }
  }

  const swipeProgress = computeSwipeProgress(
    activeMembers,
    swipedUserIds,
    invitedCount,
    quorumConfig,
  );

  if (lockedPick) {
    return {
      swipeProgress,
      proposedEventId: lockedPick.proposedEventId,
      proposedEventIds: lockedPick.proposedEventIds,
      originalProposedEventId:
        lockedPick.originalProposedEventId || lockedPick.proposedEventId,
      originalProposedEventIds: lockedPick.originalProposedEventIds,
      shortlistEventIds: lockedPick.shortlistEventIds || [],
      maxPickSlots: lockedPick.maxPickSlots,
      proposedScore: lockedPick.proposedScore,
      voteBreakdown: lockedPick.voteBreakdown,
      judgementStatus: lockedPick.judgementStatus,
      ballotEndsAt: lockedPick.ballotEndsAt || null,
      memberBallots: lockedPick.memberBallots || [],
      consensusStartedAt: lockedPick.consensusStartedAt || null,
      consensusEndsAt: lockedPick.consensusEndsAt || null,
      crewSwapsRemaining:
        lockedPick.crewSwapsRemaining == null
          ? null
          : lockedPick.crewSwapsRemaining,
      memberJudgements: lockedPick.memberJudgements || [],
    };
  }

  if (!swipeProgress.quorumMet) {
    return emptyBallotAggregation(swipeProgress);
  }

  const candidates = buildEventScores(intents, activeMemberUserIds, pickConfig);
  const sorted = sortCandidates(candidates, pickConfig.tieBreak, eventStartById);
  const voteBreakdown = serializeVoteBreakdown(
    sorted.slice(0, PIVOT_CREW_VOTE_BREAKDOWN_LIMIT),
  );

  if (sorted.length === 0) {
    return emptyBallotAggregation(swipeProgress);
  }

  const shortlistEventIds = sorted
    .slice(0, SHORTLIST_LIMIT)
    .map((entry) => entry.eventId);

  const candidateStarts = shortlistEventIds
    .map((eventId) => {
      const start = eventStartById.get(eventId);
      return start == null ? null : Number(start);
    })
    .filter((value) => Number.isFinite(value));

  const hardWindowEndsAt = computeJudgementWindowEndsAt({
    candidateEventStarts: candidateStarts,
    quorumMetAt: now,
    crewConfig,
  });
  const ballotEndsAt = computeBallotEndsAt({
    quorumMetAt: now,
    hardWindowEndsAt,
    ballotWindowMinutes: crewConfig?.judgement?.ballotWindowMinutes,
    now,
  });

  // Single candidate: skip ballot and lock immediately.
  if (shortlistEventIds.length === 1) {
    const winnerId = shortlistEventIds[0];
    return {
      swipeProgress,
      proposedEventId: winnerId,
      proposedEventIds: [winnerId],
      originalProposedEventId: winnerId,
      originalProposedEventIds: [winnerId],
      shortlistEventIds,
      proposedScore: sorted[0].score,
      voteBreakdown,
      judgementStatus: 'confirmed',
      ballotEndsAt: null,
      memberBallots: [],
      consensusStartedAt: null,
      consensusEndsAt: null,
      crewSwapsRemaining: null,
      memberJudgements: [],
    };
  }

  return {
    swipeProgress,
    proposedEventId: null,
    proposedEventIds: [],
    originalProposedEventId: null,
    originalProposedEventIds: [],
    shortlistEventIds,
    proposedScore: null,
    voteBreakdown,
    judgementStatus: 'balloting',
    ballotEndsAt: ballotEndsAt ? ballotEndsAt.toISOString() : null,
    memberBallots: [],
    consensusStartedAt: null,
    consensusEndsAt: null,
    crewSwapsRemaining: null,
    memberJudgements: [],
  };
}

function normalizeBatchWeek(raw, now = new Date()) {
  const batchWeek = raw?.trim() || toIsoWeek(now);
  if (!isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }
  return { batchWeek };
}

async function resolveCrewConfig(req) {
  const tenantKey = req.school;
  if (!tenantKey) {
    return PIVOT_CREW_CONFIG_DEFAULTS;
  }

  try {
    const tenant = await getTenantByKey(req, tenantKey);
    return mergePivotCrewConfig(tenant?.pivotCrewConfig);
  } catch (error) {
    console.warn('[pivotCrewWeekState] crew config fallback to defaults', {
      tenantKey,
      error: error.message,
    });
    return PIVOT_CREW_CONFIG_DEFAULTS;
  }
}

async function resolveBatchWeek(req, batchWeek) {
  if (batchWeek?.trim()) {
    return normalizeBatchWeek(batchWeek);
  }

  if (req.school) {
    try {
      const tenant = await getTenantByKey(req, req.school);
      if (tenant) {
        return { batchWeek: resolvePivotLiveBatchWeek(tenant, new Date()) };
      }
    } catch (error) {
      console.warn('[pivotCrewWeekState] live batch week fallback', {
        tenantKey: req.school,
        error: error.message,
      });
    }
  }

  return { batchWeek: toIsoWeek(new Date()) };
}

function serializeStoredVoteBreakdown(voteBreakdown = []) {
  return voteBreakdown.map((entry) => ({
    eventId: entry.eventId?.toString?.() || String(entry.eventId),
    score: entry.score,
    interestedCount: entry.interestedCount,
    registeredCount: entry.registeredCount,
    memberVotes: (entry.memberVotes || []).map((vote) => ({
      userId: vote.userId?.toString?.() || String(vote.userId),
      status: vote.status,
    })),
  }));
}

function isOpenBallotingStatus(status) {
  return (
    status === 'balloting' || LEGACY_OPEN_JUDGEMENT_STATUSES.has(status)
  );
}

function hasSubmittedRankings(existing) {
  if (!existing) {
    return false;
  }
  if (Array.isArray(existing.memberBallots) && existing.memberBallots.length > 0) {
    return true;
  }
  // Legacy confirm/swap rows — treat as already in-flight judgement.
  return (
    Array.isArray(existing.memberJudgements) &&
    existing.memberJudgements.length > 0
  );
}

/**
 * Freeze shortlist + ballots once judgement is underway.
 * Open balloting with zero rankings stays unlocked so late swipes can still
 * reshape the dial pool; the first submitted ranking freezes it.
 */
function buildLockedPick(existing) {
  if (!existing || !PRESERVED_JUDGEMENT_STATUSES.has(existing.judgementStatus)) {
    return null;
  }

  if (
    isOpenBallotingStatus(existing.judgementStatus) &&
    !hasSubmittedRankings(existing)
  ) {
    return null;
  }

  const proposedEventId =
    existing.proposedEventId?.toString?.() || existing.proposedEventId || null;
  const proposedEventIds = Array.isArray(existing.proposedEventIds)
    ? existing.proposedEventIds
        .map((id) => id?.toString?.() || String(id))
        .filter(Boolean)
    : proposedEventId
      ? [proposedEventId]
      : [];
  const originalProposedEventId =
    existing.originalProposedEventId?.toString?.() ||
    existing.originalProposedEventId ||
    proposedEventId ||
    null;
  const originalProposedEventIds = Array.isArray(existing.originalProposedEventIds)
    ? existing.originalProposedEventIds
        .map((id) => id?.toString?.() || String(id))
        .filter(Boolean)
    : originalProposedEventId
      ? [originalProposedEventId]
      : [];
  const shortlistEventIds = Array.isArray(existing.shortlistEventIds)
    ? existing.shortlistEventIds
        .map((id) => id?.toString?.() || String(id))
        .filter(Boolean)
    : resolveShortlistEventIds(existing);

  // Cutover: freeze legacy confirm/swap rows into Borda balloting.
  const judgementStatus = LEGACY_OPEN_JUDGEMENT_STATUSES.has(
    existing.judgementStatus,
  )
    ? 'balloting'
    : existing.judgementStatus;

  return {
    proposedEventId,
    proposedEventIds,
    originalProposedEventId,
    originalProposedEventIds,
    shortlistEventIds,
    maxPickSlots:
      existing.maxPickSlots == null ? null : Number(existing.maxPickSlots),
    proposedScore: existing.proposedScore,
    voteBreakdown: serializeStoredVoteBreakdown(existing.voteBreakdown),
    judgementStatus,
    ballotEndsAt: existing.ballotEndsAt || null,
    memberBallots: (existing.memberBallots || []).map((entry) => ({
      userId: entry.userId?.toString?.() || String(entry.userId),
      ranking: (entry.ranking || []).map(
        (id) => id?.toString?.() || String(id),
      ),
      at: entry.at,
    })),
    consensusStartedAt: existing.consensusStartedAt || null,
    consensusEndsAt: existing.consensusEndsAt || null,
    crewSwapsRemaining:
      existing.crewSwapsRemaining == null ? null : existing.crewSwapsRemaining,
    memberJudgements: (existing.memberJudgements || []).map((entry) => ({
      userId: entry.userId?.toString?.() || String(entry.userId),
      action: entry.action,
      eventId: entry.eventId?.toString?.() || String(entry.eventId),
      at: entry.at,
    })),
  };
}

/**
 * While the shortlist is still open (balloting, no rankings yet), keep the
 * original ballot window so late-swipe recomputes don't reset the timer.
 */
function carryOpenBallotWindow(aggregation, existing) {
  if (
    !existing ||
    !aggregation ||
    aggregation.judgementStatus !== 'balloting' ||
    hasSubmittedRankings(existing) ||
    !isOpenBallotingStatus(existing.judgementStatus) ||
    !existing.ballotEndsAt
  ) {
    return aggregation;
  }

  const ballotEndsAt =
    existing.ballotEndsAt instanceof Date
      ? existing.ballotEndsAt.toISOString()
      : existing.ballotEndsAt;

  return {
    ...aggregation,
    ballotEndsAt,
  };
}

function toStoredWeekState(
  aggregation,
  { crewId, batchWeek, tenantKey, aggregatedAt, crewConfig, crew = null },
) {
  const proposedEventId = aggregation.proposedEventId
    ? toObjectId(aggregation.proposedEventId)
    : null;
  const originalProposedEventId = aggregation.originalProposedEventId
    ? toObjectId(aggregation.originalProposedEventId)
    : proposedEventId;

  const proposedEventIdsRaw = Array.isArray(aggregation.proposedEventIds)
    ? aggregation.proposedEventIds
    : proposedEventId
      ? [aggregation.proposedEventId]
      : [];
  const proposedEventIds = proposedEventIdsRaw
    .map((id) => toObjectId(id))
    .filter(Boolean);
  const originalProposedEventIdsRaw = Array.isArray(
    aggregation.originalProposedEventIds,
  )
    ? aggregation.originalProposedEventIds
    : originalProposedEventId
      ? [aggregation.originalProposedEventId || aggregation.proposedEventId]
      : [];
  const originalProposedEventIds = originalProposedEventIdsRaw
    .map((id) => toObjectId(id))
    .filter(Boolean);

  const configMaxPickSlots = Number(crewConfig?.judgement?.maxPickSlots);
  const crewMaxPickSlots = Number(crew?.maxPickSlots);
  const inheritedMax = Number.isInteger(crewMaxPickSlots)
    ? Math.max(1, Math.min(2, crewMaxPickSlots))
    : Number.isInteger(configMaxPickSlots)
      ? Math.max(1, Math.min(2, configMaxPickSlots))
      : 1;
  const maxPickSlots =
    aggregation.maxPickSlots != null
      ? Math.max(1, Math.min(2, Number(aggregation.maxPickSlots)))
      : inheritedMax;

  const shortlistEventIdsRaw = Array.isArray(aggregation.shortlistEventIds)
    ? aggregation.shortlistEventIds
    : [];
  const shortlistEventIds = shortlistEventIdsRaw
    .map((id) => toObjectId(id))
    .filter(Boolean);

  return {
    crewId,
    batchWeek,
    tenantKey,
    swipeProgress: aggregation.swipeProgress,
    proposedEventId,
    proposedEventIds,
    originalProposedEventId,
    originalProposedEventIds,
    shortlistEventIds,
    maxPickSlots,
    proposedScore: aggregation.proposedScore,
    voteBreakdown: aggregation.voteBreakdown.map((entry) => ({
      eventId: toObjectId(entry.eventId),
      score: entry.score,
      interestedCount: entry.interestedCount,
      registeredCount: entry.registeredCount,
      memberVotes: entry.memberVotes.map((vote) => ({
        userId: toObjectId(vote.userId),
        status: vote.status,
      })),
    })),
    judgementStatus: aggregation.judgementStatus,
    ballotEndsAt: aggregation.ballotEndsAt
      ? new Date(aggregation.ballotEndsAt)
      : null,
    memberBallots: (aggregation.memberBallots || []).map((entry) => ({
      userId: toObjectId(entry.userId),
      ranking: (entry.ranking || []).map((id) => toObjectId(id)).filter(Boolean),
      at: entry.at instanceof Date ? entry.at : new Date(entry.at),
    })),
    consensusStartedAt: aggregation.consensusStartedAt
      ? new Date(aggregation.consensusStartedAt)
      : null,
    consensusEndsAt: aggregation.consensusEndsAt
      ? new Date(aggregation.consensusEndsAt)
      : null,
    crewSwapsRemaining:
      aggregation.crewSwapsRemaining == null
        ? null
        : Number(aggregation.crewSwapsRemaining),
    memberJudgements: (aggregation.memberJudgements || []).map((entry) => ({
      userId: toObjectId(entry.userId),
      action: entry.action,
      eventId: toObjectId(entry.eventId),
      at: entry.at instanceof Date ? entry.at : new Date(entry.at),
    })),
    aggregatedAt,
  };
}

async function recomputeCrewWeekState(req, { crewId, batchWeek }) {
  const crewObjectId = toObjectId(crewId);
  if (!crewObjectId) {
    return { error: 'Invalid crewId.', status: 400, code: 'INVALID_CREW_ID' };
  }

  const normalizedWeek = await resolveBatchWeek(req, batchWeek);
  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  if (!tenantKey) {
    return { error: 'City tenant is required.', status: 400, code: 'TENANT_REQUIRED' };
  }

  const {
    PivotCrew,
    PivotCrewMembership,
    PivotEventIntent,
    PivotCrewWeekState,
    Event,
  } = getModels(
    req,
    'PivotCrew',
    'PivotCrewMembership',
    'PivotEventIntent',
    'PivotCrewWeekState',
    'Event',
  );

  const crew = await PivotCrew.findOne({ _id: crewObjectId, archivedAt: null }).lean();
  if (!crew) {
    return { error: 'Crew not found.', status: 404, code: 'NOT_FOUND' };
  }

  const memberships = await PivotCrewMembership.find({
    crewId: crewObjectId,
    status: { $in: ['active', 'invited'] },
  }).lean();

  const activeMembers = getQuorumEligibleMembers(memberships);
  const activeUserIds = activeMembers.map((row) => row.userId);

  const intents = activeUserIds.length
    ? await PivotEventIntent.find({
        batchWeek: normalizedWeek.batchWeek,
        userId: { $in: activeUserIds },
      }).lean()
    : [];

  const positiveEventIds = [
    ...new Set(
      intents
        .filter((row) => row.status === 'interested' || row.status === 'registered')
        .map((row) => row.eventId.toString()),
    ),
  ].map((id) => toObjectId(id));

  const events = positiveEventIds.length
    ? await Event.find({ _id: { $in: positiveEventIds } })
        .select('start_time')
        .lean()
    : [];

  const eventStartById = new Map(
    events.map((event) => [event._id.toString(), event.start_time?.getTime?.() ?? null]),
  );

  const [crewConfig, existing] = await Promise.all([
    resolveCrewConfig(req),
    PivotCrewWeekState.findOne({
      crewId: crewObjectId,
      batchWeek: normalizedWeek.batchWeek,
    }).lean(),
  ]);

  const aggregatedAt = new Date();
  const aggregation = carryOpenBallotWindow(
    aggregateCrewWeekState({
      memberships,
      intents,
      eventStartById,
      crewConfig,
      lockedPick: buildLockedPick(existing),
    }),
    existing,
  );

  const stored = toStoredWeekState(aggregation, {
    crewId: crewObjectId,
    batchWeek: normalizedWeek.batchWeek,
    tenantKey,
    aggregatedAt,
    crewConfig,
    crew,
  });

  const doc = await PivotCrewWeekState.findOneAndUpdate(
    { crewId: crewObjectId, batchWeek: normalizedWeek.batchWeek },
    { $set: stored },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return { data: doc };
}

async function recomputeCrewWeekStatesForUser(req, { userId, batchWeek }) {
  const userObjectId = toObjectId(userId);
  if (!userObjectId) {
    return;
  }

  const { PivotCrewMembership } = getModels(req, 'PivotCrewMembership');
  const memberships = await PivotCrewMembership.find({
    userId: userObjectId,
    status: 'active',
  })
    .select('crewId')
    .lean();

  await Promise.all(
    memberships.map((row) =>
      recomputeCrewWeekState(req, {
        crewId: row.crewId.toString(),
        batchWeek,
      }),
    ),
  );
}

async function invalidateCrewWeekProgressForCrewMembers(req, { crewId, batchWeek }) {
  const crewObjectId = toObjectId(crewId);
  if (!crewObjectId || !batchWeek) {
    return;
  }

  const { PivotCrewMembership } = getModels(req, 'PivotCrewMembership');
  const members = await PivotCrewMembership.find({
    crewId: crewObjectId,
    status: 'active',
    userId: { $ne: null },
  })
    .select('userId')
    .lean();

  for (const member of members) {
    invalidateCrewWeekProgressCache(req.school, member.userId.toString(), batchWeek);
  }
}

async function invalidateCrewWeekProgressForUserCrews(req, { userId, batchWeek }) {
  const userObjectId = toObjectId(userId);
  if (!userObjectId || !batchWeek) {
    return;
  }

  const { PivotCrewMembership } = getModels(req, 'PivotCrewMembership');
  const memberships = await PivotCrewMembership.find({
    userId: userObjectId,
    status: 'active',
  })
    .select('crewId')
    .lean();

  await Promise.all(
    memberships.map((row) =>
      invalidateCrewWeekProgressForCrewMembers(req, {
        crewId: row.crewId.toString(),
        batchWeek,
      }),
    ),
  );
}

function scheduleCrewWeekRecompute(req, { userId, batchWeek }) {
  return invalidateCrewWeekProgressForUserCrews(req, { userId, batchWeek })
    .then(() => recomputeCrewWeekStatesForUser(req, { userId, batchWeek }))
    .catch((error) => {
    console.error('[pivotCrewWeekState] recompute after membership/swipe failed', {
      tenantKey: req.school,
      userId,
      batchWeek,
      error,
    });
  });
}

function scheduleCrewWeekRecomputeForCrew(req, { crewId, batchWeek }) {
  return invalidateCrewWeekProgressForCrewMembers(req, { crewId, batchWeek })
    .then(() => recomputeCrewWeekState(req, { crewId, batchWeek }))
    .catch((error) => {
    console.error('[pivotCrewWeekState] recompute for crew failed', {
      tenantKey: req.school,
      crewId,
      batchWeek,
      error,
    });
  });
}

async function rebuildTenantCrewWeekStates(req, options = {}) {
  const normalizedWeek = await resolveBatchWeek(req, options.batchWeek);
  if (normalizedWeek.error) {
    return normalizedWeek;
  }

  const { PivotCrew } = getModels(req, 'PivotCrew');
  const crews = await PivotCrew.find({ archivedAt: null }).select('_id').lean();
  const aggregatedAt = options.now || new Date();
  let recomputed = 0;
  let failed = 0;

  for (const crew of crews) {
    try {
      await recomputeCrewWeekState(req, {
        crewId: crew._id.toString(),
        batchWeek: normalizedWeek.batchWeek,
      });
      recomputed += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[pivotCrewWeekState] tenant rebuild failed crew=${crew._id} batchWeek=${normalizedWeek.batchWeek}:`,
        error,
      );
    }
  }

  return {
    data: {
      tenantKey: req.school,
      batchWeek: normalizedWeek.batchWeek,
      crewCount: crews.length,
      recomputed,
      failed,
      aggregatedAt,
    },
  };
}

async function rebuildAllPivotCrewWeekStates(req, options = {}) {
  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const results = [];

  for (const tenant of pivotTenants) {
    try {
      const db = await connectToDatabase(tenant.tenantKey);
      const tenantReq = { db, school: tenant.tenantKey, globalDb: req.globalDb };
      const result = await rebuildTenantCrewWeekStates(tenantReq, options);
      if (result.error) {
        results.push({
          tenantKey: tenant.tenantKey,
          error: result.error,
        });
        continue;
      }
      results.push(result.data);
    } catch (error) {
      console.error(
        `[pivotCrewWeekState] rebuild failed tenant=${tenant.tenantKey}:`,
        error,
      );
      results.push({
        tenantKey: tenant.tenantKey,
        error: error.message,
      });
    }
  }

  return { data: { tenants: results } };
}

function resetCrewWeekProgressCacheForTests() {
  crewWeekProgressCache.clear();
  invalidatedCrewWeekProgressKeys.clear();
}

module.exports = {
  PIVOT_CREW_JUDGEMENT_STATUSES,
  CREW_WEEK_PROGRESS_CACHE_TTL_MS,
  aggregateCrewWeekState,
  buildLockedPick,
  computeJudgementWindowEndsAt,
  serializeCrewWeekEvent,
  serializeCrewWeekProgressRow,
  getPivotCrewWeekProgress,
  invalidateCrewWeekProgressCache,
  invalidateCrewWeekProgressForCrewMembers,
  invalidateCrewWeekProgressForUserCrews,
  resolveBatchWeek,
  resolveCrewConfig,
  recomputeCrewWeekState,
  recomputeCrewWeekStatesForUser,
  scheduleCrewWeekRecompute,
  scheduleCrewWeekRecomputeForCrew,
  rebuildTenantCrewWeekStates,
  rebuildAllPivotCrewWeekStates,
  resetCrewWeekProgressCacheForTests,
};
