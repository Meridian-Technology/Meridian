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
const { getFriendRequests } = require('../utilities/friendUtils');
const { createSession, validateSession, deleteSession, deleteAllUserSessions, getUserSessions, deleteSessionById } = require('../utilities/sessionUtils');

const { Resend } = require('resend');
const { render } = require('@react-email/render')
const React = require('react');
const ForgotEmail = require('../emails/ForgotEmail').default;

let _resendClient = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resendClient) _resendClient = new Resend(process.env.RESEND_API_KEY);
  return _resendClient;
}

// Store verification codes temporarily (in production, use Redis or similar)
const verificationCodes = new Map();


const ACCESS_TOKEN_EXPIRY_MINUTES = 1;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
// Token configuration
const ACCESS_TOKEN_EXPIRY = `${ACCESS_TOKEN_EXPIRY_MINUTES}m`; // 1 minute
const REFRESH_TOKEN_EXPIRY = `${REFRESH_TOKEN_EXPIRY_DAYS}d`;  // 2 days
const ACCESS_TOKEN_EXPIRY_MS = ACCESS_TOKEN_EXPIRY_MINUTES * 60 * 1000; // 1 minute in milliseconds
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // 2 days in milliseconds

// Check if request is from mobile client (token-based auth instead of cookies)
const isMobileClient = (req) => req.headers['x-client'] === 'mobile';

function validateUsername(username) { //keeping logic external, for easier testing
    // Define the regex pattern
    const regex = /^[a-zA-Z0-9]{3,20}$/;
  
    // Test the username against the regex pattern
    return regex.test(username);
  }

(arg1) => {
    arg1 +=1;
};


function validateUsername(username) {
    // Define the regex pattern
    const regex = /^[a-zA-Z0-9]{3,20}$/;
  
    // Test the username against the regex pattern
    return regex.test(username);
  }

(arg1) => {
    arg1 +=1;
};

