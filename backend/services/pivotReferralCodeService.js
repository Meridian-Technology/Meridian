const mongoose = require('mongoose');
const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { isValidIsoWeek, toIsoWeek } = require('../utilities/pivotIsoWeek');
const { reactivatePivotParticipationByGlobalUserId } = require('./pivotProfileService');

function isPivotTenant(tenant) {
  return tenant?.pivotPilot === true || tenant?.tenantType === 'pivot';
}

function serializePivotReferralCode(doc) {
  const row = doc?.toObject ? doc.toObject() : doc;
  const now = new Date();
  const redeemable =
    row.active === true &&
    (!row.expiresAt || new Date(row.expiresAt) >= now) &&
    row.redemptionCount < row.maxRedemptions;

  return {
    _id: String(row._id),
    code: row.code,
    tenantKey: row.tenantKey,
    cohortId: row.cohortId,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    expiresAt: row.expiresAt || null,
    active: row.active,
    batchWeek: row.batchWeek || null,
    redeemable,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateCreatePayload(body = {}) {
  const code = String(body.code || '').trim();
  const cohortId = String(body.cohortId || '').trim();
  if (!code) return { error: 'Referral code is required.' };
  if (!cohortId) return { error: 'Cohort ID is required.' };

  const maxRedemptions = body.maxRedemptions !== undefined ? Number(body.maxRedemptions) : 50;
  if (!Number.isFinite(maxRedemptions) || maxRedemptions < 0) {
    return { error: 'maxRedemptions must be a non-negative number.' };
  }

  const batchWeek = body.batchWeek != null && String(body.batchWeek).trim() !== ''
    ? String(body.batchWeek).trim()
    : null;
  if (batchWeek && !isValidIsoWeek(batchWeek)) {
    return { error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).' };
  }

  let expiresAt = null;
  if (body.expiresAt != null && body.expiresAt !== '') {
    expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return { error: 'expiresAt must be a valid date.' };
    }
  }

  return {
    row: {
      code,
      cohortId,
      maxRedemptions,
      redemptionCount: 0,
      active: body.active !== false,
      batchWeek,
      expiresAt,
    },
  };
}

function validateUpdatePayload(body = {}) {
  const patch = {};

  if (body.code !== undefined) {
    const code = String(body.code || '').trim();
    if (!code) return { error: 'Referral code cannot be empty.' };
    patch.code = code;
  }

  if (body.cohortId !== undefined) {
    const cohortId = String(body.cohortId || '').trim();
    if (!cohortId) return { error: 'Cohort ID cannot be empty.' };
    patch.cohortId = cohortId;
  }

  if (body.maxRedemptions !== undefined) {
    const maxRedemptions = Number(body.maxRedemptions);
    if (!Number.isFinite(maxRedemptions) || maxRedemptions < 0) {
      return { error: 'maxRedemptions must be a non-negative number.' };
    }
    patch.maxRedemptions = maxRedemptions;
  }

  if (body.redemptionCount !== undefined) {
    const redemptionCount = Number(body.redemptionCount);
    if (!Number.isFinite(redemptionCount) || redemptionCount < 0) {
      return { error: 'redemptionCount must be a non-negative number.' };
    }
    patch.redemptionCount = redemptionCount;
  }

  if (body.active !== undefined) {
    patch.active = body.active === true;
  }

  if (body.batchWeek !== undefined) {
    const batchWeek =
      body.batchWeek == null || String(body.batchWeek).trim() === ''
        ? null
        : String(body.batchWeek).trim();
    if (batchWeek && !isValidIsoWeek(batchWeek)) {
      return { error: 'batchWeek must be ISO format YYYY-Www (e.g. 2026-W21).' };
    }
    patch.batchWeek = batchWeek;
  }

  if (body.expiresAt !== undefined) {
    if (body.expiresAt == null || body.expiresAt === '') {
      patch.expiresAt = null;
    } else {
      const expiresAt = new Date(body.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        return { error: 'expiresAt must be a valid date.' };
      }
      patch.expiresAt = expiresAt;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { error: 'No valid fields to update.' };
  }

  return { patch };
}

async function requirePivotTenant(req, tenantKey) {
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { error: 'Tenant not found.', status: 404 };
  }
  if (!isPivotTenant(tenant)) {
    return {
      error: 'Referral codes are only available for Pivot city tenants.',
      status: 403,
    };
  }
  return { tenant };
}

async function listReferralCodesForTenant(req, tenantKey) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotReferralCode } = getGlobalModels(req, 'PivotReferralCode');
  const docs = await PivotReferralCode.find({ tenantKey })
    .sort({ active: -1, code: 1 })
    .lean();

  return {
    tenantKey,
    currentBatchWeek: toIsoWeek(),
    codes: docs.map(serializePivotReferralCode),
  };
}

