import { formatDelta, formatRate, weekdayInitial } from './pivotOverviewFormat';

describe('pivotOverviewFormat', () => {
  it('formats rates and deltas', () => {
    expect(formatRate(0.25)).toBe('25%');
    expect(formatRate(null)).toBe('—');
    expect(formatDelta(3)).toBe('+3 vs prev');
    expect(formatDelta(0)).toBe('flat vs prev');
  });

  it('maps Thursday to R', () => {
    expect(weekdayInitial('Thursday', '2026-07-09')).toBe('R');
    expect(weekdayInitial('', '2026-07-09')).toBe('R');
  });
});
