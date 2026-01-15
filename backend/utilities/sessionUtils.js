const jwt = require('jsonwebtoken');
const getModels = require('../services/getModelService');

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Extract device information from request
 */
function getDeviceInfo(req) {
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || '';
    
    // Determine client type
    let clientType = 'web';
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
        if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
            clientType = 'ios';
        } else if (userAgent.includes('Android')) {
            clientType = 'android';
        } else {
            clientType = 'mobile';
        }
    }
    
    // Extract device name (simplified)
    let deviceInfo = 'Unknown';
    if (userAgent.includes('iPhone')) {
        deviceInfo = 'iPhone';
    } else if (userAgent.includes('iPad')) {
        deviceInfo = 'iPad';
    } else if (userAgent.includes('Android')) {
        deviceInfo = 'Android Device';
    } else if (userAgent.includes('Chrome')) {
        deviceInfo = 'Chrome Browser';
    } else if (userAgent.includes('Firefox')) {
        deviceInfo = 'Firefox Browser';
    } else if (userAgent.includes('Safari')) {
        deviceInfo = 'Safari Browser';
    }
    
    return {
        deviceInfo,
        userAgent,
        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        clientType
    };
}

/**
 * Create a new session for a user
 */
async function createSession(userId, refreshToken, req) {
    const { Session } = getModels(req, 'Session');
    const deviceInfo = getDeviceInfo(req);
    
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
    
    const session = new Session({
        userId,
        refreshToken,
        deviceInfo: deviceInfo.deviceInfo,
        userAgent: deviceInfo.userAgent,
        ipAddress: deviceInfo.ipAddress,
        clientType: deviceInfo.clientType,
        expiresAt
    });
    
    await session.save();
    return session;
}

/**
 * Validate a refresh token and return the session
 */
async function validateSession(refreshToken, req) {
    const { Session, User } = getModels(req, 'Session', 'User');
    
    try {
        // First verify the JWT token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
        
        // Find the session in database
        const session = await Session.findOne({ refreshToken });
        
        if (!session) {
            return { valid: false, error: 'Session not found' };
        }
        
        // Check if session is expired
        if (session.isExpired()) {
            await Session.deleteOne({ _id: session._id });
            return { valid: false, error: 'Session expired' };
        }
        
        // Verify user still exists
        const user = await User.findById(session.userId);
        if (!user) {
            await Session.deleteOne({ _id: session._id });
            return { valid: false, error: 'User not found' };
        }
        
        // Update last used timestamp
        session.lastUsed = new Date();
        await session.save();
        
        return { valid: true, session, user };
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            // Clean up expired session if it exists
            await Session.deleteOne({ refreshToken }).catch(() => {});
            return { valid: false, error: 'Token expired' };
        }
        if (error.name === 'JsonWebTokenError') {
            return { valid: false, error: 'Invalid token' };
        }
        return { valid: false, error: error.message };
    }
}

/**
 * Delete a session by refresh token
 */
async function deleteSession(refreshToken, req) {
    const { Session } = getModels(req, 'Session');
    await Session.deleteOne({ refreshToken });
}

/**
 * Delete all sessions for a user
 */
async function deleteAllUserSessions(userId, req) {
    const { Session } = getModels(req, 'Session');
    await Session.deleteMany({ userId });
}

/**
 * Delete a specific session by ID
 */
async function deleteSessionById(sessionId, userId, req) {
    const { Session } = getModels(req, 'Session');
    // Ensure user owns the session
    const session = await Session.findOne({ _id: sessionId, userId });
    if (session) {
        await Session.deleteOne({ _id: sessionId });
        return true;
    }
    return false;
}

/**
 * Get all active sessions for a user
 */
async function getUserSessions(userId, req) {
    const { Session } = getModels(req, 'Session');
    const sessions = await Session.find({ 
        userId,
        expiresAt: { $gt: new Date() }
    }).sort({ lastUsed: -1 });
    
    return sessions;
}

/**
 * Clean up expired sessions (can be called periodically)
 */
async function cleanupExpiredSessions(req) {
    const { Session } = getModels(req, 'Session');
    const result = await Session.deleteMany({ 
        expiresAt: { $lt: new Date() }
    });
    return result.deletedCount;
}

module.exports = {
    createSession,
    validateSession,
    deleteSession,
    deleteAllUserSessions,
    deleteSessionById,
    getUserSessions,
    cleanupExpiredSessions,
    getDeviceInfo
};

