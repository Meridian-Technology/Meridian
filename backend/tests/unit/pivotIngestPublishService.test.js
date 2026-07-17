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
const { previewIngestUrl } = require('../../services/pivotIngestPreviewService');
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

  it('derives event window from showtimes when start_time is omitted', () => {
    const merged = mergeDraftWithOverrides(
      {},
      {
        hostName: 'Nitehawk Cinema',
        name: 'Indie Film Night',
        location: 'Brooklyn, NY',
        tags: ['film-and-tv'],
        timeSlots: [
          { id: '6pm', start_time: '2026-05-29T22:00:00.000Z' },
          { id: '830pm', start_time: '2026-05-30T00:30:00.000Z' },
        ],
      },
    );

    const result = validateMergedDraft(merged);
    expect(result.merged.timeSlots).toHaveLength(2);
    expect(result.merged.startTime.toISOString()).toBe('2026-05-29T22:00:00.000Z');
  });
});

describe('pivotIngestPublishService publishIngestEvent', () => {
  let Event;

  beforeEach(() => {
    Event = {
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findById: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      })),
      findOne: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      })),
      create: jest.fn(),
    };
    getModels.mockReturnValue({ Event });
    getMergedTenants.mockResolvedValue([TENANT]);
    connectToDatabase.mockResolvedValue({});
    resolveImportDuplicate.mockResolvedValue({ duplicate: null, catalogIndex: [] });
    isBlockingDuplicate.mockReturnValue(false);
    validatePivotEventTags.mockResolvedValue({ tags: ['live-music'] });
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
            ingestStatus: 'staged',
            host: { name: 'Brooklyn Board Game Cafe' },
            source: 'partiful',
          },
        },
      }),
    });
  });

  it('creates staged catalog event with display host from overrides', async () => {
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
    expect(result.data.ingestStatus).toBe('staged');
    // Event start 2026-07-12 → ISO week 2026-W28 (not the fallback body week).
    expect(result.data.batchWeek).toBe('2026-W28');
    expect(result.data.batchWeekSource).toBe('event-date');
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
              batchWeek: '2026-W28',
              ingestStatus: 'staged',
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

  it('forceBatchWeek pins the event into the provided week', async () => {
    Event.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Sunset Listening Party',
        start_time: new Date('2026-07-12T22:00:00.000Z'),
        customFields: {
          pivot: {
            batchWeek: '2026-W26',
            ingestStatus: 'staged',
            host: { name: 'Brooklyn Board Game Cafe' },
            source: 'partiful',
          },
        },
      }),
    });

    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        forceBatchWeek: true,
        overrides: { hostName: 'Brooklyn Board Game Cafe', tags: ['board-games'] },
      },
    );

    expect(result.data.batchWeek).toBe('2026-W26');
    expect(result.data.batchWeekSource).toBe('forced');
    expect(Event.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({
          customFields: expect.objectContaining({
            pivot: expect.objectContaining({ batchWeek: '2026-W26' }),
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('rejects published override without releaseNow confirm', async () => {
    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        overrides: {
          hostName: 'Brooklyn Board Game Cafe',
          tags: ['board-games'],
          ingestStatus: 'published',
        },
      },
    );

    expect(result.status).toBe(400);
    expect(result.code).toBe('RELEASE_CONFIRM_REQUIRED');
    expect(Event.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('publishes immediately when releaseNow + RELEASE_NOW confirm', async () => {
    Event.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Sunset Listening Party',
        customFields: {
          pivot: {
            batchWeek: '2026-W26',
            ingestStatus: 'published',
            host: { name: 'Brooklyn Board Game Cafe' },
            tags: ['live-music'],
          },
        },
      }),
    });

    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        overrides: { hostName: 'Brooklyn Board Game Cafe', tags: ['board-games'] },
        releaseNow: true,
        confirm: 'RELEASE_NOW',
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.data.ingestStatus).toBe('published');
    expect(Event.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({
          customFields: expect.objectContaining({
            pivot: expect.objectContaining({ ingestStatus: 'published' }),
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('requires RELEASE_NOW confirm when releaseNow is set', async () => {
    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://partiful.com/e/sunset-listening',
        batchWeek: '2026-W26',
        overrides: { hostName: 'Brooklyn Board Game Cafe', tags: ['board-games'] },
        releaseNow: true,
        confirm: 'yes',
      },
    );

    expect(result.code).toBe('CONFIRMATION_REQUIRED');
    expect(Event.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('persists showtimes from overrides when publishing without provider preview', async () => {
    Event.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Indie Film Night',
        start_time: new Date('2026-05-29T22:00:00.000Z'),
        end_time: new Date('2026-05-30T05:15:00.000Z'),
        location: 'Brooklyn, NY',
        customFields: {
          pivot: {
            batchWeek: '2026-W26',
            ingestStatus: 'published',
            host: { name: 'Nitehawk Cinema' },
            tags: ['film-and-tv'],
            timeSlots: [
              { id: '6pm', start_time: new Date('2026-05-29T22:00:00.000Z') },
              { id: '830pm', start_time: new Date('2026-05-30T00:30:00.000Z') },
            ],
          },
        },
      }),
    });

    await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://example.com/events/indie-film-night',
        batchWeek: '2026-W26',
        overrides: {
          hostName: 'Nitehawk Cinema',
          name: 'Indie Film Night',
          location: 'Brooklyn, NY',
          tags: ['film-and-tv'],
          start_time: '2026-05-29T22:00:00.000Z',
          end_time: '2026-05-30T05:15:00.000Z',
          timeSlots: [
            { id: '6pm', label: '6:00 PM', start_time: '2026-05-29T22:00:00.000Z' },
            { id: '830pm', label: '8:30 PM', start_time: '2026-05-30T00:30:00.000Z' },
          ],
        },
      },
    );

    expect(previewIngestUrl).not.toHaveBeenCalled();
    expect(Event.findOneAndUpdate).toHaveBeenCalledWith(
      { 'customFields.pivot.sourceUrl': 'https://example.com/events/indie-film-night' },
      expect.objectContaining({
        $set: expect.objectContaining({
          customFields: expect.objectContaining({
            pivot: expect.objectContaining({
              timeSlots: expect.arrayContaining([
                expect.objectContaining({ id: '6pm' }),
                expect.objectContaining({ id: '830pm' }),
              ]),
            }),
          }),
        }),
      }),
      expect.any(Object),
    );
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

  it('rejects publish when a blocking (batch-internal) duplicate is detected', async () => {
    isBlockingDuplicate.mockReturnValue(true);
    resolveImportDuplicate.mockResolvedValue({
      duplicate: {
        matchType: 'batchFingerprint',
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

  it('updates the existing event in place on a fuzzy (fingerprint) duplicate', async () => {
    resolveImportDuplicate.mockResolvedValue({
      duplicate: {
        matchType: 'fingerprint',
        willUpdate: true,
        existingEventId: '507f1f77bcf86cd799439055',
        existingName: 'Sunset Listening Party',
      },
      catalogIndex: [],
    });
    Event.findByIdAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439055',
        name: 'Sunset Listening Party',
        start_time: new Date('2026-07-12T22:00:00.000Z'),
        end_time: new Date('2026-07-13T00:00:00.000Z'),
        location: 'Brooklyn Bridge Park',
        customFields: {
          pivot: {
            batchWeek: '2026-W26',
            ingestStatus: 'published',
            host: { name: 'Brooklyn Board Game Cafe' },
          },
        },
      }),
    });

    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        batchWeek: '2026-W26',
        overrides: {
          hostName: 'Brooklyn Board Game Cafe',
          name: 'Sunset Listening Party',
          location: 'Brooklyn Bridge Park',
          start_time: '2026-07-12T18:00:00-04:00',
          tags: ['live-music'],
        },
      },
    );

    expect(result.data.updated).toBe(true);
    expect(result.data.created).toBe(false);
    expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439055',
      expect.objectContaining({ $set: expect.any(Object) }),
      expect.objectContaining({ new: true }),
    );
    expect(Event.create).not.toHaveBeenCalled();
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
    expect(Event.create).not.toHaveBeenCalled();
  });

  it('creates manual catalog event without a listing URL', async () => {
    Event.create.mockResolvedValue({
      toObject: () => ({
        _id: '507f1f77bcf86cd799439013',
        name: 'Neighborhood Potluck',
        start_time: new Date('2026-07-12T18:00:00.000Z'),
        end_time: new Date('2026-07-12T20:00:00.000Z'),
        location: 'Prospect Park',
        customFields: {
          pivot: {
            batchWeek: '2026-W26',
            ingestStatus: 'published',
            source: 'manual',
            host: { name: 'Park Friends' },
            tags: ['social'],
          },
        },
      }),
    });

    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        batchWeek: '2026-W26',
        overrides: {
          hostName: 'Park Friends',
          name: 'Neighborhood Potluck',
          location: 'Prospect Park',
          start_time: '2026-07-12T18:00:00.000Z',
          tags: ['social'],
          source: 'manual',
        },
      },
    );

    expect(previewIngestUrl).not.toHaveBeenCalled();
    expect(Event.create).toHaveBeenCalled();
    expect(Event.findOneAndUpdate).not.toHaveBeenCalled();
    expect(result.data.event.name).toBe('Neighborhood Potluck');
  });

  it('publishes non-Partiful listing URLs from overrides without scraping', async () => {
    Event.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
        name: 'Jazz on the Roof',
        externalLink: 'https://eventbrite.com/e/jazz-on-the-roof',
        customFields: {
          pivot: {
            batchWeek: '2026-W26',
            ingestStatus: 'published',
            source: 'manual',
            sourceUrl: 'https://eventbrite.com/e/jazz-on-the-roof',
            host: { name: 'Rooftop Venue' },
            tags: ['live-music'],
          },
        },
      }),
    });

    const result = await publishIngestEvent(
      { user: { email: 'ops@meridian.study' }, globalDb: {} },
      {
        tenantKey: 'nyc',
        url: 'https://eventbrite.com/e/jazz-on-the-roof',
        batchWeek: '2026-W26',
        overrides: {
          hostName: 'Rooftop Venue',
          name: 'Jazz on the Roof',
          location: 'Downtown Brooklyn',
          start_time: '2026-07-12T20:00:00.000Z',
          tags: ['live-music'],
          source: 'manual',
        },
      },
    );

    expect(previewIngestUrl).not.toHaveBeenCalled();
    expect(Event.findOneAndUpdate).toHaveBeenCalledWith(
      { 'customFields.pivot.sourceUrl': 'https://eventbrite.com/e/jazz-on-the-roof' },
      expect.any(Object),
      expect.objectContaining({ upsert: true }),
    );
    expect(result.data.event.name).toBe('Jazz on the Roof');
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

  it('accepts staged ingestStatus', async () => {
    Event.findByIdAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Staged Event',
        customFields: {
          pivot: {
            ingestStatus: 'staged',
            host: { name: 'New Host' },
            tags: ['live-music'],
          },
        },
      }),
    });

    const result = await updateIngestEvent(
      { globalDb: {} },
      {
        tenantKey: 'nyc',
        eventId: '507f1f77bcf86cd799439012',
        overrides: { ingestStatus: 'staged' },
      },
    );

    expect(result.error).toBeUndefined();
    expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      expect.objectContaining({
        $set: expect.objectContaining({
          'customFields.pivot': expect.objectContaining({
            ingestStatus: 'staged',
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('updates enrichment metadata without blocking publish', async () => {
    Event.findByIdAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Updated Event',
        customFields: {
          pivot: {
            ingestStatus: 'published',
            host: { name: 'New Host' },
            tags: ['live-music'],
            enrichment: {
              vibe: ['dancey', 'loud'],
              priceBand: 'mid',
              neighborhood: 'downtown',
              audience: '21+',
            },
          },
        },
      }),
    });

    const result = await updateIngestEvent(
      { globalDb: {} },
      {
        tenantKey: 'nyc',
        eventId: '507f1f77bcf86cd799439012',
        overrides: {
          enrichment: {
            vibe: 'dancey, loud',
            priceBand: 'mid',
            neighborhood: 'downtown',
            audience: '21+',
          },
        },
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.data.event.enrichment).toEqual({
      vibe: ['dancey', 'loud'],
      priceBand: 'mid',
      neighborhood: 'downtown',
      audience: '21+',
    });
    expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      expect.objectContaining({
        $set: expect.objectContaining({
          'customFields.pivot': expect.objectContaining({
            enrichment: {
              vibe: ['dancey', 'loud'],
              priceBand: 'mid',
              neighborhood: 'downtown',
              audience: '21+',
            },
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('still publishes when enrichment is empty', async () => {
    Event.findByIdAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        name: 'Published Event',
        customFields: {
          pivot: {
            ingestStatus: 'published',
            host: { name: 'New Host' },
            tags: ['live-music'],
          },
        },
      }),
    });

    const result = await updateIngestEvent(
      { globalDb: {} },
      {
        tenantKey: 'nyc',
        eventId: '507f1f77bcf86cd799439012',
        overrides: {
          ingestStatus: 'published',
          enrichment: {},
        },
      },
    );

    expect(result.error).toBeUndefined();
    expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012',
      expect.objectContaining({
        $set: expect.objectContaining({
          'customFields.pivot': expect.not.objectContaining({
            enrichment: expect.anything(),
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('rejects invalid ingestStatus', async () => {
    const result = await updateIngestEvent(
      { globalDb: {} },
      {
        tenantKey: 'nyc',
        eventId: '507f1f77bcf86cd799439012',
        overrides: { ingestStatus: 'live' },
      },
    );

    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_INGEST_STATUS');
    expect(Event.findByIdAndUpdate).not.toHaveBeenCalled();
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
