const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { getMergedTenants } = require('./tenantConfigService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { isPivotTenant } = require('./pivotReferralCodeService');

const VOLUME_FUNNEL_DISCLAIMER =
  'Monthly volume funnel (UTC). Landing visitors are not joined to app users, so counts can rise or fall between steps. App activity is not an install count. First deck decision counts each person once, in the month of their first pass or interested action.';

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
    key: 'install',
    label: 'App activity',
    hint: 'Unique people with a Just Go app event; not verified installs',
    source: 'analytics_events.app=justgo,env=prod',
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    hint: 'People who finished Just Go onboarding',
    source: 'pivot_onboarding_completed',
  },
  {
    key: 'deck',
    label: 'First deck decision',
    hint: 'People whose first pass or interested action was this month',
    source: 'pivot_card_pass|pivot_card_interested',
  },
]);

const DECK_EVENTS = ['pivot_card_pass', 'pivot_card_interested'];
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

function actorIdsFromFacet(rows) {
  const ids = new Set();
  for (const row of rows?.[0]?.uniqueIds || []) {
    if (row?._id != null && row._id !== '') ids.add(String(row._id));
  }
  return ids;
}

async function loadCityAnalyticsModels(tenantKeys) {
  const models = [];
  for (const tenantKey of tenantKeys) {
    const db = await connectToDatabase(tenantKey);
    models.push(getModels({ db, school: tenantKey }, 'AnalyticsEvent').AnalyticsEvent);
  }
  return models;
}

/**
 * Unique people and raw event counts. Fleet passes one model per city and
 * counts a person once across cities.
 */
async function aggregateAnalyticsStage(models, eventNames, { start, end }) {
  const ids = new Set();
  let events = 0;
  await Promise.all(
    (models || []).map(async (AnalyticsEvent) => {
      const rows = await AnalyticsEvent.aggregate([
        {
          $match: {
            ...(eventNames ? { event: { $in: eventNames } } : {}),
            ts: { $gte: start, $lt: end },
            app: 'justgo',
            env: 'prod',
          },
        },
        {
          $facet: {
            uniqueIds: [
              { $group: { _id: { $ifNull: ['$user_id', '$anonymous_id'] } } },
              { $match: { _id: { $ne: null } } },
            ],
            events: [{ $count: 'count' }],
          },
        },
      ]);
      actorIdsFromFacet(rows).forEach((id) => ids.add(id));
      events += facetCounts(rows).events;
    }),
  );
  return { unique: ids.size, events };
}

/** First-ever deck decision per actor, counted in the month it occurred. */
async function aggregateFirstDeckSwipe(models, { start, end }) {
  const first = new Map();
  await Promise.all(
    (models || []).map(async (AnalyticsEvent) => {
      const rows = await AnalyticsEvent.aggregate([
        { $match: { event: { $in: DECK_EVENTS }, app: 'justgo', env: 'prod' } },
        {
          $group: {
            _id: { $ifNull: ['$user_id', '$anonymous_id'] },
            firstTs: { $min: '$ts' },
          },
        },
      ]);
      for (const row of rows) {
        if (row?._id == null || row._id === '') continue;
        const ts = new Date(row.firstTs).getTime();
        if (!Number.isFinite(ts)) continue;
        const key = String(row._id);
        const prev = first.get(key);
        if (prev == null || ts < prev) first.set(key, ts);
      }
    }),
  );
  const startMs = start.getTime();
  const endMs = end.getTime();
  let unique = 0;
  for (const ts of first.values()) {
    if (ts >= startMs && ts < endMs) unique += 1;
  }
  return { unique, events: unique };
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

  let install = zeros();
  let onboarding = zeros();
  let deck = zeros();
  try {
    const models = await loadCityAnalyticsModels(tenantKey ? [tenantKey] : tenantKeys);
    [install, onboarding, deck] = await Promise.all([
      aggregateAnalyticsStage(models, null, { start, end }),
      aggregateAnalyticsStage(models, ['pivot_onboarding_completed'], { start, end }),
      aggregateFirstDeckSwipe(models, { start, end }),
    ]);
  } catch (error) {
    console.error(
      `[pivotAcquisitionFunnel] analytics aggregate failed tenant=${tenantKey || 'fleet'}:`,
      error,
    );
  }

  return attachRates({
    landing,
    store_click: storeClick,
    install,
    onboarding,
    deck,
  });
}

/**
 * Monthly volume funnel: landing → store click → app activity → onboarding → first deck decision.
 * Deck is first-ever swipe per person, attributed to that UTC month.
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
  DECK_EVENTS,
};
