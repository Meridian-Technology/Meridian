# SAML Authentication System - Comprehensive Guide

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Installation & Setup](#installation--setup)
5. [Configuration Management](#configuration-management)
6. [Certificate Management](#certificate-management)
7. [Testing & Validation](#testing--validation)
8. [Debugging & Troubleshooting](#debugging--troubleshooting)
9. [Production Deployment](#production-deployment)
10. [Security Best Practices](#security-best-practices)
11. [API Reference](#api-reference)
12. [Troubleshooting FAQ](#troubleshooting-faq)

---

## System Overview

Study Compass implements a **multi-tenant SAML 2.0 authentication system** that allows universities to authenticate users using their institutional credentials. Each university (tenant) has its own SAML configuration, enabling seamless integration with existing identity providers.

### Key Features

- ✅ **Multi-tenant architecture** - Each subdomain has independent SAML config
- ✅ **Automatic user provisioning** - Users created from SAML attributes
- ✅ **Flexible attribute mapping** - Configurable field mappings
- ✅ **Certificate management** - Database-stored certificates for consistency
- ✅ **Coexistence with OAuth** - Works alongside Google OAuth
- ✅ **Production-ready** - Secure, scalable, and maintainable

### Supported Authentication Methods

1. **SAML 2.0** - Primary authentication for universities
2. **Google OAuth** - Existing authentication method
3. **Hybrid approach** - Users can use either method

---

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   University    │    │   Study Compass │    │   Identity      │
│   IdP Server    │◄──►│   SAML Service  │◄──►│   Provider      │
│                 │    │                 │    │   (IdP)         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   MongoDB       │
                       │   Database      │
                       │   (Configs)     │
                       └─────────────────┘
```

### Data Flow

1. **User initiates login** → Study Compass SAML service
2. **SAML request generated** → Sent to university IdP
3. **User authenticates** → At university IdP
4. **SAML response** → Returned to Study Compass
5. **User created/authenticated** → JWT token issued
6. **User redirected** → To Study Compass application

### Multi-Tenant Structure

```
study-compass.com/
├── rpi.study-compass.com/     # RPI SAML config
├── berkeley.study-compass.com/ # Berkeley SAML config
├── mit.study-compass.com/     # MIT SAML config
└── ...
```

---

## Prerequisites

### Required Software

- **Node.js 16+** and npm
- **OpenSSL** (for certificate generation)
- **MongoDB** (for configuration storage)
- **Heroku CLI** (for production deployment)

### Required Information

- **University SAML metadata** from IdP team
- **IdP Entity ID** and SSO/SLO URLs
- **X509 Certificate** from IdP
- **Database access** credentials

### Environment Variables

```bash
# Database connections
MONGO_URL_LOCAL=mongodb://localhost:27017/studycompass
MONGO_URL=mongodb://production-db-url

# SAML-specific (optional)
SAML_DEBUG=false
SAML_STRICT_MODE=true
```

---

## Installation & Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Generate Initial Certificates

```bash
# Generate certificates for RPI
node scripts/setupSAML.js rpi --update-certs
```

### 3. Interactive Setup (Recommended)

```bash
# Interactive setup for new university
node scripts/setupSAML.js berkeley --interactive
```

This will guide you through:
- Base URL configuration
- IdP Entity ID and URLs
- X509 Certificate input
- User provisioning settings

### 4. Manual Setup

```bash
# Create configuration via API
curl -X POST https://berkeley.study-compass.com/auth/saml/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "entityId": "https://berkeley.study-compass.com/auth/saml/metadata",
    "idp": {
      "entityId": "https://auth.berkeley.edu/saml/metadata",
      "ssoUrl": "https://auth.berkeley.edu/saml/sso",
      "sloUrl": "https://auth.berkeley.edu/saml/slo",
      "x509Cert": "-----BEGIN CERTIFICATE-----\n..."
    },
    "sp": {
      "assertionConsumerService": "https://berkeley.study-compass.com/auth/saml/callback",
      "singleLogoutService": "https://berkeley.study-compass.com/auth/saml/logout"
    }
  }'
```

---

## Configuration Management

### Configuration Schema

```javascript
{
  school: "rpi",                    // University identifier
  entityId: "https://...",         // SP Entity ID
  idp: {
    entityId: "https://...",       // IdP Entity ID
    ssoUrl: "https://...",         // SSO URL
    sloUrl: "https://...",         // SLO URL (optional)
    x509Cert: "-----BEGIN...",     // IdP certificate
    additionalCerts: []            // Additional IdP certs
  },
  sp: {
    assertionConsumerService: "https://...",  // ACS URL
    singleLogoutService: "https://...",       // SLO URL
    x509Cert: "-----BEGIN...",               // SP certificate
    privateKey: "-----BEGIN..."              // SP private key
  },
  attributeMapping: {
    email: "email",
    firstName: "firstName",
    lastName: "lastName",
    // ... more mappings
  },
  settings: {
    wantAssertionsSigned: true,
    wantMessageSigned: false,
    // ... SAML settings
  },
  userProvisioning: {
    autoCreateUsers: true,
    autoUpdateUsers: true,
    defaultRoles: ["user"],
    // ... provisioning settings
  },
  isActive: true
}
```

### Configuration Operations

#### View Configuration

```bash
# Validate existing configuration
node scripts/setupSAML.js rpi --validate

# View via API (admin only)
curl -X GET https://rpi.study-compass.com/auth/saml/config \
  -H "Authorization: Bearer <admin-token>"
```

#### Update Configuration

```bash
# Update certificates only
node scripts/setupSAML.js rpi --update-certs

# Update via API
curl -X POST https://rpi.study-compass.com/auth/saml/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{...}'
```

#### Activate/Deactivate

```bash
# Update isActive field in database
db.samlConfigs.updateOne(
  { school: "rpi" },
  { $set: { isActive: true } }
)
```

---

## Certificate Management

### Certificate Storage

Certificates are stored **directly in MongoDB** for consistency across deployments:

- ✅ **No file system dependencies**
- ✅ **Consistent across environments**
- ✅ **Easy backup and restore**
- ✅ **Secure storage**

### Certificate Generation

```bash
# Generate new certificates for existing config
node scripts/setupSAML.js rpi --update-certs

# Generate during initial setup
node scripts/setupSAML.js berkeley --interactive
```

### Certificate Rotation

1. **Generate new certificates**
   ```bash
   node scripts/setupSAML.js rpi --update-certs
   ```

2. **Coordinate with IdP team**
   - Provide new certificate
   - Schedule update window
   - Update IdP configuration

3. **Test authentication**
   - Verify login works
   - Check metadata endpoint
   - Monitor logs

### Certificate Validation

```bash
# Check certificate details
openssl x509 -in cert.pem -text -noout

# Validate certificate chain
openssl verify cert.pem

# Check expiration
openssl x509 -in cert.pem -noout -dates
```

---

## Testing & Validation

### 1. Configuration Validation

```bash
# Validate SAML configuration
node scripts/setupSAML.js rpi --validate
```

### 2. Metadata Testing

```bash
# Test metadata generation
node show-working-metadata.js

# Check metadata endpoint
curl https://rpi.study-compass.com/auth/saml/metadata
```

### 3. Authentication Testing

```bash
# Test SAML service
node test-saml.js

# Test login flow
curl https://rpi.study-compass.com/auth/saml/login
```

### 4. Integration Testing

```bash
# Test complete flow
node debug-metadata.js

# Check certificate inclusion
grep -i "X509Certificate" metadata.xml
```

### 5. User Provisioning Testing

```bash
# Test user creation
# (Requires actual SAML login)

# Check user attributes
db.users.findOne({ samlProvider: "rpi" })
```

---

## Debugging & Troubleshooting

### Debug Mode

Enable debug logging:

```bash
# Set environment variable
export SAML_DEBUG=true

# Or in .env file
SAML_DEBUG=true
```

### Common Debug Commands

```bash
# Check configuration status
node scripts/setupSAML.js rpi --validate

# Debug metadata generation
node debug-metadata.js

# Test SAML service
node test-saml.js

# Check database configuration
node -e "
const mongoose = require('mongoose');
const samlConfigSchema = require('./schemas/samlConfig');
mongoose.connect(process.env.MONGO_URL_LOCAL).then(async () => {
  const SAMLConfig = mongoose.model('SAMLConfig', samlConfigSchema, 'samlConfigs');
  const config = await SAMLConfig.findOne({ school: 'rpi' });
  console.log('Config:', config ? 'Found' : 'Not found');
  console.log('Active:', config?.isActive);
  console.log('Cert length:', config?.sp?.x509Cert?.length);
  mongoose.disconnect();
});
"
```

### Log Analysis

```bash
# Monitor SAML logs
tail -f logs/app.log | grep -i saml

# Check for errors
grep -i "error\|exception" logs/app.log | grep -i saml

# Monitor authentication attempts
grep -i "saml.*login" logs/app.log
```

### Network Debugging

```bash
# Test IdP connectivity
curl -I https://auth.rpi.edu/saml/metadata

# Check certificate validity
openssl s_client -connect auth.rpi.edu:443 -servername auth.rpi.edu

# Test SAML endpoints
curl -X GET https://rpi.study-compass.com/auth/saml/metadata
curl -X GET https://rpi.study-compass.com/auth/saml/login
```

---

## Production Deployment

### 1. Database Migration

Export configuration from development:

```bash
# Export SAML configuration
mongoexport --db studycompass --collection samlConfigs \
  --query '{"school": "rpi"}' --out rpi-saml-config.json

# Import to production
mongoimport --db studycompass --collection samlConfigs \
  --file rpi-saml-config.json
```

### 2. Environment Setup

```bash
# Set production environment variables
export NODE_ENV=production
export MONGO_URL=your-production-mongo-url

# Disable debug mode
export SAML_DEBUG=false
```

### 3. Certificate Verification

```bash
# Verify certificates in production
node scripts/setupSAML.js rpi --validate

# Test metadata endpoint
curl https://rpi.study-compass.com/auth/saml/metadata

# Check certificate inclusion
curl https://rpi.study-compass.com/auth/saml/metadata | grep -i "X509Certificate"
```

### 4. Monitoring Setup

```bash
# Monitor SAML authentication
heroku logs --tail | grep -i saml

# Set up alerts for failures
# (Configure in your monitoring system)

# Monitor certificate expiration
# (Set up automated checks)
```

### 5. Backup Strategy

```bash
# Backup SAML configurations
mongoexport --db studycompass --collection samlConfigs --out saml-backup.json

# Backup certificates separately
# (Store securely, not in version control)
```

---

## Security Best Practices

### 1. Certificate Security

- ✅ **Store certificates in database** (not files)
- ✅ **Use 10-year certificates** for stability
- ✅ **Rotate certificates** before expiration
- ✅ **Backup certificates** securely
- ✅ **Monitor certificate expiration**

### 2. Configuration Security

- ✅ **Validate all URLs** before saving
- ✅ **Use HTTPS** for all endpoints
- ✅ **Validate certificates** before use
- ✅ **Restrict admin access** to SAML config
- ✅ **Audit configuration changes**

### 3. Authentication Security

- ✅ **Require signed assertions** (`wantAssertionsSigned: true`)
- ✅ **Validate SAML responses** thoroughly
- ✅ **Use secure session management**
- ✅ **Implement proper logout**
- ✅ **Monitor authentication logs**

### 4. Network Security

- ✅ **Use HTTPS** for all SAML communications
- ✅ **Validate IdP certificates**
- ✅ **Implement proper CORS** policies
- ✅ **Use secure headers**
- ✅ **Monitor for suspicious activity**

### 5. Access Control

- ✅ **Limit admin access** to SAML configuration
- ✅ **Use role-based access** control
- ✅ **Audit all changes** to SAML config
- ✅ **Implement proper authentication** for admin endpoints
- ✅ **Monitor admin actions**

---

## API Reference

### Authentication Endpoints

#### Initiate SAML Login
```http
GET /auth/saml/login
```

**Parameters:**
- `relayState` (optional) - State to return after authentication

**Response:** Redirects to IdP

#### SAML Callback
```http
POST /auth/saml/callback
```

**Body:** SAML response from IdP

**Response:** JWT tokens and user data

#### SAML Logout
```http
POST /auth/saml/logout
```

**Response:** Logout confirmation

### Configuration Endpoints

#### Get SAML Metadata
```http
GET /auth/saml/metadata
```

**Response:** XML metadata for IdP configuration

#### Get Configuration
```http
GET /auth/saml/config
```

**Headers:**
- `Authorization: Bearer <admin-token>`

**Response:** Current SAML configuration (without sensitive data)

#### Update Configuration
```http
POST /auth/saml/config
```

**Headers:**
- `Authorization: Bearer <admin-token>`
- `Content-Type: application/json`

**Body:** SAML configuration object

**Response:** Configuration update confirmation

#### Test Configuration
```http
POST /auth/saml/test
```

**Headers:**
- `Authorization: Bearer <admin-token>`

**Response:** Configuration test results

### Response Formats

#### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

#### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

---

## Troubleshooting FAQ

### Q: "SAML response is required" error

**A:** The IdP is not sending a proper SAML response. Check:
- IdP configuration is correct
- Certificate is properly configured
- URLs match exactly
- IdP is accessible

### Q: Certificate not included in metadata

**A:** The certificate is not being properly configured. Check:
- Certificate is stored in database
- `signingCert` field is set in samlify config
- Certificate format is correct (PEM)
- No extra whitespace or encoding issues

### Q: "Invalid SAML response" error

**A:** The SAML response format is incorrect. Check:
- IdP is sending valid SAML 2.0 response
- Response is properly signed
- Certificate validation is working
- Response is not expired

### Q: User not being created from SAML

**A:** User provisioning is not working. Check:
- `autoCreateUsers` is enabled
- Required attributes are being sent
- Attribute mapping is correct
- Email address is valid

### Q: SAML login redirects in a loop

**A:** There's a configuration mismatch. Check:
- Entity IDs match exactly
- URLs are correct and accessible
- Certificate is valid
- Relay state is being handled properly

### Q: Certificate expired or invalid

**A:** Certificate needs to be updated. Run:
```bash
node scripts/setupSAML.js rpi --update-certs
```

### Q: Metadata endpoint returns 404

**A:** SAML routes are not properly configured. Check:
- Routes are registered in Express
- Middleware is properly configured
- Database connection is working
- Configuration exists and is active

### Q: SAML authentication works locally but not in production

**A:** Environment differences. Check:
- Database connection strings
- Environment variables
- Network connectivity to IdP
- Certificate consistency
- URL configurations

### Q: How to add a new university?

**A:** Use the interactive setup:
```bash
node scripts/setupSAML.js newuniversity --interactive
```

### Q: How to update certificates?

**A:** Use the update command:
```bash
node scripts/setupSAML.js university --update-certs
```

### Q: How to backup SAML configurations?

**A:** Export from MongoDB:
```bash
mongoexport --db studycompass --collection samlConfigs --out backup.json
```

---

## Support & Maintenance

### Regular Maintenance Tasks

1. **Monitor certificate expiration** (monthly)
2. **Review authentication logs** (weekly)
3. **Update SAML configurations** (as needed)
4. **Backup configurations** (monthly)
5. **Test authentication flows** (quarterly)

### Monitoring Checklist

- [ ] Certificate expiration dates
- [ ] Authentication success/failure rates
- [ ] SAML response times
- [ ] Error rates in logs
- [ ] User provisioning success
- [ ] IdP availability

### Emergency Procedures

1. **Certificate expiration**: Use `--update-certs` immediately
2. **Authentication failure**: Check IdP status and configuration
3. **Database issues**: Restore from backup
4. **Security breach**: Rotate certificates and review logs

---

**Last Updated**: July 10, 2025  
**Version**: 1.0  
**Maintainer**: Study Compass Development Team 