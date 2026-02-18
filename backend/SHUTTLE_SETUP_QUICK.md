# Quick Setup: Shuttle Tracker for RPI

## Quick Setup (3 Methods)

### Method 1: API Endpoint (Easiest)

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

### Method 2: Setup Script

```bash
cd Meridian/backend
node scripts/setupShuttleConfig.js rpi https://api-shuttles.rpi.edu
```

### Method 3: MongoDB Direct

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

## Verify Setup

```bash
# Check config (public endpoint)
curl http://localhost:5001/api/shuttle-config

# Should return:
# {
#   "success": true,
#   "data": {
#     "apiBaseUrl": "https://api-shuttles.rpi.edu",
#     "enabled": true
#   }
# }
```

## Test API

```bash
# Test RPI shuttle API directly
curl https://api-shuttles.rpi.edu/api/locations
```

## Full Documentation

See `docs/SHUTTLE_TRACKER_SETUP.md` for complete setup guide.
