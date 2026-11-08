const { buildCompositionDocument } = require('../../services/pivotCarouselCompositionService');
const { walkElements, generateEventSlide, sizeForLines, PALETTE } = require('../../services/pivotCarouselPresets');
const { validateDocument } = require('../../services/pivotCarouselIssueService');
const { loadFixture, validateExecutionResult } = require('../../utilities/pivotAdminComputeJobContract');

function inputs() {
  const result = loadFixture('result-compose-valid.json');
  const { composition } = result;
  const context = loadFixture('context-compose-valid.json');
  context.candidates = composition.selectedEventRefs.map((ref, index) => ({ ref,
    recordVersion: `rv:event-${index}`, snapshot: { name: `Event ${index}`, image: `https://example.test/${index}.jpg`,
      startTime: '2026-10-13T23:00:00Z', location: 'Catalog venue', city: { name: 'Iowa City', timezone: 'America/Chicago' } } }));
  composition.cover.assetRef = { kind: 'event-poster', eventRef: composition.selectedEventRefs[0] };
  composition.eventSlides.forEach((slide, index) => { slide.presetId = ['photo-note', 'on-the-bill', 'in-the-room'][index]; });
  return { result, composition, context };
}
function nodes(slide) { const values = []; walkElements(slide.elements, value => values.push(value)); return values; }
const px = value => Math.round(value * 10.8);

function freeLayout(composition) {
  return {
    background: 'orange',
    elements: [
      { kind: 'image', assetRef: { kind: 'event-poster', eventRef: composition.selectedEventRefs[1] },
        box: { x: 52, y: 14, width: 40, height: 52, rotation: 4 }, fit: 'whole', treatment: 'print' },
      { kind: 'text', role: 'headline', text: 'Three shows,\nzero arenas', box: { x: 6, y: 70, width: 88, height: 30, rotation: -3 },
        font: 'Les Flos Chaos', size: 14, color: 'paper', align: 'left', lettering: true },
      { kind: 'text', role: 'subtitle', text: 'small rooms, mid-November', box: { x: 6, y: 104, width: 60, height: 6 },
        font: 'Space Mono', size: 2, color: 'ink' },
      { kind: 'shape', box: { x: 6, y: 101, width: 30, height: 0.8 }, color: 'ink' },
      { kind: 'sticker', finish: 'light', box: { x: 66, y: 98, width: 26, height: 15 } },
    ],
  };
}