// Registration endpoint
router.post('/register', async (req, res) => {
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

        // Generate both tokens
        const accessToken = jwt.sign(
            { userId: user._id, roles: user.roles }, 
            process.env.JWT_SECRET, 
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );
        
        const refreshToken = jwt.sign(
            { userId: user._id, type: 'refresh' }, 
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, 
            { expiresIn: REFRESH_TOKEN_EXPIRY }
        );

        // Create session instead of storing refresh token directly on user
        await createSession(user._id, refreshToken, req);

        // Set both cookies
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: ACCESS_TOKEN_EXPIRY_MS, // 1 minute
            path: '/'
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: REFRESH_TOKEN_EXPIRY_MS, // 2 days
            path: '/'
        });

        console.log(`POST: /register new user ${username}`);
        sendDiscordMessage(`New user registered`, `user ${username} registered`, "newUser");
        
        // Send Inngest event for user registration
        // await sendUserRegisteredEvent({
        //     id: user._id,
        //     email: user.email,
        //     username: user.username,
        //     name: user.name,
        //     school: req.school
        // });
        
        const responseData = { user: user };
        if (isMobileClient(req)) {
            responseData.accessToken = accessToken;
            responseData.refreshToken = refreshToken;
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
    const { email, password } = req.body;

    try {
        //check if it is an email or username, case insensitive for email
        const { user } = await loginUser({ email, password, req });
        
        // Generate both tokens
        const accessToken = jwt.sign(
            { userId: user._id, roles: user.roles }, 
            process.env.JWT_SECRET, 
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );
        
        const refreshToken = jwt.sign(
            { userId: user._id, type: 'refresh' }, 
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, 
            { expiresIn: REFRESH_TOKEN_EXPIRY }
        );

        // Create session instead of storing refresh token directly on user
        await createSession(user._id, refreshToken, req);

        // Set both cookies
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: ACCESS_TOKEN_EXPIRY_MS, // 1 minute
            path: '/'
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: REFRESH_TOKEN_EXPIRY_MS, // 2 days
            path: '/'
        });

        console.log(`POST: /login user ${user.username} logged in`)
        const loginData = { user: user };
        if (isMobileClient(req)) {
            loginData.accessToken = accessToken;
            loginData.refreshToken = refreshToken;
        }
        res.status(200).json({
            success: true,
            message: 'Logged in successfully',
            data: loginData
        });
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
        // Validate session using session utilities
        const validation = await validateSession(refreshToken, req);
        
        if (!validation.valid) {
            console.log('POST: /refresh-token 401', validation.error);
            return res.status(401).json({
                success: false,
                message: validation.error || 'Invalid refresh token'
            });
        }
        
        const { user, session } = validation;

        // Generate new access token
        const newAccessToken = jwt.sign(
            { userId: user._id, roles: user.roles }, 
            process.env.JWT_SECRET, 
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );

        const isMobile = isMobileClient(req);
        if (!isMobile) {
            // Set cookie for web clients
            res.cookie('accessToken', newAccessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: ACCESS_TOKEN_EXPIRY_MS, // 1 minute
                path: '/'
            });
        }

        console.log(`POST: /refresh-token user ${user.username}`);
        const response = { success: true, message: 'Token refreshed successfully' };
        if (isMobile) {
            response.accessToken = newAccessToken;
        }
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
    res.clearCookie('accessToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
    });
    
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
    });

    console.log(`POST: /logout user logged out`);
    res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/validate-token', verifyToken, async (req, res) => {
    try {
        const { User, Friendship } = getModels(req, 'User', 'Friendship');
        const orgInviteService = require('../services/orgInviteService');

        const user = await User.findById(req.user.userId)
            .select('-password -refreshToken') // Add fields you want to exclude
            .lean()
            .populate('clubAssociations'); 
            
        if (!user) {
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

        console.log(`GET: /validate-token token is valid for user ${user.username}`)
        res.json({
            success: true,
            message: 'Token is valid',
            data: {
                user: user,
                friendRequests: friendRequests,
                pendingOrgInvites: pendingOrgInvites
            }
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
        
        // Generate both tokens
        const accessToken = jwt.sign(
            { userId: user._id, roles: user.roles }, 
            process.env.JWT_SECRET, 
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );
        
        const refreshToken = jwt.sign(
            { userId: user._id, type: 'refresh' }, 
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, 
            { expiresIn: REFRESH_TOKEN_EXPIRY }
        );

        // Create session instead of storing refresh token directly on user
        await createSession(user._id, refreshToken, req);

        // Set both cookies
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: ACCESS_TOKEN_EXPIRY_MS, // 1 minute
            path: '/'
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: REFRESH_TOKEN_EXPIRY_MS, // 2 days
            path: '/'
        });

        const googleLoginData = { user: user };
        if (isMobileClient(req)) {
            googleLoginData.accessToken = accessToken;
            googleLoginData.refreshToken = refreshToken;
        }
        res.status(200).json({
            success: true,
            message: 'Google login successful',
            data: googleLoginData
        });

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
    const { idToken, user } = req.body;

    if (!idToken) {
        return res.status(400).json({
            success: false,
            message: 'No ID token provided'
        });
    }

    try {
        const { user: authenticatedUser } = await authenticateWithApple(idToken, user, req);
        
        // Generate both tokens
        const accessToken = jwt.sign(
            { userId: authenticatedUser._id, roles: authenticatedUser.roles }, 
            process.env.JWT_SECRET, 
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );
        
        const refreshToken = jwt.sign(
            { userId: authenticatedUser._id, type: 'refresh' }, 
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, 
            { expiresIn: REFRESH_TOKEN_EXPIRY }
        );

        // Create session instead of storing refresh token directly on user
        await createSession(authenticatedUser._id, refreshToken, req);

        // Set both cookies
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: ACCESS_TOKEN_EXPIRY_MS, // 1 minute
            path: '/'
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: REFRESH_TOKEN_EXPIRY_MS, // 2 days
            path: '/'
        });

        const appleLoginData = { user: authenticatedUser };
        if (isMobileClient(req)) {
            appleLoginData.accessToken = accessToken;
            appleLoginData.refreshToken = refreshToken;
        }
        res.status(200).json({
            success: true,
            message: 'Apple login successful',
            data: appleLoginData
        });

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
        
        // Generate both tokens
        const accessToken = jwt.sign(
            { userId: authenticatedUser._id, roles: authenticatedUser.roles }, 
            process.env.JWT_SECRET, 
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );
        
        const refreshToken = jwt.sign(
            { userId: authenticatedUser._id, type: 'refresh' }, 
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, 
            { expiresIn: REFRESH_TOKEN_EXPIRY }
        );

        // Create session instead of storing refresh token directly on user
        await createSession(authenticatedUser._id, refreshToken, req);

        // Set both cookies
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: ACCESS_TOKEN_EXPIRY_MS,
            path: '/'
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: REFRESH_TOKEN_EXPIRY_MS,
            path: '/'
        });

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

// Get all active sessions for the current user
router.get('/sessions', verifyToken, async (req, res) => {
    try {
        const sessions = await getUserSessions(req.user.userId, req);
        
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
        
        console.log(`GET: /sessions user ${req.user.userId} retrieved ${formattedSessions.length} sessions`);
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
        const deleted = await deleteSessionById(sessionId, req.user.userId, req);
        
        if (deleted) {
            console.log(`DELETE: /sessions/${sessionId} session revoked by user ${req.user.userId}`);
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
        const allSessions = await getUserSessions(req.user.userId, req);
        
        // Delete all sessions except the current one
        const { Session } = getModels(req, 'Session');
        await Session.deleteMany({
            userId: req.user.userId,
            refreshToken: { $ne: currentRefreshToken }
        });
        
        console.log(`POST: /sessions/revoke-all-others user ${req.user.userId} revoked ${allSessions.length - 1} other sessions`);
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