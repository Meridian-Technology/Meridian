import {
  addSelection,
  addVisibleSelection,
  defaultQueryForFormat,
  describeCurationDiff,
  diffSelection,
  eventRefKey,
  moveSelection,
  nextCurationStep,
  previousCurationStep,
  removeSelection,
  slideEstimate,
} from './carouselCurationSelection';

function candidate(tenant, id, name = id) {
  return {
    ref: { sourceTenantKey: tenant, eventId: id },
    snapshot: { name, city: { tenantKey: tenant, name: tenant }, startTime: '2026-09-05T20:00:00.000Z' },
    provenance: {},
  };
}

describe('curation selection tray', () => {
  test('selection survives query changes and rejects a duplicate ref', () => {
    const first = addSelection([], candidate('sf', 'a', 'Lanterns'));
    const second = addSelection(first.selected, candidate('nyc', 'b', 'Jazz'));
    const again = addSelection(second.selected, candidate('sf', 'a', 'Lanterns'));
    expect(second.selected).toHaveLength(2);
    expect(again.duplicate).toBe(true);
    expect(again.selected).toHaveLength(2);
    expect(eventRefKey(again.selected[0].ref)).toBe('sf:a');
  });

  test('bulk-select-visible, remove, and reorder keep a stable tray', () => {
    const visible = addVisibleSelection([], [
      candidate('sf', 'a'),
      candidate('sf', 'a'),
      candidate('nyc', 'b'),
    ]);
    expect(visible.added).toBe(2);
    expect(visible.duplicates).toBe(1);
    const moved = moveSelection(visible.selected, { sourceTenantKey: 'sf', eventId: 'a' }, 1);
    expect(moved.map((item) => item.ref.eventId)).toEqual(['b', 'a']);
    expect(removeSelection(moved, { sourceTenantKey: 'nyc', eventId: 'b' })).toHaveLength(1);
  });

  test('slide estimate includes the cover and flags the cap', () => {
    expect(slideEstimate(3)).toEqual({
      slideCount: 4, cover: 1, events: 3, maxSlides: 20, overflow: false,
    });
    expect(slideEstimate(20).overflow).toBe(true);
  });

  test('search to name is sequential and recap defaults to past / all cities', () => {
    expect(nextCurationStep('search')).toBe('review');
    expect(nextCurationStep('review')).toBe('name');
    expect(previousCurationStep('name')).toBe('review');
    expect(defaultQueryForFormat('sorry-you-missed-it', ['sf', 'nyc'], 'sf')).toEqual({
      temporalMode: 'past',
      sourceTenantKeys: [],
    });
    expect(defaultQueryForFormat('city-picks', ['sf', 'nyc'], 'sf')).toEqual({
      temporalMode: 'upcoming',
      sourceTenantKeys: ['sf'],
    });
  });

  test('edit-selection diff names added, removed, and reordered events', () => {
    const previous = [
      { sourceTenantKey: 'sf', eventId: 'a' },
      { sourceTenantKey: 'nyc', eventId: 'b' },
    ];
    const next = [
      { sourceTenantKey: 'nyc', eventId: 'b' },
      { sourceTenantKey: 'sf', eventId: 'a' },
      { sourceTenantKey: 'sf', eventId: 'c' },
    ];
    const diff = diffSelection(previous, next);
    expect(diff.added).toEqual([{ sourceTenantKey: 'sf', eventId: 'c' }]);
    expect(diff.removed).toEqual([]);
    expect(diff.reordered).toBe(true);
    expect(describeCurationDiff({ ...diff, removed: [{ sourceTenantKey: 'chi', eventId: 'z' }], detachedSlideIds: ['s1'] }))
      .toBe('1 added · 1 removed · reordered · 1 kept off-selection');
  });
});
