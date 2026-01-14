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

const { Resend } = require('resend');
const { render } = require('@react-email/render')
const React = require('react');
const ForgotEmail = require('../emails/ForgotEmail').default;
const resend = new Resend(process.env.RESEND_API_KEY);

// Store verification codes temporarily (in production, use Redis or similar)
const verificationCodes = new Map();


const ACCESS_TOKEN_EXPIRY_MINUTES = 1;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
// Token configuration
const ACCESS_TOKEN_EXPIRY = `${ACCESS_TOKEN_EXPIRY_MINUTES}m`; // 1 minute
const REFRESH_TOKEN_EXPIRY = `${REFRESH_TOKEN_EXPIRY_DAYS}d`;  // 2 days
const ACCESS_TOKEN_EXPIRY_MS = ACCESS_TOKEN_EXPIRY_MINUTES * 60 * 1000; // 1 minute in milliseconds
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // 2 days in milliseconds

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
    const { username, email, password } = req.body;

    try {
        const {User} = getModels(req, 'User');

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

        // Store refresh token in database
        await User.findByIdAndUpdate(user._id, { 
            refreshToken: refreshToken 
        });

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
        await sendUserRegisteredEvent({
            id: user._id,
            email: user.email,
            username: user.username,
            name: user.name,
            school: req.school
        });
        
        // Send the response without tokens in body
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: { user: user }
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

        // Store refresh token in database
        const {User} = getModels(req, 'User');
        await User.findByIdAndUpdate(user._id, { 
            refreshToken: refreshToken 
        });

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
        res.status(200).json({
            success: true,
            message: 'Logged in successfully',
            data: {
                user: user
            }
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
    const refreshToken = req.cookies.refreshToken;
    
    // console.log('🔄 Refresh token request received');
    // console.log('📦 Cookies:', req.cookies);
    
    if (!refreshToken) {
        console.log('POST: /refresh-token 403 no refresh token in cookies');
        return res.status(403).json({
            success: false,
            message: 'No refresh token provided'
        });
    }

    try {
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
        // time left for refresh token
        const timeLeft = decoded.exp - Date.now() / 1000;
        // console.log('✅ Refresh token verified for user:', decoded.userId);
        // console.log('🕒 Refresh token valid for:', timeLeft);
        
        // Check if refresh token exists in database
        const { User } = getModels(req, 'User');
        const user = await User.findById(decoded.userId);
        // console.log('🔄 Refresh token user:', user);
        // console.log('🔄 Refresh token refreshToken:', user.refreshToken);
        // console.log('🔄 Refresh token refreshToken:', refreshToken);    
        
        if (!user || user.refreshToken !== refreshToken) {
            console.log('POST: /refresh-token 401 refresh token not found in database or mismatch');
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new access token
        const newAccessToken = jwt.sign(
            { userId: user._id, roles: user.roles }, 
            process.env.JWT_SECRET, 
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );

        // Set new access token cookie
        res.cookie('accessToken', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: ACCESS_TOKEN_EXPIRY_MS, // 1 minute
            path: '/'
        });

        console.log(`POST: /refresh-token user ${user.username}`);
        res.json({
            success: true,
            message: 'Token refreshed successfully'
        });
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
    const refreshToken = req.cookies.refreshToken;
    
    if (refreshToken) {
        try {
            // Invalidate refresh token in database
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
            const { User } = getModels(req, 'User');
            await User.findByIdAndUpdate(decoded.userId, { 
                refreshToken: null 
            });
        } catch (error) {
            console.log('Error invalidating refresh token:', error);
        }
    }

    // Clear both cookies
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
        const {User, Friendship} = getModels(req, 'User', 'Friendship');

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

        console.log(`GET: /validate-token token is valid for user ${user.username}`)
        res.json({
            success: true,
            message: 'Token is valid',
            data: {
                user: user,
                friendRequests: friendRequests
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

        // Store refresh token in database
        const {User} = getModels(req, 'User');
        await User.findByIdAndUpdate(user._id, { 
            refreshToken: refreshToken 
        });

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

        res.status(200).json({
            success: true,
            message: 'Google login successful',
            data: {
                user: user
            }
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

        // Store refresh token in database
        const {User} = getModels(req, 'User');
        await User.findByIdAndUpdate(authenticatedUser._id, { 
            refreshToken: refreshToken 
        });

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

        res.status(200).json({
            success: true,
            message: 'Apple login successful',
            data: {
                user: authenticatedUser
            }
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

        // Store refresh token in database
        const {User} = getModels(req, 'User');
        await User.findByIdAndUpdate(authenticatedUser._id, { 
            refreshToken: refreshToken 
        });

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


module.exports = router;