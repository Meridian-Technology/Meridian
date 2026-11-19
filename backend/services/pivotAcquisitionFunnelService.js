const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { getMergedTenants } = require('./tenantConfigService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { isPivotTenant } = require('./pivotReferralCodeService');

const VOLUME_FUNNEL_DISCLAIMER =
  'Monthly volume funnel (UTC). Landing visitors are not joined to app users, so counts can rise or fall between steps. Joined city is not an install count. First deck decision counts each person once per city, in the month of their first interested, going or pass there. The fleet total adds the cities together.';

const ACQUISITION_STAGES = Object.freeze([
  {
    key: 'landing',
    label: 'Landing page',
    hint: 'Unique landing visitors (view)',
    source: 'justgo_landing_events.view',
  },
  {
    key: 'store_click',
    label: 'Store click',
    hint: 'Unique visitors who tapped App Store or Play',
    source: 'justgo_landing_events.store_click',
  },
  {
    key: 'joined',
    label: 'Joined city',
    hint: 'People who joined the city this month; not verified installs',
    source: 'tenant_memberships.createdAt (status=active)',
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    hint: 'People who confirmed they are 18+ this month',
    source: 'users.pivotAgeVerifiedAt',
  },
  {
    key: 'deck',
    label: 'First deck decision',
    hint: 'People whose first interested, going or pass was this month',
    source: 'pivotEventIntents (first createdAt per user)',
  },
]);
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function utcMonthString(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseAcquisitionMonth(raw, now = new Date()) {
  const month = raw == null || raw === '' ? utcMonthString(now) : String(raw).trim();
  if (!MONTH_PATTERN.test(month)) {
    return {
      error: 'month must be YYYY-MM.',
      status: 400,
      code: 'INVALID_MONTH',
    };
  }
  const [, yearStr, monthStr] = month.match(MONTH_PATTERN);
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  const label = start.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return { month, start, end, label };
}

function rateOrNull(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function facetCounts(rows) {
  const facet = rows?.[0] || {};
  return {
    unique: Number(facet.unique?.[0]?.count) || 0,
    events: Number(facet.events?.[0]?.count) || 0,
  };
}

function zeros() {
  return { unique: 0, events: 0 };
}

function landingMatch(type, { tenantKey, tenantKeys, start, end } = {}) {
  const match = {
    type,
    createdAt: { $gte: start, $lt: end },
  };
  if (tenantKey) {
    match.tenantKey = tenantKey;
    return match;
  }
  if (tenantKeys?.length) {
    match.$or = [{ tenantKey: { $in: tenantKeys } }, { tenantKey: null }];
  }
  return match;
}

async function aggregateLandingStage(JustGoLandingEvent, type, scope) {
  const rows = await JustGoLandingEvent.aggregate([
    { $match: landingMatch(type, scope) },
    {
      $facet: {
        unique: [
          { $match: { visitorId: { $nin: [null, ''] } } },
          { $group: { _id: '$visitorId' } },
          { $count: 'count' },
        ],
        events: [{ $count: 'count' }],
      },
    },
  ]);
  return facetCounts(rows);
}

function counted(count) {
  return { unique: count, events: count };
}

async function loadCityModels(tenantKeys) {
  const models = [];
  for (const tenantKey of tenantKeys) {
    const db = await connectToDatabase(tenantKey);
    models.push(getModels({ db, school: tenantKey }, 'User', 'PivotEventIntent'));
  }
  return models;
}

/** Active memberships created in the month; a person who joins two cities counts in each. */
async function countJoinedCity(TenantMembership, tenantKeys, { start, end }) {
  return counted(
    await TenantMembership.countDocuments({
      tenantKey: { $in: tenantKeys },
      status: 'active',
      createdAt: { $gte: start, $lt: end },
    }),
  );
}

/** City users who passed the 18+ onboarding gate in the month, summed across cities. */
async function countAgeVerified(cities, { start, end }) {
  const counts = await Promise.all(
    cities.map(({ User }) =>
      User.countDocuments({ pivotAgeVerifiedAt: { $gte: start, $lt: end } }),
    ),
  );
  return counted(counts.reduce((sum, count) => sum + count, 0));
}

/** City users whose first-ever intent in that city was created in the month. */
async function countFirstIntent(cities, { start, end }) {
  const counts = await Promise.all(
    cities.map(async ({ PivotEventIntent }) => {
      const rows = await PivotEventIntent.aggregate([
        { $group: { _id: '$userId', firstAt: { $min: '$createdAt' } } },
        { $match: { firstAt: { $gte: start, $lt: end } } },
        { $count: 'count' },
      ]);
      return Number(rows?.[0]?.count) || 0;
    }),
  );
  return counted(counts.reduce((sum, count) => sum + count, 0));
}

function attachRates(countsByKey) {
  const landingUnique = countsByKey.landing.unique;
  return ACQUISITION_STAGES.map((meta, index) => {
    const counts = countsByKey[meta.key] || zeros();
    const prevKey = index > 0 ? ACQUISITION_STAGES[index - 1].key : null;
    const prevUnique = prevKey ? countsByKey[prevKey].unique : null;
    return {
      ...meta,
      unique: counts.unique,
      events: counts.events,
      conversionFromPrev: prevKey == null ? null : rateOrNull(counts.unique, prevUnique),
      conversionFromLanding: rateOrNull(counts.unique, landingUnique),
    };
  });
}

function funnelPayload({ tenantKey, cityDisplayName, scope, stages, range }) {
  const landingUnique = stages.find((s) => s.key === 'landing')?.unique || 0;
  const deckUnique = stages.find((s) => s.key === 'deck')?.unique || 0;
  return {
    data: {
      tenantKey,
      cityDisplayName,
      scope,
      kind: 'volume',
      month: range.month,
      range: {
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      disclaimer: VOLUME_FUNNEL_DISCLAIMER,
      stages,
      overall: {
        from: 'landing',
        to: 'deck',
        rate: rateOrNull(deckUnique, landingUnique),
      },
    },
  };
}

async function loadLandingAndApp(req, { tenantKey, tenantKeys, range }) {
  const { start, end } = range;
  let landing = zeros();
  let storeClick = zeros();
  try {
    const { JustGoLandingEvent } = getGlobalModels(req, 'JustGoLandingEvent');
    const landingScope = { start, end, ...(tenantKey ? { tenantKey } : { tenantKeys }) };
    [landing, storeClick] = await Promise.all([
      aggregateLandingStage(JustGoLandingEvent, 'view', landingScope),
      aggregateLandingStage(JustGoLandingEvent, 'store_click', landingScope),
    ]);
  } catch (error) {
    console.error(
      `[pivotAcquisitionFunnel] landing aggregate failed tenant=${tenantKey || 'fleet'}:`,
      error,
    );
  }

  let joined = zeros();
  let onboarding = zeros();
  let deck = zeros();
  try {
    const cityKeys = tenantKey ? [tenantKey] : tenantKeys || [];
    const { TenantMembership } = getGlobalModels(req, 'TenantMembership');
    const cities = await loadCityModels(cityKeys);
    [joined, onboarding, deck] = await Promise.all([
      countJoinedCity(TenantMembership, cityKeys, { start, end }),
      countAgeVerified(cities, { start, end }),
      countFirstIntent(cities, { start, end }),
    ]);
  } catch (error) {
    console.error(
      `[pivotAcquisitionFunnel] app stage aggregate failed tenant=${tenantKey || 'fleet'}:`,
      error,
    );
  }

  return attachRates({
    landing,
    store_click: storeClick,
    joined,
    onboarding,
    deck,
  });
}

/**
 * Monthly volume funnel: landing → store click → joined city → onboarding (18+) → first deck decision.
 * App stages come from memberships, users and intents; deck is each city user's first intent,
 * attributed to that UTC month.
 */
async function getAcquisitionFunnel(req, options = {}) {
  const range = parseAcquisitionMonth(options.month, options.now);
  if (range.error) return range;

  const scope = options.scope === 'fleet' ? 'fleet' : 'city';

  if (scope === 'fleet') {
    const tenants = (await getMergedTenants(req)).filter(isPivotTenant);
    const tenantKeys = tenants.map((row) => row.tenantKey);
    const stages = await loadLandingAndApp(req, { tenantKeys, range });
    return funnelPayload({
      tenantKey: null,
      cityDisplayName: 'All cities',
      scope,
      stages,
      range,
    });
  }

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const { tenant } = tenantResult;
  const tenantKey = tenant.tenantKey;
  const stages = await loadLandingAndApp(req, {
    tenantKey,
    range,
  });

  return funnelPayload({
    tenantKey,
    cityDisplayName: tenant.location || tenant.name || tenantKey,
    scope,
    stages,
    range,
  });
}

module.exports = {
  getAcquisitionFunnel,
  parseAcquisitionMonth,
  ACQUISITION_STAGES,
  VOLUME_FUNNEL_DISCLAIMER,
  rateOrNull,
};
