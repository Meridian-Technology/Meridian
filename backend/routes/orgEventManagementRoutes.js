const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken');
const getModels  = require('../services/getModelService');
const { requireEventManagement, requireOrgPermission } = require('../middlewares/orgPermissions');

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

// Get event dashboard data
router.get('/:orgId/events/:eventId/dashboard', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, EventAnalytics, EventAgenda, EventJob, VolunteerSignup, EventEquipment } = getModels(
        req, 
        'Event', 
        'EventAnalytics', 
        'EventAgenda', 
        'EventJob', 
        'VolunteerSignup', 
        'EventEquipment'
    );
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

        // Get analytics
        const analytics = await EventAnalytics.findOne({ eventId });

        // Get agenda
        const agenda = await EventAgenda.findOne({ eventId });

        // Get event roles and count assignments
        const roles = await EventJob.find({ eventId });
        const totalVolunteers = roles.reduce((sum, role) => sum + (role.assignments?.length || 0), 0);
        const confirmedVolunteers = roles.reduce((sum, role) => 
            sum + (role.assignments?.filter(a => a.status === 'confirmed')?.length || 0), 0
        );

        // Get volunteer signups
        const signups = await VolunteerSignup.find({ eventId }).populate('memberId', 'name email');

        // Get equipment
        const equipment = await EventEquipment.findOne({ eventId });

        // Calculate RSVP stats
        const rsvpStats = {
            going: event.rsvpStats?.going || 0,
            maybe: event.rsvpStats?.maybe || 0,
            notGoing: event.rsvpStats?.notGoing || 0,
            total: (event.rsvpStats?.going || 0) + (event.rsvpStats?.maybe || 0) + (event.rsvpStats?.notGoing || 0)
        };

        // Calculate check-ins (from attendees or volunteer signups)
        const checkedInCount = signups.filter(s => s.checkedIn).length;

        // Determine event status based on dates
        const now = new Date();
        let operationalStatus = 'upcoming';
        if (event.start_time <= now && event.end_time >= now) {
            operationalStatus = 'active';
        } else if (event.end_time < now) {
            operationalStatus = 'completed';
        }

        console.log(`GET: /org-event-management/${orgId}/events/${eventId}/dashboard`);
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
                },
                agenda: agenda || { items: [] },
                roles: {
                    total: roles.length,
                    assignments: totalVolunteers,
                    confirmed: confirmedVolunteers,
                    signups: signups.length
                },
                equipment: equipment || { items: [] },
                stats: {
                    rsvps: rsvpStats,
                    volunteers: {
                        total: totalVolunteers,
                        confirmed: confirmedVolunteers,
                        checkedIn: checkedInCount
                    },
                    operationalStatus
                }
            }
        });

    } catch (error) {
        console.error('Error fetching event dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching event dashboard',
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

// Update single event
router.put('/:orgId/events/:eventId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event } = getModels(req, 'Event');
    const { orgId, eventId } = req.params;
    const updateData = req.body;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        // Update event fields
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined) {
                event[key] = updateData[key];
            }
        });

        await event.save();

        console.log(`PUT: /org-event-management/${orgId}/events/${eventId}`);
        res.status(200).json({
            success: true,
            message: 'Event updated successfully',
            data: { event }
        });

    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating event',
            error: error.message
        });
    }
});

