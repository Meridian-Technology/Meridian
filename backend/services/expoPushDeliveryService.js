const axios = require('axios');
const { connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');

function isAdminLevelAccount(tenantUser, platformRoles = []) {
  const tenantRoles = Array.isArray(tenantUser?.roles) ? tenantUser.roles : [];
  const platform = Array.isArray(platformRoles) ? platformRoles : [];
  const tenantAdmin = tenantRoles.includes('admin') || tenantRoles.includes('root');
  const platformAdmin = platform.includes('platform_admin') || platform.includes('root');
  return tenantAdmin || platformAdmin;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

/**
 * In development, Expo push is restricted to admin-level accounts unless explicitly
 * overridden with EXPO_PUSH_ALLOW_ALL_IN_DEVELOPMENT=true.
 */
function isDevelopmentExpoPushGateEnforced() {
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }
  return process.env.EXPO_PUSH_ALLOW_ALL_IN_DEVELOPMENT !== 'true';
}

function hasTenantAdminPrivileges(tenantUser) {
  const roles = Array.isArray(tenantUser?.roles) ? tenantUser.roles : [];
  return roles.includes('admin') || roles.includes('root');
}

async function bulkPlatformRolesByTenantUserIds(tenantKey, tenantUserIds) {
  if (!tenantKey || !tenantUserIds?.length) {
    return new Map();
  }

  const globalDb = await connectToGlobalDatabase();
  const globalReq = { globalDb };
  const { TenantMembership, PlatformRole } = getGlobalModels(
    globalReq,
    'TenantMembership',
    'PlatformRole',
  );

  const memberships = await TenantMembership.find({
    tenantKey,
    tenantUserId: { $in: tenantUserIds },
    status: 'active',
  })
    .select('tenantUserId globalUserId')
    .lean();

  if (!memberships.length) {
    return new Map();
  }

  const globalUserIds = memberships.map((row) => row.globalUserId);
  const platformRoleRows = await PlatformRole.find({
    globalUserId: { $in: globalUserIds },
  })
    .select('globalUserId roles')
    .lean();

  const rolesByGlobalUserId = new Map(
    platformRoleRows.map((row) => [row.globalUserId.toString(), row.roles || []]),
  );

  const rolesByTenantUserId = new Map();
  for (const membership of memberships) {
    const tenantUserId = membership.tenantUserId.toString();
    const globalUserId = membership.globalUserId.toString();
    rolesByTenantUserId.set(tenantUserId, rolesByGlobalUserId.get(globalUserId) || []);
  }

  return rolesByTenantUserId;
}

async function getPlatformRolesForTenantUserId(tenantKey, tenantUserId) {
  const map = await bulkPlatformRolesByTenantUserIds(tenantKey, [tenantUserId]);
  return map.get(tenantUserId?.toString?.() || String(tenantUserId)) || [];
}

async function resolveTenantKeyForTenantUserId(tenantUserId) {
  if (!tenantUserId) {
    return null;
  }

  const globalDb = await connectToGlobalDatabase();
  const globalReq = { globalDb };
  const { TenantMembership } = getGlobalModels(globalReq, 'TenantMembership');
  const membership = await TenantMembership.findOne({
    tenantUserId,
    status: 'active',
  })
    .select('tenantKey')
    .lean();

  return membership?.tenantKey || null;
}

async function getPlatformRolesForTenantUserDoc(tenantUser) {
  if (!tenantUser?._id) {
    return [];
  }

  const globalDb = await connectToGlobalDatabase();
  const globalReq = { globalDb };
  const { TenantMembership, PlatformRole } = getGlobalModels(
    globalReq,
    'TenantMembership',
    'PlatformRole',
  );

  const membership = await TenantMembership.findOne({
    tenantUserId: tenantUser._id,
    status: 'active',
  })
    .select('globalUserId tenantKey')
    .lean();

  if (!membership) {
    return [];
  }

  const platformRole = await PlatformRole.findOne({ globalUserId: membership.globalUserId })
    .select('roles')
    .lean();
  return platformRole?.roles || [];
}

function isRecipientAllowedInDevelopment(tenantUser, platformRoles = []) {
  return isAdminLevelAccount(tenantUser, platformRoles);
}

/**
 * Filter tenant users who may receive Expo push in the current environment.
 */
async function filterTenantUsersForExpoPushDelivery(tenantKey, users = []) {
  if (!isDevelopmentExpoPushGateEnforced()) {
    return {
      users,
      blockedCount: 0,
      gateActive: false,
    };
  }

  const list = Array.isArray(users) ? users : [];
  const needsPlatformLookup = list.filter((user) => !hasTenantAdminPrivileges(user));
  const platformRolesByTenantUserId = await bulkPlatformRolesByTenantUserIds(
    tenantKey,
    needsPlatformLookup.map((user) => user._id),
  );

  const allowed = list.filter((user) => {
    const platformRoles = hasTenantAdminPrivileges(user)
      ? []
      : platformRolesByTenantUserId.get(user._id.toString()) || [];
    return isRecipientAllowedInDevelopment(user, platformRoles);
  });

  const blockedCount = list.length - allowed.length;
  if (blockedCount > 0) {
    console.warn(
      `[expoPush] development gate blocked ${blockedCount} non-admin recipient(s) for tenant ${tenantKey}`,
    );
  }

  return {
    users: allowed,
    blockedCount,
    gateActive: true,
  };
}

async function isExpoPushAllowedForTenantUser(tenantUser, tenantKey = null) {
  if (!isDevelopmentExpoPushGateEnforced()) {
    return true;
  }
  if (!tenantUser) {
    return false;
  }
  if (hasTenantAdminPrivileges(tenantUser)) {
    return true;
  }
  const platformRoles = tenantKey
    ? await getPlatformRolesForTenantUserId(tenantKey, tenantUser._id)
    : await getPlatformRolesForTenantUserDoc(tenantUser);
  return isRecipientAllowedInDevelopment(tenantUser, platformRoles);
}

function buildBlockedBatchResult(messageCount, reason) {
  const tickets = Array.from({ length: messageCount }, () => ({
    status: 'failed',
    message: reason,
  }));
  return {
    sent: 0,
    failed: messageCount,
    errors: messageCount ? [reason] : [],
    tickets,
    developmentGateBlocked: messageCount,
  };
}

function filterAlignedMessagesAndRecipients(messages, recipients) {
  if (!recipients || recipients.length !== messages.length) {
    return {
      messages: [],
      recipients: [],
      misaligned: true,
    };
  }
  return {
    messages,
    recipients,
    misaligned: false,
  };
}

async function applyDevelopmentGateToBatch(tenantKey, messages, recipients) {
  const aligned = filterAlignedMessagesAndRecipients(messages, recipients);
  if (aligned.misaligned) {
    const reason =
      'Development expo push gate: refused batch without aligned tenant recipient users.';
    console.error(`[expoPush] ${reason}`);
    return buildBlockedBatchResult(messages.length, reason);
  }

  const { users: allowedRecipients } = await filterTenantUsersForExpoPushDelivery(
    tenantKey,
    aligned.recipients,
  );
  const allowedIds = new Set(allowedRecipients.map((user) => user._id.toString()));

  const filteredMessages = [];
  const filteredRecipients = [];
  for (let index = 0; index < aligned.messages.length; index += 1) {
    const recipient = aligned.recipients[index];
    if (allowedIds.has(recipient._id.toString())) {
      filteredMessages.push(aligned.messages[index]);
      filteredRecipients.push(recipient);
    }
  }

  const blocked = aligned.messages.length - filteredMessages.length;
  return {
    messages: filteredMessages,
    recipients: filteredRecipients,
    developmentGateBlocked: blocked,
  };
}

async function postExpoPushBatch(messages, options = {}) {
  const inputMessages = Array.isArray(messages) ? messages : [];
  if (!inputMessages.length) {
    return { sent: 0, failed: 0, errors: [], tickets: [], developmentGateBlocked: 0 };
  }

  let messagesToSend = inputMessages;
  let developmentGateBlocked = 0;

  if (isDevelopmentExpoPushGateEnforced()) {
    let tenantKey = options.tenantKey;
    if (!tenantKey && options.recipients?.[0]?._id) {
      tenantKey = await resolveTenantKeyForTenantUserId(options.recipients[0]._id);
    }
    if (!tenantKey) {
      return buildBlockedBatchResult(
        inputMessages.length,
        'Development expo push gate: missing tenantKey on send.',
      );
    }

    const gated = await applyDevelopmentGateToBatch(
      tenantKey,
      inputMessages,
      options.recipients,
    );
    if (gated.sent === 0 && gated.failed && gated.errors?.length) {
      return gated;
    }
    developmentGateBlocked = gated.developmentGateBlocked || 0;
    messagesToSend = gated.messages || [];
    if (!messagesToSend.length) {
      return {
        sent: 0,
        failed: inputMessages.length,
        errors: [],
        tickets: inputMessages.map(() => ({
          status: 'failed',
          message: 'Blocked by development expo push gate (non-admin recipient).',
        })),
        developmentGateBlocked,
      };
    }
  }

  return postExpoPushBatchUnchecked(messagesToSend, { developmentGateBlocked });
}

async function postExpoPushBatchUnchecked(messages, meta = {}) {
  let response;
  try {
    response = await axios.post(EXPO_PUSH_URL, messages, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
    });
  } catch (error) {
    if (messages.length > 1 && error?.response?.status === 400) {
      const middle = Math.ceil(messages.length / 2);
      const [left, right] = await Promise.all([
        postExpoPushBatchUnchecked(messages.slice(0, middle), meta),
        postExpoPushBatchUnchecked(messages.slice(middle), meta),
      ]);
      return {
        sent: left.sent + right.sent,
        failed: left.failed + right.failed,
        errors: [...left.errors, ...right.errors],
        tickets: [...left.tickets, ...right.tickets],
        developmentGateBlocked:
          (left.developmentGateBlocked || 0) + (right.developmentGateBlocked || 0),
      };
    }

    const expoErrors = error?.response?.data?.errors;
    const messagesFromExpo = Array.isArray(expoErrors)
      ? expoErrors.map((row) => row?.message || row?.code).filter(Boolean)
      : [];
    const fallbackMessage =
      error?.response?.data?.message || error?.message || 'Expo push request failed.';
    const failureMessage = messagesFromExpo[0] || fallbackMessage;
    return {
      sent: 0,
      failed: messages.length,
      errors: messagesFromExpo.length ? messagesFromExpo : [fallbackMessage],
      tickets: messages.map(() => ({
        status: 'failed',
        message: failureMessage,
      })),
      developmentGateBlocked: meta.developmentGateBlocked || 0,
    };
  }

  const tickets = Array.isArray(response.data?.data)
    ? response.data.data
    : [response.data?.data].filter(Boolean);

  let sent = 0;
  let failed = 0;
  const errors = [];
  const ticketOutcomes = [];

  for (let index = 0; index < messages.length; index += 1) {
    const ticket = tickets[index];
    if (ticket?.status === 'ok') {
      sent += 1;
      ticketOutcomes.push({ status: 'accepted', message: null });
    } else {
      failed += 1;
      const message = ticket?.message || 'Expo rejected this push ticket.';
      if (ticket?.message) errors.push(ticket.message);
      ticketOutcomes.push({ status: 'failed', message });
    }
  }

  return {
    sent,
    failed,
    errors,
    tickets: ticketOutcomes,
    developmentGateBlocked: meta.developmentGateBlocked || 0,
  };
}

