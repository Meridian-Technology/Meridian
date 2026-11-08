/**
 * Personal access tokens for platform admins. The secret is printed once at
 * mint and stored only as a SHA-256 hash. Each admin has one unrevoked token.
 * Expiry is fixed at one year; there is no configuration for it.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const getGlobalModels = require('./getGlobalModelService');

const TOKEN_PREFIX = 'mcp_';
const DISPLAY_PREFIX_LENGTH = 12;
const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const PLATFORM_ADMIN_ROLES = ['platform_admin', 'root'];

function hashToken(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function hashesMatch(storedHash, computedHash) {
  const left = Buffer.from(String(storedHash || ''), 'hex');
  const right = Buffer.from(String(computedHash || ''), 'hex');
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseObjectId(value) {
  const text = String(value || '').trim();
  if (!/^[a-f0-9]{24}$/i.test(text)) return null;
  return new mongoose.Types.ObjectId(text);
}

function isPlatformAdmin(role) {
  const roles = Array.isArray(role?.roles) ? role.roles : [];
  return PLATFORM_ADMIN_ROLES.some((name) => roles.includes(name));
}

function idOrNull(value) {
  return value ? String(value) : null;
}

function serializeToken(token) {
  return {
    id: String(token._id),
    globalUserId: String(token.globalUserId),
    label: token.label,
    displayPrefix: token.displayPrefix,
    expiresAt: token.expiresAt,
    lastUsedAt: token.lastUsedAt || null,
    revokedAt: token.revokedAt || null,
    createdAt: token.createdAt || null,
    createdBy: idOrNull(token.createdBy),
    revokedBy: idOrNull(token.revokedBy),
  };
}

function invalidToken() {
  return { error: 'Invalid access token', status: 401, code: 'INVALID_TOKEN' };
}

function revokedToken() {
  return { error: 'This access token has been revoked.', status: 401, code: 'TOKEN_REVOKED' };
}

function expiredToken() {
  return { error: 'This access token has expired.', status: 401, code: 'TOKEN_EXPIRED' };
}

function normalizeLabel(value) {
  const label = String(value || '').trim();
  if (!label || label.length > 80 || /[\r\n]/.test(label)) return null;
  return label;
}

/**
 * Mint a token for a current platform admin. The returned secret is the only
 * copy; later reads return the display prefix. `createdBy` is the admin who
 * asked for it from Platform Admin (null from the CLI).
 */
async function mintPlatformAccessToken(req, { globalUserId, label: rawLabel, createdBy = null } = {}) {
  const ownerId = parseObjectId(globalUserId);
  if (!ownerId) {
    return { error: 'Global user not found.', status: 404, code: 'GLOBAL_USER_NOT_FOUND' };
  }
  const label = normalizeLabel(rawLabel);
  if (!label) {
    return { error: 'A label up to 80 characters is required.', status: 400, code: 'INVALID_LABEL' };
  }

  const { GlobalUser, PlatformRole, PlatformAccessToken } = getGlobalModels(
    req,
    'GlobalUser',
    'PlatformRole',
    'PlatformAccessToken',
  );
  const user = await GlobalUser.findById(ownerId).lean();
  if (!user) {
    return { error: 'Global user not found.', status: 404, code: 'GLOBAL_USER_NOT_FOUND' };
  }
  const role = await PlatformRole.findOne({ globalUserId: ownerId }).lean();
  if (!isPlatformAdmin(role)) {
    return { error: 'Platform admin required.', status: 403, code: 'NOT_PLATFORM_ADMIN' };
  }

  const existing = await PlatformAccessToken.findOne({ globalUserId: ownerId, revokedAt: null }).lean();
  if (existing) {
    return {
      error: `This admin already has an access token (${existing.displayPrefix}). Revoke it before minting another.`,
      status: 409,
      code: 'TOKEN_EXISTS',
    };
  }

  const secret = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  try {
    const created = await PlatformAccessToken.create({
      globalUserId: ownerId,
      label,
      tokenHash: hashToken(secret),
      displayPrefix: secret.slice(0, DISPLAY_PREFIX_LENGTH),
      expiresAt: new Date(now + TOKEN_TTL_MS),
      lastUsedAt: null,
      revokedAt: null,
      createdBy: parseObjectId(createdBy),
    });
    return { data: { ...serializeToken(created), secret } };
  } catch (err) {
    if (err?.code === 11000) {
      return {
        error: 'This admin already has an access token. Revoke it before minting another.',
        status: 409,
        code: 'TOKEN_EXISTS',
      };
    }
    throw err;
  }
}

