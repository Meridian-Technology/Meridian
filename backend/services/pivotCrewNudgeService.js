const axios = require('axios');
const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { getTenantByKey, getMergedTenants } = require('./tenantConfigService');
const { mergePivotCrewConfig, PIVOT_CREW_CONFIG_DEFAULTS } = require('../utilities/pivotCrewConfig');
const {
  isPivotTenant,
  resolvePivotLiveBatchWeek,
  resolvePivotDropInstant,
} = require('../utilities/pivotDropSchedule');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  buildRitualPushData,
  resolveRitualNudgePushBody,
} = require('../utilities/pivotRitualNudge');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;
const NUDGE_PUSH_TITLE = 'just go*';
const NUDGE_PUSH_BODY_MAX = 240;

function toObjectId(value) {
  if (!value) {
    return null;
  }
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
}

function trimPushBody(value, maxLength = NUDGE_PUSH_BODY_MAX) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.slice(0, maxLength);
}

function countUnfinishedSwipers(swipeProgress = {}) {
  const activeCount = Number(swipeProgress.activeMemberCount) || 0;
  const swipedCount = Number(swipeProgress.swipedCount) || 0;
  return Math.max(0, activeCount - swipedCount);
}

function resolveNudgeEligibleAtMs(tenant, batchWeek, unfinishedSwipeReminderHours, now = new Date()) {
  const drop = resolvePivotDropInstant(tenant, batchWeek, now);
  const hours = Number(unfinishedSwipeReminderHours);
  const reminderHours = Number.isFinite(hours) ? hours : PIVOT_CREW_CONFIG_DEFAULTS.nudges.unfinishedSwipeReminderHours;
  return drop.dropAt.getTime() + reminderHours * 60 * 60 * 1000;
}

function isNudgeWindowOpen(tenant, batchWeek, unfinishedSwipeReminderHours, now = new Date()) {
  try {
    return now.getTime() >= resolveNudgeEligibleAtMs(tenant, batchWeek, unfinishedSwipeReminderHours, now);
  } catch {
    return false;
  }
}

function buildCrewNudgePushBody(remainingCount) {
  return trimPushBody(`${remainingCount} haven't swiped yet — finish the deck`);
}

function buildCrewNudgePushMessage(pushToken, payload = {}) {
  const remainingCount = Math.max(1, Number(payload.remainingCount) || 1);
  const ritualPhase = payload.ritualPhase || 'swiping';
  const ritualNudgeType = payload.ritualNudgeType || 'quorum_waiting';
  const body =
    trimPushBody(payload.body) ||
    resolveRitualNudgePushBody(ritualNudgeType) ||
    buildCrewNudgePushBody(remainingCount);

  return {
    to: pushToken,
    sound: 'default',
    title: NUDGE_PUSH_TITLE,
    body,
    data: buildRitualPushData({
      batchWeek: payload.batchWeek,
      ritualPhase,
      crewId: payload.crewId,
      ritualNudgeType,
      pushType: 'pivot_crew_nudge',
    }),
    priority: 'default',
    channelId: 'default',
  };
}

async function sendExpoBatch(messages) {
  const response = await axios.post(EXPO_PUSH_URL, messages, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
  });

  const tickets = Array.isArray(response.data?.data)
    ? response.data.data
    : [response.data?.data].filter(Boolean);

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const ticket of tickets) {
    if (ticket?.status === 'ok') {
      sent += 1;
    } else {
      failed += 1;
      if (ticket?.message) {
        errors.push(ticket.message);
      }
    }
  }

  return { sent, failed, errors };
}

function isCrewEligibleForNudge(weekState, crewConfig) {
  const swipeProgress = weekState?.swipeProgress;
  if (!swipeProgress || swipeProgress.quorumMet) {
    return false;
  }

  const minActiveMembers = crewConfig?.quorum?.minActiveMembers ?? PIVOT_CREW_CONFIG_DEFAULTS.quorum.minActiveMembers;
  if ((swipeProgress.activeMemberCount || 0) < minActiveMembers) {
    return false;
  }

  return countUnfinishedSwipers(swipeProgress) > 0;
}

