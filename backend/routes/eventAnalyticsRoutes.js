const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles, verifyTokenOptional } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');

// Track anonymous event view (called when non-logged in users view an event page)
router.post('/track-anonymous-view/:eventId', verifyTokenOptional, async (req, res) => {
    const { EventAnalytics } = getModels(req, 'EventAnalytics');
    const { eventId } = req.params;
    const userId = req.user ? req.user.userId : null;

    try {
        // Skip if user is logged in and is admin
        if (userId) {
            const { User } = getModels(req, 'User');
            const user = await User.findById(userId);
            if (user && user.roles && user.roles.includes('admin')) {
                return res.status(200).json({ success: true, message: 'Admin user excluded from analytics' });
            }
        }

        // Generate anonymous ID based on IP and user agent for uniqueness
        const anonymousId = req.headers['x-anonymous-id'] || 
                           `${req.ip || req.connection.remoteAddress}-${req.headers['user-agent'] || ''}`;

        // Find or create analytics record for this event
        let analytics = await EventAnalytics.findOne({ eventId });
        
        if (!analytics) {
            analytics = new EventAnalytics({
                eventId,
                views: 0,
                uniqueViews: 0,
                anonymousViews: 0,
                uniqueAnonymousViews: 0,
                rsvps: 0,
                uniqueRsvps: 0,
                viewHistory: [],
                rsvpHistory: []
            });
        }

        // Check if this is a unique anonymous view
        const existingView = analytics.viewHistory.find(view => 
            view.isAnonymous && view.anonymousId === anonymousId
        );

        if (!existingView) {
            analytics.uniqueAnonymousViews += 1;
        }

        // Add view to history
        analytics.viewHistory.push({
            userId: null,
            isAnonymous: true,
            anonymousId,
            timestamp: new Date(),
            userAgent: req.headers['user-agent'] || '',
            ipAddress: req.ip || req.connection.remoteAddress || ''
        });

        analytics.anonymousViews += 1;
        await analytics.save();

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error tracking anonymous event view:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Track event view (called when logged-in users view an event page)
router.post('/track-event-view/:eventId', verifyToken, async (req, res) => {
    const { EventAnalytics, User } = getModels(req, 'EventAnalytics', 'User');
    const { eventId } = req.params;
        const userId = req.user.userId;

    try {
        // Check if user is an admin - exclude admin users from analytics
        const user = await User.findById(userId);
        if (user && user.roles && user.roles.includes('admin')) {
            return res.status(200).json({ success: true, message: 'Admin user excluded from analytics' });
        }

        // Find or create analytics record for this event
        let analytics = await EventAnalytics.findOne({ eventId });
        
        if (!analytics) {
            analytics = new EventAnalytics({
                eventId,
                views: 0,
                uniqueViews: 0,
                anonymousViews: 0,
                uniqueAnonymousViews: 0,
                rsvps: 0,
                uniqueRsvps: 0,
                viewHistory: [],
                rsvpHistory: []
            });
        }

        // Check if this is a unique view (user hasn't viewed this event before)
        const existingView = analytics.viewHistory.find(view => 
            !view.isAnonymous && view.userId && view.userId.toString() === userId.toString()
        );

        if (!existingView) {
            analytics.uniqueViews += 1;
        }

        // Add view to history
        analytics.viewHistory.push({
            userId,
            isAnonymous: false,
            anonymousId: null,
            timestamp: new Date(),
            userAgent: req.headers['user-agent'] || '',
            ipAddress: req.ip || req.connection.remoteAddress || ''
        });

        analytics.views += 1;
        await analytics.save();

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error tracking event view:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Track RSVP (called when someone RSVPs to an event)
router.post('/track-rsvp/:eventId', verifyToken, async (req, res) => {
    const { EventAnalytics, User } = getModels(req, 'EventAnalytics', 'User');
    const { eventId } = req.params;
    const { status } = req.body;
        const userId = req.user.userId;

    try {
        // Check if user is an admin - exclude admin users from analytics
        const user = await User.findById(userId);
        if (user && user.roles && user.roles.includes('admin')) {
            return res.status(200).json({ success: true, message: 'Admin user excluded from analytics' });
        }

        let analytics = await EventAnalytics.findOne({ eventId });
        
        if (!analytics) {
            analytics = new EventAnalytics({
                eventId,
                views: 0,
                uniqueViews: 0,
                anonymousViews: 0,
                uniqueAnonymousViews: 0,
                rsvps: 0,
                uniqueRsvps: 0,
                viewHistory: [],
                rsvpHistory: []
            });
        }

        // Check if this is a unique RSVP (user hasn't RSVP'd to this event before)
        const existingRsvp = analytics.rsvpHistory.find(rsvp => 
            rsvp.userId.toString() === userId.toString()
        );

        if (!existingRsvp) {
            analytics.uniqueRsvps += 1;
        }

        // Add RSVP to history
        analytics.rsvpHistory.push({
            userId,
            status,
            timestamp: new Date()
        });

        analytics.rsvps += 1;
        await analytics.save();

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error tracking RSVP:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get analytics overview (admin only)
router.get('/overview', verifyToken, authorizeRoles('admin'), async (req, res) => {
    const { EventAnalytics, Event, User } = getModels(req, 'EventAnalytics', 'Event', 'User');
    const { timeRange = '30d' } = req.query;

    try {
        const now = new Date();
        let startDate;
        
        switch (timeRange) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // Get total events
        const totalEvents = await Event.countDocuments({ 
            createdAt: { $gte: startDate },
            isDeleted: false 
        });

        // Get total views and RSVPs
        const analytics = await EventAnalytics.aggregate([
            {
                $match: {
                    'viewHistory.timestamp': { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalViews: { $sum: '$views' },
                    totalUniqueViews: { $sum: '$uniqueViews' },
                    totalAnonymousViews: { $sum: '$anonymousViews' },
                    totalUniqueAnonymousViews: { $sum: '$uniqueAnonymousViews' },
                    totalRsvps: { $sum: '$rsvps' },
                    totalUniqueRsvps: { $sum: '$uniqueRsvps' }
                }
            }
        ]);

        // Get top events by views
        const topEventsByViews = await EventAnalytics.aggregate([
            {
                $match: {
                    'viewHistory.timestamp': { $gte: startDate }
                }
            },
            {
                $sort: { views: -1 }
            },
            {
                $limit: 10
            },
            {
                $lookup: {
                    from: 'events',
                    localField: 'eventId',
                    foreignField: '_id',
                    as: 'event'
                }
            },
            {
                $unwind: '$event'
            },
            {
                $project: {
                    eventName: '$event.name',
                    views: 1,
                    uniqueViews: 1,
                    rsvps: 1,
                    uniqueRsvps: 1
                }
            }
        ]);

        // Get engagement rate (RSVPs / Views)
        const engagementRate = analytics[0]?.totalViews > 0 
            ? (analytics[0].totalRsvps / analytics[0].totalViews * 100).toFixed(2)
            : 0;

        const overview = {
            totalEvents,
            totalViews: analytics[0]?.totalViews || 0,
            totalUniqueViews: analytics[0]?.totalUniqueViews || 0,
            totalAnonymousViews: analytics[0]?.totalAnonymousViews || 0,
            totalUniqueAnonymousViews: analytics[0]?.totalUniqueAnonymousViews || 0,
            totalRsvps: analytics[0]?.totalRsvps || 0,
            totalUniqueRsvps: analytics[0]?.totalUniqueRsvps || 0,
            engagementRate: parseFloat(engagementRate),
            topEventsByViews,
            timeRange
        };

        res.status(200).json({
            success: true,
            data: overview
        });
    } catch (error) {
        console.error('Error getting analytics overview:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get analytics for a specific event (admin only)
router.get('/event/:eventId', verifyToken, authorizeRoles('admin'), async (req, res) => {
    const { EventAnalytics, Event } = getModels(req, 'EventAnalytics', 'Event');
    const { eventId } = req.params;
    const { timeRange = '30d' } = req.query;

    try {
        const now = new Date();
        let startDate;
        
        switch (timeRange) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        const analytics = await EventAnalytics.findOne({ eventId });
        if (!analytics) {
            return res.status(200).json({
                success: true,
                data: {
                    event: {
                        name: event.name,
                        start_time: event.start_time,
                        end_time: event.end_time
                    },
                    views: 0,
                    uniqueViews: 0,
                    rsvps: 0,
                    uniqueRsvps: 0,
                    engagementRate: 0,
                    viewHistory: [],
                    rsvpHistory: [],
                    timeRange
                }
            });
        }

        // Filter history by time range
        const filteredViewHistory = analytics.viewHistory.filter(view => 
            view.timestamp >= startDate
        );
        const filteredRsvpHistory = analytics.rsvpHistory.filter(rsvp => 
            rsvp.timestamp >= startDate
        );

        // Calculate engagement rate
        const engagementRate = analytics.views > 0 
            ? (analytics.rsvps / analytics.views * 100).toFixed(2)
            : 0;

        const eventAnalytics = {
            event: {
                name: event.name,
                start_time: event.start_time,
                end_time: event.end_time
            },
            views: analytics.views,
            uniqueViews: analytics.uniqueViews,
            anonymousViews: analytics.anonymousViews,
            uniqueAnonymousViews: analytics.uniqueAnonymousViews,
            rsvps: analytics.rsvps,
            uniqueRsvps: analytics.uniqueRsvps,
            engagementRate: parseFloat(engagementRate),
            viewHistory: filteredViewHistory,
            rsvpHistory: filteredRsvpHistory,
            timeRange
        };

        res.status(200).json({
            success: true,
            data: eventAnalytics
        });
    } catch (error) {
        console.error('Error getting event analytics:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get daily analytics (admin only)
router.get('/daily', verifyToken, authorizeRoles('admin'), async (req, res) => {
    const { EventAnalytics } = getModels(req, 'EventAnalytics');
    const { timeRange = '30d' } = req.query;

    try {
        const now = new Date();
        let startDate;
        
        switch (timeRange) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // Aggregate daily data
        const dailyData = await EventAnalytics.aggregate([
            {
                $unwind: '$viewHistory'
            },
            {
                $match: {
                    'viewHistory.timestamp': { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$viewHistory.timestamp'
                        }
                    },
                    views: { $sum: 1 },
                    uniqueViews: { $addToSet: '$viewHistory.userId' }
                }
            },
            {
                $project: {
                    date: '$_id',
                    views: 1,
                    uniqueViews: { $size: '$uniqueViews' }
                }
            },
            {
                $sort: { date: 1 }
            }
        ]);

        res.status(200).json({
            success: true,
            data: dailyData
        });
    } catch (error) {
        console.error('Error getting daily analytics:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
