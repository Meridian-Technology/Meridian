import { describeSchedule } from './notificationDefinitionCron';
import {
  describeWhoRules,
  lastRunForSchedule,
  scheduleCadence,
  scheduleName,
  schedulePurpose,
  sortSchedules,
} from './notificationScheduleCopy';

describe('describeSchedule', () => {
  it('phrases the cadences operators actually save', () => {
    expect(describeSchedule('0,30 * * * *')).toBe('Checks at :00 and :30');
    expect(describeSchedule('0,30 8-21 * * *')).toBe('Checks at :00 and :30, 8:00 AM to 9:30 PM');
    expect(describeSchedule('0 * * * *')).toBe('Checks on the hour');
    expect(describeSchedule('30 * * * *')).toBe('Checks at :30');
    expect(describeSchedule('0 18 * * *')).toBe('Every day at 6:00 PM');
    expect(describeSchedule('0 18 * * 5')).toBe('Fridays at 6:00 PM');
  });
});

describe('schedule copy', () => {
  const fleet = {
    definitionKey: 'ritual_crew_scan',
    handlerKey: 'ritual_crew_scan',
    tenantKey: null,
    enabled: true,
    scheduleCron: '0,30 * * * *',
  };

  it('names a schedule in plain language and keeps city scope on the cadence', () => {
    expect(scheduleName(fleet)).toBe('Crew swipe nudge');
    expect(schedulePurpose(fleet)).toBe('Nudges crew members who still have cards to swipe.');
    expect(schedulePurpose({ handlerKey: 'weekly_drop' })).toBe('Tells everyone this week’s drop is live.');
    expect(scheduleCadence(fleet)).toBe('Checks at :00 and :30 · all cities');
    expect(scheduleCadence({ ...fleet, tenantKey: 'sf' })).toBe('Checks at :00 and :30');
  });

  it('describes who a schedule reaches', () => {
    expect(describeWhoRules([{
      outcome: 'send',
      conditions: [
        { attribute: 'quorumMet', operator: 'is', value: false },
        { attribute: 'activeMemberCount', operator: 'gte', value: 2 },
      ],
    }])).toBe('Sends when Quorum met is no and Active members is at least 2.');
    expect(describeWhoRules([])).toBe('');
  });

  it('matches the latest run for a fleet template and a city row separately', () => {
    const runs = [
      { type: 'ritual_crew_scan', tenantKey: 'nyc', status: 'succeeded' },
      { type: 'ritual_crew_scan', tenantKey: 'sf', status: 'failed' },
      { type: 'solo_swipe_reminder', tenantKey: 'sf', status: 'preview' },
    ];
    expect(lastRunForSchedule(fleet, runs)?.tenantKey).toBe('nyc');
    expect(lastRunForSchedule({ ...fleet, tenantKey: 'sf' }, runs)?.status).toBe('failed');
  });

  it('puts a failed schedule ahead of a paused one', () => {
    const paused = { ...fleet, definitionKey: 'event_discovery', handlerKey: 'event_discovery', enabled: false };
    const failing = { ...fleet, definitionKey: 'solo_swipe_reminder', handlerKey: 'solo_swipe_reminder' };
    const runs = [{ type: 'solo_swipe_reminder', tenantKey: 'sf', status: 'failed' }];
    expect(sortSchedules([paused, fleet, failing], runs).map(scheduleName)).toEqual([
      'Solo swipe reminder',
      'Crew swipe nudge',
      'New events',
    ]);
  });
});
