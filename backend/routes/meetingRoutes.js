const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');
const { requireEventManagement } = require('../middlewares/orgPermissions');
const meetingService = require('../services/meetingService');
const recurringMeetingService = require('../services/recurringMeetingService');
const meetingQualificationService = require('../services/meetingQualificationService');

const MAX_LIMIT = 100;

function parsePagination(req) {
    let page = Math.max(1, parseInt(req.query.page, 10) || 1);
    let limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const sortBy = req.query.sortBy || 'start_time';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
    return { page, limit, sortBy, sortOrder, skip: (page - 1) * limit };
}

// ==================== MEETING RSVP (New Registration Doctrine) ====================

router.post('/:orgId/meetings/:eventId/rsvp', verifyToken, async (req, res) => {
    const { Event, MeetingConfig } = getModels(req, 'Event', 'MeetingConfig');
    const { orgId, eventId } = req.params;
    const user_id = req.user.userId;
    const { rsvpResponse } = req.body;

    if (!rsvpResponse || !['yes', 'no'].includes(rsvpResponse)) {
        return res.status(400).json({
            success: false,
            message: 'rsvpResponse is required and must be "yes" or "no"'
        });
    }

    try {
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        if (event.hostingId?.toString() !== orgId || event.hostingType !== 'Org') {
            return res.status(404).json({ success: false, message: 'Event not found for this organization' });
        }
        const config = await MeetingConfig.findOne({ eventId });
        if (!config) {
            return res.status(400).json({ success: false, message: 'This is not a meeting event' });
        }

        let attendee = event.attendees.find((a) => a.userId?.toString() === user_id);
        const isNew = !attendee;

        if (rsvpResponse === 'no') {
            if (!attendee) {
                event.attendees.push({
                    userId: user_id,
                    registeredAt: new Date(),
                    guestCount: 1,
                    rsvpResponse: 'no',
                    attendanceStatus: 'excused'
                });
                event.registrationCount = (event.registrationCount || 0) + 1;
            } else {
                attendee.rsvpResponse = 'no';
                attendee.attendanceStatus = 'excused';
            }
        } else {
            if (!attendee) {
                event.attendees.push({
                    userId: user_id,
                    registeredAt: new Date(),
                    guestCount: 1,
                    rsvpResponse: 'yes',
                    attendanceStatus: 'unexcused'
                });
                event.registrationCount = (event.registrationCount || 0) + 1;
            } else {
                attendee.rsvpResponse = 'yes';
                attendee.attendanceStatus = attendee.checkedIn ? 'present' : 'unexcused';
            }
        }

        await event.save();

        return res.status(200).json({
            success: true,
            data: { rsvpResponse, attendanceStatus: event.attendees.find((a) => a.userId?.toString() === user_id)?.attendanceStatus },
            message: 'RSVP updated'
        });
    } catch (error) {
        console.error('Meeting RSVP error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== MEETING MINUTES ====================

router.get('/:orgId/meetings/:eventId/minutes', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { MeetingMinutes, Event } = getModels(req, 'MeetingMinutes', 'Event');
    const { orgId, eventId } = req.params;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        let minutes = await MeetingMinutes.findOne({ eventId }).populate('createdBy', 'name username').populate('updatedBy', 'name username');
        if (!minutes) {
            minutes = { eventId, googleDocUrl: null, internalNotes: null, createdBy: null, updatedBy: null };
        }

        return res.status(200).json({ success: true, data: minutes });
    } catch (error) {
        console.error('Get meeting minutes error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/:orgId/meetings/:eventId/minutes', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { MeetingMinutes, Event } = getModels(req, 'MeetingMinutes', 'Event');
    const { orgId, eventId } = req.params;
    const user_id = req.user.userId;
    const { googleDocUrl, internalNotes } = req.body;

    try {
        const event = await Event.findOne({
            _id: eventId,
            hostingId: orgId,
            hostingType: 'Org',
            isDeleted: false
        });
        if (!event) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        let minutes = await MeetingMinutes.findOne({ eventId });
        if (!minutes) {
            minutes = new MeetingMinutes({ eventId, createdBy: user_id });
        }
        if (googleDocUrl !== undefined) minutes.googleDocUrl = googleDocUrl;
        if (internalNotes !== undefined) minutes.internalNotes = internalNotes;
        minutes.updatedBy = user_id;
        await minutes.save();

        return res.status(200).json({ success: true, data: minutes });
    } catch (error) {
        console.error('Update meeting minutes error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== MEETINGS LIST (Paginated) ====================

router.get('/:orgId/meetings', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, MeetingConfig } = getModels(req, 'Event', 'MeetingConfig');
    const { orgId } = req.params;
    const { page, limit, sortBy, sortOrder, skip } = parsePagination(req);
    const { type, dateFrom, dateTo } = req.query;

    try {
        const filter = {
            hostingId: orgId,
            hostingType: 'Org',
            type: 'meeting',
            isDeleted: false
        };
        if (type) filter['customFields.meetingType'] = type;
        if (dateFrom && dateTo) {
            filter.start_time = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
        } else if (dateFrom) {
            filter.start_time = { $gte: new Date(dateFrom) };
        } else if (dateTo) {
            filter.start_time = { $lte: new Date(dateTo) };
        }

        const sort = {}; sort[sortBy] = sortOrder;
        const meetings = await Event.find(filter).sort(sort).skip(skip).limit(limit).lean();
        const totalCount = await Event.countDocuments(filter);

        return res.status(200).json({
            success: true,
            data: { meetings },
            pagination: { currentPage: page, totalPages: Math.ceil(totalCount / limit), totalCount, limit }
        });
    } catch (error) {
        console.error('List meetings error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== MEETINGS DASHBOARD (Paginated) ====================

router.get('/:orgId/meetings/dashboard', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, MeetingConfig, MeetingMinutes } = getModels(req, 'Event', 'MeetingConfig', 'MeetingMinutes');
    const { orgId } = req.params;
    const { page, limit, sortBy, sortOrder, skip } = parsePagination(req);
    const { dateFrom, dateTo } = req.query;

    try {
        const filter = {
            hostingId: orgId,
            hostingType: 'Org',
            type: 'meeting',
            isDeleted: false
        };
        if (dateFrom && dateTo) {
            filter.start_time = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
        } else if (dateFrom) {
            filter.start_time = { $gte: new Date(dateFrom) };
        } else if (dateTo) {
            filter.start_time = { $lte: new Date(dateTo) };
        }

        const sort = {}; sort[sortBy] = sortOrder;
        const meetings = await Event.find(filter).sort(sort).skip(skip).limit(limit).lean();
        const totalCount = await Event.countDocuments(filter);

        const eventIds = meetings.map((m) => m._id);
        const minutesMap = {};
        const mins = await MeetingMinutes.find({ eventId: { $in: eventIds } }).lean();
        mins.forEach((m) => { minutesMap[m.eventId.toString()] = m; });

        const enriched = meetings.map((m) => {
            const present = (m.attendees || []).filter((a) => a.attendanceStatus === 'present').length;
            const excused = (m.attendees || []).filter((a) => a.attendanceStatus === 'excused').length;
            const unexcused = (m.attendees || []).filter((a) => a.attendanceStatus === 'unexcused').length;
            return {
                ...m,
                minutes: minutesMap[m._id.toString()] || null,
                attendanceCounts: { present, excused, unexcused }
            };
        });

        const qualificationSummary = {}; // Could aggregate from meetingQualificationService for members

        return res.status(200).json({
            success: true,
            data: { meetings: enriched, qualificationSummary },
            pagination: { currentPage: page, totalPages: Math.ceil(totalCount / limit), totalCount, limit }
        });
    } catch (error) {
        console.error('Meetings dashboard error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== PLAN A MEETING (One-Time) ====================

router.post('/:orgId/meetings/plan', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { Event, MeetingConfig, EventAgenda } = getModels(req, 'Event', 'MeetingConfig', 'EventAgenda');
    const { orgId } = req.params;
    const user_id = req.user.userId;
    const { name, type, location, description, start_time, end_time, meetingType = 'one-time', requiredRoles = ['members'] } = req.body;

    if (!name || !location || !start_time || !end_time) {
        return res.status(400).json({ success: false, message: 'name, location, start_time, end_time are required' });
    }

    try {
        const attendees = await meetingService.resolveRequiredAttendees(req, orgId, requiredRoles);
        const attendeeDocs = attendees.map((a) => ({
            userId: a.userId,
            registeredAt: new Date(),
            guestCount: 1,
            rsvpResponse: 'no-response',
            attendanceStatus: 'unexcused'
        }));

        const event = new Event({
            name,
            type: 'meeting',
            start_time: new Date(start_time),
            end_time: new Date(end_time),
            location: location,
            description: description || '',
            expectedAttendance: attendeeDocs.length || 10,
            visibility: 'members_only',
            hostingId: orgId,
            hostingType: 'Org',
            status: 'not-applicable',
            registrationEnabled: true,
            registrationRequired: false,
            attendees: attendeeDocs,
            registrationCount: attendeeDocs.length,
            checkInEnabled: true,
            customFields: { meetingType }
        });
        await event.save();

        const meetingConfig = new MeetingConfig({
            eventId: event._id,
            meetingType,
            requiredRoles,
            reminderConfig: { enabled: true, leadTimeMinutes: 60 * 24, channels: ['in_app', 'email'] }
        });
        await meetingConfig.save();

        const agenda = new EventAgenda({ eventId: event._id, orgId });
        await agenda.save();

        return res.status(201).json({ success: true, data: { event, meetingConfig } });
    } catch (error) {
        console.error('Plan meeting error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== PLAN RECURRING MEETINGS ====================

router.post('/:orgId/meetings/plan/recurring', verifyToken, requireEventManagement('orgId'), async (req, res) => {
    const { RecurringMeetingRule, Event } = getModels(req, 'RecurringMeetingRule', 'Event');
    const { orgId } = req.params;
    const user_id = req.user.userId;
    const { name, type, location, description, meetingType, requiredRoles, recurrenceType, interval, daysOfWeek, dayOfMonth, weekOfMonth, timeOfDay, durationMinutes, startDate, endDate, occurrenceLimit, excludeDates } = req.body;

    if (!name || !type || !location || !recurrenceType || !timeOfDay || !durationMinutes || !startDate) {
        return res.status(400).json({ success: false, message: 'name, type, location, recurrenceType, timeOfDay, durationMinutes, startDate are required' });
    }

    try {
        const rule = new RecurringMeetingRule({
            orgId,
            createdBy: user_id,
            name,
            type,
            location,
            description: description || '',
            expectedAttendance: 10,
            visibility: 'members_only',
            meetingType: meetingType || 'gbm',
            requiredRoles: requiredRoles || ['members'],
            recurrenceType,
            interval: interval || 1,
            daysOfWeek: daysOfWeek || [],
            dayOfMonth,
            weekOfMonth,
            timeOfDay,
            durationMinutes,
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : null,
            occurrenceLimit: occurrenceLimit || null,
            excludeDates: excludeDates ? excludeDates.map((d) => new Date(d)) : [],
            isActive: true
        });
        await rule.save();

        const created = await recurringMeetingService.generateUpcomingInstances(rule, req, { maxOccurrences: 10 });

        return res.status(201).json({ success: true, data: { rule, createdEvents: created } });
    } catch (error) {
        console.error('Plan recurring meeting error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
