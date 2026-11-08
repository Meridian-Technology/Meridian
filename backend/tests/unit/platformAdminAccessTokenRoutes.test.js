const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('../helpers/supertestLoopback');

const getGlobalModels = require('../../services/getGlobalModelService');
const carouselMcpRoutes = require('../../routes/carouselMcpRoutes');
const platformIntegrationRoutes = require('../../routes/platformIntegrationRoutes');

// The first query on a fresh in-memory Mongo also builds every global model's indexes.
jest.setTimeout(120000);

const previousJwtSecret = process.env.JWT_SECRET;
const JWT_SECRET = 'platform-access-token-routes-secret';

describe('Platform Admin access token routes', () => {
  let server;
  let globalDb;
  let userSeq = 0;
  const req = () => ({ globalDb });

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    globalDb = await mongoose.createConnection(server.getUri()).asPromise();
    const { PlatformAccessToken } = getGlobalModels(req(), 'PlatformAccessToken');
    await PlatformAccessToken.init();
  }, 60000);

  afterAll(async () => {
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
    await globalDb?.close();
    await server?.stop();
  });

  beforeEach(async () => {
    const { PlatformAccessToken, PlatformRole, GlobalUser } = getGlobalModels(
      req(),
      'PlatformAccessToken',
      'PlatformRole',
      'GlobalUser',
    );
    await PlatformAccessToken.deleteMany({});
    await PlatformRole.deleteMany({});
    await GlobalUser.deleteMany({});
  });

  async function createAdmin({ roles = ['platform_admin'] } = {}) {
    userSeq += 1;
    const { GlobalUser, PlatformRole } = getGlobalModels(req(), 'GlobalUser', 'PlatformRole');
    const user = await GlobalUser.create({
      email: `admin-${userSeq}@example.com`,
      name: 'Platform Admin',
    });
    await PlatformRole.create({ globalUserId: user._id, roles });
    return user;
  }

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((requestContext, _res, next) => {
      requestContext.globalDb = globalDb;
      requestContext.school = 'www';
      next();
    });
    app.use('/mcp/carousel', carouselMcpRoutes);
    app.use(platformIntegrationRoutes);
    return app;
  }

  function session(user, { roles = ['platform_admin'], mfaConfigured = true, mfaVerified = true } = {}) {
    const token = jwt.sign(
      {
        globalUserId: String(user._id),
        platformRoles: roles,
        roles: ['user'],
        mfaConfigured,
        mfaVerified,
      },
      JWT_SECRET,
    );
    return `Bearer ${token}`;
  }

  async function mint(app, user, label = 'grokbot') {
    return request(app)
      .post('/admin/platform/access-tokens')
      .set('Authorization', session(user))
      .send({ label });
  }

  it('mints for the signed-in admin, shows the secret once, and lists without it', async () => {
    const admin = await createAdmin();
    const other = await createAdmin();
    const app = buildApp();

    const minted = await request(app)
      .post('/admin/platform/access-tokens')
      .set('Authorization', session(admin))
      .send({ label: 'grokbot', globalUserId: String(other._id) });
    expect(minted.status).toBe(201);
    expect(minted.body.data.globalUserId).toBe(String(admin._id));
    expect(minted.body.data.createdBy).toBe(String(admin._id));
    const { secret } = minted.body.data;
    expect(secret.startsWith('mcp_')).toBe(true);

    const { PlatformAccessToken } = getGlobalModels(req(), 'PlatformAccessToken');
    expect(await PlatformAccessToken.countDocuments({ globalUserId: other._id })).toBe(0);

    const duplicate = await mint(app, admin, 'second');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('TOKEN_EXISTS');

    const listed = await request(app)
      .get('/admin/platform/access-tokens')
      .set('Authorization', session(other));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([
      expect.objectContaining({
        id: minted.body.data.id,
        globalUserId: String(admin._id),
        ownerEmail: admin.email,
        label: 'grokbot',
        displayPrefix: secret.slice(0, 12),
        expiresAt: expect.any(String),
        lastUsedAt: null,
        revokedAt: null,
      }),
    ]);
    const raw = JSON.stringify(listed.body);
    expect(raw).not.toContain(secret);
    expect(raw).not.toContain('tokenHash');
    expect(listed.body.data[0].secret).toBeUndefined();
  });

  it('refuses changes from a session without verified MFA', async () => {
    const admin = await createAdmin();
    const app = buildApp();

    const notConfigured = await request(app)
      .post('/admin/platform/access-tokens')
      .set('Authorization', session(admin, { mfaConfigured: false, mfaVerified: false }))
      .send({ label: 'grokbot' });
    expect(notConfigured.status).toBe(403);
    expect(notConfigured.body.code).toBe('ADMIN_MFA_NOT_CONFIGURED');

    const notVerified = await request(app)
      .post('/admin/platform/access-tokens')
      .set('Authorization', session(admin, { mfaConfigured: true, mfaVerified: false }))
      .send({ label: 'grokbot' });
    expect(notVerified.status).toBe(403);
    expect(notVerified.body.code).toBe('ADMIN_MFA_REQUIRED');

    const { PlatformAccessToken } = getGlobalModels(req(), 'PlatformAccessToken');
    expect(await PlatformAccessToken.countDocuments({})).toBe(0);

    const minted = await mint(app, admin);
    const revoke = await request(app)
      .post(`/admin/platform/access-tokens/${minted.body.data.id}/revoke`)
      .set('Authorization', session(admin, { mfaConfigured: true, mfaVerified: false }));
    expect(revoke.status).toBe(403);
    expect(revoke.body.code).toBe('ADMIN_MFA_REQUIRED');
    expect((await PlatformAccessToken.findById(minted.body.data.id).lean()).revokedAt).toBeNull();
  });

  it('refuses a non-admin, even to list', async () => {
    const { GlobalUser } = getGlobalModels(req(), 'GlobalUser');
    const user = await GlobalUser.create({ email: 'someone@example.com', name: 'Someone' });
    const listed = await request(buildApp())
      .get('/admin/platform/access-tokens')
      .set('Authorization', session(user, { roles: [] }));
    expect(listed.status).toBe(403);
  });

  it('lets only the owner or a root admin revoke, and records who did', async () => {
    const owner = await createAdmin();
    const peer = await createAdmin();
    const root = await createAdmin({ roles: ['root'] });
    const app = buildApp();
    const minted = await mint(app, owner);
    const { id } = minted.body.data;

    const byPeer = await request(app)
      .post(`/admin/platform/access-tokens/${id}/revoke`)
      .set('Authorization', session(peer));
    expect(byPeer.status).toBe(403);
    expect(byPeer.body.code).toBe('NOT_TOKEN_OWNER');

    const byRoot = await request(app)
      .post(`/admin/platform/access-tokens/${id}/revoke`)
      .set('Authorization', session(root, { roles: ['root'] }));
    expect(byRoot.status).toBe(200);
    expect(byRoot.body.data.revokedBy).toBe(String(root._id));
    expect(byRoot.body.data.revokedAt).toEqual(expect.any(String));

    const second = await mint(app, owner, 'grokbot-2');
    const byOwner = await request(app)
      .post(`/admin/platform/access-tokens/${second.body.data.id}/revoke`)
      .set('Authorization', session(owner));
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.data.revokedBy).toBe(String(owner._id));
  });

  it('a revoked token stops working on /mcp/carousel', async () => {
    const admin = await createAdmin();
    const app = buildApp();
    const minted = await mint(app, admin);
    const bearer = `Bearer ${minted.body.data.secret}`;
    const call = () => request(app)
      .post('/mcp/carousel')
      .set('Authorization', bearer)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

    const before = await call();
    expect(before.status).toBe(200);

    const revoked = await request(app)
      .post(`/admin/platform/access-tokens/${minted.body.data.id}/revoke`)
      .set('Authorization', session(admin));
    expect(revoked.status).toBe(200);

    const after = await call();
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('TOKEN_REVOKED');
  });
});