async function loadNonSwiperPushRecipients(req, crewId, batchWeek) {
  const crewObjectId = toObjectId(crewId);
  if (!crewObjectId) {
    return [];
  }

  const { PivotCrewMembership, PivotEventIntent, User } = getModels(
    req,
    'PivotCrewMembership',
    'PivotEventIntent',
    'User',
  );

  const memberships = await PivotCrewMembership.find({
    crewId: crewObjectId,
    status: 'active',
    userId: { $ne: null },
  })
    .select('userId')
    .lean();

  const activeUserIds = memberships
    .map((row) => row.userId?.toString?.())
    .filter(Boolean);

  if (!activeUserIds.length) {
    return [];
  }

  const swipedRows = await PivotEventIntent.find({
    batchWeek,
    userId: { $in: activeUserIds.map((id) => toObjectId(id)) },
  })
    .select('userId')
    .lean();

  const swipedUserIds = new Set(
    swipedRows.map((row) => row.userId?.toString?.()).filter(Boolean),
  );

  const recipientIds = activeUserIds.filter((userId) => !swipedUserIds.has(userId));
  if (!recipientIds.length) {
    return [];
  }

  return User.find({
    _id: { $in: recipientIds.map((id) => toObjectId(id)) },
    pushToken: { $exists: true, $nin: [null, ''] },
    pushAppEdition: 'pivot',
  })
    .select('_id pushToken')
    .lean();
}

async function wasCrewNudgeSent(req, crewId, batchWeek) {
  const crewObjectId = toObjectId(crewId);
  if (!crewObjectId) {
    return true;
  }

  const { PivotCrewNudgeSent } = getModels(req, 'PivotCrewNudgeSent');
  const existing = await PivotCrewNudgeSent.findOne({
    crewId: crewObjectId,
    batchWeek,
  })
    .select('_id')
    .lean();

  return Boolean(existing);
}

async function recordCrewNudgeSent(req, { crewId, batchWeek, tenantKey, recipientCount }) {
  const crewObjectId = toObjectId(crewId);
  if (!crewObjectId) {
    return;
  }

  const { PivotCrewNudgeSent } = getModels(req, 'PivotCrewNudgeSent');
  await PivotCrewNudgeSent.create({
    crewId: crewObjectId,
    batchWeek,
    tenantKey,
    recipientCount,
    sentAt: new Date(),
  });
}

async function sendCrewUnfinishedSwipeNudgesForTenant(req, options = {}) {
  const tenantKey = req.school;
  if (!tenantKey) {
    return { error: 'Tenant context required.', status: 400 };
  }

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { error: 'Tenant not found.', status: 404 };
  }
  if (!isPivotTenant(tenant)) {
    return { error: 'Crew nudges are only available for pivot city tenants.', status: 400 };
  }

  const now = options.now || new Date();
  const batchWeek = options.batchWeek || resolvePivotLiveBatchWeek(tenant, now);
  if (!isValidIsoWeek(batchWeek)) {
    return { error: 'batchWeek must be YYYY-Www.', status: 400 };
  }

  const crewConfig = mergePivotCrewConfig(tenant.pivotCrewConfig);
  const reminderHours = crewConfig.nudges.unfinishedSwipeReminderHours;

  if (!isNudgeWindowOpen(tenant, batchWeek, reminderHours, now)) {
    return {
      data: {
        tenantKey,
        batchWeek,
        skipped: 'before_nudge_window',
        sent: 0,
        failed: 0,
        crewsChecked: 0,
      },
    };
  }

  const { PivotCrew, PivotCrewWeekState } = getModels(req, 'PivotCrew', 'PivotCrewWeekState');
  const weekStates = await PivotCrewWeekState.find({
    tenantKey: tenantKey.toLowerCase(),
    batchWeek,
    'swipeProgress.quorumMet': false,
  }).lean();

  const eligibleStates = weekStates.filter((weekState) => isCrewEligibleForNudge(weekState, crewConfig));
  if (!eligibleStates.length) {
    return {
      data: {
        tenantKey,
        batchWeek,
        sent: 0,
        failed: 0,
        crewsChecked: weekStates.length,
        crewsEligible: 0,
      },
    };
  }

  const crewIds = eligibleStates.map((row) => row.crewId);
  const crews = await PivotCrew.find({ _id: { $in: crewIds }, archivedAt: null })
    .select('_id name')
    .lean();
  const crewNameById = new Map(crews.map((crew) => [crew._id.toString(), crew.name]));

  let sent = 0;
  let failed = 0;
  let crewsNudged = 0;
  const errors = [];

  for (const weekState of eligibleStates) {
    const crewId = weekState.crewId.toString();
    if (await wasCrewNudgeSent(req, crewId, batchWeek)) {
      continue;
    }

    const recipients = await loadNonSwiperPushRecipients(req, crewId, batchWeek);
    if (!recipients.length) {
      continue;
    }

    const remainingCount = countUnfinishedSwipers(weekState.swipeProgress);
    const messages = recipients.map((recipient) =>
      buildCrewNudgePushMessage(recipient.pushToken, {
        batchWeek,
        crewId,
        crewName: crewNameById.get(crewId),
        remainingCount,
        ritualPhase: 'swiping',
        ritualNudgeType: 'quorum_waiting',
      }),
    );

    let batchSent = 0;
    let batchFailed = 0;

    for (let index = 0; index < messages.length; index += EXPO_BATCH_SIZE) {
      const batch = messages.slice(index, index + EXPO_BATCH_SIZE);
      const result = await sendExpoBatch(batch);
      batchSent += result.sent;
      batchFailed += result.failed;
      errors.push(...result.errors);
    }

    if (batchSent > 0) {
      await recordCrewNudgeSent(req, {
        crewId,
        batchWeek,
        tenantKey: tenantKey.toLowerCase(),
        recipientCount: batchSent,
      });
      crewsNudged += 1;
    }

    sent += batchSent;
    failed += batchFailed;
  }

  return {
    data: {
      tenantKey,
      batchWeek,
      sent,
      failed,
      crewsChecked: weekStates.length,
      crewsEligible: eligibleStates.length,
      crewsNudged,
      errors: errors.slice(0, 5),
    },
  };
}

