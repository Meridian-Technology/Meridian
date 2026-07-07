const getModels = require('./getModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { shiftIsoWeek } = require('../utilities/pivotIsoWeek');

const DEFAULT_WEEKS = 6;
const MAX_WEEKS = 12;

function normalizeWeeksParam(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_WEEKS;
  return Math.min(MAX_WEEKS, Math.max(2, Math.trunc(parsed)));
}

/**
 * Week-over-week retention from PivotEventIntent activity: a user is "active" in a
 * batchWeek when they have any intent row (interested / registered / passed) for it,
 * and "returning" when they were also active the week before.
 */
async function aggregateTenantRetention(tenant, weekList) {
  const db = await connectToDatabase(tenant.tenantKey);
  const tenantReq = { db };
  const { PivotEventIntent } = getModels(tenantReq, 'PivotEventIntent');

  const userSets = await Promise.all(
    weekList.map(async (batchWeek) => {
      const userIds = await PivotEventIntent.distinct('userId', { batchWeek });
      return new Set(userIds.map(String));
    }),
  );

  const weeks = weekList.map((batchWeek, index) => {
    const active = userSets[index];
    const previous = index > 0 ? userSets[index - 1] : null;
    const returningUsers = previous
      ? [...active].filter((userId) => previous.has(userId)).length
      : null;
    const retentionRate =
      previous && previous.size > 0 && returningUsers !== null
        ? Math.round((returningUsers / previous.size) * 1000) / 10
        : null;

    return {
      batchWeek,
      activeUsers: active.size,
      returningUsers,
      retentionRate,
    };
  });

  return {
    tenantKey: tenant.tenantKey,
    cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
    weeks,
  };
}

async function getPivotRetention(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const { batchWeek } = normalized;
  const weeksCount = normalizeWeeksParam(options.weeks);
  const weekList = Array.from({ length: weeksCount }, (_, index) =>
    shiftIsoWeek(batchWeek, index - (weeksCount - 1)),
  );

  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const tenants = [];

  for (const tenant of pivotTenants) {
    try {
      tenants.push(await aggregateTenantRetention(tenant, weekList));
    } catch (error) {
      console.error(
        `[pivotRetention] aggregate failed tenant=${tenant.tenantKey} batchWeek=${batchWeek}:`,
        error,
      );
      tenants.push({
        tenantKey: tenant.tenantKey,
        cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
        weeks: weekList.map((week) => ({
          batchWeek: week,
          activeUsers: 0,
          returningUsers: null,
          retentionRate: null,
        })),
        error: 'AGGREGATION_FAILED',
      });
    }
  }

  return {
    data: {
      batchWeek,
      weeks: weekList,
      tenants,
    },
  };
}

module.exports = {
  getPivotRetention,
  aggregateTenantRetention,
  normalizeWeeksParam,
};
