const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { getMergedTenants } = require('./tenantConfigService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { resolvePivotDropConfig } = require('../utilities/pivotDropSchedule');
const { buildPivotGrowthOverview, dropWeekOf } = require('../utilities/pivotGrowthMetrics');
const { launchDateToUtc } = require('../utilities/pivotLaunchDate');

const SAVED_STATUSES = ['interested', 'registered'];

function cityName(tenant) {
  return tenant.location || tenant.name || tenant.tenantKey;
}

/** Drop week containing the city's launch date, or null when unset. */
function cityLaunchWeek(tenant, dropDay) {
  const launchedAt = launchDateToUtc(tenant.pivotLaunchDate);
  return launchedAt ? dropWeekOf(launchedAt, dropDay) : null;
}

/** City memberships: tenant user, global user, and the date they joined. */
async function loadMemberships(req, tenantKey) {
  const { TenantMembership } = getGlobalModels(req, 'TenantMembership');
  return TenantMembership.find(
    { tenantKey },
    { tenantUserId: 1, globalUserId: 1, createdAt: 1, _id: 0 },
  ).lean();
}

/** Global users who redeemed a referral code. */
async function loadReferredGlobalIds(req, globalUserIds) {
  if (!globalUserIds.length) return new Set();
  const { PivotReferralRedemption } = getGlobalModels(req, 'PivotReferralRedemption');
  const ids = await PivotReferralRedemption.distinct('globalUserId', {
    globalUserId: { $in: globalUserIds },
  });
  return new Set(ids.map(String));
}

/** One row per user per drop week that they opened or acted on the deck. */
async function loadActivity(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  const { PivotDeckSnapshot, PivotEventIntent } = getModels(
    { db },
    'PivotDeckSnapshot',
    'PivotEventIntent',
  );

  const [snapshots, intentRows] = await Promise.all([
    PivotDeckSnapshot.find({}, { userId: 1, batchWeek: 1, _id: 0 }).lean(),
    PivotEventIntent.aggregate([
      {
        $group: {
          _id: { userId: '$userId', week: '$batchWeek' },
          plans: { $sum: { $cond: [{ $in: ['$status', SAVED_STATUSES] }, 1, 0] } },
          ticketOpens: { $sum: { $cond: [{ $gt: ['$externalOpenCount', 0] }, 1, 0] } },
        },
      },
    ]),
  ]);

  return {
    deckOpens: snapshots.map((row) => ({ userId: String(row.userId), week: row.batchWeek })),
    intents: intentRows.map((row) => ({
      userId: String(row._id.userId),
      week: row._id.week,
      plans: row.plans,
      saved: row.plans > 0,
      ticketOpened: row.ticketOpens > 0,
    })),
  };
}

/**
 * City growth overview: weekly actives, cohort retention, growth accounting,
 * engagement depth, and plan conversion. See utilities/pivotGrowthMetrics.js
 * for every definition.
 */
async function getTenantGrowthOverview(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const { tenant } = tenantResult;
  const tenantKey = tenant.tenantKey;
  const dropConfig = resolvePivotDropConfig(tenant);
  const [memberships, activity] = await Promise.all([
    loadMemberships(req, tenantKey),
    loadActivity(tenantKey),
  ]);
  const referred = await loadReferredGlobalIds(
    req,
    memberships.map((row) => row.globalUserId).filter(Boolean),
  );

  return {
    data: {
      scope: 'city',
      tenantKey,
      cityDisplayName: cityName(tenant),
      generatedAt: (options.now || new Date()).toISOString(),
      launchDate: tenant.pivotLaunchDate || null,
      ...buildPivotGrowthOverview({
        members: memberships.map((row) => ({
          userId: String(row.tenantUserId),
          joinedAt: row.createdAt,
          referred: referred.has(String(row.globalUserId)),
        })),
        deckOpens: activity.deckOpens,
        intents: activity.intents,
        now: options.now,
        dropDayOfWeek: dropConfig.dayOfWeek,
        cohortWeeks: options.weeks,
        launchWeek: cityLaunchWeek(tenant, dropConfig.dayOfWeek),
      }),
    },
  };
}

/**
 * All-cities growth overview. People are counted once across cities by their
 * global user (city user when a membership is missing); a person in two cities
 * joins in their earliest city's drop week. Each city's joins and activity use
 * that city's own drop day; the fleet's current week uses the pilot default.
 * Each city's launch date applies to that city before merging; the fleet window
 * starts at the earliest launch week only when every city has one.
 * A city that fails to load is listed in `failedCities`, not silently dropped.
 * `options.tenantKeys` limits the fleet to those cities (all Pivot cities when unset).
 */
async function getFleetGrowthOverview(req, options = {}) {
  const only = options.tenantKeys ? new Set(options.tenantKeys) : null;
  const pivotTenants = (await getMergedTenants(req))
    .filter(isPivotTenant)
    .filter((tenant) => !only || only.has(tenant.tenantKey));
  const members = new Map();
  const deckOpens = [];
  const intents = [];
  const cities = [];
  const failedCities = [];
  const launchWeeks = [];
  let preLaunchMembers = 0;

  const loaded = await Promise.all(
    pivotTenants.map(async (tenant) => {
      try {
        const [memberships, activity] = await Promise.all([
          loadMemberships(req, tenant.tenantKey),
          loadActivity(tenant.tenantKey),
        ]);
        return { tenant, memberships, activity };
      } catch (error) {
        console.error(`[pivotGrowthOverview] fleet load failed tenant=${tenant.tenantKey}:`, error);
        return { tenant, error };
      }
    }),
  );

  const allGlobalIds = loaded.flatMap((row) =>
    (row.memberships || []).map((membership) => membership.globalUserId).filter(Boolean),
  );
  const referred = await loadReferredGlobalIds(req, allGlobalIds);

  loaded.forEach(({ tenant, memberships, activity, error }) => {
    const tenantKey = tenant.tenantKey;
    if (error) {
      failedCities.push({ tenantKey, cityDisplayName: cityName(tenant) });
      return;
    }
    const dropDay = resolvePivotDropConfig(tenant).dayOfWeek;
    const launchWeek = cityLaunchWeek(tenant, dropDay);
    launchWeeks.push(launchWeek);
    const counted = (week) => !launchWeek || week >= launchWeek;
    const personByCityUser = new Map();
    memberships.forEach((row) => {
      const person = row.globalUserId
        ? `g:${row.globalUserId}`
        : `${tenantKey}:${row.tenantUserId}`;
      personByCityUser.set(String(row.tenantUserId), person);
      if (!row.createdAt) return;
      const joinedAt = new Date(row.createdAt);
      if (!counted(dropWeekOf(joinedAt, dropDay))) {
        preLaunchMembers += 1;
        return;
      }
      const existing = members.get(person);
      const isReferred = referred.has(String(row.globalUserId));
      if (!existing || joinedAt < existing.joinedAt) {
        members.set(person, {
          userId: person,
          joinedAt,
          week: dropWeekOf(joinedAt, dropDay),
          referred: isReferred || Boolean(existing?.referred),
        });
      } else if (isReferred) {
        existing.referred = true;
      }
    });

    const personFor = (userId) => personByCityUser.get(userId) || `${tenantKey}:${userId}`;
    activity.deckOpens.forEach((row) => {
      if (counted(row.week)) deckOpens.push({ ...row, userId: personFor(row.userId) });
    });
    activity.intents.forEach((row) => {
      if (counted(row.week)) intents.push({ ...row, userId: personFor(row.userId) });
    });
    cities.push({
      tenantKey,
      cityDisplayName: cityName(tenant),
      members: memberships.length,
      launchDate: tenant.pivotLaunchDate || null,
    });
  });

  const fleetLaunchWeek = launchWeeks.length && launchWeeks.every(Boolean)
    ? [...launchWeeks].sort()[0]
    : null;
  const overview = buildPivotGrowthOverview({
    members: [...members.values()],
    deckOpens,
    intents,
    now: options.now,
    dropDayOfWeek: resolvePivotDropConfig({}).dayOfWeek,
    cohortWeeks: options.weeks,
    launchWeek: fleetLaunchWeek,
  });

  return {
    data: {
      scope: 'fleet',
      tenantKey: null,
      cityDisplayName: 'All cities',
      generatedAt: (options.now || new Date()).toISOString(),
      cities,
      failedCities,
      ...overview,
      preLaunchMembers: overview.preLaunchMembers + preLaunchMembers,
    },
  };
}

module.exports = {
  getTenantGrowthOverview,
  getFleetGrowthOverview,
};
