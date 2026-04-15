/**
 * Tenant admin (admin/developer/beta) event read APIs without org-event-management membership.
 * Uses getModels(req, ...) per backend best practices.
 */

const getModels = require('./getModelService');

function defaultAnalytics() {
    return {
        views: 0,
        uniqueViews: 0,
        registrations: 0,
        uniqueRegistrations: 0,
        engagementRate: 0,
    };
}

function resolveEffectiveOrgId(event) {
    if (!event || event.hostingType !== 'Org' || !event.hostingId) return null;
    const hid = event.hostingId;
    return hid._id != null ? String(hid._id) : String(hid);
}

/**
 * @param {import('express').Request} req
 * @param {string} eventId
 */
async function getAdminTenantEventDashboard(req, eventId) {
    const { Event, EventAnalytics, EventAgenda, EventJob, VolunteerSignup, EventEquipment } = getModels(
        req,
        'Event',
        'EventAnalytics',
        'EventAgenda',
        'EventJob',
        'VolunteerSignup',
        'EventEquipment'
    );

    const event = await Event.findOne({
        _id: eventId,
        isDeleted: { $ne: true },
    })
        .populate('hostingId', 'org_name org_profile_image name username email')
        .populate('collaboratorOrgs.orgId', 'org_name org_profile_image');

    if (!event) {
        return null;
    }

    const analyticsDoc = await EventAnalytics.findOne({ eventId });
    const analytics = analyticsDoc ? analyticsDoc.toObject() : defaultAnalytics();
    if (analytics.engagementRate == null) analytics.engagementRate = 0;

    const agenda = await EventAgenda.findOne({ eventId });
    const roles = await EventJob.find({ eventId });
    const totalVolunteers = roles.reduce((sum, role) => sum + (role.assignments?.length || 0), 0);
    const confirmedVolunteers = roles.reduce(
        (sum, role) => sum + (role.assignments?.filter((a) => a.status === 'confirmed')?.length || 0),
        0
    );
    const signups = await VolunteerSignup.find({ eventId }).populate('memberId', 'name email');
    const equipment = await EventEquipment.findOne({ eventId });

    const registrationCount = event.registrationCount ?? (event.attendees?.length ?? 0);
    const checkedInCount = signups.filter((s) => s.checkedIn).length;

    let eventCheckIn = null;
    if (event.checkInEnabled && event.attendees && Array.isArray(event.attendees)) {
        const totalCheckedIn = event.attendees.filter((a) => a.checkedIn).length;
        const totalRegistrations = event.registrationCount ?? event.attendees.length;
        eventCheckIn = {
            totalCheckedIn,
            totalRegistrations,
            checkInRate: totalRegistrations > 0 ? ((totalCheckedIn / totalRegistrations) * 100).toFixed(1) : '0',
        };
    }

    const now = new Date();
    let operationalStatus = 'upcoming';
    if (event.start_time <= now && event.end_time >= now) {
        operationalStatus = 'active';
    } else if (event.end_time < now) {
        operationalStatus = 'completed';
    }

    const effectiveOrgId = resolveEffectiveOrgId(event);

    return {
        event,
        analytics,
        agenda: agenda || { items: [] },
        roles: {
            total: roles.length,
            assignments: totalVolunteers,
            confirmed: confirmedVolunteers,
            signups: signups.length,
        },
        equipment: equipment || { items: [] },
        stats: {
            registrationCount,
            volunteers: {
                total: totalVolunteers,
                confirmed: confirmedVolunteers,
                checkedIn: checkedInCount,
            },
            operationalStatus,
            checkIn: eventCheckIn,
        },
        effectiveOrgId,
    };
}

/**
 * @param {import('express').Request} req
 * @param {string} eventId
 */
