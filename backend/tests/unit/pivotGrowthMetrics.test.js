const {
  buildPivotGrowthOverview,
  dropWeekOf,
  normalizeCohortWeeks,
} = require('../../utilities/pivotGrowthMetrics');

// Thursday drops. Cycles: W37 Sep 10–16, W38 Sep 17–23, W39 Sep 24–30, W40 Oct 1–7.
const NOW = new Date('2026-10-01T12:00:00Z');

function fixture() {
  return {
    now: NOW,
    dropDayOfWeek: 4,
    cohortWeeks: 4,
    members: [
      { userId: 'a', joinedAt: '2026-09-10T12:00:00Z', referred: true },
      { userId: 'b', joinedAt: '2026-09-11T12:00:00Z' },
      { userId: 'c', joinedAt: '2026-09-17T12:00:00Z' },
      { userId: 'd', joinedAt: '2026-10-01T02:00:00Z' },
    ],
    deckOpens: [
      { userId: 'a', week: '2026-W37' },
      { userId: 'b', week: '2026-W37' },
      { userId: 'a', week: '2026-W40' },
      { userId: 'd', week: '2026-W40' },
    ],
    intents: [
      { userId: 'a', week: '2026-W38', plans: 2, saved: true, ticketOpened: true },
      { userId: 'c', week: '2026-W39', plans: 0, saved: false, ticketOpened: false },
    ],
  };
}

