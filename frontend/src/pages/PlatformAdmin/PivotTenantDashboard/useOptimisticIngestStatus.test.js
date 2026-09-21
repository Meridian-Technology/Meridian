import { mergeIngestOverrides, pruneMatchingOverrides } from './useOptimisticIngestStatus';

describe('optimistic ingest status', () => {
  it('overlays status without waiting for the catalog refetch', () => {
    const events = [
      { _id: '1', ingestStatus: 'draft', name: 'A' },
      { _id: '2', ingestStatus: 'staged', name: 'B' },
    ];
    const merged = mergeIngestOverrides(events, new Map([['1', 'staged']]));
    expect(merged[0]).toMatchObject({ _id: '1', ingestStatus: 'staged', name: 'A' });
    expect(merged[1]).toBe(events[1]);
  });

  it('drops overrides once the server catalog matches, and forgets ids that left the week', () => {
    const events = [{ _id: '1', ingestStatus: 'staged' }];
    const pruned = pruneMatchingOverrides(events, new Map([['1', 'staged'], ['2', 'draft']]));
    expect(pruned.size).toBe(0);
  });
});
