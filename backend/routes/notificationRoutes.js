const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');
const getModels = require('../services/getModelService');
const {verifyToken} = require('../middlewares/verifyToken');
const { body, validationResult } = require('express-validator');

// Middleware to create notification service with request models
const withNotificationService = (req, res, next) => {
    const models = getModels(req, 'Notification', 'User', 'Org');
    req.notificationService = NotificationService.withModels(models);
    next();
};

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for the authenticated user
 * @access  Private
 */
router.get('/', verifyToken, withNotificationService, async (req, res) => {
    try {
        const { 
            status, 
            type, 
            limit = 20, 
            skip = 0,
            priority,
            category 
        } = req.query;

        const options = {
            limit: parseInt(limit),
            skip: parseInt(skip),
            status,
            type,
            priority,
            category
        };

        const notifications = await req.notificationService.getNotifications(
            req.user.userId,
            'User',
            options
        );

        res.json({
            success: true,
            data: notifications,
            pagination: {
                limit: options.limit,
                skip: options.skip,
                hasMore: notifications.length === options.limit
            }
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get('/unread-count', verifyToken, withNotificationService, async (req, res) => {
    try {
        const count = await req.notificationService.getUnreadCount(req.user.userId, 'User');
        
        res.json({
            success: true,
            data: { count }
        });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch unread count',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/notifications/statistics
 * @desc    Get notification statistics
 * @access  Private
 */
router.get('/statistics', verifyToken, withNotificationService, async (req, res) => {
    try {
        const stats = await req.notificationService.getStatistics(req.user.userId, 'User');
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/notifications/:id
 * @desc    Get a specific notification
 * @access  Private
 */
router.get('/:id', verifyToken, withNotificationService, async (req, res) => {
    try {
        const notification = await req.notificationService.getNotifications(
            req.user.userId,
            'User',
            { limit: 1 }
        ).then(notifications => 
            notifications.find(n => n._id.toString() === req.params.id)
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            data: notification
        });
    } catch (error) {
        console.error('Error fetching notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notification',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications
 * @desc    Create a new notification (admin/system only)
 * @access  Private (Admin)
 */
router.post('/', [
    verifyToken,
    withNotificationService,
    body('recipient').isMongoId().withMessage('Valid recipient ID is required'),
    body('recipientModel').isIn(['User', 'Org']).withMessage('Valid recipient model is required'),
    body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be less than 200 characters'),
    body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('Message is required and must be less than 1000 characters'),
    body('type').isIn(['system', 'user', 'org', 'event', 'membership', 'approval', 'reminder', 'achievement', 'security', 'custom']).withMessage('Valid type is required'),
    body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']).withMessage('Valid priority is required'),
    body('channels').optional().isArray().withMessage('Channels must be an array'),
    body('actions').optional().isArray().withMessage('Actions must be an array')
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        // Check if user has permission to create notifications
        if (!req.user.admin && !req.user.roles.includes('admin')) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to create notifications'
            });
        }

        const notificationData = {
            ...req.body,
            sender: req.user.userId,
            senderModel: 'User'
        };

        const notification = await req.notificationService.createNotification(notificationData);

        res.status(201).json({
            success: true,
            data: notification,
            message: 'Notification created successfully'
        });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create notification',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/batch
 * @desc    Create multiple notifications in batch
 * @access  Private (Admin)
 */
router.post('/batch', [
    verifyToken,
    withNotificationService,
    body('notifications').isArray({ min: 1 }).withMessage('Notifications array is required'),
    body('notifications.*.recipient').isMongoId().withMessage('Valid recipient ID is required'),
    body('notifications.*.recipientModel').isIn(['User', 'Org']).withMessage('Valid recipient model is required'),
    body('notifications.*.title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be less than 200 characters'),
    body('notifications.*.message').trim().isLength({ min: 1, max: 1000 }).withMessage('Message is required and must be less than 1000 characters'),
    body('notifications.*.type').isIn(['system', 'user', 'org', 'event', 'membership', 'approval', 'reminder', 'achievement', 'security', 'custom']).withMessage('Valid type is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        if (!req.user.admin && !req.user.roles.includes('admin')) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to create batch notifications'
            });
        }

        const notifications = await req.notificationService.createBatchNotifications(req.body.notifications);

        res.status(201).json({
            success: true,
            data: notifications,
            message: `${notifications.length} notifications created successfully`
        });
    } catch (error) {
        console.error('Error creating batch notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create batch notifications',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/system
 * @desc    Create a system notification using template
 * @access  Private (Admin)
 */
router.post('/system', [
    verifyToken,
    withNotificationService,
    body('recipient').isMongoId().withMessage('Valid recipient ID is required'),
    body('recipientModel').isIn(['User', 'Org']).withMessage('Valid recipient model is required'),
    body('templateName').trim().isLength({ min: 1 }).withMessage('Template name is required'),
    body('variables').optional().isObject().withMessage('Variables must be an object')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        if (!req.user.admin && !req.user.roles.includes('admin')) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to create system notifications'
            });
        }

        const notification = await req.notificationService.createSystemNotification(
            req.body.recipient,
            req.body.recipientModel,
            req.body.templateName,
            req.body.variables || {}
        );

        res.status(201).json({
            success: true,
            data: notification,
            message: 'System notification created successfully'
        });
    } catch (error) {
        console.error('Error creating system notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create system notification',
            error: error.message
        });
    }
});

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.patch('/:id/read', verifyToken, withNotificationService, async (req, res) => {
    try {
        const notification = await req.notificationService.markAsRead(req.params.id, req.user.userId);

        res.json({
            success: true,
            data: notification,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notification as read',
            error: error.message
        });
    }
});

/**
 * @route   PATCH /api/notifications/read-multiple
 * @desc    Mark multiple notifications as read
 * @access  Private
 */
router.patch('/read-multiple', [
    verifyToken,
    withNotificationService,
    body('notificationIds').isArray({ min: 1 }).withMessage('Notification IDs array is required'),
    body('notificationIds.*').isMongoId().withMessage('Valid notification ID is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const result = await req.notificationService.markMultipleAsRead(
            req.body.notificationIds,
            req.user.userId
        );

        res.json({
            success: true,
            data: result,
            message: `${result.modifiedCount} notifications marked as read`
        });
    } catch (error) {
        console.error('Error marking multiple notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notifications as read',
            error: error.message
        });
    }
});

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.patch('/read-all', [
    verifyToken,
    withNotificationService,
    body('type').optional().isIn(['system', 'user', 'org', 'event', 'membership', 'approval', 'reminder', 'achievement', 'security', 'custom']).withMessage('Valid type is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const options = req.body.type ? { type: req.body.type } : {};
        const result = await req.notificationService.markAllAsRead(
            req.user.userId,
            'User',
            options
        );

        res.json({
            success: true,
            data: result,
            message: `${result.modifiedCount} notifications marked as read`
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark all notifications as read',
            error: error.message
        });
    }
});

/**
 * @route   PATCH /api/notifications/:id/acknowledge
 * @desc    Acknowledge notification
 * @access  Private
 */
router.patch('/:id/acknowledge', verifyToken, withNotificationService, async (req, res) => {
    try {
        const notification = await req.notificationService.acknowledgeNotification(
            req.params.id,
            req.user.userId
        );

        res.json({
            success: true,
            data: notification,
            message: 'Notification acknowledged'
        });
    } catch (error) {
        console.error('Error acknowledging notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to acknowledge notification',
            error: error.message
        });
    }
});

/**
 * @route   PATCH /api/notifications/:id/archive
 * @desc    Archive notification
 * @access  Private
 */
router.patch('/:id/archive', verifyToken, withNotificationService, async (req, res) => {
    try {
        const notification = await req.notificationService.archiveNotification(
            req.params.id,
            req.user.userId
        );

        res.json({
            success: true,
            data: notification,
            message: 'Notification archived'
        });
    } catch (error) {
        console.error('Error archiving notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to archive notification',
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification (soft delete)
 * @access  Private
 */
router.delete('/:id', verifyToken, withNotificationService, async (req, res) => {
    try {
        const notification = await req.notificationService.deleteNotification(
            req.params.id,
            req.user.userId
        );

        res.json({
            success: true,
            data: notification,
            message: 'Notification deleted'
        });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete notification',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/:id/actions/:actionId
 * @desc    Execute notification action
 * @access  Private
 */
router.post('/:id/actions/:actionId', [
    verifyToken,
    withNotificationService,
    body('additionalData').optional().isObject().withMessage('Additional data must be an object')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        const result = await req.notificationService.executeAction(
            req.params.id,
            req.params.actionId,
            req.user.userId,
            req.body.additionalData || {},
            req // <-- pass req here
        );

        res.json({
            success: true,
            data: result,
            message: 'Action executed successfully'
        });
    } catch (error) {
        console.error('Error executing notification action:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to execute action',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/org/:orgId
 * @desc    Send notification to organization members
 * @access  Private (Org Admin)
 */
router.post('/org/:orgId', [
    verifyToken,
    withNotificationService,
    body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be less than 200 characters'),
    body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('Message is required and must be less than 1000 characters'),
    body('type').isIn(['system', 'user', 'org', 'event', 'membership', 'approval', 'reminder', 'achievement', 'security', 'custom']).withMessage('Valid type is required'),
    body('roles').optional().isArray().withMessage('Roles must be an array'),
    body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']).withMessage('Valid priority is required'),
    body('channels').optional().isArray().withMessage('Channels must be an array')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation errors',
                errors: errors.array()
            });
        }

        // TODO: Check if user has permission to send notifications to this org
        // This would require checking org membership and role permissions

        const notificationData = {
            ...req.body,
            sender: req.user.userId,
            senderModel: 'User'
        };

        const options = req.body.roles ? { roles: req.body.roles } : {};
        const notifications = await req.notificationService.sendToOrgMembers(
            req.params.orgId,
            notificationData,
            options
        );

        res.status(201).json({
            success: true,
            data: notifications,
            message: `${notifications.length} notifications sent to organization members`
        });
    } catch (error) {
        console.error('Error sending org notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send organization notifications',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/cleanup
 * @desc    Cleanup expired notifications (admin only)
 * @access  Private (Admin)
 */
router.post('/cleanup', verifyToken, withNotificationService, async (req, res) => {
    try {
        if (!req.user.admin && !req.user.roles.includes('admin')) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to cleanup notifications'
            });
        }

        const result = await req.notificationService.cleanupExpired();

        res.json({
            success: true,
            data: result,
            message: `${result.modifiedCount} expired notifications archived`
        });
    } catch (error) {
        console.error('Error cleaning up notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cleanup notifications',
            error: error.message
        });
    }
});

module.exports = router; 