/** Every token, newest first, with each owner's email. Never the hash. */
async function listPlatformAccessTokens(req) {
  const { PlatformAccessToken, GlobalUser } = getGlobalModels(req, 'PlatformAccessToken', 'GlobalUser');
  const tokens = await PlatformAccessToken.find({}).sort({ createdAt: -1 }).lean();
  const ownerIds = [...new Set(tokens.map((token) => String(token.globalUserId)))];
  const owners = ownerIds.length
    ? await GlobalUser.find({ _id: { $in: ownerIds } }).select('email').lean()
    : [];
  const emailById = new Map(owners.map((owner) => [String(owner._id), owner.email || null]));
  return {
    data: tokens.map((token) => ({
      ...serializeToken(token),
      ownerEmail: emailById.get(String(token.globalUserId)) || null,
    })),
  };
}

/**
 * Revoke a token. With `actor` (a Platform Admin request), only the token's
 * owner or a root admin may revoke, and the actor is recorded. The CLI passes
 * no actor.
 */
async function revokePlatformAccessToken(req, tokenId, { actor = null } = {}) {
  const id = parseObjectId(tokenId);
  if (!id) {
    return { error: 'Token not found.', status: 404, code: 'TOKEN_NOT_FOUND' };
  }
  const { PlatformAccessToken, PlatformRole } = getGlobalModels(req, 'PlatformAccessToken', 'PlatformRole');
  const token = await PlatformAccessToken.findById(id);
  if (!token) {
    return { error: 'Token not found.', status: 404, code: 'TOKEN_NOT_FOUND' };
  }
  let actorId = null;
  if (actor) {
    actorId = parseObjectId(actor.globalUserId);
    const isOwner = Boolean(actorId) && String(token.globalUserId) === String(actorId);
    if (!isOwner) {
      const role = actorId ? await PlatformRole.findOne({ globalUserId: actorId }).lean() : null;
      if (!role?.roles?.includes('root')) {
        return {
          error: 'Only the token owner or a root admin can revoke this token.',
          status: 403,
          code: 'NOT_TOKEN_OWNER',
        };
      }
    }
  }
  if (!token.revokedAt) {
    token.revokedAt = new Date();
    token.revokedBy = actorId;
    await token.save();
  }
  return { data: serializeToken(token) };
}

/**
 * Resolve a presented secret to its owner. Rechecks PlatformRole. Updates
 * lastUsedAt only after the token is active and the owner is still an admin.
 */
async function authenticatePlatformAccessToken(req, secret) {
  if (typeof secret !== 'string' || secret.length < 20 || secret.length > 200) {
    return invalidToken();
  }
  const { PlatformAccessToken, PlatformRole } = getGlobalModels(
    req,
    'PlatformAccessToken',
    'PlatformRole',
  );
  const tokenHash = hashToken(secret);
  const token = await PlatformAccessToken.findOne({ tokenHash }).lean();
  if (!token || !hashesMatch(token.tokenHash, tokenHash)) {
    return invalidToken();
  }
  if (token.revokedAt) return revokedToken();
  if (!token.expiresAt || new Date(token.expiresAt).getTime() <= Date.now()) {
    return expiredToken();
  }

  const role = await PlatformRole.findOne({ globalUserId: token.globalUserId }).lean();
  if (!isPlatformAdmin(role)) {
    return { error: 'Platform admin required.', status: 403, code: 'NOT_PLATFORM_ADMIN' };
  }

  const updated = await PlatformAccessToken.findOneAndUpdate(
    { _id: token._id, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { lastUsedAt: new Date() } },
    { new: true },
  ).lean();
  if (!updated) {
    const current = await PlatformAccessToken.findById(token._id).lean();
    if (current?.revokedAt) return revokedToken();
    if (!current?.expiresAt || new Date(current.expiresAt).getTime() <= Date.now()) {
      return expiredToken();
    }
    return invalidToken();
  }

  return {
    data: {
      token: updated,
      platformRoles: [...role.roles],
    },
  };
}

module.exports = {
  mintPlatformAccessToken,
  listPlatformAccessTokens,
  revokePlatformAccessToken,
  authenticatePlatformAccessToken,
  TOKEN_TTL_MS,
  hashToken,
};
