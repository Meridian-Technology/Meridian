const express = require('express');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');
const FeedbackService = require('../services/feedbackService');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Middleware to attach feedback service
const withFeedbackService = (req, res, next) => {
    req.feedbackService = new FeedbackService(req);
    next();
};

// ============ FEEDBACK CONFIGURATION MANAGEMENT (Admin Only) ============

// Get all feedback configurations
router.get('/configs', [
    verifyToken,
    authorizeRoles('admin', 'root')
], withFeedbackService, async (req, res) => {
    try {
        const { FeedbackConfig } = getModels(req, 'FeedbackConfig');
        const { feature, isActive } = req.query;
        
        const query = {};
        if (feature) query.feature = feature;
        if (isActive !== undefined) query.isActive = isActive === 'true';
        
        const configs = await FeedbackConfig.find(query)
            .populate('createdBy', 'name email')
            .sort({ feature: 1, version: -1 });
        
        console.log(`GET: /feedback/configs - Admin ${req.user.userId} viewed configs`);
        res.json({
            success: true,
            data: configs
        });
        
    } catch (error) {
        console.error('GET /feedback/configs failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create new feedback configuration
router.post('/configs', [
    verifyToken,
    authorizeRoles('admin', 'root'),
    body('feature').trim().isLength({ min: 1, max: 50 }).withMessage('Feature is required (max 50 chars)'),
    body('version').trim().isLength({ min: 1 }).withMessage('Version is required'),
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 chars)'),
    body('fields').isArray({ min: 1 }).withMessage('At least one field is required'),
    body('fields.*.fieldId').trim().isLength({ min: 1 }).withMessage('Field ID is required'),
    body('fields.*.fieldType').isIn(['boolean', 'text', 'number', 'rating', 'multipleChoice', 'checkbox', 'scale']).withMessage('Invalid field type'),
    body('fields.*.label').trim().isLength({ min: 1, max: 100 }).withMessage('Field label is required'),
    body('weight').optional().isInt({ min: 0, max: 100 }).withMessage('Weight must be between 0 and 100')
], withFeedbackService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { FeedbackConfig, SystemVersion } = getModels(req, 'FeedbackConfig', 'SystemVersion');
        const configData = req.body;
        
        // Get current system version
        const systemVersion = await SystemVersion.getCurrentVersion();
        
        // Check for duplicate feature + version
        const existing = await FeedbackConfig.findOne({
            feature: configData.feature,
            version: configData.version
        });
        
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'Configuration with this feature and version already exists'
            });
        }
        
        const config = new FeedbackConfig({
            ...configData,
            systemVersion: systemVersion ? systemVersion.version : '1.2',
            createdBy: req.user.userId
        });
        
        await config.save();
        
        console.log(`POST: /feedback/configs - Admin ${req.user.userId} created config ${config._id}`);
        res.status(201).json({
            success: true,
            data: config,
            message: 'Feedback configuration created successfully'
        });
        
    } catch (error) {
        console.error('POST /feedback/configs failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update feedback configuration
router.put('/configs/:configId', [
    verifyToken,
    authorizeRoles('admin', 'root'),
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('fields').optional().isArray({ min: 1 }),
    body('isActive').optional().isBoolean(),
    body('weight').optional().isInt({ min: 0, max: 100 })
], withFeedbackService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { FeedbackConfig } = getModels(req, 'FeedbackConfig');
        const updateData = req.body;
        
        const config = await FeedbackConfig.findByIdAndUpdate(
            req.params.configId,
            updateData,
            { new: true }
        );
        
        if (!config) {
            return res.status(404).json({
                success: false,
                message: 'Configuration not found'
            });
        }
        
        console.log(`PUT: /feedback/configs/${req.params.configId} - Admin ${req.user.userId} updated config`);
        res.json({
            success: true,
            data: config,
            message: 'Configuration updated successfully'
        });
        
    } catch (error) {
        console.error(`PUT /feedback/configs/${req.params.configId} failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ SYSTEM VERSION MANAGEMENT (Minimal) ============

// Get current system version
router.get('/system-version', verifyToken, withFeedbackService, async (req, res) => {
    try {
        const version = await req.feedbackService.getCurrentSystemVersion();
        
        console.log(`GET: /feedback/system-version - User ${req.user.userId}`);
        res.json({
            success: true,
            data: { version }
        });
        
    } catch (error) {
        console.error('GET /feedback/system-version failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update system version (admin only)
router.post('/system-version', [
    verifyToken,
    authorizeRoles('admin', 'root'),
    body('version').trim().isLength({ min: 1 }).withMessage('Version is required')
], withFeedbackService, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const { SystemVersion } = getModels(req, 'SystemVersion');
        const { version } = req.body;
        
        const newVersion = await SystemVersion.setCurrentVersion(version);
        
        console.log(`POST: /feedback/system-version - Admin ${req.user.userId} set version to ${version}`);
        res.json({
            success: true,
            data: newVersion,
            message: 'System version updated successfully'
        });
        
    } catch (error) {
        console.error('POST /feedback/system-version failed:', error);
        
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Version already exists'
            });
        }
        
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ FEEDBACK ANALYTICS (Admin Only) ============

// Get feedback analytics by feature
router.get('/analytics/:feature', [
    verifyToken,
    authorizeRoles('admin', 'root')
], withFeedbackService, async (req, res) => {
    try {
        const { feature } = req.params;
        const { processId, systemVersion } = req.query;
        
        let stats;
        if (systemVersion) {
            stats = await req.feedbackService.getVersionStats(feature, systemVersion);
        } else {
            stats = await req.feedbackService.getFeedbackStats(feature, processId || null);
        }
        
        console.log(`GET: /feedback/analytics/${feature} - Admin ${req.user.userId}`);
        res.json({
            success: true,
            data: stats
        });
        
    } catch (error) {
        console.error(`GET /feedback/analytics/${req.params.feature} failed:`, error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ INITIALIZATION (Admin Only) ============

// Initialize default feedback configurations
router.post('/initialize', [
    verifyToken,
    authorizeRoles('admin', 'root')
], withFeedbackService, async (req, res) => {
    try {
        const configs = await req.feedbackService.initializeDefaultConfigs(req.user.userId);
        
        console.log(`POST: /feedback/initialize - Admin ${req.user.userId} initialized configs`);
        res.json({
            success: true,
            data: configs,
            message: 'Default configurations initialized successfully'
        });
        
    } catch (error) {
        console.error('POST /feedback/initialize failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
