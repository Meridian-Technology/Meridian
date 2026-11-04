const { buildCompositionDocument, safeUnsplashAsset, composeIssueId } = require('../../services/pivotCarouselCompositionService');
const { walkElements, titleOf } = require('../../services/pivotCarouselPresets');
const { validateDocument } = require('../../services/pivotCarouselIssueService');
const { loadFixture } = require('../../utilities/pivotAdminComputeJobContract');

function inputs() {
  const composition = loadFixture('result-compose-valid.json').composition;
  const context = loadFixture('context-compose-valid.json');
  context.candidates = composition.selectedEventRefs.map((ref, index) => ({ ref,
    recordVersion: `rv:event-${index}`, snapshot: { name: `Event ${index}`, image: `https://example.test/${index}.jpg`,
      startTime: '2026-10-13T23:00:00Z', location: 'Catalog venue', city: { name: 'Iowa City', timezone: 'America/Chicago' } } }));
  composition.cover.assetRef = { kind: 'event-poster', eventRef: composition.selectedEventRefs[0] };
  composition.eventSlides.forEach((slide, index) => { slide.presetId = ['photo-note', 'on-the-bill', 'in-the-room'][index]; });
  return { composition, context };
}
function nodes(slide) { const values = []; walkElements(slide.elements, value => values.push(value)); return values; }

