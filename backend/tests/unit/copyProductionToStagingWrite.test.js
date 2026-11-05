jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), execFileSync: jest.fn(() => 'staging\n') }));

const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient, Db } = require('mongoose').mongo;
const { copyProductionToStaging } = require('../../migrations/copyProductionToStaging');

jest.setTimeout(60000);

describe('copyProductionToStaging --write', () => {
  let production;
  let staging;
  let prod;
  let stage;
  const originalEnv = process.env;

  beforeAll(async () => {
    [production, staging] = await Promise.all([MongoMemoryServer.create(), MongoMemoryServer.create()]);
    prod = await new MongoClient(production.getUri()).connect();
    stage = await new MongoClient(staging.getUri()).connect();
  });

  afterAll(async () => {
    process.env = originalEnv;
    await prod?.close();
    await stage?.close();
    await Promise.all([production?.stop(), staging?.stop()]);
  });

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      SOURCE_GLOBAL_URI: production.getUri('global'),
      SOURCE_SF_URI: production.getUri('sf'),
      SOURCE_IC_URI: production.getUri('ic'),
      TARGET_GLOBAL_URI: staging.getUri('global'),
      TARGET_BASE_URI: staging.getUri('rpi'),
    };

    const global = prod.db('global');
    await global.collection('platform_roles').insertOne({ globalUserId: 'g-admin', roles: ['platform_admin'] });
    await global.collection('global_users').insertMany([
      { _id: 'g-admin', email: 'admin@meridian.study', name: 'Admin' },
      { _id: 'g-sf', email: 'person@example.com', name: 'Person' },
      { _id: 'g-rpi', email: 'rpi@example.com', name: 'Rpi' },
    ]);
    await global.collection('tenant_memberships').insertMany([
      { globalUserId: 'g-admin', tenantKey: 'sf', tenantUserId: 't-admin' },
      { globalUserId: 'g-sf', tenantKey: 'sf', tenantUserId: 't-sf' },
      { globalUserId: 'g-rpi', tenantKey: 'rpi', tenantUserId: 't-rpi' },
    ]);
    await global.collection('tenant_config').insertOne({ tenants: [{ tenantKey: 'sf', mongoUri: 'mongodb://prod/sf' }, { tenantKey: 'rpi' }] });
    await prod.db('sf').collection('users').insertMany([
      { _id: 't-admin', email: 'admin@meridian.study', password: 'hash' },
      { _id: 't-sf', email: 'person@example.com', password: 'hash', pushToken: 'ExponentPushToken[x]' },
    ]);
    await prod.db('sf').collection('users').createIndex({ email: 1 }, { unique: true });
    await prod.db('ic').collection('events').insertOne({ name: 'IC event' });

    await stage.db('global').collection('stale').insertOne({ old: true });
    await stage.db('global').createCollection('empty_with_index');
    await stage.db('global').collection('empty_with_index').createIndex({ key: 1 }, { name: 'key_1' });
    await stage.db('sf').collection('users').insertOne({ _id: 'old-staging-user', email: 'old@staging.test' });
  });

  afterEach(async () => {
    const { databases } = await stage.db().admin().listDatabases({ nameOnly: true });
    for (const { name } of databases) if (!['admin', 'local', 'config'].includes(name)) await stage.db(name).dropDatabase();
    for (const name of ['global', 'sf', 'ic']) await prod.db(name).dropDatabase();
  });

  it('backs up, clears collection by collection, and refills staging without dropping databases', async () => {
    const dropDatabase = jest.spyOn(Db.prototype, 'dropDatabase').mockImplementation(() => {
      throw new Error('user is not allowed to do action [dropDatabase]');
    });
    const lines = [];
    try {
      await copyProductionToStaging({ write: true, log: (line) => lines.push(line) });
    } finally {
      dropDatabase.mockRestore();
    }
    expect(dropDatabase).not.toHaveBeenCalled();

    const global = stage.db('global');
    expect(await global.listCollections({ name: 'stale' }).toArray()).toEqual([]);
    expect((await global.collection('tenant_config').findOne()).tenants).toEqual([{ tenantKey: 'sf' }]);
    expect((await global.collection('global_users').find().sort({ _id: 1 }).toArray()).map((user) => user.email))
      .toEqual(['admin@meridian.study', 'user-g-sf@staging.invalid']);

    const users = await stage.db('sf').collection('users').find().sort({ _id: 1 }).toArray();
    expect(users).toEqual([
      { _id: 't-admin', email: 'admin@meridian.study', password: 'hash' },
      { _id: 't-sf', email: 'user-t-sf@staging.invalid', name: 'Staging user t-sf', picture: null },
    ]);
    expect((await stage.db('sf').collection('users').indexes()).map((index) => index.name)).toContain('email_1');
    expect(await stage.db('ic').collection('events').countDocuments()).toBe(1);

    const backups = (await stage.db().admin().listDatabases({ nameOnly: true })).databases.map((row) => row.name).filter((name) => name.startsWith('backup_'));
    expect(backups.map((name) => name.replace(/^backup_\d{8}T\d{9}_/, '')).sort()).toEqual(['global', 'sf']);
    const globalBackup = stage.db(backups.find((name) => name.endsWith('_global')));
    expect(await globalBackup.collection('stale').countDocuments()).toBe(1);
    expect((await globalBackup.collection('empty_with_index').indexes()).map((index) => index.name)).toContain('key_1');
    expect(await stage.db(backups.find((name) => name.endsWith('_sf'))).collection('users').findOne()).toMatchObject({ email: 'old@staging.test' });

    expect(lines.findIndex((line) => line.startsWith('cleared staging global')))
      .toBeGreaterThan(lines.findIndex((line) => line.startsWith('backed up staging sf')));
  });

  it('can be rerun after a partial copy', async () => {
    await copyProductionToStaging({ write: true, log: () => {} });
    await stage.db('sf').collection('users').deleteMany({});
    await copyProductionToStaging({ write: true, log: () => {} });
    expect(await stage.db('sf').collection('users').countDocuments()).toBe(2);
  });
});
