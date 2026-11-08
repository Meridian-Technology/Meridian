const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { createComputeJob } = require('../../services/pivotComputeJobStore');
const getGlobalModels = require('../../services/getGlobalModelService');

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => {
    const tenantKey = String(key || '').toLowerCase();
    if (tenantKey === 'sf') return { tenantKey, pivotPilot: true };
    return null;
  }),
}));

jest.mock('../../aws-config', () => ({
  getSignedUrlPromise: jest.fn(),
}));

const s3 = require('../../aws-config');
const { createCarouselAccount, createCarouselIssue, updateCarouselIssue, getCarouselIssuePreview } = require('../../services/pivotCarouselIssueService');

const SHA = 'a'.repeat(64);

describe('carousel issue preview', () => {
  let mongo;
  let req;
  let accountId;
  let previousBucket;

  beforeAll(async () => {
    previousBucket = process.env.AWS_S3_BUCKET_NAME;
    process.env.AWS_S3_BUCKET_NAME = 'pivot-exports-test';
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'admin-1' } };
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  beforeEach(async () => {
    await mongo.reset();
    await ensurePivotComputeJobIndexes(req, { force: true });
    s3.getSignedUrlPromise.mockReset();
    s3.getSignedUrlPromise.mockImplementation(async (_operation, params) => {
      const n = s3.getSignedUrlPromise.mock.calls.length;
      return `https://s3.test/${params.Key}?n=${n}&expires=${params.Expires}`;
    });
    const created = await createCarouselAccount(req, {
      displayName: 'Just Go SF',
      ownerTenantKey: 'sf',
      sourceTenantKeys: ['sf'],
    });
    accountId = created.data.account.id;
  });

  afterAll(async () => {
    process.env.AWS_S3_BUCKET_NAME = previousBucket;
    if (mongo) await mongo.cleanup();
  });

  async function issue() {
    const created = await createCarouselIssue(req, accountId, { name: 'Weekend' });
    expect(created.error).toBeUndefined();
    return created.data.issue;
  }

  async function seedExport(issueId, revision, { status = 'pending', artifacts = null, expired = false } = {}) {
    const externalJobId = `job:export:${issueId}:r${revision}`;
    await createComputeJob(req, {
      externalJobId,
      kind: 'carousel-export',
      cityKey: 'sf',
      contractVersion: '1',
      contextVersion: 'ctx:carousel.pending',
      createIdempotencyKey: `export:${issueId}:r${revision}`,
      requestedAt: '2026-11-06T20:00:00.000Z',
      origin: { type: 'admin' },
      options: { deckId: issueId, deckRevision: '2026-11-06T19:00:00.000Z' },
    });
    const set = { status };
    if (artifacts) {
      set.exportArtifacts = {
        attemptId: new mongoose.Types.ObjectId(),
        attemptNumber: 1,
        prefix: `pivot-exports/sf/${externalJobId}/1/`,
        grantId: 'grant:preview-001',
        finalizedAt: new Date('2026-11-06T20:05:00.000Z'),
        expiresAt: new Date('2026-11-20T20:05:00.000Z'),
        expired,
        artifacts: artifacts.map((artifact) => ({
          artifactId: `artifact:${artifact.logicalName}`,
          mimeType: artifact.mimeType,
          byteCount: 1000,
          sha256: SHA,
          slideNumber: artifact.slideNumber ?? null,
          logicalName: artifact.logicalName,
          objectKey: `pivot-exports/sf/${externalJobId}/1/${artifact.logicalName}`,
        })),
      };
    }
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne({ externalJobId }, { $set: set });
    return externalJobId;
  }

  function slidesOutOfOrder() {
    return [
      { logicalName: 'slide-02.png', mimeType: 'image/png', slideNumber: 2 },
      { logicalName: 'carousel.zip', mimeType: 'application/zip', slideNumber: null },
      { logicalName: 'slide-01.png', mimeType: 'image/png', slideNumber: 1 },
    ];
  }

  test('reports an in-flight export as pending', async () => {
    const draft = await issue();
    await seedExport(draft.id, 1, { status: 'running' });
    const preview = await getCarouselIssuePreview(req, accountId, draft.id);
    expect(preview.data).toEqual({ status: 'pending', revision: 1 });
    expect(s3.getSignedUrlPromise).not.toHaveBeenCalled();
  });

  test('reports a failed export as failed', async () => {
    const draft = await issue();
    await seedExport(draft.id, 1, { status: 'failed' });
    const preview = await getCarouselIssuePreview(req, accountId, draft.id);
    expect(preview.data).toEqual({ status: 'failed', revision: 1 });
    expect(s3.getSignedUrlPromise).not.toHaveBeenCalled();
  });

  test('returns fresh one-hour slide urls in order when the export is ready', async () => {
    const draft = await issue();
    await seedExport(draft.id, 1, { status: 'completed', artifacts: slidesOutOfOrder() });
    const first = await getCarouselIssuePreview(req, accountId, draft.id);
    const second = await getCarouselIssuePreview(req, accountId, draft.id);
    expect(first.data).toMatchObject({ status: 'ready', revision: 1, expiresInSeconds: 3600 });
    expect(first.data.slides.map((slide) => slide.logicalName)).toEqual(['slide-01.png', 'slide-02.png']);
    expect(first.data.slides.map((slide) => slide.slideNumber)).toEqual([1, 2]);
    expect(second.data.slides.map((slide) => slide.url)).not.toEqual(first.data.slides.map((slide) => slide.url));
    expect(s3.getSignedUrlPromise.mock.calls.map((call) => call[0])).toEqual([
      'getObject', 'getObject', 'getObject', 'getObject',
    ]);
    for (const [, params] of s3.getSignedUrlPromise.mock.calls) {
      expect(params.Expires).toBe(3600);
      expect(params.ResponseContentType).toBe('image/png');
      expect(params.Key).toMatch(/slide-0[12]\.png$/);
    }
    expect(s3.getSignedUrlPromise.mock.calls.map(([, params]) => params.Key)).toEqual([
      expect.stringMatching(/slide-01\.png$/),
      expect.stringMatching(/slide-02\.png$/),
      expect.stringMatching(/slide-01\.png$/),
      expect.stringMatching(/slide-02\.png$/),
    ]);
  });

  test('reports a ready preview from an older revision as stale', async () => {
    const draft = await issue();
    await seedExport(draft.id, 1, { status: 'completed', artifacts: slidesOutOfOrder() });
    const edited = await updateCarouselIssue(req, accountId, draft.id, { revision: 1, socialCaption: 'Edited caption' });
    expect(edited.data.issue.revision).toBe(2);
    s3.getSignedUrlPromise.mockClear();
    const preview = await getCarouselIssuePreview(req, accountId, draft.id);
    expect(preview.data).toEqual({ status: 'stale', revision: 1 });
    expect(s3.getSignedUrlPromise).not.toHaveBeenCalled();
  });
});
