const {
  generateCoverSlide,
  generateEventSlide,
  generateIssueDocument,
  shuffleCoverVariation,
} = require('../../services/pivotCarouselCurationDraft');
const { COVER_FAMILIES, EVENT_PRESETS } = require('../../services/pivotCarouselPresets');
const { loadDocument } = require('../../services/pivotCarouselDocument');

const LAB_COPY = ['mooncakes', 'barbershop', 'on grant', 'the city edit', 'mid-autumn', 'no. 01', 'sorry u missed it'];

function item() {
  return {
    ref: { sourceTenantKey: 'sf', eventId: 'evt-1' },
    snapshot: {
      name: 'Night market',
      host: 'Grant hosts',
      location: 'Grant Avenue',
      startTime: '2026-09-25T01:00:00.000Z',
      image: 'https://cdn.example/market.jpg',
      credit: 'Ada Lovelace',
      city: { name: 'San Francisco', tenantKey: 'sf' },
    },
    recapNote: 'Bring a jacket.',
  };
}

describe('approved carousel presets', () => {
  test('nine covers and three event treatments pair without a hidden rule', () => {
    const documents = [];
    for (const cover of COVER_FAMILIES) {
      for (let variation = 1; variation <= 3; variation += 1) {
        for (const event of EVENT_PRESETS) {
          documents.push(generateIssueDocument({
            selected: [item()],
            theme: 'Night market week',
            coverPreset: cover,
            eventPreset: event,
            coverVariation: variation,
            format: 'city-picks',
            coverImage: { src: 'https://cdn.example/cover.jpg', credit: 'Cover credit' },
          }));
        }
      }
    }
    expect(documents).toHaveLength(27);
    const encoded = JSON.stringify(documents).toLowerCase();
    for (const phrase of LAB_COPY) expect(encoded).not.toContain(phrase);
    for (const document of documents) {
      const cover = document.slides[0];
      const event = document.slides[1];
      expect(cover.preset.round).toBe('05');
      expect(event.preset.round).toBe('06');
      expect(cover.elements.some((element) => /no\.\s*\d|series/i.test(element.text || ''))).toBe(false);
      expect(cover.elements.find((element) => element.role === 'cover-photo').asset.src).toBe('https://cdn.example/cover.jpg');
      expect(event.elements.find((element) => element.role === 'event-photo').asset).toMatchObject({
        src: 'https://cdn.example/market.jpg',
        credit: 'Ada Lovelace',
      });
      expect(cover.properties.stickerFinish).toBe(cover.preset.family === 'kept-somewhere' ? 'dark' : 'light');
      expect(event.elements.find(element => element.role === 'event-card')).toBeTruthy();
      expect(event.properties.cropAspect).toBeTruthy();
    }
    const scene = documents.find((document) => document.slides[1].preset.id === 'in-the-room').slides[1];
    const note = documents.find((document) => document.slides[1].preset.id === 'photo-note').slides[1];
    expect(scene.properties.cropAspect).toBe('full-bleed');
    expect(scene.properties.card.height).toBeLessThan(note.properties.card.height);
    expect(scene.elements.some((element) => element.kind === 'sticker')).toBe(false);
    expect(note.elements.some((element) => element.kind === 'sticker' && element.style.finish === 'light')).toBe(true);
  });

  test('shuffle is explicit and load does not change the variation', () => {
    const document = generateIssueDocument({
      selected: [item()],
      theme: 'Night market week',
      coverPreset: 'open-invitation',
      eventPreset: 'on-the-bill',
      coverVariation: 1,
    });
    const loaded = loadDocument(JSON.stringify(document));
    expect(loaded.document.slides[0].preset.variation).toBe(1);
    const shuffled = shuffleCoverVariation(loaded.document);
    expect(shuffled.slides[0].preset.variation).toBe(2);
    expect(require('../../services/pivotCarouselPresets').titleOf(shuffled.slides[0]).replace(/\n/g, ' ')).toBe('Night market week');
    expect(shuffled.slides[1].preset.id).toBe('on-the-bill');
    const again = generateCoverSlide({ theme: 'Night market week', coverPreset: 'loose-letters', variation: 2 });
    const third = generateCoverSlide({ theme: 'Night market week', coverPreset: 'loose-letters', variation: 3 });
    expect(again.properties.photoPosition).not.toEqual(third.properties.photoPosition);
    expect(generateEventSlide(item(), 'in-the-room', { format: 'sorry-you-missed-it' }).preset.id).toBe('in-the-room');
  });
});
