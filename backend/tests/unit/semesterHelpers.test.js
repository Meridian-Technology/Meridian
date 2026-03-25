const {
  getCurrentSemester,
  isWithinCurrentSemester,
  validateRecurrenceWithinSemester,
  getRecurrenceOccurrences,
  getSemesterInfo,
  formatSemester,
  isNearSemesterEnd,
  getDaysRemainingInSemester,
} = require('../../utilities/semesterHelpers');

describe('semesterHelpers utilities', () => {
  test('detects semester type by date', () => {
    expect(getCurrentSemester(new Date(2026, 1, 1, 12, 0, 0, 0)).type).toBe('spring');
    expect(getCurrentSemester(new Date(2026, 6, 1, 12, 0, 0, 0)).type).toBe('summer');
    expect(getCurrentSemester(new Date(2026, 8, 1, 12, 0, 0, 0)).type).toBe('fall');
  });

  test('returns semester metadata and formatting', () => {
    const fall = getSemesterInfo(2026, 'fall');
    expect(fall.type).toBe('fall');
    expect(fall.year).toBe(2026);
    expect(formatSemester(fall)).toBe('Fall 2026');
  });

  test('throws on invalid semester type', () => {
    expect(() => getSemesterInfo(2026, 'winter')).toThrow(
      'Invalid semester type: winter'
    );
  });

  test('checks current-semester range inclusion', () => {
    const reference = new Date(2026, 1, 10, 12, 0, 0, 0);
    expect(isWithinCurrentSemester(new Date(2026, 3, 15, 12, 0, 0, 0), reference)).toBe(true);
    expect(isWithinCurrentSemester(new Date(2026, 5, 10, 12, 0, 0, 0), reference)).toBe(false);
  });

  test('caps weekly recurrence inside semester end', () => {
    const startDate = new Date(2026, 1, 1, 10, 0, 0, 0);
    const result = validateRecurrenceWithinSemester({ frequency: 'weekly' }, startDate);
    expect(result.isValid).toBe(true);
    expect(result.adjustedEndDate <= result.semesterEnd).toBe(true);

    const occurrences = getRecurrenceOccurrences(startDate, { frequency: 'weekly' });
    expect(occurrences.length).toBeGreaterThan(1);
    expect(occurrences[0].getFullYear()).toBe(2026);
    expect(occurrences[0].getMonth()).toBe(1);
    expect(occurrences[0].getDate()).toBe(1);
  });

  test('reports near-end and remaining days consistently', () => {
    const nearEndReference = new Date(2026, 4, 28, 12, 0, 0, 0);
    expect(isNearSemesterEnd(7, nearEndReference)).toBe(true);
    expect(getDaysRemainingInSemester(nearEndReference)).toBeGreaterThanOrEqual(0);
  });
});
