const {
  PIVOT_DROP_PILOT_DEFAULTS,
  describePivotDropSchedule,
  formatPivotDropInstant,
  resolvePivotDropConfig,
  resolvePivotDropInstant,
  resolvePivotLiveBatchWeek,
  resolvePivotOpsLiveWeek,
  resolvePivotStageAnchors,
  resolveStageForBatchWeek,
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

  it('resolvePivotLiveBatchWeek stays on previous week before the drop instant', () => {
    const tenant = {...nycTenant, pivotPilot: true};
    const now = new Date('2026-07-13T16:00:00.000Z');
    expect(resolvePivotLiveBatchWeek(tenant, now)).toBe('2026-W28');
  });

  it('resolvePivotLiveBatchWeek advances after the drop instant', () => {
    const tenant = {...nycTenant, pivotPilot: true};
    const now = new Date('2026-07-17T23:00:00.000Z');
    expect(resolvePivotLiveBatchWeek(tenant, now)).toBe('2026-W29');
  });

  it('resolvePivotOpsLiveWeek keeps previous ISO week live before the drop instant', () => {
    const tenant = {...nycTenant, pivotPilot: true};
    const now = new Date('2026-07-13T16:00:00.000Z');
    expect(resolvePivotOpsLiveWeek(tenant, now)).toBe('2026-W28');
  });

  it('resolvePivotOpsLiveWeek switches to current week after the drop instant', () => {
    const tenant = {...nycTenant, pivotPilot: true};
    const now = new Date('2026-07-17T23:00:00.000Z');
    expect(resolvePivotOpsLiveWeek(tenant, now)).toBe('2026-W29');
  });

  it('resolvePivotStageAnchors uses drop-cycle live week before the next drop', () => {
    const tenant = {...nycTenant, pivotPilot: true};
    const now = new Date('2026-07-13T16:00:00.000Z');
    const anchors = resolvePivotStageAnchors(tenant, now);
    expect(anchors.currentWeek).toBe('2026-W29');
    expect(anchors.liveWeek).toBe('2026-W28');
    expect(anchors.curateWeek).toBe('2026-W29');
    expect(anchors.postMortemWeek).toBe('2026-W27');
    expect(anchors.dropPending).toBe(true);
    expect(resolveStageForBatchWeek('2026-W28', tenant, now)).toBe('live');
    expect(resolveStageForBatchWeek('2026-W29', tenant, now)).toBe('curate');
    expect(resolveStageForBatchWeek('2026-W27', tenant, now)).toBe('post-mortem');
  });

  it('resolvePivotStageAnchors advances curate week after the drop', () => {
    const tenant = {...nycTenant, pivotPilot: true};
    const now = new Date('2026-07-17T23:00:00.000Z');
    const anchors = resolvePivotStageAnchors(tenant, now);
    expect(anchors.liveWeek).toBe('2026-W29');
    expect(anchors.curateWeek).toBe('2026-W30');
    expect(anchors.dropPending).toBe(false);
    expect(resolveStageForBatchWeek('2026-W29', tenant, now)).toBe('live');
  });
});
