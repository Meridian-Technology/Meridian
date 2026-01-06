# SAML Authentication Setup Guide

This guide explains how to set up SAML authentication for Study Compass using Passport SAML.

## Overview

Study Compass supports SAML authentication for institutional users (e.g., RPI students and faculty). The implementation uses:

- **Passport SAML**: For handling SAML authentication flows
- **Express Session**: For managing user sessions during authentication
- **JWT Tokens**: For maintaining authentication state after SAML login

## Prerequisites

1. **OpenSSL**: Required for generating certificates
   ```bash
   # macOS
   brew install openssl
   
   # Ubuntu/Debian
   sudo apt-get install openssl
   
   # Windows
   # Download from https://www.openssl.org/
   ```

2. **Node.js Dependencies**: Already included in package.json
   - `passport-saml`
   - `express-session`
   - `passport`

## Setup Instructions

### 1. Generate SAML Certificates

Run the setup script to generate the necessary certificates and configure SAML:

```bash
cd backend
npm run setup-saml
```

This script will:
- Generate signing and encryption certificates
- Create the RPI SAML configuration
- Store the configuration in the database

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Add the following to your `.env` file:

```env
# Session secret for SAML
SESSION_SECRET=your-super-secret-session-key

# JWT secrets (should already exist)
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-jwt-refresh-secret

# Database connection (should already exist)
MONGO_URL_LOCAL=mongodb://localhost:27017/study-compass
MONGO_URL=your-production-mongo-url
```

### 4. Start the Server

```bash
npm start
```

## SAML Endpoints

The following endpoints are available for SAML authentication:

### Login
- **URL**: `GET /auth/saml/login`
- **Description**: Initiates SAML login process
- **Query Parameters**: 
  - `relayState` (optional): URL to redirect to after successful login

### Callback
- **URL**: `POST /auth/saml/callback`
- **Description**: Handles SAML response from Identity Provider
- **Usage**: Called automatically by the IdP after successful authentication

### Logout
- **URL**: `POST /auth/saml/logout`
- **Description**: Logs out the user and optionally redirects to IdP logout
- **Authentication**: Requires valid JWT token

### Metadata
- **URL**: `GET /auth/saml/metadata`
- **Description**: Provides SAML metadata for IdP configuration
- **Usage**: Share this URL with your institution's IT department

## RPI Configuration

The setup script configures SAML for Rensselaer Polytechnic Institute with:

- **IdP Entity ID**: `https://shib-idp.rpi.edu/idp/shibboleth`
- **SSO URL**: `https://shib.auth.rpi.edu/idp/profile/SAML2/Redirect/SSO`
- **Attribute Mapping**: Maps standard eduPerson attributes to user fields

### Supported Attributes

| SAML Attribute | User Field | Description |
|----------------|------------|-------------|
| `urn:oid:1.3.6.1.4.1.5923.1.1.1.6` | `email` | eduPersonPrincipalName |
| `urn:oid:2.5.4.42` | `givenName` | First name |
| `urn:oid:2.5.4.4` | `sn` | Last name |
| `urn:oid:2.16.840.1.113730.3.1.241` | `displayName` | Display name |
| `urn:oid:0.9.2342.19200300.100.1.1` | `uid` | User ID |
| `urn:oid:1.3.6.1.4.1.5923.1.1.1.9` | `eduPersonAffiliation` | User affiliation (student, faculty, etc.) |

## Frontend Integration

The frontend is already configured to work with SAML authentication:

### SAML Login Button
```jsx
import SAMLLoginButton from './components/Forms/SAMLLoginButton/SAMLLoginButton';

<SAMLLoginButton 
    universityName="RPI" 
    relayState="/room/none"
/>
```

### SAML Callback Component
The `SAMLCallback` component handles the post-authentication flow and redirects users to their intended destination.

## Testing

### Local Development
1. Start the backend server: `npm start`
2. Start the frontend: `cd ../frontend && npm start`
3. Navigate to the login page
4. Click "Continue with RPI" to test SAML login

### Production Setup
For production deployment:

1. **Update Entity IDs**: The setup script uses localhost URLs for development. Update the configuration for production:
   ```javascript
   // In setupRPISAML.js
   entityID: 'https://study-compass.com'
   location: 'https://study-compass.com/auth/saml/callback'
   ```

2. **HTTPS Required**: SAML requires HTTPS in production. Ensure your server is configured with SSL.

3. **IdP Registration**: Contact RPI's IT department to register your Service Provider metadata URL:
   ```
   https://study-compass.com/auth/saml/metadata
   ```

## Troubleshooting

### Common Issues

1. **"No SAML configuration found"**
   - Run the setup script: `npm run setup-saml`
   - Check that the configuration is active in the database

2. **Certificate errors**
   - Regenerate certificates: `npm run generate-saml-keys`
   - Ensure OpenSSL is installed and accessible

3. **Session errors**
   - Check that `SESSION_SECRET` is set in your environment
   - Verify session middleware is configured in `app.js`

4. **CORS errors**
   - Ensure CORS is properly configured for your domain
   - Check that credentials are enabled in CORS settings

### Debug Mode

Enable debug logging by setting the environment variable:
```bash
DEBUG=passport-saml npm start
```

## Security Considerations

1. **Certificate Management**: Keep your private keys secure and rotate certificates regularly
2. **Session Security**: Use strong session secrets and HTTPS in production
3. **Attribute Validation**: Validate SAML attributes before creating/updating users
4. **Logout Handling**: Implement proper logout flows to clear sessions

## Adding New Institutions

To add SAML support for a new institution:

1. **Get IdP Metadata**: Obtain the SAML metadata from the institution's IT department
2. **Update Configuration**: Modify the setup script to include the new institution's configuration
3. **Test Authentication**: Verify the authentication flow works correctly
4. **Update Frontend**: Add the institution to the university configuration

## Support

For issues with SAML authentication:

1. Check the server logs for detailed error messages
2. Verify the SAML configuration in the database
3. Test the metadata endpoint: `/auth/saml/metadata`
4. Contact your institution's IT department for IdP-related issues 

