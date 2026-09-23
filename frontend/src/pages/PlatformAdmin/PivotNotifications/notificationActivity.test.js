import { summarizeNotificationActivity } from './notificationActivity';

describe('summarizeNotificationActivity', () => {
  const now = new Date('2026-09-22T18:00:00.000Z');

  it('counts accepted pushes, failed deliveries, and dry runs separately', () => {
    const summary = summarizeNotificationActivity([
      {
        type: 'weekly_drop',
        status: 'succeeded',
        finishedAt: '2026-09-22T17:00:00.000Z',
        summary: { accepted: 12, failed: 1 },
      },
      {
        type: 'ritual_crew_scan',
        status: 'failed',
        finishedAt: '2026-09-21T17:00:00.000Z',
        summary: { accepted: 0, failed: 0 },
      },
      {
        type: 'weekly_drop',
        status: 'preview',
        finishedAt: '2026-09-22T12:00:00.000Z',
        payload: { dryRun: true },
        summary: { accepted: 40, failed: 0 },
      },
    ], { now });

    expect(summary.totals).toEqual({ sent: 12, failed: 2, dryRuns: 1 });
    expect(summary.bars).toEqual([
      { key: 'weekly_drop', label: 'Weekly drop', value: 12 },
      { key: 'ritual_crew_scan', label: 'Crew swipe nudge', value: 0 },
    ]);
    expect(summary.heat).toHaveLength(14);
    expect(summary.heat[summary.heat.length - 1].value).toBe(12);
    expect(summary.heat[summary.heat.length - 2].value).toBe(0);
  });
});