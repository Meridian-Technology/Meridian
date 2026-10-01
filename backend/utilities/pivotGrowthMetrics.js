/**
 * Investor-style growth metrics for a Just Go city, computed from plain rows so
 * every definition is unit-testable. The service layer loads the rows.
 *
 * The unit of time is the drop week: [drop day 00:00 UTC, next drop day), keyed
 * by the ISO week that contains its drop day — the same key as `batchWeek`.
 * Just Go is used once a week, so weekly actives (not DAU/MAU) are the headline.
 *
 * Activity definitions (per user, per drop week):
 *   opened  — opened that week's drop (deck snapshot) or acted on a card
 *   swiped  — made any swipe decision (pass, interested, going)
 *   planned — saved a plan (interested or going)
 * `opened` is the weekly-active definition used by every non-cohort metric.
 *
 * Launch week: when a city has a launch date, counting starts with the drop week
 * that contains it. Earlier activity is ignored, people who joined earlier are
 * left out of cohorts (reported as `preLaunchMembers`), and every window starts
 * no earlier than the launch week.
 */
const {
  daysFromIsoMonday,
  normalizeDropDayOfWeek,
  shiftIsoWeek,
  toIsoWeekUtc,
  batchWeekToDropCycleUtcRange,
} = require('./pivotIsoWeek');

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_DEFINITIONS = Object.freeze(['opened', 'swiped', 'planned']);
const DEFAULT_COHORT_WEEKS = 12;
const MAX_COHORT_WEEKS = 26;
const ENGAGEMENT_WINDOW_WEEKS = 4;
const HEADLINE_COHORTS = 4;

function normalizeCohortWeeks(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_COHORT_WEEKS;
  return Math.min(MAX_COHORT_WEEKS, Math.max(4, Math.trunc(parsed)));
}

/** Drop week (batchWeek key) that contains `date`. */
function dropWeekOf(date, dropDayOfWeek = 4) {
  const offsetDays = daysFromIsoMonday(normalizeDropDayOfWeek(dropDayOfWeek));
  return toIsoWeekUtc(new Date(new Date(date).getTime() - offsetDays * DAY_MS));
}

function weekRange(first, last) {
  const weeks = [];
  for (let week = first; week <= last; week = shiftIsoWeek(week, 1)) weeks.push(week);
  return weeks;
}

function weekStartDate(week, dropDayOfWeek) {
  return batchWeekToDropCycleUtcRange(week, dropDayOfWeek).start.toISOString().slice(0, 10);
}