async function createReferralCode(req, tenantKey, body) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const validation = validateCreatePayload(body);
  if (validation.error) {
    return { error: validation.error, status: 400 };
  }

  const { PivotReferralCode } = getGlobalModels(req, 'PivotReferralCode');
  try {
    const doc = await PivotReferralCode.create({
      ...validation.row,
      tenantKey,
    });
    return { code: serializePivotReferralCode(doc) };
  } catch (err) {
    if (err?.code === 11000) {
      return { error: `Referral code "${validation.row.code}" already exists.`, status: 409 };
    }
    throw err;
  }
}

async function updateReferralCode(req, tenantKey, codeId, body) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const validation = validateUpdatePayload(body);
  if (validation.error) {
    return { error: validation.error, status: 400 };
  }

  const { PivotReferralCode } = getGlobalModels(req, 'PivotReferralCode');
  const existing = await PivotReferralCode.findOne({ _id: codeId, tenantKey });
  if (!existing) {
    return { error: 'Referral code not found for this tenant.', status: 404 };
  }

  if (
    validation.patch.maxRedemptions !== undefined &&
    (validation.patch.redemptionCount ?? existing.redemptionCount) > validation.patch.maxRedemptions
  ) {
    return {
      error: 'maxRedemptions cannot be less than current redemptionCount.',
      status: 400,
    };
  }

  if (
    validation.patch.redemptionCount !== undefined &&
    validation.patch.redemptionCount > (validation.patch.maxRedemptions ?? existing.maxRedemptions)
  ) {
    return {
      error: 'redemptionCount cannot exceed maxRedemptions.',
      status: 400,
    };
  }

  try {
    Object.assign(existing, validation.patch);
    await existing.save();
    return { code: serializePivotReferralCode(existing) };
  } catch (err) {
    if (err?.code === 11000) {
      return { error: 'Referral code already exists.', status: 409 };
    }
    throw err;
  }
}

async function deleteReferralCode(req, tenantKey, codeId) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotReferralCode } = getGlobalModels(req, 'PivotReferralCode');
  const deleted = await PivotReferralCode.findOneAndDelete({ _id: codeId, tenantKey });
  if (!deleted) {
    return { error: 'Referral code not found for this tenant.', status: 404 };
  }
  return { deleted: true, code: deleted.code };
}

function normalizeReferralCodeInput(code) {
  return String(code || '').trim().toUpperCase();
}

async function validateReferralCode(req, rawCode) {
  const code = normalizeReferralCodeInput(rawCode);
  if (!code) {
    return {
      error: 'Referral code is required.',
      status: 400,
      code: 'REFERRAL_CODE_REQUIRED',
    };
  }

  const { PivotReferralCode } = getGlobalModels(req, 'PivotReferralCode');
  const referral = await PivotReferralCode.findOne({ code }).lean();

  if (!referral) {
    return {
      error: 'Invalid referral code.',
      status: 404,
      code: 'REFERRAL_CODE_NOT_FOUND',
    };
  }

  if (!referral.active) {
    return {
      error: 'This referral code is no longer active.',
      status: 403,
      code: 'REFERRAL_CODE_INACTIVE',
    };
  }

  if (referral.expiresAt && new Date(referral.expiresAt) < new Date()) {
    return {
      error: 'This referral code has expired.',
      status: 403,
      code: 'REFERRAL_CODE_EXPIRED',
    };
  }

  if (referral.redemptionCount >= referral.maxRedemptions) {
    return {
      error: 'This referral code has reached its redemption limit.',
      status: 403,
      code: 'REFERRAL_CODE_MAXED',
    };
  }

  const tenant = await getTenantByKey(req, referral.tenantKey);
  if (!tenant) {
    return {
      error: 'City tenant for this code is not configured.',
      status: 503,
      code: 'TENANT_NOT_FOUND',
    };
  }

  if (!isPivotTenant(tenant)) {
    return {
      error: 'Referral code is not valid for Pivot.',
      status: 403,
      code: 'NOT_PIVOT_TENANT',
    };
  }

  return {
    data: {
      tenantKey: tenant.tenantKey,
      subdomain: tenant.subdomain || tenant.tenantKey,
      cohortId: referral.cohortId,
      cityDisplayName: tenant.location || tenant.name,
      batchWeek: referral.batchWeek || null,
    },
  };
}

/**
 * Persist a redemption for authenticated global users only; increments PivotReferralCode.redemptionCount
 * once per (globalUserId, code). Idempotent when the user retries.
 *
 * Requires req.school to match the code's tenant (city).
 */
