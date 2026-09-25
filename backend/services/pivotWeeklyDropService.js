const mongoose = require('mongoose');
const connectionsManager = require('../connectionsManager');
const getModels = require('./getModelService');
const { getTenantByKey, upsertStoredTenantRow, serializeTenantForAdmin } = require('./tenantConfigService');
const { normalizePivotDropFields, normalizePivotDropOverrides } = require('../constants/defaultTenants');
const { isValidIsoWeek, toIsoWeek } = require('../utilities/pivotIsoWeek');
const { buildDropSchedulePayload } = require('./pivotConfigService');
const { rebuildWeeklySnapshot } = require('./pivotWeeklySnapshotService');
const {
  DAY_NAMES,
  isPivotTenant,
} = require('../utilities/pivotDropSchedule');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');
const {
  countUnfinishedSwipers,
  resolveCrewWeeklyDropBody,
  resolveCrewWeeklyDropVariant,
} = require('../utilities/pivotCrewPushCopy');
const { getMergedCopyPackOrEmpty } = require('./pivotCopyService');
const { mergeWeeklyDropPushCopy } = require('../utilities/meridianJobCopyResolve');
const { computeRitualPhase } = require('../utilities/pivotRitualPhase');
const { buildDecideQueueOrder } = require('../utilities/pivotCrewDecideQueue');
const { buildRitualPushData } = require('../utilities/pivotRitualNudge');
const {
  EXPO_BATCH_SIZE,
  filterTenantUsersForExpoPushDelivery,
  postExpoPushBatch,
} = require('./expoPushDeliveryService');
const { tryPersistWeeklyDropMeridianAudit } = require('./meridianJobWeeklyDropAudit');
const DROP_WINDOW_MS = 30 * 60 * 1000;

const PUSH_TITLE = 'just go*';
const PUSH_BODY = 'What are you doing this week? Just go.';
const PUSH_TITLE_MAX = 100;
const PUSH_BODY_MAX = 240;

function trimPushField(value, maxLength) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function resolveWeeklyDropPushCopy(tenant, batchWeek, options = {}) {
  const override = Array.isArray(tenant?.pivotDropOverrides)
    ? tenant.pivotDropOverrides.find((row) => row?.batchWeek === batchWeek)
    : null;

  return mergeWeeklyDropPushCopy({
    pack: options.copyPack || null,
    sendTitle: options.pushTitle,
    sendBody: options.pushBody,
    overrideTitle: override?.pushTitle,
    overrideBody: override?.pushBody,
    tenantTitle: tenant?.pivotDropPushTitle,
    tenantBody: tenant?.pivotDropPushBody,
  });
}

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

function resolveWeeklyDropPushCopyForRecipient(baseCopy, crewContext = {}, copyPack) {
  const variant = resolveCrewWeeklyDropVariant(crewContext);
  if (!variant) {
    return {
      title: baseCopy.title,
      body: baseCopy.body,
      source: baseCopy.source,
      audience: 'solo',
      crewVariant: null,
      ritualPhase: crewContext.ritualPhase || 'solo',
      decideCrewId: null,
    };
  }

  const crewBody = resolveCrewWeeklyDropBody(variant, copyPack);
  return {
    title: baseCopy.title,
    body: trimPushField(crewBody, PUSH_BODY_MAX) || baseCopy.body,
    source: variant === 'ritual' || variant === 'unfinished' ? 'crew' : 'ritual',
    audience: 'crew',
    crewVariant: variant,
    ritualPhase: crewContext.ritualPhase || null,
    decideCrewId: crewContext.decideCrewId || null,
  };
}

function computeDeckCompleteFromSnapshot(snapshot, swipedEventIds) {
  if (!snapshot?.orderedEventIds?.length) {
    return false;
  }
  return snapshot.orderedEventIds.every((eventId) =>
    swipedEventIds.has(String(eventId)),
  );
}

function countUnfinishedCards(snapshot, swipedEventIds) {
  if (!snapshot?.orderedEventIds?.length) return 0;
  return snapshot.orderedEventIds.filter((eventId) => !swipedEventIds.has(String(eventId))).length;
}

function buildCrewRowsForUser(crewIds, weekStateByCrewId) {
  return Array.from(crewIds)
    .map((crewId) => {
      const weekState = weekStateByCrewId.get(crewId);
      if (!weekState) {
        return null;
      }
      return {
        crewId,
        quorumMet: weekState.swipeProgress?.quorumMet === true,
        judgementStatus: weekState.judgementStatus || 'awaiting_quorum',
        judgementWindowEndsAt: weekState.judgementWindowEndsAt || null,
      };
    })
    .filter(Boolean);
}

