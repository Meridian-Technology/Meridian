const {
  toIsoWeek,
  isValidIsoWeek,
  isoWeekToMondayUtc,
  isoWeekToUtcRange,
  batchWeekToDropCycleUtcRange,
  batchWeekToEventWindowUtcRange,
  formatBatchWeekRangeLabel,
  shiftIsoWeek,
  batchWeekFromEventDate,
  resolveEventBatchWeek,
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

  describe('batchWeekToEventWindowUtcRange', () => {
    it('covers drop day through the Wednesday before the next drop', () => {
      const { start, end } = batchWeekToEventWindowUtcRange('2026-W28', 4);
      expect(start.toISOString()).toBe('2026-07-09T12:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-15T12:00:00.000Z');
    });
  });

  describe('formatBatchWeekRangeLabel', () => {
    it('formats Thu–Wed drop cycle labels in tenant timezone', () => {
      expect(formatBatchWeekRangeLabel('2026-W28', { dropDayOfWeek: 4, timeZone: 'UTC' })).toBe(
        'Jul 9 – Jul 15, 2026',
      );
      expect(
        formatBatchWeekRangeLabel('2026-W28', {
          dropDayOfWeek: 4,
          timeZone: 'America/New_York',
        }),
      ).toBe('Jul 9 – Jul 15, 2026');
      expect(
        formatBatchWeekRangeLabel('2026-W29', {
          dropDayOfWeek: 4,
          timeZone: 'America/New_York',
        }),
      ).toBe('Jul 16 – Jul 22, 2026');
    });
  });

  describe('shiftIsoWeek', () => {
    it('shifts forward and backward', () => {
      expect(shiftIsoWeek('2026-W27', 1)).toBe('2026-W28');
      expect(shiftIsoWeek('2026-W27', -1)).toBe('2026-W26');
      expect(shiftIsoWeek('2026-W27', 0)).toBe('2026-W27');
    });

    it('crosses year boundaries', () => {
      expect(shiftIsoWeek('2026-W01', -1)).toBe('2025-W52');
    });
  });

  describe('batchWeekFromEventDate', () => {
    it('derives ISO week from a start datetime', () => {
      // Monday 2026-06-29 is in 2026-W27.
      expect(batchWeekFromEventDate('2026-06-29T20:00:00.000Z')).toBe('2026-W27');
      expect(batchWeekFromEventDate(new Date('2026-07-10T18:00:00.000Z'))).toBe('2026-W28');
    });

    it('returns null for invalid values', () => {
      expect(batchWeekFromEventDate(null)).toBeNull();
      expect(batchWeekFromEventDate('not-a-date')).toBeNull();
    });
  });

  describe('resolveEventBatchWeek', () => {
    it('uses event start date by default', () => {
      const result = resolveEventBatchWeek({
        batchWeek: '2026-W30',
        startTime: '2026-06-29T20:00:00.000Z',
      });
      expect(result).toEqual({ batchWeek: '2026-W27', source: 'event-date' });
    });

    it('uses first time-slot when startTime missing', () => {
      const result = resolveEventBatchWeek({
        timeSlots: [{ start_time: '2026-07-10T18:00:00.000Z' }],
      });
      expect(result).toEqual({ batchWeek: '2026-W28', source: 'event-date' });
    });

    it('honors forceBatchWeek override', () => {
      const result = resolveEventBatchWeek({
        forceBatchWeek: true,
        batchWeek: '2026-W30',
        startTime: '2026-06-29T20:00:00.000Z',
      });
      expect(result).toEqual({ batchWeek: '2026-W30', source: 'forced' });
    });

    it('requires batchWeek when forcing', () => {
      const result = resolveEventBatchWeek({ forceBatchWeek: true });
      expect(result.code).toBe('BATCH_WEEK_REQUIRED');
    });

    it('falls back to provided batchWeek when undated', () => {
      const result = resolveEventBatchWeek({ batchWeek: '2026-W30' });
      expect(result).toEqual({ batchWeek: '2026-W30', source: 'fallback' });
    });
  });
});
