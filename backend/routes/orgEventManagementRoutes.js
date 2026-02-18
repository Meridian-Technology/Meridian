const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken');
const getModels  = require('../services/getModelService');
const { requireEventManagement, requireOrgPermission } = require('../middlewares/orgPermissions');
const StudySessionService = require('../services/studySessionService');

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
                    totalRegistrations: { $sum: '$registrations' },
                    totalUniqueRegistrations: { $sum: '$uniqueRegistrations' },
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
                    registrations: 1,
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

        // Get member engagement with events (events where member is in attendees)
        const memberEngagement = await OrgMember.aggregate([
            { $match: { org_id: orgId, status: 'active' } },
            {
                $lookup: {
                    from: 'events',
                    let: { uid: '$user_id' },
                    pipeline: [
                        { $match: { hostingId: orgId, hostingType: 'Org', isDeleted: false, $expr: { $in: ['$$uid', '$attendees.userId'] } } },
                        { $count: 'count' }
                    ],
                    as: 'attendedEvents'
                }
            },
            {
                $project: {
                    userId: '$user_id',
                    attendedCount: { $ifNull: [{ $arrayElemAt: ['$attendedEvents.count', 0] }, 0] }
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
                totalRegistrations: analyticsData[0]?.totalRegistrations || 0,
                totalUniqueRegistrations: analyticsData[0]?.totalUniqueRegistrations || 0,
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
                    registrations: 0,
                    uniqueRegistrations: 0,
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

        const registrationCount = event.registrationCount ?? (event.attendees?.length ?? 0);

        const checkedInCount = signups.filter(s => s.checkedIn).length;

        let eventCheckIn = null;
        if (event.checkInEnabled && event.attendees && Array.isArray(event.attendees)) {
            const totalCheckedIn = event.attendees.filter(a => a.checkedIn).length;
            const totalRegistrations = event.registrationCount ?? event.attendees.length;
            eventCheckIn = {
                totalCheckedIn,
                totalRegistrations,
                checkInRate: totalRegistrations > 0 ? ((totalCheckedIn / totalRegistrations) * 100).toFixed(1) : '0'
            };
            console.log('[dashboard] event check-in stats', {
                eventId,
                checkInEnabled: event.checkInEnabled,
                attendeesTotal: event.attendees.length,
                totalCheckedIn,
                totalRegistrations: eventCheckIn.totalRegistrations,
                checkInRate: eventCheckIn.checkInRate
            });
        } else {
            console.log('[dashboard] event check-in skipped', {
                eventId,
                checkInEnabled: event.checkInEnabled,
                hasAttendees: !!(event.attendees && Array.isArray(event.attendees)),
                attendeesLength: event.attendees?.length ?? 0
            });
        }

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
                    registrations: 0,
                    uniqueRegistrations: 0,
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
                    registrationCount,
                    volunteers: {
                        total: totalVolunteers,
                        confirmed: confirmedVolunteers,
                        checkedIn: checkedInCount
                    },
                    operationalStatus,
                    checkIn: eventCheckIn
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

// ==================== EVENT QR CODES ====================

// List event QRs
router.get('/:orgId/events/:eventId/qr', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventQR, Event } = getModels(req, 'EventQR', 'Event');
    const { orgId, eventId } = req.params;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const qrCodes = await EventQR.find({ eventId, orgId })
            .select('-scanHistory')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, data: qrCodes });
    } catch (error) {
        console.error('Error listing event QRs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create event QR
router.post('/:orgId/events/:eventId/qr', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventQR, Event } = getModels(req, 'EventQR', 'Event');
    const { nanoid } = require('nanoid');
    const { orgId, eventId } = req.params;
    const { name, fgColor = '#414141', bgColor = '#ffffff', transparentBg = false, dotType = 'extra-rounded', cornerType = 'extra-rounded' } = req.body;

    try {
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const shortId = nanoid(8);
        const qr = new EventQR({
            eventId,
            orgId,
            name: name.trim(),
            shortId,
            fgColor,
            bgColor,
            transparentBg: Boolean(transparentBg),
            dotType: ['extra-rounded', 'square', 'dots'].includes(dotType) ? dotType : 'extra-rounded',
            cornerType: ['extra-rounded', 'square', 'dot'].includes(cornerType) ? cornerType : 'extra-rounded'
        });
        await qr.save();

        res.status(201).json({ success: true, data: qr });
    } catch (error) {
        console.error('Error creating event QR:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update event QR
router.put('/:orgId/events/:eventId/qr/:qrId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventQR, Event } = getModels(req, 'EventQR', 'Event');
    const { orgId, eventId, qrId } = req.params;
    const { name, fgColor, bgColor, transparentBg, dotType, cornerType } = req.body;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const qr = await EventQR.findOne({ _id: qrId, eventId, orgId });
        if (!qr) {
            return res.status(404).json({ success: false, message: 'QR code not found' });
        }

        if (name !== undefined) qr.name = name.trim();
        if (fgColor !== undefined) qr.fgColor = fgColor;
        if (bgColor !== undefined) qr.bgColor = bgColor;
        if (transparentBg !== undefined) qr.transparentBg = Boolean(transparentBg);
        if (dotType !== undefined && ['extra-rounded', 'square', 'dots'].includes(dotType)) qr.dotType = dotType;
        if (cornerType !== undefined && ['extra-rounded', 'square', 'dot'].includes(cornerType)) qr.cornerType = cornerType;
        await qr.save();

        res.status(200).json({ success: true, data: qr });
    } catch (error) {
        console.error('Error updating event QR:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete event QR
router.delete('/:orgId/events/:eventId/qr/:qrId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventQR, Event } = getModels(req, 'EventQR', 'Event');
    const { orgId, eventId, qrId } = req.params;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const qr = await EventQR.findOneAndDelete({ _id: qrId, eventId, orgId });
        if (!qr) {
            return res.status(404).json({ success: false, message: 'QR code not found' });
        }

        res.status(200).json({ success: true, message: 'QR code deleted' });
    } catch (error) {
        console.error('Error deleting event QR:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get event QR analytics (aggregate)
// Date range: first QR creation -> event end (for overall); per-QR: that QR's creation -> event end
router.get('/:orgId/events/:eventId/qr/analytics', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventQR, Event, AnalyticsEvent } = getModels(req, 'EventQR', 'Event', 'AnalyticsEvent');
    const { orgId, eventId } = req.params;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const qrCodes = await EventQR.find({ eventId, orgId }).sort({ createdAt: 1 }).lean();
        const qrIds = qrCodes.map(q => q._id.toString());
        const shortIds = qrCodes.map(q => q.shortId);

        const eventEnd = new Date(event.end_time);
        eventEnd.setHours(23, 59, 59, 999);
        let startDate = qrCodes.length > 0
            ? (() => { const d = new Date(qrCodes[0].createdAt); d.setHours(0, 0, 0, 0); return d; })()
            : new Date(event.start_time);
        if (startDate > eventEnd) startDate = eventEnd;
        const endDate = eventEnd;

        const platformMatch = {
            event: 'event_qr_scan',
            ts: { $gte: startDate, $lte: endDate },
            $or: [
                { 'properties.event_id': eventId },
                { 'properties.qr_short_id': { $in: shortIds } }
            ]
        };

        const dailyAgg = await AnalyticsEvent.aggregate([
            { $match: platformMatch },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        const dailyScans = {};
        dailyAgg.forEach(({ _id, count }) => { dailyScans[_id] = count; });

        const byQRAgg = await AnalyticsEvent.aggregate([
            { $match: platformMatch },
            { $group: { _id: '$properties.qr_short_id', count: { $sum: 1 } } }
        ]);
        const byQRCounts = {};
        byQRAgg.forEach(({ _id: sid, count }) => { if (sid) byQRCounts[sid] = count; });

        const byQRDailyAgg = await AnalyticsEvent.aggregate([
            { $match: platformMatch },
            { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, shortId: '$properties.qr_short_id' }, count: { $sum: 1 } } },
            { $sort: { '_id.date': 1 } }
        ]);
        const dailyByQR = {};
        byQRDailyAgg.forEach(({ _id, count }) => {
            if (_id.shortId) {
                if (!dailyByQR[_id.shortId]) dailyByQR[_id.shortId] = {};
                dailyByQR[_id.shortId][_id.date] = count;
            }
        });

        const toDateStr = (d) => d.toISOString().slice(0, 10);
        const qrCreatedStr = (q) => toDateStr(new Date(q.createdAt));

        const byQR = qrCodes.map(q => {
            const rawDaily = dailyByQR[q.shortId] || {};
            const qrStart = qrCreatedStr(q);
            const filteredDaily = {};
            Object.entries(rawDaily).forEach(([date, count]) => {
                if (date >= qrStart) filteredDaily[date] = count;
            });
            return {
                qrId: q._id,
                name: q.name,
                shortId: q.shortId,
                createdAt: q.createdAt,
                scans: byQRCounts[q.shortId] ?? q.scans ?? 0,
                uniqueScans: q.uniqueScans ?? 0,
                lastScanned: q.lastScanned,
                dailyScans: filteredDaily
            };
        });

        const totalScans = Object.values(byQRCounts).reduce((a, b) => a + b, 0) || qrCodes.reduce((a, q) => a + (q.scans || 0), 0);
        const totalUniqueScans = qrCodes.reduce((a, q) => a + (q.uniqueScans || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                summary: { totalQRCodes: qrCodes.length, totalScans, totalUniqueScans },
                dateRange: { startDate: startDate.toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10) },
                dailyScans,
                byQR
            }
        });
    } catch (error) {
        console.error('Error fetching event QR analytics:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single event QR analytics
router.get('/:orgId/events/:eventId/qr/:qrId/analytics', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventQR, Event, AnalyticsEvent } = getModels(req, 'EventQR', 'Event', 'AnalyticsEvent');
    const { orgId, eventId, qrId } = req.params;
    const { timeRange = '30d' } = req.query;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const qr = await EventQR.findOne({ _id: qrId, eventId, orgId });
        if (!qr) {
            return res.status(404).json({ success: false, message: 'QR code not found' });
        }

        const now = new Date();
        let startDate;
        switch (timeRange) {
            case '7d': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
            case '30d': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
            case '90d': startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
            default: startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const dailyAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    event: 'event_qr_scan',
                    'properties.qr_short_id': qr.shortId,
                    ts: { $gte: startDate, $lte: now }
                }
            },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        const dailyScans = {};
        dailyAgg.forEach(({ _id, count }) => { dailyScans[_id] = count; });

        res.status(200).json({
            success: true,
            data: {
                qr: { _id: qr._id, name: qr.name, shortId: qr.shortId, scans: qr.scans, uniqueScans: qr.uniqueScans, lastScanned: qr.lastScanned },
                dailyScans
            }
        });
    } catch (error) {
        console.error('Error fetching event QR analytics:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// List org forms (for event registration form selector)
router.get('/:orgId/forms', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Form } = getModels(req, 'Form');
    const { orgId } = req.params;

    try {
        const forms = await Form.find({
            formOwner: orgId,
            formOwnerType: 'Org'
        })
            .select('_id title description questions allowAnonymous collectGuestDetails')
            .sort({ updatedAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            data: forms
        });
    } catch (error) {
        console.error('Error listing org forms:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Create org form (for event registration form - event managers can create without member management)
router.post('/:orgId/forms', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Org, Form } = getModels(req, 'Org', 'Form');
    const { orgId } = req.params;
    const { form: formBody } = req.body;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const formData = {
            ...formBody,
            createdBy: req.user.userId,
            createdType: 'User',
            formOwner: orgId,
            formOwnerType: 'Org'
        };

        const processedForm = {
            ...formData,
            questions: (formData.questions || []).map((q) => {
                if (q._id && String(q._id).startsWith('NEW_QUESTION_')) {
                    const { _id, ...rest } = q;
                    return rest;
                }
                return q;
            })
        };

        const newForm = new Form(processedForm);
        await newForm.save();

        res.status(201).json({
            success: true,
            message: 'Form created successfully',
            data: newForm
        });
    } catch (error) {
        console.error('Error creating form:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Update org form (event managers can edit registration forms)
router.put('/:orgId/forms/:formId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Org, Form } = getModels(req, 'Org', 'Form');
    const { orgId, formId } = req.params;
    const { form: formBody } = req.body;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const existingForm = await Form.findOne({
            _id: formId,
            formOwner: orgId,
            formOwnerType: 'Org'
        });
        if (!existingForm) {
            return res.status(404).json({
                success: false,
                message: 'Form not found or access denied'
            });
        }

        const processedForm = {
            ...formBody,
            questions: (formBody.questions || []).map((q) => {
                if (q._id && String(q._id).startsWith('NEW_QUESTION_')) {
                    const { _id, ...rest } = q;
                    return rest;
                }
                return q;
            })
        };

        const updatedForm = await Form.findByIdAndUpdate(
            formId,
            { ...processedForm, updatedAt: new Date() },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: 'Form updated successfully',
            data: updatedForm
        });
    } catch (error) {
        console.error('Error updating org form:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get event registration form responses (for organizers)
router.get('/:orgId/events/:eventId/registration-responses', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, FormResponse, User, Form } = getModels(req, 'Event', 'FormResponse', 'User', 'Form');
    const { orgId, eventId } = req.params;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        })
            .populate('attendees.userId', 'name username email');

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        const registrations = (event.attendees || []).map(a => ({
            userId: a.userId,
            registeredAt: a.registeredAt,
            guestCount: a.guestCount,
            checkedIn: a.checkedIn,
            checkedInAt: a.checkedInAt
        }));

        let formResponses = [];
        if (event.registrationFormId) {
            const responses = await FormResponse.find({ event: eventId })
                .populate('submittedBy', 'name username email picture')
                .sort({ submittedAt: 1 })
                .lean();
            formResponses = responses.map(r => ({
                _id: r._id,
                submittedBy: r.submittedBy,
                guestName: r.guestName,
                guestEmail: r.guestEmail ?? r.guestUsername,
                submittedAt: r.submittedAt,
                formSnapshot: r.formSnapshot,
                answers: r.answers
            }));
        }

        res.status(200).json({
            success: true,
            data: {
                registrations,
                formResponses,
                registrationFormId: event.registrationFormId || null
            }
        });
    } catch (error) {
        console.error('Error fetching registration responses:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Remove a registration (form response + attendee) - event managers only
router.delete('/:orgId/events/:eventId/registration-responses/:responseId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, FormResponse, EventAnalytics } = getModels(req, 'Event', 'FormResponse', 'EventAnalytics');
    const { orgId, eventId, responseId } = req.params;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const formResponse = await FormResponse.findOne({
            _id: responseId,
            event: eventId
        });
        if (!formResponse) {
            return res.status(404).json({ success: false, message: 'Registration response not found' });
        }

        const userId = formResponse.submittedBy?.toString?.() || formResponse.submittedBy;
        await FormResponse.deleteOne({ _id: responseId });

        const attendees = (event.attendees || []).filter(
            a => (a.userId?.toString?.() || a.userId) !== userId
        );
        event.attendees = attendees;
        // Always decrement registrationCount (FormResponse = 1 registration, whether anonymous or not)
        event.registrationCount = Math.max(0, (event.registrationCount || 0) - 1);
        await event.save();

        try {
            const analytics = await EventAnalytics.findOne({ eventId });
            if (analytics && (analytics.registrations ?? analytics.rsvps) > 0) {
                analytics.registrations = Math.max(0, (analytics.registrations ?? analytics.rsvps ?? 0) - 1);
                if (analytics.uniqueRegistrations != null) analytics.uniqueRegistrations = Math.max(0, (analytics.uniqueRegistrations - 1));
                else if (analytics.uniqueRsvps != null) analytics.uniqueRsvps = Math.max(0, (analytics.uniqueRsvps - 1));
                analytics.registrationHistory = (analytics.registrationHistory || analytics.rsvpHistory || []).filter(
                    r => (r.userId?.toString?.() || r.userId) !== userId
                );
                await analytics.save();
            }
        } catch (analyticsErr) {
            console.error('Error updating analytics after registration removal:', analyticsErr);
        }

        return res.status(200).json({
            success: true,
            message: 'Registration removed',
            data: { removed: true }
        });
    } catch (error) {
        console.error('Error removing registration:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Remove an attendee by userId (for events without a registration form, or bulk remove)
router.delete('/:orgId/events/:eventId/registrations/:userId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, FormResponse, EventAnalytics } = getModels(req, 'Event', 'FormResponse', 'EventAnalytics');
    const { orgId, eventId, userId } = req.params;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const attendees = (event.attendees || []).filter(
            a => (a.userId?.toString?.() || a.userId) !== userId
        );
        const removed = event.attendees.length - attendees.length;
        if (removed === 0) {
            return res.status(404).json({ success: false, message: 'Registration not found' });
        }

        event.attendees = attendees;
        event.registrationCount = Math.max(0, (event.registrationCount || 0) - 1);
        await event.save();

        await FormResponse.deleteOne({ event: eventId, submittedBy: userId });

        try {
            const analytics = await EventAnalytics.findOne({ eventId });
            if (analytics && (analytics.registrations ?? analytics.rsvps) > 0) {
                analytics.registrations = Math.max(0, (analytics.registrations ?? analytics.rsvps ?? 0) - 1);
                if (analytics.uniqueRegistrations != null) analytics.uniqueRegistrations = Math.max(0, (analytics.uniqueRegistrations - 1));
                else if (analytics.uniqueRsvps != null) analytics.uniqueRsvps = Math.max(0, (analytics.uniqueRsvps - 1));
                analytics.registrationHistory = (analytics.registrationHistory || analytics.rsvpHistory || []).filter(
                    r => (r.userId?.toString?.() || r.userId) !== userId
                );
                await analytics.save();
            }
        } catch (analyticsErr) {
            console.error('Error updating analytics after registration removal:', analyticsErr);
        }

        return res.status(200).json({
            success: true,
            message: 'Registration removed',
            data: { removed: true }
        });
    } catch (error) {
        console.error('Error removing registration:', error);
        res.status(500).json({
            success: false,
            message: error.message
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
    const { Event, EventTemplate, EventAgenda } = getModels(req, 'Event', 'EventTemplate', 'EventAgenda');
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

        // Create default EventAgenda for the new event
        try {
            const agenda = new EventAgenda({
                eventId: event._id,
                orgId: orgId,
                items: [],
                isPublished: false
            });
            await agenda.save();
        } catch (agendaError) {
            console.error('Error creating default EventAgenda:', agendaError);
            // Don't fail the event creation if agenda creation fails
        }

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
    const { Event, EventAgenda } = getModels(req, 'Event', 'EventAgenda');
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

        // Handle check-in settings separately
        if (updateData.checkInEnabled !== undefined) {
            event.checkInEnabled = updateData.checkInEnabled;
            // Generate token if enabling check-in and token doesn't exist
            if (updateData.checkInEnabled && !event.checkInToken) {
                const crypto = require('crypto');
                event.checkInToken = crypto.randomBytes(32).toString('hex');
            }
        }

        if (updateData.checkInSettings !== undefined) {
            event.checkInSettings = {
                ...event.checkInSettings,
                ...updateData.checkInSettings
            };
        }

        // Update other event fields
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined && 
                key !== 'checkInEnabled' && 
                key !== 'checkInSettings') {
                event[key] = updateData[key];
            }
        });

        await event.save();

        // Ensure EventAgenda exists for this event (create if it doesn't exist)
        try {
            let agenda = await EventAgenda.findOne({ eventId, orgId });
            if (!agenda) {
                agenda = new EventAgenda({
                    eventId: event._id,
                    orgId: orgId,
                    items: [],
                    isPublished: false
                });
                await agenda.save();
            }
        } catch (agendaError) {
            console.error('Error ensuring EventAgenda exists:', agendaError);
            // Don't fail the event update if agenda check fails
        }

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
        if (items && Array.isArray(items)) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item.title || typeof item.title !== 'string' || item.title.trim() === '') {
                    return res.status(400).json({
                        success: false,
                        message: `Agenda item ${i + 1}: title is required.`
                    });
                }
                if (!item.id || typeof item.id !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: `Agenda item ${i + 1}: id is required.`
                    });
                }
                if (!item.startTime) {
                    return res.status(400).json({
                        success: false,
                        message: `Agenda item ${i + 1}: startTime is required.`
                    });
                }
                if (!item.endTime) {
                    return res.status(400).json({
                        success: false,
                        message: `Agenda item ${i + 1}: endTime is required.`
                    });
                }
                const startTime = new Date(item.startTime);
                const endTime = new Date(item.endTime);
                if (isNaN(startTime.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: `Agenda item ${i + 1}: invalid startTime format.`
                    });
                }
                if (isNaN(endTime.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: `Agenda item ${i + 1}: invalid endTime format.`
                    });
                }
                if (endTime <= startTime) {
                    return res.status(400).json({
                        success: false,
                        message: `Agenda item ${i + 1}: endTime must be after startTime.`
                    });
                }
            }
        }

        const sanitizedItems = (items || []).map((item) => {
            const { durationMinutes, ...rest } = item;
            return {
                ...rest,
                startTime: new Date(item.startTime),
                endTime: new Date(item.endTime)
            };
        });

        let agenda = await EventAgenda.findOne({ eventId, orgId });

        if (agenda) {
            if (items) {
                agenda.items = sanitizedItems;
                agenda.isPublished = false;
            }
            if (publicNotes !== undefined) agenda.publicNotes = publicNotes;
            if (internalNotes !== undefined) agenda.internalNotes = internalNotes;
            await agenda.save();
        } else {
            agenda = new EventAgenda({
                eventId,
                orgId,
                items: sanitizedItems,
                publicNotes,
                internalNotes,
                isPublished: false
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

        // When item is updated, set isPublished to false
        agenda.isPublished = false;
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

// Check room availability for event
router.post('/:orgId/events/:eventId/check-room-availability', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event } = getModels(req, 'Event');
    const { orgId, eventId } = req.params;
    const { startTime, endTime } = req.body;

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

        if (!event.classroom_id) {
            // No room reserved, skip check
            return res.status(200).json({
                success: true,
                data: { isAvailable: true, reason: 'No room reserved for this event' }
            });
        }

        const studySessionService = new StudySessionService(req);
        const availability = await studySessionService.checkRoomAvailabilityByClassroomId(
            startTime || event.start_time,
            endTime || event.end_time,
            event.classroom_id,
            eventId
        );

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/check-room-availability`);
        res.status(200).json({
            success: true,
            data: availability
        });

    } catch (error) {
        console.error('Error checking room availability:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking room availability',
            error: error.message
        });
    }
});

// Publish agenda
router.post('/:orgId/events/:eventId/agenda/publish', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventAgenda, Event } = getModels(req, 'EventAgenda', 'Event');
    const { orgId, eventId } = req.params;
    const { newEndTime } = req.body;

    try {
        const agenda = await EventAgenda.findOne({ eventId, orgId });

        if (!agenda) {
            return res.status(404).json({
                success: false,
                message: 'Agenda not found'
            });
        }

        if (!agenda.items || agenda.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot publish an empty agenda'
            });
        }

        // If newEndTime is provided, check room availability and update event
        if (newEndTime) {
            const event = await Event.findById(eventId);
            if (!event) {
                return res.status(404).json({
                    success: false,
                    message: 'Event not found'
                });
            }

            // Only check room availability if event has a classroom_id
            if (event.classroom_id) {
                const studySessionService = new StudySessionService(req);
                const availability = await studySessionService.checkRoomAvailabilityByClassroomId(
                    event.start_time,
                    new Date(newEndTime),
                    event.classroom_id,
                    eventId
                );

                if (!availability.isAvailable) {
                    return res.status(409).json({
                        success: false,
                        message: availability.reason || 'Room is unavailable for the requested time',
                        conflicts: availability.conflicts
                    });
                }
            }

            // Update event end_time
            event.end_time = new Date(newEndTime);
            await event.save();
        }

        agenda.isPublished = true;
        await agenda.save();

        console.log(`POST: /org-event-management/${orgId}/events/${eventId}/agenda/publish`);
        res.status(200).json({
            success: true,
            message: 'Agenda published successfully',
            data: { agenda }
        });

    } catch (error) {
        console.error('Error publishing agenda:', error);
        res.status(500).json({
            success: false,
            message: 'Error publishing agenda',
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
        // When items are deleted, set isPublished to false
        agenda.isPublished = false;
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
            status: status || 'confirmed', // Default to confirmed instead of assigned
            notes,
            assignedAt: new Date(),
            confirmedAt: status === 'confirmed' || !status ? new Date() : undefined
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

// Delete assignment
router.delete('/:orgId/events/:eventId/assignments/:assignmentId', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { EventJob } = getModels(req, 'EventJob');
    const { orgId, eventId, assignmentId } = req.params;

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

        role.assignments.pull(assignmentId);
        await role.save();

        console.log(`DELETE: /org-event-management/${orgId}/events/${eventId}/assignments/${assignmentId}`);
        res.status(200).json({
            success: true,
            message: 'Assignment deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting assignment',
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

// Get event RSVP growth data
router.get('/:orgId/events/:eventId/rsvp-growth', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, FormResponse, EventAnalytics } = getModels(req, 'Event', 'FormResponse', 'EventAnalytics');
    const { orgId, eventId } = req.params;

    console.log('[rsvp-growth] request', { eventId, orgId, school: req.school, host: req.headers?.host, timezone: req.query?.timezone });

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });

        if (!event) {
            console.log('[rsvp-growth] event not found');
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        const attendees = event.attendees || [];
        const registrationCount = event.registrationCount ?? attendees.length;
        console.log('[rsvp-growth] event', {
            eventId,
            attendeesLength: attendees.length,
            registrationCount,
            sampleAttendee: attendees[0] ? {
                hasUserId: !!attendees[0].userId,
                hasUser: !!attendees[0].user,
                keys: Object.keys(attendees[0] || {}),
                registeredAt: attendees[0].registeredAt,
                rsvpDate: attendees[0].rsvpDate
            } : null
        });

        const eventStart = new Date(event.start_time);
        const eventCreated = new Date(event.createdAt);
        const now = new Date();
        const cutoffDate = eventStart < now ? eventStart : now;
        const cutoffDateNormalized = new Date(cutoffDate);
        cutoffDateNormalized.setHours(23, 59, 59, 999);

        // Minimal payload: sparse registrations by day (only days with data)
        const registrations = {};

        const timezone = req.query.timezone || 'UTC';

        function toLocalDateKey(date) {
            const d = new Date(date);
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            return formatter.format(d);
        }

        // 1. Count from event.attendees (logged-in users who registered)
        attendees.forEach(attendee => {
            const uid = attendee?.userId ?? attendee?.user;
            if (!attendee || !uid) return;
            const guestCount = attendee.guestCount || 1;
            const regAt = attendee.registeredAt || attendee.rsvpDate;
            const regDate = regAt ? new Date(regAt) : new Date(eventCreated);
            if (regDate > cutoffDateNormalized) return;
            const dayKey = toLocalDateKey(regDate);
            if (!registrations[dayKey]) registrations[dayKey] = 0;
            registrations[dayKey] += guestCount;
        });
        const fromAttendees = Object.values(registrations).reduce((a, b) => a + b, 0);
        console.log('[rsvp-growth] from attendees', { fromAttendees, registrations: { ...registrations } });

        // 2. Count from FormResponse (anonymous form registrations - not in attendees)
        const formResponses = await FormResponse.find({
            event: eventId,
            submittedBy: null
        }).select('submittedAt').lean();

        formResponses.forEach(fr => {
            const regDate = fr.submittedAt ? new Date(fr.submittedAt) : new Date(eventCreated);
            if (regDate > cutoffDateNormalized) return;
            const dayKey = toLocalDateKey(regDate);
            if (!registrations[dayKey]) registrations[dayKey] = 0;
            registrations[dayKey] += 1;
        });
        console.log('[rsvp-growth] from FormResponse (anonymous)', { formResponsesCount: formResponses.length });

        // 3. Fallback: EventAnalytics.registrationHistory when attendees is empty but we have registrations
        const totalFromAttendeesAndForm = Object.values(registrations).reduce((a, b) => a + b, 0);
        if (totalFromAttendeesAndForm === 0 && registrationCount > 0) {
            const analytics = await EventAnalytics.findOne({ eventId }).select('registrationHistory').lean();
            const history = analytics?.registrationHistory || [];
            console.log('[rsvp-growth] fallback to EventAnalytics.registrationHistory', { historyLength: history.length });
            history.forEach((r) => {
                const regDate = r.timestamp ? new Date(r.timestamp) : new Date(eventCreated);
                if (regDate > cutoffDateNormalized) return;
                const dayKey = toLocalDateKey(regDate);
                if (!registrations[dayKey]) registrations[dayKey] = 0;
                registrations[dayKey] += 1;
            });
        }

        const totalRegistrations = Object.values(registrations).reduce((a, b) => a + b, 0);
        console.log('[rsvp-growth] final', { totalRegistrations, registrations: { ...registrations } });

        res.status(200).json({
            success: true,
            data: {
                registrations,
                eventCreated: eventCreated.toISOString(),
                eventStart: eventStart.toISOString(),
                expectedAttendance: event.expectedAttendance || 0
            }
        });

    } catch (error) {
        console.error('Error fetching RSVP growth data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching RSVP growth data',
            error: error.message
        });
    }
});


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
                    registrations: 0,
                    uniqueRegistrations: 0,
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
