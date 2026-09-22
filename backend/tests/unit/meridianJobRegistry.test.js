const {
  registerMeridianJobHandler,
  getMeridianJobHandler,
  listMeridianJobHandlers,
  resetMeridianJobHandlers,
} = require('../../services/meridianJobRegistry');
const {
  buildWeeklyDropRunKey,
  registerWeeklyDropHandler,
} = require('../../services/meridianJobHandlers/weeklyDrop');

describe('meridianJobRegistry', () => {
  beforeEach(() => {
    resetMeridianJobHandlers();
  });

  it('registers handlers with category, buildRunKey, and execute', () => {
    const execute = jest.fn();
    registerMeridianJobHandler('probe', {
      category: 'notification',
      buildRunKey: ({ tenantKey }) => `probe:${tenantKey}`,
      execute,
    });

    const handler = getMeridianJobHandler('probe');
    expect(handler.category).toBe('notification');
    expect(handler.buildRunKey({ tenantKey: 'sf' })).toBe('probe:sf');
    expect(listMeridianJobHandlers()).toEqual([
      { handlerKey: 'probe', category: 'notification' },
    ]);
  });

  it('rejects missing spec fields and duplicate handler keys', () => {
    expect(() => registerMeridianJobHandler('probe', {
      category: 'notification',
      buildRunKey: () => 'x',
    })).toThrow(/execute is required/);

    registerMeridianJobHandler('probe', {
      category: 'notification',
      buildRunKey: () => 'x',
      execute: async () => ({}),
    });
    expect(() => registerMeridianJobHandler('probe', {
      category: 'notification',
      buildRunKey: () => 'x',
      execute: async () => ({}),
    })).toThrow(/already registered/);
  });

  it('registers weekly_drop with idempotent run keys and notification category', () => {
    const handler = registerWeeklyDropHandler();
    expect(handler.handlerKey).toBe('weekly_drop');
    expect(handler.category).toBe('notification');
    expect(buildWeeklyDropRunKey({
      tenantKey: 'SF',
      payload: { batchWeek: '2026-W12', dryRun: true },
    })).toBe('weekly_drop:sf:2026-W12:dry');
    expect(registerWeeklyDropHandler()).toBe(handler);
  });
});
