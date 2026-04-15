const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();
const { sendDiscordMessage } = require('../services/discordWebookService');
const { isProfane } = require('../services/profanityFilterService');

const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken.js');

const { authenticateWithGoogle, authenticateWithApple, loginUser, registerUser, authenticateWithGoogleIdToken } = require('../services/userServices.js');
const { sendUserRegisteredEvent } = require('../inngest/events.js');
const getModels = require('../services/getModelService.js');
const getGlobalModels = require('../services/getGlobalModelService.js');
const { getFriendRequests } = require('../utilities/friendUtils');
const { createSession, validateSession, deleteSession, deleteAllUserSessions, getUserSessions, getUserSessionsForGlobalUser, deleteSessionById, deleteSessionByIdForGlobalUser, revokeAllOtherSessionsForGlobalUser } = require('../utilities/sessionUtils');
const { getCookieDomain } = require('../utilities/cookieUtils');
const authGlobalService = require('../services/authGlobalService');
const {
    isAdminLevelAccount,
    getMfaStatus,
    buildTokenMfaClaims,
    createPendingMfaToken,
    verifyPendingMfaToken,
    getMfaPendingCookieOptions,
    getPendingMfaTokenFromRequest,
    createTotpEnrollment,
    enableTotpEnrollment,
    verifyTotpForLogin,
    disableTotp,
    getPasskeySummary,
    generatePasskeyRegistration,
    verifyPasskeyRegistration,
    generatePasskeyAuthentication,
    verifyPasskeyAuthentication,
    removePasskey,
} = require('../services/adminMfaService');

const { getResend } = require('../services/resendClient');
const { render } = require('@react-email/render')
const React = require('react');
const ForgotEmail = require('../emails/ForgotEmail').default;

// Store verification codes temporarily (in production, use Redis or similar)
const verificationCodes = new Map();


const ACCESS_TOKEN_EXPIRY_MINUTES = 15;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
// Token configuration
const ACCESS_TOKEN_EXPIRY = `${ACCESS_TOKEN_EXPIRY_MINUTES}m`;
const REFRESH_TOKEN_EXPIRY = `${REFRESH_TOKEN_EXPIRY_DAYS}d`;  // 2 days
const ACCESS_TOKEN_EXPIRY_MS = ACCESS_TOKEN_EXPIRY_MINUTES * 60 * 1000;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // 2 days in milliseconds
const ADMIN_MFA_PENDING_COOKIE = 'adminMfaPending';

// Check if request is from mobile client (token-based auth instead of cookies)
const isMobileClient = (req) => req.headers['x-client'] === 'mobile';

function setPendingMfaCookie(req, res, pendingToken) {
    res.cookie(ADMIN_MFA_PENDING_COOKIE, pendingToken, getMfaPendingCookieOptions(req));
}

function clearPendingMfaCookie(req, res) {
    const clearOpts = { ...getMfaPendingCookieOptions(req) };
    delete clearOpts.maxAge;
    res.clearCookie(ADMIN_MFA_PENDING_COOKIE, clearOpts);
}

async function getCurrentTenantAdminUser(req) {
    if (!req.user || !req.user.userId) {
        throw new Error('A tenant admin account is required for MFA management');
    }
    const { User } = getModels(req, 'User');
    const user = await User.findById(req.user.userId);
    if (!user) {
        throw new Error('User not found');
    }
    if (!isAdminLevelAccount(user, req.user.platformRoles || [])) {
        throw new Error('Admin access required');
    }
    return user;
}

async function completeLoginWithAdminMfa(req, res, globalUser, tenantUser, platformRoles, message) {
    if (tenantUser?.accessSuspended) {
        return {
            status: 403,
            body: {
                success: false,
                message: 'This account has been suspended.',
                code: 'ACCOUNT_SUSPENDED',
            },
        };
    }
    const isAdmin = isAdminLevelAccount(tenantUser, platformRoles);
    const mfaStatus = getMfaStatus(tenantUser);

    if (isAdmin && mfaStatus.configured) {
        const pendingToken = createPendingMfaToken({
            globalUserId: globalUser._id.toString(),
            tenantUserId: tenantUser?._id?.toString() || null,
            school: req.school,
            platformRoles: platformRoles || [],
        });
        setPendingMfaCookie(req, res, pendingToken);
        const data = {
            requiresMfa: true,
            methods: mfaStatus.methods,
            school: req.school,
        };
        if (isMobileClient(req)) data.mfaToken = pendingToken;
        return {
            status: 200,
            body: {
                success: true,
                message: 'Additional verification required for admin account',
                data,
            },
        };
    }

    const tokenMfaClaims = buildTokenMfaClaims({
        isAdminLevel: isAdmin,
        mfaConfigured: mfaStatus.configured,
        mfaVerified: !isAdmin,
    });
    const tokens = await authGlobalService.issueTokens(req, res, globalUser, tenantUser, platformRoles, tokenMfaClaims);
    clearPendingMfaCookie(req, res);

    const responseData = {
        user: tenantUser,
        adminMfaSetupRequired: isAdmin && !mfaStatus.configured,
    };
    if (isMobileClient(req)) {
        responseData.accessToken = tokens.accessToken;
        responseData.refreshToken = tokens.refreshToken;
    }

    return {
        status: 200,
        body: {
            success: true,
            message,
            data: responseData,
        },
    };
}

