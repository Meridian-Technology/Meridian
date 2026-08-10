const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { buildDropSchedulePayload } = require('./pivotConfigService');
const { getPivotCrewWeekProgress } = require('./pivotCrewWeekStateService');
const {
  isJudgementWindowOpen,
  buildDecideQueueOrder,
  crewNeedsUserAction,
} = require('../utilities/pivotCrewDecideQueue');
const { loadCrewMemberSwipeMaps } = require('./pivotCrewRitualEnrichment');
const { getWeekRecap } = require('./pivotIntentService');
const { computeRitualPhase } = require('../utilities/pivotRitualPhase');
const { buildRitualNudge } = require('../utilities/pivotRitualNudge');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  isPivotTenant,
  resolvePivotDropPendingForCalendarWeek,
  resolvePivotLiveBatchWeek,
} = require('../utilities/pivotDropSchedule');

const RITUAL_PHASES = Object.freeze([
  'solo',
  'pre_drop',
  'drop_live',
  'swiping',
  'decide',
  'recap',
]);

const RITUAL_MIN_APP_VERSION = String(
  process.env.PIVOT_RITUAL_MIN_APP_VERSION || '2.0.0',
).trim();

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function toObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function serializeRitualCrew(crewRow, members = [], now = new Date()) {
  return {
    crewId: crewRow.crewId,
    name: crewRow.name,
    swipeProgress: {
      swiped: crewRow.swipedCount,
      active: crewRow.activeCount,
      quorumMet: crewRow.quorumMet,
      members,
    },
    judgement: {
      status: crewRow.judgementStatus,
      proposed: crewRow.proposedEvent,
      runnerUp: crewRow.runnerUp,
      shortlistEventIds: crewRow.shortlistEventIds || [],
      needsUserAction: crewNeedsUserAction(crewRow, now),
      judgementWindowEndsAt: crewRow.judgementWindowEndsAt,
      judgementWindowOpen: isJudgementWindowOpen(
        crewRow.ballot?.endsAt || crewRow.judgementWindowEndsAt,
        now,
      ),
      ballot: crewRow.ballot || null,
      consensus: crewRow.consensus || null,
    },
  };
}

function resolveDeckHoldUntil(crews, decideQueueOrder, now = new Date()) {
  if (!decideQueueOrder.length) {
    return null;
  }

  const decideCrewIds = new Set(decideQueueOrder);
  const endsAtValues = crews
    .filter((crew) => decideCrewIds.has(crew.crewId))
    .map((crew) => crew.judgementWindowEndsAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));

  if (!endsAtValues.length) {
    return null;
  }

  return new Date(Math.min(...endsAtValues)).toISOString();
}

function buildRitualActions(phase, deck = null) {
  const deckIncomplete = deck != null && deck.complete === false;
  return {
    // Late swipers keep the deck after peers hit quorum (phase flips to decide).
    openDeck:
      phase === 'solo' ||
      phase === 'drop_live' ||
      phase === 'swiping' ||
      (phase === 'decide' && deckIncomplete),
    openDecide: phase === 'decide',
    openRecap: phase === 'recap',
  };
}

function buildRitualRecap(recapData) {
  if (!recapData) {
    return undefined;
  }

  return {
    crewOutcomes: recapData.crewPicks || [],
    personal: recapData.events || [],
  };
}

