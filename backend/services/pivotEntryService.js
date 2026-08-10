const mongoose = require('mongoose');
const { getMergedTenants, getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { validateReferralCode, redeemReferralCode } = require('./pivotReferralCodeService');
const { reactivatePivotParticipationByGlobalUserId } = require('./pivotProfileService');

const SELECTABLE_STATUSES = new Set(['active']);

function serializePivotCity(tenant) {
  return {
    tenantKey: tenant.tenantKey,
    subdomain: tenant.subdomain || tenant.tenantKey,
    cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
    status: tenant.status,
    statusMessage: tenant.statusMessage || '',
  };
}

async function listPivotCities(req) {
  const tenants = await getMergedTenants(req);
  const cities = tenants
    .filter((t) => isPivotTenant(t) && SELECTABLE_STATUSES.has(t.status))
    .map(serializePivotCity)
    .sort((a, b) => a.cityDisplayName.localeCompare(b.cityDisplayName));

  return { data: { cities } };
}

async function resolvePivotEntry(req, options = {}) {
  const tenantKey = String(options.tenantKey || options.subdomain || '')
    .trim()
    .toLowerCase();
  if (!tenantKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { error: 'City not found.', status: 404, code: 'TENANT_NOT_FOUND' };
  }
  if (!isPivotTenant(tenant)) {
    return {
      error: 'This city is not available on just go yet.',
      status: 403,
      code: 'NOT_PIVOT_TENANT',
    };
  }
  if (tenant.status !== 'active') {
    return {
      error: 'This city is not open yet.',
      status: 403,
      code: 'TENANT_NOT_ACTIVE',
    };
  }

  const base = {
    tenantKey: tenant.tenantKey,
    subdomain: tenant.subdomain || tenant.tenantKey,
    cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
    batchWeek: null,
    referralAttribution: false,
  };

  const referralCode = String(options.referralCode || options.code || '').trim();
  if (referralCode) {
    const referral = await validateReferralCode(req, referralCode);
    if (!referral.error && referral.data) {
      const refTenant = String(referral.data.tenantKey || '').toLowerCase();
      if (refTenant === tenant.tenantKey) {
        return {
          data: {
            ...base,
            code: referralCode.toUpperCase(),
            cohortId: referral.data.cohortId || null,
            batchWeek: referral.data.batchWeek || null,
            referralAttribution: true,
          },
        };
      }
    }
  }

  return { data: base };
}

/**
 * Record open city entry after auth. Optionally redeems a referral code when present
 * (attribution only — entry no longer requires a code).
 */
async function redeemPivotEntry(req, options = {}) {
  const gid = req.user?.globalUserId;
  if (!gid) {
    return {
      error: 'Authentication required.',
      status: 401,
      code: 'UNAUTHORIZED',
    };
  }

  const globalUserObjectId = mongoose.Types.ObjectId.isValid(gid)
    ? new mongoose.Types.ObjectId(String(gid))
    : null;
  if (!globalUserObjectId) {
    return {
      error: 'Invalid identity for entry.',
      status: 403,
      code: 'INVALID_GLOBAL_USER_ID',
    };
  }

  await reactivatePivotParticipationByGlobalUserId(req, globalUserObjectId);

  const referralCode = String(options.referralCode || options.code || '').trim();
  if (referralCode) {
    return redeemReferralCode(req, referralCode, {
      referredByUserId: options.referredByUserId,
    });
  }

  return {
    data: {
      entered: true,
      referralRedeemed: false,
    },
  };
}

module.exports = {
  listPivotCities,
  resolvePivotEntry,
  redeemPivotEntry,
};
