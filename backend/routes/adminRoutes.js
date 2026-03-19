const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const { requireAdmin } = require('../middlewares/requireAdmin');
const mongoose = require('mongoose');
const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
const { getConnections, disconnectSocket, disconnectAll } = require('../socket');
const { createSession } = require('../utilities/sessionUtils');

const ACCESS_TOKEN_EXPIRY = '1m';
const REFRESH_TOKEN_EXPIRY = '30d';
const ACCESS_TOKEN_EXPIRY_MS = 60 * 1000;
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

router.get('/health', async (req, res) => {
  try {
     // Start timer
     const mongooseConn = await connectToDatabase(req.school);
     console.log(req.school);
     const nativeDb = mongooseConn.db;
 
     const start = performance.now();
     const dbStatus = await nativeDb.admin().ping();
     const end = performance.now();
     const latencyMs = (end - start).toFixed(2);
 
 
    const cronJobLastRun = new Date(); // implement this from your cron logs
    const cronStatus = Date.now() - new Date(cronJobLastRun).getTime() < 5 * 60 * 1000;

    const authSystemHealthy = true; // Add logic if needed

    res.json({
        statuses:{
            backend: { status: true, uptime: process.uptime() },
            database: { status: dbStatus.ok === 1, latency: latencyMs }, 
            cronJobs: { status: cronStatus, lastRun: cronJobLastRun },
            auth: { status: authSystemHealthy },
            frontend: { status: true, build: 'v1.2.3', deployedAt: '2025-04-20T16:00:00Z' } // example static
        },
        subDomain: req.school
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ error: 'Site health check failed', details: err.message });
  }
});

async function getLastCronRun() {
  // Replace with actual query from your cron log collection
  return new Date(); // stubbed
}

