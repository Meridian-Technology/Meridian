import { dragRangeSelection, nextSelection, rangeIds } from './curationQueueSelection';

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