// Duplicate event
router.post('/:orgId/events/:eventId/duplicate', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event } = getModels(req, 'Event');
    const { orgId, eventId } = req.params;
    const { name, start_time, end_time } = req.body;

    try {
        const originalEvent = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });

        if (!originalEvent) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        // Create new event based on original
        const eventData = originalEvent.toObject();
        delete eventData._id;
        delete eventData.createdAt;
        delete eventData.updatedAt;
        delete eventData.approvalReference;
        delete eventData.going;
        delete eventData.attendees;
        delete eventData.rsvpStats;

        // Override with provided values or add "Copy of" prefix
        eventData.name = name || `Copy of ${originalEvent.name}`;
        eventData.start_time = start_time ? new Date(start_time) : new Date(originalEvent.start_time);
        eventData.end_time = end_time ? new Date(end_time) : new Date(originalEvent.end_time);
        eventData.status = 'draft'; // New events start as draft

        const newEvent = new Event(eventData);
        await newEvent.save();

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/duplicate`);
        res.status(201).json({
            success: true,
            message: 'Event duplicated successfully',
            data: { event: newEvent }
        });

    } catch (error) {
        console.error('Error duplicating event:', error);
        res.status(500).json({
            success: false,
            message: 'Error duplicating event',
            error: error.message
        });
    }
});

// Update event status
router.put('/:orgId/events/:eventId/status', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event } = getModels(req, 'Event');
    const { orgId, eventId } = req.params;
    const { status } = req.body;

    try {
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }

        const validStatuses = ['approved', 'pending', 'rejected', 'not-applicable', 'draft', 'published', 'active', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        event.status = status;
        await event.save();

        console.log(`PUT: /org-event-management/${orgId}/events/${eventId}/status - Status updated to ${status}`);
        res.status(200).json({
            success: true,
            message: 'Event status updated successfully',
            data: { event }
        });

    } catch (error) {
        console.error('Error updating event status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating event status',
            error: error.message
        });
    }
});

// ==================== AGENDA MANAGEMENT ====================

// Get event agenda
router.get('/:orgId/events/:eventId/agenda', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventAgenda } = getModels(req, 'EventAgenda');
    const { orgId, eventId } = req.params;

    try {
        let agenda = await EventAgenda.findOne({ eventId, orgId });

        if (!agenda) {
            // Create default agenda if it doesn't exist
            agenda = new EventAgenda({
                eventId,
                orgId,
                items: []
            });
            await agenda.save();
        }

        console.log(`GET: /org-event-management/${orgId}/events/${eventId}/agenda`);
        res.status(200).json({
            success: true,
            data: { agenda }
        });

    } catch (error) {
        console.error('Error fetching agenda:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching agenda',
            error: error.message
        });
    }
});

// Create/update event agenda
router.post('/:orgId/events/:eventId/agenda', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventAgenda } = getModels(req, 'EventAgenda');
    const { orgId, eventId } = req.params;
    const { items, publicNotes, internalNotes } = req.body;

    try {
        let agenda = await EventAgenda.findOne({ eventId, orgId });

        if (agenda) {
            // Update existing agenda
            if (items) agenda.items = items;
            if (publicNotes !== undefined) agenda.publicNotes = publicNotes;
            if (internalNotes !== undefined) agenda.internalNotes = internalNotes;
            await agenda.save();
        } else {
            // Create new agenda
            agenda = new EventAgenda({
                eventId,
                orgId,
                items: items || [],
                publicNotes,
                internalNotes
            });
            await agenda.save();
        }

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/agenda`);
        res.status(200).json({
            success: true,
            message: 'Agenda updated successfully',
            data: { agenda }
        });

    } catch (error) {
        console.error('Error updating agenda:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating agenda',
            error: error.message
        });
    }
});

// Update agenda item
router.put('/:orgId/events/:eventId/agenda/items/:itemId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventAgenda } = getModels(req, 'EventAgenda');
    const { orgId, eventId, itemId } = req.params;
    const updateData = req.body;

    try {
        const agenda = await EventAgenda.findOne({ eventId, orgId });

        if (!agenda) {
            return res.status(404).json({
                success: false,
                message: 'Agenda not found'
            });
        }

        const itemIndex = agenda.items.findIndex(item => item.id === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Agenda item not found'
            });
        }

        // Update item
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined) {
                agenda.items[itemIndex][key] = updateData[key];
            }
        });

        await agenda.save();

        console.log(`PUT: /org-event-management/${orgId}/events/${eventId}/agenda/items/${itemId}`);
        res.status(200).json({
            success: true,
            message: 'Agenda item updated successfully',
            data: { item: agenda.items[itemIndex] }
        });

    } catch (error) {
        console.error('Error updating agenda item:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating agenda item',
            error: error.message
        });
    }
});

