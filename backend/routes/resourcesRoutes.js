const express = require('express');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');
const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');

const router = express.Router();

/**
 * @route   GET /api/resources
 * @desc    Get resources configuration (public endpoint for mobile app)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    console.log(`[Resources] GET /api/resources - School: ${req.school || 'unknown'}, Host: ${req.headers.host}`);
    
    const { ResourcesConfig } = getModels(req, 'ResourcesConfig');
    
    // Get the latest resources config (by version or most recent)
    let config = await ResourcesConfig.findOne().sort({ version: -1, createdAt: -1 });
    
    console.log(`[Resources] Found config: ${config ? `Yes (version ${config.version}, ${config.resources?.length || 0} resources)` : 'No'}`);
    
    if (!config) {
      // If no config exists, return empty resources
      console.log('[Resources] No config found, returning empty resources');
      return res.status(200).json({
        success: true,
        data: {
          resources: [],
          version: 0
        }
      });
    }

    console.log(`[Resources] Returning ${config.resources?.length || 0} resources`);
    res.status(200).json({
      success: true,
      data: {
        resources: config.resources,
        version: config.version,
        lastUpdated: config.lastUpdated
      }
    });
  } catch (error) {
    console.error('[Resources] GET /api/resources failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch resources',
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/resources/admin
 * @desc    Get resources configuration for admin (includes metadata)
 * @access  Private (Admin/Root)
 */
router.get('/admin', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
  try {
    const { ResourcesConfig } = getModels(req, 'ResourcesConfig');
    
    const config = await ResourcesConfig.findOne().sort({ version: -1, createdAt: -1 });
    
    if (!config) {
      return res.status(200).json({
        success: true,
        data: {
          resources: [],
          version: 0,
          createdAt: null,
          updatedAt: null
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        resources: config.resources,
        version: config.version,
        lastUpdated: config.lastUpdated,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt
      }
    });
  } catch (error) {
    console.error('GET /api/resources/admin failed', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch resources',
      error: error.message 
    });
  }
});

/**
 * @route   PUT /api/resources
 * @desc    Update resources configuration
 * @access  Private (Admin/Root)
 */
router.put('/', [
  verifyToken,
  authorizeRoles('admin', 'root'),
  body('resources').isArray().withMessage('Resources must be an array'),
  body('resources.*.id').notEmpty().withMessage('Each resource must have an id'),
  body('resources.*.title').notEmpty().withMessage('Each resource must have a title'),
  body('resources.*.type').isIn(['link', 'subpage', 'action']).withMessage('Invalid resource type'),
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

    const { ResourcesConfig } = getModels(req, 'ResourcesConfig');
    const { resources } = req.body;

    // Get current config to increment version
    const currentConfig = await ResourcesConfig.findOne().sort({ version: -1, createdAt: -1 });
    const newVersion = currentConfig ? currentConfig.version + 1 : 1;

    // Create or update the config
    let config = await ResourcesConfig.findOne();
    
    if (config) {
      // Update existing config
      config.resources = resources;
      config.version = newVersion;
      config.lastUpdated = new Date();
      await config.save();
    } else {
      // Create new config
      config = new ResourcesConfig({
        resources,
        version: newVersion,
        lastUpdated: new Date()
      });
      await config.save();
    }

    res.status(200).json({
      success: true,
      message: 'Resources updated successfully',
      data: {
        resources: config.resources,
        version: config.version,
        lastUpdated: config.lastUpdated
      }
    });
  } catch (error) {
    console.error('PUT /api/resources failed', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update resources',
      error: error.message 
    });
  }
});

/**
 * @route   POST /api/resources/dev/populate
 * @desc    DEV ONLY: Populate database with resources from resources.json
 * @access  Private (Admin/Root) - Development only
 */
router.post('/dev/populate', [
  verifyToken,
  authorizeRoles('admin', 'root'),
], async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is only available in development'
      });
    }

    const { ResourcesConfig } = getModels(req, 'ResourcesConfig');
    
    // Read resources.json from mobile app config
    // Path relative to backend directory: backend -> root -> Meridian-Mobile
    const resourcesPath = path.join(__dirname, '../../../Meridian-Mobile/src/config/resources.json');
    
    if (!fs.existsSync(resourcesPath)) {
      return res.status(404).json({
        success: false,
        message: 'resources.json file not found',
        path: resourcesPath
      });
    }

    const resourcesData = JSON.parse(fs.readFileSync(resourcesPath, 'utf8'));
    
    // Check if config already exists
    const existingConfig = await ResourcesConfig.findOne();
    const newVersion = existingConfig ? existingConfig.version + 1 : 1;

    if (existingConfig) {
      existingConfig.resources = resourcesData.resources;
      existingConfig.version = newVersion;
      existingConfig.lastUpdated = new Date();
      await existingConfig.save();
    } else {
      const newConfig = new ResourcesConfig({
        resources: resourcesData.resources,
        version: newVersion,
        lastUpdated: new Date()
      });
      await newConfig.save();
    }

    res.status(200).json({
      success: true,
      message: 'Database populated successfully from resources.json',
      data: {
        resourcesCount: resourcesData.resources.length,
        version: newVersion
      }
    });
  } catch (error) {
    console.error('POST /api/resources/dev/populate failed', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to populate database',
      error: error.message 
    });
  }
});

module.exports = router;

