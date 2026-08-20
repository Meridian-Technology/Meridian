jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn(),
}));
jest.mock('../../services/pivotTenantOpsService', () => {
  const actual = jest.requireActual('../../services/pivotTenantOpsService');
  return {
    ...actual,
    getTenantOpsBundle: jest.fn(),
  };
});

const { getMergedTenants } = require('../../services/tenantConfigService');
const { getTenantOpsBundle } = require('../../services/pivotTenantOpsService');
const {
  getFleetOpsBundle,
  rollupFleetOverview,
  parseFleetInclude,
  emptyKpis,
} = require('../../services/pivotFleetOpsService');

function overviewBundle({
  tenantKey,
  cityDisplayName,
  kpis,
  vsPrevWeek = null,
  hostLiveWeekAlert = null,
  performanceEvents = [],
  insights = [],
  readiness = { score: 80, targetEventCount: 40, metrics: { readyCount: 40 }, hoursUntilDrop: 12 },
  retentionWeeks = [
    { batchWeek: '2026-W27', activeUsers: 10, returningUsers: null, retentionRate: null },
    { batchWeek: '2026-W28', activeUsers: 8, returningUsers: 4, retentionRate: 40 },
  ],
  crew = null,
  dropSchedule = {
    batchWeek: '2026-W28',
    nextDropAt: '2026-07-16T22:00:00.000Z',
    nextDropFormatted: 'Thu Jul 16',
  },
} = {}) {
  return {
    tenantKey,
    cityDisplayName,
    batchWeek: '2026-W28',
    dropSchedule,
    overview: {
      tenantKey,
      cityDisplayName,
      batchWeek: '2026-W28',
      previousBatchWeek: '2026-W27',
      kpis,
      vsPrevWeek,
      hostLiveWeekAlert,
      funnel: [],
      eventsByDay: [{ date: '2026-07-09', weekday: 'Thu', count: 3 }],
      dropSchedule,
    },
    performance: { events: performanceEvents },
    insights: { insights },
    readiness,
    retention: {
      batchWeek: '2026-W28',
      weeks: ['2026-W27', '2026-W28'],
      tenant: { tenantKey, cityDisplayName, weeks: retentionWeeks },
    },
    crewMetrics: crew || {
      tenantKey,
      cityDisplayName,
      batchWeek: '2026-W28',
      totalCrews: 2,
      weekStateCount: 2,
      kpis: {
        crewCreationRate: { rate: 0.5, usersWithCrew: 2, wau: 4 },
        quorumHitRate: { rate: 1, quorumMet: 1, activeCrews: 1 },
        judgementConfirmRate: { rate: 1, confirmed: 1, proposed: 1 },
        invitedJoinRate: { rate: 0.5, resolved: 1, sent: 2 },
        consensus: { deciding: 0, swapped: 0, swapsUsed: 0 },
        crossCrewSurfaces: { views: 4, clicks: 1, clickThroughRate: 0.25 },
      },
    },
  };
}

const NYC_KPIS = {
  activeUsers: 10,
  eventCount: 20,
  eventCountsByStatus: { draft: 2, staged: 3, published: 20, other: 0, total: 25 },
  hostDraft: 1,
  hostStaged: 0,
  hostPublished: 2,
  hostCreatedCounts: { hostDraft: 1, hostStaged: 0, hostPublished: 2, other: 0, total: 3 },
  interestedCount: 5,
  registeredCount: 3,
  externalOpenCount: 7,
  externalOpenUsers: 4,
  swipeCount: 20,
  feedbackCount: 2,
  feedbackAvg: 4,
  calendarAdds: 3,
  inviteShares: 1,
  interestsSaved: 2,
};

const BK_KPIS = {
  activeUsers: 6,
  eventCount: 10,
  eventCountsByStatus: { draft: 1, staged: 1, published: 10, other: 1, total: 13 },
  hostDraft: 2,
  hostStaged: 1,
  hostPublished: 0,
  hostCreatedCounts: { hostDraft: 2, hostStaged: 1, hostPublished: 0, other: 0, total: 3 },
  interestedCount: 2,
  registeredCount: 1,
  externalOpenCount: 1,
  externalOpenUsers: 1,
  swipeCount: 8,
  feedbackCount: 2,
  feedbackAvg: 5,
  calendarAdds: 1,
  inviteShares: 2,
  interestsSaved: 0,
};

