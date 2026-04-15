jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const { listAdminTenantUpcomingEvents } = require('../../services/adminTenantEventsService');

describe('adminTenantEventsService', () => {
    it('returns paginated events and total', async () => {
        const leanEvents = [{ _id: '1', name: 'A', status: 'approved' }];
        const mockFind = {
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(leanEvents),
        };
        const aggregate = jest.fn().mockResolvedValue([]);
        getModels.mockReturnValue({
            Event: {
                find: jest.fn(() => mockFind),
                countDocuments: jest.fn().mockResolvedValue(3),
            },
            AnalyticsEvent: {
                aggregate,
            },
        });

        const req = {};
        const out = await listAdminTenantUpcomingEvents(req, { page: 1, limit: 20 });

        expect(out.events).toEqual([
            {
                ...leanEvents[0],
                analyticsSummary: {
                    views: 0,
                    uniqueViews: 0,
                    registrations: 0,
                    uniqueRegistrations: 0,
                },
            },
        ]);
        expect(out.pagination.total).toBe(3);
        expect(out.pagination.page).toBe(1);
        expect(out.pagination.limit).toBe(20);
        expect(out.pagination.totalPages).toBe(1);
    });

    it('omits end_time filter when includePast is true and sorts by start_time desc', async () => {
        const mockFind = {
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        };
        const aggregate = jest.fn().mockResolvedValue([]);
        const countDocuments = jest.fn().mockResolvedValue(0);
        getModels.mockReturnValue({
            Event: {
                find: jest.fn(() => mockFind),
                countDocuments,
            },
            AnalyticsEvent: {
                aggregate,
            },
        });

        await listAdminTenantUpcomingEvents({}, { page: 1, limit: 20, includePast: true });

        expect(countDocuments).toHaveBeenCalledWith(
            expect.objectContaining({
                isDeleted: { $ne: true },
            })
        );
        const qArg = countDocuments.mock.calls[0][0];
        expect(qArg).not.toHaveProperty('end_time');
        expect(mockFind.sort).toHaveBeenCalledWith({ start_time: -1 });
    });

    it('ignores q shorter than 3 characters', async () => {
        const mockFind = {
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        };
        const aggregate = jest.fn().mockResolvedValue([]);
        const countDocuments = jest.fn().mockResolvedValue(0);
        getModels.mockReturnValue({
            Event: {
                find: jest.fn(() => mockFind),
                countDocuments,
            },
            AnalyticsEvent: {
                aggregate,
            },
        });

        await listAdminTenantUpcomingEvents({}, { page: 1, limit: 20, q: 'ab' });

        const qArg = countDocuments.mock.calls[0][0];
        expect(qArg).not.toHaveProperty('name');
    });

    it('applies case-insensitive name regex when q has at least 3 characters', async () => {
        const mockFind = {
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        };
        const aggregate = jest.fn().mockResolvedValue([]);
        const countDocuments = jest.fn().mockResolvedValue(0);
        getModels.mockReturnValue({
            Event: {
                find: jest.fn(() => mockFind),
                countDocuments,
            },
            AnalyticsEvent: {
                aggregate,
            },
        });

        await listAdminTenantUpcomingEvents({}, { page: 1, limit: 20, q: 'Meet' });

        expect(countDocuments).toHaveBeenCalledWith(
            expect.objectContaining({
                name: { $regex: 'Meet', $options: 'i' },
            })
        );
    });

    it('escapes regex special characters in q', async () => {
        const mockFind = {
            select: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        };
        const aggregate = jest.fn().mockResolvedValue([]);
        const countDocuments = jest.fn().mockResolvedValue(0);
        getModels.mockReturnValue({
            Event: {
                find: jest.fn(() => mockFind),
                countDocuments,
            },
            AnalyticsEvent: {
                aggregate,
            },
        });

        await listAdminTenantUpcomingEvents({}, { page: 1, limit: 20, q: 'a+b' });

        expect(countDocuments).toHaveBeenCalledWith(
            expect.objectContaining({
                name: { $regex: 'a\\+b', $options: 'i' },
            })
        );
    });
});