describe('compose studio documents', () => {
  test('uses shared presets, catalog logistics and posters while preserving authored blurbs and crop', () => {
    const { composition, context } = inputs();
    composition.cover.crop = { focalX: 0.3, focalY: 0.8, scale: 1.7 };
    composition.eventSlides[1].crop = { focalX: 0.1, focalY: 0.2, scale: 1.3 };
    const document = buildCompositionDocument(composition, context);
    expect(validateDocument(document)).toBeNull();
    expect(document.slides.map(slide => slide.role)).toEqual(['cover', 'event', 'event', 'event']);
    expect(titleOf(document.slides[0]).replace(/\n/g, ' ')).toBe(composition.cover.headline);
    expect(nodes(document.slides[0]).find(node => node.role === 'cover-caption').text).toBe(composition.cover.subtitle);
    expect(nodes(document.slides[0]).find(node => node.role === 'cover-photo')).toMatchObject({ crop: composition.cover.crop, asset: { src: context.candidates[0].snapshot.image } });
    document.slides.slice(1).forEach((slide, index) => {
      expect(slide.preset.id).toBe(composition.eventSlides[index].presetId);
      expect(slide.source).toEqual(composition.selectedEventRefs[index]);
      expect(nodes(slide).find(node => node.role === 'event-photo').asset.src).toBe(context.candidates[index].snapshot.image);
      expect(nodes(slide).find(node => node.role === 'event-description').text).toBe(composition.eventSlides[index].blurb);
      expect(nodes(slide).find(node => node.role === 'event-location').text).toContain('Catalog venue');
    });
    expect(nodes(document.slides[2]).find(node => node.role === 'event-photo').crop).toEqual(composition.eventSlides[1].crop);
  });

  test('supports an optional closing preset without inventing attendance or catalog counts', () => {
    const { composition, context } = inputs();
    composition.optionalClosingSlide = { presetId: 'orange-close', line: 'Find your next plan' };
    const slide = buildCompositionDocument(composition, context).slides.at(-1);
    expect(slide.role).toBe('back');
    expect(nodes(slide).find(node => node.role === 'back-line').text).toBe('Find your next plan');
    expect(nodes(slide).find(node => node.role === 'back-kicker').text).toBe('');
  });

  test('known Unsplash covers keep attribution and an invented asset id is rejected', () => {
    const { composition, context } = inputs();
    const asset = { id: 'unsplash:catalog-photo', provider: 'unsplash', photoId: 'catalog-photo',
      src: 'https://images.unsplash.com/photo-123', photographer: 'Pat', credit: 'Pat / Unsplash',
      sourceUrl: 'https://unsplash.com/photos/catalog-photo', photographerUrl: 'https://unsplash.com/@pat' };
    context.coverAssets = [asset]; composition.cover.assetRef = { kind: 'unsplash', assetId: asset.id };
    const photo = nodes(buildCompositionDocument(composition, context).slides[0]).find(node => node.role === 'cover-photo');
    expect(photo.asset).toMatchObject({ provider: 'unsplash', photoId: 'catalog-photo', credit: 'Pat / Unsplash' });
    composition.cover.assetRef.assetId = 'unsplash:invented';
    expect(() => buildCompositionDocument(composition, context)).toThrow(/not in this account catalog/);
  });

  test.each([
    ['too few', ({ composition }) => { composition.selectedEventRefs.pop(); }],
    ['too many', ({ composition }) => { composition.selectedEventRefs.push(...composition.selectedEventRefs); }],
    ['duplicate', ({ composition }) => { composition.selectedEventRefs[1] = composition.selectedEventRefs[0]; }],
    ['unknown', ({ context }) => { context.candidates.pop(); }],
    ['outside window', ({ context }) => { context.candidates[0].snapshot.startTime = '2026-11-01T00:00:00Z'; }],
    ['wrong tenant', ({ context }) => { context.account.sourceTenantKeys = ['sf']; }],
    ['missing poster', ({ context }) => { context.candidates[0].snapshot.image = null; }],
    ['unknown cover preset', ({ composition }) => { composition.cover.family = 'invented'; }],
    ['unknown event preset', ({ composition }) => { composition.eventSlides[0].presetId = 'invented'; }],
    ['unknown closing preset', ({ composition }) => { composition.optionalClosingSlide = { presetId: 'invented', line: 'Hi' }; }],
    ['wrong slide poster', ({ composition }) => { composition.eventSlides[0].assetRef.eventRef = composition.selectedEventRefs[1]; }],
    ['missing slide', ({ composition }) => { composition.eventSlides.pop(); }],
    ['empty caption', ({ composition }) => { composition.socialCaption = ' '; }],
    ['arbitrary cover', ({ composition }) => { composition.cover.assetRef = { kind: 'url', src: 'https://example.test' }; }],
  ])('rejects %s', (_label, mutate) => {
    const value = inputs(); mutate(value);
    expect(() => buildCompositionDocument(value.composition, value.context)).toThrow();
  });

  test('rejects a changed catalog version and permits inclusive upcoming endpoints', () => {
    const { composition, context } = inputs();
    context.window.from = context.window.from.replace('.000Z', '.123Z');
    context.window.to = context.window.to.replace('.000Z', '.123Z');
    // Mongo reads contain Date instances; comparison must retain milliseconds.
    context.candidates[0].snapshot.startTime = new Date(context.window.from);
    context.candidates[1].snapshot.startTime = new Date(context.window.to);
    expect(buildCompositionDocument(composition, context).slides).toHaveLength(4);
    const current = JSON.parse(JSON.stringify(context.candidates)); current[0].recordVersion = 'rv:event-new';
    expect(() => buildCompositionDocument(composition, context, current)).toThrow(/changed after/);
    context.window.toExclusive = true;
    expect(() => buildCompositionDocument(composition, context)).toThrow(/outside/);
  });

  test('allows repeat covers only with a reason, and accepts a different family or variation', () => {
    const { composition, context } = inputs();
    context.lastPostedIssues = [{ cover: { family: composition.cover.family, variation: composition.cover.variation } }];
    expect(() => buildCompositionDocument(composition, context)).toThrow(/one-line reason/);
    composition.cover.repeatReason = 'This poster is the strongest fit for the theme.';
    expect(buildCompositionDocument(composition, context).slides).toHaveLength(4);
    delete composition.cover.repeatReason; composition.cover.variation = 2;
    expect(buildCompositionDocument(composition, context).slides).toHaveLength(4);
  });

  test('job-derived ids are stable and distinct, and non-Unsplash sources cannot enter the stock catalog', () => {
    expect(composeIssueId('job:one')).toMatch(/^[0-9a-f]{24}$/);
    expect(composeIssueId('job:one')).toBe(composeIssueId('job:one'));
    expect(composeIssueId('job:two')).not.toBe(composeIssueId('job:one'));
    for (const src of ['https://images.unsplash.com.evil.test/photo', 'http://images.unsplash.com/photo', 'https://secret:password@images.unsplash.com/photo']) {
      expect(safeUnsplashAsset({ provider: 'unsplash', photoId: 'photo', src })).toBeNull();
    }
  });
});
