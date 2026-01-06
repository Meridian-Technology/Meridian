const inngest = require('./client');

// Function: Process room checkout workflow
const processRoomCheckout = inngest.createFunction(
  { id: 'process-room-checkout' },
  { event: 'room.checkout' },
  async ({ event, step }) => {
    const { userId, roomId, checkoutTime, reason } = event.data;
    
    // Step 1: Validate the checkout request
    const validation = await step.run('validate-checkout', async () => {
      console.log(`Validating room checkout for user ${userId} from room ${roomId}`);
      // Check if user is actually checked into the room
      // Check if room exists and is valid
      // This could fail due to database issues, so Inngest will retry
      return { valid: true, userCheckedIn: true };
    });
    
    if (!validation.valid) {
      return { success: false, reason: 'Invalid checkout request' };
    }
    
    if (!validation.userCheckedIn) {
      return { success: false, reason: 'User is not checked into this room' };
    }
    
    // Step 2: Update room occupancy
    const roomUpdate = await step.run('update-room-occupancy', async () => {
      console.log(`Updating room ${roomId} occupancy - removing user ${userId}`);
      // Decrement room occupancy count
      // Remove user from room's current occupants list
      // This could fail due to database issues, so Inngest will retry
      return { occupancyUpdated: true };
    });
    
    // Step 3: Record checkout in study history
    const studyHistory = await step.run('record-study-history', async () => {
      console.log(`Recording study session for user ${userId} in room ${roomId}`);
      // Create or update study history record
      // Calculate session duration
      // This could fail due to database issues, so Inngest will retry
      return { historyRecorded: true, sessionDuration: 45 }; // minutes
    });
    
    // Step 4: Update user's current room status
    const userUpdate = await step.run('update-user-status', async () => {
      console.log(`Updating user ${userId} status - removing from room ${roomId}`);
      // Set user's currentRoom to null
      // Update lastCheckout time
      // This could fail due to database issues, so Inngest will retry
      return { userStatusUpdated: true };
    });
    
    // Step 5: Send checkout notification
    const notification = await step.run('send-checkout-notification', async () => {
      console.log(`Sending checkout notification to user ${userId}`);
      // Send in-app notification about successful checkout
      // Could include session summary, study time, etc.
      return { notificationSent: true };
    });
    
    // Step 6: Update analytics
    const analytics = await step.run('update-checkout-analytics', async () => {
      console.log(`Updating checkout analytics for room ${roomId}`);
      // Track room utilization metrics
      // Update user study time statistics
      // This could fail due to database issues, so Inngest will retry
      return { analyticsUpdated: true };
    });
    
    return { 
      success: true, 
      occupancyUpdated: roomUpdate.occupancyUpdated,
      historyRecorded: studyHistory.historyRecorded,
      sessionDuration: studyHistory.sessionDuration,
      userStatusUpdated: userUpdate.userStatusUpdated,
      notificationSent: notification.notificationSent,
      analyticsUpdated: analytics.analyticsUpdated
    };
  }
);

// Function: Auto checkout after 2 hours
const autoCheckoutAfterDelay = inngest.createFunction(
  { id: 'auto-checkout-after-delay' },
  { event: 'room.checkin' },
  async ({ event, step }) => {
    const { userId, roomId, checkinTime } = event.data;
    
    // Wait for 2 hours before auto-checkout
    await step.sleep('wait-2-hours', '2h');
    
    // After 2 hours, trigger the checkout
    const checkoutResult = await step.run('trigger-auto-checkout', async () => {
      console.log(`Auto-checking out user ${userId} from room ${roomId} after 2 hours`);
      
      // Send the checkout event
      const { sendRoomCheckoutEvent } = require('./events');
      await sendRoomCheckoutEvent(userId, roomId, new Date(), 'Auto-checkout after 2 hours');
      
      return { autoCheckoutTriggered: true };
    });
    
    return { 
      success: true, 
      autoCheckoutTriggered: checkoutResult.autoCheckoutTriggered,
      originalCheckinTime: checkinTime,
      checkoutTime: new Date().toISOString()
    };
  }
);

