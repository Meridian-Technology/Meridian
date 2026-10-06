const crypto = require('crypto');
const mongoose = require('mongoose');
const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');
const NotificationService = require('./notificationService');
const { getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { justGoPublicUrl } = require('../utilities/justGoPublicUrl');
const { areUsersBlocked } = require('./pivotSafetyService');

/**
 * Personal invite links: every Just Go user can share `justgo.lol/invite/{code}`.
 * The link never expires or caps out. Opening it shows who invited you and
 * which city; accepting it makes you friends with the inviter.
 *
 * This replaces sharing admin cohort codes (`PivotReferralCode`) from the app.
 * Cohort codes still exist for campaigns, but no person needs one to invite.
 */

// No 0/o, 1/i/l — codes are read aloud and retyped.
const INVITE_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const INVITE_CODE_LENGTH = 8;
const INVITE_CODE_PATTERN = /^[a-z0-9]{6,16}$/;
const MAX_CODE_ATTEMPTS = 5;

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function toObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

function normalizeTenantKey(req) {
  return typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
}

function normalizeInviteCode(raw) {
  const code = String(raw || '').trim().toLowerCase();
  return INVITE_CODE_PATTERN.test(code) ? code : '';
}

function generateInviteCode() {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_CODE_ALPHABET[crypto.randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

/** First name only: the preview is public to anyone holding the link. */
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function serializeCity(tenant) {
  return {
    tenantKey: tenant.tenantKey,
    subdomain: tenant.subdomain || tenant.tenantKey,
    cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
  };
}

function isOpenPivotCity(tenant) {
  return Boolean(tenant) && isPivotTenant(tenant) && tenant.status === 'active';
}

function serializeInviter(invite) {
  return {
    name: invite.inviterName || null,
    picture: invite.inviterPicture || null,
  };
}

function buildPivotUserInviteLinks(code, req) {
  return {
    webLink: justGoPublicUrl(`/invite/${encodeURIComponent(code)}`, req),
    deepLink: `justgo://invite/${encodeURIComponent(code)}`,
  };
}

async function createInviteWithUniqueCode(PivotUserInvite, owner) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      const doc = await PivotUserInvite.create({ ...owner, code: generateInviteCode() });
      return doc.toObject ? doc.toObject() : doc;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Another request created this user's invite first.
      if (err.keyPattern?.globalUserId) {
        return PivotUserInvite.findOne({
          globalUserId: owner.globalUserId,
          tenantKey: owner.tenantKey,
        }).lean();
      }
      // Code collision: draw again.
    }
  }
  throw new Error('Unable to allocate a unique invite code.');
}

/**
 * The caller's personal invite link for the current city. Created on first
 * request; refreshes the inviter name/photo snapshot on every call.
 */
async function getMyPivotUserInvite(req) {
  const userId = req.user?.userId;
  const globalUserId = toObjectId(req.user?.globalUserId);
  if (!userId || !globalUserId) {
    return unauthorized();
  }

  const tenantKey = normalizeTenantKey(req);
  const tenant = tenantKey ? await getTenantByKey(req, tenantKey) : null;
  if (!tenant || !isPivotTenant(tenant)) {
    return {
      error: 'Invite links are only available in just go cities.',
      status: 403,
      code: 'NOT_PIVOT_TENANT',
    };
  }

  const { User } = getModels(req, 'User');
  const me = await User.findById(userId).select('name picture').lean();
  const snapshot = {
    tenantUserId: toObjectId(userId),
    inviterName: firstName(me?.name),
    inviterPicture: me?.picture || null,
  };

  const { PivotUserInvite } = getGlobalModels(req, 'PivotUserInvite');
  let invite = await PivotUserInvite.findOneAndUpdate(
    { globalUserId, tenantKey: tenant.tenantKey },
    { $set: snapshot },
    { new: true },
  ).lean();

  if (!invite) {
    invite = await createInviteWithUniqueCode(PivotUserInvite, {
      globalUserId,
      tenantKey: tenant.tenantKey,
      ...snapshot,
    });
  }

  return {
    data: {
      code: invite.code,
      ...buildPivotUserInviteLinks(invite.code, req),
      cityDisplayName: serializeCity(tenant).cityDisplayName,
      acceptedCount: invite.acceptedCount || 0,
    },
  };
}

/**
 * Public preview for the invite landing page and app cold start. Unknown codes
 * return `valid: false` (not an error) so callers can fall back to open entry.
 */
async function previewPivotUserInvite(req, rawCode) {
  const code = normalizeInviteCode(rawCode);
  if (!code) {
    return { data: { valid: false } };
  }

  const { PivotUserInvite } = getGlobalModels(req, 'PivotUserInvite');
  const invite = await PivotUserInvite.findOne({ code }).lean();
  if (!invite) {
    return { data: { valid: false } };
  }

  const tenant = await getTenantByKey(req, invite.tenantKey);
  return {
    data: {
      valid: true,
      code,
      inviter: serializeInviter(invite),
      // Null when the inviter's city has since closed; the invitee picks a city.
      city: isOpenPivotCity(tenant) ? serializeCity(tenant) : null,
    },
  };
}

