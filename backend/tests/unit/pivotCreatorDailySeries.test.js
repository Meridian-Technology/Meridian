const {
  CREATOR_DAILY_WINDOW_DAYS,
  buildDailyWindow,
  toUtcDateKey,
  zeroFillDailySeries,
} = require('../../utilities/pivotCreatorDailySeries');

describe('buildDailyWindow', () => {
  const NOW = new Date('2026-06-15T09:30:00.000Z');

  it('spans 14 UTC days ending today by default', () => {
    const { keys } = buildDailyWindow(undefined, NOW);

    expect(CREATOR_DAILY_WINDOW_DAYS).toBe(14);
    expect(keys).toHaveLength(14);
    expect(keys[0]).toBe('2026-06-02');
    expect(keys[13]).toBe('2026-06-15');
  });

  it('starts at UTC midnight and ends at the last millisecond of today', () => {
    const { startDate, endDate } = buildDailyWindow(14, NOW);

    expect(startDate.toISOString()).toBe('2026-06-02T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-06-15T23:59:59.999Z');
  });

  it('crosses month and year boundaries', () => {
    expect(buildDailyWindow(3, new Date('2026-03-02T12:00:00.000Z')).keys).toEqual([
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(buildDailyWindow(3, new Date('2027-01-01T12:00:00.000Z')).keys).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
  });

  it('buckets by UTC rather than the server local day', () => {
    // Late UTC evening: a local-time implementation would roll this into the next day.
    const { keys } = buildDailyWindow(1, new Date('2026-06-15T23:45:00.000Z'));

    expect(keys).toEqual(['2026-06-15']);
  });

  it('falls back to the default span for nonsense lengths', () => {
    expect(buildDailyWindow(0, NOW).keys).toHaveLength(14);
    expect(buildDailyWindow(-3, NOW).keys).toHaveLength(14);
    expect(buildDailyWindow(2.5, NOW).keys).toHaveLength(14);
  });
});

describe('toUtcDateKey', () => {
  it('returns the UTC day for a date or an ISO string', () => {
    expect(toUtcDateKey(new Date('2026-06-15T23:59:00.000Z'))).toBe('2026-06-15');
    expect(toUtcDateKey('2026-06-15T00:00:00.000Z')).toBe('2026-06-15');
  });

  it('returns null for an unusable value', () => {
    expect(toUtcDateKey('not-a-date')).toBeNull();
  });
});

describe('zeroFillDailySeries', () => {
  const keys = ['2026-06-13', '2026-06-14', '2026-06-15'];

  it('zero-fills every day with no activity', () => {
    expect(zeroFillDailySeries(keys)).toEqual([
      { date: '2026-06-13', views: 0, interested: 0, registered: 0 },
      { date: '2026-06-14', views: 0, interested: 0, registered: 0 },
      { date: '2026-06-15', views: 0, interested: 0, registered: 0 },
    ]);
  });

  it('merges view and intent buckets onto the right days', () => {
    const series = zeroFillDailySeries(keys, {
      viewRows: [
        { _id: '2026-06-13', views: 5 },
        { _id: '2026-06-15', views: 2 },
      ],
      intentRows: [{ _id: '2026-06-15', interested: 3, registered: 1 }],
    });

    expect(series).toEqual([
      { date: '2026-06-13', views: 5, interested: 0, registered: 0 },
      { date: '2026-06-14', views: 0, interested: 0, registered: 0 },
      { date: '2026-06-15', views: 2, interested: 3, registered: 1 },
    ]);
  });

  it('ignores buckets outside the window instead of appending them', () => {
    const series = zeroFillDailySeries(keys, {
      viewRows: [{ _id: '2026-05-01', views: 99 }],
    });

    expect(series).toHaveLength(3);
    expect(series.every((day) => day.views === 0)).toBe(true);
  });

  it('tolerates malformed rows', () => {
    const series = zeroFillDailySeries(keys, {
      viewRows: [null, { views: 4 }, { _id: 7, views: 4 }],
      intentRows: undefined,
    });

    expect(series.every((day) => day.views === 0)).toBe(true);
  });

  it('returns an empty series for an empty window', () => {
    expect(zeroFillDailySeries([])).toEqual([]);
    expect(zeroFillDailySeries(undefined)).toEqual([]);
  });
});
