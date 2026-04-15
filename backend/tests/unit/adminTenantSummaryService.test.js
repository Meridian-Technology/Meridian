jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const { getAdminTenantSummary } = require('../../services/adminTenantSummaryService');

describe('adminTenantSummaryService', () => {
    it('returns counts from models', async () => {
        getModels.mockReturnValue({
            Org: { countDocuments: jest.fn().mockResolvedValue(2) },
            Event: { countDocuments: jest.fn().mockResolvedValue(5) },
            Domain: { countDocuments: jest.fn().mockResolvedValue(1) },
            User: { countDocuments: jest.fn().mockResolvedValue(42) },
        });

        const req = { db: {}, school: 'test' };
        const out = await getAdminTenantSummary(req);

        expect(out).toEqual({
            communityGroupCount: 2,
            upcomingEventsCount: 5,
            programsCount: 1,
            userCount: 42,
        });
        expect(getModels).toHaveBeenCalledWith(req, 'Org', 'Event', 'Domain', 'User');
    });
});