/**
 * Make inviter and invitee friends. Returns false when they cannot be
 * (inviter account gone, or either side blocked the other).
 */
async function connectInviterAndInvitee(req, inviterUserId, inviteeUserId) {
  const { User, Friendship } = getModels(req, 'User', 'Friendship');

  const inviter = await User.findById(inviterUserId).select('_id').lean();
  if (!inviter) {
    return { friended: false };
  }
  if (await areUsersBlocked(req, inviterUserId, inviteeUserId)) {
    return { friended: false };
  }

  const existing = await Friendship.findOne({
    $or: [
      { requester: inviterUserId, recipient: inviteeUserId },
      { requester: inviteeUserId, recipient: inviterUserId },
    ],
  });

  if (existing?.status === 'accepted') {
    return { friended: true, isNewFriendship: false };
  }

  if (existing) {
    existing.status = 'accepted';
    await existing.save();
  } else {
    await new Friendship({
      requester: inviterUserId,
      recipient: inviteeUserId,
      status: 'accepted',
    }).save();
  }

  await User.updateOne({ _id: inviterUserId }, { $inc: { partners: 1 } });
  await User.updateOne({ _id: inviteeUserId }, { $inc: { partners: 1 } });
  return { friended: true, isNewFriendship: true };
}

async function notifyInviter(req, inviterUserId, inviteeUserId) {
  try {
    const { User, Notification } = getModels(req, 'User', 'Notification');
    const invitee = await User.findById(inviteeUserId).select('name username').lean();
    const senderName = invitee?.name?.trim() || invitee?.username?.trim() || 'Someone';
    await NotificationService.withModels({ Notification, User }).createSystemNotification(
      inviterUserId,
      'User',
      'pivot_invite_accepted',
      { senderName, sender: inviteeUserId },
    );
  } catch (err) {
    // The friendship is the point; a missed notification should not fail accept.
    console.warn('[pivotUserInvite] inviter notification failed:', err?.message || err);
  }
}

/**
 * Accept someone's personal invite as the signed-in user: record attribution
 * and make the two of you friends. Idempotent per (invitee, code).
 *
 * Friendships are per city, so an invite from another city returns
 * `reason: 'city_mismatch'` with that city instead of connecting.
 */
async function acceptPivotUserInvite(req, rawCode) {
  const userId = req.user?.userId;
  const globalUserId = toObjectId(req.user?.globalUserId);
  if (!userId || !globalUserId) {
    return unauthorized();
  }

  const code = normalizeInviteCode(rawCode);
  if (!code) {
    return { error: 'Invite not found.', status: 404, code: 'INVITE_NOT_FOUND' };
  }

  const { PivotUserInvite, PivotUserInviteAcceptance } = getGlobalModels(
    req,
    'PivotUserInvite',
    'PivotUserInviteAcceptance',
  );
  const invite = await PivotUserInvite.findOne({ code }).lean();
  if (!invite) {
    return { error: 'Invite not found.', status: 404, code: 'INVITE_NOT_FOUND' };
  }

  const inviter = serializeInviter(invite);
  if (String(invite.globalUserId) === String(globalUserId)) {
    return { data: { friended: false, reason: 'self', inviter } };
  }

  const tenantKey = normalizeTenantKey(req);
  if (invite.tenantKey !== tenantKey) {
    const tenant = await getTenantByKey(req, invite.tenantKey);
    return {
      data: {
        friended: false,
        reason: 'city_mismatch',
        inviter,
        city: isOpenPivotCity(tenant) ? serializeCity(tenant) : null,
      },
    };
  }

  const existing = await PivotUserInviteAcceptance.findOne({
    inviteeGlobalUserId: globalUserId,
    code,
  }).lean();
  if (existing) {
    return {
      data: { friended: Boolean(existing.friended), alreadyAccepted: true, inviter },
    };
  }

  const { friended, isNewFriendship } = await connectInviterAndInvitee(
    req,
    invite.tenantUserId,
    userId,
  );

  try {
    await PivotUserInviteAcceptance.create({
      code,
      tenantKey,
      inviterGlobalUserId: invite.globalUserId,
      inviteeGlobalUserId: globalUserId,
      friended,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return { data: { friended, alreadyAccepted: true, inviter } };
    }
    throw err;
  }

  await PivotUserInvite.updateOne({ _id: invite._id }, { $inc: { acceptedCount: 1 } });
  if (isNewFriendship) {
    await notifyInviter(req, invite.tenantUserId, userId);
  }

  return { data: { friended, alreadyAccepted: false, inviter } };
}

module.exports = {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  normalizeInviteCode,
  generateInviteCode,
  buildPivotUserInviteLinks,
  getMyPivotUserInvite,
  previewPivotUserInvite,
  acceptPivotUserInvite,
};