// Delete agenda item
router.delete('/:orgId/events/:eventId/agenda/items/:itemId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventAgenda } = getModels(req, 'EventAgenda');
    const { orgId, eventId, itemId } = req.params;

    try {
        const agenda = await EventAgenda.findOne({ eventId, orgId });

        if (!agenda) {
            return res.status(404).json({
                success: false,
                message: 'Agenda not found'
            });
        }

        agenda.items = agenda.items.filter(item => item.id !== itemId);
        await agenda.save();

        console.log(`DELETE: /org-event-management/${orgId}/events/${eventId}/agenda/items/${itemId}`);
        res.status(200).json({
            success: true,
            message: 'Agenda item deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting agenda item:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting agenda item',
            error: error.message
        });
    }
});

// ==================== ORG EVENT ROLE DEFINITIONS ====================

// Get org-level event roles
router.get('/:orgId/event-roles', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { OrgEventRole } = getModels(req, 'OrgEventRole');
    const { orgId } = req.params;

    try {
        const roles = await OrgEventRole.find({ orgId, isActive: true })
            .sort({ name: 1 });

        res.status(200).json({
            success: true,
            data: { roles }
        });
    } catch (error) {
        console.error('Error fetching org event roles:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching org event roles',
            error: error.message
        });
    }
});

// Create org-level event role
router.post('/:orgId/event-roles', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { OrgEventRole } = getModels(req, 'OrgEventRole');
    const { orgId } = req.params;
    const { name, description } = req.body;

    try {
        const role = new OrgEventRole({
            orgId,
            name,
            description,
            createdBy: req.user?.id
        });

        await role.save();

        res.status(201).json({
            success: true,
            message: 'Event role created successfully',
            data: { role }
        });
    } catch (error) {
        console.error('Error creating org event role:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating org event role',
            error: error.message
        });
    }
});

// Update org-level event role
router.put('/:orgId/event-roles/:roleId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { OrgEventRole } = getModels(req, 'OrgEventRole');
    const { orgId, roleId } = req.params;
    const { name, description, isActive } = req.body;

    try {
        const role = await OrgEventRole.findOne({ _id: roleId, orgId });
        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Event role not found'
            });
        }

        if (name !== undefined) role.name = name;
        if (description !== undefined) role.description = description;
        if (isActive !== undefined) role.isActive = isActive;

        await role.save();

        res.status(200).json({
            success: true,
            message: 'Event role updated successfully',
            data: { role }
        });
    } catch (error) {
        console.error('Error updating org event role:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating org event role',
            error: error.message
        });
    }
});

// Delete org-level event role
router.delete('/:orgId/event-roles/:roleId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { OrgEventRole } = getModels(req, 'OrgEventRole');
    const { orgId, roleId } = req.params;

    try {
        const role = await OrgEventRole.findOne({ _id: roleId, orgId });
        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Event role not found'
            });
        }

        await OrgEventRole.deleteOne({ _id: roleId });

        res.status(200).json({
            success: true,
            message: 'Event role deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting org event role:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting org event role',
            error: error.message
        });
    }
});

// ==================== EVENT ROLES (JOB ASSIGNMENTS) ====================

// Get event roles
router.get('/:orgId/events/:eventId/roles', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventJob } = getModels(req, 'EventJob');
    const { orgId, eventId } = req.params;

    try {
        const roles = await EventJob.find({ eventId, orgId })
            .populate('assignments.memberId', 'name email')
            .populate('orgRoleId', 'name description');

        console.log(`GET: /org-event-management/${orgId}/events/${eventId}/roles`);
        res.status(200).json({
            success: true,
            data: { roles }
        });

    } catch (error) {
        console.error('Error fetching event roles:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching event roles',
            error: error.message
        });
    }
});