async function loadWeeklyDropCrewContext(tenantKey, batchWeek, userIds = []) {
  const normalizedIds = userIds
    .map((userId) => String(userId || '').trim())
    .filter(Boolean);
  const contextByUserId = new Map(
    normalizedIds.map((userId) => [
      userId,
      {
        hasCrew: false,
        userSwiped: false,
        anyCrewUnfinished: false,
        deckComplete: false,
        unfinishedCardCount: 0,
        decideQueueOrder: [],
        decideCrewId: null,
        ritualPhase: 'solo',
      },
    ]),
  );

  if (!normalizedIds.length) {
    return contextByUserId;
  }

  const db = await connectionsManager.connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { PivotCrewMembership, PivotCrewWeekState, PivotEventIntent, PivotDeckSnapshot } = getModels(
    req,
    'PivotCrewMembership',
    'PivotCrewWeekState',
    'PivotEventIntent',
    'PivotDeckSnapshot',
  );

  const objectIds = normalizedIds.map(toObjectId).filter(Boolean);
  const [memberships, swipedUserIds, deckSnapshots] = await Promise.all([
    PivotCrewMembership.find({
      userId: { $in: objectIds },
      status: 'active',
    })
      .select('userId crewId')
      .lean(),
    PivotEventIntent.distinct('userId', {
      batchWeek,
      userId: { $in: objectIds },
    }),
    PivotDeckSnapshot.find({
      userId: { $in: objectIds },
      batchWeek,
    })
      .select('userId orderedEventIds')
      .lean(),
  ]);

  const swipedIntentRows = await PivotEventIntent.find({
    batchWeek,
    userId: { $in: objectIds },
  })
    .select('userId eventId')
    .lean();

  const swipedEventsByUserId = new Map();
  for (const row of swipedIntentRows) {
    const userId = row.userId?.toString?.();
    if (!userId) {
      continue;
    }
    if (!swipedEventsByUserId.has(userId)) {
      swipedEventsByUserId.set(userId, new Set());
    }
    swipedEventsByUserId.get(userId).add(String(row.eventId));
  }

  const snapshotByUserId = new Map(
    deckSnapshots.map((row) => [row.userId.toString(), row]),
  );

  const swipedSet = new Set(
    swipedUserIds.map((userId) => String(userId)).filter(Boolean),
  );
  for (const userId of normalizedIds) {
    const row = contextByUserId.get(userId);
    if (row) {
      row.userSwiped = swipedSet.has(userId);
      const swipedIds = swipedEventsByUserId.get(userId) || new Set();
      const snapshot = snapshotByUserId.get(userId);
      row.deckComplete = computeDeckCompleteFromSnapshot(snapshot, swipedIds);
      row.unfinishedCardCount = countUnfinishedCards(snapshot, swipedIds);
    }
  }

  if (!memberships.length) {
    return contextByUserId;
  }

  const crewIdsByUser = new Map();
  const allCrewIds = new Set();
  for (const membership of memberships) {
    const userId = membership.userId?.toString?.();
    const crewId = membership.crewId?.toString?.();
    if (!userId || !crewId) {
      continue;
    }
    if (!crewIdsByUser.has(userId)) {
      crewIdsByUser.set(userId, new Set());
    }
    crewIdsByUser.get(userId).add(crewId);
    allCrewIds.add(crewId);
    const row = contextByUserId.get(userId);
    if (row) {
      row.hasCrew = true;
    }
  }

  if (!allCrewIds.size) {
    return contextByUserId;
  }

  const weekStates = await PivotCrewWeekState.find({
    tenantKey,
    batchWeek,
    crewId: { $in: Array.from(allCrewIds).map((crewId) => toObjectId(crewId)) },
  })
    .select('crewId swipeProgress judgementStatus')
    .lean();

  const weekStateByCrewId = new Map(
    weekStates.map((row) => [row.crewId?.toString?.(), row]),
  );

  const unfinishedByCrewId = new Map(
    weekStates.map((row) => [
      row.crewId?.toString?.(),
      countUnfinishedSwipers(row.swipeProgress) > 0,
    ]),
  );

  for (const [userId, crewIds] of crewIdsByUser.entries()) {
    const row = contextByUserId.get(userId);
    if (!row) {
      continue;
    }
    row.anyCrewUnfinished = Array.from(crewIds).some((crewId) => {
      if (!unfinishedByCrewId.has(crewId)) {
        return true;
      }
      return unfinishedByCrewId.get(crewId) === true;
    });

    const crewRows = buildCrewRowsForUser(crewIds, weekStateByCrewId);
    row.decideQueueOrder = buildDecideQueueOrder(crewRows, new Date(), {
      requireOpenWindow: false,
    });
    row.decideCrewId = row.decideQueueOrder[0] || null;
    row.ritualPhase = computeRitualPhase({
      hasCrews: row.hasCrew,
      dropPending: false,
      deck: {
        complete: row.deckComplete,
        started: row.userSwiped,
      },
      decideQueueOrder: row.decideQueueOrder,
    });
  }

  return contextByUserId;
}

