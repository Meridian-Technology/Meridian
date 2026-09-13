const jwt = require('jsonwebtoken');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { createComputeJob, claimNextPendingJob, startComputeJob } = require('../../services/pivotComputeJobStore');
const { UPLOAD_PURPOSE } = require('../../services/pivotCarouselComputeContextService');
const {
  buildExportPrefix,
  buildExportObjectKey,
  sha256HexToS3Checksum,
} = require('../../services/pivotExportArtifactStorage');

jest.mock('../../services/pivotExportArtifactStorage', () => {
  const actual = jest.requireActual('../../services/pivotExportArtifactStorage');
  return {
    ...actual,
    createPresignedPutUrl: jest.fn(async ({ objectKey, contentType, byteCount }) => ({
      uploadUrl: `https://s3.test/${objectKey}?signed=1`,
      uploadHeaders: {
        'Content-Type': contentType,
        'Content-Length': String(byteCount),
      },
      expiresInSeconds: 600,
    })),
    headExportObject: jest.fn(),
    hashExportObject: jest.fn(),
    deleteExportPrefix: jest.fn(async () => ({ deleted: 2 })),
  };
});

const storage = require('../../services/pivotExportArtifactStorage');
const {
  initializeCarouselArtifactUploads,
  finalizeCarouselArtifactUploads,
  cleanupCarouselAttemptPrefix,
  cleanupExpiredCarouselExports,
} = require('../../services/pivotCarouselArtifactTransportService');
const { carouselExportArtifactPlan } = require('../../utilities/pivotAdminComputeJobContract');

const DECK_ID = '507f1f77bcf86cd799439011';
const REVISION = '2026-09-11T19:58:00.000Z';
const FIXED_NOW = new Date('2026-09-11T20:06:00.000Z');
const PNG_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PNG_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ZIP = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

function mintGrant(job, overrides = {}) {
  return jwt.sign({
    purpose: UPLOAD_PURPOSE,
    grantId: 'grant:test-carousel-001',
    tenantKey: job.tenantKey,
    cityKey: job.cityKey,
    jobId: job.externalJobId,
    attemptId: job.lease.attemptId,
    deckId: job.options.deckId,
    deckRevision: job.options.deckRevision,
    ...overrides,
  }, process.env.JWT_SECRET, { expiresIn: 600 });
}

function artifactList() {
  return [
    { logicalName: 'slide-01.png', mimeType: 'image/png', byteCount: 100, sha256: PNG_A },
    { logicalName: 'slide-02.png', mimeType: 'image/png', byteCount: 110, sha256: PNG_B },
    { logicalName: 'carousel.zip', mimeType: 'application/zip', byteCount: 200, sha256: ZIP },
  ];
}