// Create event role
router.post('/:orgId/events/:eventId/roles', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventJob, OrgEventRole } = getModels(req, 'EventJob', 'OrgEventRole');
    const { orgId, eventId } = req.params;
    const { orgRoleId, name, description, requiredCount, shiftStart, shiftEnd, agendaItemIds } = req.body;

    try {
        let roleName = name;
        let roleDescription = description;

        if (orgRoleId) {
            const orgRole = await OrgEventRole.findOne({ _id: orgRoleId, orgId });
            if (!orgRole) {
                return res.status(404).json({
                    success: false,
                    message: 'Org event role not found'
                });
            }
            roleName = roleName || orgRole.name;
            roleDescription = roleDescription || orgRole.description;
        }

        const role = new EventJob({
            eventId,
            orgId,
            orgRoleId: orgRoleId || null,
            name: roleName,
            description: roleDescription,
            requiredCount: requiredCount || 1,
            shiftStart: shiftStart ? new Date(shiftStart) : null,
            shiftEnd: shiftEnd ? new Date(shiftEnd) : null,
            agendaItemIds: agendaItemIds || [],
            assignments: []
        });

        await role.save();

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/roles`);
        res.status(201).json({
            success: true,
            message: 'Event role created successfully',
            data: { role }
        });

    } catch (error) {
        console.error('Error creating event role:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating event role',
            error: error.message
        });
    }
});

// Update event role
router.put('/:orgId/events/:eventId/roles/:roleId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventJob, OrgEventRole } = getModels(req, 'EventJob', 'OrgEventRole');
    const { orgId, eventId, roleId } = req.params;
    const updateData = req.body;

    try {
        const role = await EventJob.findOne({
            _id: roleId,
            eventId,
            orgId
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Event role not found'
            });
        }

        if (updateData.orgRoleId) {
            const orgRole = await OrgEventRole.findOne({ _id: updateData.orgRoleId, orgId });
            if (!orgRole) {
                return res.status(404).json({
                    success: false,
                    message: 'Org event role not found'
                });
            }
            role.orgRoleId = orgRole._id;
            role.name = orgRole.name;
            role.description = orgRole.description;
        }

        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined && key !== 'assignments' && key !== 'orgRoleId') {
                if (key === 'shiftStart' || key === 'shiftEnd') {
                    role[key] = updateData[key] ? new Date(updateData[key]) : null;
                } else {
                    role[key] = updateData[key];
                }
            }
        });

        await role.save();

        console.log(`PUT: /org-event-management/${orgId}/events/${eventId}/roles/${roleId}`);
        res.status(200).json({
            success: true,
            message: 'Event role updated successfully',
            data: { role }
        });

    } catch (error) {
        console.error('Error updating event role:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating event role',
            error: error.message
        });
    }
});

// Delete event role
router.delete('/:orgId/events/:eventId/roles/:roleId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventJob } = getModels(req, 'EventJob');
    const { orgId, eventId, roleId } = req.params;

    try {
        const role = await EventJob.findOne({
            _id: roleId,
            eventId,
            orgId
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Event role not found'
            });
        }

        await EventJob.deleteOne({ _id: roleId });

        console.log(`DELETE: /org-event-management/${orgId}/events/${eventId}/roles/${roleId}`);
        res.status(200).json({
            success: true,
            message: 'Event role deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting event role:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting event role',
            error: error.message
        });
    }
});

// Get assignments for event
router.get('/:orgId/events/:eventId/assignments', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventJob } = getModels(req, 'EventJob');
    const { orgId, eventId } = req.params;

    try {
        const roles = await EventJob.find({ eventId, orgId })
            .populate('assignments.memberId', 'name email');

        // Flatten all assignments
        const assignments = [];
        roles.forEach(role => {
            role.assignments.forEach(assignment => {
                assignments.push({
                    ...assignment.toObject(),
                    roleId: role._id,
                    roleName: role.name
                });
            });
        });

        console.log(`GET: /org-event-management/${orgId}/events/${eventId}/assignments`);
        res.status(200).json({
            success: true,
            data: { assignments }
        });

    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching assignments',
            error: error.message
        });
    }
});

// Create assignment
router.post('/:orgId/events/:eventId/assignments', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventJob } = getModels(req, 'EventJob');
    const { orgId, eventId } = req.params;
    const { roleId, memberId, status, notes } = req.body;

    try {
        const role = await EventJob.findOne({
            _id: roleId,
            eventId,
            orgId
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Event role not found'
            });
        }

        // Check if already assigned
        const existingAssignment = role.assignments.find(a => a.memberId.toString() === memberId);
        if (existingAssignment) {
            return res.status(400).json({
                success: false,
                message: 'Member is already assigned to this role'
            });
        }

        role.assignments.push({
            memberId,
            status: status || 'assigned',
            notes,
            assignedAt: new Date()
        });

        await role.save();

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/assignments`);
        res.status(201).json({
            success: true,
            message: 'Assignment created successfully',
            data: { assignment: role.assignments[role.assignments.length - 1] }
        });

    } catch (error) {
        console.error('Error creating assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating assignment',
            error: error.message
        });
    }
});