/**
 * Send aligned recipient/message pairs in Expo batch chunks (with development gate).
 */
async function sendExpoPushToRecipients(tenantKey, recipients, messages) {
  const list = Array.isArray(recipients) ? recipients : [];
  const payload = Array.isArray(messages) ? messages : [];
  if (!list.length || list.length !== payload.length) {
    if (isDevelopmentExpoPushGateEnforced()) {
      return buildBlockedBatchResult(
        payload.length || list.length,
        'Development expo push gate: recipient/message alignment required.',
      );
    }
    return { sent: 0, failed: 0, errors: [], tickets: [], developmentGateBlocked: 0 };
  }

  let sent = 0;
  let failed = 0;
  const errors = [];
  const tickets = [];
  let developmentGateBlocked = 0;

  for (let index = 0; index < payload.length; index += EXPO_BATCH_SIZE) {
    const batchRecipients = list.slice(index, index + EXPO_BATCH_SIZE);
    const batchMessages = payload.slice(index, index + EXPO_BATCH_SIZE);
    const result = await postExpoPushBatch(batchMessages, {
      tenantKey,
      recipients: batchRecipients,
    });
    sent += result.sent;
    failed += result.failed;
    errors.push(...(result.errors || []));
    tickets.push(...(result.tickets || []));
    developmentGateBlocked += result.developmentGateBlocked || 0;
  }

  return { sent, failed, errors, tickets, developmentGateBlocked };
}

module.exports = {
  EXPO_PUSH_URL,
  EXPO_BATCH_SIZE,
  isDevelopmentExpoPushGateEnforced,
  filterTenantUsersForExpoPushDelivery,
  isExpoPushAllowedForTenantUser,
  postExpoPushBatch,
  sendExpoPushToRecipients,
};
