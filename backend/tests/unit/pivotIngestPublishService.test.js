jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getMergedTenants: jest.fn(),
  provisionPivotCatalogOrg: jest.fn(),
}));
jest.mock('../../services/pivotReferralCodeService', () => ({
  isPivotTenant: (tenant) => tenant.pivotPilot === true || tenant.tenantType === 'pivot',
}));
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPreviewService', () => ({
  previewIngestUrl: jest.fn(),
  normalizeUrl: jest.fn(),
  sanitizeEventPosterImage: (raw) => (typeof raw === 'string' && raw.trim() ? raw.trim() : null),
}));
jest.mock('../../services/pivotIngestDuplicateService', () => ({
  formatDuplicateWarning: jest.fn((duplicate, name) => `${name} is a duplicate.`),
  isBlockingDuplicate: jest.fn(() => false),
  resolveImportDuplicate: jest.fn().mockResolvedValue({ duplicate: null, catalogIndex: [] }),
}));
jest.mock('../../services/pivotWeeklySnapshotService', () => ({
  normalizeBatchWeek: (raw, now = new Date()) => {
    const batchWeek = raw?.trim() || '2026-W26';
    if (!/^\d{4}-W\d{2}$/.test(batchWeek)) {
      return { error: 'invalid', status: 400, code: 'INVALID_BATCH_WEEK' };
    }
    return { batchWeek };
  },
}));
jest.mock('../../services/pivotTagCatalogService', () => ({
  validatePivotEventTags: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { getMergedTenants, provisionPivotCatalogOrg } = require('../../services/tenantConfigService');
const { connectToDatabase } = require('../../connectionsManager');
const { previewIngestUrl, normalizeUrl } = require('../../services/pivotIngestPreviewService');
const { resolveImportDuplicate, isBlockingDuplicate } = require('../../services/pivotIngestDuplicateService');
const { validatePivotEventTags } = require('../../services/pivotTagCatalogService');
const {
  publishIngestEvent,
  updateIngestEvent,
  mergeDraftWithOverrides,
  validateMergedDraft,
} = require('../../services/pivotIngestPublishService');

const TENANT = {
  tenantKey: 'nyc',
  name: 'NYC',
  location: 'New York',
  pivotPilot: true,
  pivotCatalogOrgId: '507f1f77bcf86cd799439011',
};

describe('pivotIngestPublishService merge helpers', () => {
  it('overrides win over preview draft', () => {
    const merged = mergeDraftWithOverrides(
      { name: 'Draft title', hostName: 'Draft Host' },
      { hostName: 'Brooklyn Board Game Cafe', location: 'Brooklyn, NY' },
    );

    expect(merged.name).toBe('Draft title');
    expect(merged.hostName).toBe('Brooklyn Board Game Cafe');
    expect(merged.location).toBe('Brooklyn, NY');
  });

  it('rejects publish when hostName missing after merge', () => {
    const result = validateMergedDraft({
      name: 'Event',
      location: 'NYC',
      start_time: '2026-07-12T18:00:00.000Z',
      hostName: '',
    });

    expect(result.code).toBe('MISSING_REQUIRED_FIELDS');
  });
});

describe('pivotIngestPublishService publishIngestEvent', () => {
  let Event;

  beforeEach(() => {
    Event = {
      findOneAndUpdate: jest.fn(),
    };
    getModels.mockReturnValue({ Event });
    getMergedTenants.mockResolvedValue([TENANT]);
    connectToDatabase.mockResolvedValue({});
    resolveImportDuplicate.mockResolvedValue({ duplicate: null, catalogIndex: [] });
    isBlockingDuplicate.mockReturnValue(false);
    validatePivotEventTags.mockResolvedValue({ tags: ['live-music'] });
    normalizeUrl.mockReturnValue({
      url: 'https://partiful.com/e/sunset-listening',
      provider: 'partiful',
    });
    previewIngestUrl.mockResolvedValue({
      data: {
        draft: {
          name: 'Sunset Listening Party',
          description: 'Bring a blanket.',
          location: 'Brooklyn Bridge Park',
          start_time: '2026-07-12T18:00:00-04:00',
          hostName: 'Brooklyn Board Game Cafe',
          source: 'partiful',
        },
      },
    });
    Event.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Sunset Listening Party',
        start_time: new Date('2026-07-12T22:00:00.000Z'),
        end_time: new Date('2026-07-13T00:00:00.000Z'),
        location: 'Brooklyn Bridge Park',
        externalLink: 'https://partiful.com/e/sunset-listening',
        customFields: {
          pivot: {
            batchWeek: '2026-W26',
            ingestStatus: 'published',
            host: { name: 'Brooklyn Board Game Cafe' },
            source: 'partiful',
          },
        },
      }),
    });
  });

  it('creates published catalog event with display host from overrides', async () => {
    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        overrides: { hostName: 'Brooklyn Board Game Cafe', tags: ['board-games'] },
      },
    );

    expect(result.data.event.organizerName).toBe('Brooklyn Board Game Cafe');
    expect(validatePivotEventTags).toHaveBeenCalledWith(
      expect.any(Object),
      ['board-games'],
      { required: true },
    );
    expect(Event.findOneAndUpdate).toHaveBeenCalledWith(
      { 'customFields.pivot.sourceUrl': 'https://partiful.com/e/sunset-listening' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'not-applicable',
          visibility: 'public',
          registrationEnabled: true,
          hostingType: 'Org',
          hostingId: TENANT.pivotCatalogOrgId,
          customFields: expect.objectContaining({
            pivot: expect.objectContaining({
              ingestStatus: 'published',
              tags: ['live-music'],
              host: expect.objectContaining({ name: 'Brooklyn Board Game Cafe' }),
            }),
          }),
        }),
      }),
      expect.objectContaining({ upsert: true }),
    );
    expect(provisionPivotCatalogOrg).not.toHaveBeenCalled();
  });

  it('provisions catalog org when tenant row lacks pivotCatalogOrgId', async () => {
    getMergedTenants.mockResolvedValue([{ ...TENANT, pivotCatalogOrgId: null }]);
    provisionPivotCatalogOrg.mockResolvedValue({ orgId: '507f1f77bcf86cd799439099' });

    await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        overrides: { hostName: 'Brooklyn Board Game Cafe', tags: ['board-games'] },
      },
    );

    expect(provisionPivotCatalogOrg).toHaveBeenCalled();
    expect(Event.findOneAndUpdate.mock.calls[0][1].$set.hostingId).toBe('507f1f77bcf86cd799439099');
  });

  it('rejects publish when a blocking duplicate is detected', async () => {
    isBlockingDuplicate.mockReturnValue(true);
    resolveImportDuplicate.mockResolvedValue({
      duplicate: {
        matchType: 'fingerprint',
        existingName: 'Sunset Listening Party',
      },
      catalogIndex: [],
    });

    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        overrides: { hostName: 'Brooklyn Board Game Cafe', tags: ['board-games'] },
      },
    );

    expect(result.code).toBe('DUPLICATE_EVENT');
    expect(result.status).toBe(409);
    expect(Event.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects publish when tags are missing', async () => {
    validatePivotEventTags.mockResolvedValue({
      error: 'At least one catalog tag is required.',
      status: 400,
      code: 'TAGS_REQUIRED',
    });

    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        overrides: { hostName: 'Brooklyn Board Game Cafe', tags: [] },
      },
    );

    expect(result.code).toBe('TAGS_REQUIRED');
    expect(Event.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects publish when tag slug is invalid', async () => {
    validatePivotEventTags.mockResolvedValue({
      error: 'Unknown catalog tag(s): not-a-tag',
      status: 400,
      code: 'INVALID_TAG',
    });

    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        overrides: { hostName: 'Brooklyn Board Game Cafe', tags: ['not-a-tag'] },
      },
    );

    expect(result.code).toBe('INVALID_TAG');
    expect(Event.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('pivotIngestPublishService updateIngestEvent', () => {
  let Event;

  beforeEach(() => {
    Event = {
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    getModels.mockReturnValue({ Event });
    getMergedTenants.mockResolvedValue([TENANT]);
    connectToDatabase.mockResolvedValue({});
    validatePivotEventTags.mockResolvedValue({ tags: ['live-music'] });
    Event.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Sunset Listening Party',
        customFields: {
          pivot: {
            ingestStatus: 'published',
            host: { name: 'Old Host' },
            tags: ['live-music'],
          },
        },
      }),
    });
    Event.findByIdAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Updated Event',
        customFields: {
          pivot: {
            ingestStatus: 'draft',
            host: { name: 'New Host' },
            tags: ['board-games', 'social'],
          },
        },
      }),
    });
  });

  it('updates host name and ingest status', async () => {
    const result = await updateIngestEvent(
      { globalDb: {} },
      {
        tenantKey: 'nyc',
        eventId: '507f1f77bcf86cd799439012',
        overrides: {
          name: 'Updated Event',
          hostName: 'New Host',
          ingestStatus: 'draft',
        },
      },
    );

    expect(result.data.event.organizerName).toBe('New Host');
    expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      expect.objectContaining({
        $set: expect.objectContaining({
          name: 'Updated Event',
          'customFields.pivot': expect.objectContaining({
            ingestStatus: 'draft',
            host: expect.objectContaining({ name: 'New Host' }),
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('updates tags on existing event', async () => {
    validatePivotEventTags.mockResolvedValue({ tags: ['board-games', 'social'] });

    const result = await updateIngestEvent(
      { globalDb: {} },
      {
        tenantKey: 'nyc',
        eventId: '507f1f77bcf86cd799439012',
        overrides: {
          tags: ['board-games', 'social'],
        },
      },
    );

    expect(result.data.event.tags).toEqual(['board-games', 'social']);
    expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      expect.objectContaining({
        $set: expect.objectContaining({
          'customFields.pivot': expect.objectContaining({
            tags: ['board-games', 'social'],
          }),
        }),
      }),
      expect.any(Object),
    );
  });
});