function ratio(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

/** Map of week → Set(userId) from `{ userId, week }` rows. */
function indexByWeek(rows) {
  const byWeek = new Map();
  (rows || []).forEach((row) => {
    if (!row?.userId || !row?.week) return;
    const userId = String(row.userId);
    if (!byWeek.has(row.week)) byWeek.set(row.week, new Set());
    byWeek.get(row.week).add(userId);
  });
  return byWeek;
}

function unionIndex(...indexes) {
  const merged = new Map();
  indexes.forEach((index) => {
    index.forEach((users, week) => {
      if (!merged.has(week)) merged.set(week, new Set());
      users.forEach((userId) => merged.get(week).add(userId));
    });
  });
  return merged;
}

function activeIn(index, week) {
  return index.get(week) || new Set();
}

/**
 * Triangle retention: each row is the members who joined in one drop week;
 * cell k is the share of that row active k weeks later. Week 0 is the join week,
 * so it measures activation rather than being 100% by construction. The cell
 * for the in-progress week is marked incomplete; later weeks are omitted
 * (unknown, never zero).
 */
function buildCohortTable(members, activity, { cohortWeeks, currentWeek, dropDayOfWeek }) {
  const firstCohort = shiftIsoWeek(currentWeek, -(cohortWeeks - 1));
  const cohortsByWeek = new Map();
  members.forEach((member) => {
    if (member.week < firstCohort || member.week > currentWeek) return;
    if (!cohortsByWeek.has(member.week)) cohortsByWeek.set(member.week, []);
    cohortsByWeek.get(member.week).push(member.userId);
  });

  const cohorts = weekRange(firstCohort, currentWeek).map((week) => {
    const userIds = cohortsByWeek.get(week) || [];
    const cells = [];
    for (let offset = 0; ; offset += 1) {
      const activeWeek = shiftIsoWeek(week, offset);
      if (activeWeek > currentWeek) break;
      const users = activeIn(activity, activeWeek);
      const active = userIds.filter((userId) => users.has(userId)).length;
      cells.push({
        offset,
        active,
        rate: ratio(active, userIds.length),
        complete: activeWeek < currentWeek,
      });
    }
    return {
      week,
      startDate: weekStartDate(week, dropDayOfWeek),
      size: userIds.length,
      cells,
    };
  });

  // Weighted by cohort size over complete cells only, so a young cohort's
  // unfinished week never drags a column down.
  const average = [];
  for (let offset = 0; offset < cohortWeeks; offset += 1) {
    let users = 0;
    let active = 0;
    let count = 0;
    cohorts.forEach((cohort) => {
      const cell = cohort.cells[offset];
      if (!cell?.complete || !cohort.size) return;
      users += cohort.size;
      active += cell.active;
      count += 1;
    });
    if (!count) break;
    average.push({ offset, rate: ratio(active, users), cohorts: count, users });
  }

  return { cohorts, average };
}

/**
 * Weighted retention at `offset` over the `take` most recent cohorts whose
 * week `offset` is complete, skipping the `skip` newest of those.
 */
function recentCohortRate(table, offset, { take = HEADLINE_COHORTS, skip = 0 } = {}) {
  const eligible = table.cohorts
    .filter((cohort) => cohort.size && cohort.cells[offset]?.complete)
    .slice(-(take + skip))
    .slice(0, take);
  if (eligible.length < take) return null;
  const users = eligible.reduce((sum, cohort) => sum + cohort.size, 0);
  const active = eligible.reduce((sum, cohort) => sum + cohort.cells[offset].active, 0);
  return ratio(active, users);
}

/**
 * Social Capital growth accounting on weekly actives:
 *   new         — first active week ever
 *   retained    — active this week and last week
 *   resurrected — active this week, not last week, active some earlier week
 *   churned     — active last week, not this week (reported as a positive count)
 *   quick ratio — (new + resurrected) / churned; > 1 means the base is growing
 * Churn is unknowable until a week ends (people who haven't opened this drop
 * *yet* are not churned), so the in-progress week reports churned and quick
 * ratio as null.
 */
function buildGrowthAccounting(activity, weeks, currentWeek) {
  const firstActiveWeek = new Map();
  [...activity.keys()].sort().forEach((week) => {
    activity.get(week).forEach((userId) => {
      if (!firstActiveWeek.has(userId)) firstActiveWeek.set(userId, week);
    });
  });

  return weeks.map((week) => {
    const active = activeIn(activity, week);
    const previous = activeIn(activity, shiftIsoWeek(week, -1));
    let fresh = 0;
    let retained = 0;
    let resurrected = 0;
    active.forEach((userId) => {
      if (previous.has(userId)) retained += 1;
      else if (firstActiveWeek.get(userId) === week) fresh += 1;
      else resurrected += 1;
    });
    const complete = week < currentWeek;
    let churned = 0;
    previous.forEach((userId) => {
      if (!active.has(userId)) churned += 1;
    });
    if (!complete) churned = null;
    return {
      week,
      complete,
      active: active.size,
      new: fresh,
      retained,
      resurrected,
      churned,
      quickRatio: churned ? Math.round(((fresh + resurrected) / churned) * 100) / 100 : null,
    };
  });
}

/**
 * Weekly power-user curve (a16z L-curve at weekly grain): of people active at
 * least once in the last `windowWeeks` complete weeks, how many were active in
 * 1, 2, … all of them.
 */
function buildEngagementCurve(activity, lastCompleteWeek, windowWeeks = ENGAGEMENT_WINDOW_WEEKS) {
  const window = weekRange(shiftIsoWeek(lastCompleteWeek, -(windowWeeks - 1)), lastCompleteWeek);
  const counts = new Map();
  window.forEach((week) => {
    activeIn(activity, week).forEach((userId) => {
      counts.set(userId, (counts.get(userId) || 0) + 1);
    });
  });
  const buckets = Array.from({ length: windowWeeks }, (_, index) => ({
    weeksActive: index + 1,
    users: 0,
  }));
  counts.forEach((weeksActive) => {
    buckets[weeksActive - 1].users += 1;
  });
  return { weeks: window, activeUsers: counts.size, buckets };
}

/**
 * @param {object} input
 * @param {{ userId, joinedAt?: Date|string, week?: string, referred?: boolean }[]} input.members
 *   `week` (join drop week) wins over `joinedAt` — the all-cities view keys each
 *   member by their own city's drop day.
 * @param {{ userId, week }[]} input.deckOpens   deck snapshots
 * @param {{ userId, week, saved: boolean, ticketOpened: boolean, plans: number }[]} input.intents
 *   one row per user per week, aggregated from PivotEventIntent
 */
function buildPivotGrowthOverview({
  members = [],
  deckOpens = [],
  intents = [],
  now = new Date(),
  dropDayOfWeek = 4,
  cohortWeeks = DEFAULT_COHORT_WEEKS,
  launchWeek = null,
} = {}) {
  const dropDay = normalizeDropDayOfWeek(dropDayOfWeek);
  const currentWeek = dropWeekOf(now, dropDay);
  const lastCompleteWeek = shiftIsoWeek(currentWeek, -1);
  let windowStart = shiftIsoWeek(currentWeek, -(normalizeCohortWeeks(cohortWeeks) - 1));
  if (launchWeek && launchWeek > windowStart) windowStart = launchWeek;
  const trendWeeks = weekRange(windowStart, currentWeek);
  // Before launch there is nothing to count yet; after, the window may be short.
  const weeksBack = trendWeeks.length;
  const counted = (row) => !launchWeek || row.week >= launchWeek;

  const countedIntents = intents.filter(counted);
  const swiped = indexByWeek(countedIntents);
  const planned = indexByWeek(countedIntents.filter((row) => row.saved));
  const ticketOpeners = indexByWeek(countedIntents.filter((row) => row.ticketOpened));
  const opened = unionIndex(indexByWeek(deckOpens.filter(counted)), swiped);
  const activityByDefinition = { opened, swiped, planned };

  const allMembers = members
    .filter((member) => member?.userId && (member.week || member.joinedAt))
    .map((member) => ({
      userId: String(member.userId),
      week: member.week || dropWeekOf(member.joinedAt, dropDay),
      referred: Boolean(member.referred),
    }));
  const cohortMembers = allMembers.filter(counted);

  const retention = {};
  ACTIVITY_DEFINITIONS.forEach((definition) => {
    retention[definition] = buildCohortTable(cohortMembers, activityByDefinition[definition], {
      cohortWeeks: weeksBack,
      currentWeek,
      dropDayOfWeek: dropDay,
    });
  });

  const plansByWeek = new Map();
  countedIntents.forEach((row) => {
    if (!row?.week) return;
    plansByWeek.set(row.week, (plansByWeek.get(row.week) || 0) + (Number(row.plans) || 0));
  });

  const series = trendWeeks.map((week) => {
    const joined = cohortMembers.filter((member) => member.week === week);
    return {
      week,
      startDate: weekStartDate(week, dropDay),
      complete: week < currentWeek,
      weeklyActive: activeIn(opened, week).size,
      newMembers: joined.length,
      referredMembers: joined.filter((member) => member.referred).length,
      planners: activeIn(planned, week).size,
      plansSaved: plansByWeek.get(week) || 0,
      ticketOpeners: activeIn(ticketOpeners, week).size,
    };
  });

  const growthAccounting = buildGrowthAccounting(opened, trendWeeks, currentWeek);
  const bySeriesWeek = (week) => series.find((row) => row.week === week) || {};
  const byAccountingWeek = (week) => growthAccounting.find((row) => row.week === week) || {};
  const last = bySeriesWeek(lastCompleteWeek);
  const prior = bySeriesWeek(shiftIsoWeek(lastCompleteWeek, -1));
  const openedTable = retention.opened;

  const headline = {
    weeklyActive: { value: last.weeklyActive ?? 0, previous: prior.weeklyActive ?? null },
    newMembers: {
      value: last.newMembers ?? 0,
      previous: prior.newMembers ?? null,
      referredShare: ratio(last.referredMembers ?? 0, last.newMembers ?? 0),
    },
    activation: {
      value: recentCohortRate(openedTable, 0),
      previous: recentCohortRate(openedTable, 0, { skip: HEADLINE_COHORTS }),
      cohorts: HEADLINE_COHORTS,
    },
    week1Retention: {
      value: recentCohortRate(openedTable, 1),
      previous: recentCohortRate(openedTable, 1, { skip: HEADLINE_COHORTS }),
      cohorts: HEADLINE_COHORTS,
    },
    quickRatio: {
      value: byAccountingWeek(lastCompleteWeek).quickRatio ?? null,
      previous: byAccountingWeek(shiftIsoWeek(lastCompleteWeek, -1)).quickRatio ?? null,
    },
    planRate: {
      value: ratio(last.planners ?? 0, last.weeklyActive ?? 0),
      previous: ratio(prior.planners ?? 0, prior.weeklyActive ?? 0),
    },
  };

  return {
    currentWeek,
    lastCompleteWeek,
    dropDayOfWeek: dropDay,
    cohortWeeks: weeksBack,
    launch: launchWeek
      ? {
          week: launchWeek,
          startDate: weekStartDate(launchWeek, dropDay),
          started: launchWeek <= currentWeek,
        }
      : null,
    totalMembers: cohortMembers.length,
    preLaunchMembers: allMembers.length - cohortMembers.length,
    headline,
    series,
    retention,
    growthAccounting,
    engagement: buildEngagementCurve(
      opened,
      lastCompleteWeek,
      launchWeek
        ? Math.min(ENGAGEMENT_WINDOW_WEEKS, trendWeeks.filter((week) => week < currentWeek).length)
        : ENGAGEMENT_WINDOW_WEEKS,
    ),
  };
}

module.exports = {
  ACTIVITY_DEFINITIONS,
  DEFAULT_COHORT_WEEKS,
  MAX_COHORT_WEEKS,
  buildPivotGrowthOverview,
  buildCohortTable,
  buildGrowthAccounting,
  buildEngagementCurve,
  dropWeekOf,
  normalizeCohortWeeks,
};
