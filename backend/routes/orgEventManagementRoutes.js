const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken');
const getModels  = require('../services/getModelService');
const { requireEventManagement } = require('../middlewares/orgPermissions');

// ==================== ORGANIZATION EVENT ANALYTICS ====================

// Get comprehensive organization event analytics
router.get('/:orgId/analytics', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, EventAnalytics, OrgMember } = getModels(req, 'Event', 'EventAnalytics', 'OrgMember');
    const { orgId } = req.params;
    const { timeRange = '30d', eventType = 'all' } = req.query;

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
            case '1y':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // Build event filter
        const eventFilter = {
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false,
            createdAt: { $gte: startDate }
        };

        if (eventType !== 'all') {
            eventFilter.type = eventType;
        }

        // Get event statistics
        const eventStats = await Event.aggregate([
            { $match: eventFilter },
            {
                $group: {
                    _id: null,
                    totalEvents: { $sum: 1 },
                    totalExpectedAttendance: { $sum: '$expectedAttendance' },
                    avgExpectedAttendance: { $avg: '$expectedAttendance' },
                    eventsByType: {
                        $push: {
                            type: '$type',
                            expectedAttendance: '$expectedAttendance',
                            start_time: '$start_time',
                            status: '$status'
                        }
                    }
                }
            }
        ]);

        // Get analytics data for events
        const eventIds = await Event.find(eventFilter).select('_id');
        const eventIdList = eventIds.map(e => e._id);

        const analyticsData = await EventAnalytics.aggregate([
            { $match: { eventId: { $in: eventIdList } } },
            {
                $group: {
                    _id: null,
                    totalViews: { $sum: '$views' },
                    totalUniqueViews: { $sum: '$uniqueViews' },
                    totalAnonymousViews: { $sum: '$anonymousViews' },
                    totalRsvps: { $sum: '$rsvps' },
                    totalUniqueRsvps: { $sum: '$uniqueRsvps' },
                    avgEngagementRate: { $avg: '$engagementRate' }
                }
            }
        ]);

        // Get events by type breakdown
        const eventsByType = await Event.aggregate([
            { $match: eventFilter },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    totalExpectedAttendance: { $sum: '$expectedAttendance' },
                    avgExpectedAttendance: { $avg: '$expectedAttendance' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Get events by status breakdown
        const eventsByStatus = await Event.aggregate([
            { $match: eventFilter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get top performing events
        const topEvents = await EventAnalytics.aggregate([
            { $match: { eventId: { $in: eventIdList } } },
            {
                $lookup: {
                    from: 'events',
                    localField: 'eventId',
                    foreignField: '_id',
                    as: 'event'
                }
            },
            { $unwind: '$event' },
            {
                $project: {
                    eventName: '$event.name',
                    eventType: '$event.type',
                    startTime: '$event.start_time',
                    views: 1,
                    rsvps: 1,
                    engagementRate: 1
                }
            },
            { $sort: { views: -1 } },
            { $limit: 10 }
        ]);

        // Get monthly event creation trend
        const monthlyTrend = await Event.aggregate([
            { $match: eventFilter },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 },
                    totalExpectedAttendance: { $sum: '$expectedAttendance' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Get member engagement with events
        const memberEngagement = await OrgMember.aggregate([
            { $match: { org_id: orgId, status: 'active' } },
            {
                $lookup: {
                    from: 'events',
                    localField: 'user_id',
                    foreignField: 'going',
                    as: 'attendedEvents'
                }
            },
            {
                $project: {
                    userId: '$user_id',
                    attendedCount: { $size: '$attendedEvents' }
                }
            },
            {
                $group: {
                    _id: null,
                    totalMembers: { $sum: 1 },
                    avgEventsPerMember: { $avg: '$attendedCount' },
                    membersWithEvents: {
                        $sum: {
                            $cond: [{ $gt: ['$attendedCount', 0] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        const analytics = {
            overview: {
                totalEvents: eventStats[0]?.totalEvents || 0,
                totalExpectedAttendance: eventStats[0]?.totalExpectedAttendance || 0,
                avgExpectedAttendance: Math.round(eventStats[0]?.avgExpectedAttendance || 0),
                totalViews: analyticsData[0]?.totalViews || 0,
                totalUniqueViews: analyticsData[0]?.totalUniqueViews || 0,
                totalRsvps: analyticsData[0]?.totalRsvps || 0,
                totalUniqueRsvps: analyticsData[0]?.totalUniqueRsvps || 0,
                avgEngagementRate: Math.round(analyticsData[0]?.avgEngagementRate || 0)
            },
            eventsByType,
            eventsByStatus,
            topEvents,
            monthlyTrend,
            memberEngagement: memberEngagement[0] || {
                totalMembers: 0,
                avgEventsPerMember: 0,
                membersWithEvents: 0
            },
            timeRange
        };

        console.log(`GET: /org-event-management/${orgId}/analytics - Analytics retrieved for ${timeRange}`);
        res.status(200).json({
            success: true,
            data: analytics
        });

    } catch (error) {
        console.error('Error fetching organization event analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching organization event analytics',
            error: error.message
        });
    }
});

// ==================== ORGANIZATION EVENT MANAGEMENT ====================

// Get all organization events with advanced filtering and pagination
router.get('/:orgId/events', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event } = getModels(req, 'Event');
    const { orgId } = req.params;
    const { 
        page = 1, 
        limit = 20, 
        status = 'all',
        type = 'all',
        timeRange = 'all',
        sortBy = 'start_time',
        sortOrder = 'asc',
        search = ''
    } = req.query;

    try {
        const skip = (page - 1) * limit;
        
        // Build filter
        const filter = {
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        };

        // Status filter
        if (status !== 'all') {
            filter.status = status;
        }

        // Type filter
        if (type !== 'all') {
            filter.type = type;
        }

        // Time range filter
        if (timeRange !== 'all') {
            const now = new Date();
            switch (timeRange) {
                case 'upcoming':
                    filter.start_time = { $gte: now };
                    break;
                case 'past':
                    filter.start_time = { $lt: now };
                    break;
                case 'this_week':
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - now.getDay());
                    weekStart.setHours(0, 0, 0, 0);
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 7);
                    filter.start_time = { $gte: weekStart, $lt: weekEnd };
                    break;
                case 'this_month':
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    filter.start_time = { $gte: monthStart, $lt: monthEnd };
                    break;
            }
        }

        // Search filter
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } }
            ];
        }

        // Build sort
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Get events
        const events = await Event.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('hostingId', 'org_name org_profile_image')
            .lean();

        // Get total count for pagination
        const totalEvents = await Event.countDocuments(filter);

        // Get summary statistics
        const summary = await Event.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalEvents: { $sum: 1 },
                    totalExpectedAttendance: { $sum: '$expectedAttendance' },
                    avgExpectedAttendance: { $avg: '$expectedAttendance' },
                    eventsByStatus: {
                        $push: '$status'
                    }
                }
            }
        ]);

        const statusCounts = summary[0]?.eventsByStatus?.reduce((acc, status) => {
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {}) || {};

        console.log(`GET: /org-event-management/${orgId}/events - Events retrieved`);
        res.status(200).json({
            success: true,
            data: {
                events,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalEvents / limit),
                    totalEvents,
                    hasMore: skip + events.length < totalEvents
                },
                summary: {
                    totalEvents: summary[0]?.totalEvents || 0,
                    totalExpectedAttendance: summary[0]?.totalExpectedAttendance || 0,
                    avgExpectedAttendance: Math.round(summary[0]?.avgExpectedAttendance || 0),
                    statusCounts
                }
            }
        });

    } catch (error) {
        console.error('Error fetching organization events:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching organization events',
            error: error.message
        });
    }
});

