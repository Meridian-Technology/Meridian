import {
  blankLiveCard,
  blankLiveMatch,
  blankLiveSide,
  drawnFighterUrl,
  liveCardFromDefinition,
  liveDefinitionFromCard,
  liveFanLink,
  liveSpotterLink,
  moveItem,
  validateLiveEventId,
} from './liveEventsAdmin';

describe('liveEventsAdmin', () => {
  it('makes stable ids for new matches and corners', () => {
    const card = blankLiveCard();
    expect(card.matches[0].id).toBe('m1');
    expect(card.matches[0].sides.map((side) => side.id)).toEqual(['m1-a', 'm1-b']);
    const second = blankLiveMatch(card.matches);
    expect(second.id).toBe('m2');
    expect(blankLiveSide(second).id).toBe('m2-c');
    // Ids don't collide after a removal.
    expect(blankLiveMatch([{ id: 'm2', sides: [] }]).id).toBe('m3');
  });

  it('turns the form into the card the server stores, without empty fields', () => {
    const card = blankLiveCard();
    card.title = ' underground pro-wrestling 6 ';
    card.intro.presenterName = 'iowa underground';
    card.intro.facts = [{ label: 'when', value: 'fri 8pm' }, { label: '', value: 'dropped' }];
    card.matches[0].title = 'rex vs. vega';
    card.matches[0].sides[0] = { ...card.matches[0].sides[0], name: 'Rex', imageUrl: drawnFighterUrl('rex'), imageCutout: true };
    card.matches[0].sides[1] = { ...card.matches[0].sides[1], name: 'Vega', imageUrl: 'https://cdn.example/vega.png', imageCutout: true };
    const definition = liveDefinitionFromCard(card);
    expect(definition.title).toBe('underground pro-wrestling 6');
    expect(definition.kicker).toBeUndefined();
    expect(definition.intro).toEqual({
      layout: 'card',
      presenter: { name: 'iowa underground' },
      facts: [{ label: 'when', value: 'fri 8pm' }],
      cta: 'step in',
    });
    // Drawn fighters are never cut-outs; uploaded PNGs can be.
    expect(definition.matches[0].sides[0].imageCutout).toBeUndefined();
    expect(definition.matches[0].sides[1].imageCutout).toBe(true);
    expect(definition.matches[0].sides[0].color).toBe('#FF4F1F');
  });

  it('round-trips a stored card', () => {
    const stored = {
      title: 'night',
      accent: '#04FF16',
      intro: { layout: 'backdrop', imageUrl: 'https://x/skull.png', imageEnd: 0.64, align: 'center', presenter: { name: 'iu', label: '{name} presents' } },
      matches: [{ id: 'm1', title: 'a vs b', sides: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', badge: 'champ' }] }],
    };
    expect(liveDefinitionFromCard(liveCardFromDefinition(stored))).toEqual(stored);
  });

  it('builds the fan and spotter links', () => {
    expect(liveFanLink({ city: 'ic', eventId: 'underground-6', source: 'Door 2!' }))
      .toBe('https://justgo.lol/clip/ic?live=underground-6&src=door2');
    expect(liveFanLink({ city: 'ic', eventId: 'underground-6' })).toBe('https://justgo.lol/clip/ic?live=underground-6');
    expect(liveSpotterLink('underground-6', 'https://www.meridian.study')).toBe('https://www.meridian.study/pivot/live/underground-6/spot');
  });

  it('checks event ids and moves list items', () => {
    expect(validateLiveEventId('underground-6')).toBe('');
    expect(validateLiveEventId('two words')).toMatch(/letters/);
    expect(validateLiveEventId('demo')).toMatch(/demo/);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});
