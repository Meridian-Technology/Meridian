/**
 * Helpers for global identity: get-or-create GlobalUser, TenantMembership, and issue tokens.
 * Used by auth routes and SAML.
 */
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');
const { createGlobalSession } = require('../utilities/sessionUtils');
const { getCookieDomain } = require('../utilities/cookieUtils');

const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '30d';
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000;

/**
 * Build GlobalUser document from tenant user or OAuth profile.
 * @param {object} source - { email, name?, picture?, googleId?, appleId?, samlId?, samlProvider? }
 */
function globalUserFromSource(source) {
    const doc = {
        email: (source.email || '').trim().toLowerCase(),
        name: source.name || '',
        picture: source.picture || '',
    };
    if (source.googleId) doc.googleId = source.googleId;
    if (source.appleId) doc.appleId = source.appleId;
    if (source.samlId) doc.samlId = source.samlId;
    if (source.samlProvider) doc.samlProvider = source.samlProvider;
    return doc;
}

/**
 * Get or create GlobalUser by email and optional provider ids.
 * @param {object} req - request with req.globalDb
 * @param {object} source - tenant user (with _id) or profile with email, name, picture, googleId, appleId, samlId, samlProvider
 * @returns {Promise<{GlobalUser}>}
 */
async function getOrCreateGlobalUser(req, source) {
    const { GlobalUser } = getGlobalModels(req, 'GlobalUser');
    const email = (source.email || '').trim().toLowerCase();
    if (!email) throw new Error('Email is required for GlobalUser');

    let globalUser = await GlobalUser.findOne({ email });
    if (globalUser) {
        const updates = {};
        if (source.name != null) updates.name = source.name;
        if (source.picture != null) updates.picture = source.picture;
        if (source.googleId != null) updates.googleId = source.googleId;
        if (source.appleId != null) updates.appleId = source.appleId;
        if (source.samlId != null) updates.samlId = source.samlId;
        if (source.samlProvider != null) updates.samlProvider = source.samlProvider;
        if (Object.keys(updates).length) {
            Object.assign(globalUser, updates);
            await globalUser.save();
        }
        return globalUser;
    }

    const providerQuery = { $or: [{ email }] };
    if (source.googleId) providerQuery.$or.push({ googleId: source.googleId });
    if (source.appleId) providerQuery.$or.push({ appleId: source.appleId });
    if (source.samlId && source.samlProvider) providerQuery.$or.push({ samlId: source.samlId, samlProvider: source.samlProvider });
    globalUser = await GlobalUser.findOne(providerQuery);
    if (globalUser) {
        const updates = {};
        if (source.name != null) updates.name = source.name;
        if (source.picture != null) updates.picture = source.picture;
        if (source.email && !globalUser.email) updates.email = email;
        if (source.googleId != null) updates.googleId = source.googleId;
        if (source.appleId != null) updates.appleId = source.appleId;
        if (source.samlId != null) updates.samlId = source.samlId;
        if (source.samlProvider != null) updates.samlProvider = source.samlProvider;
        if (Object.keys(updates).length) {
            Object.assign(globalUser, updates);
            await globalUser.save();
        }
        return globalUser;
    }

    globalUser = new GlobalUser(globalUserFromSource(source));
    await globalUser.save();
    return globalUser;
}

/**
 * Get or create TenantMembership for (globalUserId, req.school).
 * @param {object} req - request with req.globalDb, req.school
 * @param {object} globalUserId - ObjectId
 * @param {object} tenantUser - tenant User document with _id
 * @returns {Promise<{TenantMembership}>}
 */
async function getOrCreateTenantMembership(req, globalUserId, tenantUser) {
    const { TenantMembership } = getGlobalModels(req, 'TenantMembership');
    const tenantKey = req.school;
    let membership = await TenantMembership.findOne({ globalUserId, tenantKey, status: 'active' });
    if (membership) {
        if (membership.tenantUserId.toString() !== tenantUser._id.toString()) {
            membership.tenantUserId = tenantUser._id;
            await membership.save();
        }
        return membership;
    }
    membership = new TenantMembership({
        globalUserId,
        tenantKey,
        tenantUserId: tenantUser._id,
        status: 'active',
    });
    await membership.save();
    return membership;
}

/**
 * Get platform roles for a global user.
 */
async function getPlatformRolesForGlobalUser(req, globalUserId) {
    const { PlatformRole } = getGlobalModels(req, 'PlatformRole');
    const pr = await PlatformRole.findOne({ globalUserId });
    return (pr && pr.roles) ? [...pr.roles] : [];
}

/**
 * Resolve tenant user for current request school from global user.
 */
async function resolveTenantUserForRequest(req, globalUserId) {
    const { TenantMembership } = getGlobalModels(req, 'TenantMembership');
    const membership = await TenantMembership.findOne({ globalUserId, tenantKey: req.school, status: 'active' });
    if (!membership) return { tenantUserId: null, tenantUser: null };
    const { User } = getModels(req, 'User');
    const tenantUser = await User.findById(membership.tenantUserId).lean();
    return { tenantUserId: membership.tenantUserId, tenantUser };
}

/**
 * Issue access + refresh tokens and set cookies.
 * Uses global Session and JWT payload: globalUserId, tenantUserId?, platformRoles?, roles?.
 */
async function issueTokens(req, res, globalUser, tenantUser, platformRoles = [], options = {}) {
    const roles = tenantUser && tenantUser.roles ? tenantUser.roles : ['user'];
    const tenantUserId = tenantUser ? tenantUser._id : null;
    const mfaConfigured = Boolean(options.mfaConfigured);
    const mfaVerified = Boolean(options.mfaVerified);

    const refreshToken = jwt.sign(
        { globalUserId: globalUser._id, type: 'refresh', mfaConfigured, mfaVerified, jti: randomUUID() },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    await createGlobalSession(globalUser._id, refreshToken, req);

    const accessToken = jwt.sign(
        {
            globalUserId: globalUser._id,
            tenantUserId,
            platformRoles: platformRoles.length ? platformRoles : undefined,
            roles,
            mfaConfigured,
            mfaVerified,
        },
        process.env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
    };
    const domain = getCookieDomain(req);
    if (domain) cookieOptions.domain = domain;

    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: ACCESS_TOKEN_EXPIRY_MS });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });

    return { accessToken, refreshToken, accessTokenExpiry: ACCESS_TOKEN_EXPIRY };
}

module.exports = {
    getOrCreateGlobalUser,
    getOrCreateTenantMembership,
    getPlatformRolesForGlobalUser,
    resolveTenantUserForRequest,
    issueTokens,
    globalUserFromSource,
    ACCESS_TOKEN_EXPIRY,
    REFRESH_TOKEN_EXPIRY,
    ACCESS_TOKEN_EXPIRY_MS,
    REFRESH_TOKEN_EXPIRY_MS,
};
