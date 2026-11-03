import {
  addClipPin,
  clipConfigFromDraft,
  clipDraftFromData,
  clipSearchUrl,
  countPlayablePins,
  describeClipPreview,
  groupClipTextRows,
  isClipDraftDirty,
  moveClipPin,
  removeClipPin,
} from './pivotClipAdmin';

const DATA = {
  tenantKey: 'nyc',
  config: {
    deckSource: 'custom',
    cardLimit: 8,
    hidePastEvents: true,
    fallbackToWeek: false,
    curatedEventIds: ['a', 'b'],
  },
  curated: [
    { id: 'a', name: 'A', state: 'live' },
    { id: 'b', name: 'B', state: 'ended' },
  ],
};

describe('pivotClipAdmin', () => {
  it('round-trips the server config through the draft', () => {
    const draft = clipDraftFromData(DATA);
    expect(clipConfigFromDraft(draft)).toEqual(DATA.config);
    expect(isClipDraftDirty(draft, DATA)).toBe(false);
    expect(isClipDraftDirty({ ...draft, cardLimit: '9' }, DATA)).toBe(true);
    expect(isClipDraftDirty({ ...draft, curated: [...draft.curated].reverse() }, DATA)).toBe(true);
  });

  it('defaults an empty config to the week deck', () => {
    expect(clipDraftFromData({})).toEqual({
      deckSource: 'week',
      cardLimit: 12,
      hidePastEvents: true,
      fallbackToWeek: true,
      curated: [],
    });
  });

  it('pins, reorders, and unpins without duplicates or overflow', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(addClipPin(rows, { id: 'a' }, 5)).toBe(rows);
    expect(addClipPin(rows, { id: 'c' }, 2)).toBe(rows);
    expect(addClipPin(rows, { id: 'c' }, 3).map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(moveClipPin(rows, 1, -1).map((row) => row.id)).toEqual(['b', 'a']);
    expect(moveClipPin(rows, 0, -1)).toBe(rows);
    expect(removeClipPin(rows, 'a').map((row) => row.id)).toEqual(['b']);
  });

  it('counts pins the clip will play', () => {
    const draft = clipDraftFromData(DATA);
    expect(countPlayablePins(draft)).toBe(1);
    expect(countPlayablePins({ ...draft, hidePastEvents: false })).toBe(2);
  });

  it('builds the search URL', () => {
    expect(clipSearchUrl('NYC')).toBe('/admin/pivot/tenants/nyc/clip/events');
    expect(clipSearchUrl('nyc', { q: ' film ', includePast: true }))
      .toBe('/admin/pivot/tenants/nyc/clip/events?q=film&includePast=true');
  });

  it('describes the live deck', () => {
    expect(describeClipPreview({ segment: 'custom', events: [{}] }).title).toBe('Pinned list');
    expect(describeClipPreview({
      segment: 'clip',
      fallback: true,
      batchWeek: '2026-W32',
      events: [{}, {}],
    })).toEqual({ title: 'App Clip cards', detail: '2 cards from last week (2026-W32)' });
    expect(describeClipPreview({ segment: null, events: [] }).title).toBe('Empty');
  });

  it('groups clip copy by where it shows, with unknown keys in Other', () => {
    const row = (path) => ({ type: 'entry', section: path.split('.')[0], path });
    const groups = groupClipTextRows([
      row('clip.retry'),
      row('clip.packTitle'),
      row('clip.brandNew'),
      row('week.title'),
    ]);
    expect(groups.map((group) => [group.id, group.items.map((item) => item.path)])).toEqual([
      ['pack', ['clip.packTitle']],
      ['errors', ['clip.retry']],
      ['other', ['clip.brandNew']],
    ]);
  });
});
