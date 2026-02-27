const express = require('express');
const getModels = require('../services/getModelService');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');

const router = express.Router();

/**
 * @route   GET /api/shuttle-config
 * @desc    Get shuttle API configuration for current school
 * @access  Public (for mobile app)
 */
router.get('/', async (req, res) => {
  try {
    const school = req.school || 'rpi';
    console.log(`[ShuttleConfig] GET /api/shuttle-config - School: ${school}`);
    
    const { ShuttleConfig } = getModels(req, 'ShuttleConfig');
    
    // Find config for current school
    const config = await ShuttleConfig.findOne();
    
    if (!config) {
      console.log(`[ShuttleConfig] No config found for school: ${school}`);
      return res.status(200).json({
        success: true,
        data: {
          apiBaseUrl: null,
          enabled: false
        }
      });
    }

    console.log(`[ShuttleConfig] Found config for ${school}: ${config.apiBaseUrl}, enabled: ${config.enabled}`);
    res.status(200).json({
      success: true,
      data: {
        apiBaseUrl: config.apiBaseUrl,
        enabled: config.enabled
      }
    });
  } catch (error) {
    console.error('[ShuttleConfig] GET /api/shuttle-config failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch shuttle config',
      error: error.message 
    });
  }
});

/**
 * @route   POST /api/shuttle-config
 * @desc    Create or update shuttle API configuration for a school
 * @access  Private (Admin/Root)
 */
router.post('/', [
//   verifyToken,
//   authorizeRoles('admin', 'root')
], async (req, res) => {
  try {
    const { school, apiBaseUrl, enabled } = req.body;

    if (!school || !apiBaseUrl) {
      return res.status(400).json({
        success: false,
        message: 'School and apiBaseUrl are required'
      });
    }

    const { ShuttleConfig } = getModels(req, 'ShuttleConfig');
    
    // Check if config exists
    const existing = await ShuttleConfig.findOne({ school });
    const isNew = !existing;
    
    // Find existing config or create new one
    const config = await ShuttleConfig.findOneAndUpdate(
      { school },
      {
        school,
        apiBaseUrl: apiBaseUrl.trim(),
        enabled: enabled !== undefined ? enabled : true,
        lastUpdated: new Date()
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(`[ShuttleConfig] Config ${isNew ? 'created' : 'updated'} for ${school}: ${apiBaseUrl}`);
    
    res.status(200).json({
      success: true,
      message: `Shuttle config ${isNew ? 'created' : 'updated'} successfully`,
      data: {
        school: config.school,
        apiBaseUrl: config.apiBaseUrl,
        enabled: config.enabled,
        lastUpdated: config.lastUpdated
      }
    });
  } catch (error) {
    console.error('[ShuttleConfig] POST /api/shuttle-config failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save shuttle config',
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/shuttle-config/admin
 * @desc    Get all shuttle configurations (admin view)
 * @access  Private (Admin/Root)
 */
router.get('/admin', [
  verifyToken,
  authorizeRoles('admin', 'root')
], async (req, res) => {
  try {
    const { ShuttleConfig } = getModels(req, 'ShuttleConfig');
    
    const configs = await ShuttleConfig.find().sort({ school: 1 });
    
    res.status(200).json({
      success: true,
      data: configs
    });
  } catch (error) {
    console.error('[ShuttleConfig] GET /api/shuttle-config/admin failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch shuttle configs',
      error: error.message 
    });
  }
});

/**
 * @route   DELETE /api/shuttle-config/:school
 * @desc    Delete shuttle configuration for a school
 * @access  Private (Admin/Root)
 */
router.delete('/:school', [
  verifyToken,
  authorizeRoles('admin', 'root')
], async (req, res) => {
  try {
    const { school } = req.params;
    const { ShuttleConfig } = getModels(req, 'ShuttleConfig');
    
    const config = await ShuttleConfig.findOneAndDelete({ school });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: `No config found for school: ${school}`
      });
    }

    console.log(`[ShuttleConfig] Config deleted for ${school}`);
    
    res.status(200).json({
      success: true,
      message: `Shuttle config deleted for ${school}`
    });
  } catch (error) {
    console.error('[ShuttleConfig] DELETE /api/shuttle-config/:school failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete shuttle config',
      error: error.message 
    });
  }
});

module.exports = router;
