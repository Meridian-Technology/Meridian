jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
  resolveCatalogOrgId: jest.fn(),
}));
jest.mock('../../services/pivotIngestPreviewService', () => ({
  sanitizeEventPosterImage: (raw) =>
    typeof raw === 'string' && raw.trim() ? raw.trim() : null,
}));
jest.mock('../../services/pivotTagCatalogService', () => ({
  validatePivotEventTags: jest.fn(),
}));
jest.mock('../../services/pivotLabEventsService', () => {
  const actual = jest.requireActual('../../services/pivotLabEventsService');
  return {
    ...actual,
    loadIntentStatsByEventId: jest.fn(),
  };
});
jest.mock('../../services/pivotCreatorAdminNotifyService', () => ({
  notifyAdminsOnCreatorListingCreate: jest.fn().mockResolvedValue({ skipped: false }),
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const {
  resolvePivotTenant,
  resolveCatalogOrgId,
} = require('../../services/pivotIngestPublishService');
const { validatePivotEventTags } = require('../../services/pivotTagCatalogService');
const { loadIntentStatsByEventId } = require('../../services/pivotLabEventsService');
const {
  notifyAdminsOnCreatorListingCreate,
} = require('../../services/pivotCreatorAdminNotifyService');
const { toIsoWeek } = require('../../utilities/pivotIsoWeek');
const { PIVOT_FEED_INGEST_STATUS } = require('../../utilities/pivotIngestStatus');
const {
  createListing,
  updateListing,
  listListings,
  getListing,
  rejectCreatorLifecycleOverrides,
  EMPTY_INTENT_STATS,
  EMPTY_ANALYTICS_SUMMARY,
} = require('../../services/pivotCreatorListingService');

const GLOBAL_USER_ID = '507f191e810c19729de860ea';
const OTHER_USER_ID = '507f191e810c19729de860eb';
const CATALOG_ORG_ID = '507f1f77bcf86cd799439011';
const EVENT_ID = '507f1f77bcf86cd799439099';

const TENANT = {
  tenantKey: 'brooklyn',
  tenantType: 'pivot',
  location: 'Brooklyn',
  pivotCatalogOrgId: CATALOG_ORG_ID,
};

function makeReq(overrides = {}) {
  return {
    school: 'brooklyn',
    db: {},
    globalDb: {},
    user: {
      globalUserId: GLOBAL_USER_ID,
      userId: 'tenant-user-1',
    },
    pivotCreator: {
      tenantKey: 'brooklyn',
      tenant: TENANT,
      globalUserId: GLOBAL_USER_ID,
      grant: { status: 'active' },
    },
    ...overrides,
  };
}

function basePayload(overrides = {}) {
  return {
    name: 'Rooftop Vinyl Night',
    description: 'Bring a friend.',
    location: 'Bushwick, Brooklyn',
    start_time: '2026-05-23T19:00:00.000Z',
    hostName: 'Just Go Host',
    externalLink: 'https://tickets.example.com/rooftop',
    tags: ['live-music'],
    ...overrides,
  };
}

describe('pivotCreatorListingService', () => {
  let Event;
  let PivotEventIntent;
  let EventAnalytics;

  beforeEach(() => {
    Event = {
      create: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    PivotEventIntent = {};
    EventAnalytics = {
      findOne: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      })),
    };
    getModels.mockReturnValue({ Event, PivotEventIntent, EventAnalytics });
    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    resolveCatalogOrgId.mockResolvedValue({ orgId: CATALOG_ORG_ID });
    validatePivotEventTags.mockResolvedValue({ tags: ['live-music'] });
    loadIntentStatsByEventId.mockResolvedValue(new Map());
    notifyAdminsOnCreatorListingCreate.mockResolvedValue({ skipped: false });
  });

  describe('rejectCreatorLifecycleOverrides', () => {
    it('forbids ingestStatus published', () => {
      const result = rejectCreatorLifecycleOverrides({ ingestStatus: 'published' });
      expect(result.code).toBe('CREATOR_PUBLISH_FORBIDDEN');
      expect(result.status).toBe(403);
    });

    it('forbids any ingestStatus override from creator payload', () => {
      const result = rejectCreatorLifecycleOverrides({ ingestStatus: 'staged' });
      expect(result.code).toBe('CREATOR_INGEST_STATUS_LOCKED');
    });
  });

  describe('createListing', () => {
    it('creates a justgo draft with ISO week of start_time (not feed-eligible)', async () => {
      const start = new Date('2026-05-23T19:00:00.000Z');
      const createdDoc = {
        _id: EVENT_ID,
        name: 'Rooftop Vinyl Night',
        description: 'Bring a friend.',
        location: 'Bushwick, Brooklyn',
        start_time: start,
        end_time: new Date(start.getTime() + 2 * 60 * 60 * 1000),
        externalLink: 'https://tickets.example.com/rooftop',
        hostingType: 'Org',
        hostingId: CATALOG_ORG_ID,
        customFields: {
          pivot: {
            source: 'justgo',
            platformManaged: false,
            ingestStatus: 'draft',
            batchWeek: toIsoWeek(start),
            createdByUserId: GLOBAL_USER_ID,
            creatorSubmittedAt: '2026-05-01T12:00:00.000Z',
            host: { name: 'Just Go Host' },
            tags: ['live-music'],
            sourceUrl: 'https://tickets.example.com/rooftop',
          },
        },
        toObject() {
          return this;
        },
      };
      Event.create.mockResolvedValue(createdDoc);

      const result = await createListing(makeReq(), basePayload());

      expect(result.error).toBeUndefined();
      expect(result.data.ingestStatus).toBe('draft');
      expect(result.data.batchWeek).toBe(toIsoWeek(start));
      expect(result.data.event.source).toBe('justgo');
      expect(result.data.event.platformManaged).toBe(false);
      expect(result.data.event.createdByUserId).toBe(GLOBAL_USER_ID);
      // Feed only serves published — draft create is invisible to GET /pivot/feed.
      expect(result.data.ingestStatus).not.toBe(PIVOT_FEED_INGEST_STATUS);

      expect(Event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hostingType: 'Org',
          hostingId: CATALOG_ORG_ID,
          externalLink: 'https://tickets.example.com/rooftop',
          customFields: {
            pivot: expect.objectContaining({
              source: 'justgo',
              platformManaged: false,
              ingestStatus: 'draft',
              batchWeek: toIsoWeek(start),
              createdByUserId: GLOBAL_USER_ID,
              host: expect.objectContaining({ name: 'Just Go Host' }),
            }),
          },
        }),
      );
    });

    it('still yields draft when submitting into a live/released week (no auto-publish)', async () => {
      // Live week pressure is notify-only (Task 2.3); create path never publishes.
      const start = new Date('2026-05-23T19:00:00.000Z');
      Event.create.mockImplementation(async (payload) => ({
        ...payload,
        _id: EVENT_ID,
        toObject() {
          return this;
        },
      }));

      const result = await createListing(makeReq(), basePayload({ start_time: start }));

      expect(result.data.ingestStatus).toBe('draft');
      expect(result.data.batchWeek).toBe(toIsoWeek(start));
      expect(Event.create.mock.calls[0][0].customFields.pivot.ingestStatus).toBe(
        'draft',
      );
    });

    it('rejects creator publish flip on create', async () => {
      const result = await createListing(
        makeReq(),
        basePayload({ ingestStatus: 'published' }),
      );

      expect(result.status).toBe(403);
      expect(result.code).toBe('CREATOR_PUBLISH_FORBIDDEN');
      expect(Event.create).not.toHaveBeenCalled();
    });

    it('still succeeds when admin notify rejects', async () => {
      Event.create.mockImplementation(async (payload) => ({
        ...payload,
        _id: EVENT_ID,
        toObject() {
          return this;
        },
      }));
      notifyAdminsOnCreatorListingCreate.mockRejectedValue(new Error('notify boom'));

      const result = await createListing(makeReq(), basePayload());

      expect(result.error).toBeUndefined();
      expect(result.data.created).toBe(true);
      expect(result.data.ingestStatus).toBe('draft');
      expect(notifyAdminsOnCreatorListingCreate).toHaveBeenCalled();
    });

    it('passes creatorPublish config into admin notify', async () => {
      Event.create.mockImplementation(async (payload) => ({
        ...payload,
        _id: EVENT_ID,
        toObject() {
          return this;
        },
      }));

      await createListing(
        makeReq({
          pivotCreator: {
            tenantKey: 'brooklyn',
            tenant: {
              ...TENANT,
              creatorPublish: { notifyAdminsOnCreate: false },
            },
            globalUserId: GLOBAL_USER_ID,
          },
        }),
        basePayload(),
      );

      expect(notifyAdminsOnCreatorListingCreate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          config: expect.objectContaining({ notifyAdminsOnCreate: false }),
          batchWeek: expect.any(String),
          creatorUserId: GLOBAL_USER_ID,
        }),
      );
    });

    it('honors requireTagsToSubmit from tenant config', async () => {
      validatePivotEventTags.mockResolvedValue({
        error: 'At least one catalog tag is required.',
        status: 400,
        code: 'TAGS_REQUIRED',
      });

      const result = await createListing(
        makeReq({
          pivotCreator: {
            tenantKey: 'brooklyn',
            tenant: {
              ...TENANT,
              creatorPublish: { requireTagsToSubmit: true },
            },
            globalUserId: GLOBAL_USER_ID,
          },
        }),
        basePayload({ tags: [] }),
      );

      expect(result.code).toBe('TAGS_REQUIRED');
      expect(validatePivotEventTags).toHaveBeenCalledWith(
        expect.any(Object),
        [],
        { required: true },
      );
    });
  });

  describe('updateListing', () => {
    function existingEvent(overrides = {}) {
      const start = new Date('2026-05-23T19:00:00.000Z');
      return {
        _id: EVENT_ID,
        name: 'Rooftop Vinyl Night',
        location: 'Bushwick, Brooklyn',
        start_time: start,
        end_time: new Date(start.getTime() + 2 * 60 * 60 * 1000),
        customFields: {
          pivot: {
            source: 'justgo',
            platformManaged: false,
            ingestStatus: 'draft',
            batchWeek: toIsoWeek(start),
            createdByUserId: GLOBAL_USER_ID,
            creatorSubmittedAt: '2026-05-01T12:00:00.000Z',
            host: { name: 'Just Go Host' },
            tags: ['live-music'],
          },
        },
        ...overrides,
      };
    }

    it('updates own draft listing content', async () => {
      Event.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(existingEvent()),
      });
      Event.findByIdAndUpdate.mockReturnValue({
        lean: jest.fn().mockResolvedValue(
          existingEvent({
            name: 'Updated Name',
            customFields: {
              pivot: {
                ...existingEvent().customFields.pivot,
                host: { name: 'Just Go Host' },
              },
            },
          }),
        ),
      });

      const result = await updateListing(makeReq(), EVENT_ID, {
        name: 'Updated Name',
      });

      expect(result.error).toBeUndefined();
      expect(result.data.updated).toBe(true);
      expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
        EVENT_ID,
        {
          $set: expect.objectContaining({
            name: 'Updated Name',
            'customFields.pivot': expect.objectContaining({
              source: 'justgo',
              platformManaged: false,
              ingestStatus: 'draft',
            }),
          }),
        },
        expect.any(Object),
      );
    });

    it('forbids publish flip on update', async () => {
      Event.findOne.mockResolvedValue(existingEvent());

      const result = await updateListing(makeReq(), EVENT_ID, {
        ingestStatus: 'published',
      });

      expect(result.code).toBe('CREATOR_PUBLISH_FORBIDDEN');
      expect(Event.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('forbids non-owner updates', async () => {
      Event.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(
          existingEvent({
            customFields: {
              pivot: {
                ...existingEvent().customFields.pivot,
                createdByUserId: OTHER_USER_ID,
              },
            },
          }),
        ),
      });

      const result = await updateListing(makeReq(), EVENT_ID, { name: 'Nope' });

      expect(result.code).toBe('CREATOR_NOT_OWNER');
      expect(Event.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('allows content edit after publish but locks batchWeek', async () => {
      const published = existingEvent({
        customFields: {
          pivot: {
            ...existingEvent().customFields.pivot,
            ingestStatus: 'published',
            batchWeek: '2026-W21',
          },
        },
      });
      Event.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(published),
      });
      Event.findByIdAndUpdate.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          ...published,
          name: 'Post-publish title',
        }),
      });

      const result = await updateListing(makeReq(), EVENT_ID, {
        name: 'Post-publish title',
        start_time: '2026-08-01T19:00:00.000Z',
      });

      expect(result.error).toBeUndefined();
      const setPayload = Event.findByIdAndUpdate.mock.calls[0][1].$set;
      expect(setPayload.name).toBe('Post-publish title');
      expect(setPayload['customFields.pivot'].batchWeek).toBe('2026-W21');
      expect(setPayload['customFields.pivot'].ingestStatus).toBe('published');
    });

    it('rejects explicit batchWeek change from creator', async () => {
      const result = await updateListing(makeReq(), EVENT_ID, {
        batchWeek: '2026-W99',
      });

      expect(result.code).toBe('CREATOR_BATCH_WEEK_LOCKED');
    });
  });

  describe('listListings', () => {
    function existingEvent(overrides = {}) {
      const start = new Date('2026-05-23T19:00:00.000Z');
      return {
        _id: EVENT_ID,
        name: 'Rooftop Vinyl Night',
        location: 'Bushwick, Brooklyn',
        start_time: start,
        end_time: new Date(start.getTime() + 2 * 60 * 60 * 1000),
        customFields: {
          pivot: {
            source: 'justgo',
            platformManaged: false,
            ingestStatus: 'draft',
            batchWeek: toIsoWeek(start),
            createdByUserId: GLOBAL_USER_ID,
            creatorSubmittedAt: '2026-05-01T12:00:00.000Z',
            host: { name: 'Just Go Host' },
            tags: ['live-music'],
          },
        },
        ...overrides,
      };
    }

    it('lists only the current creator own justgo listings', async () => {
      Event.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([existingEvent()]),
      });

      const result = await listListings(makeReq());

      expect(result.error).toBeUndefined();
      expect(result.data.total).toBe(1);
      expect(result.data.events[0].createdByUserId).toBe(GLOBAL_USER_ID);
      expect(result.data.events[0].source).toBe('justgo');
      expect(Event.find).toHaveBeenCalledWith({
        isDeleted: { $ne: true },
        'customFields.pivot.source': 'justgo',
        'customFields.pivot.createdByUserId': GLOBAL_USER_ID,
      });
    });

    it('filters by ingestStatus when provided', async () => {
      Event.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await listListings(makeReq(), {
        ingestStatus: 'draft,staged',
      });

      expect(result.error).toBeUndefined();
      expect(Event.find).toHaveBeenCalledWith({
        isDeleted: { $ne: true },
        'customFields.pivot.source': 'justgo',
        'customFields.pivot.createdByUserId': GLOBAL_USER_ID,
        'customFields.pivot.ingestStatus': { $in: ['draft', 'staged'] },
      });
    });
  });

  describe('getListing', () => {
    function existingEvent(overrides = {}) {
      const start = new Date('2026-05-23T19:00:00.000Z');
      return {
        _id: EVENT_ID,
        name: 'Rooftop Vinyl Night',
        location: 'Bushwick, Brooklyn',
        start_time: start,
        end_time: new Date(start.getTime() + 2 * 60 * 60 * 1000),
        customFields: {
          pivot: {
            source: 'justgo',
            platformManaged: false,
            ingestStatus: 'draft',
            batchWeek: toIsoWeek(start),
            createdByUserId: GLOBAL_USER_ID,
            creatorSubmittedAt: '2026-05-01T12:00:00.000Z',
            host: { name: 'Just Go Host' },
            tags: ['live-music'],
          },
        },
        ...overrides,
      };
    }

    it('returns draft detail with zero stats when no intents/analytics yet', async () => {
      Event.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(existingEvent()),
      });
      loadIntentStatsByEventId.mockResolvedValue(new Map());

      const result = await getListing(makeReq(), EVENT_ID);

      expect(result.error).toBeUndefined();
      expect(result.data.event.ingestStatus).toBe('draft');
      expect(result.data.stats.intents).toEqual(EMPTY_INTENT_STATS);
      expect(result.data.stats.analytics).toEqual(EMPTY_ANALYTICS_SUMMARY);
      expect(result.data.event.intentStats).toEqual(EMPTY_INTENT_STATS);
    });

    it('includes intent stats when present', async () => {
      Event.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(existingEvent()),
      });
      loadIntentStatsByEventId.mockResolvedValue(
        new Map([
          [
            EVENT_ID,
            {
              interested: 3,
              registered: 1,
              passed: 2,
              externalOpens: 4,
              externalOpenUsers: 2,
            },
          ],
        ]),
      );
      EventAnalytics.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          views: 10,
          uniqueViews: 7,
          anonymousViews: 2,
          uniqueAnonymousViews: 2,
          registrations: 1,
          uniqueRegistrations: 1,
        }),
      });

      const result = await getListing(makeReq(), EVENT_ID);

      expect(result.data.stats.intents.interested).toBe(3);
      expect(result.data.stats.analytics.views).toBe(10);
    });

    describe('stats.daily', () => {
      const NOW = new Date('2026-06-15T09:00:00.000Z');

      function mockExisting() {
        Event.findOne.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(existingEvent()),
        });
      }

      it('returns a zero-filled 14-day UTC window ending today', async () => {
        mockExisting();
        EventAnalytics.aggregate = jest.fn().mockResolvedValue([]);
        PivotEventIntent.aggregate = jest.fn().mockResolvedValue([]);

        const result = await getListing(makeReq(), EVENT_ID, { now: NOW });
        const daily = result.data.stats.daily;

        expect(daily).toHaveLength(14);
        expect(daily[0].date).toBe('2026-06-02');
        expect(daily[13].date).toBe('2026-06-15');
        expect(daily.every((day) => day.views === 0 && day.interested === 0)).toBe(true);
      });

      it('fills buckets from the view and intent aggregates', async () => {
        mockExisting();
        EventAnalytics.aggregate = jest
          .fn()
          .mockResolvedValue([{ _id: '2026-06-14', views: 9 }]);
        PivotEventIntent.aggregate = jest
          .fn()
          .mockResolvedValue([{ _id: '2026-06-14', interested: 4, registered: 2 }]);

        const result = await getListing(makeReq(), EVENT_ID, { now: NOW });
        const byDate = new Map(result.data.stats.daily.map((day) => [day.date, day]));

        expect(byDate.get('2026-06-14')).toEqual({
          date: '2026-06-14',
          views: 9,
          interested: 4,
          registered: 2,
        });
        expect(byDate.get('2026-06-13')).toEqual({
          date: '2026-06-13',
          views: 0,
          interested: 0,
          registered: 0,
        });
      });

      it('scopes both aggregates to this event and the window', async () => {
        mockExisting();
        EventAnalytics.aggregate = jest.fn().mockResolvedValue([]);
        PivotEventIntent.aggregate = jest.fn().mockResolvedValue([]);

        await getListing(makeReq(), EVENT_ID, { now: NOW });

        const [viewPipeline] = EventAnalytics.aggregate.mock.calls[0];
        expect(viewPipeline[0]).toEqual({ $match: { eventId: EVENT_ID } });

        const [intentPipeline] = PivotEventIntent.aggregate.mock.calls[0];
        expect(intentPipeline[0].$match.eventId).toBe(EVENT_ID);
        expect(intentPipeline[0].$match.status).toEqual({
          $in: ['interested', 'registered'],
        });
        expect(intentPipeline[0].$match.createdAt.$gte.toISOString()).toBe(
          '2026-06-02T00:00:00.000Z',
        );
      });

      it('never fails the detail read when the aggregates blow up', async () => {
        mockExisting();
        EventAnalytics.aggregate = jest.fn().mockRejectedValue(new Error('no analytics'));
        PivotEventIntent.aggregate = jest.fn().mockRejectedValue(new Error('nope'));
        loadIntentStatsByEventId.mockResolvedValue(new Map());

        const result = await getListing(makeReq(), EVENT_ID, { now: NOW });

        expect(result.error).toBeUndefined();
        expect(result.data.event.ingestStatus).toBe('draft');
        expect(result.data.stats.daily).toHaveLength(14);
        expect(result.data.stats.daily.every((day) => day.views === 0)).toBe(true);
      });

      it('survives a tenant with no aggregate support at all', async () => {
        mockExisting();
        delete EventAnalytics.aggregate;
        delete PivotEventIntent.aggregate;

        const result = await getListing(makeReq(), EVENT_ID, { now: NOW });

        expect(result.error).toBeUndefined();
        expect(result.data.stats.daily).toHaveLength(14);
      });
    });

    it('forbids reading another creator listing', async () => {
      Event.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(
          existingEvent({
            customFields: {
              pivot: {
                ...existingEvent().customFields.pivot,
                createdByUserId: OTHER_USER_ID,
              },
            },
          }),
        ),
      });

      const result = await getListing(makeReq(), EVENT_ID);

      expect(result.code).toBe('CREATOR_NOT_OWNER');
    });
  });
});