function validateUsername(username) { //keeping logic external, for easier testing
    // Define the regex pattern
    const regex = /^[a-zA-Z0-9]{3,20}$/;
  
    // Test the username against the regex pattern
    return regex.test(username);
}

// Registration endpoint
router.post('/register', async (req, res) => {
    // When on www, require school in body so we use the correct tenant DB (landing is www-only; app is tenant-only)
    if (req.school === 'www') {
        const school = (req.body && req.body.school) ? String(req.body.school).trim().toLowerCase() : null;
        if (!school) {
            return res.status(400).json({ success: false, message: 'Please select your school or use your school’s login page (e.g. rpi.meridian.study).', code: 'SCHOOL_REQUIRED' });
        }
        req.school = school;
        req.db = await require('../connectionsManager').connectToDatabase(school);
    }

    // Extract user details from request body
    const { username, email, password, invite_token: bodyInviteToken } = req.body;
    const inviteToken = bodyInviteToken || req.cookies?.org_invite_token;

    try {
        const { User, OrgInvite, OrgMember } = getModels(req, 'User', 'OrgInvite', 'OrgMember');

        if (inviteToken) {
            const invite = await OrgInvite.findOne({ token: inviteToken, status: 'pending' });
            if (invite && new Date() <= invite.expires_at) {
                const inviteEmail = invite.email?.toLowerCase();
                const regEmail = String(email).trim().toLowerCase();
                if (inviteEmail !== regEmail) {
                    return res.status(400).json({
                        success: false,
                        message: 'Please register with the same email address the invitation was sent to.',
                        code: 'INVITE_EMAIL_MISMATCH'
                    });
                }
            }
        }

        if (!validateUsername(username)) {
            console.log(`POST: /register registration of ${username} failed`);
            return res.status(405).json({
                success: false,
                message: 'Username has illegal chars'
            });
        }
        if(isProfane(username)){
            console.log(`POST: /register registration of ${username} failed`);
            return res.status(405).json({
                success: false,
                message: 'Username does not abide by community standards'
            });
        }

        const existingUsername = await User.findOne({ username });
        const existingEmail = await User.findOne({ email });

        if (existingUsername || existingEmail) {
            const message = existingUsername && existingEmail ? 'Email and username are taken'
                : existingEmail ? 'Email is taken'
                    : 'Username is taken';
            return res.status(400).json({ success: false, message });
        }

        // condition ? if true : if false;

        // Create and save the new user
        const user = new User({
            username: username, email: email, password: password,
        });
        await user.save();

        const { runAutoClaimAsync } = require('../services/autoClaimEventRegistrationsService');
        runAutoClaimAsync(req, user._id.toString(), user.email);

        // Process org invite if present
        if (inviteToken) {
            const invite = await OrgInvite.findOne({ token: inviteToken, status: 'pending' });
            if (invite && new Date() <= invite.expires_at) {
                const inviteEmail = invite.email?.toLowerCase();
                const userEmail = user.email?.toLowerCase();
                if (inviteEmail === userEmail) {
                    const existingMember = await OrgMember.findOne({ org_id: invite.org_id, user_id: user._id });
                    if (!existingMember) {
                        const member = new OrgMember({
                            org_id: invite.org_id,
                            user_id: user._id,
                            role: invite.role,
                            status: 'active',
                            assignedBy: invite.invited_by
                        });
                        await member.save();
                        if (!user.clubAssociations) user.clubAssociations = [];
                        if (!user.clubAssociations.some(c => c.toString() === invite.org_id)) {
                            user.clubAssociations.push(invite.org_id);
                            await user.save();
                        }
                        invite.status = 'accepted';
                        invite.user_id = user._id;
                        await invite.save();
                        const { checkAndAutoApproveOrg } = require('../services/orgApprovalService');
                        await checkAndAutoApproveOrg(req, invite.org_id);
                    }
                }
                res.clearCookie('org_invite_token', { path: '/' });
            }
        }

        const globalUser = await authGlobalService.getOrCreateGlobalUser(req, user);
        await authGlobalService.getOrCreateTenantMembership(req, globalUser._id, user);
        const platformRoles = await authGlobalService.getPlatformRolesForGlobalUser(req, globalUser._id);
        const tokenMfaClaims = buildTokenMfaClaims({
            isAdminLevel: false,
            mfaConfigured: false,
            mfaVerified: true,
        });
        const tokens = await authGlobalService.issueTokens(req, res, globalUser, user, platformRoles, tokenMfaClaims);

        console.log(`POST: /register new user ${username}`);
        sendDiscordMessage(`New user registered`, `user ${username} registered`, "newUser");

        const responseData = { user: user };
        if (isMobileClient(req)) {
            responseData.accessToken = tokens.accessToken;
            responseData.refreshToken = tokens.refreshToken;
        }
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: responseData
        });
    } catch (error) {
        console.log(`POST: /register registration of ${username} failed`)
        console.log(error)
        res.status(500).json({
            success: false,
            message: 'Error registering new user'
        });
    }
});

// console.log(`POST: /register registration of ${username} failed`)
// res.status(405).json({
//     success: false,
//     message: 'Username has illegal chars'
// });

