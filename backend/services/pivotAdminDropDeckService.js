const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { getPivotFeed, normalizeInterestTagSet } = require('./pivotFeedService');
const {
  getPivotDeckSnapshot,
  getLatestPivotDeckSnapshot,
} = require('./pivotDeckSnapshotService');
const {
  resolvePivotDropInstant,
  formatPivotDropInstant,
} = require('../utilities/pivotDropSchedule');

function openTenantDb(tenantKey) {
  return connectToDatabase(tenantKey).then((db) => ({ db, school: tenantKey }));
}

function parseUserId(raw) {
  const id = String(raw || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { error: 'A valid userId is required.', status: 400, code: 'INVALID_USER_ID' };
  }
  return { userId: id };
}

function parseRebuildFlag(raw) {
  return raw === true || raw === 1 || raw === '1' || String(raw || '').trim().toLowerCase() === 'true';
}

function parseOptionalBatchWeek(raw) {
  const week = String(raw || '').trim();
  return week || undefined;
}

function resolveDropStart(tenant, batchWeek, fallbackNow) {
  try {
    const resolved = resolvePivotDropInstant(tenant, batchWeek, fallbackNow);
    return {
      asOf: resolved.dropAt,
      asOfLabel: formatPivotDropInstant(resolved.dropAt, resolved.timezone),
    };
  } catch {
    return { asOf: fallbackNow, asOfLabel: null };
  }
}

/**
 * Ops preview of a specific user's drop deck. Never writes PivotDeckSnapshot.
 * Default uses the frozen snapshot when one exists, evaluated at drop start
 * so past cards still show. rebuild=true recomputes as of now.
 */
async function previewAdminDropDeck(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const userIdResult = parseUserId(options.userId);
  if (userIdResult.error) return userIdResult;

  const tenant = tenantResult.tenant;
  const tenantKey = tenant.tenantKey;
  const { userId } = userIdResult;
  const rebuild = parseRebuildFlag(options.rebuild);
  const tenantReq = {
    ...(await openTenantDb(tenantKey)),
    globalDb: req.globalDb,
    user: { userId, roles: [] },
  };

  const { User } = getModels(tenantReq, 'User');
  const user = await User.findById(userId)
    .select('name username picture pivotInterestTags')
    .lean();
  if (!user) {
    return {
      error: 'User not found in this city.',
      status: 404,
      code: 'USER_NOT_FOUND',
    };
  }

  const requestedBatchWeek = parseOptionalBatchWeek(options.batchWeek);
  const clockNow = options.now || new Date();
  let feedBatchWeek = requestedBatchWeek;
  let feedNow = clockNow;
  let asOfLabel = null;

  if (!rebuild) {
    const snapshot = requestedBatchWeek
      ? await getPivotDeckSnapshot(tenantReq, { userId, batchWeek: requestedBatchWeek })
      : await getLatestPivotDeckSnapshot(tenantReq, { userId });
    if (snapshot?.batchWeek) {
      feedBatchWeek = snapshot.batchWeek;
      const dropStart = resolveDropStart(tenant, snapshot.batchWeek, clockNow);
      feedNow = dropStart.asOf;
      asOfLabel = dropStart.asOfLabel;
    }
  }

  const feedResult = await getPivotFeed(tenantReq, {
    ...(feedBatchWeek ? { batchWeek: feedBatchWeek } : {}),
    now: feedNow,
    preview: true,
    ignoreSnapshot: rebuild,
    includeScores: true,
  });
  if (feedResult.error) return feedResult;

  return {
    data: {
      tenantKey,
      user: {
        userId: String(user._id),
        name: user.name || '',
        username: user.username || null,
        picture: user.picture || null,
        interestTags: [...normalizeInterestTagSet(user.pivotInterestTags)],
      },
      rebuild,
      frozen: Boolean(feedResult.data?.frozen),
      batchWeek: feedResult.data?.batchWeek,
      asOf: feedNow?.toISOString?.() || null,
      asOfLabel,
      cityDisplayName: feedResult.data?.cityDisplayName,
      rankerVersion: feedResult.data?.rankerVersion,
      eligibleCount: feedResult.data?.eligibleCount ?? 0,
      events: feedResult.data?.events || [],
    },
  };
}

module.exports = {
  previewAdminDropDeck,
  parseRebuildFlag,
};
