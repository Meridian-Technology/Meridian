const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  mintPlatformAccessToken,
  listPlatformAccessTokens,
  revokePlatformAccessToken,
  TOKEN_TTL_MS,
  hashToken,
} = require('../../services/platformAccessTokenService');
const { verifyPlatformAccessToken } = require('../../middlewares/verifyPlatformAccessToken');
const carouselMcpRoutes = require('../../routes/carouselMcpRoutes');
const adminRoutes = require('../../routes/adminRoutes');
const { main: tokenScript } = require('../../scripts/platformAccessToken');

// The first query on a fresh in-memory Mongo also builds every global model's indexes.
jest.setTimeout(120000);

const previousJwtSecret = process.env.JWT_SECRET;
const JWT_SECRET = 'platform-access-token-test-secret';

function sha256(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

describe('platform admin access tokens', () => {
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
    if (roles) {
      await PlatformRole.create({ globalUserId: user._id, roles });
    }
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
    app.get('/mcp/carousel-identity', verifyPlatformAccessToken, (requestContext, res) => {
      res.json({
        globalUserId: String(requestContext.user.globalUserId),
        platformRoles: requestContext.user.platformRoles,
        mfaVerified: requestContext.user.mfaVerified,
        mfaConfigured: requestContext.user.mfaConfigured,
        userId: requestContext.user.userId,
        label: requestContext.platformAccessToken.label,
      });
    });
    app.use(adminRoutes);
    return app;
  }

  function sessionToken(user) {
    return jwt.sign(
      {
        globalUserId: String(user._id),
        platformRoles: ['platform_admin'],
        roles: ['user'],
        mfaConfigured: true,
        mfaVerified: true,
      },
      JWT_SECRET,
    );
  }

  async function storedToken(id) {
    const { PlatformAccessToken } = getGlobalModels(req(), 'PlatformAccessToken');
    return PlatformAccessToken.findById(id).lean();
  }

  it('stores a SHA-256 hash and shows the secret only from mint', async () => {
    const user = await createAdmin();
    const minted = await mintPlatformAccessToken(req(), {
      globalUserId: user._id,
      label: '  grokbot  ',
    });
    expect(minted.error).toBeUndefined();
    expect(minted.data.secret.startsWith(minted.data.displayPrefix)).toBe(true);
    expect(minted.data.displayPrefix.startsWith('mcp_')).toBe(true);
    expect(minted.data.label).toBe('grokbot');

    const delta = new Date(minted.data.expiresAt).getTime() - Date.now();
    expect(delta).toBeGreaterThan(TOKEN_TTL_MS - 60_000);
    expect(delta).toBeLessThan(TOKEN_TTL_MS + 60_000);

    const stored = await storedToken(minted.data.id);
    expect(stored.tokenHash).toBe(sha256(minted.data.secret));
    expect(stored.tokenHash).toBe(hashToken(minted.data.secret));
    expect(JSON.stringify(stored)).not.toContain(minted.data.secret);
    expect(stored.lastUsedAt).toBeNull();
    expect(stored.revokedAt).toBeNull();

    const listed = await listPlatformAccessTokens(req());
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].displayPrefix).toBe(minted.data.displayPrefix);
    expect(listed.data[0].secret).toBeUndefined();
    expect(listed.data[0].tokenHash).toBeUndefined();
    expect(JSON.stringify(listed.data)).not.toContain(minted.data.secret);

    const duplicate = await mintPlatformAccessToken(req(), {
      globalUserId: user._id,
      label: 'second',
    });
    expect(duplicate).toMatchObject({ status: 409, code: 'TOKEN_EXISTS' });

    const outsider = await createAdmin({ roles: null });
    const refused = await mintPlatformAccessToken(req(), {
      globalUserId: outsider._id,
      label: 'nope',
    });
    expect(refused).toMatchObject({ status: 403, code: 'NOT_PLATFORM_ADMIN' });
  });

  it('resolves the owner with mfaVerified false and records last use', async () => {
    const user = await createAdmin();
    const minted = await mintPlatformAccessToken(req(), {
      globalUserId: user._id,
      label: 'grokbot',
    });
    const app = buildApp();
    const response = await request(app)
      .get('/mcp/carousel-identity')
      .set('Authorization', `Bearer ${minted.data.secret}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      globalUserId: String(user._id),
      platformRoles: ['platform_admin'],
      mfaVerified: false,
      mfaConfigured: false,
      userId: null,
      label: 'grokbot',
    });
    const stored = await storedToken(minted.data.id);
    expect(stored.lastUsedAt).toBeInstanceOf(Date);

    const onMcp = await request(app)
      .get('/mcp/carousel')
      .set('Authorization', `Bearer ${minted.data.secret}`);
    expect(onMcp.status).toBe(405);
    expect(onMcp.body.error.message).toBe('Method not allowed.');
    expect(onMcp.headers['mcp-session-id']).toBeUndefined();
  });

  it('rejects a revoked token', async () => {
    const user = await createAdmin();
    const minted = await mintPlatformAccessToken(req(), {
      globalUserId: user._id,
      label: 'grokbot',
    });
    const revoked = await revokePlatformAccessToken(req(), minted.data.id);
    expect(revoked.data.revokedAt).toBeInstanceOf(Date);
    expect(revoked.data.displayPrefix).toBe(minted.data.displayPrefix);

    const again = await revokePlatformAccessToken(req(), minted.data.id);
    expect(String(again.data.revokedAt)).toBe(String(revoked.data.revokedAt));

    const response = await request(buildApp())
      .get('/mcp/carousel')
      .set('Authorization', `Bearer ${minted.data.secret}`);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TOKEN_REVOKED');

    const stored = await storedToken(minted.data.id);
    expect(stored.lastUsedAt).toBeNull();

    const replacement = await mintPlatformAccessToken(req(), {
      globalUserId: user._id,
      label: 'grokbot-2',
    });
    expect(replacement.data.secret).not.toBe(minted.data.secret);
    const listed = await listPlatformAccessTokens(req());
    expect(listed.data.map((token) => token.label).sort()).toEqual(['grokbot', 'grokbot-2']);
  });

  it('rejects an expired token', async () => {
    const user = await createAdmin();
    const minted = await mintPlatformAccessToken(req(), {
      globalUserId: user._id,
      label: 'grokbot',
    });
    const { PlatformAccessToken } = getGlobalModels(req(), 'PlatformAccessToken');
    await PlatformAccessToken.updateOne(
      { _id: minted.data.id },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );

    const response = await request(buildApp())
      .get('/mcp/carousel-identity')
      .set('Authorization', `Bearer ${minted.data.secret}`);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('TOKEN_EXPIRED');
    const stored = await storedToken(minted.data.id);
    expect(stored.lastUsedAt).toBeNull();
    expect(stored.revokedAt).toBeNull();
  });

  it('rechecks PlatformRole on every request and rejects role removal', async () => {
    const user = await createAdmin();
    const minted = await mintPlatformAccessToken(req(), {
      globalUserId: user._id,
      label: 'grokbot',
    });
    const { PlatformRole } = getGlobalModels(req(), 'PlatformRole');
    await PlatformRole.updateOne({ globalUserId: user._id }, { $set: { roles: ['root'] } });

    const app = buildApp();
    const asRoot = await request(app)
      .get('/mcp/carousel-identity')
      .set('Authorization', `Bearer ${minted.data.secret}`);
    expect(asRoot.status).toBe(200);
    expect(asRoot.body.platformRoles).toEqual(['root']);
    expect(asRoot.body.mfaVerified).toBe(false);
    const usedAt = (await storedToken(minted.data.id)).lastUsedAt;

    await PlatformRole.updateOne({ globalUserId: user._id }, { $set: { roles: [] } });
    const removed = await request(app)
      .get('/mcp/carousel-identity')
      .set('Authorization', `Bearer ${minted.data.secret}`);
    expect(removed.status).toBe(403);
    expect(removed.body.code).toBe('NOT_PLATFORM_ADMIN');
    expect(String((await storedToken(minted.data.id)).lastUsedAt)).toBe(String(usedAt));
  });

  it('refuses the token on an existing admin route and ignores session cookies', async () => {
    const user = await createAdmin();
    const minted = await mintPlatformAccessToken(req(), {
      globalUserId: user._id,
      label: 'grokbot',
    });
    const app = buildApp();
    const session = sessionToken(user);

    const adminWithSession = await request(app)
      .get('/admin/platform-admins')
      .set('Authorization', `Bearer ${session}`);
    expect(adminWithSession.status).toBe(200);
    expect(adminWithSession.body.data.admins).toEqual([
      expect.objectContaining({ email: user.email, globalUserId: String(user._id) }),
    ]);

    const adminWithToken = await request(app)
      .get('/admin/platform-admins')
      .set('Authorization', `Bearer ${minted.data.secret}`);
    expect(adminWithToken.status).toBe(403);
    expect(adminWithToken.body).toEqual({
      success: false,
      message: 'Invalid access token',
      code: 'INVALID_TOKEN',
    });

    const mcpWithSession = await request(app)
      .get('/mcp/carousel-identity')
      .set('Authorization', `Bearer ${session}`);
    expect(mcpWithSession.status).toBe(401);
    expect(mcpWithSession.body.code).toBe('INVALID_TOKEN');

    const mcpWithCookie = await request(app)
      .get('/mcp/carousel-identity')
      .set('Cookie', `accessToken=${session}`);
    expect(mcpWithCookie.status).toBe(401);
    expect(mcpWithCookie.body.code).toBe('NO_TOKEN');

    const adminWithCookie = await request(app)
      .get('/admin/platform-admins')
      .set('Cookie', `accessToken=${session}`);
    expect(adminWithCookie.status).toBe(200);
  });

  it('the token script refuses a write that is not acknowledged', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    await expect(tokenScript(['drop'])).rejects.toThrow(/usage/);
    await expect(tokenScript([
      'mint',
      '--global-user-id',
      id,
      '--label',
      'grokbot',
    ])).rejects.toThrow(/--ack-write/);
    await expect(tokenScript([
      'mint',
      '--label',
      'grokbot',
      '--ack-write',
    ])).rejects.toThrow(/global-user-id/);
    await expect(tokenScript(['revoke', '--ack-write'])).rejects.toThrow(/--id/);
  });
});