// Get single event with detailed analytics
router.get('/:orgId/events/:eventId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, EventAnalytics } = getModels(req, 'Event', 'EventAnalytics');
    const { orgId, eventId } = req.params;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        }).populate('hostingId', 'org_name org_profile_image');

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        const analytics = await EventAnalytics.findOne({ eventId });

        console.log(`GET: /org-event-management/${orgId}/events/${eventId}`);
        res.status(200).json({
            success: true,
            data: {
                event,
                analytics: analytics || {
                    views: 0,
                    uniqueViews: 0,
                    rsvps: 0,
                    uniqueRsvps: 0,
                    engagementRate: 0
                }
            }
        });

    } catch (error) {
        console.error('Error fetching event details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching event details',
            error: error.message
        });
    }
});

// Bulk operations on events
router.post('/:orgId/events/bulk-action', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event } = getModels(req, 'Event');
    const { orgId } = req.params;
    const { action, eventIds } = req.body;

    try {
        if (!Array.isArray(eventIds) || eventIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Event IDs array is required'
            });
        }

        const filter = {
            _id: { $in: eventIds },
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        };

        let result;
        let message;

        switch (action) {
            case 'delete':
                result = await Event.updateMany(filter, { isDeleted: true });
                message = `${result.modifiedCount} events deleted successfully`;
                break;
            case 'approve':
                result = await Event.updateMany(filter, { status: 'approved' });
                message = `${result.modifiedCount} events approved successfully`;
                break;
            case 'reject':
                result = await Event.updateMany(filter, { status: 'rejected' });
                message = `${result.modifiedCount} events rejected successfully`;
                break;
            case 'archive':
                result = await Event.updateMany(filter, { status: 'archived' });
                message = `${result.modifiedCount} events archived successfully`;
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid action specified'
                });
        }

        console.log(`POST: /org-event-management/${orgId}/events/bulk-action - ${action} performed on ${result.modifiedCount} events`);
        res.status(200).json({
            success: true,
            message,
            data: {
                modifiedCount: result.modifiedCount
            }
        });

    } catch (error) {
        console.error('Error performing bulk action:', error);
        res.status(500).json({
            success: false,
            message: 'Error performing bulk action',
            error: error.message
        });
    }
});

