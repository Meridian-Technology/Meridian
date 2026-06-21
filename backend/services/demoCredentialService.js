const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDemoModels } = require('./demoModelService');
const getModels = require('./getModelService');
const { MANIFEST_KEY } = require('./seedDemoTenantService');
const { getCookieDomain } = require('../utilities/cookieUtils');

const DEMO_ACCESS_COOKIE = 'demoAccessToken';
const DEMO_ACCESS_TOKEN_EXPIRY = '8h';
const DEMO_ACCESS_TOKEN_EXPIRY_MS = 8 * 60 * 60 * 1000;
const DEMO_EMAIL_DOMAIN = 'demo.meridian.study';

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

function generateCredentialPassword() {
    return `Demo-${crypto.randomBytes(4).toString('hex')}`;
}

function generateCredentialEmail() {
    return `demo-${crypto.randomBytes(4).toString('hex')}@${DEMO_EMAIL_DOMAIN}`;
}

function getClientIp(req) {
    return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
}

function checkLoginRateLimit(req) {
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = loginAttempts.get(ip) || { count: 0, windowStart: now };
    if (now - entry.windowStart > LOGIN_WINDOW_MS) {
        entry.count = 0;
        entry.windowStart = now;
    }
    entry.count += 1;
    loginAttempts.set(ip, entry);
    return entry.count <= LOGIN_MAX_ATTEMPTS;
}

function credentialIsActive(credential) {
    if (!credential || credential.revokedAt) return false;
    if (credential.expiresAt && new Date(credential.expiresAt) < new Date()) return false;
    return true;
}

function buildDemoAccessToken({ operatorUserId, credential }) {
    return jwt.sign(
        {
            userId: operatorUserId.toString(),
            roles: ['user'],
            isDemoSession: true,
            demoCredentialId: credential._id.toString(),
            demoCredentialLabel: credential.label || '',
        },
        process.env.JWT_SECRET,
        { expiresIn: DEMO_ACCESS_TOKEN_EXPIRY }
    );
}

function setDemoAccessCookie(req, res, accessToken) {
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: DEMO_ACCESS_TOKEN_EXPIRY_MS,
        path: '/',
    };
    const domain = getCookieDomain(req);
    if (domain) cookieOptions.domain = domain;
    res.cookie(DEMO_ACCESS_COOKIE, accessToken, cookieOptions);
}

function clearDemoAccessCookie(req, res) {
    const clearOpts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
    };
    const domain = getCookieDomain(req);
    if (domain) clearOpts.domain = domain;
    res.clearCookie(DEMO_ACCESS_COOKIE, clearOpts);
}

function getDemoAccessTokenFromRequest(req) {
    return req.cookies?.[DEMO_ACCESS_COOKIE]
        || (req.headers['x-demo-token'] ? String(req.headers['x-demo-token']) : null);
}

async function getDemoManifest(db) {
    const { DemoManifest } = getDemoModels(db);
    return DemoManifest.findOne({ key: MANIFEST_KEY });
}