// Login endpoint
router.post('/login', async (req, res) => {
    if (req.school === 'www') {
        const school = (req.body && req.body.school) ? String(req.body.school).trim().toLowerCase() : null;
        if (!school) {
            return res.status(400).json({ success: false, message: 'Please select your school or use your school’s login page (e.g. rpi.meridian.study).', code: 'SCHOOL_REQUIRED' });
        }
        req.school = school;
        req.db = await require('../connectionsManager').connectToDatabase(school);
    }

    const { email, password } = req.body;

    try {
        //check if it is an email or username, case insensitive for email
        const { user } = await loginUser({ email, password, req });

        const globalUser = await authGlobalService.getOrCreateGlobalUser(req, user);
        await authGlobalService.getOrCreateTenantMembership(req, globalUser._id, user);
        const platformRoles = await authGlobalService.getPlatformRolesForGlobalUser(req, globalUser._id);
        const loginResult = await completeLoginWithAdminMfa(req, res, globalUser, user, platformRoles, 'Logged in successfully');
        console.log(`POST: /login user ${user.username} logged in`);
        res.status(loginResult.status).json(loginResult.body);
    } catch (error) {
        console.log(`POST: /login login user failed`)
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Refresh token endpoint
router.post('/refresh-token', async (req, res) => {
    // Accept refresh token from cookie (web) or header (mobile)
    let refreshToken = req.cookies.refreshToken;
    if (!refreshToken && req.headers['x-client'] === 'mobile') {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            refreshToken = authHeader.substring(7);
        } else if (req.headers['x-refresh-token']) {
            refreshToken = req.headers['x-refresh-token'];
        }
    }
    
    if (!refreshToken) {
        console.log('POST: /refresh-token 403 no refresh token provided');
        return res.status(403).json({
            success: false,
            message: 'No refresh token provided'
        });
    }

    try {
        // Validate session using session utilities (supports both global and legacy tokens)
        const validation = await validateSession(refreshToken, req);

        if (!validation.valid) {
            console.log('POST: /refresh-token 401', validation.error);
            return res.status(401).json({
                success: false,
                message: validation.error || 'Invalid refresh token'
            });
        }

        const { user, globalUser } = validation;
        const isMobile = isMobileClient(req);

        if (user?.accessSuspended) {
            return res.status(403).json({
                success: false,
                message: 'This account has been suspended.',
                code: 'ACCOUNT_SUSPENDED',
            });
        }

        if (globalUser) {
            const platformRoles = await authGlobalService.getPlatformRolesForGlobalUser(req, globalUser._id);
            const tokens = await authGlobalService.issueTokens(
                req,
                res,
                globalUser,
                user,
                platformRoles,
                {
                    mfaConfigured: Boolean(validation.decoded?.mfaConfigured),
                    mfaVerified: Boolean(validation.decoded?.mfaVerified),
                },
            );
            const response = { success: true, message: 'Token refreshed successfully' };
            if (isMobile) response.accessToken = tokens.accessToken;
            return res.json(response);
        }

        const newAccessToken = jwt.sign(
            { userId: user._id, roles: user.roles },
            process.env.JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: ACCESS_TOKEN_EXPIRY_MS,
            path: '/'
        };
        const domain = getCookieDomain(req);
        if (domain) cookieOptions.domain = domain;
        if (!isMobile) {
            res.cookie('accessToken', newAccessToken, cookieOptions);
        }

        console.log(`POST: /refresh-token user ${user.username}`);
        const response = { success: true, message: 'Token refreshed successfully' };
        if (isMobile) response.accessToken = newAccessToken;
        res.json(response);
    } catch (error) {
        console.log('POST: /refresh-token 401 refresh token failed', error.message);
        
        // Check if it's a token expiration error
        if (error.name === 'TokenExpiredError') {
            console.log('⏰ Refresh token expired');
            return res.status(401).json({
                success: false,
                message: 'Refresh token expired',
                code: 'REFRESH_TOKEN_EXPIRED'
            });
        }
        
        // Check if it's an invalid token error
        if (error.name === 'JsonWebTokenError') {
            console.log('POST: /refresh-token 401 invalid refresh token');
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }
        
        console.log('POST: /refresh-token 401 refresh token failed', error.message);
        res.status(401).json({
            success: false,
            message: 'Invalid refresh token',
            code: 'REFRESH_FAILED'
        });
    }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
    let refreshToken = req.cookies.refreshToken;
    if (!refreshToken && req.headers['x-client'] === 'mobile') {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            refreshToken = authHeader.substring(7);
        } else if (req.headers['x-refresh-token']) {
            refreshToken = req.headers['x-refresh-token'];
        }
    }
    
    if (refreshToken) {
        try {
            // Delete the specific session instead of clearing user's refreshToken
            await deleteSession(refreshToken, req);
        } catch (error) {
            console.log('Error deleting session:', error);
        }
    }

    // Clear both cookies (no-op for mobile, but harmless)
    const clearOpts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
    };
    const domain = getCookieDomain(req);
    if (domain) clearOpts.domain = domain;
    res.clearCookie('accessToken', clearOpts);
    res.clearCookie('refreshToken', clearOpts);
    res.clearCookie(ADMIN_MFA_PENDING_COOKIE, clearOpts);

    console.log(`POST: /logout user logged out`);
    res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/validate-token', verifyToken, async (req, res) => {
    try {
        // On www we only return communities (no tenant DB); frontend uses this to redirect to tenant.
        if (req.school === 'www') {
            if (!req.user || !req.user.globalUserId) {
                return res.json({ success: true, message: 'Token is valid', data: { user: null, communities: [] } });
            }
            const { TenantMembership } = getGlobalModels(req, 'TenantMembership');
            const memberships = await TenantMembership.find({ globalUserId: req.user.globalUserId, status: 'active' }).lean();
            const communities = memberships.map(m => m.tenantKey);
            return res.json({ success: true, message: 'Token is valid', data: { user: null, communities } });
        }

        const { User, Friendship } = getModels(req, 'User', 'Friendship');
        const orgInviteService = require('../services/orgInviteService');

        const user = await User.findById(req.user.userId)
            .select('-password -refreshToken') // Add fields you want to exclude
            .lean()
            .populate('clubAssociations'); 
            
        if (!user) {
            if (req.user.globalUserId) {
                const { TenantMembership } = getGlobalModels(req, 'TenantMembership');
                const memberships = await TenantMembership.find({ globalUserId: req.user.globalUserId, status: 'active' }).lean();
                const communities = memberships.map(m => m.tenantKey);
                return res.json({
                    success: true,
                    message: 'Token is valid',
                    data: { user: null, communities }
                });
            }
            console.log(`GET: /validate-token token is invalid`);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Fetch friend requests (both sent and received) using utility
        const friendRequests = await getFriendRequests(Friendship, req.user.userId, {
            receivedFields: 'username name picture _id',
            sentFields: 'username name picture _id',
            lean: true
        });

        // Fetch pending org invites for this user
        const pendingOrgInvites = await orgInviteService.getPendingForUser(req);

        // Domains where this user is an active member of a stakeholder role (domain dashboard entry points)
        try {
            const { StakeholderRole, Domain } = getModels(req, 'StakeholderRole', 'Domain');
            const roles = await StakeholderRole.find({
                members: {
                    $elemMatch: {
                        userId: user._id,
                        isActive: { $ne: false }
                    }
                },
                isActive: true
            })
                .select('domainId')
                .lean();

            const rawDomainIds = [...new Set((roles || []).map((r) => r.domainId).filter(Boolean))];
            const domainDocs =
                rawDomainIds.length > 0
                    ? await Domain.find({ _id: { $in: rawDomainIds }, isActive: true }).select('name').lean()
                    : [];
            const nameById = new Map(domainDocs.map((d) => [String(d._id), d.name]));

            user.stakeholderDomainDashboards = rawDomainIds.map((id) => ({
                domainId: String(id),
                domainName: nameById.get(String(id)) || null
            }));
        } catch (e) {
            console.warn('validate-token: stakeholder domain dashboards skipped', e?.message || e);
            user.stakeholderDomainDashboards = [];
        }

        console.log(`GET: /validate-token token is valid for user ${user.username}`)
        const data = {
            user: user,
            friendRequests: friendRequests,
            pendingOrgInvites: pendingOrgInvites
        };
        if (req.user.globalUserId) {
            const { TenantMembership } = getGlobalModels(req, 'TenantMembership');
            const memberships = await TenantMembership.find({ globalUserId: req.user.globalUserId, status: 'active' }).lean();
            data.communities = memberships.map(m => m.tenantKey);
        }
        res.json({
            success: true,
            message: 'Token is valid',
            data
        });
    } catch (error) {
        console.log(`GET: /validate-token token is invalid`, error)
        res.status(500).json({
            success: false,
            message: 'Error fetching user details',
            error: error.message
        });
    }
});

/**
 * POST /join-tenant – create tenant user + membership for current school (global user with no local account).
 * Requires global identity (logged in with new JWT shape). Body empty; tenant from req.school.
 */
router.post('/join-tenant', verifyToken, async (req, res) => {
    try {
        if (!req.user.globalUserId) {
            return res.status(400).json({
                success: false,
                message: 'Global identity required. Log in again to get a full account.'
            });
        }
        const { TenantMembership, GlobalUser } = getGlobalModels(req, 'TenantMembership', 'GlobalUser');
        const existing = await TenantMembership.findOne({ globalUserId: req.user.globalUserId, tenantKey: req.school, status: 'active' });
        if (existing) {
            const { User } = getModels(req, 'User');
            const user = await User.findById(existing.tenantUserId).lean();
            return res.json({
                success: true,
                message: 'Already a member',
                data: { user, alreadyMember: true }
            });
        }
        const globalUser = await GlobalUser.findById(req.user.globalUserId);
        if (!globalUser) {
            return res.status(400).json({ success: false, message: 'Global user not found.' });
        }
        const { User } = getModels(req, 'User');
        const email = globalUser.email.toLowerCase();
        let tenantUser = await User.findOne({ email });
        if (!tenantUser) {
            const base = email.split('@')[0].replace(/\W/g, '');
            let username = base + '_' + req.school;
            let exists = await User.findOne({ username });
            let suffix = 0;
            while (exists) {
                username = base + '_' + req.school + '_' + (suffix++);
                exists = await User.findOne({ username });
            }
            tenantUser = new User({
                email,
                name: globalUser.name,
                picture: globalUser.picture,
                googleId: globalUser.googleId,
                appleId: globalUser.appleId,
                samlId: globalUser.samlId,
                samlProvider: globalUser.samlProvider,
                username,
                roles: ['user'],
                clubAssociations: []
            });
            await tenantUser.save();
        }
        const membership = new TenantMembership({
            globalUserId: globalUser._id,
            tenantKey: req.school,
            tenantUserId: tenantUser._id,
            status: 'active'
        });
        await membership.save();
        const platformRoles = await authGlobalService.getPlatformRolesForGlobalUser(req, globalUser._id);
        const mfaStatus = getMfaStatus(tenantUser);
        const tokenMfaClaims = buildTokenMfaClaims({
            isAdminLevel: isAdminLevelAccount(tenantUser, platformRoles),
            mfaConfigured: mfaStatus.configured,
            mfaVerified: false,
        });
        await authGlobalService.issueTokens(req, res, globalUser, tenantUser, platformRoles, tokenMfaClaims);
        const userObj = tenantUser.toObject ? tenantUser.toObject() : tenantUser;
        res.json({
            success: true,
            message: 'Joined tenant',
            data: { user: userObj }
        });
    } catch (error) {
        console.error('POST /join-tenant failed', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/verify-email', async (req, res) => {
    const { email } = req.body;
    const apiKey = process.env.HUNTER_API; // Replace with your actual API key
    
    if(process.env.NODE_ENV === 'development'){
        return res.status(200).json({success:true});
    }

    try {
      const response = await axios(`https://api.hunter.io/v2/email-verifier?email=${email}&api_key=${apiKey}`);
      res.json(response.data);
    } catch (error) {
      res.status(500).json({ error: 'Error verifying email' });
    }
  });

router.post('/google-login', async (req, res) => {
    if (req.school === 'www') {
        const school = (req.body && req.body.school) ? String(req.body.school).trim().toLowerCase() : null;
        if (!school) {
            return res.status(400).json({ success: false, message: 'Please select your school or use your school’s login page.', code: 'SCHOOL_REQUIRED' });
        }
        req.school = school;
        req.db = await require('../connectionsManager').connectToDatabase(school);
    }

    const { code, codeVerifier, isRegister, url, idToken } = req.body;

    // Handle two different flows:
    // 1. ID Token flow (native SDKs) - no PKCE needed
    // 2. Authorization code flow (expo-auth-session) - requires PKCE
    
    if (!code && !idToken) {
        return res.status(400).json({
            success: false,
            message: 'No authorization code or ID token provided'
        });
    }

    try {
        let user;
        
        // Use ID token flow if idToken is provided (native SDKs)
        if (idToken) {
            console.log('Using Google ID token authentication flow');
            const result = await authenticateWithGoogleIdToken(idToken, url, req);
            user = result.user;
        } else {
            // Use authorization code flow (expo-auth-session with PKCE)
            console.log('Using Google authorization code authentication flow');
            const result = await authenticateWithGoogle(code, isRegister, url, req, codeVerifier);
            user = result.user;
        }
        
        const globalUser = await authGlobalService.getOrCreateGlobalUser(req, user);
        await authGlobalService.getOrCreateTenantMembership(req, globalUser._id, user);
        const platformRoles = await authGlobalService.getPlatformRolesForGlobalUser(req, globalUser._id);
        const loginResult = await completeLoginWithAdminMfa(req, res, globalUser, user, platformRoles, 'Google login successful');
        res.status(loginResult.status).json(loginResult.body);

    } catch (error) {
        if (error.message === 'Email already exists') {
            return res.status(409).json({
                success: false,
                message: 'Email already exists'
            });
        }
        console.log('Google login failed:', error);
        res.status(500).json({
            success: false,
            message: `Google login failed, error: ${error.message}`
        });
    }
});

router.post('/apple-login', async (req, res) => {
    if (req.school === 'www') {
        const school = (req.body && req.body.school) ? String(req.body.school).trim().toLowerCase() : null;
        if (!school) {
            return res.status(400).json({ success: false, message: 'Please select your school or use your school’s login page.', code: 'SCHOOL_REQUIRED' });
        }
        req.school = school;
        req.db = await require('../connectionsManager').connectToDatabase(school);
    }

    const { idToken, user } = req.body;

    if (!idToken) {
        return res.status(400).json({
            success: false,
            message: 'No ID token provided'
        });
    }

    try {
        const { user: authenticatedUser } = await authenticateWithApple(idToken, user, req);

        const globalUser = await authGlobalService.getOrCreateGlobalUser(req, authenticatedUser);
        await authGlobalService.getOrCreateTenantMembership(req, globalUser._id, authenticatedUser);
        const platformRoles = await authGlobalService.getPlatformRolesForGlobalUser(req, globalUser._id);
        const loginResult = await completeLoginWithAdminMfa(req, res, globalUser, authenticatedUser, platformRoles, 'Apple login successful');
        res.status(loginResult.status).json(loginResult.body);

    } catch (error) {
        if (error.message === 'Email already exists') {
            return res.status(409).json({
                success: false,
                message: 'Email already exists'
            });
        }
        console.log('Apple login failed:', error);
        res.status(500).json({
            success: false,
            message: `Apple login failed, error: ${error.message}`
        });
    }
});

// Apple Sign In callback endpoint (handles POST from Apple)
router.post('/auth/apple/callback', async (req, res) => {
    const idToken = req.body.id_token || req.body.idToken;
    const user = req.body.user; // JSON string with user info
    const state = req.body.state; // Contains redirect destination
    
    if (!idToken) {
        const frontendUrl = process.env.NODE_ENV === 'production' 
            ? 'https://meridian.study'
            : 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=no_token`);
    }

    try {
        // Parse user info if provided
        let userInfo = null;
        if (user) {
            try {
                userInfo = typeof user === 'string' ? JSON.parse(decodeURIComponent(user)) : user;
            } catch (e) {
                console.error('Failed to parse user info:', e);
            }
        }

        const { user: authenticatedUser } = await authenticateWithApple(idToken, userInfo, req);

        const globalUser = await authGlobalService.getOrCreateGlobalUser(req, authenticatedUser);
        await authGlobalService.getOrCreateTenantMembership(req, globalUser._id, authenticatedUser);
        const platformRoles = await authGlobalService.getPlatformRolesForGlobalUser(req, globalUser._id);
        const loginResult = await completeLoginWithAdminMfa(req, res, globalUser, authenticatedUser, platformRoles, 'Apple login successful');

        // Determine redirect destination
        const frontendUrl = process.env.NODE_ENV === 'production' 
            ? 'https://meridian.study'
            : 'http://localhost:3000';
        
        let redirectTo = '/events-dashboard';
        
        // Parse state if provided
        if (state) {
            try {
                const stateData = typeof state === 'string' ? JSON.parse(decodeURIComponent(state)) : state;
                if (stateData && stateData.redirect) {
                    redirectTo = stateData.redirect;
                }
            } catch (e) {
                // If state is just a path, use it directly
                if (typeof state === 'string' && state.startsWith('/')) {
                    redirectTo = state;
                }
            }
        }
        
        // Redirect admin users to admin dashboard
        if (authenticatedUser.roles && authenticatedUser.roles.includes('admin')) {
            redirectTo = '/admin';
        }

        if (loginResult.body?.data?.requiresMfa) {
            redirectTo = '/login?mfa=required';
        }

        // Redirect to frontend
        res.redirect(`${frontendUrl}${redirectTo}`);

    } catch (error) {
        console.log('Apple callback failed:', error);
        const frontendUrl = process.env.NODE_ENV === 'production' 
            ? 'https://meridian.study'
            : 'http://localhost:3000';
        
        let errorMessage = 'Apple authentication failed';
        if (error.message === 'Email already exists') {
            errorMessage = 'email_exists';
        }
        
        res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(errorMessage)}`);
    }
});

// Forgot password endpoint
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const { User } = getModels(req, 'User');
        
        // Find user by email
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this email address'
            });
        }

        // Generate a 6-digit verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store the code with the user ID and an expiration time (30 minutes)
        verificationCodes.set(email, {
            code: verificationCode,
            userId: user._id,
            expiresAt: Date.now() + 30 * 60 * 1000 // 30 minutes
        });

        // Send email with verification code
        const emailHTML = await render(React.createElement(ForgotEmail, { 
            name: user.username, 
            code: verificationCode 
        }));

        const resend = getResend();
        if (!resend) {
            return res.status(503).json({ success: false, message: 'Email service not configured' });
        }
        const { data, error } = await resend.emails.send({
            from: "Meridian Support <support@meridian.study>",
            to: [email],
            subject: "Password Reset Code",
            html: emailHTML,
        });

        if (error) {
            console.log('POST: /forgot-password email sending error', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Error sending reset email', 
                error: error.message 
            });
        }

        console.log(`POST: /forgot-password verification code sent to ${email}`);
        res.status(200).json({ 
            success: true, 
            message: 'Password reset code sent successfully' 
        });
    } catch (error) {
        console.log(`POST: /forgot-password failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error processing password reset request',
            error: error.message
        });
    }
});

// Verify code endpoint
router.post('/verify-code', async (req, res) => {
    const { email, code } = req.body;

    try {
        // Check if the code exists and is valid
        const storedData = verificationCodes.get(email);
        
        if (!storedData) {
            return res.status(400).json({
                success: false,
                message: 'No verification code found for this email'
            });
        }
        
        if (storedData.code !== code) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }
        
        if (Date.now() > storedData.expiresAt) {
            verificationCodes.delete(email);
            return res.status(400).json({
                success: false,
                message: 'Verification code has expired. Please request a new one.'
            });
        }

        console.log(`POST: /verify-code code verified for ${email}`);
        res.status(200).json({
            success: true,
            message: 'Verification code is valid'
        });
    } catch (error) {
        console.log(`POST: /verify-code failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error verifying code',
            error: error.message
        });
    }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;

    try {
        // Check if the code exists and is valid
        const storedData = verificationCodes.get(email);
        
        if (!storedData) {
            return res.status(400).json({
                success: false,
                message: 'No verification code found for this email'
            });
        }
        
        if (storedData.code !== code) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }
        
        if (Date.now() > storedData.expiresAt) {
            verificationCodes.delete(email);
            return res.status(400).json({
                success: false,
                message: 'Verification code has expired. Please request a new one.'
            });
        }

        const { User } = getModels(req, 'User');
        
        // Find user by ID
        const user = await User.findById(storedData.userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        // Remove the used code
        verificationCodes.delete(email);

        console.log(`POST: /reset-password password reset for user ${user.username}`);
        res.status(200).json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        console.log(`POST: /reset-password failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error resetting password',
            error: error.message
        });
    }
});

async function resolvePendingMfaContext(req) {
    const pendingMfaToken = getPendingMfaTokenFromRequest(req);
    if (!pendingMfaToken) {
        throw new Error('No pending MFA challenge found');
    }
    const payload = verifyPendingMfaToken(pendingMfaToken);
    if (!payload || payload.school !== req.school) {
        throw new Error('Invalid MFA challenge for this tenant');
    }
    const { User } = getModels(req, 'User');
    const { GlobalUser } = getGlobalModels(req, 'GlobalUser');
    const tenantUser = await User.findById(payload.tenantUserId);
    if (!tenantUser) {
        throw new Error('Admin account no longer exists');
    }
    const globalUser = await GlobalUser.findById(payload.globalUserId);
    if (!globalUser) {
        throw new Error('Global identity no longer exists');
    }
    const platformRoles = Array.isArray(payload.platformRoles) ? payload.platformRoles : [];
    if (!isAdminLevelAccount(tenantUser, platformRoles)) {
        throw new Error('MFA challenge is not valid for this account');
    }
    return {
        pendingMfaToken,
        platformRoles,
        tenantUser,
        globalUser,
    };
}

router.get('/mfa/admin/status', verifyToken, async (req, res) => {
    try {
        const adminUser = await getCurrentTenantAdminUser(req);
        const status = getMfaStatus(adminUser);
        res.json({
            success: true,
            data: {
                ...status,
                passkeys: getPasskeySummary(adminUser),
            },
        });
    } catch (error) {
        const code = error.message === 'Admin access required' ? 403 : 400;
        res.status(code).json({ success: false, message: error.message });
    }
});

router.post('/mfa/admin/totp/setup', verifyToken, async (req, res) => {
    try {
        const adminUser = await getCurrentTenantAdminUser(req);
        const setup = await createTotpEnrollment(adminUser);
        res.json({
            success: true,
            message: 'Authenticator setup started',
            data: setup,
        });
    } catch (error) {
        const code = error.message === 'Admin access required' ? 403 : 400;
        res.status(code).json({ success: false, message: error.message });
    }
});

router.post('/mfa/admin/totp/enable', verifyToken, async (req, res) => {
    try {
        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({ success: false, message: 'Authenticator code is required' });
        }
        const adminUser = await getCurrentTenantAdminUser(req);
        await enableTotpEnrollment(adminUser, code);
        res.json({
            success: true,
            message: 'Authenticator app enabled for admin MFA',
            data: getMfaStatus(adminUser),
        });
    } catch (error) {
        const code = error.message === 'Admin access required' ? 403 : 400;
        res.status(code).json({ success: false, message: error.message });
    }
});

router.delete('/mfa/admin/totp', verifyToken, async (req, res) => {
    try {
        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({ success: false, message: 'Current authenticator code is required' });
        }
        const adminUser = await getCurrentTenantAdminUser(req);
        await disableTotp(adminUser, code);
        res.json({
            success: true,
            message: 'Authenticator app removed from admin MFA',
            data: getMfaStatus(adminUser),
        });
    } catch (error) {
        const code = error.message === 'Admin access required' ? 403 : 400;
        res.status(code).json({ success: false, message: error.message });
    }
});

router.post('/mfa/admin/passkey/registration-options', verifyToken, async (req, res) => {
    try {
        const adminUser = await getCurrentTenantAdminUser(req);
        const options = await generatePasskeyRegistration(req, adminUser);
        res.json({
            success: true,
            data: {
                options,
            },
        });
    } catch (error) {
        const code = error.message === 'Admin access required' ? 403 : 400;
        res.status(code).json({ success: false, message: error.message });
    }
});

router.post('/mfa/admin/passkey/register', verifyToken, async (req, res) => {
    try {
        const { credential, nickname } = req.body || {};
        if (!credential) {
            return res.status(400).json({ success: false, message: 'Passkey credential is required' });
        }
        const adminUser = await getCurrentTenantAdminUser(req);
        await verifyPasskeyRegistration(req, adminUser, credential, nickname);
        res.json({
            success: true,
            message: 'Passkey added for admin MFA',
            data: {
                ...getMfaStatus(adminUser),
                passkeys: getPasskeySummary(adminUser),
            },
        });
    } catch (error) {
        const code = error.message === 'Admin access required' ? 403 : 400;
        res.status(code).json({ success: false, message: error.message });
    }
});

router.delete('/mfa/admin/passkeys/:credentialId', verifyToken, async (req, res) => {
    try {
        const { credentialId } = req.params;
        const adminUser = await getCurrentTenantAdminUser(req);
        const removed = await removePasskey(adminUser, credentialId);
        if (!removed) {
            return res.status(404).json({ success: false, message: 'Passkey not found' });
        }
        res.json({
            success: true,
            message: 'Passkey removed',
            data: {
                ...getMfaStatus(adminUser),
                passkeys: getPasskeySummary(adminUser),
            },
        });
    } catch (error) {
        const code = error.message === 'Admin access required' ? 403 : 400;
        res.status(code).json({ success: false, message: error.message });
    }
});

router.get('/mfa/pending', async (req, res) => {
    try {
        const context = await resolvePendingMfaContext(req);
        const status = getMfaStatus(context.tenantUser);
        res.json({
            success: true,
            data: {
                requiresMfa: true,
                methods: status.methods,
                school: req.school,
            },
        });
    } catch (error) {
        res.status(401).json({ success: false, message: error.message });
    }
});

router.post('/mfa/passkey/authentication-options', async (req, res) => {
    try {
        const context = await resolvePendingMfaContext(req);
        const status = getMfaStatus(context.tenantUser);
        if (!status.methods.includes('passkey')) {
            return res.status(400).json({ success: false, message: 'Passkey MFA is not configured for this account' });
        }
        const options = await generatePasskeyAuthentication(req, context.tenantUser, context.pendingMfaToken);
        res.json({
            success: true,
            data: { options },
        });
    } catch (error) {
        res.status(401).json({ success: false, message: error.message });
    }
});

router.post('/mfa/verify-totp', async (req, res) => {
    try {
        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({ success: false, message: 'Authenticator code is required' });
        }
        const context = await resolvePendingMfaContext(req);
        const status = getMfaStatus(context.tenantUser);
        if (!status.methods.includes('totp')) {
            return res.status(400).json({ success: false, message: 'Authenticator app MFA is not configured for this account' });
        }
        const isValid = await verifyTotpForLogin(context.tenantUser, code);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid authenticator code' });
        }

        const tokenMfaClaims = buildTokenMfaClaims({
            isAdminLevel: true,
            mfaConfigured: true,
            mfaVerified: true,
        });
        const tokens = await authGlobalService.issueTokens(
            req,
            res,
            context.globalUser,
            context.tenantUser,
            context.platformRoles,
            tokenMfaClaims,
        );
        clearPendingMfaCookie(req, res);
        const data = { user: context.tenantUser };
        if (isMobileClient(req)) {
            data.accessToken = tokens.accessToken;
            data.refreshToken = tokens.refreshToken;
        }
        res.json({
            success: true,
            message: 'Admin MFA verification successful',
            data,
        });
    } catch (error) {
        res.status(401).json({ success: false, message: error.message });
    }
});

router.post('/mfa/verify-passkey', async (req, res) => {
    try {
        const { credential } = req.body || {};
        if (!credential) {
            return res.status(400).json({ success: false, message: 'Passkey assertion is required' });
        }
        const context = await resolvePendingMfaContext(req);
        const status = getMfaStatus(context.tenantUser);
        if (!status.methods.includes('passkey')) {
            return res.status(400).json({ success: false, message: 'Passkey MFA is not configured for this account' });
        }

        await verifyPasskeyAuthentication(req, context.tenantUser, context.pendingMfaToken, credential);
        const tokenMfaClaims = buildTokenMfaClaims({
            isAdminLevel: true,
            mfaConfigured: true,
            mfaVerified: true,
        });
        const tokens = await authGlobalService.issueTokens(
            req,
            res,
            context.globalUser,
            context.tenantUser,
            context.platformRoles,
            tokenMfaClaims,
        );
        clearPendingMfaCookie(req, res);
        const data = { user: context.tenantUser };
        if (isMobileClient(req)) {
            data.accessToken = tokens.accessToken;
            data.refreshToken = tokens.refreshToken;
        }
        res.json({
            success: true,
            message: 'Admin MFA verification successful',
            data,
        });
    } catch (error) {
        res.status(401).json({ success: false, message: error.message });
    }
});

// Get all active sessions for the current user
router.get('/sessions', verifyToken, async (req, res) => {
    try {
        const sessions = req.user.globalUserId
            ? await getUserSessionsForGlobalUser(req.user.globalUserId, req)
            : await getUserSessions(req.user.userId, req);

        // Format sessions for response (exclude sensitive info)
        const formattedSessions = sessions.map(session => ({
            id: session._id,
            deviceInfo: session.deviceInfo,
            clientType: session.clientType,
            ipAddress: session.ipAddress,
            lastUsed: session.lastUsed,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            isCurrent: req.cookies.refreshToken === session.refreshToken
        }));

        const userLabel = req.user.globalUserId ? req.user.globalUserId : req.user.userId;
        console.log(`GET: /sessions user ${userLabel} retrieved ${formattedSessions.length} sessions`);
        res.json({
            success: true,
            data: {
                sessions: formattedSessions
            }
        });
    } catch (error) {
        console.log(`GET: /sessions failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error fetching sessions',
            error: error.message
        });
    }
});