// Update assignment
router.put('/:orgId/events/:eventId/assignments/:assignmentId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventJob } = getModels(req, 'EventJob');
    const { orgId, eventId, assignmentId } = req.params;
    const { status, notes } = req.body;

    try {
        const role = await EventJob.findOne({
            eventId,
            orgId,
            'assignments._id': assignmentId
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found'
            });
        }

        const assignment = role.assignments.id(assignmentId);
        if (status) assignment.status = status;
        if (notes !== undefined) assignment.notes = notes;
        if (status === 'confirmed') assignment.confirmedAt = new Date();

        await role.save();

        console.log(`PUT: /org-event-management/${orgId}/events/${eventId}/assignments/${assignmentId}`);
        res.status(200).json({
            success: true,
            message: 'Assignment updated successfully',
            data: { assignment }
        });

    } catch (error) {
        console.error('Error updating assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating assignment',
            error: error.message
        });
    }
});

// Volunteer signup (self-service)
router.post('/:orgId/events/:eventId/volunteer-signups', verifyToken, async (req, res) => {
    const { VolunteerSignup, EventJob } = getModels(req, 'VolunteerSignup', 'EventJob');
    const { orgId, eventId } = req.params;
    const { roleId, shiftStart, shiftEnd, breakRequest, availability } = req.body;
    const memberId = req.user._id;

    try {
        // Check if already signed up
        const existing = await VolunteerSignup.findOne({
            eventId,
            memberId,
            roleId
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'You have already signed up for this role'
            });
        }

        // Check for conflicts (overlapping shifts)
        const conflictingSignups = await VolunteerSignup.find({
            eventId,
            memberId,
            status: { $in: ['pending', 'approved'] }
        });

        if (shiftStart && shiftEnd) {
            const newStart = new Date(shiftStart);
            const newEnd = new Date(shiftEnd);

            for (const signup of conflictingSignups) {
                if (signup.shiftStart && signup.shiftEnd) {
                    const existingStart = new Date(signup.shiftStart);
                    const existingEnd = new Date(signup.shiftEnd);

                    if ((newStart < existingEnd && newEnd > existingStart)) {
                        return res.status(400).json({
                            success: false,
                            message: 'This shift conflicts with another role you have signed up for'
                        });
                    }
                }
            }
        }

        const signup = new VolunteerSignup({
            eventId,
            memberId,
            roleId,
            shiftStart: shiftStart ? new Date(shiftStart) : null,
            shiftEnd: shiftEnd ? new Date(shiftEnd) : null,
            breakRequest,
            availability: availability || [],
            status: 'pending'
        });

        await signup.save();

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/volunteer-signups`);
        res.status(201).json({
            success: true,
            message: 'Volunteer signup created successfully',
            data: { signup }
        });

    } catch (error) {
        console.error('Error creating volunteer signup:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating volunteer signup',
            error: error.message
        });
    }
});

// Get volunteer signups
router.get('/:orgId/events/:eventId/volunteer-signups', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { VolunteerSignup } = getModels(req, 'VolunteerSignup');
    const { orgId, eventId } = req.params;

    try {
        const signups = await VolunteerSignup.find({ eventId })
            .populate('memberId', 'name email')
            .populate('roleId', 'name description')
            .sort({ createdAt: -1 });

        console.log(`GET: /org-event-management/${orgId}/events/${eventId}/volunteer-signups`);
        res.status(200).json({
            success: true,
            data: { signups }
        });

    } catch (error) {
        console.error('Error fetching volunteer signups:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching volunteer signups',
            error: error.message
        });
    }
});

// ==================== EQUIPMENT MANAGEMENT ====================

// Get org equipment inventory
router.get('/:orgId/equipment', verifyToken, requireOrgPermission('modify_equipment', 'orgId'), async (req, res) => {
    const { OrgEquipment } = getModels(req, 'OrgEquipment');
    const { orgId } = req.params;

    try {
        const equipment = await OrgEquipment.find({ orgId }).sort({ createdAt: -1 });

        console.log(`GET: /org-event-management/${orgId}/equipment`);
        res.status(200).json({
            success: true,
            data: { equipment }
        });

    } catch (error) {
        console.error('Error fetching equipment:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching equipment',
            error: error.message
        });
    }
});

// Add equipment to org inventory
router.post('/:orgId/equipment', verifyToken, requireOrgPermission('modify_equipment', 'orgId'), async (req, res) => {
    const { OrgEquipment } = getModels(req, 'OrgEquipment');
    const { orgId } = req.params;
    const { name, quantity, storageLocation, managedByRole } = req.body;

    try {
        const total = Math.max(1, parseInt(quantity, 10) || 1);
        const createdItems = [];

        for (let i = 0; i < total; i += 1) {
            const equipment = new OrgEquipment({
                orgId,
                name,
                quantity: 1,
                storageLocation: storageLocation || null,
                managedByRole: managedByRole || null,
                createdBy: req.user?._id
            });
            await equipment.save();
            createdItems.push(equipment);
        }

        console.log(`POST: /org-event-management/${orgId}/equipment`);
        res.status(201).json({
            success: true,
            message: 'Equipment added successfully',
            data: { equipment: createdItems }
        });

    } catch (error) {
        console.error('Error adding equipment:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding equipment',
            error: error.message
        });
    }
});

// Update equipment
router.put('/:orgId/equipment/:equipmentId', verifyToken, requireOrgPermission('modify_equipment', 'orgId'), async (req, res) => {
    const { OrgEquipment } = getModels(req, 'OrgEquipment');
    const { orgId, equipmentId } = req.params;
    const updateData = req.body;

    try {
        const equipment = await OrgEquipment.findOne({
            orgId,
            $or: [{ _id: equipmentId }, { id: equipmentId }]
        });

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: 'Equipment not found'
            });
        }

        const allowedFields = ['name', 'storageLocation', 'managedByRole'];
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                equipment[field] = updateData[field];
            }
        });

        equipment.quantity = 1;

        await equipment.save();

        console.log(`PUT: /org-event-management/${orgId}/equipment/${equipmentId}`);
        res.status(200).json({
            success: true,
            message: 'Equipment updated successfully',
            data: { equipment }
        });

    } catch (error) {
        console.error('Error updating equipment:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating equipment',
            error: error.message
        });
    }
});

// Delete equipment
router.delete('/:orgId/equipment/:equipmentId', verifyToken, requireOrgPermission('modify_equipment', 'orgId'), async (req, res) => {
    const { OrgEquipment } = getModels(req, 'OrgEquipment');
    const { orgId, equipmentId } = req.params;

    try {
        const equipment = await OrgEquipment.findOne({
            orgId,
            $or: [{ _id: equipmentId }, { id: equipmentId }]
        });

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: 'Equipment not found'
            });
        }

        await OrgEquipment.deleteOne({ _id: equipment._id });

        res.status(200).json({
            success: true,
            message: 'Equipment deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting equipment:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting equipment',
            error: error.message
        });
    }
});

// Get event equipment
router.get('/:orgId/events/:eventId/equipment', verifyToken, requireOrgPermission('manage_equipment', 'orgId'), async (req, res) => {
    const { EventEquipment, OrgEquipment } = getModels(req, 'EventEquipment', 'OrgEquipment');
    const { orgId, eventId } = req.params;

    try {
        let eventEquipment = await EventEquipment.findOne({ eventId, orgId });

        if (!eventEquipment) {
            eventEquipment = new EventEquipment({
                eventId,
                orgId,
                items: []
            });
            await eventEquipment.save();
        }

        // Get all org equipment to show what's available
        const orgEquipment = await OrgEquipment.find({ orgId });

        console.log(`GET: /org-event-management/${orgId}/events/${eventId}/equipment`);
        res.status(200).json({
            success: true,
            data: {
                eventEquipment,
                availableEquipment: orgEquipment.filter(eq => (eq.quantity || 0) > 0)
            }
        });

    } catch (error) {
        console.error('Error fetching event equipment:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching event equipment',
            error: error.message
        });
    }
});

// Checkout equipment to event
router.post('/:orgId/events/:eventId/equipment/:equipmentId/checkout', verifyToken, requireOrgPermission('manage_equipment', 'orgId'), async (req, res) => {
    const { OrgEquipment, EventEquipment } = getModels(req, 'OrgEquipment', 'EventEquipment');
    const { orgId, eventId, equipmentId } = req.params;
    const { quantity = 1 } = req.body;

    try {
        const equipment = await OrgEquipment.findOne({
            orgId,
            $or: [{ _id: equipmentId }, { id: equipmentId }]
        });

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: 'Equipment not found'
            });
        }

        if (equipment.quantity < quantity) {
            return res.status(400).json({
                success: false,
                message: 'Not enough inventory available'
            });
        }

        equipment.quantity -= quantity;
        await equipment.save();

        // Add to event equipment
        let eventEquipment = await EventEquipment.findOne({ eventId, orgId });
        if (!eventEquipment) {
            eventEquipment = new EventEquipment({
                eventId,
                orgId,
                items: []
            });
        }

        const existingItem = eventEquipment.items.find(item => item.equipmentId === equipment.id);
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            const eventItem = {
                name: equipment.name,
                equipmentId: equipment.id,
                quantity
            };
            eventEquipment.items.push(eventItem);
        }
        await eventEquipment.save();

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/equipment/${equipmentId}/checkout`);
        res.status(200).json({
            success: true,
            message: 'Equipment checked out to event successfully',
            data: { equipment, eventEquipment }
        });

    } catch (error) {
        console.error('Error checking out equipment:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking out equipment',
            error: error.message
        });
    }
});

