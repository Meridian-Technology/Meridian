const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
jest.mock('../../services/tenantConfigService', () => ({ getTenantByKey: jest.fn(async (_req, tenantKey) => ({ tenantKey, pivotPilot: true })) }));
jest.mock('../../services/imageUploadService', () => ({ uploadImageToS3: jest.fn(async (_file, folder, name) => `https://assets.example/${folder}/${name}`) }));
const sharp = require('sharp');
const { uploadImageToS3 } = require('../../services/imageUploadService');
const { uploadAsset, listAssets, fitExportImage } = require('../../services/pivotCarouselAssetService');
const { createCarouselAccount, createCarouselIssue, getCarouselIssue, updateCarouselIssue } = require('../../services/pivotCarouselIssueService');
const { createCheckpoint, restoreCheckpoint, listCheckpoints, RETENTION } = require('../../services/pivotCarouselRevisionService');
const { mintExportToken, prepareLocalExport, readDeckForExport, deckRevision } = require('../../services/pivotCarouselExportService');
const { pinExportRevision } = require('../../services/pivotCarouselRevisionService');
const { buildCarouselExportContextSnapshot } = require('../../services/pivotCarouselComputeContextService');
const { validateContextSnapshot } = require('../../utilities/pivotAdminComputeJobContract');
const makeDoc = asset => ({ schemaVersion: 2, width: 1080, height: 1350, slides: [{ id: 's', elements: [{ id: 'p', kind: 'image', frame: { x: 0, y: 0, width: 640, height: 640 }, asset }] }] });
describe('studio persistence boundaries', () => {
  let mongo; let req; let accountId; let otherId; let file;
  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'admin-1' }, body: {} };
    const buffer = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#ff4f1f' } }).png().toBuffer();
    file = { buffer, size: buffer.length, mimetype: 'image/png', originalname: 'studio.png' };
  });
  beforeEach(async () => {
    await mongo.reset(); uploadImageToS3.mockClear();
    const args = { displayName: 'Studio', ownerTenantKey: 'sf', sourceTenantKeys: ['sf'] };
    accountId = (await createCarouselAccount(req, args)).data.account.id;
    otherId = (await createCarouselAccount(req, args)).data.account.id;
  });
  afterAll(async () => mongo.cleanup());
  test('upload, save, reload, replace, and remove retain stable account assets', async () => {
    const first = (await uploadAsset(req, accountId, file)).data.asset;
    expect(uploadImageToS3.mock.calls[0][3]).toEqual({ maxBytes: 8 * 1024 * 1024 });
    const issue = (await createCarouselIssue(req, accountId, { name: 'Photos', document: makeDoc(first) })).data.issue;
    const second = (await uploadAsset(req, accountId, file)).data.asset;
    const saved = await updateCarouselIssue(req, accountId, issue.id, { revision: 1, document: makeDoc({ ...second, credit: 'Photographer' }) });
    expect(saved.data.issue.revision).toBe(2);
    const reload = (await getCarouselIssue(req, accountId, issue.id)).data.issue;
    expect(reload.document.slides[0].elements[0].asset).toMatchObject({ key: second.key, credit: 'Photographer' });
    reload.document.slides[0].elements = [];
    await updateCarouselIssue(req, accountId, issue.id, { revision: 2, document: reload.document });
    expect((await listAssets(req, accountId)).data.assets).toHaveLength(2);
    expect((await listAssets(req, otherId)).data.assets).toHaveLength(0);
    expect(JSON.stringify(reload.document)).not.toContain('data:image');
  });
  test('cross-account references and malformed/oversized uploads are rejected', async () => {
    const asset = (await uploadAsset(req, otherId, file)).data.asset;
    for (const value of [asset, { key: asset.key, src: asset.src }, { src: asset.src }]) {
      const result = await createCarouselIssue(req, accountId, { name: 'Foreign image', document: makeDoc(value) });
      expect(result.code).toBe('ASSET_NOT_ALLOWED');
    }
    expect((await uploadAsset(req, accountId, { ...file, size: 8 * 1024 * 1024 + 1 })).code).toBe('INVALID_IMAGE');
    expect((await uploadAsset(req, accountId, { ...file, buffer: Buffer.from('not an image') })).code).toBe('INVALID_IMAGE');
    expect((await uploadAsset(req, accountId, { ...file, mimetype: 'image/jpeg' })).code).toBe('INVALID_IMAGE');
  });
  test('storage failure creates no asset record', async () => {
    uploadImageToS3.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(uploadAsset(req, accountId, file)).rejects.toThrow('storage unavailable');
    expect((await listAssets(req, accountId)).data.assets).toEqual([]);
  });
  test('concurrent document and metadata saves have exactly one winner', async () => {
    const issue = (await createCarouselIssue(req, accountId, { name: 'Race', document: makeDoc({ src: 'https://example.test/photo.png' }) })).data.issue;
    const results = await Promise.all(['First', 'Second'].map(theme => updateCarouselIssue(req, accountId, issue.id, { revision: 1, document: { ...issue.document, slides: issue.document.slides.map(s => ({ ...s, background: { kind: 'fill', color: theme === 'First' ? '#ffffff' : '#000000' } })) }, sources: [], curation: { refs: [], snapshots: [], theme } })));
    expect(results.filter(r => r.data)).toHaveLength(1); expect(results.filter(r => r.code === 'REVISION_CONFLICT')).toHaveLength(1);
    const stored = (await getCarouselIssue(req, accountId, issue.id)).data.issue;
    expect(stored.revision).toBe(2);
    expect(stored.document.slides[0].background.color).toBe(stored.curation.theme === 'First' ? '#ffffff' : '#000000');
    expect((await mintExportToken(req, 'sf', issue.id)).code).toBe('V2_EXPORT_UNAVAILABLE');
    expect(results.find(result => result.code === 'REVISION_CONFLICT').issue.revision).toBe(2);
  });
  test('named checkpoints survive retention and restore as a new revision', async () => {
    let issue = (await createCarouselIssue(req, accountId, { name: 'History', document: makeDoc({ src: 'https://example.test/photo.png' }) })).data.issue;
    const checkpoint = await createCheckpoint(req, accountId, issue.id, { name: 'Before the rush', revision: 1 });
    expect(checkpoint.data.checkpoint.headRevision).toBe(1);
    for (let revision = 1; revision <= RETENTION.autosaveSnapshotsPerIssue + 3; revision += 1) {
      const current = (await getCarouselIssue(req, accountId, issue.id)).data.issue;
      const next = await updateCarouselIssue(req, accountId, issue.id, {
        revision: current.revision,
        document: makeDoc({ src: `https://example.test/${revision}.png` }),
      });
      expect(next.data.issue.revision).toBe(current.revision + 1);
    }
    const listed = await listCheckpoints(req, accountId, issue.id);
    expect(listed.data.checkpoints.map(row => row.name)).toEqual(['Before the rush']);
    expect(listed.data.retention.namedCheckpoints).toBe('retain');
    const getGlobalModels = require('../../services/getGlobalModelService');
    const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
    const saves = await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'save' });
    expect(saves).toBeLessThanOrEqual(RETENTION.autosaveSnapshotsPerIssue + 1);
    const restored = await restoreCheckpoint(req, accountId, issue.id, checkpoint.data.checkpoint.id, {
      revision: (await getCarouselIssue(req, accountId, issue.id)).data.issue.revision,
    });
    expect(restored.data.issue.document.slides[0].elements[0].asset.src).toBe('https://example.test/photo.png');
    expect(restored.data.issue.revision).toBeGreaterThan(checkpoint.data.checkpoint.headRevision);
    const again = await listCheckpoints(req, accountId, issue.id);
    expect(again.data.checkpoints[0]).toMatchObject({ name: 'Before the rush', headRevision: 1 });
  });
  test('a queued export keeps the pinned revision after the issue and voice change', async () => {
    process.env.JWT_SECRET = 'carousel-export-pin-test';
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => file.buffer,
    }));
    const queued = makeDoc({ src: 'https://example.test/photo.png' });
    queued.slides[0].elements.push({ id: 'title', kind: 'text', text: 'queued copy', presence: 'custom', frame: { x: 40, y: 40, width: 400, height: 80 } });
    const issue = (await createCarouselIssue(req, accountId, { name: 'Pinned', document: queued })).data.issue;
    const getGlobalModels = require('../../services/getGlobalModelService');
    const { PivotCarouselDeck, PivotCarouselVoice, PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselDeck', 'PivotCarouselVoice', 'PivotCarouselRevision');
    const deck = await PivotCarouselDeck.findById(issue.id).lean();
    const source = deckRevision(deck);
    const pin = await pinExportRevision(req, deck, source);
    expect(pin.data.pin.document.slides[0].elements[0].asset.key).toMatch(/^pivot-carousel\/accounts\//);
    const edited = JSON.parse(JSON.stringify(queued));
    edited.slides[0].elements[1].text = 'edited later';
    await updateCarouselIssue(req, accountId, issue.id, { revision: 1, document: edited });
    await PivotCarouselVoice.create({ tenantKey: 'sf', entries: { title: 'live voice' } });
    const job = {
      externalJobId: 'job:carousel-sf-pin',
      tenantKey: 'sf',
      cityKey: 'sf',
      implementationRevision: 'platform-admin-ui',
      options: { deckId: issue.id, deckRevision: source },
      lease: { attemptId: '507f1f77bcf86cd799439012' },
    };
    const context = await buildCarouselExportContextSnapshot(req, { job, now: new Date('2026-09-24T20:00:00.000Z') });
    expect(validateContextSnapshot(context.data.snapshot)).toEqual({ valid: true });
    expect(context.data.snapshot.contractVersion).toBe('1');
    expect(context.data.snapshot.deckRevision).toBe(source);
    const exported = await readDeckForExport(req, context.data.snapshot.renderToken, issue.id);
    expect(exported.data.cityVoice).toEqual({});
    expect(exported.data.deck.document.slides[0].elements[1].text).toBe('queued copy');
    expect(exported.data.deck.document.slides[0].elements[0].asset.src).not.toBe('https://example.test/photo.png');
    await expect(buildCarouselExportContextSnapshot(req, {
      job: { ...job, tenantKey: 'nyc', cityKey: 'nyc' },
      now: new Date('2026-09-24T20:00:00.000Z'),
    })).rejects.toThrow(/not found/i);
    global.fetch = jest.fn(async () => ({ ok: false, headers: { get: () => '' }, arrayBuffer: async () => Buffer.alloc(0) }));
    const again = await pinExportRevision(req, deck, source);
    expect(again.code).toBe('ASSET_UNAVAILABLE');
    expect(await PivotCarouselRevision.countDocuments({ issueId: issue.id, kind: 'export' })).toBe(1);
  });
  test('an export pin shrinks a photograph that is over the upload limit', async () => {
    const raw = Buffer.alloc(1900 * 1900 * 3, 180);
    const big = await sharp(raw, { raw: { width: 1900, height: 1900, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    expect(big.length).toBeGreaterThan(8 * 1024 * 1024);
    const fitted = await fitExportImage(big);
    expect(fitted.mimetype).toBe('image/jpeg');
    expect(fitted.buffer.length).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
  test('an export pin accepts a photograph whose server type does not match its bytes', async () => {
    process.env.JWT_SECRET = 'carousel-export-pin-test';
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => file.buffer,
    }));
    const issue = (await createCarouselIssue(req, accountId, {
      name: 'Mislabeled',
      document: makeDoc({ src: 'https://images.example/night.jpg' }),
    })).data.issue;
    const prepared = await prepareLocalExport(req, 'sf', issue.id);
    expect(prepared.data.token).toEqual(expect.any(String));
    const rendered = await readDeckForExport(req, prepared.data.token, issue.id);
    expect(rendered.data.deck.document.slides[0].elements[0].asset.key).toMatch(/^pivot-carousel\/accounts\//);
    expect(rendered.data.deck.document.slides[0].elements[0].asset.src).not.toBe('https://images.example/night.jpg');
  });
  test('a command-line token stays on the saved revision after the issue changes', async () => {
    process.env.JWT_SECRET = 'carousel-export-pin-test';
    const document = {
      schemaVersion: 2,
      width: 1080,
      height: 1350,
      slides: [{ id: 's', elements: [{ id: 't', kind: 'text', text: 'queued copy', presence: 'custom', frame: { x: 0, y: 0, width: 200, height: 40 } }] }],
    };
    const issue = (await createCarouselIssue(req, accountId, { name: 'Local', document })).data.issue;
    const prepared = await prepareLocalExport(req, 'sf', issue.id);
    expect(prepared.data.slideCount).toBe(1);
    expect(prepared.data.token).toEqual(expect.any(String));
    const edited = JSON.parse(JSON.stringify(document));
    edited.slides[0].elements[0].text = 'edited later';
    await updateCarouselIssue(req, accountId, issue.id, { revision: 1, document: edited });
    const rendered = await readDeckForExport(req, prepared.data.token, issue.id);
    expect(rendered.data.deck.document.slides[0].elements[0].text).toBe('queued copy');
    expect(rendered.data.cityVoice).toEqual({});
  });
});