function summarizePushCopyBreakdown(messages = []) {
  return messages.reduce(
    (acc, message) => {
      const audience = message?.data?.audience || 'solo';
      if (audience === 'crew') {
        const variant = message?.data?.crewVariant;
        if (variant === 'unfinished') {
          acc.crewUnfinished += 1;
        } else if (variant === 'ritual') {
          acc.crewRitual += 1;
        } else if (variant === 'decide') {
          acc.crewDecide += 1;
        } else if (variant === 'recap') {
          acc.crewRecap += 1;
        } else {
          acc.crew += 1;
        }
      } else {
        acc.solo += 1;
      }
      return acc;
    },
    { solo: 0, crewUnfinished: 0, crewRitual: 0, crewDecide: 0, crewRecap: 0, crew: 0 },
  );
}

function buildWeeklyDropPushMessage(pushToken, batchWeek, copy = {}) {
  const title =
    trimPushField(copy.title, PUSH_TITLE_MAX) ||
    trimPushField(copy.pushTitle, PUSH_TITLE_MAX) ||
    PUSH_TITLE;
  const body =
    trimPushField(copy.body, PUSH_BODY_MAX) ||
    trimPushField(copy.pushBody, PUSH_BODY_MAX) ||
    PUSH_BODY;

  const ritualPhase = copy.ritualPhase || (copy.audience === 'solo' ? 'solo' : 'drop_live');
  const ritualNudgeType =
    copy.crewVariant === 'decide'
      ? 'decide'
      : copy.crewVariant === 'recap'
        ? 'recap'
        : copy.crewVariant === 'unfinished'
          ? 'quorum_waiting'
          : copy.crewVariant === 'ritual'
            ? 'swipe'
            : null;

  return {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data: {
      ...buildRitualPushData({
        batchWeek,
        ritualPhase,
        crewId: copy.decideCrewId || null,
        ritualNudgeType,
        pushType: 'pivot_week',
      }),
      audience: copy.audience || 'solo',
      crewVariant: copy.crewVariant || null,
    },
    priority: 'default',
    channelId: 'default',
  };
}

async function countPublishedEvents(tenantKey, batchWeek) {
  const db = await connectionsManager.connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { Event } = getModels(req, 'Event');
  return Event.countDocuments({
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
  });
}

async function loadPivotPushRecipients(tenantKey) {
  const db = await connectionsManager.connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { User } = getModels(req, 'User');
  return User.find({
    pushToken: { $exists: true, $nin: [null, ''] },
    pushAppEdition: 'pivot',
  })
    .select('_id pushToken pushAppProduct pushTokenUpdatedAt username name createdAt roles')
    .lean();
}

async function listWeeklyDropEligibleRecipients(tenantKey) {
  const allRecipients = await loadPivotPushRecipients(tenantKey);
  const filtered = await filterTenantUsersForExpoPushDelivery(tenantKey, allRecipients);
  return filtered.users || [];
}