async function loginDemoCredential(db, req, res, { email, password }) {
    if (!checkLoginRateLimit(req)) {
        const err = new Error('Too many login attempts. Try again later.');
        err.code = 'RATE_LIMITED';
        throw err;
    }

    const { DemoCredential, DemoManifest, User } = getDemoModels(db);
    const manifest = await getDemoManifest(db);
    if (!manifest) {
        const err = new Error('Demo tenant has not been seeded yet.');
        err.code = 'DEMO_NOT_SEEDED';
        throw err;
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const credential = await DemoCredential.findOne({ email: normalizedEmail });
    if (!credential || !credentialIsActive(credential)) {
        const err = new Error('Invalid email or password');
        err.code = 'INVALID_CREDENTIALS';
        throw err;
    }

    const passwordMatch = await bcrypt.compare(String(password || ''), credential.passwordHash);
    if (!passwordMatch) {
        const err = new Error('Invalid email or password');
        err.code = 'INVALID_CREDENTIALS';
        throw err;
    }

    const operator = await User.findById(manifest.operatorUserId).select('name email roles picture username');
    if (!operator) {
        const err = new Error('Demo operator account is missing. Re-run the demo seed.');
        err.code = 'DEMO_NOT_SEEDED';
        throw err;
    }

    const { Event } = getDemoModels(db);
    const event = await Event.findById(manifest.eventId).select('name').lean();

    credential.lastLoginAt = new Date();
    credential.loginCount = (credential.loginCount || 0) + 1;
    await credential.save();

    const accessToken = buildDemoAccessToken({
        operatorUserId: operator._id,
        credential,
    });
    setDemoAccessCookie(req, res, accessToken);

    return {
        credential: {
            id: credential._id.toString(),
            email: credential.email,
            label: credential.label || '',
        },
        user: {
            _id: operator._id,
            name: operator.name,
            email: operator.email,
            username: operator.username,
            picture: operator.picture,
            roles: operator.roles,
            isDemoSession: true,
        },
        manifest: {
            orgId: manifest.orgId.toString(),
            eventId: manifest.eventId.toString(),
            eventName: event?.name || null,
        },
    };
}

async function getDemoSessionUser(db, decoded) {
    if (!decoded?.isDemoSession || !decoded.userId) return null;
    const { User, DemoCredential } = getDemoModels(db);
    const user = await User.findById(decoded.userId).select('name email roles picture username');
    if (!user) return null;

    let credential = null;
    if (decoded.demoCredentialId) {
        const doc = await DemoCredential.findById(decoded.demoCredentialId).select('email label revokedAt expiresAt');
        if (doc && credentialIsActive(doc)) {
            credential = {
                id: doc._id.toString(),
                email: doc.email,
                label: doc.label || '',
            };
        }
    }

    const manifest = await getDemoManifest(db);
    let eventName = null;
    if (manifest?.eventId) {
        const { Event } = getDemoModels(db);
        const event = await Event.findById(manifest.eventId).select('name').lean();
        eventName = event?.name || null;
    }
    return {
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            username: user.username,
            picture: user.picture,
            roles: user.roles,
            isDemoSession: true,
        },
        credential,
        manifest: manifest ? {
            orgId: manifest.orgId.toString(),
            eventId: manifest.eventId.toString(),
            eventName,
        } : null,
    };
}

async function listDemoCredentials(db) {
    const { DemoCredential } = getDemoModels(db);
    const rows = await DemoCredential.find({}).sort({ createdAt: -1 }).lean();
    return rows.map((row) => ({
        id: row._id.toString(),
        email: row.email,
        label: row.label || '',
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        lastLoginAt: row.lastLoginAt,
        loginCount: row.loginCount || 0,
        status: credentialIsActive(row) ? 'active' : (row.revokedAt ? 'revoked' : 'expired'),
    }));
}

async function createDemoCredential(db, { label = '', expiresAt = null, createdBy = null, metadata = {} } = {}) {
    const { DemoCredential } = getDemoModels(db);
    const email = generateCredentialEmail();
    const password = generateCredentialPassword();
    const doc = await DemoCredential.create({
        email,
        passwordHash: await bcrypt.hash(password, 12),
        label: String(label || '').trim(),
        createdBy,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        metadata,
    });
    return {
        id: doc._id.toString(),
        email: doc.email,
        password,
        label: doc.label,
        expiresAt: doc.expiresAt,
        createdAt: doc.createdAt,
    };
}

async function updateDemoCredential(db, credentialId, updates = {}) {
    const { DemoCredential } = getDemoModels(db);
    const doc = await DemoCredential.findById(credentialId);
    if (!doc) {
        const err = new Error('Credential not found');
        err.code = 'NOT_FOUND';
        throw err;
    }

    if (updates.label !== undefined) doc.label = String(updates.label || '').trim();
    if (updates.revoke === true) doc.revokedAt = new Date();
    if (updates.expiresAt !== undefined) {
        doc.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
    }
    await doc.save();

    return {
        id: doc._id.toString(),
        email: doc.email,
        label: doc.label,
        expiresAt: doc.expiresAt,
        revokedAt: doc.revokedAt,
        lastLoginAt: doc.lastLoginAt,
        loginCount: doc.loginCount || 0,
        status: credentialIsActive(doc) ? 'active' : (doc.revokedAt ? 'revoked' : 'expired'),
    };
}

async function expireDemoCredentials(db, { now = new Date() } = {}) {
    const { DemoCredential } = getDemoModels(db);
    const expiredAt = now instanceof Date ? now : new Date(now);
    const result = await DemoCredential.updateMany(
        {
            expiresAt: { $lte: expiredAt },
            revokedAt: null,
        },
        {
            $set: {
                revokedAt: expiredAt,
                'metadata.expiredByCron': true,
            },
        }
    );
    return {
        expiredCount: result.modifiedCount || 0,
        ranAt: expiredAt.toISOString(),
    };
}