async function sendPendingConsensusNudgesForTenant(req, options = {}) {
  const tenantKey = req.school;
  if (!tenantKey) {
    return { error: 'Tenant context required.', status: 400 };
  }

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || !isPivotTenant(tenant)) {
    return { data: { tenantKey, sent: 0, failed: 0, skipped: 'not_pivot' } };
  }

  const now = options.now || new Date();
  const batchWeek = options.batchWeek || resolvePivotLiveBatchWeek(tenant, now);
  const { PivotCrewWeekState, PivotCrewMembership } = getModels(
    req,
    'PivotCrewWeekState',
    'PivotCrewMembership',
  );

  const decidingStates = await PivotCrewWeekState.find({
    tenantKey: tenantKey.toLowerCase(),
    batchWeek,
    judgementStatus: 'deciding',
    consensusStartedAt: { $ne: null },
    consensusEndsAt: { $ne: null },
  }).lean();

  let sent = 0;
  let failed = 0;
  let crewsNudged = 0;

  for (const weekState of decidingStates) {
    const startedMs = new Date(weekState.consensusStartedAt).getTime();
    const endsMs = new Date(weekState.consensusEndsAt).getTime();
    if (Number.isNaN(startedMs) || Number.isNaN(endsMs) || endsMs <= startedMs) {
      continue;
    }
    const midpoint = startedMs + (endsMs - startedMs) / 2;
    if (now.getTime() < midpoint) {
      continue;
    }

    const proposedEventId = weekState.proposedEventId?.toString?.();
    if (!proposedEventId) {
      continue;
    }

    const memberships = await PivotCrewMembership.find({
      crewId: weekState.crewId,
      status: 'active',
      userId: { $ne: null },
    })
      .select('userId')
      .lean();

    const confirmedIds = new Set(
      (weekState.memberJudgements || [])
        .filter((entry) => {
          const eventId = entry.eventId?.toString?.() || entry.eventId;
          return (
            (entry.action === 'confirmed' || entry.action === 'swapped') &&
            eventId === proposedEventId
          );
        })
        .map((entry) => entry.userId?.toString?.())
        .filter(Boolean),
    );

    const pendingUserIds = memberships
      .map((row) => row.userId?.toString?.())
      .filter((userId) => userId && !confirmedIds.has(userId));

    if (!pendingUserIds.length) {
      continue;
    }

    const result = await notifyPendingConsensusConfirms(req, {
      crewId: weekState.crewId.toString(),
      batchWeek,
      pendingUserIds,
    });
    sent += result.data?.sent || 0;
    failed += result.data?.failed || 0;
    if ((result.data?.sent || 0) > 0) {
      crewsNudged += 1;
    }
  }

  return {
    data: {
      tenantKey,
      batchWeek,
      sent,
      failed,
      crewsNudged,
      crewsChecked: decidingStates.length,
    },
  };
}

async function runAllCrewUnfinishedSwipeNudges(globalReq, options = {}) {
  const pivotTenants = (await getMergedTenants(globalReq)).filter(isPivotTenant);
  const results = [];

  for (const tenant of pivotTenants) {
    try {
      const db = await connectToDatabase(tenant.tenantKey);
      const tenantReq = { db, school: tenant.tenantKey, globalDb: globalReq.globalDb };
      const result = await sendCrewUnfinishedSwipeNudgesForTenant(tenantReq, options);
      const pending = await sendPendingConsensusNudgesForTenant(tenantReq, options);
      results.push({
        ...(result.data || { tenantKey: tenant.tenantKey, error: result.error }),
        consensusPending: pending.data || null,
      });
    } catch (error) {
      console.error(`[pivotCrewNudge] send failed tenant=${tenant.tenantKey}:`, error);
      results.push({
        tenantKey: tenant.tenantKey,
        error: error.message,
      });
    }
  }

  return { data: { tenants: results } };
}

