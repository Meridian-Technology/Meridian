const {
  reflowCard, cardFitOverflow, scaleCardText, fitRatio, nextFitScale,
} = require('../../../frontend/src/shared/carouselStudio/document');

function text(id, height, extra = {}) {
  return { id, kind: 'text', role: id, layout: 'flow', autoHeight: true, presence: 'custom', text: id,
    frame: { x: 0, y: 0, width: 800, height }, style: { fontSizePx: 40 }, ...extra };
}

describe('carousel text fitting', () => {
  it('reports how far text must shrink to fit its box', () => {
    expect(fitRatio({ width: 900, height: 100 }, { width: 900, height: 200 })).toEqual({ ratio: 1, widthBound: true });
    expect(fitRatio({ width: 1200, height: 100 }, { width: 900, height: 200 })).toEqual({ ratio: 0.75, widthBound: true });
    expect(fitRatio({ width: 900, height: 400 }, { width: 900, height: 200 })).toEqual({ ratio: 0.5, widthBound: false });
    expect(fitRatio({ width: 900, height: 4000 }, { width: 900, height: Infinity }).ratio).toBe(1);
  });

  it('steps by the ratio for width and its square root for height, never below the minimum', () => {
    expect(nextFitScale(1, 1)).toBe(1);
    expect(nextFitScale(1, 0.8, { widthBound: true })).toBeCloseTo(0.788, 3);
    expect(nextFitScale(1, 0.64)).toBeCloseTo(0.788, 3);
    expect(nextFitScale(0.5, 0.1, { min: 0.4 })).toBe(0.4);
  });

  it('measures a fixed card against its pinned rows', () => {
    const card = { id: 'card', kind: 'card', sizing: 'fixed', fit: 'shrink', gap: 20, padding: {},
      frame: { x: 0, y: 0, width: 800, height: 500 },
      children: [text('title', 250), text('blurb', 200), text('facts', 120, { pin: 'end' })] };
    reflowCard(card);
    // 250 + 20 + 200 = 470 of content, but the pinned row starts at 380 - 20.
    expect(cardFitOverflow(card)).toEqual({ overflow: 110, used: 450 });
  });

  it('measures a content card against its maxHeight', () => {
    const card = { id: 'card', kind: 'card', sizing: 'content', fit: 'shrink', maxHeight: 400, gap: 0,
      padding: { top: 40, bottom: 40 }, frame: { x: 0, y: 0, width: 800, height: 100 },
      children: [text('title', 300), text('blurb', 200)] };
    reflowCard(card);
    expect(card.frame.height).toBe(580);
    expect(cardFitOverflow(card)).toEqual({ overflow: 180, used: 500 });
    expect(cardFitOverflow({ ...card, maxHeight: undefined }).overflow).toBe(0);
  });

  it('scales every text size inside a card, including nested cards', () => {
    const card = { kind: 'card', children: [text('title', 10), { kind: 'card', children: [text('date', 10)] }] };
    scaleCardText(card, 0.5);
    expect(card.children[0].style.fontSizePx).toBe(20);
    expect(card.children[1].children[0].style.fontSizePx).toBe(20);
  });
});
