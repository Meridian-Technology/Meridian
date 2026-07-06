const { toIsoWeek, isValidIsoWeek } = require('../../utilities/pivotIsoWeek');

describe('pivotIsoWeek', () => {
  it('formats known date as ISO week', () => {
    expect(toIsoWeek(new Date('2026-05-26T12:00:00.000Z'))).toMatch(/^2026-W\d{2}$/);
  });

  it('validates ISO week pattern', () => {
    expect(isValidIsoWeek('2026-W21')).toBe(true);
    expect(isValidIsoWeek('2026-W1')).toBe(false);
    expect(isValidIsoWeek('bad')).toBe(false);
  });
});
