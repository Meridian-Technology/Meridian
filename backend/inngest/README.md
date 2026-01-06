# Inngest Integration for Meridian Backend

This directory contains the Inngest integration for the Meridian backend application. Inngest is a platform for building reliable, event-driven workflows.

## Files

- `client.js` - Inngest client configuration
- `functions.js` - Inngest function definitions
- `serve.js` - Express serve handler for Inngest functions
- `events.js` - Helper functions for sending events to Inngest

## Setup

1. **Install Dependencies**: The Inngest SDK is already installed in the backend package.json

2. **Environment Variables**: 
   - For development: No additional environment variables needed (connects to local dev server)
   - For production: Set `INNGEST_EVENT_KEY` environment variable

3. **Local Development**: 
   - Make sure your Inngest dev server is running (as shown in your terminal)
   - The backend will automatically connect to `http://localhost:8288`

## Available Functions

### 1. Send Welcome Email (`send-welcome-email`)
- **Trigger**: `user.registered` event
- **Purpose**: Sends a welcome email to newly registered users
- **Data**: `{ user: { id, email, username, name, school } }`

### 2. Process Room Checkout (`process-room-checkout`)
- **Trigger**: `room.checkout` event
- **Purpose**: Handles the complete room checkout workflow
- **Data**: `{ userId, roomId, checkoutTime, reason }`
- **Steps**:
  1. Validates checkout request
  2. Updates room occupancy
  3. Records study history
  4. Updates user status
  5. Sends checkout notification
  6. Updates analytics

### 3. Auto Checkout After Delay (`auto-checkout-after-delay`)
- **Trigger**: `room.checkin` event
- **Purpose**: Automatically checks out users after 2 hours
- **Data**: `{ userId, roomId, checkinTime }`
- **Steps**:
  1. Waits for 2 hours using Inngest's sleep function
  2. Triggers automatic checkout with reason "Auto-checkout after 2 hours"

### 4. Test Inngest Connection (`test-inngest-connection`)
- **Trigger**: `test.connection` event
- **Purpose**: Tests Inngest connection with round-trip communication (from route)
- **Data**: `{ testId, message, callbackUrl }`
- **Steps**:
  1. Logs the received event
  2. Waits 2 seconds to simulate processing
  3. Sends HTTP callback request back to the backend
  4. Logs the callback result

### 5. Test Inngest Dashboard (`test-inngest-dashboard`)
- **Trigger**: `test.dashboard` event
- **Purpose**: Tests Inngest connection directly from dashboard
- **Data**: `{ message }` (optional)
- **Steps**:
  1. Logs the dashboard trigger with beautiful formatting
  2. Waits 3 seconds to simulate processing
  3. Creates callback URL and sends HTTP request back to backend
  4. Logs completion with detailed results

## Usage

### Automatic Events
Some events are automatically triggered:
- User registration triggers `user.registered` event (in authRoutes.js)
- Room check-in triggers `room.checkin` event (in userRoutes.js) - schedules auto-checkout after 2 hours

### Manual Event Triggering
Use the routes in `/api/inngest-examples/` to trigger room checkout events:

```bash
# Check out from a specific room
POST /api/inngest-examples/checkout-room
{
  "roomId": "room123",
  "reason": "Study session completed"
}

# Check out from current room (no roomId needed)
POST /api/inngest-examples/checkout-current-room
{
  "reason": "Leaving for class"
}

# Test Inngest connection (round-trip test from route)
POST /api/inngest-examples/test-connection
{
  "message": "Hello from the backend!"
}

# Note: trigger-room-checkout route has been removed
# Auto-checkout is now handled automatically when users check in
```

### Programmatic Event Sending
Import and use the event helper functions:

```javascript
const { sendUserRegisteredEvent, sendRoomCheckoutEvent, sendRoomCheckinEvent, sendTestConnectionEvent } = require('./inngest/events');

// Send a user registration event
await sendUserRegisteredEvent({
  id: user._id,
  email: user.email,
  username: user.username,
  name: user.name,
  school: req.school
});

// Send a room check-in event (triggers auto-checkout after 2 hours)
await sendRoomCheckinEvent(userId, roomId, new Date());

// Send a room checkout event
await sendRoomCheckoutEvent(userId, roomId, new Date(), 'Study session completed');

// Send a test connection event
await sendTestConnectionEvent('test-123', 'Hello Inngest!', 'http://localhost:5001/api/inngest-examples/test-callback');
```

## Endpoints

- **Function Execution**: `/api/inngest/*` - Handled by Inngest serve handler
- **Room Checkout Routes**: `/api/inngest-examples/*` - Room checkout functionality
- **Test Routes**: 
  - `POST /api/inngest-examples/test-connection` - Trigger Inngest test
  - `POST /api/inngest-examples/test-callback` - Receive callback from Inngest

## Development

1. Start your Inngest dev server: `inngest dev`
2. Start your Meridian backend: `npm run server`
3. The functions will be automatically discovered and registered with Inngest
4. View function executions in the Inngest dev UI at `http://localhost:8288`

### Testing from Inngest Dashboard

You can now test functions directly from the Inngest dashboard:

1. **Open Inngest Dashboard**: Go to `http://localhost:8288`
2. **Find the function**: Look for `test-inngest-dashboard`
3. **Click "Invoke"**: This will open the function invocation dialog
4. **Enter test data**:
   ```json
   {
     "message": "Testing from dashboard!"
   }
   ```
5. **Click "Invoke"**: The function will run and send a callback back to your backend
6. **Check your backend logs**: You'll see the beautiful formatted output

This is perfect for testing without needing to make API calls!

## Production Deployment

1. Set up Inngest in production
2. Set the `INNGEST_EVENT_KEY` environment variable
3. Deploy your backend - functions will be automatically registered

## Adding New Functions

1. Add your function to `functions.js`
2. Export it from the module
3. Add it to the `serve.js` functions array
4. Create helper functions in `events.js` if needed
5. Use the helper functions in your routes

## Monitoring

- View function executions in the Inngest dashboard
- Check logs for function execution details
- Monitor function performance and errors
