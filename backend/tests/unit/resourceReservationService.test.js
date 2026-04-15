jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const ResourceReservationService = require('../../services/resourceReservationService');

describe('resourceReservationService', () => {
    const makeReq = () => ({ db: {} });

    test('checkAvailability returns available when no resource linked', async () => {
        getModels.mockReturnValue({
            Event: { find: jest.fn() },
            Schedule: { findOne: jest.fn() },
            Classroom: { findById: jest.fn() }
        });
        const svc = new ResourceReservationService(makeReq());
        const out = await svc.checkAvailability({
            startTime: '2026-01-01T10:00:00.000Z',
            endTime: '2026-01-01T11:00:00.000Z',
            resourceId: null
        });
        expect(out.isAvailable).toBe(true);
    });

    test('checkAvailability returns conflict when overlapping event exists', async () => {
        const Event = {
            find: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue([{ _id: 'x1' }])
            })
        };
        const Schedule = { findOne: jest.fn().mockResolvedValue(null) };
        getModels.mockReturnValue({
            Event,
            Schedule,
            Classroom: { findById: jest.fn() }
        });
        const svc = new ResourceReservationService(makeReq());
        const out = await svc.checkAvailability({
            startTime: '2026-01-01T10:00:00.000Z',
            endTime: '2026-01-01T11:00:00.000Z',
            resourceId: '507f1f77bcf86cd799439011'
        });
        expect(out.isAvailable).toBe(false);
        expect(out.reason).toMatch(/existing event bookings/i);
        expect(Event.find).toHaveBeenCalled();
    });

    test('normalizeEventReservation maps legacy classroom_id to resourceId', () => {
        getModels.mockReturnValue({
            Event: { find: jest.fn() },
            Schedule: { findOne: jest.fn() },
            Classroom: { findById: jest.fn() }
        });
        const svc = new ResourceReservationService(makeReq());
        const out = svc.normalizeEventReservation({
            classroom_id: '507f1f77bcf86cd799439011',
            status: 'pending'
        });
        expect(String(out.resourceId)).toBe('507f1f77bcf86cd799439011');
        expect(out.state).toBe('requested');
    });

    test('applyAvailabilitySnapshot marks unresolved exception fields on conflict', async () => {
        const Event = {
            find: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue([{ _id: 'x1' }])
            })
        };
        const Schedule = { findOne: jest.fn().mockResolvedValue(null) };
        getModels.mockReturnValue({
            Event,
            Schedule,
            Classroom: { findById: jest.fn() }
        });
        const svc = new ResourceReservationService(makeReq());
        const eventDoc = { status: 'approved', classroom_id: '507f1f77bcf86cd799439011' };
        await svc.applyAvailabilitySnapshot(eventDoc, {
            startTime: '2026-01-01T10:00:00.000Z',
            endTime: '2026-01-01T11:00:00.000Z',
            resourceId: '507f1f77bcf86cd799439011'
        });
        expect(eventDoc.reservation.conflictSummary.hasConflict).toBe(true);
        expect(eventDoc.reservation.resolutionStatus).toBe('unresolved');
        expect(eventDoc.reservation.detectedAt).toBeTruthy();
    });

    test('applyExceptionState resolves conflict and appends history', () => {
        getModels.mockReturnValue({
            Event: { find: jest.fn() },
            Schedule: { findOne: jest.fn() },
            Classroom: { findById: jest.fn() }
        });
        const svc = new ResourceReservationService(makeReq());
        const eventDoc = {
            reservation: {
                resourceId: '507f1f77bcf86cd799439011',
                state: 'requested',
                conflictSummary: { hasConflict: true, reason: 'Overlapping booking' },
                resolutionStatus: 'unresolved',
                history: []
            }
        };
        svc.applyExceptionState(eventDoc, { action: 'resolved', note: 'Adjusted schedule', actorId: 'u1' });
        expect(eventDoc.reservation.conflictSummary.hasConflict).toBe(false);
        expect(eventDoc.reservation.resolutionStatus).toBe('resolved');
        expect(eventDoc.reservation.history.length).toBeGreaterThan(0);
    });
});
