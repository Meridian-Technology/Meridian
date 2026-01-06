const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { sendRoomCheckoutEvent, sendTestConnectionEvent } = require('../inngest/events');
const getModels = require('../services/getModelService');

const router = express.Router();

// Route to check out a user from a room
router.post('/checkout-room', verifyToken, async (req, res) => {
  try {
    const { roomId, reason } = req.body;
    const userId = req.user.userId;
    
    if (!roomId) {
      return res.status(400).json({ 
        success: false, 
        message: 'roomId is required' 
      });
    }
    
    // Get models for the current school
    const { User, Room } = getModels(req, 'User', 'Room');
    
    // Verify user is checked into the room
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    if (!user.currentRoom || user.currentRoom.toString() !== roomId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is not checked into this room' 
      });
    }
    
    // Verify room exists
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Room not found' 
      });
    }
    
    // Trigger the Inngest room checkout event
    await sendRoomCheckoutEvent(userId, roomId, new Date(), reason);
    
    res.json({ 
      success: true, 
      message: 'Room checkout initiated successfully',
      data: {
        userId,
        roomId,
        roomName: room.name,
        checkoutTime: new Date().toISOString(),
        reason
      }
    });
  } catch (error) {
    console.error('Error initiating room checkout:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error initiating room checkout' 
    });
  }
});

// Route to check out a user from their current room (no roomId needed)
router.post('/checkout-current-room', verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const userId = req.user.userId;
    
    // Get models for the current school
    const { User } = getModels(req, 'User');
    
    // Get user's current room
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    if (!user.currentRoom) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is not currently checked into any room' 
      });
    }
    
    const roomId = user.currentRoom.toString();
    
    // Trigger the Inngest room checkout event
    await sendRoomCheckoutEvent(userId, roomId, new Date(), reason);
    
    res.json({ 
      success: true, 
      message: 'Room checkout initiated successfully',
      data: {
        userId,
        roomId,
        checkoutTime: new Date().toISOString(),
        reason
      }
    });
  } catch (error) {
    console.error('Error initiating room checkout:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error initiating room checkout' 
    });
  }
});

// Route to test Inngest connection (triggers the test)
router.post('/test-connection', verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create callback URL for Inngest to send response back to
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://meridian.study' 
      : 'http://localhost:5001';
    const callbackUrl = `${baseUrl}/api/inngest-examples/test-callback`;
    
    // Send test event to Inngest
    await sendTestConnectionEvent(
      testId, 
      message || 'Testing Inngest connection', 
      callbackUrl
    );
    
    res.json({ 
      success: true, 
      message: 'Test event sent to Inngest',
      data: {
        testId,
        message: message || 'Testing Inngest connection',
        callbackUrl,
        sentAt: new Date().toISOString(),
        note: 'Check your Inngest dashboard and server logs for the callback response'
      }
    });
  } catch (error) {
    console.error('Error sending test connection event:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error sending test connection event',
      error: error.message
    });
  }
});

// Route to receive callback from Inngest
router.post('/test-callback', async (req, res) => {
  try {
    const { testId, originalMessage, inngestReceivedAt, callbackSentAt, status, message } = req.body;
    
    console.log('='.repeat(60));
    console.log('🎉 INNGEST CALLBACK RECEIVED!');
    console.log('='.repeat(60));
    console.log(`Test ID: ${testId}`);
    console.log(`Original Message: ${originalMessage}`);
    console.log(`Inngest Received At: ${inngestReceivedAt}`);
    console.log(`Callback Sent At: ${callbackSentAt}`);
    console.log(`Status: ${status}`);
    console.log(`Message: ${message}`);
    console.log('='.repeat(60));
    console.log('✅ Inngest connection test successful!');
    console.log('='.repeat(60));
    
    // You could also save this to a database, send notifications, etc.
    
    res.json({ 
      success: true, 
      message: 'Callback received successfully',
      data: {
        testId,
        receivedAt: new Date().toISOString(),
        originalMessage,
        inngestReceivedAt,
        callbackSentAt,
        status,
        message
      }
    });
  } catch (error) {
    console.error('Error processing callback:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing callback',
      error: error.message
    });
  }
});

module.exports = router;