describe('compose agent layout freedom', () => {
  test('the contract accepts a free cover layout and event slide controls', () => {
    const { result, composition } = inputs();
    composition.cover.layout = freeLayout(composition);
    composition.eventSlides[0] = { ...composition.eventSlides[0], title: 'Magic Tuber', imageFit: 'whole', background: 'ink', titleScale: 0.9 };
    expect(validateExecutionResult(result)).toEqual({ valid: true });
    composition.cover.layout.elements[1].font = 'Comic Sans';
    expect(validateExecutionResult(result).valid).toBe(false);
  });

  test('builds a free cover from the agent layout, with every text fitting its box', () => {
    const { composition, context } = inputs();
    composition.cover.layout = freeLayout(composition);
    const document = buildCompositionDocument(composition, context);
    expect(validateDocument(document)).toBeNull();
    const cover = document.slides[0];
    expect(cover.preset).toMatchObject({ id: 'free-layout', family: 'free-layout' });
    expect(cover.background).toEqual({ kind: 'fill', color: PALETTE.orange });
    const values = nodes(cover);
    const photo = values.find(node => node.role === 'cover-photo');
    expect(photo).toMatchObject({ asset: { src: context.candidates[1].snapshot.image },
      frame: { x: px(52), y: px(14), width: px(40), height: px(52) }, rotation: 4,
      style: { treatment: 'print', objectFit: 'contain' } });
    const headline = values.find(node => node.role === 'cover-headline');
    expect(headline).toMatchObject({ text: 'Three shows,\nzero arenas', presetOwned: false,
      style: { fontFamily: 'Les Flos Chaos', fontSizePx: px(14), color: PALETTE.paper, lettering: true, fit: 'shrink' } });
    expect(values.filter(node => node.kind === 'text').every(node => node.style.fit === 'shrink')).toBe(true);
    expect(values.find(node => node.kind === 'sticker').asset.finish).toBe('light');
    expect(values.find(node => node.kind === 'shape').style.fill).toBe(PALETTE.ink);
  });

  test.each([
    ['text off the slide', (layout) => { layout.elements[1].box.x = 30; }, /inside the slide/],
    ['no headline', (layout) => { layout.elements[1].role = 'text'; }, /headline/],
    ['no sticker', (layout) => { layout.elements.pop(); }, /sticker/],
    ['an invented photo', (layout) => { layout.elements[0].assetRef = { kind: 'unsplash', assetId: 'unsplash:nope' }; }, /catalog/],
  ])('rejects a free cover with %s', (_label, mutate, message) => {
    const { composition, context } = inputs();
    composition.cover.layout = freeLayout(composition);
    mutate(composition.cover.layout);
    expect(() => buildCompositionDocument(composition, context)).toThrow(message);
  });

  test('a free cover does not need a repeat reason', () => {
    const { composition, context } = inputs();
    context.lastPostedIssues = [{ cover: { family: composition.cover.family, variation: composition.cover.variation } }];
    delete composition.cover.repeatReason;
    expect(() => buildCompositionDocument(composition, context)).toThrow(/repeated cover/);
    composition.cover.layout = freeLayout(composition);
    expect(() => buildCompositionDocument(composition, context)).not.toThrow();
  });

  test('applies a short title, a whole flier, a background and a title scale to an event slide', () => {
    const { composition, context } = inputs();
    Object.assign(composition.eventSlides[0], { title: 'Magic Tuber', imageFit: 'whole', background: 'ink', titleScale: 1.2 });
    const slide = buildCompositionDocument(composition, context).slides[1];
    const values = nodes(slide);
    expect(slide.background.color).toBe(PALETTE.ink);
    expect(values.find(node => node.role === 'event-name').text).toBe('Magic Tuber');
    expect(values.find(node => node.role === 'event-photo').style.objectFit).toBe('contain');
    expect(values.find(node => node.role === 'event-description').style.color).toBe(PALETTE.paper);
    expect(values.find(node => node.role === 'event-date').style.color).toBe(PALETTE.paper);
    expect(values.find(node => node.role === 'event-card').fit).toBe('shrink');
  });

  test('a type-only slide drops the photo and gives the card the room', () => {
    const slide = generateEventSlide({ snapshot: { name: 'Night Market', image: 'https://example.test/a.jpg', startTime: '2026-10-13T23:00:00Z' }, blurb: 'Food.' }, 'photo-note', { imageFit: 'none' });
    const values = nodes(slide);
    expect(values.some(node => node.role === 'event-photo')).toBe(false);
    expect(values.find(node => node.role === 'event-card').frame).toMatchObject({ y: px(12), height: px(107) });
  });

  test('longer event names get smaller titles', () => {
    const titleSize = name => nodes(generateEventSlide({ snapshot: { name, image: 'https://example.test/a.jpg', startTime: '2026-10-13T23:00:00Z' } }, 'photo-note'))
      .find(node => node.role === 'event-name').style.fontSizePx;
    const short = titleSize('Jazz Night');
    const long = titleSize('Hancher and Mission Creek present the Magic Tuber Stringband with very special guests');
    expect(short).toBe(px(8));
    expect(long).toBeLessThan(short * 0.7);
    expect(sizeForLines('Jazz Night', 84, 8, 2)).toBe(8);
  });

  test('cards and free text boxes are marked to fit, and in-the-room cannot climb the photo', () => {
    const snapshot = { name: 'Event', image: 'https://example.test/a.jpg', startTime: '2026-10-13T23:00:00Z' };
    const room = nodes(generateEventSlide({ snapshot }, 'in-the-room')).find(node => node.role === 'event-card');
    expect(room).toMatchObject({ fit: 'shrink', maxHeight: px(70) });
    const bill = nodes(generateEventSlide({ snapshot }, 'on-the-bill'));
    expect(bill.find(node => node.role === 'event-name')).toMatchObject({ layout: 'free', autoHeight: false, style: { fit: 'shrink' } });
    expect(bill.find(node => node.role === 'event-description').style.fit).toBe('shrink');
    expect(bill.find(node => node.role === 'event-card')).toMatchObject({ fit: 'shrink', maxHeight: px(30) });
  });

  test('template cover headline lines fit the card', () => {
    const { composition, context } = inputs();
    composition.cover.headline = 'An extraordinarily overlong headline that would never fit';
    const lines = nodes(buildCompositionDocument(composition, context).slides[0]).filter(node => /^cover-line-/.test(node.role));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.style.fit).toBe('shrink');
      expect(line.text.length * line.style.fontSizePx * 0.42).toBeLessThanOrEqual(px(88) + 1);
    }
  });
});