async function computeDeckState(req, batchWeek) {
  const userId = req.user?.userId;
  const userObjectId = toObjectId(userId);
  if (!userObjectId) {
    return {
      remaining: null,
      complete: false,
      holdUntil: null,
      started: false,
      total: 0,
    };
  }

  const { PivotDeckSnapshot, PivotEventIntent } = getModels(
    req,
    'PivotDeckSnapshot',
    'PivotEventIntent',
  );

  const snapshot = await PivotDeckSnapshot.findOne({
    userId: userObjectId,
    batchWeek,
  })
    .select('orderedEventIds')
    .lean();

  if (!snapshot?.orderedEventIds?.length) {
    return {
      remaining: null,
      complete: false,
      holdUntil: null,
      started: false,
      total: 0,
    };
  }

  const orderedEventIds = snapshot.orderedEventIds.map((id) => String(id));
  const intents = await PivotEventIntent.find({
    userId,
    batchWeek,
    eventId: { $in: orderedEventIds.map((id) => toObjectId(id)) },
  })
    .select('eventId')
    .lean();

  const swipedEventIds = new Set(intents.map((row) => String(row.eventId)));
  const total = orderedEventIds.length;
  const swipedCount = orderedEventIds.filter((eventId) => swipedEventIds.has(eventId)).length;
  const remaining = Math.max(0, total - swipedCount);

  return {
    remaining,
    complete: total > 0 && remaining === 0,
    holdUntil: null,
    started: swipedCount > 0,
    total,
  };
}

async function getPivotWeekRitual(req, options = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
  if (!tenantKey) {
    return { error: 'City tenant is required.', status: 400, code: 'TENANT_REQUIRED' };
  }

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { error: 'Tenant not found.', status: 404 };
  }
  if (!isPivotTenant(tenant)) {
    console.warn('[pivot] GET /pivot/week-ritual non-pivot tenant', {
      tenantKey: tenant.tenantKey,
      tenantType: tenant.tenantType,
      pivotPilot: tenant.pivotPilot === true,
      reqSchool: tenantKey,
      xTenant: req.headers?.['x-tenant'] || null,
      host: req.headers?.host || null,
    });
    return {
      error: 'Week ritual is only available for pivot city tenants.',
      status: 400,
    };
  }

  const now = options.now || new Date();
  const batchWeek = options.batchWeek?.trim() || resolvePivotLiveBatchWeek(tenant, now);
  if (options.batchWeek && !isValidIsoWeek(batchWeek)) {
    return {
      error: 'batchWeek must be ISO format YYYY-Www.',
      status: 400,
      code: 'INVALID_BATCH_WEEK',
    };
  }

  const [crewWeekResult, deckState] = await Promise.all([
    getPivotCrewWeekProgress(req, { batchWeek, now }),
    computeDeckState(req, batchWeek),
  ]);

  if (crewWeekResult.error) {
    return crewWeekResult;
  }

  const crewWeekRows = crewWeekResult.data?.crews || [];
  const hasCrews = crewWeekRows.length > 0;
  const dropPending = resolvePivotDropPendingForCalendarWeek(tenant, now);
  const decideQueueOrder = buildDecideQueueOrder(crewWeekRows, now);
  const phase = computeRitualPhase({
    hasCrews,
    dropPending,
    deck: deckState,
    decideQueueOrder,
  });

  const crewIds = crewWeekRows.map((crew) => crew.crewId);
  const membersByCrewId = await loadCrewMemberSwipeMaps(req, crewIds, batchWeek);
  const crews = crewWeekRows.map((crew) =>
    serializeRitualCrew(crew, membersByCrewId.get(crew.crewId) || [], now),
  );
  const deck = {
    remaining: deckState.remaining,
    complete: deckState.complete,
    holdUntil: resolveDeckHoldUntil(crewWeekRows, decideQueueOrder, now),
  };

  let recap;
  if (phase === 'recap') {
    const recapResult = await getWeekRecap(req, { batchWeek, now });
    if (recapResult.error) {
      return recapResult;
    }
    recap = buildRitualRecap(recapResult.data);
  }

  const nudge = buildRitualNudge({
    phase,
    decideQueueOrder,
    deck,
    crews,
  });

  return {
    data: {
      batchWeek,
      phase,
      drop: buildDropSchedulePayload(tenant, batchWeek, now),
      deck,
      crews,
      decideQueueOrder,
      recap,
      nudge,
      actions: buildRitualActions(phase, deck),
    },
  };
}

module.exports = {
  RITUAL_PHASES,
  RITUAL_MIN_APP_VERSION,
  computeRitualPhase,
  serializeRitualCrew,
  buildRitualActions,
  buildRitualRecap,
  computeDeckState,
  getPivotWeekRitual,
};
