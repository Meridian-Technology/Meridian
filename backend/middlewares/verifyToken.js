const jwt = require('jsonwebtoken');
const getModels = require('../services/getModelService');

// Constants for token expiry (matching authRoutes.js)
const ACCESS_TOKEN_EXPIRY_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY = `${ACCESS_TOKEN_EXPIRY_MINUTES}m`;
const ACCESS_TOKEN_EXPIRY_MS = ACCESS_TOKEN_EXPIRY_MINUTES * 60 * 1000;

const verifyToken = (req, res, next) => {
    // Check for token in cookies first, then headers (for backward compatibility)
    const token = req.cookies.accessToken || 
                  (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
  
    // console.log('🔍 Verifying token for:', req.path);
    // console.log('📦 Cookies:', req.cookies);
    // console.log('Token found:', !!token);
  
    if (token == null) {
        console.log('❌ No token provided');
        return res.status(401).json({ 
            success: false, 
            message: 'No access token provided',
            code: 'NO_TOKEN'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decodedToken) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                console.log('⏰ Token expired');
                return res.status(401).json({ 
                    success: false, 
                    message: 'Access token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            console.log('❌ Invalid token:', err.message);
            return res.status(403).json({ 
                success: false, 
                message: 'Invalid access token',
                code: 'INVALID_TOKEN'
            });
        }
        //log time left
        // console.log('✅ Token valid for user:', decodedToken.userId);
        req.user = decodedToken;
        next();
    });
};

function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        const { roles } = req.user;
        if (!roles || !allowedRoles.some(role => roles.includes(role))) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        next();
    };
}

const verifyTokenOptional = async (req, res, next) => {
  // Check for token in cookies first, then headers
  const token = req.cookies.accessToken || 
                (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

  // If there's no token, just move on without setting req.user
  if (token == null) {
      return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decodedToken) => {
      if (!err) {
          req.user = decodedToken; // Set the user if the token is valid
          return next();
      }

      // If token is expired, try to refresh it
      if (err.name === 'TokenExpiredError') {
          const refreshToken = req.cookies.refreshToken;
          
          if (refreshToken) {
              try {
                  // Verify refresh token
                  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
                  
                                     // Get user from database to check refresh token
                   const { User } = getModels(req, 'User');
                   const user = await User.findById(decoded.userId);
                  
                  if (user && user.refreshToken === refreshToken) {
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
                          maxAge: ACCESS_TOKEN_EXPIRY_MS,
                          path: '/'
                      });

                      // Set user in request
                      req.user = { userId: user._id, roles: user.roles };
                      console.log('🔄 Token refreshed successfully for user:', user._id);
                  }
              } catch (refreshError) {
                  console.log('🔄 Refresh token failed:', refreshError.message);
                  // Continue without setting req.user - this is optional verification
              }
          }
      }
      
      // Proceed regardless of token validity or refresh success
      next();
  });
};

module.exports = { verifyToken, verifyTokenOptional, authorizeRoles };