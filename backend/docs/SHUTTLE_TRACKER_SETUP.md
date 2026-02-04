# Shuttle Tracker Setup Guide

This guide explains how to configure the Shuttle Tracker feature for schools in the Meridian backend.

## Overview

The Shuttle Tracker feature allows schools to display real-time shuttle/bus tracking information in the mobile app. Each school can have its own shuttle API configuration stored in the database.

## Prerequisites

- Backend server running
- Admin/root user access
- MongoDB connection configured
- School subdomain (e.g., 'rpi' for RPI)

## Setup Methods

### Method 1: Using the API Endpoint (Recommended)

Use the admin API endpoint to create or update shuttle configuration:

```bash
POST /api/shuttle-config
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "school": "rpi",
  "apiBaseUrl": "https://api-shuttles.rpi.edu",
  "enabled": true
}
```

**Example using curl:**
```bash
curl -X POST http://localhost:5001/api/shuttle-config \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "school": "rpi",
    "apiBaseUrl": "https://api-shuttles.rpi.edu",
    "enabled": true
  }'
```

### Method 2: Using the Setup Script

Run the setup script from the backend directory:

```bash
cd Meridian/backend
node scripts/setupShuttleConfig.js rpi https://api-shuttles.rpi.edu
```

**Arguments:**
- First argument: School subdomain (default: 'rpi')
- Second argument: API base URL (default: 'https://api-shuttles.rpi.edu')

### Method 3: Direct Database Insert

You can also insert directly into MongoDB:

```javascript
db.shuttleConfigs.insertOne({
  school: "rpi",
  apiBaseUrl: "https://api-shuttles.rpi.edu",
  enabled: true,
  lastUpdated: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
})
```

## RPI Setup Instructions

### Step 1: Verify API Endpoint

First, verify that the RPI shuttle API is accessible:

```bash
curl https://api-shuttles.rpi.edu/api/locations
```

You should receive a JSON response with vehicle locations (may be empty if no vehicles are active).

### Step 2: Configure Backend

**Option A: Using API (if you have admin access)**

```bash
# Get your admin token first (login via API)
# Then use it to create the config:
curl -X POST http://localhost:5001/api/shuttle-config \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "school": "rpi",
    "apiBaseUrl": "https://api-shuttles.rpi.edu",
    "enabled": true
  }'
```

**Option B: Using Setup Script**

```bash
cd Meridian/backend
node scripts/setupShuttleConfig.js rpi https://api-shuttles.rpi.edu
```

### Step 3: Verify Configuration

Check that the configuration was saved:

```bash
# Public endpoint (no auth required)
curl http://localhost:5001/api/shuttle-config

# Admin endpoint (requires auth)
curl http://localhost:5001/api/shuttle-config/admin \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "apiBaseUrl": "https://api-shuttles.rpi.edu",
    "enabled": true
  }
}
```

### Step 4: Test in Mobile App

1. Rebuild the mobile app (required for react-native-maps)
2. Navigate to Resources → Transportation → Shuttle Tracker
3. Or use the temporary test button on the HomeScreen

## API Endpoints

### Public Endpoints

- `GET /api/shuttle-config` - Get shuttle config for current school (uses `req.school`)

### Admin Endpoints (Require Authentication)

- `POST /api/shuttle-config` - Create or update shuttle config
- `GET /api/shuttle-config/admin` - Get all shuttle configs
- `DELETE /api/shuttle-config/:school` - Delete shuttle config for a school

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `school` | String | Yes | School subdomain (e.g., 'rpi', 'berkeley') |
| `apiBaseUrl` | String | Yes | Base URL of the shuttle API (e.g., 'https://api-shuttles.rpi.edu') |
| `enabled` | Boolean | No | Whether shuttle tracker is enabled (default: true) |

## Adding More Schools

To add shuttle tracker for additional schools, repeat the setup process with different school codes:

```bash
# Example: Adding Berkeley
curl -X POST http://localhost:5001/api/shuttle-config \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "school": "berkeley",
    "apiBaseUrl": "https://api-shuttles.berkeley.edu",
    "enabled": true
  }'
```

## Troubleshooting

### Config Not Found

If the mobile app shows "Shuttle tracker is not available for this school":
- Verify the config exists: `GET /api/shuttle-config/admin`
- Check that `req.school` matches the config's `school` field
- Ensure `enabled` is set to `true`

### API Not Responding

If the shuttle API is not accessible:
- Verify the API URL is correct and accessible
- Check CORS settings on the shuttle API
- Ensure the API follows the expected format (see ShuttleTracker.mdx)

### Mobile App Not Showing Map

- Rebuild the app after adding `react-native-maps`
- Check that `react-native-maps` is properly installed
- Verify app.config.js doesn't need additional configuration

## Database Schema

The shuttle config is stored in the `shuttleConfigs` collection:

```javascript
{
  school: String,           // Unique, indexed
  apiBaseUrl: String,       // Required
  enabled: Boolean,         // Default: true
  lastUpdated: Date,        // Auto-updated
  createdAt: Date,          // Auto-set
  updatedAt: Date          // Auto-updated
}
```

## Security Notes

- Public endpoint (`GET /api/shuttle-config`) only returns config for the current school
- Admin endpoints require authentication and admin/root role
- API base URLs should use HTTPS in production
- Consider rate limiting on public endpoints if needed

## Next Steps

After setup:
1. Test the configuration using the API endpoints
2. Rebuild the mobile app
3. Test the shuttle tracker in the mobile app
4. Remove the temporary test button from HomeScreen once verified
