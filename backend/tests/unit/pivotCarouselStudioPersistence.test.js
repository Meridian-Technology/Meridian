const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
jest.mock('../../services/tenantConfigService', () => ({ getTenantByKey: jest.fn(async (_req, tenantKey) => ({ tenantKey, pivotPilot: true })) }));
jest.mock('../../services/imageUploadService', () => ({ uploadImageToS3: jest.fn(async (_file, folder, name) => `https://assets.example/${folder}/${name}`) }));
const sharp = require('sharp');
const { uploadImageToS3 } = require('../../services/imageUploadService');
const { uploadAsset, listAssets } = require('../../services/pivotCarouselAssetService');
const { createCarouselAccount, createCarouselIssue, getCarouselIssue, updateCarouselIssue } = require('../../services/pivotCarouselIssueService');
const { mintExportToken } = require('../../services/pivotCarouselExportService');
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
  });
});
