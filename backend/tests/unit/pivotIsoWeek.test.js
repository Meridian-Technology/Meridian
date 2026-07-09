const {
  toIsoWeek,
  isValidIsoWeek,
  isoWeekToMondayUtc,
  isoWeekToUtcRange,
  shiftIsoWeek,
} = require('../../utilities/pivotIsoWeek');

describe('pivotIsoWeek', () => {
  it('formats known date as ISO week', () => {
    expect(toIsoWeek(new Date('2026-05-26T12:00:00.000Z'))).toMatch(/^2026-W\d{2}$/);
  });

  it('validates ISO week pattern', () => {
    expect(isValidIsoWeek('2026-W21')).toBe(true);
    expect(isValidIsoWeek('2026-W1')).toBe(false);
    expect(isValidIsoWeek('bad')).toBe(false);
  });

  describe('isoWeekToMondayUtc', () => {
    it('returns the Monday starting the week', () => {
      // 2026-W27 starts Monday 2026-06-29.
      expect(isoWeekToMondayUtc('2026-W27').toISOString()).toBe('2026-06-29T00:00:00.000Z');
    });

    it('throws on invalid input', () => {
      expect(() => isoWeekToMondayUtc('2026-27')).toThrow(/Invalid batchWeek/);
    });
  });

  describe('isoWeekToUtcRange', () => {
    it('covers Monday through the following Monday', () => {
      const { start, end } = isoWeekToUtcRange('2026-W27');
      expect(start.toISOString()).toBe('2026-06-29T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    });
  });

  describe('shiftIsoWeek', () => {
    it('shifts forward and backward', () => {
      expect(shiftIsoWeek('2026-W27', 1)).toBe('2026-W28');
      expect(shiftIsoWeek('2026-W27', -1)).toBe('2026-W26');
      expect(shiftIsoWeek('2026-W27', 0)).toBe('2026-W27');
    });

    it('crosses ISO year boundaries', () => {
      expect(shiftIsoWeek('2026-W01', -1)).toBe('2025-W52');
      expect(shiftIsoWeek('2025-W52', 1)).toBe('2026-W01');
    });
  });
});
