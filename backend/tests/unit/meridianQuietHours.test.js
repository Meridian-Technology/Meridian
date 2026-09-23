const {
  quietHoursDelayMs,
  quietHoursSendBlock,
  resolveQuietHours,
} = require('../../utilities/meridianQuietHours');
const { resolveNotificationCheckConfig } = require('../../utilities/meridianNotificationCheckConfig');

describe('quiet hours', () => {
  it('blocks 10pm through 7:59am in the city timezone and allows 8:00am', () => {
    const zone = 'America/New_York';
    // 02:00 EDT = 06:00 UTC in June
    const night = new Date('2026-06-06T06:00:00.000Z');
    expect(quietHoursDelayMs(night, zone)).toBeGreaterThan(0);
    expect(quietHoursSendBlock({ now: night, timeZone: zone }).code).toBe('QUIET_HOURS');

    // 22:15 EDT = 02:15 UTC
    const late = new Date('2026-06-06T02:15:00.000Z');
    expect(quietHoursDelayMs(late, zone)).toBe((9 * 60 + 45) * 60 * 1000);

    // 08:00 EDT = 12:00 UTC
    const morning = new Date('2026-06-06T12:00:00.000Z');
    expect(quietHoursDelayMs(morning, zone)).toBe(0);
    expect(quietHoursSendBlock({ now: morning, timeZone: zone })).toBeNull();

    // 21:30 EDT = 01:30 UTC next day
    const evening = new Date('2026-06-07T01:30:00.000Z');
    expect(quietHoursDelayMs(evening, zone)).toBe(0);
  });

  it('uses triggerConfig quiet hours and treats equal hours as off', () => {
    expect(resolveQuietHours({ quietHours: { startHour: 23, endHour: 7 } })).toEqual({
      startHour: 23,
      endHour: 7,
    });
    expect(quietHoursDelayMs(
      new Date('2026-06-06T12:00:00.000Z'),
      'America/New_York',
      { startHour: 9, endHour: 9 },
    )).toBe(0);
  });

  it('keeps check defaults unless triggerConfig turns a rule off', () => {
    const defaults = resolveNotificationCheckConfig({});
    expect(defaults.solo.requireNoCrew).toBe(true);
    expect(defaults.crew.nudgeConsensus).toBe(true);
    expect(defaults.discovery.on).toBe('catalog_publish');

    const custom = resolveNotificationCheckConfig({
      requireNoCrew: false,
      nudgeConsensus: false,
      on: 'both',
    });
    expect(custom.solo.requireNoCrew).toBe(false);
    expect(custom.crew.nudgeConsensus).toBe(false);
    expect(custom.discovery.on).toBe('both');
  });
});
