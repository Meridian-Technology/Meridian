const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const justGoLandingEventSchema = require('../../schemas/justGoLandingEvent');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

const {
  JUSTGO_LANDING_EVENT_TYPES,
  JUSTGO_LANDING_EVENT_SOURCES,
  JUSTGO_LANDING_EVENT_STORES,
  JUSTGO_LANDING_EVENT_INDEX_NAMES,
  VISITOR_ID_MAX_LENGTH,
} = justGoLandingEventSchema;

describe('JustGoLandingEvent schema (Task 1.1)', () => {
  let mongo;
  let req;
  let JustGoLandingEvent;

  function baseEvent(overrides = {}) {
    return {
      type: 'view',
      host: 'justgo.lol',
      path: '/',
      source: 'direct',
      visitorId: 'visitor-abc',
      ...overrides,
    };
  }

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, db: mongo.connection };
    ({ JustGoLandingEvent } = getGlobalModels(req, 'JustGoLandingEvent'));
    await JustGoLandingEvent.syncIndexes();
  });

  afterEach(async () => {
    await mongo.reset();
    await JustGoLandingEvent.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('getGlobalModels registration', () => {
    it('registers JustGoLandingEvent on the global/platform connection', () => {
      const models = getGlobalModels(req, 'JustGoLandingEvent');

      expect(models.JustGoLandingEvent).toBeDefined();
      expect(models.JustGoLandingEvent.modelName).toBe('JustGoLandingEvent');
      expect(models.JustGoLandingEvent.collection.name).toBe('justgo_landing_events');
      expect(models.JustGoLandingEvent.db).toBe(req.globalDb);
    });

    it('throws when req.globalDb is missing', () => {
      expect(() => getGlobalModels({}, 'JustGoLandingEvent')).toThrow(/req\.globalDb is not set/);
    });

    it('is not registered on tenant getModels', () => {
      const models = getModels(req, 'JustGoLandingEvent', 'Event');

      expect(models.JustGoLandingEvent).toBeUndefined();
      expect(models.Event).toBeDefined();
    });
  });

  describe('schema indexes', () => {
    it('documents tenant+type+createdAt and visitor+tenant+createdAt indexes', () => {
      expect(JUSTGO_LANDING_EVENT_INDEX_NAMES).toEqual([
        'justgo_landing_event_tenant_type_created',
        'justgo_landing_event_visitor_tenant_created',
      ]);

      const indexes = justGoLandingEventSchema.indexes();
      const byName = new Map(
        indexes.map(([keys, options]) => [options?.name, { keys, options }]),
      );

      const byTenantType = byName.get('justgo_landing_event_tenant_type_created');
      expect(byTenantType).toBeDefined();
      expect(byTenantType.keys).toEqual({ tenantKey: 1, type: 1, createdAt: 1 });
      expect(byTenantType.options.unique).not.toBe(true);

      const byVisitor = byName.get('justgo_landing_event_visitor_tenant_created');
      expect(byVisitor).toBeDefined();
      expect(byVisitor.keys).toEqual({ visitorId: 1, tenantKey: 1, createdAt: 1 });
      expect(byVisitor.options.unique).not.toBe(true);
    });
  });

  describe('fields', () => {
    it('exports locked enums', () => {
      expect(JUSTGO_LANDING_EVENT_TYPES).toEqual(['view', 'store_click']);
      expect(JUSTGO_LANDING_EVENT_SOURCES).toEqual(['direct', 'share', 'qr']);
      expect(JUSTGO_LANDING_EVENT_STORES).toEqual(['ios', 'android']);
    });

    it('creates a generic view with optional tenantKey omitted', async () => {
      const event = await JustGoLandingEvent.create(baseEvent());

      expect(event.type).toBe('view');
      expect(event.tenantKey).toBeNull();
      expect(event.host).toBe('justgo.lol');
      expect(event.path).toBe('/');
      expect(event.source).toBe('direct');
      expect(event.qrName).toBeNull();
      expect(event.refCode).toBeNull();
      expect(event.visitorId).toBe('visitor-abc');
      expect(event.userAgent).toBeNull();
      expect(event.store).toBeNull();
      expect(event.createdAt).toBeInstanceOf(Date);
      expect(event.updatedAt).toBeUndefined();
    });

    it('stores a city-scoped store_click', async () => {
      const event = await JustGoLandingEvent.create(
        baseEvent({
          type: 'store_click',
          tenantKey: 'Troy',
          path: '/troy',
          source: 'qr',
          qrName: 'Poster-A',
          store: 'ios',
          userAgent: 'JustGoTest/1.0',
        }),
      );

      expect(event.tenantKey).toBe('troy');
      expect(event.store).toBe('ios');
      expect(event.qrName).toBe('poster-a');
      expect(event.source).toBe('qr');
    });

    it('stores every view for the same visitor (no write-time unique)', async () => {
      await JustGoLandingEvent.create(baseEvent({ tenantKey: 'nyc' }));
      await JustGoLandingEvent.create(baseEvent({ tenantKey: 'nyc' }));

      expect(await JustGoLandingEvent.countDocuments({ visitorId: 'visitor-abc' })).toBe(2);
    });
  });

  describe('validation', () => {
    it('rejects an invalid type', async () => {
      await expect(
        JustGoLandingEvent.create(baseEvent({ type: 'waitlist_submit' })),
      ).rejects.toThrow(/type/);
    });

    it('rejects an invalid source', async () => {
      await expect(
        JustGoLandingEvent.create(baseEvent({ source: 'email' })),
      ).rejects.toThrow(/source/);
    });

    it('requires visitorId', async () => {
      await expect(
        JustGoLandingEvent.create(baseEvent({ visitorId: undefined })),
      ).rejects.toThrow(/visitorId/);
    });

    it(`rejects a visitorId longer than ${VISITOR_ID_MAX_LENGTH} chars`, async () => {
      await expect(
        JustGoLandingEvent.create(
          baseEvent({ visitorId: 'v'.repeat(VISITOR_ID_MAX_LENGTH + 1) }),
        ),
      ).rejects.toThrow(/visitorId/);
    });

    it('requires store on store_click', async () => {
      await expect(
        JustGoLandingEvent.create(baseEvent({ type: 'store_click' })),
      ).rejects.toThrow(/store/);
    });

    it('rejects store on view', async () => {
      await expect(
        JustGoLandingEvent.create(baseEvent({ store: 'ios' })),
      ).rejects.toThrow(/store/);
    });
  });
});
