const getModels = require('./getModelService');

const ACTIVE_EVENT_STATUSES = ['approved', 'not-applicable', 'pending', 'draft'];

class ResourceReservationService {
    constructor(req) {
        this.req = req;
        this.models = getModels(req, 'Event', 'Classroom', 'Schedule');
    }

    static parseDate(value) {
        const parsed = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    }

    static inferReservationState(eventStatus) {
        if (eventStatus === 'approved' || eventStatus === 'not-applicable') return 'approved';
        if (eventStatus === 'rejected') return 'rejected';
        if (eventStatus === 'pending') return 'requested';
        return 'draft';
    }

    normalizeEventReservation(eventLike = {}) {
        const current = eventLike.reservation || {};
        const resourceId = current.resourceId || eventLike.classroom_id || null;
        const state = current.state || ResourceReservationService.inferReservationState(eventLike.status);
        return {
            resourceId,
            state,
            lastCheckedAt: current.lastCheckedAt || null,
            conflictSummary: current.conflictSummary || { hasConflict: false, reason: '' }
        };
    }

    async checkAvailability({ startTime, endTime, resourceId, excludeEventId = null }) {
        const { Event, Schedule } = this.models;
        if (!resourceId) {
            return { isAvailable: true, reason: 'No reservable resource linked' };
        }
        const start = ResourceReservationService.parseDate(startTime);
        const end = ResourceReservationService.parseDate(endTime);
        if (!start || !end || start >= end) {
            return { isAvailable: false, reason: 'Invalid time range' };
        }

        const dayIndex = start.getDay(); // sunday=0
        const dayKey = ['U', 'M', 'T', 'W', 'R', 'F', 'S'][dayIndex];
        if (dayKey && dayKey !== 'U' && dayKey !== 'S') {
            const schedule = await Schedule.findOne({ classroom_id: resourceId });
            if (schedule?.weekly_schedule?.[dayKey]?.length) {
                const startMinutes = start.getHours() * 60 + start.getMinutes();
                const endMinutes = end.getHours() * 60 + end.getMinutes();
                const hasClassConflict = schedule.weekly_schedule[dayKey].some((slot) =>
                    startMinutes < slot.end_time && endMinutes > slot.start_time
                );
                if (hasClassConflict) {
                    return { isAvailable: false, reason: 'Resource has scheduled classes during this time', conflicts: [] };
                }
            }
        }

        const eventQuery = {
            isDeleted: false,
            status: { $in: ACTIVE_EVENT_STATUSES },
            $and: [
                { $or: [{ 'reservation.resourceId': resourceId }, { classroom_id: resourceId }] },
                {
                    $or: [
                        { start_time: { $gte: start, $lt: end } },
                        { end_time: { $gt: start, $lte: end } },
                        { start_time: { $lte: start }, end_time: { $gte: end } }
                    ]
                }
            ]
        };
        if (excludeEventId) eventQuery._id = { $ne: excludeEventId };
        const conflicts = await Event.find(eventQuery).select('_id name start_time end_time status location classroom_id reservation');
        if (conflicts.length > 0) {
            return { isAvailable: false, reason: 'Resource has existing event bookings during this time', conflicts };
        }
        return { isAvailable: true };
    }

    async applyAvailabilitySnapshot(eventDoc, { startTime, endTime, resourceId, excludeEventId = null }) {
        const availability = await this.checkAvailability({
            startTime,
            endTime,
            resourceId,
            excludeEventId
        });
        const reservation = this.normalizeEventReservation(eventDoc);
        reservation.resourceId = resourceId || null;
        reservation.lastCheckedAt = new Date();
        reservation.conflictSummary = {
            hasConflict: !availability.isAvailable,
            reason: availability.reason || ''
        };
        if (!availability.isAvailable && reservation.state === 'approved') {
            reservation.state = 'requested';
        }
        eventDoc.reservation = reservation;
        if (resourceId && !eventDoc.classroom_id) {
            eventDoc.classroom_id = resourceId;
        }
        return availability;
    }
}

module.exports = ResourceReservationService;
