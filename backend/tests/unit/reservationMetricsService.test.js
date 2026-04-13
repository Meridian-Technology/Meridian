jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const ReservationMetricsService = require('../../services/reservationMetricsService');

describe('reservationMetricsService', () => {
    test('getMetrics returns summary and rate', async () => {
        const Event = {
            aggregate: jest
                .fn()
                .mockResolvedValueOnce([{ totalReservations: 10, conflicts: 2, unresolved: 1, approvedReservations: 5 }])
                .mockResolvedValueOnce([{ _id: 'r1', reservations: 4, conflicts: 1 }])
        };
        getModels.mockReturnValue({ Event });
        const svc = new ReservationMetricsService({ db: {} });
        const out = await svc.getMetrics({});
        expect(out.totalReservations).toBe(10);
        expect(out.conflictRate).toBe(0.2);
        expect(out.byResource.length).toBe(1);
    });

    test('toCsv serializes metric rows', () => {
        const csv = ReservationMetricsService.toCsv({
            totalReservations: 3,
            conflicts: 1,
            unresolved: 1,
            approvedReservations: 2,
            conflictRate: 0.333
        });
        expect(csv).toMatch(/totalReservations,3/);
        expect(csv).toMatch(/conflictRate,0.333/);
    });
});