function summarizePushAudience(users = []) {
  const summary = {
    totalUsers: users.length,
    eligible: 0,
    noToken: 0,
    otherEdition: 0,
    products: { justgo: 0, campus: 0, legacy: 0 },
    users: [],
  };

  for (const user of users) {
    const hasToken = typeof user?.pushToken === 'string' && user.pushToken.trim();
    const eligible = Boolean(hasToken && user.pushAppEdition === 'pivot');
    if (!hasToken) summary.noToken += 1;
    else if (!eligible) summary.otherEdition += 1;
    if (!eligible) continue;

    summary.eligible += 1;
    const product = user.pushAppProduct === 'justgo' || user.pushAppProduct === 'campus'
      ? user.pushAppProduct
      : 'legacy';
    summary.products[product] += 1;
    summary.users.push({
      id: user._id?.toString?.() || String(user._id || ''),
      username: user.username || null,
      name: user.name || null,
      product,
      tokenRegisteredAt: user.pushTokenUpdatedAt || null,
      joinedAt: user.createdAt || null,
    });
  }

  summary.users.sort((a, b) => {
    const aTime = new Date(a.tokenRegisteredAt || a.joinedAt || 0).getTime();
    const bTime = new Date(b.tokenRegisteredAt || b.joinedAt || 0).getTime();
    return bTime - aTime;
  });
  return summary;
}

async function loadPushAudience(tenantKey) {
  const db = await connectionsManager.connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { User } = getModels(req, 'User');
  const users = await User.find({})
    .select('_id username name createdAt pushToken pushAppEdition pushAppProduct pushTokenUpdatedAt')
    .lean();
  return summarizePushAudience(users);
}

async function loadRecentPushRuns(tenantKey, limit = 8) {
  const db = await connectionsManager.connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { PivotDropPushRun } = getModels(req, 'PivotDropPushRun');
  return PivotDropPushRun.find({ tenantKey })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-__v')
    .lean();
}

async function buildWeeklyDropPushMessages(tenant, batchWeek, recipients, options = {}) {
  const baseCopy = resolveWeeklyDropPushCopy(tenant, batchWeek, options);
  const copyPack =
    options.copyPack ||
    (await getMergedCopyPackOrEmpty(options.req, { tenantKey: tenant.tenantKey }));
  const crewContextByUserId = await loadWeeklyDropCrewContext(
    tenant.tenantKey,
    batchWeek,
    recipients.map((recipient) => recipient._id),
  );

  return recipients.map((recipient) => {
    const userId = recipient._id?.toString?.();
    const crewContext = crewContextByUserId.get(userId) || {
      hasCrew: false,
      userSwiped: false,
      anyCrewUnfinished: false,
      deckComplete: false,
      decideQueueOrder: [],
      decideCrewId: null,
      ritualPhase: 'solo',
    };
    const copy = resolveWeeklyDropPushCopyForRecipient(baseCopy, crewContext, copyPack);
    return buildWeeklyDropPushMessage(recipient.pushToken, batchWeek, copy);
  });
}

function validateDropConfigPayload(body = {}) {
  const patch = {};
  normalizePivotDropFields(body, patch);

  const pushTitle = trimPushField(body.pivotDropPushTitle, PUSH_TITLE_MAX);
  if (body.pivotDropPushTitle !== undefined) {
    patch.pivotDropPushTitle = pushTitle || undefined;
  }
  const pushBody = trimPushField(body.pivotDropPushBody, PUSH_BODY_MAX);
  if (body.pivotDropPushBody !== undefined) {
    patch.pivotDropPushBody = pushBody || undefined;
  }

  if (body.pivotDropOverrides !== undefined) {
    const overrides = normalizePivotDropOverrides(body.pivotDropOverrides);
    patch.pivotDropOverrides = overrides || [];
  }

  if (Object.keys(patch).length === 0) {
    return { error: 'No drop schedule fields provided.' };
  }

  if (patch.pivotDropTimezone !== undefined && !patch.pivotDropTimezone) {
    return { error: 'pivotDropTimezone cannot be empty.' };
  }

  return { patch };
}

function serializeDropSchedule(tenant, batchWeek, now = new Date(), options = {}) {
  const dropSchedule = buildDropSchedulePayload(tenant, batchWeek, now);
  const deltaMs = Math.abs(now.getTime() - new Date(dropSchedule.nextDropAt).getTime());
  const pushCopy = resolveWeeklyDropPushCopy(tenant, batchWeek, options);

  return {
    ...dropSchedule,
    minutesFromDropAt: Math.round(deltaMs / 60000),
    withinDropWindow: deltaMs <= DROP_WINDOW_MS,
    pushCopy: {
      title: pushCopy.title,
      body: pushCopy.body,
      source: pushCopy.source,
    },
  };
}

