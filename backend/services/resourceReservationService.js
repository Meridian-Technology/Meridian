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
            conflictSummary: current.conflictSummary || { hasConflict: false, reason: '' },
            conflictType: current.conflictType || '',
            conflictSource: current.conflictSource || '',
            detectedAt: current.detectedAt || null,
            resolutionStatus: current.resolutionStatus || 'resolved',
            resolutionNote: current.resolutionNote || '',
            assignedTo: current.assignedTo || null,
            history: Array.isArray(current.history) ? current.history : [],
            sync: {
                sourceOfTruth: current.sync?.sourceOfTruth || 'internal',
                externalProvider: current.sync?.externalProvider || '',
                externalResourceId: current.sync?.externalResourceId || '',
                lastDryRunAt: current.sync?.lastDryRunAt || null,
                lastDryRunStatus: current.sync?.lastDryRunStatus || ''
            }
        };
    }

    static inferConflictMeta(availability = {}) {
        const reason = availability?.reason || '';
        if (reason.toLowerCase().includes('class')) {
            return { conflictType: 'class_schedule_conflict', conflictSource: 'class_schedule' };
        }
        if (reason.toLowerCase().includes('event')) {
            return { conflictType: 'event_overlap_conflict', conflictSource: 'event_overlap' };
        }
        return { conflictType: 'reservation_conflict', conflictSource: 'manual' };
    }

    appendHistoryEntry(eventDoc, action, actorId = null, note = '', metadata = {}) {
        const reservation = this.normalizeEventReservation(eventDoc);
        reservation.history = Array.isArray(reservation.history) ? reservation.history : [];
        reservation.history.push({
            action,
            actorId,
            at: new Date(),
            note: note || '',
            metadata: metadata || {}
        });
        eventDoc.reservation = reservation;
    }

    applyExceptionState(eventDoc, { actorId = null, action = 'acknowledged', note = '', assignedTo = null } = {}) {
        const reservation = this.normalizeEventReservation(eventDoc);
        if (action === 'resolved') {
            reservation.resolutionStatus = 'resolved';
            reservation.resolutionNote = note || reservation.resolutionNote || '';
            reservation.conflictSummary = { hasConflict: false, reason: '' };
            reservation.conflictType = '';
            reservation.conflictSource = '';
            reservation.detectedAt = null;
            reservation.assignedTo = assignedTo || null;
            this.appendHistoryEntry(eventDoc, 'exception_resolved', actorId, note, { assignedTo });
            eventDoc.reservation = this.normalizeEventReservation(eventDoc);
            eventDoc.reservation.resolutionStatus = reservation.resolutionStatus;
            eventDoc.reservation.resolutionNote = reservation.resolutionNote;
            eventDoc.reservation.conflictSummary = reservation.conflictSummary;
            eventDoc.reservation.conflictType = reservation.conflictType;
            eventDoc.reservation.conflictSource = reservation.conflictSource;
            eventDoc.reservation.detectedAt = reservation.detectedAt;
            eventDoc.reservation.assignedTo = reservation.assignedTo;
            return;
        }
        reservation.resolutionStatus = 'acknowledged';
        reservation.resolutionNote = note || reservation.resolutionNote || '';
        reservation.assignedTo = assignedTo || reservation.assignedTo || null;
        eventDoc.reservation = reservation;
        this.appendHistoryEntry(eventDoc, 'exception_acknowledged', actorId, note, { assignedTo: reservation.assignedTo });
    }

    async listUnresolvedConflicts({ orgId = null, limit = 50 } = {}) {
        const { Event } = this.models;
        const query = {
            isDeleted: false,
            'reservation.conflictSummary.hasConflict': true,
            'reservation.resolutionStatus': { $ne: 'resolved' }
        };
        if (orgId) {
            query.$or = [{ hostingId: orgId }, { 'collaboratorOrgs.orgId': orgId }];
        }
        return Event.find(query)
            .select('_id name start_time end_time status location hostingId reservation')
            .sort({ 'reservation.detectedAt': -1, updatedAt: -1 })
            .limit(Math.max(1, Math.min(Number(limit) || 50, 250)));
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
        if (!availability.isAvailable) {
            const meta = ResourceReservationService.inferConflictMeta(availability);
            reservation.conflictType = meta.conflictType;
            reservation.conflictSource = meta.conflictSource;
            reservation.detectedAt = new Date();
            reservation.resolutionStatus = 'unresolved';
        } else {
            reservation.conflictType = '';
            reservation.conflictSource = '';
            reservation.detectedAt = null;
            reservation.resolutionStatus = 'resolved';
            reservation.resolutionNote = '';
        }
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
