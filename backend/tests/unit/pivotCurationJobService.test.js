jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const {
  listCurationJobs,
  createCurationJob,
  updateCurationJob,
  deleteCurationJob,
} = require('../../services/pivotCurationJobService');

const JOB_ID = '665a1b2c3d4e5f6789012345';
const OTHER_JOB_ID = '665a1b2c3d4e5f6789012346';

function mockReq(overrides = {}) {
  return {
    globalDb: {},
    user: { email: 'ops@meridian.app', globalUserId: '507f191e810c19729de860ea' },
    ...overrides,
  };
}

function leanDoc(overrides = {}) {
  return {
    _id: JOB_ID,
    tenantKey: 'nyc',
    label: 'Partiful Brooklyn explore',
    url: 'https://partiful.com/explore/brooklyn',
    provider: 'partiful',
    defaultBatchWeekStrategy: 'next-drop',
    defaultTags: ['nightlife'],
    enabled: true,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunStats: null,
    createdBy: 'ops@meridian.app',
    createdAt: new Date('2026-07-09T12:00:00.000Z'),
    updatedAt: new Date('2026-07-09T12:00:00.000Z'),
    ...overrides,
  };
}

describe('pivotCurationJobService', () => {
  let PivotCurationJob;

  beforeEach(() => {
    PivotCurationJob = {
      find: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
      findOneAndDelete: jest.fn(),
    };
    getGlobalModels.mockReturnValue({ PivotCurationJob });
    resolvePivotTenant.mockResolvedValue({
      tenant: { tenantKey: 'nyc', cityDisplayName: 'New York City' },
    });
  });

  describe('listCurationJobs', () => {
    it('lists jobs filtered by tenantKey', async () => {
      const docs = [leanDoc(), leanDoc({ _id: OTHER_JOB_ID, label: 'Luma' })];
      PivotCurationJob.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(docs),
        }),
      });

      const result = await listCurationJobs(mockReq(), { tenantKey: 'nyc' });

      expect(result.data.tenantKey).toBe('nyc');
      expect(result.data.jobs).toHaveLength(2);
      expect(PivotCurationJob.find).toHaveBeenCalledWith({ tenantKey: 'nyc' });
      expect(getGlobalModels).toHaveBeenCalledWith(expect.any(Object), 'PivotCurationJob');
    });

    it('propagates TENANT_NOT_FOUND', async () => {
      resolvePivotTenant.mockResolvedValue({
        error: 'Pivot tenant not found.',
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });

      const result = await listCurationJobs(mockReq(), { tenantKey: 'missing' });
      expect(result.code).toBe('TENANT_NOT_FOUND');
      expect(PivotCurationJob.find).not.toHaveBeenCalled();
    });
  });

  describe('createCurationJob', () => {
    it('creates a partiful job with allowlisted URL', async () => {
      PivotCurationJob.create.mockResolvedValue(leanDoc());

      const result = await createCurationJob(mockReq(), {
        tenantKey: 'nyc',
        label: 'Partiful Brooklyn explore',
        url: 'https://partiful.com/explore/brooklyn',
        provider: 'partiful',
        defaultTags: ['nightlife', ''],
      });

      expect(result.data.job.label).toBe('Partiful Brooklyn explore');
      expect(PivotCurationJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantKey: 'nyc',
          label: 'Partiful Brooklyn explore',
          provider: 'partiful',
          url: 'https://partiful.com/explore/brooklyn',
          defaultBatchWeekStrategy: 'next-drop',
          defaultTags: ['nightlife'],
          enabled: true,
          createdBy: 'ops@meridian.app',
        }),
      );
    });

    it('rejects unsupported host URLs', async () => {
      const result = await createCurationJob(mockReq(), {
        tenantKey: 'nyc',
        label: 'Bad host',
        url: 'https://example.com/events',
        provider: 'partiful',
      });

      expect(result.code).toBe('UNSUPPORTED_HOST');
      expect(result.status).toBe(400);
      expect(PivotCurationJob.create).not.toHaveBeenCalled();
    });

    it('rejects invalid URLs', async () => {
      const result = await createCurationJob(mockReq(), {
        tenantKey: 'nyc',
        label: 'Bad url',
        url: 'not-a-url',
        provider: 'luma',
      });

      expect(result.code).toBe('INVALID_URL');
      expect(PivotCurationJob.create).not.toHaveBeenCalled();
    });

    it('allows manual-json jobs without a URL', async () => {
      PivotCurationJob.create.mockResolvedValue(
        leanDoc({
          label: 'JSON paste',
          url: null,
          provider: 'manual-json',
          defaultTags: [],
        }),
      );

      const result = await createCurationJob(mockReq(), {
        tenantKey: 'nyc',
        label: 'JSON paste',
        provider: 'manual-json',
      });

      expect(result.data.job.provider).toBe('manual-json');
      expect(PivotCurationJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'manual-json',
          url: null,
        }),
      );
    });

    it('infers provider from URL when omitted', async () => {
      PivotCurationJob.create.mockResolvedValue(leanDoc({ provider: 'luma' }));

      await createCurationJob(mockReq(), {
        tenantKey: 'nyc',
        label: 'Luma discover',
        url: 'https://lu.ma/nyc',
      });

      expect(PivotCurationJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'luma',
          url: 'https://lu.ma/nyc',
        }),
      );
    });

    it('rejects provider/host mismatch', async () => {
      const result = await createCurationJob(mockReq(), {
        tenantKey: 'nyc',
        label: 'Mismatch',
        url: 'https://partiful.com/explore/brooklyn',
        provider: 'luma',
      });

      expect(result.code).toBe('PROVIDER_MISMATCH');
      expect(PivotCurationJob.create).not.toHaveBeenCalled();
    });
  });

  describe('updateCurationJob', () => {
    it('updates label and tags for a tenant-scoped job', async () => {
      const doc = {
        ...leanDoc(),
        save: jest.fn().mockResolvedValue(undefined),
        toObject() {
          return leanDoc({ label: 'Renamed', defaultTags: ['film'] });
        },
      };
      Object.assign(doc, { label: 'Partiful Brooklyn explore', defaultTags: ['nightlife'] });
      PivotCurationJob.findOne.mockResolvedValue(doc);

      const result = await updateCurationJob(mockReq(), {
        tenantKey: 'nyc',
        jobId: JOB_ID,
        label: 'Renamed',
        defaultTags: ['film'],
      });

      expect(doc.label).toBe('Renamed');
      expect(doc.defaultTags).toEqual(['film']);
      expect(doc.save).toHaveBeenCalled();
      expect(result.data.job.label).toBe('Renamed');
    });

    it('returns JOB_NOT_FOUND when job belongs to another tenant', async () => {
      PivotCurationJob.findOne.mockResolvedValue(null);

      const result = await updateCurationJob(mockReq(), {
        tenantKey: 'nyc',
        jobId: JOB_ID,
        label: 'Nope',
      });

      expect(result.code).toBe('JOB_NOT_FOUND');
      expect(PivotCurationJob.findOne).toHaveBeenCalledWith({
        _id: JOB_ID,
        tenantKey: 'nyc',
      });
    });
  });

  describe('deleteCurationJob', () => {
    it('deletes a job scoped to the tenant', async () => {
      PivotCurationJob.findOneAndDelete.mockResolvedValue(leanDoc());

      const result = await deleteCurationJob(mockReq(), {
        tenantKey: 'nyc',
        jobId: JOB_ID,
      });

      expect(result.data.deleted).toBe(true);
      expect(PivotCurationJob.findOneAndDelete).toHaveBeenCalledWith({
        _id: JOB_ID,
        tenantKey: 'nyc',
      });
    });

    it('is idempotent when the job is already gone', async () => {
      PivotCurationJob.findOneAndDelete.mockResolvedValue(null);

      const result = await deleteCurationJob(mockReq(), {
        tenantKey: 'nyc',
        jobId: JOB_ID,
      });

      expect(result.error).toBeUndefined();
      expect(result.data.deleted).toBe(false);
      expect(result.data.jobId).toBe(JOB_ID);
    });

    it('rejects invalid job ids', async () => {
      const result = await deleteCurationJob(mockReq(), {
        tenantKey: 'nyc',
        jobId: 'not-an-id',
      });

      expect(result.code).toBe('INVALID_JOB_ID');
      expect(PivotCurationJob.findOneAndDelete).not.toHaveBeenCalled();
    });
  });
});
