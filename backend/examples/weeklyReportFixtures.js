/**
 * Sample weekly reports, in the shape pivotWeeklyReportService.buildWeeklyReport
 * returns, for previewing the email design without a database:
 *   npm run preview:weekly-report            # pilot (default)
 *   npm run preview:weekly-report -- growing
 *   npm run preview:weekly-report -- first-week
 */
const { buildPreheader } = require('../services/pivotWeeklyReportEmail');

const DASHBOARD_URL = 'https://www.meridian.study/platform-admin/pivot?page=2';
const TREND_STARTS = [
  '2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27',
  '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24',
];

function trend(values) {
  return values.map((value, index) => ({
    week: `2026-W${32 + index}`,
    startDate: TREND_STARTS[index],
    value,
  }));
}

let cardCount = 0;
/** A batch card with a made-up event id and its Just Go page. */
function card(fields) {
  cardCount += 1;
  const eventId = `64f1234567890abcdef${String(cardCount).padStart(5, '0')}`;
  return { eventId, url: `https://justgo.lol/events/${eventId}`, ...fields };
}

function finish(report) {
  const full = {
    week: '2026-W39',
    startDate: '2026-09-24',
    endDate: '2026-09-30',
    period: 'sep 24 – sep 30',
    generatedAt: '2026-10-04T15:00:00.000Z',
    dashboardUrl: DASHBOARD_URL,
    failedCities: [],
    notLaunchedCities: [],
    preLaunchMembers: 0,
    batch: null,
    ...report,
  };
  full.preheader = buildPreheader(full);
  full.subject = full.weeklyActive == null
    ? `just go weekly · ${full.period}`
    : `just go weekly · ${full.period} · ${full.weeklyActive.toLocaleString('en-US')} actives`;
  return full;
}

const pilot = finish({
  notLaunchedCities: ['New York City'],
  totalMembers: 63,
  preLaunchMembers: 11,
  weeklyActive: 41,
  weeklyActivePrevious: 35,
  trend: trend([0, 0, 0, 0, 0, 22, 35, 41]).filter((point) => point.value > 0),
  accounting: { week: '2026-W39', active: 41, new: 9, resurrected: 4, retained: 28, churned: 7, quickRatio: 1.86 },
  activation: { active: 18, users: 24, rate: 0.75, cohorts: 3 },
  activationPrevious: null,
  week1: { active: 9, users: 15, rate: 0.6, cohorts: 2 },
  week1Previous: null,
  cohortCount: 3,
  retentionAverage: [
    { offset: 0, rate: 0.75, users: 24 },
    { offset: 1, rate: 0.6, users: 15 },
    { offset: 2, rate: 0.55, users: 9 },
  ],
  usage: {
    weeklyActive: 41,
    planners: 17,
    plannersPrevious: 12,
    plansSaved: 46,
    plansSavedPrevious: 31,
    ticketOpeners: 8,
    ticketOpenersPrevious: 8,
  },
  landing: { totals: { views: 1284, uniqueVisitors: 902, waitlistSignups: 57, storeClicks: 38 } },
  batch: {
    minReach: 5,
    cityCount: 1,
    events: 38,
    dealt: 31,
    landed: 24,
    passedByAll: 4,
    missingDetails: 3,
    swipes: 612,
    right: 171,
    going: 14,
    swipesPrevious: 498,
    rightPrevious: 124,
    rating: { average: 4.4, count: 6 },
    top: [
      card({ name: 'Rooftop Cinema: Chungking Express', city: 'San Francisco', right: 19, reached: 33 }),
      card({ name: 'Mission Night Market', city: 'San Francisco', right: 16, reached: 35 }),
      card({ name: 'Noise Pop Basement Show', city: 'San Francisco', right: 12, reached: 24 }),
    ],
    misses: [
      card({ name: 'Intro to Pickleball Clinic', city: 'San Francisco', right: 0, reached: 21 }),
      card({ name: 'Startup Pitch Breakfast', city: 'San Francisco', right: 0, reached: 17 }),
      card({ name: 'Wine & Paint Sip Session', city: 'San Francisco', right: 1, reached: 19 }),
    ],
    failedCities: [],
  },
  cities: [
    {
      tenantKey: 'sf',
      name: 'San Francisco',
      launchDate: '2026-09-10',
      weeklyActive: 41,
      weeklyActivePrevious: 35,
      newMembers: 9,
      planners: 17,
      week1: { active: 9, users: 15, rate: 0.6, cohorts: 2 },
    },
  ],
});

