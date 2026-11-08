const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getGlobalModels = require('../../services/getGlobalModelService');
const { createDraftRender } = require('../../services/pivotCarouselDraftRenderService');
const { readDeckForExport } = require('../../services/pivotCarouselExportService');
const { loadFixture } = require('../../utilities/pivotAdminComputeJobContract');

jest.setTimeout(120000);

const previousSecret = process.env.JWT_SECRET;

function fixtures() {
  const composition = loadFixture('result-compose-valid.json').composition;
  const context = loadFixture('context-compose-valid.json');
  context.candidates = composition.selectedEventRefs.map((ref, index) => ({ ref,
    recordVersion: `rv:event-${index}`, snapshot: { name: `Event ${index}`, image: `https://example.test/${index}.jpg`,
      startTime: '2026-10-13T23:00:00Z', location: 'Catalog venue', city: { name: 'Iowa City', timezone: 'America/Chicago' } } }));
  composition.cover.assetRef = { kind: 'event-poster', eventRef: composition.selectedEventRefs[0] };
  return { composition: { ...composition, themeLabel: 'Small rooms', rationale: 'Three shows.' }, context };
}

describe('draft renders for the compose review pass', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-render-secret';
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
  });

  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    await mongo?.cleanup();
  });

  beforeEach(async () => {
    await mongo.reset();
  });

  async function storeJob(kind = 'carousel-compose') {
    const { context } = fixtures();
    const externalJobId = `job:compose:${Math.random().toString(36).slice(2, 10)}`;
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    // Raw insert: only the stored context matters to a draft render.
    await PivotComputeJob.collection.insertOne({ externalJobId, kind, tenantKey: 'ic', cityKey: 'ic', composeContext: context, reviseContext: null });
    return { externalJobId, kind, tenantKey: 'ic', cityKey: 'ic' };
  }

  it('builds the composition, keeps it briefly, and renders it through the export page', async () => {
    const job = await storeJob();
    const { composition } = fixtures();
    const draft = await createDraftRender(req, { job, composition, renderUrlBase: 'https://www.example.test/carousel-export' });
    expect(draft).toMatchObject({
      deckId: expect.stringMatching(/^draft-[0-9a-f]{24}$/),
      renderToken: expect.any(String),
      renderUrlBase: 'https://www.example.test/carousel-export',
      slideCount: 1 + composition.eventSlides.length,
      width: 1080,
      height: 1350,
    });

    const read = await readDeckForExport(req, draft.renderToken, draft.deckId);
    expect(read.error).toBeUndefined();
    expect(read.data.deck).toMatchObject({ id: draft.deckId, schemaVersion: 2 });
    expect(read.data.deck.document.slides).toHaveLength(draft.slideCount);

    const otherDeck = await readDeckForExport(req, draft.renderToken, 'draft-000000000000000000000000');
    expect(otherDeck.code).toBe('TOKEN_WRONG_DECK');
  });

  it('rejects a composition outside the contract or one the builder refuses', async () => {
    const job = await storeJob();
    const { composition } = fixtures();
    await expect(createDraftRender(req, { job, composition: { ...composition, cover: { ...composition.cover, family: 'BAD FAMILY' } } }))
      .rejects.toMatchObject({ code: 'DRAFT_RENDER_INVALID' });
    composition.cover.layout = {
      background: 'ink',
      elements: [
        { kind: 'text', role: 'headline', text: 'Off the edge', box: { x: 50, y: 10, width: 80, height: 20 }, font: 'Les Flos Sans', size: 10, color: 'paper' },
        { kind: 'sticker', finish: 'light', box: { x: 60, y: 100, width: 25, height: 14 } },
      ],
    };
    await expect(createDraftRender(req, { job, composition })).rejects.toMatchObject({ code: 'COMPOSE_LAYOUT_INVALID' });
    const { PivotCarouselDraftRender } = getGlobalModels(req, 'PivotCarouselDraftRender');
    expect(await PivotCarouselDraftRender.countDocuments({})).toBe(0);
  });

  it('only serves compose and revise jobs, and an expired draft is gone', async () => {
    const { composition } = fixtures();
    await expect(createDraftRender(req, { job: { externalJobId: 'job:x', kind: 'carousel-export' }, composition }))
      .rejects.toMatchObject({ code: 'DRAFT_RENDER_KIND' });

    const job = await storeJob();
    const draft = await createDraftRender(req, { job, composition, renderUrlBase: 'https://x.test/carousel-export' });
    const { PivotCarouselDraftRender } = getGlobalModels(req, 'PivotCarouselDraftRender');
    await PivotCarouselDraftRender.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const read = await readDeckForExport(req, draft.renderToken, draft.deckId);
    expect(read.code).toBe('DRAFT_RENDER_NOT_FOUND');
  });
});