// Function: Test Inngest connection with callback (from route)
const testInngestConnection = inngest.createFunction(
  { id: 'test-inngest-connection' },
  { event: 'test.connection' },
  async ({ event, step }) => {
    const { testId, message, callbackUrl } = event.data;
    
    // Step 1: Log the received event
    const logReceived = await step.run('log-received-event', async () => {
      console.log(`[INNGEST] Received test event: ${testId} - ${message}`);
      return { received: true, timestamp: new Date().toISOString() };
    });
    
    // Step 2: Wait a moment to simulate processing
    await step.sleep('simulate-processing', '2s');
    
    // Step 3: Send callback request back to the backend
    const sendCallback = await step.run('send-callback', async () => {
      console.log(`[INNGEST] Sending callback for test: ${testId}`);
      
      try {
        const axios = require('axios');
        const response = await axios.post(callbackUrl, {
          testId,
          originalMessage: message,
          inngestReceivedAt: logReceived.timestamp,
          callbackSentAt: new Date().toISOString(),
          status: 'success',
          message: 'Inngest connection test successful!'
        });
        
        console.log(`[INNGEST] Callback sent successfully: ${response.status}`);
        return { callbackSent: true, status: response.status };
      } catch (error) {
        console.error(`[INNGEST] Callback failed:`, error.message);
        return { callbackSent: false, error: error.message };
      }
    });
    
    return { 
      success: true, 
      testId,
      received: logReceived.received,
      callbackSent: sendCallback.callbackSent,
      status: sendCallback.status || 'error',
      error: sendCallback.error || null
    };
  }
);

// Function: Test Inngest connection directly from dashboard
const testInngestDashboard = inngest.createFunction(
  { id: 'test-inngest-dashboard' },
  { event: 'test.dashboard' },
  async ({ event, step }) => {
    const { message } = event.data;
    const testId = `dashboard-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Step 1: Log the received event
    const logReceived = await step.run('log-dashboard-event', async () => {
      console.log('='.repeat(60));
      console.log('🎯 INNGEST DASHBOARD TEST TRIGGERED!');
      console.log('='.repeat(60));
      console.log(`Test ID: ${testId}`);
      console.log(`Message: ${message || 'Dashboard test triggered'}`);
      console.log(`Triggered At: ${new Date().toISOString()}`);
      console.log('='.repeat(60));
      return { received: true, timestamp: new Date().toISOString() };
    });
    
    // Step 2: Wait a moment to simulate processing
    await step.sleep('simulate-dashboard-processing', '3s');
    
    // Step 3: Create callback URL and send request back to backend
    const sendCallback = await step.run('send-dashboard-callback', async () => {
      console.log(`[INNGEST] Sending dashboard test callback for: ${testId}`);
      
      try {
        const axios = require('axios');
        
        // Create callback URL
        const baseUrl = process.env.NODE_ENV === 'production' 
          ? 'https://meridian.study' 
          : 'http://localhost:5001';
        const callbackUrl = `${baseUrl}/api/inngest-examples/test-callback`;
        
        const response = await axios.post(callbackUrl, {
          testId,
          originalMessage: message || 'Dashboard test triggered',
          inngestReceivedAt: logReceived.timestamp,
          callbackSentAt: new Date().toISOString(),
          status: 'success',
          message: 'Inngest dashboard test successful!',
          source: 'dashboard'
        });
        
        console.log(`[INNGEST] Dashboard callback sent successfully: ${response.status}`);
        return { callbackSent: true, status: response.status };
      } catch (error) {
        console.error(`[INNGEST] Dashboard callback failed:`, error.message);
        return { callbackSent: false, error: error.message };
      }
    });
    
    // Step 4: Log completion
    const logCompletion = await step.run('log-completion', async () => {
      console.log('='.repeat(60));
      console.log('✅ INNGEST DASHBOARD TEST COMPLETED!');
      console.log('='.repeat(60));
      console.log(`Test ID: ${testId}`);
      console.log(`Callback Sent: ${sendCallback.callbackSent}`);
      console.log(`Status: ${sendCallback.status || 'error'}`);
      console.log(`Completed At: ${new Date().toISOString()}`);
      console.log('='.repeat(60));
      return { completed: true };
    });
    
    return { 
      success: true, 
      testId,
      received: logReceived.received,
      callbackSent: sendCallback.callbackSent,
      status: sendCallback.status || 'error',
      error: sendCallback.error || null,
      completed: logCompletion.completed
    };
  }
);

// Export all functions
module.exports = {
  processRoomCheckout,
  autoCheckoutAfterDelay,
  testInngestConnection,
  testInngestDashboard,
};
