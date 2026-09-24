import {
  mapMeridianDeliveriesToRecipients,
  mergeWeeklyDropHistory,
} from './mergeWeeklyDropHistory';

describe('mergeWeeklyDropHistory', () => {
  it('lists meridian job runs ahead of unmatched legacy PivotDropPushRun rows', () => {
    const merged = mergeWeeklyDropHistory({
      meridianRuns: [
        {
          id: 'job-new',
          status: 'succeeded',
          createdAt: '2026-09-21T21:00:00.000Z',
          pivotDropPushRunId: 'legacy-dual',
          payload: { batchWeek: '2026-W38', pushTitle: 'just go*' },
          summary: { attempted: 4, accepted: 3, failed: 1, recipientOverflowCount: 0 },
        },
      ],
      legacyRuns: [
        {
          _id: 'legacy-dual',
          batchWeek: '2026-W38',
          accepted: 3,
          failed: 1,
          createdAt: '2026-09-21T21:00:00.000Z',
        },
        {
          _id: 'legacy-old',
          batchWeek: '2026-W30',
          title: 'Old send',
          accepted: 2,
          failed: 0,
          createdAt: '2026-07-23T21:00:00.000Z',
        },
      ],
    });

    expect(merged.map((row) => row.historyId)).toEqual([
      'meridian:job-new',
      'legacy:legacy-old',
    ]);
    expect(merged[0]).toMatchObject({
      source: 'meridian',
      batchWeek: '2026-W38',
      accepted: 3,
      failed: 1,
    });
    expect(merged[1]).toMatchObject({
      source: 'legacy',
      batchWeek: '2026-W30',
      title: 'Old send',
    });
  });

  it('keeps dry-run / preview job runs that have no legacy PivotDropPushRun', () => {
    const merged = mergeWeeklyDropHistory({
      meridianRuns: [
        {
          id: 'job-dry',
          status: 'preview',
          createdAt: '2026-09-21T22:00:00.000Z',
          pivotDropPushRunId: null,
          payload: { batchWeek: '2026-W38', dryRun: true },
          summary: { attempted: 3, accepted: 0, failed: 0, skipped: 3 },
        },
      ],
      legacyRuns: [],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      source: 'meridian',
      dryRun: true,
      title: 'Weekly drop preview',
      skipped: 3,
    });
  });
});

describe('mapMeridianDeliveriesToRecipients', () => {
  it('copies audit fields without push tokens', () => {
    const recipients = mapMeridianDeliveriesToRecipients([
      {
        userId: 'u1',
        name: 'Ari',
        username: 'ari',
        product: 'justgo',
        deliveryStatus: 'accepted',
        error: null,
        title: 'just go*',
        body: 'What are you doing this week?',
      },
    ]);
    expect(recipients).toEqual([
      {
        userId: 'u1',
        name: 'Ari',
        username: 'ari',
        product: 'justgo',
        deliveryStatus: 'accepted',
        error: null,
      },
    ]);
  });
});
