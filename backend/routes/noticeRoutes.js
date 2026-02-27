const express = require('express');
const { verifyToken, verifyTokenOptional, authorizeRoles } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');
const { body, validationResult } = require('express-validator');

const router = express.Router();

/**
 * @route   GET /api/notice
 * @desc    Get active notice for mobile app (public)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const { NoticeConfig } = getModels(req, 'NoticeConfig');
    const config = await NoticeConfig.findOne({
      active: true,
      $or: [{ platform: 'mobile' }, { platform: { $exists: false } }]
    });

    if (!config) {
      return res.status(200).json({
        success: true,
        data: null
      });
    }

    res.status(200).json({
      success: true,
      data: {
        title: config.title,
        message: config.message,
        displayType: config.displayType,
        actionLabel: config.actionLabel || null,
        actionUrl: config.actionUrl || null
      }
    });
  } catch (error) {
    console.error('GET /api/notice failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notice',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/notice/web
 * @desc    Get active notice for web (filtered by showFor + auth)
 * @access  Public (optional auth via cookie)
 */
router.get('/web', verifyTokenOptional, async (req, res) => {
  try {
    const { NoticeConfig } = getModels(req, 'NoticeConfig');
    const config = await NoticeConfig.findOne({ active: true, platform: 'web' });

    if (!config) {
      return res.status(200).json({
        success: true,
        data: null
      });
    }

    const isAuthenticated = !!req.user;
    const showFor = config.showFor || 'both';

    const shouldShow =
      showFor === 'both' ||
      (showFor === 'guest' && !isAuthenticated) ||
      (showFor === 'authenticated' && isAuthenticated);

    if (!shouldShow) {
      return res.status(200).json({
        success: true,
        data: null
      });
    }

    res.status(200).json({
      success: true,
      data: {
        title: config.title,
        message: config.message,
        displayType: config.displayType,
        actionLabel: config.actionLabel || null,
        actionUrl: config.actionUrl || null
      }
    });
  } catch (error) {
    console.error('GET /api/notice/web failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notice',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/notice/admin
 * @desc    Get notice configs for admin (mobile + web, includes inactive)
 * @access  Private (Admin/Root)
 */
router.get('/admin', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
  try {
    const { NoticeConfig } = getModels(req, 'NoticeConfig');
    const [mobileConfig, webConfig] = await Promise.all([
      NoticeConfig.findOne({ $or: [{ platform: 'mobile' }, { platform: { $exists: false } }] }),
      NoticeConfig.findOne({ platform: 'web' })
    ]);

    const toConfigData = (c) =>
      c
        ? {
            active: c.active,
            title: c.title || '',
            message: c.message || '',
            displayType: c.displayType || 'banner',
            actionLabel: c.actionLabel || '',
            actionUrl: c.actionUrl || '',
            showFor: c.showFor || 'both',
            lastUpdated: c.lastUpdated
          }
        : {
            active: false,
            title: '',
            message: '',
            displayType: 'banner',
            actionLabel: '',
            actionUrl: '',
            showFor: 'both',
            lastUpdated: null
          };

    res.status(200).json({
      success: true,
      data: {
        mobile: toConfigData(mobileConfig),
        web: toConfigData(webConfig)
      }
    });
  } catch (error) {
    console.error('GET /api/notice/admin failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notice',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/notice
 * @desc    Update notice configuration (mobile or web)
 * @access  Private (Admin/Root)
 */
router.put('/', [
  verifyToken,
  authorizeRoles('admin', 'root'),
  body('platform').optional().isIn(['mobile', 'web']),
  body('showFor').optional().isIn(['guest', 'authenticated', 'both']),
  body('active').optional().isBoolean(),
  body('title').optional().trim().isLength({ max: 100 }),
  body('message').optional().trim().isLength({ max: 1000 }),
  body('displayType').optional().isIn(['banner', 'popup']),
  body('actionLabel').optional().trim().isLength({ max: 50 }),
  body('actionUrl').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { NoticeConfig } = getModels(req, 'NoticeConfig');
    const platform = req.body.platform || 'mobile';
    const { active, title, message, displayType, actionLabel, actionUrl, showFor } = req.body;

    const query =
      platform === 'mobile'
        ? { $or: [{ platform: 'mobile' }, { platform: { $exists: false } }] }
        : { platform: 'web' };

    let config = await NoticeConfig.findOne(query);

    if (!config) {
      config = new NoticeConfig({
        platform,
        showFor: platform === 'web' ? (showFor ?? 'both') : undefined,
        active: active ?? false,
        title: title ?? '',
        message: message ?? '',
        displayType: displayType ?? 'banner',
        actionLabel: actionLabel ?? '',
        actionUrl: actionUrl ?? ''
      });
    } else {
      if (typeof active !== 'undefined') config.active = active;
      if (title !== undefined) config.title = title;
      if (message !== undefined) config.message = message;
      if (displayType !== undefined) config.displayType = displayType;
      if (actionLabel !== undefined) config.actionLabel = actionLabel;
      if (actionUrl !== undefined) config.actionUrl = actionUrl;
      if (platform === 'web' && showFor !== undefined) config.showFor = showFor;
    }

    config.lastUpdated = new Date();
    await config.save();

    res.status(200).json({
      success: true,
      message: 'Notice updated successfully',
      data: {
        platform: config.platform,
        active: config.active,
        title: config.title,
        message: config.message,
        displayType: config.displayType,
        actionLabel: config.actionLabel || '',
        actionUrl: config.actionUrl || '',
        showFor: config.showFor || 'both',
        lastUpdated: config.lastUpdated
      }
    });
  } catch (error) {
    console.error('PUT /api/notice failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notice',
      error: error.message
    });
  }
});

module.exports = router;