describe('carousel export artifact transport', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'carousel-artifact-transport-secret';
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
    await ensurePivotComputeJobIndexes(req, { force: true });
  });

  afterEach(async () => {
    await mongo.reset();
    await ensurePivotComputeJobIndexes(req, { force: true });
    storage.createPresignedPutUrl.mockClear();
    storage.headExportObject.mockReset();
    storage.hashExportObject.mockReset();
    storage.deleteExportPrefix.mockClear();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('builds attempt-scoped object keys under pivot-exports', () => {
    expect(buildExportPrefix({
      tenantKey: 'iowacity',
      externalJobId: 'job:carousel-iowacity-001',
      attemptNumber: 2,
    })).toBe('pivot-exports/iowacity/job:carousel-iowacity-001/2/');
    expect(buildExportObjectKey({
      tenantKey: 'iowacity',
      externalJobId: 'job:carousel-iowacity-001',
      attemptNumber: 2,
      logicalName: 'slide-01.png',
    })).toBe('pivot-exports/iowacity/job:carousel-iowacity-001/2/slide-01.png');
    expect(() => buildExportObjectKey({
      tenantKey: 'iowacity',
      externalJobId: 'job:carousel-iowacity-001',
      attemptNumber: 2,
      logicalName: '../secret.png',
    })).toThrow(/Unapproved/);
    expect(carouselExportArtifactPlan(2)).toHaveLength(3);
    expect(carouselExportArtifactPlan(1)).toEqual([
      { logicalName: 'slide-01.png', mimeType: 'image/png', slideNumber: 1 },
    ]);
    expect(carouselExportArtifactPlan([2])).toEqual([
      { logicalName: 'slide-02.png', mimeType: 'image/png', slideNumber: 2 },
    ]);
  });

  async function leaseCarouselJob(options = { deckId: DECK_ID, deckRevision: REVISION }) {
    const created = await createComputeJob(req, {
      externalJobId: 'job:carousel-iowacity-001',
      kind: 'carousel-export',
      cityKey: 'iowacity',
      contractVersion: '1',
      contextVersion: 'ctx:carousel.0123456789abcdef0123456789abcdef',
      createIdempotencyKey: 'idem:carousel-artifact-001',
      requestedAt: FIXED_NOW.toISOString(),
      origin: { type: 'admin' },
      options,
    });
    const claim = await claimNextPendingJob(req, {
      kind: 'carousel-export',
      workerId: 'worker-mini-1',
      now: FIXED_NOW,
    });
    await startComputeJob(req, {
      externalJobId: created.job.externalJobId,
      leaseToken: claim.job.lease.token,
      workerId: 'worker-mini-1',
      now: new Date('2026-09-11T20:06:01.000Z'),
    });
    return claim.job;
  }

  it('initializes presigned uploads bound to the active lease, grant, and attempt prefix', async () => {
    const job = await leaseCarouselJob();
    const init = await initializeCarouselArtifactUploads(req, {
      job,
      grantToken: mintGrant(job),
      slideCount: 2,
      artifacts: artifactList(),
      now: FIXED_NOW,
    });

    expect(init.prefix).toBe('pivot-exports/iowacity/job:carousel-iowacity-001/1/');
    expect(init.finalized).toBe(false);
    expect(init.uploads).toHaveLength(3);
    expect(init.uploads[0]).toMatchObject({
      logicalName: 'slide-01.png',
      mimeType: 'image/png',
      slideNumber: 1,
      objectKey: 'pivot-exports/iowacity/job:carousel-iowacity-001/1/slide-01.png',
    });
    expect(init.uploads[0].uploadUrl).toContain('https://s3.test/');
    expect(init.uploads[0].artifactId).toMatch(/^artifact:/);
    expect(storage.createPresignedPutUrl).toHaveBeenCalledTimes(3);
  });

  it('accepts a single PNG without a ZIP when that is the selected slide', async () => {
    const job = await leaseCarouselJob({
      deckId: DECK_ID,
      deckRevision: REVISION,
      slideNumbers: [2],
    });
    const init = await initializeCarouselArtifactUploads(req, {
      job,
      grantToken: mintGrant(job),
      slideCount: 1,
      artifacts: [{
        logicalName: 'slide-02.png',
        mimeType: 'image/png',
        byteCount: 110,
        sha256: PNG_B,
      }],
      now: FIXED_NOW,
    });
    expect(init.uploads).toHaveLength(1);
    expect(init.uploads[0]).toMatchObject({
      logicalName: 'slide-02.png',
      slideNumber: 2,
    });
    await expect(initializeCarouselArtifactUploads(req, {
      job,
      grantToken: mintGrant(job),
      slideCount: 1,
      artifacts: [
        { logicalName: 'slide-02.png', mimeType: 'image/png', byteCount: 110, sha256: PNG_B },
        { logicalName: 'carousel.zip', mimeType: 'application/zip', byteCount: 200, sha256: ZIP },
      ],
      now: FIXED_NOW,
    })).rejects.toMatchObject({ code: 'UNAPPROVED_EXPORT_FILENAME' });
  });

  it('rejects an upload grant minted for another attempt', async () => {
    const job = await leaseCarouselJob();
    await expect(initializeCarouselArtifactUploads(req, {
      job,
      grantToken: mintGrant(job, { attemptId: '507f1f77bcf86cd799439099' }),
      slideCount: 2,
      artifacts: artifactList(),
      now: FIXED_NOW,
    })).rejects.toMatchObject({ code: 'ARTIFACT_GRANT_BINDING_MISMATCH', status: 403 });
  });

  it('rejects unapproved filenames and oversized artifacts at init', async () => {
    const job = await leaseCarouselJob();
    await expect(initializeCarouselArtifactUploads(req, {
      job,
      grantToken: mintGrant(job),
      slideCount: 2,
      artifacts: [{ logicalName: 'notes.txt', mimeType: 'text/plain', byteCount: 12, sha256: PNG_A }],
      now: FIXED_NOW,
    })).rejects.toMatchObject({ code: 'UNAPPROVED_EXPORT_FILENAME' });
    await expect(initializeCarouselArtifactUploads(req, {
      job,
      grantToken: mintGrant(job),
      slideCount: 2,
      artifacts: [{
        logicalName: 'slide-01.png',
        mimeType: 'image/png',
        byteCount: 64 * 1024 * 1024 + 1,
        sha256: PNG_A,
      }],
      now: FIXED_NOW,
    })).rejects.toMatchObject({ code: 'ARTIFACT_SIZE_INVALID' });
  });

  it('finalizes idempotently after verifying object existence, prefix, type, size, and checksum', async () => {
    const job = await leaseCarouselJob();
    const artifacts = artifactList();
    const grantToken = mintGrant(job);
    const init = await initializeCarouselArtifactUploads(req, {
      job,
      grantToken,
      slideCount: 2,
      artifacts,
      now: FIXED_NOW,
    });
    storage.headExportObject.mockImplementation(async (objectKey) => {
      const entry = artifacts.find((artifact) => objectKey.endsWith(artifact.logicalName));
      return {
        ContentLength: entry.byteCount,
        ContentType: entry.mimeType,
        ChecksumSHA256: sha256HexToS3Checksum(entry.sha256),
      };
    });

    const requested = artifacts.map((artifact, index) => ({
      ...artifact,
      artifactId: init.uploads[index].artifactId,
      slideNumber: artifact.logicalName.endsWith('.zip') ? null : index + 1,
    }));
    const first = await finalizeCarouselArtifactUploads(req, {
      job,
      grantToken,
      artifacts: requested,
      now: new Date('2026-09-11T20:07:00.000Z'),
    });
    expect(first.finalized).toBe(true);
    expect(first.artifacts).toHaveLength(3);
    expect(storage.headExportObject).toHaveBeenCalledTimes(3);

    const second = await finalizeCarouselArtifactUploads(req, {
      job,
      grantToken,
      artifacts: requested,
      now: new Date('2026-09-11T20:07:05.000Z'),
    });
    expect(second.artifacts).toEqual(first.artifacts);
    expect(storage.headExportObject).toHaveBeenCalledTimes(3);
  });

  it('does not let a missing object finalize', async () => {
    const job = await leaseCarouselJob();
    const grantToken = mintGrant(job);
    const init = await initializeCarouselArtifactUploads(req, {
      job,
      grantToken,
      slideCount: 2,
      artifacts: artifactList(),
      now: FIXED_NOW,
    });
    storage.headExportObject.mockRejectedValue(Object.assign(new Error('missing'), { code: 'EXPORT_OBJECT_NOT_FOUND', status: 409 }));
    await expect(finalizeCarouselArtifactUploads(req, {
      job,
      grantToken,
      artifacts: artifactList().map((artifact, index) => ({
        ...artifact,
        artifactId: init.uploads[index].artifactId,
      })),
      now: FIXED_NOW,
    })).rejects.toMatchObject({ code: 'EXPORT_OBJECT_NOT_FOUND' });
  });

  it('deletes attempt prefixes and expired completed exports', async () => {
    const job = await leaseCarouselJob();
    await cleanupCarouselAttemptPrefix(req, {
      tenantKey: job.tenantKey,
      externalJobId: job.externalJobId,
      attemptNumber: job.lease.attemptNumber,
      attemptId: job.lease.attemptId,
    });
    expect(storage.deleteExportPrefix).toHaveBeenCalledWith(
      'pivot-exports/iowacity/job:carousel-iowacity-001/1/',
    );

    const getGlobalModels = require('../../services/getGlobalModelService');
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne(
      { externalJobId: job.externalJobId },
      {
        $set: {
          exportArtifacts: {
            attemptId: job.lease.attemptId,
            attemptNumber: 1,
            prefix: 'pivot-exports/iowacity/job:carousel-iowacity-001/1/',
            grantId: 'grant:test-carousel-001',
            finalizedAt: new Date('2026-08-01T00:00:00.000Z'),
            expiresAt: new Date('2026-08-15T00:00:00.000Z'),
            expired: false,
            artifacts: [],
          },
        },
      },
    );
    const cleaned = await cleanupExpiredCarouselExports(req, { now: FIXED_NOW });
    expect(cleaned.cleaned).toEqual(['job:carousel-iowacity-001']);
    const updated = await PivotComputeJob.findOne({ externalJobId: job.externalJobId }).lean();
    expect(updated.exportArtifacts.expired).toBe(true);
  });
});