async function getDemoCredentialAnalytics(db) {
    const { DemoCredential } = getDemoModels(db);
    const { AnalyticsEvent } = getModels({ db }, 'AnalyticsEvent');
    const rows = await DemoCredential.find({}).lean();
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const active = rows.filter((row) => credentialIsActive(row));
    const logins7d = rows.filter((row) => row.lastLoginAt && new Date(row.lastLoginAt) >= sevenDaysAgo).length;
    const logins30d = rows.filter((row) => row.lastLoginAt && new Date(row.lastLoginAt) >= thirtyDaysAgo).length;
    const totalLogins = rows.reduce((sum, row) => sum + (row.loginCount || 0), 0);
    const usedCredentials = rows.filter((row) => (row.loginCount || 0) > 0).length;

    const demoEventMatch = {
        ts: { $gte: thirtyDaysAgo },
        event: { $in: ['demo_phase_view', 'demo_tab_view', 'demo_session_end', 'demo_login_success', 'demo_login_failure'] },
    };

    const phaseAgg = await AnalyticsEvent.aggregate([
        { $match: { ...demoEventMatch, event: 'demo_phase_view' } },
        { $group: { _id: '$properties.phase', count: { $sum: 1 } } },
    ]);
    const phaseDistribution = phaseAgg.reduce((acc, row) => {
        if (row._id) acc[row._id] = row.count;
        return acc;
    }, {});

    const sessionEndAgg = await AnalyticsEvent.aggregate([
        { $match: { ...demoEventMatch, event: 'demo_session_end', 'properties.durationMs': { $type: 'number' } } },
        { $group: { _id: null, avgDurationMs: { $avg: '$properties.durationMs' }, count: { $sum: 1 } } },
    ]);
    const avgSessionDurationMs = sessionEndAgg[0]?.avgDurationMs
        ? Math.round(sessionEndAgg[0].avgDurationMs)
        : null;
    const sessionEndCount = sessionEndAgg[0]?.count || 0;

    const loginFailures30d = await AnalyticsEvent.countDocuments({
        ...demoEventMatch,
        event: 'demo_login_failure',
    });

    return {
        totalCredentials: rows.length,
        activeCredentials: active.length,
        revokedCredentials: rows.filter((row) => row.revokedAt).length,
        credentialsUsedAtLeastOnce: usedCredentials,
        totalLogins,
        loginsLast7Days: logins7d,
        loginsLast30Days: logins30d,
        loginFailuresLast30Days: loginFailures30d,
        phaseDistribution,
        avgSessionDurationMs,
        sessionEndCount,
    };
}

async function getDemoCredentialJourney(db, credentialId, { limit = 120 } = {}) {
    const { DemoCredential } = getDemoModels(db);
    const { AnalyticsEvent } = getModels({ db }, 'AnalyticsEvent');
    const credential = await DemoCredential.findById(credentialId).lean();
    if (!credential) {
        const err = new Error('Credential not found');
        err.code = 'NOT_FOUND';
        throw err;
    }

    const credentialKey = credential._id.toString();
    const demoUserId = `demo:${credentialKey}`;
    const cap = Math.min(Math.max(parseInt(limit, 10) || 120, 1), 500);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const events = await AnalyticsEvent.find({
        ts: { $gte: thirtyDaysAgo },
        $or: [
            { user_id: demoUserId },
            { 'properties.credentialId': credentialKey },
        ],
        event: { $regex: /^demo_/ },
    })
        .sort({ ts: -1 })
        .limit(cap)
        .select('event ts properties session_id')
        .lean();

    const sessions = new Set(events.map((row) => row.session_id).filter(Boolean));

    return {
        credential: {
            id: credentialKey,
            email: credential.email,
            label: credential.label || '',
            status: credentialIsActive(credential) ? 'active' : (credential.revokedAt ? 'revoked' : 'expired'),
        },
        summary: {
            eventCount: events.length,
            sessionCount: sessions.size,
            lastEventAt: events[0]?.ts || null,
        },
        events: events.map((row) => ({
            event: row.event,
            ts: row.ts,
            sessionId: row.session_id,
            properties: row.properties || {},
        })),
    };
}

module.exports = {
    DEMO_ACCESS_COOKIE,
    loginDemoCredential,
    getDemoSessionUser,
    listDemoCredentials,
    createDemoCredential,
    updateDemoCredential,
    getDemoCredentialAnalytics,
    getDemoCredentialJourney,
    expireDemoCredentials,
    clearDemoAccessCookie,
    getDemoAccessTokenFromRequest,
    credentialIsActive,
};
