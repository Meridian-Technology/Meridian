const { validatePivotInterestTags } = require('./pivotTagCatalogService');
const {
  deleteAllUserSessions,
  deleteAllGlobalUserSessions,
} = require('../utilities/sessionUtils');

function getModels(req, ...names) {
  return require('./getModelService')(req, ...names);
}

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function normalizeStoredInterestTags(raw) {
  return Array.isArray(raw) ? raw : [];
}

function currentYearUtc() {
  return new Date().getUTCFullYear();
}

function hasPivotProfileSignals(user) {
  return Boolean(
    user?.pivotAgeVerifiedAt ||
      user?.pivotBirthYear ||
      user?.pivotLeftAt ||
      user?.pivotParticipationStatus === 'left' ||
      user?.pushAppEdition === 'pivot' ||
      (Array.isArray(user?.pivotInterestTags) && user.pivotInterestTags.length > 0),
  );
}

function isTenantAdmin(user, platformRoles = []) {
  const tenantRoles = Array.isArray(user?.roles) ? user.roles : [];
  const platform = Array.isArray(platformRoles) ? platformRoles : [];
  return (
    tenantRoles.includes('admin') ||
    tenantRoles.includes('root') ||
    platform.includes('platform_admin') ||
    platform.includes('root')
  );
}

async function isPivotTenantRequest(req) {
  try {
    const { getTenantByKey } = require('./tenantConfigService');
    const tenantKey = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';
    if (!tenantKey) {
      return false;
    }
    const tenant = await getTenantByKey(req, tenantKey);
    return tenant?.pivotPilot === true || tenant?.tenantType === 'pivot';
  } catch {
    return false;
  }
}

/**
 * Leave pilot incorrectly used accessSuspended before pivotParticipationStatus existed.
 * Clear that suspension so users can sign in again and rejoin via invite.
 */
async function normalizePivotLeaveAuthUser(req, userId, platformRoles = []) {
  if (!userId) {
    return null;
  }

  const { User } = getModels(req, 'User');
  const user = await User.findById(userId);
  if (!user) {
    return null;
  }

  if (!user.accessSuspended) {
    return user;
  }

  const onPivotTenant = await isPivotTenantRequest(req);
  const isAdmin = isTenantAdmin(user, platformRoles);
  const hasPivotLeaveState =
    user.pivotParticipationStatus === 'left' || user.pivotLeftAt != null;

  const shouldClearPivotLeaveSuspension =
    hasPivotLeaveState ||
    hasPivotProfileSignals(user) ||
    (onPivotTenant && !isAdmin);

  if (!shouldClearPivotLeaveSuspension) {
    return user;
  }

  const leftAt = user.pivotLeftAt || user.accessSuspendedAt || new Date();
  user.accessSuspended = false;
  user.accessSuspendedAt = null;
  if (user.pivotParticipationStatus !== 'left') {
    user.pivotParticipationStatus = 'left';
  }
  if (!user.pivotLeftAt) {
    user.pivotLeftAt = leftAt;
  }
  await user.save();
  return user;
}

async function reactivatePivotParticipationByGlobalUserId(req, globalUserId) {
  if (!globalUserId) {
    return;
  }

  const authGlobalService = require('./authGlobalService');
  const { tenantUserId } = await authGlobalService.resolveTenantUserForRequest(
    req,
    globalUserId,
  );
  if (!tenantUserId) {
    return;
  }

  const { User } = getModels(req, 'User');
  await User.updateOne(
    { _id: tenantUserId },
    {
      $set: { pivotParticipationStatus: 'active' },
      $unset: { pivotLeftAt: '' },
    },
  );
}

async function getPivotProfileInterests(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const { User } = getModels(req, 'User');
  const user = await User.findById(userId).select('pivotInterestTags').lean();
  if (!user) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }

  return {
    data: {
      interestTags: normalizeStoredInterestTags(user.pivotInterestTags),
    },
  };
}

async function updatePivotProfileInterests(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'interestTags')) {
    return {
      error: 'interestTags is required.',
      status: 400,
      code: 'VALIDATION_ERROR',
    };
  }

  const validation = await validatePivotInterestTags(req, body.interestTags);
  if (validation.error) {
    return validation;
  }

  const { User } = getModels(req, 'User');
  const user = await User.findById(userId);
  if (!user) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }

  user.pivotInterestTags = validation.tags;
  await user.save();

  return {
    data: {
      interestTags: validation.tags,
    },
  };
}

async function updatePivotProfileAgeVerification(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'birthYear')) {
    return {
      error: 'birthYear is required.',
      status: 400,
      code: 'VALIDATION_ERROR',
    };
  }

  const birthYear = Number.parseInt(String(body.birthYear), 10);
  const nowYear = currentYearUtc();
  const minYear = nowYear - 120;
  if (!Number.isInteger(birthYear) || birthYear < minYear || birthYear > nowYear) {
    return {
      error: 'birthYear must be a valid 4-digit year.',
      status: 400,
      code: 'VALIDATION_ERROR',
    };
  }

  const age = nowYear - birthYear;
  if (age < 18) {
    return {
      error: 'You must be 18 or older to use Just Go.',
      status: 403,
      code: 'UNDERAGE',
    };
  }

  const { User } = getModels(req, 'User');
  const user = await User.findById(userId);
  if (!user) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }

  user.pivotBirthYear = birthYear;
  user.pivotAgeVerifiedAt = new Date();
  await user.save();

  return {
    data: {
      birthYear: user.pivotBirthYear,
      pivotAgeVerifiedAt: user.pivotAgeVerifiedAt,
    },
  };
}

async function leavePivotPilot(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const { User } = getModels(req, 'User');
  const user = await User.findById(userId);
  if (!user) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }

  user.pivotParticipationStatus = 'left';
  user.pivotLeftAt = new Date();
  if (Object.prototype.hasOwnProperty.call(user, 'refreshToken')) {
    user.refreshToken = null;
  }
  await user.save();

  try {
    await deleteAllUserSessions(userId, req);
  } catch {
    // best effort session invalidation
  }
  if (req.user?.globalUserId) {
    try {
      await deleteAllGlobalUserSessions(req.user.globalUserId, req);
    } catch {
      // best effort session invalidation
    }
  }

  return {
    data: {
      deactivated: true,
      deactivatedAt: user.pivotLeftAt,
      pivotParticipationStatus: user.pivotParticipationStatus,
    },
  };
}

module.exports = {
  getPivotProfileInterests,
  updatePivotProfileInterests,
  updatePivotProfileAgeVerification,
  leavePivotPilot,
  normalizePivotLeaveAuthUser,
  reactivatePivotParticipationByGlobalUserId,
};