const growing = finish({
  totalMembers: 4180,
  preLaunchMembers: 214,
  weeklyActive: 1932,
  weeklyActivePrevious: 1788,
  trend: trend([820, 960, 1104, 1290, 1402, 1610, 1788, 1932]),
  accounting: { week: '2026-W39', active: 1932, new: 412, resurrected: 155, retained: 1365, churned: 423, quickRatio: 1.34 },
  activation: { active: 1290, users: 1702, rate: 0.758, cohorts: 4 },
  activationPrevious: 0.71,
  week1: { active: 702, users: 1544, rate: 0.455, cohorts: 4 },
  week1Previous: 0.47,
  cohortCount: 4,
  retentionAverage: [
    { offset: 0, rate: 0.758, users: 1702 },
    { offset: 1, rate: 0.455, users: 1544 },
    { offset: 2, rate: 0.39, users: 1310 },
    { offset: 3, rate: 0.36, users: 1102 },
    { offset: 4, rate: 0.35, users: 948 },
  ],
  usage: {
    weeklyActive: 1932,
    planners: 744,
    plannersPrevious: 690,
    plansSaved: 2381,
    plansSavedPrevious: 2203,
    ticketOpeners: 311,
    ticketOpenersPrevious: 340,
  },
  landing: { totals: { views: 48210, uniqueVisitors: 31877, waitlistSignups: 1904, storeClicks: 2210 } },
  failedCities: [{ tenantKey: 'chi', cityDisplayName: 'Chicago' }],
  batch: {
    minReach: 5,
    cityCount: 3,
    events: 412,
    dealt: 338,
    landed: 301,
    passedByAll: 22,
    missingDetails: 17,
    swipes: 28940,
    right: 8104,
    going: 486,
    swipesPrevious: 26210,
    rightPrevious: 7600,
    rating: { average: 4.2, count: 93 },
    top: [
      card({ name: 'Governors Ball Afterparty', city: 'New York City', right: 412, reached: 690 }),
      card({ name: 'Rooftop Cinema: Chungking Express', city: 'San Francisco', right: 388, reached: 702 }),
      card({ name: 'Smorgasburg Night Edition', city: 'New York City', right: 341, reached: 655 }),
    ],
    misses: [
      card({ name: 'LinkedIn Headshot Pop-up', city: 'Los Angeles', right: 1, reached: 64 }),
      card({ name: 'Crypto Founders Mixer', city: 'San Francisco', right: 3, reached: 118 }),
      card({ name: 'Timeshare Info Brunch', city: 'New York City', right: 4, reached: 97 }),
    ],
    failedCities: ['Chicago'],
  },
  cities: [
    { tenantKey: 'sf', name: 'San Francisco', launchDate: '2026-09-10', weeklyActive: 1104, weeklyActivePrevious: 1050, newMembers: 201, planners: 431, week1: { active: 402, users: 860 } },
    { tenantKey: 'nyc', name: 'New York City', launchDate: '2026-09-17', weeklyActive: 690, weeklyActivePrevious: 602, newMembers: 188, planners: 262, week1: { active: 240, users: 560 } },
    { tenantKey: 'la', name: 'Los Angeles', launchDate: '2026-09-24', weeklyActive: 138, weeklyActivePrevious: null, newMembers: 23, planners: 51, week1: null },
    { tenantKey: 'chi', name: 'Chicago', launchDate: '2026-09-24', error: 'timeout' },
  ],
});

const firstWeek = finish({
  week: '2026-W36',
  startDate: null,
  endDate: null,
  period: '2026-W36',
  totalMembers: 4,
  weeklyActive: null,
  weeklyActivePrevious: null,
  trend: [],
  accounting: null,
  activation: null,
  activationPrevious: null,
  week1: null,
  week1Previous: null,
  cohortCount: 4,
  retentionAverage: [],
  usage: null,
  landing: null,
  cities: [],
});

module.exports = {
  scenarios: { pilot, growing, 'first-week': firstWeek },
};
