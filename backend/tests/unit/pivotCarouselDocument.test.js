const {
  loadDocument,
  materializeVoice,
  migrateDocument,
  prepareDocument,
  removeField,
  resetText,
  serializeDocument,
} = require('../../services/pivotCarouselDocument');

function cardDocument() {
  return {
    schemaVersion: 2,
    width: 1080,
    height: 1350,
    slides: [{
      id: 'slide-1',
      preset: { id: 'event.note', round: '06', version: 1 },
      elements: [{
        id: 'card',
        kind: 'card',
        sizing: 'content',
        gap: 8,
        padding: { top: 12, right: 12, bottom: 12, left: 12 },
        frame: { x: 40, y: 800, width: 900, height: 400 },
        children: [
          { id: 'title', kind: 'text', layout: 'flow', presence: 'default', text: '', voice: { key: 'zine.cover.name' }, frame: { x: 0, y: 0, width: 800, height: 48 } },
          { id: 'middle', kind: 'text', layout: 'flow', presence: 'custom', text: 'middle line', frame: { x: 0, y: 0, width: 800, height: 40 } },
          { id: 'last', kind: 'text', layout: 'flow', presence: 'custom', text: 'last line', frame: { x: 0, y: 0, width: 800, height: 36 } },
          { id: 'loose', kind: 'text', layout: 'free', presence: 'custom', text: 'placed', frame: { x: 30, y: 70, width: 120, height: 28 }, rotation: 12, visibility: 'hidden', stack: 9 },
        ],
      }, {
        id: 'photo',
        kind: 'image',
        frame: { x: 80, y: 80, width: 640, height: 640 },
        rotation: 2,
        stack: 1,
        crop: { focalX: 0.2, focalY: 0.8, scale: 1.5 },
        asset: { id: 'asset-1', key: 'pivot-carousel/sf/lanterns.jpg', credit: 'Paul Pastourmatzis' },
      }],
    }],
  };
}

describe('carousel document v2', () => {
  test('round-trip keeps transforms, crop, text, visibility, and stacking', () => {
    const prepared = prepareDocument(cardDocument());
    expect(prepared.error).toBeUndefined();
    const loaded = loadDocument(JSON.stringify(serializeDocument(prepared.document)));
    const slide = loaded.document.slides[0];
    const photo = slide.elements.find((element) => element.id === 'photo');
    const loose = slide.elements[0].children.find((element) => element.id === 'loose');
    expect(photo.frame).toEqual({ x: 80, y: 80, width: 640, height: 640 });
    expect(photo.rotation).toBe(2);
    expect(photo.crop).toEqual({ focalX: 0.2, focalY: 0.8, scale: 1.5 });
    expect(photo.asset.key).toBe('pivot-carousel/sf/lanterns.jpg');
    expect(photo.stack).toBe(1);
    expect(slide.preset).toMatchObject({ id: 'event.note', round: '06', version: 1 });
    expect(loose.visibility).toBe('hidden');
    expect(loose.stack).toBe(9);
    expect(loose.rotation).toBe(12);
    expect(loose.text).toBe('placed');
  });

  test('removing middle, last, and all flow fields collapses the card and leaves free text', () => {
    const prepared = prepareDocument(cardDocument()).document;
    const looseBefore = prepared.slides[0].elements[0].children.find((child) => child.id === 'loose').frame;
    const middle = removeField(prepared, 'middle').document;
    const card = middle.slides[0].elements[0];
    const title = card.children.find((child) => child.id === 'title');
    const last = card.children.find((child) => child.id === 'last');
    const removed = card.children.find((child) => child.id === 'middle');
    expect(removed.presence).toBe('removed');
    expect(removed.text).toBe('middle line');
    expect(last.frame.y).toBe(title.frame.y + title.frame.height + card.gap);
    expect(card.children.find((child) => child.id === 'loose').frame).toEqual(looseBefore);

    const withoutLast = removeField(middle, 'last').document;
    const afterLast = withoutLast.slides[0].elements[0];
    expect(afterLast.children.find((child) => child.id === 'last').presence).toBe('removed');
    expect(afterLast.frame.height).toBeLessThan(card.frame.height);
    expect(afterLast.children.find((child) => child.id === 'loose').frame).toEqual(looseBefore);

    const none = removeField(withoutLast, 'title').document;
    const emptied = none.slides[0].elements[0];
    expect(emptied.children.filter((child) => child.layout === 'flow' && child.presence !== 'removed')).toHaveLength(0);
    expect(emptied.children.find((child) => child.id === 'loose').frame).toEqual(looseBefore);
    expect(emptied.frame.height).toBe(emptied.padding.top + emptied.padding.bottom);
  });

  test('voice is captured at creation and reset ignores a later layer', () => {
    const prepared = prepareDocument(cardDocument()).document;
    const created = materializeVoice(prepared, {
      version: 'city:2026-09-23',
      city: { 'zine.cover.name': 'city line' },
      account: { 'zine.cover.name': 'account line' },
      issue: {},
    });
    const title = created.slides[0].elements[0].children.find((child) => child.id === 'title');
    expect(title.text).toBe('account line');
    expect(title.voice.resolved).toBe('account line');
    expect(title.voice.source).toBe('account');
    title.presence = 'custom';
    title.text = 'typed';
    const untouched = materializeVoice(created, {
      version: 'city:later',
      account: { 'zine.cover.name': 'changed live' },
    });
    expect(untouched.slides[0].elements[0].children.find((child) => child.id === 'title').text).toBe('typed');
    const reset = resetText(created, 'title');
    expect(reset.document.slides[0].elements[0].children.find((child) => child.id === 'title').text).toBe('account line');
  });

  test('a back slide with a hairline rule still saves', () => {
    const { generateBackSlide } = require('../../../frontend/src/shared/carouselStudio/presets');
    const slide = generateBackSlide('paper-close');
    slide.elements.find((element) => element.role === 'back-rule').frame.height = 2;
    const prepared = prepareDocument({ schemaVersion: 2, width: 1080, height: 1350, slides: [slide] });
    expect(prepared.error).toBeUndefined();
    expect(prepared.document.slides[0].elements.find((element) => element.role === 'back-rule').frame.height).toBe(8);
  });

  test('unsupported versions fail and are not coerced', () => {
    expect(migrateDocument({ schemaVersion: 1, slides: [] }).code).toBe('SCHEMA_VERSION_UNSUPPORTED');
    expect(migrateDocument({ schemaVersion: 3 }).code).toBe('SCHEMA_VERSION_UNSUPPORTED');
    expect(prepareDocument({
      schemaVersion: 2,
      width: 1080,
      height: 1350,
      slides: [{ id: 's', elements: [{ id: 'p', kind: 'image', frame: { x: 0, y: 0, width: 100, height: 100 }, crop: { focalX: 0.5, focalY: 0.5, scale: 12 } }] }],
    }).code).toBe('INVALID_DOCUMENT');
  });
});