async function getWeeklyDropStatus(req, tenantKey, batchWeekInput) {
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { status: 404, error: 'Tenant not found.' };
  }
  if (!isPivotTenant(tenant)) {
    return { status: 400, error: 'Weekly drop is only available for pivot city tenants.' };
  }

  const batchWeek = batchWeekInput || toIsoWeek();
  if (!isValidIsoWeek(batchWeek)) {
    return { status: 400, error: 'batchWeek must be YYYY-Www.' };
  }

  const [publishedEventCount, audience, recentRuns, copyPack] = await Promise.all([
    countPublishedEvents(tenantKey, batchWeek),
    loadPushAudience(tenantKey),
    loadRecentPushRuns(tenantKey),
    getMergedCopyPackOrEmpty(req, { tenantKey }),
  ]);

  return {
    tenant: serializeTenantForAdmin(tenant),
    dropSchedule: serializeDropSchedule(tenant, batchWeek, new Date(), { copyPack }),
    publishedEventCount,
    pivotPushRecipientCount: audience.eligible,
    audience,
    recentRuns,
    dayNames: DAY_NAMES,
  };
}

async function updateWeeklyDropConfig(req, tenantKey, body, updatedBy) {
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { status: 404, error: 'Tenant not found.' };
  }
  if (!isPivotTenant(tenant)) {
    return { status: 400, error: 'Weekly drop is only available for pivot city tenants.' };
  }

  const validation = validateDropConfigPayload(body);
  if (validation.error) {
    return { status: 400, error: validation.error };
  }

  const saved = await upsertStoredTenantRow(
    req,
    {
      ...tenant,
      ...validation.patch,
    },
    updatedBy
  );

  const batchWeek = isValidIsoWeek(body.batchWeek) ? body.batchWeek.trim() : toIsoWeek();
  return {
    tenant: serializeTenantForAdmin(saved),
    dropSchedule: serializeDropSchedule(saved, batchWeek),
  };
}

function recipientProduct(user) {
  return user?.pushAppProduct === 'justgo' || user?.pushAppProduct === 'campus'
    ? user.pushAppProduct
    : 'legacy';
}

