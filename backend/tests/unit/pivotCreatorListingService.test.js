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
jest.mock('../../services/pivotOrganizerResolveService', () => ({
  resolveOrganizers: jest.fn().mockResolvedValue({
    organizerIds: [],
    created: [],
    attached: [],
    ambiguous: [],
  }),
}));
jest.mock('../../services/googleLocationService', () => ({
  fetchPlaceDetails: jest.fn(),
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
const { resolveOrganizers } = require('../../services/pivotOrganizerResolveService');
const googleLocationService = require('../../services/googleLocationService');
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
const ORGANIZER_ID = '665a1b2c3d4e5f6789012ccc';
const CLAIMED_EVENT_ID = '507f1f77bcf86cd799439088';
const PLACE_ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

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

function canonicalGooglePlaceForCreator(overrides = {}) {
  return {
    venueName: 'The Great Hall',
    formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
    city: 'Brooklyn',
    region: 'New York',
    countryCode: 'US',
    coordinates: { type: 'Point', coordinates: [-73.95, 40.68] },
    googlePlaceId: PLACE_ID,
    provider: 'google',
    placeTypes: ['event_venue'],
    aliases: [],
    resolutionStatus: 'resolved',
    resolutionConfidence: 1,
    resolvedAt: new Date('2026-05-01T12:00:00.000Z'),
    publicDisplayLabel: 'The Great Hall',
    ...overrides,
  };
}

describe('pivotCreatorListingService', () => {
  let Event;
  let PivotEventIntent;
  let EventAnalytics;
  let PivotOrganizer;

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
    PivotOrganizer = {
      find: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      })),
    };
    getModels.mockReturnValue({
      Event,
      PivotEventIntent,
      EventAnalytics,
      PivotOrganizer,
    });
    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    resolveCatalogOrgId.mockResolvedValue({ orgId: CATALOG_ORG_ID });
    validatePivotEventTags.mockResolvedValue({ tags: ['live-music'] });
    loadIntentStatsByEventId.mockResolvedValue(new Map());
    notifyAdminsOnCreatorListingCreate.mockResolvedValue({ skipped: false });
    resolveOrganizers.mockResolvedValue({
      organizerIds: [],
      created: [],
      attached: [],
      ambiguous: [],
    });
    googleLocationService.fetchPlaceDetails.mockReset();
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
    it('resolves and saves a client-selected in-city Google place', async () => {
      const tenant = {
        ...TENANT,
        richLocationControls: { rollout: 'on', writes: true },
        richLocationConstraints: {
          countryCode: 'US',
          bounds: { south: 40.55, west: -74.1, north: 40.75, east: -73.8 },
        },
      };
      googleLocationService.fetchPlaceDetails.mockResolvedValue(
        canonicalGooglePlaceForCreator(),
      );
      Event.create.mockImplementation(async (payload) => ({
        ...payload,
        _id: EVENT_ID,
        toObject() { return this; },
      }));

      const result = await createListing(
        makeReq({
          pivotCreator: {
            tenantKey: 'brooklyn',
            tenant,
            globalUserId: GLOBAL_USER_ID,
          },
        }),
        basePayload({
          location: 'Original user-entered venue',
          richLocation: { mode: 'physical', googlePlaceId: PLACE_ID },
        }),
      );

      expect(result.error).toBeUndefined();
      expect(googleLocationService.fetchPlaceDetails).toHaveBeenCalledWith(PLACE_ID, {
        languageCode: 'en',
      });
      expect(Event.create).toHaveBeenCalledWith(expect.objectContaining({
        location: 'Original user-entered venue',
        richLocation: expect.objectContaining({
          mode: 'physical',
          originalInput: 'Original user-entered venue',
          googlePlaceId: PLACE_ID,
          formattedAddress: '123 Main St, Brooklyn, NY 11201, USA',
          revealPolicy: 'public',
        }),
      }));
    });

    it('rejects an out-of-scope physical place without saving', async () => {
      const tenant = {
        ...TENANT,
        richLocationControls: { rollout: 'on', writes: true },
        richLocationConstraints: {
          countryCode: 'US',
          bounds: { south: 40.55, west: -74.1, north: 40.75, east: -73.8 },
        },
      };
      googleLocationService.fetchPlaceDetails.mockResolvedValue({
        ...canonicalGooglePlaceForCreator(),
        coordinates: { type: 'Point', coordinates: [-122.42, 37.77] },
      });

      const result = await createListing(
        makeReq({
          pivotCreator: {
            tenantKey: 'brooklyn',
            tenant,
            globalUserId: GLOBAL_USER_ID,
          },
        }),
        basePayload({
          richLocation: { mode: 'physical', googlePlaceId: PLACE_ID },
        }),
      );

      expect(result).toMatchObject({
        code: 'RICH_LOCATION_OUT_OF_SCOPE',
        status: 422,
      });
      expect(Event.create).not.toHaveBeenCalled();
    });

    it('does not resolve or save rich locations when the city rollout is disabled', async () => {
      const tenant = {
        ...TENANT,
        richLocationControls: {
          rollout: 'off',
          writes: true,
        },
        richLocationConstraints: {
          countryCode: 'US',
          bounds: { south: 40.55, west: -74.1, north: 40.75, east: -73.8 },
        },
      };

      const result = await createListing(
        makeReq({
          pivotCreator: {
            tenantKey: 'brooklyn',
            tenant,
            globalUserId: GLOBAL_USER_ID,
          },
        }),
        basePayload({
          richLocation: { mode: 'physical', googlePlaceId: PLACE_ID },
        }),
      );

      expect(result).toMatchObject({
        code: 'RICH_LOCATION_WRITES_DISABLED',
        status: 409,
      });
      expect(googleLocationService.fetchPlaceDetails).not.toHaveBeenCalled();
      expect(Event.create).not.toHaveBeenCalled();
    });

    it.each([
      ['GOOGLE_PLACE_ID_INVALID', 400, 'The selected Google place is invalid.'],
      ['GOOGLE_LOCATION_AUTH_FAILED', 503, 'The selected place could not be resolved.'],
      ['GOOGLE_LOCATION_TIMEOUT', 504, 'The selected place could not be resolved.'],
    ])('does not save when provider resolution fails with %s', async (code, status, message) => {
      const tenant = {
        ...TENANT,
        richLocationControls: { rollout: 'on', writes: true },
        richLocationConstraints: {
          countryCode: 'US',
          bounds: { south: 40.55, west: -74.1, north: 40.75, east: -73.8 },
        },
      };
      googleLocationService.fetchPlaceDetails.mockRejectedValue(Object.assign(
        new Error(`sensitive provider details for ${PLACE_ID}`),
        { code, status },
      ));

      const result = await createListing(
        makeReq({
          pivotCreator: {
            tenantKey: 'brooklyn',
            tenant,
            globalUserId: GLOBAL_USER_ID,
          },
        }),
        basePayload({
          richLocation: { mode: 'physical', googlePlaceId: PLACE_ID },
        }),
      );

      expect(result).toEqual({ error: message, code, status });
      expect(JSON.stringify(result)).not.toContain(PLACE_ID);
      expect(Event.create).not.toHaveBeenCalled();
    });

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
              host: expect.objectContaining({
                name: 'Just Go Host',
                identities: [{ provider: 'justgo', name: 'Just Go Host' }],
              }),
            }),
          },
        }),
      );
    });

    it('stamps host.organizerIds via justgo + createdByUserId', async () => {
      resolveOrganizers.mockResolvedValue({
        organizerIds: ['665a1b2c3d4e5f6789012ccc'],
        created: [{ organizerId: '665a1b2c3d4e5f6789012ccc' }],
        attached: [],
        ambiguous: [],
      });
      Event.create.mockImplementation(async (payload) => ({
        ...payload,
        _id: EVENT_ID,
        toObject() {
          return this;
        },
      }));

      await createListing(makeReq(), basePayload());

      expect(resolveOrganizers).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantKey: 'brooklyn',
          displayName: 'Just Go Host',
          identities: expect.arrayContaining([
            expect.objectContaining({
              provider: 'justgo',
              externalId: GLOBAL_USER_ID,
              name: 'Just Go Host',
            }),
          ]),
        }),
      );
      expect(Event.create.mock.calls[0][0].customFields.pivot.host.organizerIds).toEqual([
        '665a1b2c3d4e5f6789012ccc',
      ]);
    });

    it('accepts an explicit empty identities array', async () => {
      Event.create.mockImplementation(async (payload) => ({
        ...payload,
        _id: EVENT_ID,
        toObject() {
          return this;
        },
      }));

      await createListing(makeReq(), basePayload({ hostIdentities: [] }));

      expect(Event.create.mock.calls[0][0].customFields.pivot.host.identities).toBeUndefined();
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

    it('includes scraped events whose organizerIds match a claimed organizer', async () => {
      PivotOrganizer.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: ORGANIZER_ID }]),
      });
      const scraped = {
        _id: CLAIMED_EVENT_ID,
        name: 'Luma Listening',
        location: 'The Chapel',
        start_time: new Date('2026-05-23T19:00:00.000Z'),
        customFields: {
          pivot: {
            source: 'luma',
            ingestStatus: 'published',
            batchWeek: '2026-W21',
            host: { name: 'Alice Chen', organizerIds: [ORGANIZER_ID] },
          },
        },
      };
      Event.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([existingEvent(), scraped]),
      });

      const result = await listListings(makeReq());

      expect(result.error).toBeUndefined();
      expect(result.data.total).toBe(2);
      expect(result.data.claimedOrganizerCount).toBe(1);
      expect(result.data.events[0].readOnly).toBe(false);
      expect(result.data.events[0].access).toBe('owner');
      expect(result.data.events[1].source).toBe('luma');
      expect(result.data.events[1].readOnly).toBe(true);
      expect(result.data.events[1].access).toBe('claimed');
      expect(result.data.events[1].createdByUserId).toBeNull();
      expect(Event.find).toHaveBeenCalledWith({
        isDeleted: { $ne: true },
        $or: [
          {
            isDeleted: { $ne: true },
            'customFields.pivot.source': 'justgo',
            'customFields.pivot.createdByUserId': GLOBAL_USER_ID,
          },
          {
            isDeleted: { $ne: true },
            'customFields.pivot.host.organizerIds': {
              $in: [ORGANIZER_ID, expect.any(Object)],
            },
          },
        ],
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

    it('returns a claimed scraped listing with the same intent/view series', async () => {
      PivotOrganizer.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: ORGANIZER_ID }]),
      });
      Event.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: CLAIMED_EVENT_ID,
          name: 'Luma Listening',
          location: 'The Chapel',
          start_time: new Date('2026-05-23T19:00:00.000Z'),
          customFields: {
            pivot: {
              source: 'luma',
              ingestStatus: 'published',
              batchWeek: '2026-W21',
              host: { name: 'Alice Chen', organizerIds: [ORGANIZER_ID] },
            },
          },
        }),
      });
      loadIntentStatsByEventId.mockResolvedValue(
        new Map([
          [
            CLAIMED_EVENT_ID,
            {
              interested: 5,
              registered: 2,
              passed: 1,
              externalOpens: 8,
              externalOpenUsers: 4,
            },
          ],
        ]),
      );
      EventAnalytics.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          views: 22,
          uniqueViews: 18,
          anonymousViews: 3,
          uniqueAnonymousViews: 3,
          registrations: 2,
          uniqueRegistrations: 2,
        }),
      });
      EventAnalytics.aggregate = jest
        .fn()
        .mockResolvedValue([{ _id: '2026-06-14', views: 6 }]);
      PivotEventIntent.aggregate = jest
        .fn()
        .mockResolvedValue([{ _id: '2026-06-14', interested: 2, registered: 1 }]);

      const result = await getListing(makeReq(), CLAIMED_EVENT_ID, {
        now: new Date('2026-06-15T09:00:00.000Z'),
      });

      expect(result.error).toBeUndefined();
      expect(result.data.event.source).toBe('luma');
      expect(result.data.event.readOnly).toBe(true);
      expect(result.data.event.access).toBe('claimed');
      expect(result.data.event.createdByUserId).toBeNull();
      expect(result.data.stats.intents.interested).toBe(5);
      expect(result.data.stats.analytics.views).toBe(22);
      expect(result.data.stats.daily).toHaveLength(14);
      const byDate = new Map(result.data.stats.daily.map((day) => [day.date, day]));
      expect(byDate.get('2026-06-14')).toEqual({
        date: '2026-06-14',
        views: 6,
        interested: 2,
        registered: 1,
      });
    });

    it('forbids reading an unclaimed scraped event', async () => {
      Event.findOne.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
          _id: CLAIMED_EVENT_ID,
          name: 'Someone Else',
          customFields: {
            pivot: {
              source: 'partiful',
              host: { name: 'Bob', organizerIds: [ORGANIZER_ID] },
            },
          },
        }),
      });

      const result = await getListing(makeReq(), CLAIMED_EVENT_ID);

      expect(result.code).toBe('CREATOR_NOT_OWNER');
    });
  });

  describe('updateListing claimed catalog', () => {
    function claimedScraped() {
      return {
        _id: CLAIMED_EVENT_ID,
        name: 'Luma Listening',
        customFields: {
          pivot: {
            source: 'luma',
            ingestStatus: 'published',
            host: { name: 'Alice Chen', organizerIds: [ORGANIZER_ID] },
          },
        },
      };
    }

    it('rejects content edits on a claimed scraped listing', async () => {
      PivotOrganizer.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: ORGANIZER_ID }]),
      });
      Event.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(claimedScraped()),
      });

      const result = await updateListing(makeReq(), CLAIMED_EVENT_ID, {
        name: 'Renamed',
      });

      expect(result.code).toBe('CREATOR_CLAIMED_READ_ONLY');
      expect(result.status).toBe(403);
      expect(Event.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects ingestStatus changes on a claimed scraped listing', async () => {
      const published = await updateListing(makeReq(), CLAIMED_EVENT_ID, {
        ingestStatus: 'published',
      });
      expect(published.code).toBe('CREATOR_PUBLISH_FORBIDDEN');

      PivotOrganizer.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: ORGANIZER_ID }]),
      });
      Event.findOne.mockResolvedValue(claimedScraped());
      const staged = await updateListing(makeReq(), CLAIMED_EVENT_ID, {
        ingestStatus: 'staged',
      });
      expect(staged.code).toBe('CREATOR_INGEST_STATUS_LOCKED');
      expect(Event.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
