const {
  PIVOT_DROP_PILOT_DEFAULTS,
  describePivotDropSchedule,
  formatPivotDropInstant,
  resolvePivotDropConfig,
  resolvePivotDropInstant,
  zonedLocalToUtc,
} = require('../../utilities/pivotDropSchedule');

describe('pivotDropSchedule', () => {
  const nycTenant = {
    tenantKey: 'nyc',
    tenantType: 'pivot',
    pivotDropTimezone: 'America/New_York',
    pivotDropDayOfWeek: 4,
    pivotDropHour: 18,
    pivotDropMinute: 0,
  };

  it('resolves default Thursday 6pm local for an ISO week', () => {
    const resolved = resolvePivotDropInstant(nycTenant, '2026-W23');
    expect(resolved.source).toBe('default');
    expect(resolved.dropAt.toISOString()).toBe('2026-06-04T22:00:00.000Z');
    expect(formatPivotDropInstant(resolved.dropAt, resolved.timezone)).toMatch(/Thu Jun 4/);
  });

  it('uses per-week override when batchWeek matches', () => {
    const tenant = {
      ...nycTenant,
      pivotDropOverrides: [
        { batchWeek: '2026-W23', dayOfWeek: 5, hour: 12, minute: 30 },
      ],
    };

    const resolved = resolvePivotDropInstant(tenant, '2026-W23');
    expect(resolved.source).toBe('override');
    expect(resolved.dayOfWeek).toBe(5);
    expect(resolved.hour).toBe(12);
    expect(resolved.minute).toBe(30);
    expect(resolved.dropAt.toISOString()).toBe('2026-06-05T16:30:00.000Z');
  });

  it('falls back to pilot defaults when tenant drop config is missing', () => {
    const tenant = { tenantKey: 'nyc', tenantType: 'pivot' };
    const config = resolvePivotDropConfig(tenant);
    expect(config.usingPilotDefaults).toBe(true);
    expect(config.timezone).toBe(PIVOT_DROP_PILOT_DEFAULTS.pivotDropTimezone);
    expect(config.dayOfWeek).toBe(PIVOT_DROP_PILOT_DEFAULTS.pivotDropDayOfWeek);
  });

  it('rejects invalid batchWeek values', () => {
    expect(() => resolvePivotDropInstant(nycTenant, '2026-99')).toThrow(/Invalid batchWeek/);
  });

  it('rejects non-pivot tenants', () => {
    expect(() =>
      resolvePivotDropInstant({ tenantKey: 'rpi', tenantType: 'campus' }, '2026-W23')
    ).toThrow(/not a pivot city/);
  });

  it('describes schedule for ops logging', () => {
    const resolved = resolvePivotDropInstant(nycTenant, '2026-W23');
    const description = describePivotDropSchedule(resolved);
    expect(description.localTime).toMatch(/Thu 18:00 America\/New_York/);
    expect(description.sourceLabel).toBe('tenant default');
    expect(description.formatted).toMatch(/Thu Jun 4/);
  });

  it('handles DST spring-forward edge in America/New_York', () => {
    const dropAt = zonedLocalToUtc({
      year: 2026,
      month: 3,
      day: 8,
      hour: 18,
      minute: 0,
      timeZone: 'America/New_York',
    });
    expect(dropAt.toISOString()).toBe('2026-03-08T22:00:00.000Z');
  });
});
