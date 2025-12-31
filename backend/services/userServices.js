const google = require('googleapis').google;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendDiscordMessage } = require('./discordWebookService');
const getModels = require('./getModelService');
const { get } = require('../schemas/badgeGrant');

const login = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);


const register = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI_REGISTER
);

const loginwww = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI_WWW
);


const registerwww = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI_REGISTER_WWW
);



async function registerUser({ username, email, password, req }) {
    const { User } = getModels(req, 'User');
    const existingUsername = await User.findOne({ username });
    const existingEmail = await User.findOne({ email });

    if (existingUsername || existingEmail) {
        const message = existingUsername && existingEmail ? 'Email and username are taken'
            : existingEmail ? 'Email is taken'
                : 'Username is taken';
        throw new Error(message);
    }

    const hashedPassword = await bcrypt.hash(password, 10); // Example hashing
    const user = new User({
        username,
        email: email.toLowerCase(),
        password: hashedPassword
    });
    await user.save();

    return { user };
}

async function loginUser({ email, password, req }) {
    const { User } = getModels(req, 'User');
    //check if it is an email or username
    let user;
    if (!email.includes('@')) {
        user = await User.findOne({ username: email.toLowerCase() })
            .select('-googleId -refreshToken') // Add fields to exclude
            .lean()
            .populate('clubAssociations'); 
    } else {
        user = await User.findOne({ email: email.toLowerCase() })
            .select('-googleId -refreshToken') // Add fields to exclude
            .lean()
            .populate('clubAssociations'); 
    }
    if (!user) {
        throw new Error('User not found');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        throw new Error('Invalid credentials');
    }
    delete user.password;
    return { user };
}
function getRedirectUri(url) {
    // Handle Expo proxy redirect URIs (https://auth.expo.io)
    if (url && url.includes('auth.expo.io')) {
        // Expo proxy redirect URIs - return as-is, Google OAuth will validate them
        // These should be registered in Google Cloud Console as authorized redirect URIs
        // Format: https://auth.expo.io/@<username>/<slug>
        if (url.startsWith('https://auth.expo.io')) {
            return url;
        } else {
            throw new Error(`Invalid Expo proxy redirect URI: ${url}`);
        }
    }
    
    // Handle mobile app redirect URIs (custom schemes like meridian://)
    // Note: These require platform-specific OAuth clients in Google Cloud Console
    if (url && (url.startsWith('meridian://') || url.startsWith('com.meridian.mobile://'))) {
        // Mobile app redirect URIs - return as-is, Google OAuth will validate them
        // These should be registered in Google Cloud Console as authorized redirect URIs
        const allowedMobileUris = [
            'meridian://auth/google',
            'com.meridian.mobile://auth/google'
        ];
        
        if (allowedMobileUris.includes(url)) {
            return url;
        } else {
            throw new Error(`Invalid mobile redirect URI: ${url}`);
        }
    }

    // Handle web redirect URIs
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const path = urlObj.pathname;

        // Determine the base path for redirect (either login or register)
        const basePath = path.includes('register') ? '/register' : '/login';
        const development = process.env.NODE_ENV === 'development';
        const uri = development ? `http://${hostname}:3000${basePath}` : `https://${hostname}${basePath}`;

        const allowedOrigins = [
            'http://localhost:3000/login',
            'http://localhost:3000/register',
            'https://meridian.study/login',
            'https://meridian.study/register',
            'https://www.meridian.study/login',
            'https://www.meridian.study/register',
            'https://rpi.meridian.study/login',
            'https://rpi.meridian.study/register',
            'https://berkeley.meridian.study/login',
            'https://berkeley.meridian.study/register'
        ];

        if(!allowedOrigins.includes(uri)) {
            throw new Error(`Invalid redirect URI ${uri}`);
        }

        // Return the redirect URI dynamically constructed
        return uri;
    } catch (error) {
        // If URL parsing fails, it might be a malformed URL
        throw new Error(`Invalid redirect URI format: ${url}`);
    }
}

async function authenticateWithGoogle(code, isRegister = false, url, req) {
    const { User } = getModels(req, 'User');

    // Get the redirect URI (handles both web and mobile)
    const redirectUri = getRedirectUri(url);
    
    console.log(`Google OAuth: Using redirect URI: ${redirectUri} (from: ${url})`);

    // Create OAuth2 client with the redirect URI
    const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
    );

    try {
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);

        const oauth2 = google.oauth2({
            auth: client,
            version: 'v2'
        });

        const userInfo = await oauth2.userinfo.get();
        console.log('Google user info:', userInfo.data);
        
        let user = await User.findOne({ googleId: userInfo.data.id })
            .select('-password -googleId -refreshToken') // Add fields to exclude
            .lean()
            .populate('clubAssociations');

        if (!user) {
            //check if email already exists
            user = await User.findOne({ email: userInfo.data.email });
            if (user) {
                throw new Error('Email already exists');
            }

            const randomUsername = await generateUniqueUsername(userInfo.data.email, req);

            user = new User({
                googleId: userInfo.data.id,
                email: userInfo.data.email,
                name: userInfo.data.name,
                username: randomUsername, //replace this with a random username generated
                picture: userInfo.data.picture
            });
            await user.save();
            sendDiscordMessage(`New user registered`, `user ${user.username} registered`, "newUser");
            
            // Fetch the user again with populated fields
            user = await User.findById(user._id)
                .select('-password -googleId -refreshToken')
                .lean()
                .populate('clubAssociations');
        }

        return { user };
    } catch (error) {
        // Enhanced error logging for OAuth token exchange
        if (error.message && error.message.includes('redirect_uri_mismatch')) {
            console.error('Google OAuth redirect URI mismatch. Expected:', redirectUri);
            throw new Error(`OAuth redirect URI mismatch. Please ensure '${redirectUri}' is registered in Google Cloud Console.`);
        }
        throw error;
    }
}

async function generateUniqueUsername(email, req) {
    const { User } = getModels(req, 'User');
    let username =  email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    let isUnique = false;

    do {
        const existingUser = await User.findOne({ username });
        if (!existingUser) {
            isUnique = true;
        } else {
            username += crypto.randomBytes(1).toString('hex');
        }
    } while (!isUnique);


    return username;
}
module.exports  = { registerUser, loginUser, authenticateWithGoogle };