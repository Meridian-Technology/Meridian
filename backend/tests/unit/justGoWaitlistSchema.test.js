const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const justGoWaitlistSchema = require('../../schemas/justGoWaitlist');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

const { JUSTGO_WAITLIST_INDEX_NAMES } = justGoWaitlistSchema;

describe('JustGoWaitlist schema (Task 2.2)', () => {
  let mongo;
  let req;
  let JustGoWaitlist;

  function baseRow(overrides = {}) {
    return {
      email: 'alex@example.com',
      tenantKey: 'nyc',
      cityLabel: 'New York',
      visitorId: 'visitor-abc',
      source: 'direct',
      shareCode: 'shareabc12',
      friendsJoined: 0,
      store: 'ios',
      ...overrides,
    };
  }

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, db: mongo.connection };
    ({ JustGoWaitlist } = getGlobalModels(req, 'JustGoWaitlist'));
    await JustGoWaitlist.syncIndexes();
  });

  afterEach(async () => {
    await mongo.reset();
    await JustGoWaitlist.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('getGlobalModels registration', () => {
    it('registers JustGoWaitlist on the global/platform connection', () => {
      const models = getGlobalModels(req, 'JustGoWaitlist');

      expect(models.JustGoWaitlist).toBeDefined();
      expect(models.JustGoWaitlist.modelName).toBe('JustGoWaitlist');
      expect(models.JustGoWaitlist.collection.name).toBe('justgo_waitlist');
      expect(models.JustGoWaitlist.db).toBe(req.globalDb);
    });

    it('throws when req.globalDb is missing', () => {
      expect(() => getGlobalModels({}, 'JustGoWaitlist')).toThrow(/req\.globalDb is not set/);
    });

    it('is not registered on tenant getModels', () => {
      const models = getModels(req, 'JustGoWaitlist', 'Event');

      expect(models.JustGoWaitlist).toBeUndefined();
      expect(models.Event).toBeDefined();
    });
  });

  describe('schema indexes', () => {
    it('documents unique tenant+email and unique shareCode indexes', () => {
      expect(JUSTGO_WAITLIST_INDEX_NAMES).toEqual([
        'justgo_waitlist_tenant_email_unique',
        'justgo_waitlist_share_code_unique',
      ]);

      const indexes = justGoWaitlistSchema.indexes();
      const byName = new Map(
        indexes.map(([keys, options]) => [options?.name, { keys, options }]),
      );

      const byEmail = byName.get('justgo_waitlist_tenant_email_unique');
      expect(byEmail).toBeDefined();
      expect(byEmail.keys).toEqual({ tenantKey: 1, email: 1 });
      expect(byEmail.options.unique).toBe(true);

      const byShare = byName.get('justgo_waitlist_share_code_unique');
      expect(byShare).toBeDefined();
      expect(byShare.keys).toEqual({ shareCode: 1 });
      expect(byShare.options.unique).toBe(true);
    });
  });

  describe('fields', () => {
    it('creates a waitlist row with createdAt and no email-shaped shareCode', async () => {
      const row = await JustGoWaitlist.create(baseRow());

      expect(row.email).toBe('alex@example.com');
      expect(row.tenantKey).toBe('nyc');
      expect(row.cityLabel).toBe('New York');
      expect(row.visitorId).toBe('visitor-abc');
      expect(row.source).toBe('direct');
      expect(row.shareCode).toBe('shareabc12');
      expect(row.friendsJoined).toBe(0);
      expect(row.store).toBe('ios');
      expect(row.userAgent).toBeNull();
      expect(row.qrName).toBeNull();
      expect(row.refCode).toBeNull();
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.updatedAt).toBeUndefined();
    });

    it('lowercases inbound refCode to match shareCode lookups', async () => {
      const row = await JustGoWaitlist.create(
        baseRow({ shareCode: 'othercode1', refCode: 'FriendCode1' }),
      );
      expect(row.refCode).toBe('friendcode1');
    });

    it('rejects the same email+city twice', async () => {
      await JustGoWaitlist.create(baseRow());
      await expect(
        JustGoWaitlist.create(baseRow({ shareCode: 'othercode1' })),
      ).rejects.toThrow(/duplicate key/i);
    });

    it('allows the same email on a different city', async () => {
      await JustGoWaitlist.create(baseRow());
      const other = await JustGoWaitlist.create(
        baseRow({ tenantKey: 'sf', cityLabel: 'San Francisco', shareCode: 'othercode1' }),
      );
      expect(other.tenantKey).toBe('sf');
    });

    it('rejects a duplicate shareCode', async () => {
      await JustGoWaitlist.create(baseRow());
      await expect(
        JustGoWaitlist.create(
          baseRow({
            email: 'blair@example.com',
            shareCode: 'shareabc12',
          }),
        ),
      ).rejects.toThrow(/duplicate key/i);
    });
  });

  describe('validation', () => {
    it('requires email and tenantKey', async () => {
      await expect(
        JustGoWaitlist.create(baseRow({ email: undefined })),
      ).rejects.toThrow(/email/);
      await expect(
        JustGoWaitlist.create(baseRow({ tenantKey: undefined, shareCode: 'othercode1' })),
      ).rejects.toThrow(/tenantKey/);
    });

    it('stores android or ios and rejects an unknown store', async () => {
      const android = await JustGoWaitlist.create(
        baseRow({ shareCode: 'androidrow1', store: 'android', userAgent: 'Mozilla/5.0 (Linux; Android 14)' }),
      );
      expect(android.store).toBe('android');
      expect(android.userAgent).toMatch(/Android/);

      await expect(
        JustGoWaitlist.create(baseRow({ shareCode: 'badstore01', store: 'web' })),
      ).rejects.toThrow(/store/);
    });

    it('rejects an invalid source', async () => {
      await expect(
        JustGoWaitlist.create(baseRow({ source: 'sms', shareCode: 'othercode1' })),
      ).rejects.toThrow(/source/);
    });
  });
});
