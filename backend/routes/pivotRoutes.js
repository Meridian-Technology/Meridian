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
const {
  pivotRequestLogger,
  logPivotRouteError,
  logPivotServiceReject,
  logPivotServiceSuccess,
} = require('../utilities/pivotLogger');

const router = express.Router();

router.use(pivotRequestLogger);

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
    logPivotRouteError('POST /pivot/referral/validate', err, req);
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
    logPivotRouteError('POST /pivot/referral/redeem', err, req);
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
    logPivotRouteError('GET /pivot/tags', err, req);
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
    logPivotRouteError('GET /pivot/profile/interests', err, req);
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
    logPivotRouteError('PUT /pivot/profile/interests', err, req);
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
    logPivotRouteError('GET /pivot/config', err, req);
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
      logPivotServiceReject('GET /pivot/feed', result, req, {
        batchWeek: req.query.batchWeek,
      });
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    logPivotServiceSuccess('GET /pivot/feed', req, {
      batchWeek: result.data?.batchWeek,
      eventCount: result.data?.events?.length ?? 0,
      excludeEventIds: req.query.excludeEventIds || undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('GET /pivot/feed', err, req);
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
      logPivotServiceReject('POST /pivot/feed/action', result, req, {
        eventId: req.body?.eventId,
        action: req.body?.action,
      });
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    logPivotServiceSuccess('POST /pivot/feed/action', req, {
      eventId: result.data?.eventId,
      status: result.data?.status,
      batchWeek: result.data?.batchWeek,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('POST /pivot/feed/action', err, req);
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
      logPivotServiceReject('POST /pivot/intent/:eventId/external-open', result, req, {
        eventId: req.params.eventId,
      });
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    logPivotServiceSuccess('POST /pivot/intent/:eventId/external-open', req, {
      eventId: result.data?.eventId,
      status: result.data?.status,
      externalOpenCount: result.data?.externalOpenCount,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('POST /pivot/intent/:eventId/external-open', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to record external open.',
    });
  }
});

router.post('/intent/:eventId/registered', verifyToken, async (req, res) => {
  try {
    const result = await confirmRegistered(req, req.params.eventId, req.body);
    if (result.error) {
      logPivotServiceReject('POST /pivot/intent/:eventId/registered', result, req, {
        eventId: req.params.eventId,
        timeSlotId: req.body?.timeSlotId,
      });
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    logPivotServiceSuccess('POST /pivot/intent/:eventId/registered', req, {
      eventId: result.data?.eventId,
      status: result.data?.status,
      timeSlotId: result.data?.timeSlotId,
      batchWeek: result.data?.batchWeek,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('POST /pivot/intent/:eventId/registered', err, req);
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
    logPivotRouteError('GET /pivot/friends', err, req);
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
    logPivotRouteError('GET /pivot/friends/requests', err, req);
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
    logPivotRouteError('POST /pivot/friends/requests/:friendshipId/accept', err, req);
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
    logPivotRouteError('POST /pivot/friends/requests/:friendshipId/decline', err, req);
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
    logPivotRouteError('GET /pivot/friends/search', err, req);
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
    logPivotRouteError('POST /pivot/friends/request', err, req);
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
    logPivotRouteError('GET /pivot/events/:eventId/friends', err, req);
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
      logPivotServiceReject('GET /pivot/week-recap', result, req, {
        batchWeek: req.query.batchWeek,
      });
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    logPivotServiceSuccess('GET /pivot/week-recap', req, {
      batchWeek: result.data?.batchWeek,
      eventCount: result.data?.events?.length ?? 0,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('GET /pivot/week-recap', err, req);
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
    logPivotRouteError('GET /pivot/feedback/pending', err, req);
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
    logPivotRouteError('POST /pivot/feedback', err, req);
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
    logPivotRouteError('GET /pivot/dev/feedback', err, req);
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
    logPivotRouteError('POST /pivot/dev/reset-week-actions', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to reset week actions.',
    });
  }
});

module.exports = router;
