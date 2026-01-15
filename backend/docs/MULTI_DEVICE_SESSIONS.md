# Multi-Device Session Management

## Overview

The authentication system has been updated to support multiple concurrent sessions per user, allowing users to be logged in from multiple devices/clients simultaneously. Previously, only one refresh token was allowed per user, causing new logins to invalidate previous sessions.

## Changes Made

### 1. Session Schema (`schemas/session.js`)
- New `Session` model to track multiple sessions per user
- Stores refresh tokens with device information (device type, user agent, IP address, client type)
- Tracks last used timestamp and expiration
- Indexed for efficient queries

### 2. Session Utilities (`utilities/sessionUtils.js`)
- `createSession()` - Creates a new session for a user
- `validateSession()` - Validates a refresh token and returns session/user info
- `deleteSession()` - Deletes a session by refresh token
- `deleteAllUserSessions()` - Deletes all sessions for a user
- `deleteSessionById()` - Deletes a specific session by ID
- `getUserSessions()` - Gets all active sessions for a user
- `cleanupExpiredSessions()` - Cleans up expired sessions (for periodic cleanup)
- `getDeviceInfo()` - Extracts device information from request

### 3. Updated Authentication Routes

All login endpoints now create sessions instead of overwriting a single refresh token:
- `/register` - Creates session on registration
- `/login` - Creates session on login
- `/google-login` - Creates session on Google OAuth login
- `/apple-login` - Creates session on Apple Sign In
- `/auth/apple/callback` - Creates session on Apple callback
- `/refresh-token` - Validates against sessions instead of user's refreshToken field
- `/logout` - Deletes specific session instead of clearing user's refreshToken

### 4. New Session Management Endpoints

- `GET /sessions` - Get all active sessions for the current user
  - Returns list of sessions with device info, last used, etc.
  - Marks current session with `isCurrent: true`
  
- `DELETE /sessions/:sessionId` - Revoke a specific session
  - Requires authentication
  - Only allows revoking own sessions
  
- `POST /sessions/revoke-all-others` - Revoke all other sessions (keep current)
  - Useful for "logout from all devices" functionality

### 5. Updated SAML Routes

SAML authentication routes have been updated to use sessions:
- `/auth/saml/callback` - Creates session on SAML login
- `/auth/saml/logout` - Deletes session on logout

## Migration Notes

### Backward Compatibility

The `refreshToken` field remains in the User schema for backward compatibility but is no longer used. Existing users with refresh tokens will need to log in again to create sessions.

### Database Migration

No immediate migration is required. The system will work with existing users, but they'll need to log in again to create sessions. If you want to clean up the old `refreshToken` field, you can run:

```javascript
// Optional: Remove unused refreshToken field from User schema
// This can be done in a future migration if desired
```

### Cleanup Job

Consider adding a periodic job to clean up expired sessions:

```javascript
const { cleanupExpiredSessions } = require('./utilities/sessionUtils');

// Run daily or weekly
setInterval(async () => {
    const deleted = await cleanupExpiredSessions(req);
    console.log(`Cleaned up ${deleted} expired sessions`);
}, 24 * 60 * 60 * 1000); // Daily
```

## Usage Examples

### Frontend: List Sessions

```javascript
// Get all active sessions
const response = await fetch('/sessions', {
    credentials: 'include'
});
const { sessions } = await response.json();

// Display sessions to user
sessions.forEach(session => {
    console.log(`${session.deviceInfo} - Last used: ${session.lastUsed}`);
});
```

### Frontend: Revoke Session

```javascript
// Revoke a specific session
await fetch(`/sessions/${sessionId}`, {
    method: 'DELETE',
    credentials: 'include'
});

// Revoke all other sessions
await fetch('/sessions/revoke-all-others', {
    method: 'POST',
    credentials: 'include'
});
```

## Benefits

1. **Multi-Device Support**: Users can be logged in from multiple devices simultaneously
2. **Better Security**: Can see and manage all active sessions
3. **Device Tracking**: Know which devices are logged in
4. **Selective Logout**: Log out from specific devices without affecting others
5. **Session Management**: Users can view and revoke sessions from account settings

## Security Considerations

1. **Session Expiration**: Sessions expire after 30 days (configurable via `REFRESH_TOKEN_EXPIRY_DAYS`)
2. **Token Validation**: Refresh tokens are validated against the database on each use
3. **Automatic Cleanup**: Expired sessions are automatically invalidated
4. **Device Tracking**: IP addresses and user agents are stored for security auditing

## Testing

Test scenarios to verify:
1. Login from multiple devices - all should work simultaneously
2. Refresh token on one device shouldn't affect others
3. Logout from one device shouldn't log out others
4. Revoke session endpoint should only affect the specified session
5. Revoke all others should keep current session active

