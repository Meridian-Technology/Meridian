const inngest = require('./client');

// Event helper functions for triggering Inngest functions

/**
 * Send a user registration event
 * @param {Object} user - User object with id, email, etc.
 */
const sendUserRegisteredEvent = async (user) => {
  try {
    await inngest.send({
      name: 'user.registered',
      data: { user },
    });
    console.log(`User registration event sent for user: ${user.id}`);
  } catch (error) {
    console.error('Error sending user registration event:', error);
  }
};

/**
 * Send a room checkout event
 * @param {string} userId - ID of the user checking out
 * @param {string} roomId - ID of the room being checked out from
 * @param {Date} checkoutTime - Time of checkout (defaults to now)
 * @param {string} reason - Reason for checkout (optional)
 */
const sendRoomCheckoutEvent = async (userId, roomId, checkoutTime = new Date(), reason = null) => {
  try {
    await inngest.send({
      name: 'room.checkout',
      data: { 
        userId, 
        roomId, 
        checkoutTime: checkoutTime.toISOString(),
        reason 
      },
    });
    console.log(`Room checkout event sent for user ${userId} from room ${roomId}`);
  } catch (error) {
    console.error('Error sending room checkout event:', error);
  }
};

/**
 * Send a room check-in event (triggers auto-checkout after 2 hours)
 * @param {string} userId - ID of the user checking in
 * @param {string} roomId - ID of the room being checked into
 * @param {Date} checkinTime - Time of check-in (defaults to now)
 */
const sendRoomCheckinEvent = async (userId, roomId, checkinTime = new Date()) => {
  try {
    await inngest.send({
      name: 'room.checkin',
      data: { 
        userId, 
        roomId, 
        checkinTime: checkinTime.toISOString()
      },
    });
    console.log(`Room check-in event sent for user ${userId} to room ${roomId} - auto-checkout scheduled for 2 hours`);
  } catch (error) {
    console.error('Error sending room check-in event:', error);
  }
};

/**
 * Send a test connection event
 * @param {string} testId - Unique test identifier
 * @param {string} message - Test message
 * @param {string} callbackUrl - URL to send callback to
 */
const sendTestConnectionEvent = async (testId, message, callbackUrl) => {
  try {
    await inngest.send({
      name: 'test.connection',
      data: { 
        testId, 
        message, 
        callbackUrl 
      },
    });
    console.log(`Test connection event sent: ${testId} - ${message}`);
  } catch (error) {
    console.error('Error sending test connection event:', error);
  }
};

module.exports = {
  sendUserRegisteredEvent,
  sendRoomCheckoutEvent,
  sendRoomCheckinEvent,
  sendTestConnectionEvent,
};