describe('pivotGrowthMetrics', () => {
  it('keys a timestamp to the drop cycle that contains it', () => {
    expect(dropWeekOf(new Date('2026-09-23T23:59:00Z'), 4)).toBe('2026-W38');
    expect(dropWeekOf(new Date('2026-09-24T00:00:00Z'), 4)).toBe('2026-W39');
    expect(dropWeekOf(new Date('2026-09-30T12:00:00Z'), 4)).toBe('2026-W39');
    expect(dropWeekOf(new Date('2026-09-28T12:00:00Z'), 1)).toBe('2026-W40');
  });

  it('clamps the cohort window', () => {
    expect(normalizeCohortWeeks(undefined)).toBe(12);
    expect(normalizeCohortWeeks('2')).toBe(4);
    expect(normalizeCohortWeeks('99')).toBe(26);
  });

  it('builds a triangle with activation at week 0 and unknown future cells', () => {
    const overview = buildPivotGrowthOverview(fixture());
    expect(overview.currentWeek).toBe('2026-W40');
    expect(overview.lastCompleteWeek).toBe('2026-W39');

    const { cohorts, average } = overview.retention.opened;
    expect(cohorts.map((row) => [row.week, row.size])).toEqual([
      ['2026-W37', 2],
      ['2026-W38', 1],
      ['2026-W39', 0],
      ['2026-W40', 1],
    ]);
    expect(cohorts[0].startDate).toBe('2026-09-10');

    const [w37, w38, , w40] = cohorts;
    expect(w37.cells.map((cell) => [cell.rate, cell.complete])).toEqual([
      [1, true],
      [0.5, true],
      [0, true],
      [0.5, false],
    ]);
    expect(w38.cells.map((cell) => cell.rate)).toEqual([0, 1, 0]);
    expect(w38.cells[2].complete).toBe(false);
    expect(w40.cells).toEqual([{ offset: 0, active: 1, rate: 1, complete: false }]);

    // Weighted by cohort size, complete cells only; offset 3 has none yet.
    expect(average).toEqual([
      { offset: 0, rate: 0.667, cohorts: 2, users: 3 },
      { offset: 1, rate: 0.667, cohorts: 2, users: 3 },
      { offset: 2, rate: 0, cohorts: 1, users: 2 },
    ]);
  });

  it('scopes cohort retention to the chosen activity definition', () => {
    const { retention } = buildPivotGrowthOverview(fixture());
    expect(retention.swiped.cohorts[0].cells.map((cell) => cell.rate)).toEqual([0, 0.5, 0, 0]);
    expect(retention.planned.cohorts[1].cells.map((cell) => cell.rate)).toEqual([0, 0, 0]);
  });

  it('accounts for weekly growth: new, retained, resurrected, churned', () => {
    const { growthAccounting } = buildPivotGrowthOverview(fixture());
    const rows = Object.fromEntries(growthAccounting.map((row) => [row.week, row]));

    expect(rows['2026-W37']).toMatchObject({ active: 2, new: 2, churned: 0, quickRatio: null });
    expect(rows['2026-W38']).toMatchObject({ active: 1, retained: 1, churned: 1, quickRatio: 0 });
    expect(rows['2026-W39']).toMatchObject({ active: 1, new: 1, churned: 1, quickRatio: 1 });
    // The week in progress: gains so far, churn not yet knowable.
    expect(rows['2026-W40']).toMatchObject({
      active: 2,
      new: 1,
      resurrected: 1,
      churned: null,
      quickRatio: null,
      complete: false,
    });
  });

  it('counts weeks active over the last four complete weeks', () => {
    const { engagement } = buildPivotGrowthOverview(fixture());
    expect(engagement.weeks).toEqual(['2026-W36', '2026-W37', '2026-W38', '2026-W39']);
    expect(engagement.activeUsers).toBe(3);
    expect(engagement.buckets.map((bucket) => bucket.users)).toEqual([2, 1, 0, 0]);
  });

  it('reports headline numbers for the last complete week', () => {
    const { headline, series } = buildPivotGrowthOverview(fixture());

    expect(headline.weeklyActive).toEqual({ value: 1, previous: 1 });
    expect(headline.planRate).toEqual({ value: 0, previous: 1 });
    expect(headline.quickRatio).toEqual({ value: 1, previous: 0 });
    // Needs four cohorts with a complete week before it reports a rate.
    expect(headline.week1Retention.value).toBeNull();

    const w37 = series.find((row) => row.week === '2026-W37');
    expect(w37).toMatchObject({ newMembers: 2, referredMembers: 1, weeklyActive: 2 });
    const w38 = series.find((row) => row.week === '2026-W38');
    expect(w38).toMatchObject({ planners: 1, plansSaved: 2, ticketOpeners: 1 });
  });

  it('reports cohort headline rates once four cohorts have matured', () => {
    const members = [];
    const deckOpens = [];
    ['2026-W33', '2026-W34', '2026-W35', '2026-W36', '2026-W37', '2026-W38'].forEach(
      (week, index) => {
        const start = new Date(Date.UTC(2026, 7, 13 + index * 7, 12));
        ['x', 'y'].forEach((suffix) => {
          const userId = `${week}-${suffix}`;
          members.push({ userId, joinedAt: start });
          deckOpens.push({ userId, week });
        });
        deckOpens.push({ userId: `${week}-x`, week: `2026-W${Number(week.slice(-2)) + 1}` });
      },
    );

    const { headline } = buildPivotGrowthOverview({
      now: NOW,
      members,
      deckOpens,
      cohortWeeks: 12,
    });

    expect(headline.activation.value).toBe(1);
    expect(headline.week1Retention.value).toBe(0.5);
  });

  it('starts counting at the launch week', () => {
    const overview = buildPivotGrowthOverview({ ...fixture(), launchWeek: '2026-W38' });

    expect(overview.launch).toEqual({ week: '2026-W38', startDate: '2026-09-17', started: true });
    // a and b joined in W37, before launch: left out of cohorts, but counted.
    expect(overview.preLaunchMembers).toBe(2);
    expect(overview.totalMembers).toBe(2);
    expect(overview.cohortWeeks).toBe(3);
    expect(overview.retention.opened.cohorts.map((row) => row.week)).toEqual([
      '2026-W38',
      '2026-W39',
      '2026-W40',
    ]);
    expect(overview.series.map((row) => row.week)).toEqual(['2026-W38', '2026-W39', '2026-W40']);

    // W37 activity is ignored, so a's W38 swipe is their first counted week.
    const w38 = overview.growthAccounting.find((row) => row.week === '2026-W38');
    expect(w38).toMatchObject({ active: 1, new: 1, retained: 0, churned: 0 });
    // Only two complete weeks since launch.
    expect(overview.engagement.weeks).toEqual(['2026-W38', '2026-W39']);
  });

  it('counts nothing yet when launch is in the future', () => {
    const overview = buildPivotGrowthOverview({ ...fixture(), launchWeek: '2026-W42' });

    expect(overview.launch).toMatchObject({ week: '2026-W42', started: false });
    expect(overview.cohortWeeks).toBe(0);
    expect(overview.series).toEqual([]);
    expect(overview.retention.opened).toEqual({ cohorts: [], average: [] });
    expect(overview.headline.weeklyActive).toEqual({ value: 0, previous: null });
    expect(overview.engagement).toMatchObject({ weeks: [], activeUsers: 0, buckets: [] });
  });

  it('reports no launch when none is set', () => {
    const overview = buildPivotGrowthOverview(fixture());
    expect(overview.launch).toBeNull();
    expect(overview.preLaunchMembers).toBe(0);
  });
});