// Checkin equipment from event
router.post('/:orgId/events/:eventId/equipment/:equipmentId/checkin', verifyToken, requireOrgPermission('manage_equipment', 'orgId'), async (req, res) => {
    const { OrgEquipment, EventEquipment } = getModels(req, 'OrgEquipment', 'EventEquipment');
    const { orgId, eventId, equipmentId } = req.params;

    try {
        const equipment = await OrgEquipment.findOne({
            orgId,
            $or: [{ _id: equipmentId }, { id: equipmentId }]
        });

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: 'Equipment not found'
            });
        }

        const eventEquipment = await EventEquipment.findOne({ eventId, orgId });
        if (eventEquipment) {
            const itemIndex = eventEquipment.items.findIndex(item =>
                item.equipmentId === equipment.id || item.identifier === equipment.id
            );
            if (itemIndex !== -1) {
                const item = eventEquipment.items[itemIndex];
                equipment.quantity += item.quantity || 1;
                eventEquipment.items.splice(itemIndex, 1);
                await equipment.save();
                await eventEquipment.save();
            }
        }

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/equipment/${equipmentId}/checkin`);
        res.status(200).json({
            success: true,
            message: 'Equipment checked in successfully',
            data: { equipment }
        });

    } catch (error) {
        console.error('Error checking in equipment:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking in equipment',
            error: error.message
        });
    }
});

// Checkout equipment to member
router.post('/:orgId/equipment/:equipmentId/member-checkout', verifyToken, requireOrgPermission('manage_equipment', 'orgId'), async (req, res) => {
    const { OrgEquipment } = getModels(req, 'OrgEquipment');
    const { orgId, equipmentId } = req.params;
    const memberId = req.user._id;

    try {
        const equipment = await OrgEquipment.findOne({
            orgId,
            $or: [{ _id: equipmentId }, { id: equipmentId }]
        });

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: 'Equipment not found'
            });
        }

        if (equipment.quantity < 1) {
            return res.status(400).json({
                success: false,
                message: 'Equipment is not available'
            });
        }

        equipment.quantity -= 1;
        await equipment.save();

        console.log(`POST: /org-event-management/${orgId}/equipment/${equipmentId}/member-checkout`);
        res.status(200).json({
            success: true,
            message: 'Equipment checked out successfully',
            data: { equipment }
        });

    } catch (error) {
        console.error('Error checking out equipment to member:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking out equipment',
            error: error.message
        });
    }
});

// Checkin equipment from member
router.post('/:orgId/equipment/:equipmentId/member-checkin', verifyToken, requireOrgPermission('manage_equipment', 'orgId'), async (req, res) => {
    const { OrgEquipment } = getModels(req, 'OrgEquipment');
    const { orgId, equipmentId } = req.params;
    const memberId = req.user._id;

    try {
        const equipment = await OrgEquipment.findOne({
            _id: equipmentId,
            orgId
        });

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: 'Equipment not found'
            });
        }

        equipment.quantity += 1;
        await equipment.save();

        console.log(`POST: /org-event-management/${orgId}/equipment/${equipmentId}/member-checkin`);
        res.status(200).json({
            success: true,
            message: 'Equipment checked in successfully',
            data: { equipment }
        });

    } catch (error) {
        console.error('Error checking in equipment from member:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking in equipment',
            error: error.message
        });
    }
});

// ==================== ANALYTICS ====================

// Get detailed event analytics
router.get('/:orgId/events/:eventId/analytics', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventAnalytics, EventJob, VolunteerSignup } = getModels(req, 'EventAnalytics', 'EventJob', 'VolunteerSignup');
    const { orgId, eventId } = req.params;

    try {
        const analytics = await EventAnalytics.findOne({ eventId });

        // Get volunteer stats
        const roles = await EventJob.find({ eventId });
        const signups = await VolunteerSignup.find({ eventId });

        const volunteerStats = {
            total: roles.reduce((sum, role) => sum + (role.assignments?.length || 0), 0),
            confirmed: roles.reduce((sum, role) => 
                sum + (role.assignments?.filter(a => a.status === 'confirmed')?.length || 0), 0
            ),
            checkedIn: signups.filter(s => s.checkedIn).length
        };

        console.log(`GET: /org-event-management/${orgId}/events/${eventId}/analytics`);
        res.status(200).json({
            success: true,
            data: {
                analytics: analytics || {
                    views: 0,
                    uniqueViews: 0,
                    rsvps: 0,
                    uniqueRsvps: 0,
                    engagementRate: 0
                },
                roles: {
                    total: roles.length,
                    assignments: volunteerStats.total,
                    confirmed: volunteerStats.confirmed
                },
                volunteers: volunteerStats
            }
        });

    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching analytics',
            error: error.message
        });
    }
});

// Export event report
router.post('/:orgId/events/:eventId/export', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, EventAnalytics, EventAgenda, EventJob, VolunteerSignup, EventEquipment } = getModels(
        req, 'Event', 'EventAnalytics', 'EventAgenda', 'EventJob', 'VolunteerSignup', 'EventEquipment'
    );
    const { orgId, eventId } = req.params;
    const { format = 'json' } = req.body;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        const analytics = await EventAnalytics.findOne({ eventId });
        const agenda = await EventAgenda.findOne({ eventId });
        const roles = await EventJob.find({ eventId }).populate('assignments.memberId', 'name email');
        const signups = await VolunteerSignup.find({ eventId }).populate('memberId', 'name email');
        const equipment = await EventEquipment.findOne({ eventId });

        const report = {
            event: {
                name: event.name,
                start_time: event.start_time,
                end_time: event.end_time,
                location: event.location,
                type: event.type,
                status: event.status
            },
            analytics: analytics || {},
            agenda: agenda?.items || [],
            roles: roles.map(role => ({
                name: role.name,
                requiredCount: role.requiredCount,
                assignments: role.assignments || []
            })),
            volunteers: signups,
            equipment: equipment?.items || [],
            generatedAt: new Date()
        };

        if (format === 'csv') {
            // In production, convert to CSV format
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="event-${eventId}-report.csv"`);
            // CSV conversion would go here
            return res.send(JSON.stringify(report));
        }

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/export`);
        res.status(200).json({
            success: true,
            data: { report }
        });

    } catch (error) {
        console.error('Error exporting report:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting report',
            error: error.message
        });
    }
});

module.exports = router;
