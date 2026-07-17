const eventSchema = require('../../events/schemas/event');

describe('Event pivot compound indexes (Task 1.4)', () => {
  const indexNames = eventSchema.PIVOT_EVENT_INDEX_NAMES;

  it('exports named pivot index constants', () => {
    expect(indexNames).toEqual([
      'pivot_batchWeek_ingestStatus_start_time',
      'pivot_batchWeek_ingestStatus_tags',
    ]);
  });

  it('registers feed/explore compound indexes on the Event schema', () => {
    const indexes = eventSchema.indexes();

    const byName = new Map(
      indexes.map(([keys, options]) => [options?.name, { keys, options }]),
    );

    const feedIndex = byName.get('pivot_batchWeek_ingestStatus_start_time');
    expect(feedIndex).toBeDefined();
    expect(feedIndex.keys).toEqual({
      'customFields.pivot.batchWeek': 1,
      'customFields.pivot.ingestStatus': 1,
      start_time: 1,
    });
    expect(feedIndex.options.partialFilterExpression).toEqual({
      'customFields.pivot.batchWeek': { $type: 'string' },
    });

    const tagsIndex = byName.get('pivot_batchWeek_ingestStatus_tags');
    expect(tagsIndex).toBeDefined();
    expect(tagsIndex.keys).toEqual({
      'customFields.pivot.batchWeek': 1,
      'customFields.pivot.ingestStatus': 1,
      'customFields.pivot.tags': 1,
    });
  });

  it('covers the feed/explore equality prefix (batchWeek + ingestStatus)', () => {
    // Explain-plan proxy: the leading keys of the primary index match the
    // Equality fields in getPivotFeed / upcoming getPivotExplore queries.
    const indexes = eventSchema.indexes();
    const feedIndex = indexes.find(
      ([, options]) => options?.name === 'pivot_batchWeek_ingestStatus_start_time',
    );
    const keyOrder = Object.keys(feedIndex[0]);
    expect(keyOrder.slice(0, 2)).toEqual([
      'customFields.pivot.batchWeek',
      'customFields.pivot.ingestStatus',
    ]);
    expect(keyOrder[2]).toBe('start_time');
  });
});
