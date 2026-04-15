const express = require('express');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const { requireAdmin } = require('../middlewares/requireAdmin');
const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const { getConnections, disconnectSocket, disconnectAll } = require('../socket');
const { createSession } = require('../utilities/sessionUtils');
const { getCookieDomain } = require('../utilities/cookieUtils');

const ACCESS_TOKEN_EXPIRY = '1m';
const REFRESH_TOKEN_EXPIRY = '30d';
const ACCESS_TOKEN_EXPIRY_MS = 60 * 1000;
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const TENANT_STATUSES = new Set(['active', 'coming_soon', 'maintenance', 'hidden']);
const DEFAULT_TENANTS = [
  {
    tenantKey: 'rpi',
    name: 'Rensselaer Polytechnic Institute',
    subdomain: 'rpi',
    location: 'Troy, NY',
    status: 'active',
    statusMessage: '',
  },
  {
    tenantKey: 'tvcog',
    name: 'Center of Gravity',
    subdomain: 'tvcog',
    location: 'Troy, NY',
    status: 'active',
    statusMessage: '',
  },
];

function normalizeTenantRows(rows = []) {
  return rows
    .map((row) => {
      const tenantKey = String(row?.tenantKey || '').trim().toLowerCase();
      if (!tenantKey) return null;
      const status = TENANT_STATUSES.has(row?.status) ? row.status : 'active';
      return {
        tenantKey,
        name: String(row?.name || tenantKey).trim(),
        subdomain: String(row?.subdomain || tenantKey).trim().toLowerCase(),
        location: String(row?.location || '').trim(),
        status,
        statusMessage: String(row?.statusMessage || '').trim().slice(0, 240),
      };
    })
    .filter(Boolean);
}

function mergeTenantRows(baseRows = [], overrideRows = []) {
  const merged = new Map();
  normalizeTenantRows(baseRows).forEach((row) => merged.set(row.tenantKey, row));
  normalizeTenantRows(overrideRows).forEach((row) => {
    const base = merged.get(row.tenantKey) || {};
    merged.set(row.tenantKey, { ...base, ...row });
  });
  return Array.from(merged.values());
}

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

router.get('/api/tenant-config', async (req, res) => {
  try {
    const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
    const doc = await TenantConfig.findOne({ configKey: 'default' }).lean();
    const tenants = mergeTenantRows(DEFAULT_TENANTS, doc?.tenants || []);
    res.json({
      success: true,
      data: {
        tenants,
        updatedAt: doc?.updatedAt || null,
      },
    });
  } catch (err) {
    console.error('GET /api/tenant-config failed:', err);
    res.status(500).json({ success: false, message: err.message });
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
      { userId: targetUser._id, type: 'refresh', jti: randomUUID() },
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
    const domain = getCookieDomain(req);
    if (domain) cookieOpts.domain = domain;
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
 * POST /admin/migrate-classroom-building-refs
 * One-shot (per tenant DB): create Building docs from distinct legacy Classroom.building strings,
 * then replace those strings with ObjectId refs. Guarded by admin_migration_runs; optional body.force to re-run.
 */
router.post('/admin/migrate-classroom-building-refs', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { runMigrateClassroomBuildingRefs } = require('../migrations/migrateClassroomBuildingRefs');
    const force = Boolean(req.body?.force);
    const data = await runMigrateClassroomBuildingRefs(req.db, { force });
    console.log('POST /admin/migrate-classroom-building-refs completed:', data);
    res.json({ success: true, data });
  } catch (err) {
    console.error('POST /admin/migrate-classroom-building-refs failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/admin/tenant-config', verifyToken, requireAdmin, async (req, res) => {
  if (!req.user.platformRoles?.includes('platform_admin')) {
    return res.status(403).json({ success: false, message: 'Platform admin required.' });
  }
  try {
    const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
    const doc = await TenantConfig.findOne({ configKey: 'default' }).lean();
    const tenants = mergeTenantRows(DEFAULT_TENANTS, doc?.tenants || []);
    res.json({
      success: true,
      data: {
        tenants,
        updatedAt: doc?.updatedAt || null,
      },
    });
  } catch (err) {
    console.error('GET /admin/tenant-config failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/admin/tenant-config', verifyToken, requireAdmin, async (req, res) => {
  if (!req.user.platformRoles?.includes('platform_admin')) {
    return res.status(403).json({ success: false, message: 'Platform admin required.' });
  }
  try {
    if (!Array.isArray(req.body?.tenants)) {
      return res.status(400).json({ success: false, message: 'tenants array is required.' });
    }
    const incoming = normalizeTenantRows(req.body.tenants);
    const incomingByKey = new Map(incoming.map((row) => [row.tenantKey, row]));
    const nextTenants = mergeTenantRows(
      DEFAULT_TENANTS,
      DEFAULT_TENANTS.map((row) => {
        const update = incomingByKey.get(row.tenantKey);
        if (!update) return row;
        return {
          ...row,
          status: update.status || row.status,
          statusMessage: update.statusMessage || '',
        };
      })
    );
    const activeCount = nextTenants.filter((tenant) => tenant.status === 'active').length;
    if (activeCount < 1) {
      return res.status(400).json({
        success: false,
        message: 'At least one tenant must remain active.',
        code: 'AT_LEAST_ONE_ACTIVE_TENANT_REQUIRED',
      });
    }

    const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
    const updatedBy = req.user.globalUserId || req.user.userId || null;
    const doc = await TenantConfig.findOneAndUpdate(
      { configKey: 'default' },
      { $set: { tenants: nextTenants, updatedBy } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      success: true,
      data: {
        tenants: mergeTenantRows(DEFAULT_TENANTS, doc?.tenants || []),
        updatedAt: doc?.updatedAt || null,
      },
    });
  } catch (err) {
    console.error('PUT /admin/tenant-config failed:', err);
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