async function checkExternalApi() {
  try {
    const response = await fetch('https://api.stripe.com'); // use HEAD or lightweight endpoint
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * WebSocket connections – admin only.
 * List and manage open Socket.IO connections to help with server load.
 */
router.get('/websocket-connections', verifyToken, requireAdmin, (req, res) => {
  try {
    const connections = getConnections();
    res.json({
      success: true,
      count: connections.length,
      connections: connections.map((c) => ({
        ...c,
        connectedAt: new Date(c.connectedAt).toISOString(),
      })),
    });
  } catch (err) {
    console.error('GET /websocket-connections failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/websocket-connections/:socketId/disconnect', verifyToken, requireAdmin, (req, res) => {
  try {
    const { socketId } = req.params;
    const ok = disconnectSocket(socketId);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Socket not found or already disconnected' });
    }
    res.json({ success: true, message: 'Socket disconnected' });
  } catch (err) {
    console.error('POST /websocket-connections/:socketId/disconnect failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/websocket-connections/disconnect-all', verifyToken, requireAdmin, (req, res) => {
  try {
    const count = disconnectAll();
    res.json({ success: true, message: `Disconnected ${count} connection(s)`, count });
  } catch (err) {
    console.error('POST /websocket-connections/disconnect-all failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Admin impersonation – log in as another user (admin/root only).
 * POST /admin/impersonate
 * Body: { identifier: string } – username, email, or user _id
 */
router.post('/admin/impersonate', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ success: false, message: 'identifier (username, email, or user id) is required' });
    }

    const getModels = require('../services/getModelService');
    const { User } = getModels(req, 'User');

    const trimmed = identifier.trim();
    const isObjectId = mongoose.Types.ObjectId.isValid(trimmed) && String(new mongoose.Types.ObjectId(trimmed)) === trimmed;
    const isEmail = trimmed.includes('@');

    let targetUser;
    if (isObjectId) {
      targetUser = await User.findById(trimmed);
    } else if (isEmail) {
      targetUser = await User.findOne({ email: trimmed.toLowerCase() });
    } else {
      targetUser = await User.findOne({ username: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const accessToken = jwt.sign(
      { userId: targetUser._id, roles: targetUser.roles },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { userId: targetUser._id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    await createSession(targetUser._id, refreshToken, req);

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: ACCESS_TOKEN_EXPIRY_MS,
      path: '/'
    };
    if (process.env.NODE_ENV === 'production') cookieOpts.domain = '.meridian.study';
    res.cookie('accessToken', accessToken, cookieOpts);
    res.cookie('refreshToken', refreshToken, { ...cookieOpts, maxAge: REFRESH_TOKEN_EXPIRY_MS });

    const userObj = targetUser.toObject ? targetUser.toObject() : targetUser;
    delete userObj.password;

    console.log(`POST: /admin/impersonate - Admin ${req.user.userId} logged in as ${targetUser.username} (${targetUser._id})`);

    res.status(200).json({
      success: true,
      message: `Logged in as ${targetUser.username}`,
      data: { user: userObj }
    });
  } catch (err) {
    console.error('POST /admin/impersonate failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Get recent analytics events for a user (admin/root only).
 * GET /admin/user/:userId/analytics?limit=50
 */
router.get('/admin/user/:userId/analytics', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const getModels = require('../services/getModelService');
    const { AnalyticsEvent } = getModels(req, 'AnalyticsEvent');

    const events = await AnalyticsEvent.find(
      { user_id: new mongoose.Types.ObjectId(userId) },
      { event_id: 1, event: 1, ts: 1, platform: 1, context: 1, properties: 1 }
    )
      .sort({ ts: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: events
    });
  } catch (err) {
    console.error('GET /admin/user/:userId/analytics failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

const getGlobalModels = require('../services/getGlobalModelService');

/**
 * GET /admin/platform-admins – list platform admins (GlobalUsers with platform_admin role)
 */
router.get('/admin/platform-admins', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { PlatformRole, GlobalUser } = getGlobalModels(req, 'PlatformRole', 'GlobalUser');
    const roles = await PlatformRole.find({ roles: 'platform_admin' }).lean();
    const globalUserIds = roles.map(r => r.globalUserId);
    const users = await GlobalUser.find({ _id: { $in: globalUserIds } }).select('email name picture createdAt').lean();
    const byId = users.reduce((acc, u) => { acc[u._id.toString()] = u; return acc; }, {});
    const list = roles.map(r => ({
      globalUserId: r.globalUserId,
      email: byId[r.globalUserId.toString()]?.email,
      name: byId[r.globalUserId.toString()]?.name,
      picture: byId[r.globalUserId.toString()]?.picture,
    }));
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('GET /admin/platform-admins failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /admin/platform-admins – add platform admin by email or globalUserId
 * Body: { email?: string, globalUserId?: string }
 */
router.post('/admin/platform-admins', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { email, globalUserId } = req.body;
    const { PlatformRole, GlobalUser } = getGlobalModels(req, 'PlatformRole', 'GlobalUser');

    let globalUser;
    if (globalUserId) {
      globalUser = await GlobalUser.findById(globalUserId);
    } else if (email) {
      globalUser = await GlobalUser.findOne({ email: String(email).trim().toLowerCase() });
    }
    if (!globalUser) {
      return res.status(404).json({ success: false, message: 'Global user not found. Add by email or globalUserId.' });
    }

    let pr = await PlatformRole.findOne({ globalUserId: globalUser._id });
    if (!pr) {
      pr = new PlatformRole({ globalUserId: globalUser._id, roles: [] });
    }
    if (!pr.roles.includes('platform_admin')) {
      pr.roles.push('platform_admin');
      await pr.save();
    }
    console.log(`Platform admin added: ${globalUser.email} by ${req.user.userId || req.user.globalUserId}`);
    res.json({ success: true, data: { globalUserId: globalUser._id, email: globalUser.email } });
  } catch (err) {
    console.error('POST /admin/platform-admins failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /admin/migrate-users-to-global-identity – backfill GlobalUser + TenantMembership for existing tenant Users.
 * Alternative to running scripts/migrateUsersToGlobalIdentity.js when shell access is unavailable.
 * Idempotent. Body: { tenantKeys?: string[] } (optional; defaults to rpi,tvcog).
 * Restricted to platform admins only.
 */
router.post('/admin/migrate-users-to-global-identity', verifyToken, requireAdmin, async (req, res) => {
  if (!req.user.platformRoles?.includes('platform_admin')) {
    return res.status(403).json({ success: false, message: 'Platform admin required.' });
  }
  try {
    const tenantKeys = Array.isArray(req.body?.tenantKeys) && req.body.tenantKeys.length > 0
      ? req.body.tenantKeys.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
      : ['rpi', 'tvcog'];

    const userSchema = require('../schemas/user');
    const globalUserSchema = require('../schemas/globalUser');
    const tenantMembershipSchema = require('../schemas/tenantMembership');

    const globalDb = await connectToGlobalDatabase();
    const GlobalUser = globalDb.model('GlobalUser', globalUserSchema, 'global_users');
    const TenantMembership = globalDb.model('TenantMembership', tenantMembershipSchema, 'tenant_memberships');

    const summary = { globalUsersCreated: 0, membershipsCreated: 0, tenants: {} };

    for (const tenantKey of tenantKeys) {
      summary.tenants[tenantKey] = { usersProcessed: 0, globalUsersCreated: 0, membershipsCreated: 0 };
      const db = await connectToDatabase(tenantKey);
      const User = db.model('User', userSchema, 'users');
      const users = await User.find({}).lean();

      for (const user of users) {
        const email = (user.email || '').trim().toLowerCase();
        if (!email) continue;

        summary.tenants[tenantKey].usersProcessed++;

        const source = {
          email: user.email,
          name: user.name,
          picture: user.picture,
          googleId: user.googleId,
          appleId: user.appleId,
          samlId: user.samlId,
          samlProvider: user.samlProvider,
        };

        let globalUser = await GlobalUser.findOne({ email });
        if (!globalUser) {
          const providerQuery = { $or: [{ email }] };
          if (source.googleId) providerQuery.$or.push({ googleId: source.googleId });
          if (source.appleId) providerQuery.$or.push({ appleId: source.appleId });
          if (source.samlId && source.samlProvider) {
            providerQuery.$or.push({ samlId: source.samlId, samlProvider: source.samlProvider });
          }
          globalUser = await GlobalUser.findOne(providerQuery);
        }
        if (!globalUser) {
          globalUser = new GlobalUser({
            email,
            name: source.name || '',
            picture: source.picture || '',
            googleId: source.googleId,
            appleId: source.appleId,
            samlId: source.samlId,
            samlProvider: source.samlProvider,
          });
          await globalUser.save();
          summary.globalUsersCreated++;
          summary.tenants[tenantKey].globalUsersCreated++;
        }

        let membership = await TenantMembership.findOne({
          globalUserId: globalUser._id,
          tenantKey,
        });
        if (!membership) {
          membership = new TenantMembership({
            globalUserId: globalUser._id,
            tenantKey,
            tenantUserId: user._id,
            status: 'active',
          });
          await membership.save();
          summary.membershipsCreated++;
          summary.tenants[tenantKey].membershipsCreated++;
        }
      }
    }

    console.log('POST /admin/migrate-users-to-global-identity completed:', summary);
    res.json({ success: true, data: summary });
  } catch (err) {
    console.error('POST /admin/migrate-users-to-global-identity failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /admin/platform-admins/:globalUserId – remove platform_admin role
 */
router.delete('/admin/platform-admins/:globalUserId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { globalUserId } = req.params;
    const { PlatformRole } = getGlobalModels(req, 'PlatformRole');
    const pr = await PlatformRole.findOne({ globalUserId });
    if (!pr) {
      return res.status(404).json({ success: false, message: 'Platform role not found' });
    }
    pr.roles = (pr.roles || []).filter(r => r !== 'platform_admin' && r !== 'root');
    await pr.save();
    console.log(`Platform admin removed: ${globalUserId} by ${req.user.userId || req.user.globalUserId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /admin/platform-admins failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