// Create event template
router.post('/:orgId/event-templates', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventTemplate } = getModels(req, 'EventTemplate');
    const { orgId } = req.params;
    const templateData = req.body;

    try {
        const template = new EventTemplate({
            ...templateData,
            orgId,
            createdBy: req.user.userId
        });

        await template.save();

        console.log(`POST: /org-event-management/${orgId}/event-templates - Template created`);
        res.status(201).json({
            success: true,
            message: 'Event template created successfully',
            data: template
        });

    } catch (error) {
        console.error('Error creating event template:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating event template',
            error: error.message
        });
    }
});

// Get event templates
router.get('/:orgId/event-templates', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventTemplate } = getModels(req, 'EventTemplate');
    const { orgId } = req.params;

    try {
        const templates = await EventTemplate.find({ orgId })
            .sort({ createdAt: -1 })
            .lean();

        console.log(`GET: /org-event-management/${orgId}/event-templates`);
        res.status(200).json({
            success: true,
            data: templates
        });

    } catch (error) {
        console.error('Error fetching event templates:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching event templates',
            error: error.message
        });
    }
});

// Create event from template
router.post('/:orgId/events/from-template/:templateId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, EventTemplate } = getModels(req, 'Event', 'EventTemplate');
    const { orgId, templateId } = req.params;
    const { startTime, endTime, customizations = {} } = req.body;

    try {
        const template = await EventTemplate.findOne({
            _id: templateId,
            orgId
        });

        if (!template) {
            return res.status(404).json({
                success: false,
                message: 'Event template not found'
            });
        }

        // Create event from template
        const eventData = {
            ...template.templateData,
            ...customizations,
            hostingId: orgId,
            hostingType: 'Org',
            start_time: new Date(startTime),
            end_time: new Date(endTime),
            createdBy: req.user.userId
        };

        const event = new Event(eventData);
        await event.save();

        console.log(`POST: /org-event-management/${orgId}/events/from-template/${templateId} - Event created from template`);
        res.status(201).json({
            success: true,
            message: 'Event created from template successfully',
            data: event
        });

    } catch (error) {
        console.error('Error creating event from template:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating event from template',
            error: error.message
        });
    }
});

module.exports = router;