function buildPushRunRecipientRows(recipients, ticketOutcomes = []) {
  const rows = recipients.map((user, index) => {
    const ticket = ticketOutcomes[index];
    const accepted = ticket?.status === 'accepted';
    return {
      userId: user._id?.toString?.() || String(user._id || ''),
      username: user.username || null,
      name: user.name || null,
      product: recipientProduct(user),
      deliveryStatus: accepted ? 'accepted' : 'failed',
      error: accepted ? null : (ticket?.message || null),
    };
  });
  rows.sort((a, b) => {
    if (a.deliveryStatus !== b.deliveryStatus) {
      return a.deliveryStatus === 'failed' ? -1 : 1;
    }
    const aLabel = (a.name || a.username || a.userId).toLowerCase();
    const bLabel = (b.name || b.username || b.userId).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
  return rows;
}

function capPushRunRecipients(rows, maxRecipients) {
  if (!Array.isArray(rows) || rows.length <= maxRecipients) {
    return { recipients: rows || [], recipientOverflowCount: 0 };
  }
  return {
    recipients: rows.slice(0, maxRecipients),
    recipientOverflowCount: rows.length - maxRecipients,
  };
}

async function sendWeeklyDropPush(req, tenantKey, options = {}) {
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { status: 404, error: 'Tenant not found.' };
  }
  if (!isPivotTenant(tenant)) {
    return { status: 400, error: 'Weekly drop is only available for pivot city tenants.' };
  }

  const batchWeek = options.batchWeek || toIsoWeek();
  if (!isValidIsoWeek(batchWeek)) {
    return { status: 400, error: 'batchWeek must be YYYY-Www.' };
  }

  const copyPack = await getMergedCopyPackOrEmpty(req, { tenantKey: tenant.tenantKey });
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const now = options.now ? new Date(options.now) : new Date();
  const { quietHoursSendBlockForDelivery } = require('../utilities/meridianQuietHours');
  if (!dryRun) {
    const quiet = quietHoursSendBlockForDelivery(options, {
      now,
      timeZone: tenant.pivotDropTimezone,
      triggerConfig: options.triggerConfig,
    });
    if (quiet) return quiet;
  }
  const dropSchedule = serializeDropSchedule(tenant, batchWeek, now, { copyPack });
  const pushCopy = resolveWeeklyDropPushCopy(tenant, batchWeek, {
    pushTitle: options.pushTitle,
    pushBody: options.pushBody,
    copyPack,
  });
  const publishedEventCount = await countPublishedEvents(tenantKey, batchWeek);
  const allRecipients = await loadPivotPushRecipients(tenantKey);
  const devPushFilter = await filterTenantUsersForExpoPushDelivery(tenantKey, allRecipients);
  const recipients = devPushFilter.users;
  const allowedIds = new Set(recipients.map((user) => String(user._id)));
  const blockedRecipients = allRecipients.filter((user) => !allowedIds.has(String(user._id)));

  const warnings = [];
  if (devPushFilter.gateActive && devPushFilter.blockedCount > 0) {
    warnings.push(
      `Development expo push gate: only admin-level accounts receive push (${devPushFilter.blockedCount} non-admin recipient(s) excluded).`,
    );
  }
  if (dropSchedule.usingPilotDefaults) {
    warnings.push(
      'Tenant has no stored weekly drop config — using pilot defaults (Thu 18:00 America/New_York).'
    );
  }
  if (publishedEventCount === 0) {
    warnings.push(`No published catalog events for ${batchWeek}. Publish in Pivot Lab first.`);
  }
  if (!force && !dropSchedule.withinDropWindow) {
    warnings.push(
      `Now is ${dropSchedule.minutesFromDropAt} minutes from resolved dropAt. Confirm schedule or use force.`
    );
    if (!dryRun) {
      return {
        status: 409,
        error: 'Outside drop window. Pass force=true to send anyway.',
        code: 'OUTSIDE_DROP_WINDOW',
        data: { dropSchedule, publishedEventCount, pivotPushRecipientCount: recipients.length, warnings },
      };
    }
  }

  const messages = await buildWeeklyDropPushMessages(tenant, batchWeek, recipients, {
    pushTitle: options.pushTitle,
    pushBody: options.pushBody,
    req,
    copyPack,
  });
  const pushCopyBreakdown = summarizePushCopyBreakdown(messages);

  if (dryRun) {
    const audit = await tryPersistWeeklyDropMeridianAudit(req, {
      tenantKey,
      batchWeek,
      dryRun: true,
      force,
      triggeredBy: options.triggeredBy || null,
      meridianJobRunId: options.meridianJobRunId || null,
      pushCopy,
      allowedRecipients: recipients,
      blockedRecipients,
      messages,
      ticketOutcomes: [],
    });
    return {
      dryRun: true,
      dropSchedule,
      pushCopy,
      pushCopyBreakdown,
      publishedEventCount,
      pivotPushRecipientCount: recipients.length,
      warnings,
      sampleMessage: messages[0] || null,
      meridianJobRunId: audit?.meridianJobRunId || null,
      pivotDropPushRunId: null,
      recipientOverflowCount: audit?.recipientOverflowCount || 0,
      skipped: audit?.summary?.skipped || 0,
      summary: audit?.summary || null,
    };
  }

  if (recipients.length === 0) {
    if (blockedRecipients.length) {
      await tryPersistWeeklyDropMeridianAudit(req, {
        tenantKey,
        batchWeek,
        dryRun: false,
        force,
        triggeredBy: options.triggeredBy || null,
        meridianJobRunId: options.meridianJobRunId || null,
        pushCopy,
        allowedRecipients: [],
        blockedRecipients,
        messages: [],
        ticketOutcomes: [],
      });
    }
    return {
      status: 400,
      error: 'No pivot push tokens found for this city.',
      code: 'NO_RECIPIENTS',
      data: { dropSchedule, publishedEventCount, warnings },
    };
  }

  let sent = 0;
  let failed = 0;
  const errors = [];
  const ticketOutcomes = new Array(recipients.length).fill(null);

  const sendUnits = messages.map((message, index) => ({ message, index }));
  const messagesByProduct = new Map();
  sendUnits.forEach((unit) => {
    const product = recipients[unit.index]?.pushAppProduct;
    // Legacy tokens have no product metadata. Keep each isolated until the app
    // next launches and re-registers it with pushAppProduct.
    const key = product === 'campus' || product === 'justgo'
      ? product
      : `legacy-${unit.index}`;
    const group = messagesByProduct.get(key) || [];
    group.push(unit);
    messagesByProduct.set(key, group);
  });

  for (const productUnits of messagesByProduct.values()) {
    for (let index = 0; index < productUnits.length; index += EXPO_BATCH_SIZE) {
      const batchUnits = productUnits.slice(index, index + EXPO_BATCH_SIZE);
      const result = await postExpoPushBatch(batchUnits.map((unit) => unit.message), {
        tenantKey,
        recipients: batchUnits.map((unit) => recipients[unit.index]),
      });
      sent += result.sent;
      failed += result.failed;
      errors.push(...result.errors);
      batchUnits.forEach((unit, offset) => {
        ticketOutcomes[unit.index] = result.tickets[offset] || {
          status: 'failed',
          message: 'No Expo ticket returned for this recipient.',
        };
      });
    }
  }

  const audience = {
    campus: recipients.filter((row) => row.pushAppProduct === 'campus').length,
    justgo: recipients.filter((row) => row.pushAppProduct === 'justgo').length,
    legacy: recipients.filter(
      (row) => row.pushAppProduct !== 'campus' && row.pushAppProduct !== 'justgo',
    ).length,
  };

  const { MAX_RUN_RECIPIENTS } = require('../schemas/pivotDropPushRun');
  const recipientRows = buildPushRunRecipientRows(recipients, ticketOutcomes);
  const cappedRecipients = capPushRunRecipients(recipientRows, MAX_RUN_RECIPIENTS);

  let pivotDropPushRunId = null;
  try {
    const db = await connectionsManager.connectToDatabase(tenantKey);
    const runReq = { db, school: tenantKey };
    const { PivotDropPushRun } = getModels(runReq, 'PivotDropPushRun');
    const pushRun = await PivotDropPushRun.create({
      tenantKey,
      batchWeek,
      title: pushCopy.title,
      body: pushCopy.body,
      attempted: recipients.length,
      accepted: sent,
      failed,
      audience,
      errors: errors.slice(0, 20),
      recipients: cappedRecipients.recipients,
      recipientOverflowCount: cappedRecipients.recipientOverflowCount,
      forced: force,
      triggeredBy: options.triggeredBy || null,
    });
    pivotDropPushRunId = pushRun?._id || null;
  } catch (error) {
    console.error('[pivotWeeklyDrop] failed to persist push run:', error?.message || error);
  }

  const audit = await tryPersistWeeklyDropMeridianAudit(req, {
    tenantKey,
    batchWeek,
    dryRun: false,
    force,
    triggeredBy: options.triggeredBy || null,
    meridianJobRunId: options.meridianJobRunId || null,
    pushCopy,
    allowedRecipients: recipients,
    blockedRecipients,
    messages,
    ticketOutcomes,
    pivotDropPushRunId,
  });

  // Best-effort: freeze this week's metrics right after the drop so Lab trends
  // build themselves; a snapshot failure must never mask a successful send.
  let snapshotRebuilt = false;
  try {
    const rebuild = await rebuildWeeklySnapshot(req, { batchWeek });
    snapshotRebuilt = !rebuild.error;
  } catch (error) {
    console.error(
      `[pivotWeeklyDrop] snapshot rebuild failed after send tenant=${tenantKey} batchWeek=${batchWeek}:`,
      error,
    );
  }

  return {
    dryRun: false,
    dropSchedule,
    pushCopy,
    pushCopyBreakdown,
    publishedEventCount,
    pivotPushRecipientCount: recipients.length,
    sent,
    failed,
    audience,
    snapshotRebuilt,
    warnings,
    errors: errors.slice(0, 5),
    meridianJobRunId: audit?.meridianJobRunId || null,
    pivotDropPushRunId,
    recipientOverflowCount: audit?.recipientOverflowCount
      || cappedRecipients.recipientOverflowCount
      || 0,
    skipped: audit?.summary?.skipped || blockedRecipients.length,
    summary: audit?.summary || null,
  };
}

module.exports = {
  PUSH_TITLE,
  PUSH_BODY,
  PUSH_TITLE_MAX,
  PUSH_BODY_MAX,
  DROP_WINDOW_MS,
  resolveWeeklyDropPushCopy,
  resolveWeeklyDropPushCopyForRecipient,
  loadWeeklyDropCrewContext,
  buildWeeklyDropPushMessages,
  buildWeeklyDropPushMessage,
  buildPushRunRecipientRows,
  capPushRunRecipients,
  getWeeklyDropStatus,
  updateWeeklyDropConfig,
  sendWeeklyDropPush,
  listWeeklyDropEligibleRecipients,
};
