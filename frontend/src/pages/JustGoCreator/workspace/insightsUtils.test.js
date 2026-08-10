import {
  buildInsightsChart,
  buildIntentFunnel,
  dailyInterestCount,
  dailyWindowLabel,
  formatConversion,
  funnelBarWidth,
  sumDaily,
  totalViewCount,
} from './insightsUtils';

describe('totalViewCount', () => {
  it('adds anonymous views to logged-in views', () => {
    expect(totalViewCount({ views: 10, anonymousViews: 4 })).toBe(14);
  });

  it('treats missing analytics as zero', () => {
    expect(totalViewCount(null)).toBe(0);
    expect(totalViewCount({})).toBe(0);
  });
});

describe('buildIntentFunnel', () => {
  const stats = {
    analytics: { views: 80, anonymousViews: 20 },
    intents: {
      interested: 30,
      registered: 10,
      passed: 5,
      externalOpens: 40,
      externalOpenUsers: 20,
    },
  };

  it('orders the steps from views through to a ticket', () => {
    expect(buildIntentFunnel(stats).map((step) => step.key)).toEqual([
      'views',
      'interested',
      'tapped',
      'registered',
    ]);
  });

  it('counts interested the way ops does — interested plus registered', () => {
    const [, interested] = buildIntentFunnel(stats);

    expect(interested.value).toBe(40);
  });

  it('counts people who tapped rather than total taps, so conversions stay under 100%', () => {
    const [, , tapped] = buildIntentFunnel(stats);

    expect(tapped.value).toBe(20);
    expect(tapped.conversion).toBe(0.5);
  });

  it('leaves the first step without a conversion', () => {
    expect(buildIntentFunnel(stats)[0].conversion).toBeNull();
  });

  it('computes each conversion off the previous step', () => {
    const steps = buildIntentFunnel(stats);

    expect(steps[1].conversion).toBeCloseTo(0.4);
    expect(steps[3].conversion).toBeCloseTo(0.5);
  });

  it('reports no conversion instead of dividing by zero', () => {
    const steps = buildIntentFunnel({ analytics: {}, intents: {} });

    expect(steps.every((step) => step.value === 0)).toBe(true);
    expect(steps.every((step) => step.conversion === null)).toBe(true);
  });

  it('allows interest to run ahead of views without breaking', () => {
    const steps = buildIntentFunnel({
      analytics: { views: 2, anonymousViews: 0 },
      intents: { interested: 8, registered: 0, externalOpenUsers: 0 },
    });

    expect(steps[1].conversion).toBe(4);
    expect(formatConversion(steps[1].conversion)).toBe('400%');
  });

  it('handles missing stats entirely', () => {
    expect(buildIntentFunnel(undefined)).toHaveLength(4);
  });
});

describe('funnelBarWidth', () => {
  const steps = [{ value: 100 }, { value: 50 }, { value: 0 }];

  it('scales bars against the widest step', () => {
    expect(funnelBarWidth(100, steps)).toBe(100);
    expect(funnelBarWidth(50, steps)).toBe(50);
  });

  it('keeps a sliver visible for zero', () => {
    expect(funnelBarWidth(0, steps)).toBe(2);
  });

  it('does not divide by zero on an all-zero funnel', () => {
    expect(funnelBarWidth(0, [{ value: 0 }])).toBe(2);
  });
});

describe('formatConversion', () => {
  it('renders a rounded percentage', () => {
    expect(formatConversion(0.4)).toBe('40%');
    expect(formatConversion(0.333)).toBe('33%');
  });

  it('returns null for anything unusable', () => {
    expect(formatConversion(null)).toBeNull();
    expect(formatConversion(Infinity)).toBeNull();
    expect(formatConversion(Number.NaN)).toBeNull();
  });
});

describe('buildInsightsChart', () => {
  function series(values) {
    return values.map(([views, interested, registered = 0], index) => ({
      date: `2026-06-${String(index + 1).padStart(2, '0')}`,
      views,
      interested,
      registered,
    }));
  }

  it('reports each series peak separately because the scales are independent', () => {
    const chart = buildInsightsChart(series([[100, 2], [40, 6, 1]]));

    expect(chart.peakViews).toBe(100);
    expect(chart.peakInterest).toBe(7);
  });

  it('closes the area path back along the floor', () => {
    const chart = buildInsightsChart(series([[10, 1], [20, 2]]), {
      width: 100,
      height: 50,
      padding: 5,
    });

    expect(chart.areaPath.startsWith('M ')).toBe(true);
    expect(chart.areaPath.endsWith('L 95.00,45.00 L 5.00,45.00 Z')).toBe(true);
  });

  it('puts the peak at the top and zero on the floor', () => {
    const chart = buildInsightsChart(series([[0, 0], [10, 0]]), {
      width: 100,
      height: 50,
      padding: 5,
    });

    expect(chart.areaPath).toContain('5.00,45.00');
    expect(chart.areaPath).toContain('95.00,5.00');
  });

  it('stays flat on the floor for an all-zero window instead of dividing by zero', () => {
    const chart = buildInsightsChart(series([[0, 0], [0, 0], [0, 0]]), {
      width: 100,
      height: 50,
      padding: 5,
    });

    expect(chart.hasSignal).toBe(false);
    expect(chart.linePath).toBe('M 5.00,45.00 L 50.00,45.00 L 95.00,45.00');
  });

  it('flags signal when either series has anything in it', () => {
    expect(buildInsightsChart(series([[0, 0], [0, 1]])).hasSignal).toBe(true);
    expect(buildInsightsChart(series([[1, 0], [0, 0]])).hasSignal).toBe(true);
  });

  it('returns null when there is not enough of a window to draw', () => {
    expect(buildInsightsChart([])).toBeNull();
    expect(buildInsightsChart(series([[1, 1]]))).toBeNull();
    expect(buildInsightsChart(undefined)).toBeNull();
  });

  it('tolerates gaps in the series', () => {
    const chart = buildInsightsChart([{ date: 'a' }, { date: 'b', views: 4 }]);

    expect(chart.peakViews).toBe(4);
    expect(chart.peakInterest).toBe(0);
  });
});

describe('dailyInterestCount', () => {
  it('adds both first-touch series together', () => {
    expect(dailyInterestCount({ interested: 3, registered: 2 })).toBe(5);
    expect(dailyInterestCount(undefined)).toBe(0);
  });
});

describe('dailyWindowLabel', () => {
  it('returns the first and last day of the window', () => {
    expect(
      dailyWindowLabel([{ date: '2026-06-02' }, { date: '2026-06-15' }]),
    ).toEqual({ first: '2026-06-02', last: '2026-06-15' });
  });

  it('returns null for an empty window', () => {
    expect(dailyWindowLabel([])).toBeNull();
  });
});

describe('sumDaily', () => {
  it('totals a picked field across the window', () => {
    const daily = [{ views: 3 }, { views: 4 }, {}];

    expect(sumDaily(daily, (day) => day.views)).toBe(7);
    expect(sumDaily(undefined, (day) => day.views)).toBe(0);
  });
});
