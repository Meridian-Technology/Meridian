const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken, authorizeRoles, verifyTokenOptional } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');

/**
 * Parse time range into startDate and endDate
 */
function parseTimeRange(timeRange, startDateParam, endDateParam) {
    const now = new Date();
    let startDate, endDate;

    if (startDateParam && endDateParam) {
        startDate = new Date(startDateParam);
        endDate = new Date(endDateParam);
    } else {
        switch (timeRange) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case '1y':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                endDate = now;
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                break;
            case 'week':
                const dayOfWeek = now.getDay();
                startDate = new Date(now);
                startDate.setDate(now.getDate() - dayOfWeek);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                endDate.setHours(23, 59, 59, 999);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                endDate = now;
        }
    }
    return { startDate, endDate };
}

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
router.get('/overview', verifyTokenOptional, async (req, res) => {
    const { EventAnalytics, Event, User } = getModels(req, 'EventAnalytics', 'Event', 'User');
    const { timeRange = '30d', startDate: startDateParam, endDate: endDateParam } = req.query;

    try {
        const now = new Date();
        let startDate, endDate;
        
        // If explicit dates are provided, use them
        if (startDateParam && endDateParam) {
            startDate = new Date(startDateParam);
            endDate = new Date(endDateParam);
        } else {
            // Otherwise, calculate based on timeRange
            switch (timeRange) {
                case '7d':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    endDate = now;
                    break;
                case '30d':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    endDate = now;
                    break;
                case '90d':
                    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    endDate = now;
                    break;
                case 'month':
                    // Current calendar month
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                    break;
                case 'week':
                    // Current calendar week (Sunday to Saturday)
                    const dayOfWeek = now.getDay();
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - dayOfWeek);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(startDate);
                    endDate.setDate(startDate.getDate() + 6);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                default:
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    endDate = now;
            }
        }

        // Get total events
        const totalEvents = await Event.countDocuments({ 
            createdAt: { $gte: startDate, $lte: endDate },
            isDeleted: false 
        });

        // Get total views and RSVPs
        const analytics = await EventAnalytics.aggregate([
            {
                $match: {
                    'viewHistory.timestamp': { $gte: startDate, $lte: endDate }
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
                    'viewHistory.timestamp': { $gte: startDate, $lte: endDate }
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
router.get('/event/:eventId', verifyToken, async (req, res) => {
    const { EventAnalytics, Event, AnalyticsEvent } = getModels(req, 'EventAnalytics', 'Event', 'AnalyticsEvent');
    const { eventId } = req.params;
    const { timeRange = '30d', startDate: startDateParam, endDate: endDateParam } = req.query;

    try {
        const { startDate, endDate } = parseTimeRange(timeRange, startDateParam, endDateParam);

        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        // Query analytics_events (new platform pipeline) for granular metrics
        const eventIdObj = mongoose.Types.ObjectId.isValid(eventId) ? new mongoose.Types.ObjectId(eventId) : null;
        const platformMatch = {
            ts: { $gte: startDate, $lte: endDate },
            $or: [
                { 'properties.event_id': eventId },
                ...(eventIdObj ? [{ 'properties.event_id': eventIdObj }] : [])
            ]
        };

        const platformAggregation = await AnalyticsEvent.aggregate([
            { $match: platformMatch },
            {
                $group: {
                    _id: '$event',
                    count: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$user_id' },
                    uniqueAnonymous: { $addToSet: '$anonymous_id' }
                }
            }
        ]);

        const platformCounts = {};
        const tabViews = {};
        platformAggregation.forEach(({ _id: eventType, count, uniqueUsers, uniqueAnonymous }) => {
            platformCounts[eventType] = count;
            if (eventType === 'event_workspace_tab_view') {
                // Tab breakdown is in a separate aggregation
            }
        });

        // Get tab breakdown for event_workspace_tab_view
        const tabBreakdown = await AnalyticsEvent.aggregate([
            {
                $match: {
                    ...platformMatch,
                    event: 'event_workspace_tab_view'
                }
            },
            { $group: { _id: '$properties.tab', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        tabBreakdown.forEach(({ _id: tab, count }) => {
            tabViews[tab || 'unknown'] = count;
        });

        // Aggregate event_view by derived referrer source (org_page, explore, direct)
        const referrerSourceMatch = {
            ...platformMatch,
            event: 'event_view'
        };
        const referrerAggregation = await AnalyticsEvent.aggregate([
            { $match: referrerSourceMatch },
            {
                $addFields: {
                    source: {
                        $cond: {
                            if: {
                                $and: [
                                    { $ne: ['$properties.source', null] },
                                    { $ne: ['$properties.source', ''] },
                                    { $in: ['$properties.source', ['org_page', 'explore', 'direct']] }
                                ]
                            },
                            then: '$properties.source',
                            else: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $or: [
                                                    { $gt: [{ $indexOfCP: [{ $ifNull: ['$context.referrer', ''] }, 'org/'] }, -1] },
                                                    { $gt: [{ $indexOfCP: [{ $ifNull: ['$context.referrer', ''] }, 'club-dashboard'] }, -1] }
                                                ]
                                            },
                                            then: 'org_page'
                                        },
                                        {
                                            case: { $gt: [{ $indexOfCP: [{ $ifNull: ['$context.referrer', ''] }, 'events-dashboard'] }, -1] },
                                            then: 'explore'
                                        }
                                    ],
                                    default: 'direct'
                                }
                            }
                        }
                    }
                }
            },
            { $group: { _id: '$source', count: { $sum: 1 } } }
        ]);

        const referrerSources = { org_page: 0, explore: 0, direct: 0 };
        referrerAggregation.forEach(({ _id: source, count }) => {
            if (source && referrerSources.hasOwnProperty(source)) {
                referrerSources[source] = count;
            }
        });

        const registrationFormOpens = platformCounts['event_registration_form_open'] ?? 0;
        const registrationsCount = platformCounts['event_registration'] ?? 0;
        const registrationFormBounces = Math.max(0, registrationFormOpens - registrationsCount);

        const platformData = {
            eventViews: platformCounts['event_view'] ?? 0,
            agendaViews: platformCounts['event_agenda_view'] ?? 0,
            registrations: registrationsCount,
            registrationFormOpens,
            registrationFormBounces,
            withdrawals: platformCounts['event_registration_withdraw'] ?? 0,
            checkins: platformCounts['event_checkin'] ?? 0,
            checkouts: platformCounts['event_checkout'] ?? 0,
            workspaceViews: platformCounts['event_workspace_view'] ?? 0,
            tabViews,
            referrerSources
        };

        // Legacy EventAnalytics (merge for backwards compatibility)
        const analytics = await EventAnalytics.findOne({ eventId });
        const viewHistory = analytics?.viewHistory || [];
        const rsvpOrRegHistory = analytics?.rsvpHistory || analytics?.registrationHistory || [];
        const filteredViewHistory = viewHistory.filter(view =>
            view.timestamp >= startDate && view.timestamp <= endDate
        );
        const filteredRsvpHistory = rsvpOrRegHistory.filter(entry =>
            entry.timestamp >= startDate && entry.timestamp <= endDate
        );

        const legacyViews = analytics?.views ?? 0;
        const legacyRegistrations = analytics?.registrations ?? analytics?.rsvps ?? 0;
        const platformTotalViews = platformData.eventViews + platformData.workspaceViews;

        // Prefer platform counts when available, else legacy
        const views = platformTotalViews > 0 ? platformTotalViews : legacyViews;
        const registrations = platformData.registrations > 0 ? platformData.registrations : legacyRegistrations;
        const engagementRate = views > 0 ? ((registrations / views) * 100).toFixed(2) : 0;

        const eventAnalytics = {
            event: {
                name: event.name,
                start_time: event.start_time,
                end_time: event.end_time
            },
            views,
            uniqueViews: analytics?.uniqueViews ?? 0,
            anonymousViews: analytics?.anonymousViews ?? 0,
            uniqueAnonymousViews: analytics?.uniqueAnonymousViews ?? 0,
            registrations,
            uniqueRegistrations: analytics?.uniqueRegistrations ?? analytics?.uniqueRsvps ?? 0,
            engagementRate: parseFloat(engagementRate),
            viewHistory: filteredViewHistory,
            registrationHistory: filteredRsvpHistory,
            timeRange,
            // New granular metrics from platform analytics
            platform: platformData
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

// Get platform analytics overview (admin only) - from analytics_events
router.get('/platform-overview', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
    const { AnalyticsEvent, Event } = getModels(req, 'AnalyticsEvent', 'Event');
    const { timeRange = '30d', startDate: startDateParam, endDate: endDateParam } = req.query;

    try {
        const { startDate, endDate } = parseTimeRange(timeRange, startDateParam, endDateParam);

        const eventTypes = [
            'event_view',
            'event_registration',
            'event_agenda_view',
            'event_checkin',
            'event_checkout',
            'event_create_click',
            'event_create_submitted',
            'event_workspace_view',
            'event_workspace_tab_view'
        ];

        const platformMatch = {
            ts: { $gte: startDate, $lte: endDate },
            event: { $in: eventTypes }
        };

        // Totals by event type
        const totalsByType = await AnalyticsEvent.aggregate([
            { $match: platformMatch },
            { $group: { _id: '$event', count: { $sum: 1 } } }
        ]);

        const totals = {};
        totalsByType.forEach(({ _id, count }) => { totals[_id] = count; });

        // Top events by event_view
        const topEventsByViews = await AnalyticsEvent.aggregate([
            {
                $match: {
                    ...platformMatch,
                    event: 'event_view',
                    'properties.event_id': { $exists: true, $ne: null }
                }
            },
            { $group: { _id: '$properties.event_id', views: { $sum: 1 } } },
            { $sort: { views: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'events',
                    let: { eid: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$eid' }] } } },
                        { $project: { name: 1, type: 1 } }
                    ],
                    as: 'eventDoc'
                }
            },
            { $unwind: { path: '$eventDoc', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    eventId: '$_id',
                    eventName: '$eventDoc.name',
                    eventType: '$eventDoc.type',
                    views: 1,
                    participants: { $literal: 0 }
                }
            }
        ]);

        // Normalize event IDs (may be ObjectId or string from lookup)
        const topEvents = topEventsByViews.map(e => ({
            id: e.eventId?.toString?.() || e.eventId,
            name: e.eventName || 'Unknown Event',
            domain: e.eventType || 'Unknown',
            participants: e.participants ?? 0,
            engagement: 0,
            satisfaction: 0,
            attendance: 0,
            views: e.views
        }));

        // Event type breakdown (domain proxy)
        const eventsByType = await AnalyticsEvent.aggregate([
            {
                $match: {
                    ...platformMatch,
                    event: { $in: ['event_view', 'event_registration'] },
                    'properties.event_id': { $exists: true, $ne: null }
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { eid: '$properties.event_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$eid' }] } } },
                        { $project: { type: 1 } }
                    ],
                    as: 'eventDoc'
                }
            },
            { $unwind: { path: '$eventDoc', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$eventDoc.type',
                    events: { $addToSet: '$properties.event_id' },
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    type: '$_id',
                    events: { $size: '$events' },
                    participants: '$count'
                }
            }
        ]);

        const domainPerformance = eventsByType.map((d, i) => ({
            id: i + 1,
            name: d.type || 'Unknown',
            events: d.events,
            participants: d.participants,
            engagement: 0,
            satisfaction: 0,
            growth: 0
        }));

        // Tab engagement
        const tabEngagement = await AnalyticsEvent.aggregate([
            {
                $match: {
                    ...platformMatch,
                    event: 'event_workspace_tab_view',
                    'properties.tab': { $exists: true, $ne: '' }
                }
            },
            { $group: { _id: '$properties.tab', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Engagement trends (daily)
        const engagementTrends = await AnalyticsEvent.aggregate([
            {
                $match: {
                    ...platformMatch,
                    event: { $in: ['event_view', 'event_registration'] }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } },
                    events: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const totalEventViews = totals['event_view'] ?? 0;
        const totalRegistrations = totals['event_registration'] ?? 0;
        const totalEvents = await Event.countDocuments({
            createdAt: { $gte: startDate, $lte: endDate },
            isDeleted: false
        });

        const engagementRate = totalEventViews > 0
            ? ((totalRegistrations / totalEventViews) * 100).toFixed(1)
            : 0;

        res.status(200).json({
            success: true,
            data: {
                totalEvents,
                activeEvents: totalEvents,
                completedEvents: 0,
                totalParticipants: totalRegistrations,
                averageAttendance: 0,
                engagementRate: parseFloat(engagementRate),
                discoveryRate: 0,
                domainPerformance,
                topPerformingEvents: topEvents,
                engagementTrends: engagementTrends.map(t => ({
                    month: t._id,
                    engagement: 0,
                    events: t.events
                })),
                tabEngagement,
                discoveryMetrics: {
                    organicDiscovery: 0,
                    socialMedia: 0,
                    emailMarketing: 0,
                    wordOfMouth: 0
                },
                timeRange
            }
        });
    } catch (error) {
        console.error('Error getting platform analytics overview:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get daily analytics (admin only)
router.get('/daily', verifyToken, async (req, res) => {
    const { EventAnalytics } = getModels(req, 'EventAnalytics');
    const { timeRange = '30d', startDate: startDateParam, endDate: endDateParam } = req.query;

    try {
        const now = new Date();
        let startDate, endDate;
        
        // If explicit dates are provided, use them
        if (startDateParam && endDateParam) {
            startDate = new Date(startDateParam);
            endDate = new Date(endDateParam);
        } else {
            // Otherwise, calculate based on timeRange
            switch (timeRange) {
                case '7d':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    endDate = now;
                    break;
                case '30d':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    endDate = now;
                    break;
                case '90d':
                    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    endDate = now;
                    break;
                case 'month':
                    // Current calendar month
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                    break;
                case 'week':
                    // Current calendar week (Sunday to Saturday)
                    const dayOfWeek = now.getDay();
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - dayOfWeek);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(startDate);
                    endDate.setDate(startDate.getDate() + 6);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                default:
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    endDate = now;
            }
        }

        // Aggregate daily data
        const dailyData = await EventAnalytics.aggregate([
            {
                $unwind: '$viewHistory'
            },
            {
                $match: {
                    'viewHistory.timestamp': { $gte: startDate, $lte: endDate }
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