// Revoke a specific session
router.delete('/sessions/:sessionId', verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const deleted = req.user.globalUserId
            ? await deleteSessionByIdForGlobalUser(sessionId, req.user.globalUserId, req)
            : await deleteSessionById(sessionId, req.user.userId, req);

        if (deleted) {
            const userLabel = req.user.globalUserId ? req.user.globalUserId : req.user.userId;
            console.log(`DELETE: /sessions/${sessionId} session revoked by user ${userLabel}`);
            res.json({
                success: true,
                message: 'Session revoked successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Session not found or you do not have permission to revoke it'
            });
        }
    } catch (error) {
        console.log(`DELETE: /sessions/${req.params.sessionId} failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error revoking session',
            error: error.message
        });
    }
});

// Revoke all other sessions (keep current one)
router.post('/sessions/revoke-all-others', verifyToken, async (req, res) => {
    try {
        const currentRefreshToken = req.cookies.refreshToken;
        let revokedCount;

        if (req.user.globalUserId) {
            revokedCount = await revokeAllOtherSessionsForGlobalUser(req.user.globalUserId, currentRefreshToken, req);
        } else {
            const allSessions = await getUserSessions(req.user.userId, req);
            const { Session } = getModels(req, 'Session');
            await Session.deleteMany({
                userId: req.user.userId,
                refreshToken: { $ne: currentRefreshToken }
            });
            revokedCount = allSessions.length - 1;
        }

        const userLabel = req.user.globalUserId ? req.user.globalUserId : req.user.userId;
        console.log(`POST: /sessions/revoke-all-others user ${userLabel} revoked ${revokedCount} other sessions`);
        res.json({
            success: true,
            message: 'All other sessions revoked successfully'
        });
    } catch (error) {
        console.log(`POST: /sessions/revoke-all-others failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error revoking sessions',
            error: error.message
        });
    }
});


module.exports = router;