describe('parseFleetInclude', () => {
  it('expands overview preset', () => {
    expect(parseFleetInclude('overview').sections).toEqual([
      'overview',
      'performance',
      'insights',
      'readiness',
      'retention',
      'crewMetrics',
    ]);
  });

  it('rejects curation and journeys', () => {
    expect(parseFleetInclude('curation').code).toBe('INVALID_INCLUDE');
    expect(parseFleetInclude('journeys').code).toBe('INVALID_INCLUDE');
  });
});

describe('rollupFleetOverview', () => {
  const nyc = {
    tenantKey: 'nyc',
    cityDisplayName: 'New York',
    bundle: overviewBundle({
      tenantKey: 'nyc',
      cityDisplayName: 'New York',
      kpis: NYC_KPIS,
      vsPrevWeek: {
        activeUsers: { current: 10, previous: 8, delta: 2 },
        eventCount: { current: 20, previous: 15, delta: 5 },
        interestedCount: { current: 5, previous: 4, delta: 1 },
        registeredCount: { current: 3, previous: 2, delta: 1 },
        externalOpenCount: { current: 7, previous: 5, delta: 2 },
        externalOpenUsers: { current: 4, previous: 3, delta: 1 },
        swipeCount: { current: 20, previous: 16, delta: 4 },
        calendarAdds: { current: 3, previous: 1, delta: 2 },
        inviteShares: { current: 1, previous: 0, delta: 1 },
        interestsSaved: { current: 2, previous: 2, delta: 0 },
        feedbackCount: { current: 2, previous: 1, delta: 1 },
        feedbackAvg: { current: 4, previous: 5, delta: -1 },
      },
      performanceEvents: [
        { eventId: 'e-nyc', name: 'NYC Night', interestedTotal: 12, externalOpen: 2 },
      ],
      insights: [
        { id: 'thin-catalog', severity: 'warn', title: 'Catalog below drop target', body: 'Add more.' },
      ],
      hostLiveWeekAlert: { active: true, hostDraft: 1, curationHref: '/c' },
      dropSchedule: {
        batchWeek: '2026-W28',
        nextDropAt: '2026-07-16T22:00:00.000Z',
        nextDropFormatted: 'Thu Jul 16',
      },
    }),
  };

  const brooklyn = {
    tenantKey: 'brooklyn',
    cityDisplayName: 'Brooklyn',
    bundle: overviewBundle({
      tenantKey: 'brooklyn',
      cityDisplayName: 'Brooklyn',
      kpis: BK_KPIS,
      vsPrevWeek: {
        activeUsers: { current: 6, previous: 4, delta: 2 },
        eventCount: { current: 10, previous: 10, delta: 0 },
        interestedCount: { current: 2, previous: 1, delta: 1 },
        registeredCount: { current: 1, previous: 1, delta: 0 },
        externalOpenCount: { current: 1, previous: 1, delta: 0 },
        externalOpenUsers: { current: 1, previous: 1, delta: 0 },
        swipeCount: { current: 8, previous: 6, delta: 2 },
        calendarAdds: { current: 1, previous: 0, delta: 1 },
        inviteShares: { current: 2, previous: 1, delta: 1 },
        interestsSaved: { current: 0, previous: 1, delta: -1 },
        feedbackCount: { current: 2, previous: 1, delta: 1 },
        feedbackAvg: { current: 5, previous: 3, delta: 2 },
      },
      performanceEvents: [
        { eventId: 'e-bk', name: 'BK Brunch', interestedTotal: 20, externalOpen: 1 },
        { eventId: 'e-bk-2', name: 'Quiet', interestedTotal: 1, externalOpen: 0 },
      ],
      insights: [
        { id: 'thin-catalog', severity: 'critical', title: 'Catalog below drop target', body: 'Urgent.' },
      ],
      readiness: {
        score: 40,
        targetEventCount: 40,
        metrics: { readyCount: 12 },
        hoursUntilDrop: 4,
      },
      retentionWeeks: [
        { batchWeek: '2026-W27', activeUsers: 5, returningUsers: null, retentionRate: null },
        { batchWeek: '2026-W28', activeUsers: 4, returningUsers: 2, retentionRate: 40 },
      ],
      crew: {
        tenantKey: 'brooklyn',
        totalCrews: 1,
        weekStateCount: 1,
        kpis: {
          crewCreationRate: { rate: 0.25, usersWithCrew: 1, wau: 4 },
          quorumHitRate: { rate: 0, quorumMet: 0, activeCrews: 1 },
          judgementConfirmRate: { rate: 0, confirmed: 0, proposed: 1 },
          invitedJoinRate: { rate: 1, resolved: 2, sent: 2 },
          consensus: { deciding: 1, swapped: 0, swapsUsed: 1 },
          crossCrewSurfaces: { views: 2, clicks: 1, clickThroughRate: 0.5 },
        },
      },
      dropSchedule: {
        batchWeek: '2026-W28',
        nextDropAt: '2026-07-15T22:00:00.000Z',
        nextDropFormatted: 'Wed Jul 15',
      },
    }),
  };

  it('sums counts and recomputes weighted rates', () => {
    const data = rollupFleetOverview([nyc, brooklyn], {
      batchWeek: '2026-W28',
      sections: parseFleetInclude('overview').sections,
      performanceLimit: 10,
    });

    expect(data.overview.kpis.activeUsers).toBe(16);
    expect(data.overview.kpis.eventCount).toBe(30);
    expect(data.overview.kpis.swipeCount).toBe(28);
    expect(data.overview.kpis.eventCountsByStatus).toEqual({
      draft: 3,
      staged: 4,
      published: 30,
      other: 1,
      total: 38,
    });
    expect(data.overview.kpis.hostCreatedCounts.hostDraft).toBe(3);
    expect(data.overview.kpis.feedbackAvg).toBe(4.5);
    expect(data.overview.funnel[0].value).toBe(28);
    expect(data.overview.eventsByDay).toEqual([]);
    expect(data.overview.cityContribution.map((row) => row.tenantKey)).toEqual([
      'nyc',
      'brooklyn',
    ]);
  });

  it('rebuilds vsPrev from summed current/previous, not averaged rates', () => {
    const data = rollupFleetOverview([nyc, brooklyn], {
      batchWeek: '2026-W28',
      sections: parseFleetInclude('overview').sections,
    });
    expect(data.overview.vsPrevWeek.activeUsers).toEqual({
      current: 16,
      previous: 12,
      delta: 4,
    });
    expect(data.overview.vsPrevWeek.feedbackAvg.current).toBe(4.5);
    expect(data.overview.vsPrevWeek.feedbackAvg.previous).toBe(4);
  });

  it('merges top events with city stamps and sorts by interestedTotal', () => {
    const data = rollupFleetOverview([nyc, brooklyn], {
      batchWeek: '2026-W28',
      sections: parseFleetInclude('overview').sections,
      performanceLimit: 2,
    });
    expect(data.performance.events).toHaveLength(2);
    expect(data.performance.events[0]).toMatchObject({
      eventId: 'e-bk',
      tenantKey: 'brooklyn',
      cityDisplayName: 'Brooklyn',
    });
    expect(data.performance.total).toBe(3);
  });

  it('prefixes insights with city, sorts by severity, and caps', () => {
    const data = rollupFleetOverview([nyc, brooklyn], {
      batchWeek: '2026-W28',
      sections: parseFleetInclude('overview').sections,
      insightCap: 1,
    });
    expect(data.insights.insights).toHaveLength(1);
    expect(data.insights.insights[0]).toMatchObject({
      id: 'brooklyn:thin-catalog',
      severity: 'critical',
      title: 'Brooklyn: Catalog below drop target',
    });
  });

  it('does not blend a single readiness score', () => {
    const data = rollupFleetOverview([nyc, brooklyn], {
      batchWeek: '2026-W28',
      sections: parseFleetInclude('overview').sections,
    });
    expect(data.readiness.score).toBeUndefined();
    expect(data.readiness.belowTarget).toBe(1);
    expect(data.readiness.worstScore).toBe(40);
    expect(data.readiness.soonestHoursUntilDrop).toBe(4);
    expect(data.readiness.cities).toHaveLength(2);
  });

  it('recomputes fleet retention from summed returning / prior active', () => {
    const data = rollupFleetOverview([nyc, brooklyn], {
      batchWeek: '2026-W28',
      sections: parseFleetInclude('overview').sections,
    });
    const week = data.retention.tenant.weeks.find((row) => row.batchWeek === '2026-W28');
    expect(week.activeUsers).toBe(12);
    expect(week.returningUsers).toBe(6);
    expect(week.retentionRate).toBe(40);
  });

  it('recomputes crew rates from summed numerators and denominators', () => {
    const data = rollupFleetOverview([nyc, brooklyn], {
      batchWeek: '2026-W28',
      sections: parseFleetInclude('overview').sections,
    });
    expect(data.crewMetrics.kpis.crewCreationRate).toEqual({
      rate: 0.375,
      usersWithCrew: 3,
      wau: 8,
    });
    expect(data.crewMetrics.vsPrevWeek).toBeNull();
  });

  it('picks the soonest drop and lists host live-week alerts', () => {
    const data = rollupFleetOverview([nyc, brooklyn], {
      batchWeek: '2026-W28',
      sections: parseFleetInclude('overview').sections,
    });
    expect(data.dropSchedule.tenantKey).toBe('brooklyn');
    expect(data.overview.hostLiveWeekAlerts).toHaveLength(1);
    expect(data.overview.hostLiveWeekAlerts[0].tenantKey).toBe('nyc');
  });

  it('skips failed cities and surfaces them on failedTenants', () => {
    const data = rollupFleetOverview(
      [nyc, { tenantKey: 'austin', cityDisplayName: 'Austin', error: 'AGGREGATION_FAILED', code: 'AGGREGATION_FAILED' }],
      { batchWeek: '2026-W28', sections: parseFleetInclude('overview').sections },
    );
    expect(data.overview.kpis.activeUsers).toBe(10);
    expect(data.failedTenants).toEqual([
      {
        tenantKey: 'austin',
        cityDisplayName: 'Austin',
        error: 'AGGREGATION_FAILED',
        code: 'AGGREGATION_FAILED',
      },
    ]);
  });

  it('returns an overview error when every city fails', () => {
    const data = rollupFleetOverview(
      [{ tenantKey: 'nyc', cityDisplayName: 'New York', error: 'down' }],
      { batchWeek: '2026-W28', sections: parseFleetInclude('overview').sections },
    );
    expect(data.overview.error).toBe('All cities failed to load overview.');
    expect(data.overview.kpis).toBeUndefined();
  });

  it('returns empty kpis when there are no cities', () => {
    const data = rollupFleetOverview([], {
      batchWeek: '2026-W28',
      sections: parseFleetInclude('overview').sections,
    });
    expect(data.overview.kpis).toEqual(emptyKpis());
    expect(data.cityCount).toBe(0);
  });
});

