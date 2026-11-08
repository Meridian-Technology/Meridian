const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('../helpers/supertestLoopback');

const getGlobalModels = require('../../services/getGlobalModelService');
const platformIntegrationRoutes = require('../../routes/platformIntegrationRoutes');
const {
  network,
  isPrivateAddress,
  resolveGrokbotWebhook,
  clearGrokbotSettingsCache,
} = require('../../services/grokbotIntegrationService');
const { createSecretBox } = require('../../utilities/aesGcmSecret');

jest.setTimeout(120000);

const JWT_SECRET = 'grokbot-settings-test-secret';
const ROUTINE_KEY = 'routine-key-abcd1234';
const saved = {};

describe('Platform Admin grokbot settings', () => {
  let server;
  let globalDb;
  let admin;
  let resolved;
  const req = () => ({ globalDb });
  const realLookup = network.lookup;

  beforeAll(async () => {
    for (const name of ['JWT_SECRET', 'INTEGRATION_ENCRYPTION_KEY', 'GROKBOT_CAROUSEL_WEBHOOK_URL']) {
      saved[name] = process.env[name];
    }
    process.env.JWT_SECRET = JWT_SECRET;
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    globalDb = await mongoose.createConnection(server.getUri()).asPromise();
  }, 60000);

  afterAll(async () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    network.lookup = realLookup;
    await globalDb?.close();
    await server?.stop();
  });

  beforeEach(async () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = 'integration-key-for-tests';
    delete process.env.GROKBOT_CAROUSEL_WEBHOOK_URL;
    resolved = [{ address: '93.184.216.34', family: 4 }];
    network.lookup = jest.fn(async () => resolved);
    const { PlatformIntegrationSetting, PlatformRole, GlobalUser } = getGlobalModels(
      req(),
      'PlatformIntegrationSetting',
      'PlatformRole',
      'GlobalUser',
    );
    await PlatformIntegrationSetting.deleteMany({});
    await PlatformRole.deleteMany({});
    await GlobalUser.deleteMany({});
    clearGrokbotSettingsCache(req());
    admin = await GlobalUser.create({ email: 'ops@example.com', name: 'Ops' });
    await PlatformRole.create({ globalUserId: admin._id, roles: ['platform_admin'] });
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((requestContext, _res, next) => {
      requestContext.globalDb = globalDb;
      requestContext.school = 'www';
      next();
    });
    app.use(platformIntegrationRoutes);
    return app;
  }

  function session({ mfaConfigured = true, mfaVerified = true } = {}) {
    const token = jwt.sign(
      {
        globalUserId: String(admin._id),
        platformRoles: ['platform_admin'],
        roles: ['user'],
        mfaConfigured,
        mfaVerified,
      },
      JWT_SECRET,
    );
    return `Bearer ${token}`;
  }

  function put(app, body, options) {
    return request(app)
      .put('/admin/platform/integrations/grokbot')
      .set('Authorization', session(options))
      .send(body);
  }

  async function storedRecord() {
    const { PlatformIntegrationSetting } = getGlobalModels(req(), 'PlatformIntegrationSetting');
    return PlatformIntegrationSetting.findOne({ key: 'grokbot' }).lean();
  }

  it('stores the key encrypted and never returns it', async () => {
    const app = buildApp();
    const response = await put(app, {
      webhookUrl: 'https://grokbot.example.com/routines/abc/webhook',
      webhookKey: ROUTINE_KEY,
      enabled: true,
    });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      source: 'database',
      webhookUrl: 'https://grokbot.example.com/routines/abc/webhook',
      enabled: true,
      keySet: true,
      keyLast4: '1234',
      updatedBy: String(admin._id),
      deliveries: [],
    });
    expect(JSON.stringify(response.body)).not.toContain(ROUTINE_KEY);

    const record = await storedRecord();
    expect(record.webhookKey).not.toContain(ROUTINE_KEY);
    expect(record.updatedAt).toBeInstanceOf(Date);
    const box = createSecretBox(['INTEGRATION_ENCRYPTION_KEY']);
    expect(box.decryptSecret(record.webhookKey)).toBe(ROUTINE_KEY);

    const read = await request(app)
      .get('/admin/platform/integrations/grokbot')
      .set('Authorization', session({ mfaVerified: false }));
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ keySet: true, keyLast4: '1234', enabled: true });
    expect(read.body.data.mcpServerUrl).toMatch(/^http:\/\/\[::1\]:\d+\/mcp\/carousel$/);
    expect(JSON.stringify(read.body)).not.toContain(ROUTINE_KEY);
    expect(read.body.data.webhookKey).toBeUndefined();

    const disabled = await put(app, { enabled: false });
    expect(disabled.body.data).toMatchObject({ enabled: false, keySet: true, keyLast4: '1234' });
    const cleared = await put(app, { webhookKey: '' });
    expect(cleared.body.data).toMatchObject({ keySet: false, keyLast4: null });
  });

  it('falls back to JWT_SECRET for the encryption key like MFA does', async () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    await put(buildApp(), { webhookKey: ROUTINE_KEY });
    const record = await storedRecord();
    expect(createSecretBox(['JWT_SECRET']).decryptSecret(record.webhookKey)).toBe(ROUTINE_KEY);
  });

  it('serves the MCP server URL as https on a real host', async () => {
    const read = await request(buildApp())
      .get('/admin/platform/integrations/grokbot')
      .set('Host', 'www.meridian.study')
      .set('Authorization', session());
    expect(read.body.data.mcpServerUrl).toBe('https://www.meridian.study/mcp/carousel');
  });

  it.each([
    ['http://grokbot.example.com/hook', /https/],
    ['https://93.184.216.34/hook', /IP address/],
    ['https://[2606:4700::1111]/hook', /IP address/],
    ['https://localhost/hook', /localhost/],
    ['https://api.localhost/hook', /localhost/],
    ['https://user:pass@grokbot.example.com/hook', /credentials/],
    ['not a url', /valid URL/],
  ])('rejects %s', async (webhookUrl, message) => {
    const response = await put(buildApp(), { webhookUrl });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_WEBHOOK_URL');
    expect(response.body.message).toMatch(message);
    expect(await storedRecord()).toBeNull();
  });

  it.each([
    ['10.0.0.8'], ['172.20.1.1'], ['192.168.1.20'], ['127.0.0.1'], ['169.254.169.254'],
    ['100.100.100.100'], ['::1'], ['fd12:3456::1'], ['fe80::1'], ['::ffff:10.0.0.1'],
  ])('rejects a host that resolves to %s', async (address) => {
    resolved = [{ address: '93.184.216.34', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }];
    const response = await put(buildApp(), { webhookUrl: 'https://internal.example.com/hook' });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/private address/);
  });

  it('rejects a host that does not resolve', async () => {
    network.lookup = jest.fn(async () => { throw new Error('ENOTFOUND'); });
    const response = await put(buildApp(), { webhookUrl: 'https://nowhere.example.com/hook' });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/could not be resolved/);
  });

  it('classifies public and private addresses', () => {
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });

  it('rejects malformed fields and an empty change', async () => {
    const app = buildApp();
    expect((await put(app, { enabled: 'yes' })).status).toBe(400);
    expect((await put(app, { webhookKey: 'has a space' })).body.code).toBe('INVALID_WEBHOOK_KEY');
    expect((await put(app, { webhookKey: 42 })).body.code).toBe('INVALID_WEBHOOK_KEY');
    expect((await put(app, {})).status).toBe(400);
    expect(await storedRecord()).toBeNull();
  });

  it('refuses a change from a session without verified MFA', async () => {
    const app = buildApp();
    const notVerified = await put(app, { enabled: true }, { mfaVerified: false });
    expect(notVerified.status).toBe(403);
    expect(notVerified.body.code).toBe('ADMIN_MFA_REQUIRED');
    const notConfigured = await put(app, { enabled: true }, { mfaConfigured: false, mfaVerified: false });
    expect(notConfigured.status).toBe(403);
    expect(notConfigured.body.code).toBe('ADMIN_MFA_NOT_CONFIGURED');
    expect(await storedRecord()).toBeNull();
  });

  it('reports the env URL until an admin saves, then the record wins', async () => {
    process.env.GROKBOT_CAROUSEL_WEBHOOK_URL = 'https://env.example.com/hook';
    const app = buildApp();
    const before = await request(app)
      .get('/admin/platform/integrations/grokbot')
      .set('Authorization', session());
    expect(before.body.data).toMatchObject({
      source: 'environment',
      webhookUrl: 'https://env.example.com/hook',
      enabled: true,
      keySet: false,
    });
    expect(await resolveGrokbotWebhook(req())).toMatchObject({
      source: 'environment',
      url: 'https://env.example.com/hook',
      key: null,
    });

    await put(app, { webhookUrl: 'https://grokbot.example.com/hook', webhookKey: ROUTINE_KEY, enabled: true });
    expect(await resolveGrokbotWebhook(req())).toMatchObject({
      source: 'database',
      url: 'https://grokbot.example.com/hook',
      key: ROUTINE_KEY,
      enabled: true,
    });
  });
});