async function redeemReferralCode(req, rawCode) {
  const gid = req.user?.globalUserId;
  if (!gid) {
    return {
      error: 'Pivot referral redemption requires signing in with a Meridian account.',
      status: 403,
      code: 'GLOBAL_USER_REQUIRED',
    };
  }

  const code = normalizeReferralCodeInput(rawCode);
  if (!code) {
    return {
      error: 'Referral code is required.',
      status: 400,
      code: 'REFERRAL_CODE_REQUIRED',
    };
  }

  const tenantKeyReq = typeof req.school === 'string' ? req.school.trim().toLowerCase() : '';

  const { PivotReferralCode, PivotReferralRedemption } = getGlobalModels(
    req,
    'PivotReferralCode',
    'PivotReferralRedemption',
  );

  const globalUserObjectId = mongoose.Types.ObjectId.isValid(gid)
    ? new mongoose.Types.ObjectId(String(gid))
    : null;
  if (!globalUserObjectId) {
    return {
      error: 'Invalid identity for redemption.',
      status: 403,
      code: 'INVALID_GLOBAL_USER_ID',
    };
  }

  const existingRedemption = await PivotReferralRedemption.findOne({
    globalUserId: globalUserObjectId,
    code,
  }).lean();
  if (existingRedemption) {
    const refRow = await PivotReferralCode.findOne({ code }).select('redemptionCount maxRedemptions').lean();
    await reactivatePivotParticipationByGlobalUserId(req, globalUserObjectId);
    return {
      data: {
        alreadyRedeemed: true,
        redemptionCount: refRow?.redemptionCount ?? null,
        maxRedemptions: refRow?.maxRedemptions ?? null,
      },
    };
  }

  const referralLean = await PivotReferralCode.findOne({ code }).lean();
  if (!referralLean) {
    return {
      error: 'Invalid referral code.',
      status: 404,
      code: 'REFERRAL_CODE_NOT_FOUND',
    };
  }

  const referralTenantKey = String(referralLean.tenantKey || '').toLowerCase();
  if (!tenantKeyReq || referralTenantKey !== tenantKeyReq) {
    return {
      error: `Sign in against the pilot city (${referralTenantKey}) before redeeming this code.`,
      status: 403,
      code: 'TENANT_MISMATCH',
    };
  }

  if (!referralLean.active) {
    return {
      error: 'This referral code is no longer active.',
      status: 403,
      code: 'REFERRAL_CODE_INACTIVE',
    };
  }
  if (referralLean.expiresAt && new Date(referralLean.expiresAt) < new Date()) {
    return {
      error: 'This referral code has expired.',
      status: 403,
      code: 'REFERRAL_CODE_EXPIRED',
    };
  }
  if (referralLean.redemptionCount >= referralLean.maxRedemptions) {
    return {
      error: 'This referral code has reached its redemption limit.',
      status: 403,
      code: 'REFERRAL_CODE_MAXED',
    };
  }

  const updated = await PivotReferralCode.findOneAndUpdate(
    {
      _id: referralLean._id,
      active: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
      $expr: { $lt: ['$redemptionCount', '$maxRedemptions'] },
    },
    { $inc: { redemptionCount: 1 } },
    { new: true }
  ).lean();

  if (!updated) {
    return {
      error: 'This referral code has reached its redemption limit.',
      status: 403,
      code: 'REFERRAL_CODE_MAXED',
    };
  }

  try {
    await PivotReferralRedemption.create({
      globalUserId: globalUserObjectId,
      code,
      pivotReferralCodeId: updated._id,
    });
  } catch (err) {
    if (err?.code === 11000) {
      await PivotReferralCode.updateOne({ _id: updated._id }, { $inc: { redemptionCount: -1 } });
      const refRow = await PivotReferralCode.findOne({ code }).select('redemptionCount maxRedemptions').lean();
      await reactivatePivotParticipationByGlobalUserId(req, globalUserObjectId);
      return {
        data: {
          alreadyRedeemed: true,
          redemptionCount: refRow?.redemptionCount ?? null,
          maxRedemptions: refRow?.maxRedemptions ?? null,
        },
      };
    }
    throw err;
  }

  await reactivatePivotParticipationByGlobalUserId(req, globalUserObjectId);

  return {
    data: {
      redeemed: true,
      alreadyRedeemed: false,
      redemptionCount: updated.redemptionCount,
      maxRedemptions: updated.maxRedemptions,
    },
  };
}

module.exports = {
  isPivotTenant,
  normalizeReferralCodeInput,
  serializePivotReferralCode,
  validateCreatePayload,
  validateUpdatePayload,
  validateReferralCode,
  redeemReferralCode,
  listReferralCodesForTenant,
  createReferralCode,
  updateReferralCode,
  deleteReferralCode,
};