describe('getFleetOpsBundle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fans out in parallel and does not call Lab getPivotOverview', async () => {
    getMergedTenants.mockResolvedValue([
      { tenantKey: 'nyc', tenantType: 'pivot', location: 'New York' },
      { tenantKey: 'brooklyn', tenantType: 'pivot', location: 'Brooklyn' },
      { tenantKey: 'rpi', tenantType: 'campus' },
    ]);
    getTenantOpsBundle.mockImplementation(async (_req, options) => ({
      data: overviewBundle({
        tenantKey: options.tenantKey,
        cityDisplayName: options.tenantKey === 'nyc' ? 'New York' : 'Brooklyn',
        kpis: options.tenantKey === 'nyc' ? NYC_KPIS : BK_KPIS,
      }),
    }));

    const result = await getFleetOpsBundle(
      { globalDb: {} },
      { batchWeek: '2026-W28', include: 'overview', now: new Date('2026-07-10T18:00:00.000Z') },
    );

    expect(result.data.cityCount).toBe(2);
    expect(result.data.overview.kpis.activeUsers).toBe(16);
    expect(result.data.weekRange.timeZone).toBe('UTC');
    expect(result.data.anchors.liveWeek).toBe('2026-W28');
    expect(getTenantOpsBundle).toHaveBeenCalledTimes(2);
    expect(getTenantOpsBundle.mock.calls.map((call) => call[1].tenantKey).sort()).toEqual([
      'brooklyn',
      'nyc',
    ]);
  });

  it('returns INCLUDE_REQUIRED when missing', async () => {
    getMergedTenants.mockResolvedValue([]);
    const result = await getFleetOpsBundle({ globalDb: {} }, { batchWeek: '2026-W28' });
    expect(result.code).toBe('INCLUDE_REQUIRED');
    expect(getTenantOpsBundle).not.toHaveBeenCalled();
  });
});