async function loadActiveMemberPushRecipients(req, crewId, { excludeUserId } = {}) {
  const crewObjectId = toObjectId(crewId);
  if (!crewObjectId) {
    return [];
  }

  const { PivotCrewMembership, User } = getModels(req, 'PivotCrewMembership', 'User');
  const memberships = await PivotCrewMembership.find({
    crewId: crewObjectId,
    status: 'active',
    userId: { $ne: null },
  })
    .select('userId')
    .lean();

  const recipientIds = memberships
    .map((row) => row.userId?.toString?.())
    .filter((userId) => userId && userId !== excludeUserId);

  if (!recipientIds.length) {
    return [];
  }

  return User.find({
    _id: { $in: recipientIds.map((id) => toObjectId(id)) },
    pushToken: { $exists: true, $nin: [null, ''] },
    pushAppEdition: 'pivot',
  })
    .select('_id pushToken')
    .lean();
}

/**
 * Notify other active members when consensus starts or a shared swap resets confirms.
 */
async function notifyCrewConsensusPeers(
  req,
  {
    crewId,
    batchWeek,
    actorUserId,
    kind = 'decide_started',
  },
) {
  const ritualNudgeType =
    kind === 'swap' || kind === 'decide_swap' ? 'decide_swap' : 'decide_started';

  try {
    const recipients = await loadActiveMemberPushRecipients(req, crewId, {
      excludeUserId: actorUserId?.toString?.() || actorUserId,
    });
    if (!recipients.length) {
      return { data: { sent: 0, failed: 0 } };
    }

    const messages = recipients.map((recipient) =>
      buildCrewNudgePushMessage(recipient.pushToken, {
        batchWeek,
        crewId,
        ritualPhase: 'decide',
        ritualNudgeType,
        body: resolveRitualNudgePushBody(ritualNudgeType),
      }),
    );

    let sent = 0;
    let failed = 0;
    for (let index = 0; index < messages.length; index += EXPO_BATCH_SIZE) {
      const batch = messages.slice(index, index + EXPO_BATCH_SIZE);
      const result = await sendExpoBatch(batch);
      sent += result.sent;
      failed += result.failed;
    }

    return { data: { sent, failed } };
  } catch (error) {
    console.error('[pivotCrewNudge] consensus peer notify failed', {
      crewId,
      batchWeek,
      error: error.message,
    });
    return { data: { sent: 0, failed: 1 } };
  }
}

/**
 * Mid-window reminder for members who have not confirmed the current proposal.
 */
async function notifyPendingConsensusConfirms(
  req,
  {
    crewId,
    batchWeek,
    pendingUserIds = [],
  },
) {
  if (!pendingUserIds.length) {
    return { data: { sent: 0, failed: 0 } };
  }

  try {
    const { User } = getModels(req, 'User');
    const recipients = await User.find({
      _id: { $in: pendingUserIds.map((id) => toObjectId(id)).filter(Boolean) },
      pushToken: { $exists: true, $nin: [null, ''] },
      pushAppEdition: 'pivot',
    })
      .select('_id pushToken')
      .lean();

    if (!recipients.length) {
      return { data: { sent: 0, failed: 0 } };
    }

    const messages = recipients.map((recipient) =>
      buildCrewNudgePushMessage(recipient.pushToken, {
        batchWeek,
        crewId,
        ritualPhase: 'decide',
        ritualNudgeType: 'decide_pending',
        body: resolveRitualNudgePushBody('decide_pending'),
      }),
    );

    let sent = 0;
    let failed = 0;
    for (let index = 0; index < messages.length; index += EXPO_BATCH_SIZE) {
      const batch = messages.slice(index, index + EXPO_BATCH_SIZE);
      const result = await sendExpoBatch(batch);
      sent += result.sent;
      failed += result.failed;
    }

    return { data: { sent, failed } };
  } catch (error) {
    console.error('[pivotCrewNudge] pending confirm notify failed', {
      crewId,
      batchWeek,
      error: error.message,
    });
    return { data: { sent: 0, failed: 1 } };
  }
}

module.exports = {
  NUDGE_PUSH_TITLE,
  buildCrewNudgePushBody,
  buildCrewNudgePushMessage,
  countUnfinishedSwipers,
  resolveNudgeEligibleAtMs,
  isNudgeWindowOpen,
  isCrewEligibleForNudge,
  sendCrewUnfinishedSwipeNudgesForTenant,
  runAllCrewUnfinishedSwipeNudges,
  notifyCrewConsensusPeers,
  notifyPendingConsensusConfirms,
  sendPendingConsensusNudgesForTenant,
};
