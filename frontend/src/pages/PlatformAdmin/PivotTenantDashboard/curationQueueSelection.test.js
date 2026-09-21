import { dragRangeSelection, nextSelection, rangeIds, nextVisibleIndex, reconcileCatalogAnchor } from './curationQueueSelection';

const events = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }];

describe('rangeIds', () => {
  it('returns inclusive ids between two indexes', () => {
    expect(rangeIds(events, 1, 3)).toEqual(['b', 'c', 'd']);
    expect(rangeIds(events, 3, 1)).toEqual(['b', 'c', 'd']);
  });
});

describe('nextSelection', () => {
  it('replaces the selection on a plain click', () => {
    expect([...nextSelection(new Set(['a']), { id: 'c' })]).toEqual(['c']);
  });

  it('toggles on additive click', () => {
    const next = nextSelection(new Set(['a']), { id: 'c', additive: true });
    expect(next.has('a')).toBe(true);
    expect(next.has('c')).toBe(true);
    expect(nextSelection(next, { id: 'a', additive: true }).has('a')).toBe(false);
  });

  it('extends a range from the anchor', () => {
    const next = nextSelection(new Set(['a']), {
      id: 'd',
      index: 3,
      events,
      rangeFrom: 1,
    });
    expect([...next]).toEqual(['b', 'c', 'd']);
  });
});

describe('dragRangeSelection', () => {
  it('selects the rows between press and current pointer', () => {
    expect([...dragRangeSelection(events, 0, 2)]).toEqual(['a', 'b', 'c']);
  });

  it('unions with a snapshot when additive', () => {
    const next = dragRangeSelection(events, 2, 3, new Set(['a']));
    expect(next.has('a')).toBe(true);
    expect(next.has('c')).toBe(true);
    expect(next.has('d')).toBe(true);
    expect(next.has('b')).toBe(false);
  });
});

describe('reconcileCatalogAnchor', () => {
  it('keeps focus on the same event after a refresh', () => {
    const next = reconcileCatalogAnchor({
      prevEvents: events,
      nextEvents: events,
      focusId: 'b',
      selectedIds: new Set(['b']),
    });
    expect(next.focusIndex).toBe(1);
    expect([...next.selectedIds]).toEqual(['b']);
  });

  it('moves to the next remaining child when the focused event leaves the filter', () => {
    const next = reconcileCatalogAnchor({
      prevEvents: events,
      nextEvents: [{ _id: 'a' }, { _id: 'c' }, { _id: 'd' }],
      focusId: 'b',
      selectedIds: new Set(['b']),
    });
    expect(next.focusId).toBe('c');
    expect([...next.selectedIds]).toEqual(['c']);
  });

  it('does not invent a selection on first load', () => {
    const next = reconcileCatalogAnchor({
      prevEvents: [],
      nextEvents: events,
      focusId: null,
      selectedIds: new Set(),
    });
    expect(next.focusIndex).toBe(0);
    expect(next.selectedIds.size).toBe(0);
  });
});

describe('nextVisibleIndex', () => {
  it('walks backward when nothing remains after the lost row', () => {
    expect(nextVisibleIndex(events, [{ _id: 'a' }, { _id: 'b' }], 'd')).toBe(1);
  });
});
