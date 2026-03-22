const {
  timeToMinutes,
  minutesToDateTime,
  hasTimeOverlap,
  getBlockDuration,
  validateTimeBlock,
  mergeOverlappingBlocks,
  findTimeGaps,
  roundToInterval,
  dayToLetter,
  getWeekBoundaries,
} = require('../../utilities/timeBlockHelper');

describe('timeBlockHelper utilities', () => {
  test('converts between Date and minutes-from-midnight', () => {
    const base = new Date(2026, 2, 10, 9, 30, 0, 0);
    expect(timeToMinutes(base)).toBe(570);

    const reconstructed = minutesToDateTime(570, new Date(2026, 2, 10, 0, 0, 0, 0));
    expect(reconstructed.getHours()).toBe(9);
    expect(reconstructed.getMinutes()).toBe(30);
  });

  test('detects overlap and duration correctly', () => {
    const blockA = {
      startTime: new Date(2026, 2, 10, 10, 0, 0, 0),
      endTime: new Date(2026, 2, 10, 11, 0, 0, 0),
    };
    const blockB = {
      startTime: new Date(2026, 2, 10, 10, 30, 0, 0),
      endTime: new Date(2026, 2, 10, 11, 15, 0, 0),
    };
    const blockC = {
      startTime: new Date(2026, 2, 10, 12, 0, 0, 0),
      endTime: new Date(2026, 2, 10, 12, 30, 0, 0),
    };

    expect(hasTimeOverlap(blockA, blockB)).toBe(true);
    expect(hasTimeOverlap(blockA, blockC)).toBe(false);
    expect(getBlockDuration(blockB)).toBe(45);
  });

  test('validates bad time blocks', () => {
    const pastBlock = {
      startTime: '2020-01-01T10:00:00.000Z',
      endTime: '2020-01-01T10:05:00.000Z',
    };
    const errors = validateTimeBlock(pastBlock);

    expect(errors).toContain('Time must be in the future');
    expect(errors).toContain('Minimum duration is 15 minutes');
  });

  test('merges overlapping blocks and finds gaps', () => {
    const blocks = [
      {
        startTime: new Date(2026, 2, 10, 10, 0, 0, 0),
        endTime: new Date(2026, 2, 10, 11, 0, 0, 0),
      },
      {
        startTime: new Date(2026, 2, 10, 10, 45, 0, 0),
        endTime: new Date(2026, 2, 10, 11, 30, 0, 0),
      },
      {
        startTime: new Date(2026, 2, 10, 12, 30, 0, 0),
        endTime: new Date(2026, 2, 10, 13, 0, 0, 0),
      },
    ];

    const merged = mergeOverlappingBlocks(blocks);
    expect(merged).toHaveLength(2);
    expect(new Date(merged[0].endTime).getHours()).toBe(11);
    expect(new Date(merged[0].endTime).getMinutes()).toBe(30);

    const gaps = findTimeGaps(merged, 30);
    expect(gaps).toHaveLength(1);
    expect(Math.round(gaps[0].duration)).toBe(60);
  });

  test('rounds to intervals and computes week boundaries', () => {
    const rounded = roundToInterval(new Date(2026, 2, 10, 10, 44, 0, 0), 15);
    expect(rounded.getMinutes()).toBe(45);

    expect(dayToLetter(4)).toBe('R');

    const boundaries = getWeekBoundaries(new Date(2026, 2, 10, 10, 0, 0, 0));
    expect(boundaries.startOfWeek.getDay()).toBe(0);
    expect(boundaries.endOfWeek.getDay()).toBe(6);
  });
});
