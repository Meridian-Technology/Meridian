const getGlobalModels = require('../../services/getGlobalModelService');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const justGoWaitlistSchema = require('../../schemas/justGoWaitlist');
const { ensureJustGoWaitlistIndexes } = require('../../services/ensureJustGoWaitlistIndexes');

describe('ensureJustGoWaitlistIndexes', () => {
  let mongo;
  let req;
  let JustGoWaitlist;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
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

  it('drops a stale tenant+phone unique index so multiple email signups per city work', async () => {
    await JustGoWaitlist.collection.createIndex(
      { tenantKey: 1, phoneE164: 1 },
      { unique: true, name: 'justgo_waitlist_tenant_phone_unique' },
    );

    await JustGoWaitlist.create({
      email: 'alex@example.com',
      tenantKey: 'sf',
      cityLabel: 'San Francisco',
      visitorId: 'visitor-1',
      source: 'direct',
      shareCode: 'sharecode1',
      friendsJoined: 0,
      store: 'ios',
    });

    await ensureJustGoWaitlistIndexes(req);

    const second = await JustGoWaitlist.create({
      email: 'blair@example.com',
      tenantKey: 'sf',
      cityLabel: 'San Francisco',
      visitorId: 'visitor-2',
      source: 'direct',
      shareCode: 'sharecode2',
      friendsJoined: 0,
      store: 'ios',
    });

    expect(second.email).toBe('blair@example.com');
    const indexNames = (await JustGoWaitlist.collection.indexes()).map((row) => row.name);
    expect(indexNames).not.toContain('justgo_waitlist_tenant_phone_unique');
  });
});