async function getAdminTenantEventRegistrationResponses(req, eventId) {
    const { Event, FormResponse } = getModels(req, 'Event', 'FormResponse');

    const event = await Event.findOne({ _id: eventId, isDeleted: { $ne: true } }).populate(
        'attendees.userId',
        'name username email'
    );

    if (!event) {
        return null;
    }

    const registrations = (event.attendees || [])
        .filter((a) => !a.walkIn)
        .map((a) => ({
            userId: a.userId,
            registeredAt: a.registeredAt,
            guestCount: a.guestCount,
            checkedIn: a.checkedIn,
            checkedInAt: a.checkedInAt,
        }));

    let formResponses = [];
    if (event.registrationFormId) {
        const responses = await FormResponse.find({ event: eventId })
            .populate('submittedBy', 'name username email picture')
            .sort({ submittedAt: 1 })
            .lean();
        formResponses = responses.map((r) => ({
            _id: r._id,
            submittedBy: r.submittedBy,
            guestName: r.guestName,
            guestEmail: r.guestEmail ?? r.guestUsername,
            submittedAt: r.submittedAt,
            formSnapshot: r.formSnapshot,
            answers: r.answers,
        }));
    }

    return {
        registrations,
        formResponses,
        registrationFormId: event.registrationFormId || null,
    };
}

/**
 * RSVP growth by day (same logic as org-event-management route, scoped by event id only).
 * @param {import('express').Request} req
 * @param {string} eventId
 * @param {{ timezone?: string }} query
 */
async function getAdminTenantEventRsvpGrowth(req, eventId, query = {}) {
    const { Event, FormResponse, EventAnalytics } = getModels(req, 'Event', 'FormResponse', 'EventAnalytics');

    const event = await Event.findOne({ _id: eventId, isDeleted: { $ne: true } });

    if (!event) {
        return null;
    }

    const attendees = event.attendees || [];
    const registrationCount = event.registrationCount ?? attendees.length;

    const eventStart = new Date(event.start_time);
    const eventCreated = new Date(event.createdAt || event.start_time);
    const now = new Date();
    const cutoffDate = eventStart < now ? eventStart : now;
    const cutoffDateNormalized = new Date(cutoffDate);
    cutoffDateNormalized.setHours(23, 59, 59, 999);

    const registrations = {};
    const timezone = query.timezone || 'UTC';

    function toLocalDateKey(date) {
        const d = new Date(date);
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        return formatter.format(d);
    }

    attendees.forEach((attendee) => {
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

    const formResponses = await FormResponse.find({
        event: eventId,
        submittedBy: null,
    })
        .select('submittedAt')
        .lean();

    formResponses.forEach((fr) => {
        const regDate = fr.submittedAt ? new Date(fr.submittedAt) : new Date(eventCreated);
        if (regDate > cutoffDateNormalized) return;
        const dayKey = toLocalDateKey(regDate);
        if (!registrations[dayKey]) registrations[dayKey] = 0;
        registrations[dayKey] += 1;
    });

    const totalFromAttendeesAndForm = Object.values(registrations).reduce((a, b) => a + b, 0);
    if (totalFromAttendeesAndForm === 0 && registrationCount > 0) {
        const analytics = await EventAnalytics.findOne({ eventId }).select('registrationHistory').lean();
        const history = analytics?.registrationHistory || [];
        history.forEach((r) => {
            const regDate = r.timestamp ? new Date(r.timestamp) : new Date(eventCreated);
            if (regDate > cutoffDateNormalized) return;
            const dayKey = toLocalDateKey(regDate);
            if (!registrations[dayKey]) registrations[dayKey] = 0;
            registrations[dayKey] += 1;
        });
    }

    return {
        registrations,
        eventCreated: eventCreated.toISOString(),
        eventStart: eventStart.toISOString(),
        expectedAttendance: event.expectedAttendance || 0,
    };
}

module.exports = {
    getAdminTenantEventDashboard,
    getAdminTenantEventRegistrationResponses,
    getAdminTenantEventRsvpGrowth,
    defaultAnalytics,
};
