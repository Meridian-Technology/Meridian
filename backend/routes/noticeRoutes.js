const express = require('express');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
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
    const config = await NoticeConfig.findOne({ active: true });

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
 * @route   GET /api/notice/admin
 * @desc    Get notice config for admin (includes inactive state)
 * @access  Private (Admin/Root)
 */
router.get('/admin', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
  try {
    const { NoticeConfig } = getModels(req, 'NoticeConfig');
    const config = await NoticeConfig.findOne();

    if (!config) {
      return res.status(200).json({
        success: true,
        data: {
          active: false,
          title: '',
          message: '',
          displayType: 'banner',
          actionLabel: '',
          actionUrl: '',
          lastUpdated: null
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        active: config.active,
        title: config.title,
        message: config.message,
        displayType: config.displayType,
        actionLabel: config.actionLabel || '',
        actionUrl: config.actionUrl || '',
        lastUpdated: config.lastUpdated
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
 * @desc    Update notice configuration
 * @access  Private (Admin/Root)
 */
router.put('/', [
  verifyToken,
  authorizeRoles('admin', 'root'),
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
    const { active, title, message, displayType, actionLabel, actionUrl } = req.body;

    let config = await NoticeConfig.findOne();

    if (!config) {
      config = new NoticeConfig({
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
    }

    config.lastUpdated = new Date();
    await config.save();

    res.status(200).json({
      success: true,
      message: 'Notice updated successfully',
      data: {
        active: config.active,
        title: config.title,
        message: config.message,
        displayType: config.displayType,
        actionLabel: config.actionLabel || '',
        actionUrl: config.actionUrl || '',
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
