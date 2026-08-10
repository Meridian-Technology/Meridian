/**
 * Just Go Creator grant allowlist (global DB).
 * Platform admins grant/revoke; Task 1.2 middleware will call getActiveCreatorGrant.
 */

const mongoose = require('mongoose');
const getGlobalModels = require('./getGlobalModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');

function actorId(req) {
  return req.user?.globalUserId || req.user?.userId || null;
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isObjectId(value) {
  return (
    mongoose.Types.ObjectId.isValid(value) &&
    String(new mongoose.Types.ObjectId(value)) === String(value)
  );
}

function serializeGrant(doc, globalUser = null) {
  const row = doc?.toObject ? doc.toObject() : doc;
  return {
    id: String(row._id),
    globalUserId: row.globalUserId ? String(row.globalUserId) : null,
    /** Plan alias — same as globalUserId for global grants. */
    userId: row.globalUserId ? String(row.globalUserId) : null,
    tenantKey: row.tenantKey,
    status: row.status,
    grantedBy: row.grantedBy ? String(row.grantedBy) : null,
    grantedAt: row.grantedAt || null,
    revokedBy: row.revokedBy ? String(row.revokedBy) : null,
    revokedAt: row.revokedAt || null,
    email: globalUser?.email || null,
    name: globalUser?.name || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

async function resolveTargetGlobalUser(req, { globalUserId, email }) {
  const { GlobalUser } = getGlobalModels(req, 'GlobalUser');

  if (globalUserId) {
    const id = String(globalUserId).trim();
    if (!isObjectId(id)) {
      return {
        error: 'globalUserId must be a valid ObjectId.',
        status: 400,
        code: 'INVALID_GLOBAL_USER_ID',
      };
    }
    const user = await GlobalUser.findById(id).select('email name').lean();
    if (!user) {
      return {
        error: 'Global user not found.',
        status: 404,
        code: 'GLOBAL_USER_NOT_FOUND',
      };
    }
    return { user };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return {
      error: 'Provide globalUserId or a valid email.',
      status: 400,
      code: 'CREATOR_IDENTITY_REQUIRED',
    };
  }

  const user = await GlobalUser.findOne({ email: normalizedEmail })
    .select('email name')
    .lean();
  if (!user) {
    return {
      error: 'No global user found for that email. They must sign up first.',
      status: 404,
      code: 'GLOBAL_USER_NOT_FOUND',
    };
  }
  return { user };
}

/**
 * Active grant for creator gate (Task 1.2). Returns null when missing/revoked.
 */
async function getActiveCreatorGrant(req, { globalUserId, tenantKey } = {}) {
  const normalizedKey = String(tenantKey || '')
    .trim()
    .toLowerCase();
  const userId = globalUserId ? String(globalUserId).trim() : '';
  if (!normalizedKey || !userId || !isObjectId(userId)) {
    return null;
  }

  const { PivotCreatorGrant } = getGlobalModels(req, 'PivotCreatorGrant');
  const grant = await PivotCreatorGrant.findOne({
    globalUserId: userId,
    tenantKey: normalizedKey,
    status: 'active',
  }).lean();

  return grant || null;
}

async function listCreatorGrants(req, tenantKey, options = {}) {
  const tenantResult = await resolvePivotTenant(req, tenantKey);
  if (tenantResult.error) return tenantResult;

  const { PivotCreatorGrant, GlobalUser } = getGlobalModels(
    req,
    'PivotCreatorGrant',
    'GlobalUser',
  );

  const query = { tenantKey: tenantResult.tenant.tenantKey };
  if (options.status === 'active' || options.status === 'revoked') {
    query.status = options.status;
  } else if (options.status && options.status !== 'all') {
    return {
      error: 'status must be active, revoked, or all.',
      status: 400,
      code: 'INVALID_GRANT_STATUS',
    };
  } else if (!options.status) {
    query.status = 'active';
  }

  const grants = await PivotCreatorGrant.find(query).sort({ grantedAt: -1 }).lean();
  const userIds = grants.map((g) => g.globalUserId).filter(Boolean);
  const users = await GlobalUser.find({ _id: { $in: userIds } })
    .select('email name')
    .lean();
  const byId = users.reduce((acc, user) => {
    acc[String(user._id)] = user;
    return acc;
  }, {});

  return {
    data: {
      tenantKey: tenantResult.tenant.tenantKey,
      grants: grants.map((grant) =>
        serializeGrant(grant, byId[String(grant.globalUserId)]),
      ),
    },
  };
}

async function grantCreator(req, tenantKey, body = {}) {
  const tenantResult = await resolvePivotTenant(req, tenantKey);
  if (tenantResult.error) return tenantResult;

  const identity = await resolveTargetGlobalUser(req, {
    globalUserId: body.globalUserId || body.userId,
    email: body.email,
  });
  if (identity.error) return identity;

  const { PivotCreatorGrant } = getGlobalModels(req, 'PivotCreatorGrant');
  const now = new Date();
  const actor = actorId(req);
  const key = {
    globalUserId: identity.user._id,
    tenantKey: tenantResult.tenant.tenantKey,
  };

  const existing = await PivotCreatorGrant.findOne(key);
  if (existing) {
    if (existing.status === 'active') {
      return {
        error: 'User already has an active creator grant for this city.',
        status: 409,
        code: 'CREATOR_GRANT_EXISTS',
      };
    }
    existing.status = 'active';
    existing.grantedBy = actor;
    existing.grantedAt = now;
    existing.revokedBy = null;
    existing.revokedAt = null;
    await existing.save();
    return {
      data: serializeGrant(existing, identity.user),
      reactivated: true,
    };
  }

  const created = await PivotCreatorGrant.create({
    ...key,
    status: 'active',
    grantedBy: actor,
    grantedAt: now,
  });

  return {
    data: serializeGrant(created, identity.user),
    reactivated: false,
  };
}

async function revokeCreator(req, tenantKey, globalUserId) {
  const tenantResult = await resolvePivotTenant(req, tenantKey);
  if (tenantResult.error) return tenantResult;

  const id = String(globalUserId || '').trim();
  if (!isObjectId(id)) {
    return {
      error: 'globalUserId must be a valid ObjectId.',
      status: 400,
      code: 'INVALID_GLOBAL_USER_ID',
    };
  }

  const { PivotCreatorGrant, GlobalUser } = getGlobalModels(
    req,
    'PivotCreatorGrant',
    'GlobalUser',
  );

  const grant = await PivotCreatorGrant.findOne({
    globalUserId: id,
    tenantKey: tenantResult.tenant.tenantKey,
  });

  if (!grant) {
    return {
      error: 'Creator grant not found.',
      status: 404,
      code: 'CREATOR_GRANT_NOT_FOUND',
    };
  }

  if (grant.status === 'revoked') {
    const user = await GlobalUser.findById(id).select('email name').lean();
    return {
      data: serializeGrant(grant, user),
      alreadyRevoked: true,
    };
  }

  grant.status = 'revoked';
  grant.revokedAt = new Date();
  grant.revokedBy = actorId(req);
  await grant.save();

  const user = await GlobalUser.findById(id).select('email name').lean();
  return {
    data: serializeGrant(grant, user),
    alreadyRevoked: false,
  };
}

module.exports = {
  listCreatorGrants,
  grantCreator,
  revokeCreator,
  getActiveCreatorGrant,
  serializeGrant,
};
