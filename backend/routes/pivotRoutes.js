const express = require('express');
const { body, validationResult } = require('express-validator');
const { validateReferralCode, redeemReferralCode } = require('../services/pivotReferralCodeService');
const { getPivotFeed, getPivotEventFriends } = require('../services/pivotFeedService');
const {
  recordFeedAction,
  recordExternalOpen,
  confirmRegistered,
  getWeekRecap,
  resetWeekActions,
} = require('../services/pivotIntentService');
const {
  getPendingEventFeedback,
  submitEventFeedback,
  listUserPivotEventFeedback,
} = require('../services/pivotFeedbackService');
const { getPivotConfig } = require('../services/pivotConfigService');
const { listPivotTags } = require('../services/pivotTagCatalogService');
const {
  getPivotProfileInterests,
  updatePivotProfileInterests,
} = require('../services/pivotProfileService');
const {
  searchPivotFriends,
  sendPivotFriendRequest,
  listPivotFriends,
  listPivotFriendRequests,
  acceptPivotFriendRequest,
  declinePivotFriendRequest,
} = require('../services/pivotFriendService');
const {
  pivotReferralValidateRateLimit,
} = require('../middlewares/pivotReferralValidateRateLimit');

const { verifyToken } = require('../middlewares/verifyToken');

const router = express.Router();

router.post('/referral/validate', pivotReferralValidateRateLimit, async (req, res) => {
  try {
    const result = await validateReferralCode(req, req.body?.code);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/referral/validate failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to validate referral code.',
    });
  }
});

router.post('/referral/redeem', verifyToken, async (req, res) => {
  try {
    const result = await redeemReferralCode(req, req.body?.code);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/referral/redeem failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to redeem referral code.',
    });
  }
});

router.get('/tags', verifyToken, async (req, res) => {
  try {
    const result = await listPivotTags(req);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/tags failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot tags.',
    });
  }
});

router.get('/profile/interests', verifyToken, async (req, res) => {
  try {
    const result = await getPivotProfileInterests(req);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/profile/interests failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot interests.',
    });
  }
});

router.put('/profile/interests', verifyToken, async (req, res) => {
  try {
    const result = await updatePivotProfileInterests(req, req.body);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('PUT /pivot/profile/interests failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to save pivot interests.',
    });
  }
});

router.get('/config', verifyToken, async (req, res) => {
  try {
    const result = await getPivotConfig(req, { batchWeek: req.query.batchWeek });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/config failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot config.',
    });
  }
});

router.get('/feed', verifyToken, async (req, res) => {
  try {
    const result = await getPivotFeed(req, {
      batchWeek: req.query.batchWeek,
      excludeEventIds: req.query.excludeEventIds,
    });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/feed failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot feed.',
    });
  }
});

router.post('/feed/action', verifyToken, async (req, res) => {
  try {
    const result = await recordFeedAction(req, req.body);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/feed/action failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to record pivot intent.',
    });
  }
});

router.post('/intent/:eventId/external-open', verifyToken, async (req, res) => {
  try {
    const result = await recordExternalOpen(req, req.params.eventId, req.body);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/intent/:eventId/external-open failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to record external open.',
    });
  }
});

router.post('/intent/:eventId/registered', verifyToken, async (req, res) => {
  try {
    const result = await confirmRegistered(req, req.params.eventId);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/intent/:eventId/registered failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to confirm registration.',
    });
  }
});

router.get('/friends', verifyToken, async (req, res) => {
  try {
    const result = await listPivotFriends(req);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/friends failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load friends.',
    });
  }
});

router.get('/friends/requests', verifyToken, async (req, res) => {
  try {
    const result = await listPivotFriendRequests(req);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/friends/requests failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load friend requests.',
    });
  }
});

router.post('/friends/requests/:friendshipId/accept', verifyToken, async (req, res) => {
  try {
    const result = await acceptPivotFriendRequest(req, req.params.friendshipId);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/friends/requests/:friendshipId/accept failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to accept friend request.',
    });
  }
});

router.post('/friends/requests/:friendshipId/decline', verifyToken, async (req, res) => {
  try {
    const result = await declinePivotFriendRequest(req, req.params.friendshipId);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/friends/requests/:friendshipId/decline failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to decline friend request.',
    });
  }
});

router.get('/friends/search', verifyToken, async (req, res) => {
  try {
    const result = await searchPivotFriends(req, { q: req.query.q });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/friends/search failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to search friends.',
    });
  }
});

router.post('/friends/request', verifyToken, async (req, res) => {
  try {
    const result = await sendPivotFriendRequest(req, req.body);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(201).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/friends/request failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to send friend request.',
    });
  }
});

router.get('/events/:eventId/friends', verifyToken, async (req, res) => {
  try {
    const result = await getPivotEventFriends(req, req.params.eventId);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/events/:eventId/friends failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load event friends.',
    });
  }
});

router.get('/week-recap', verifyToken, async (req, res) => {
  try {
    const result = await getWeekRecap(req, { batchWeek: req.query.batchWeek });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/week-recap failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load week recap.',
    });
  }
});

router.get('/feedback/pending', verifyToken, async (req, res) => {
  try {
    const result = await getPendingEventFeedback(req);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/feedback/pending failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pending feedback.',
    });
  }
});

router.post('/feedback', [
  verifyToken,
  body('eventId').trim().notEmpty().withMessage('eventId is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be 1–5'),
  body('comment').optional().isString().trim().isLength({ max: 500 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array(),
        code: 'VALIDATION_ERROR',
      });
    }

    const result = await submitEventFeedback(req, req.body);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/feedback failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to submit feedback.',
    });
  }
});

router.get('/dev/feedback', verifyToken, async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({
      success: false,
      message: 'Not found.',
    });
  }

  try {
    const result = await listUserPivotEventFeedback(req, {
      limit: req.query.limit,
    });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('GET /pivot/dev/feedback failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot feedback.',
    });
  }
});

router.post('/dev/reset-week-actions', verifyToken, async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({
      success: false,
      message: 'Not found.',
    });
  }

  try {
    const result = await resetWeekActions(req, { batchWeek: req.body?.batchWeek });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/dev/reset-week-actions failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to reset week actions.',
    });
  }
});

module.exports = router;
