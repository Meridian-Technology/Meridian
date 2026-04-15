jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
    getRootOperatorUserStats,
    searchRootOperatorUsers,
    setRootOperatorUserRole,
    setRootOperatorAccessSuspended,
} = require('../../services/rootOperatorUsersService');

describe('rootOperatorUsersService', () => {
    it('getRootOperatorUserStats returns admin and member counts', async () => {
        getModels.mockReturnValue({
            User: {
                countDocuments: jest.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(7),
            },
        });
        const out = await getRootOperatorUserStats({});
        expect(out).toEqual({
            totalUsers: 100,
            adminCount: 7,
            memberCount: 93,
        });
    });

    it('searchRootOperatorUsers returns empty when query is short', async () => {
        getModels.mockReturnValue({ User: {} });
        const out = await searchRootOperatorUsers({}, { q: 'a' });
        expect(out).toEqual({ users: [], total: 0 });
    });

    it('setRootOperatorUserRole adds admin', async () => {
        const target = { roles: ['user'], save: jest.fn().mockResolvedValue(true) };
        const actor = { roles: ['admin'] };
        const findById = jest.fn((id) => {
            if (String(id) === 'actor') return Promise.resolve(actor);
            if (String(id) === 'target') return Promise.resolve(target);
            return Promise.resolve(null);
        });
        getModels.mockReturnValue({
            User: {
                findById,
                countDocuments: jest.fn().mockResolvedValue(2),
            },
        });

        const req = { user: { userId: 'actor' } };
        const out = await setRootOperatorUserRole(req, {
            userId: 'target',
            role: 'admin',
            assign: true,
        });

        expect(out.roles).toContain('admin');
        expect(target.save).toHaveBeenCalled();
    });

    it('setRootOperatorAccessSuspended rejects self', async () => {
        getModels.mockReturnValue({ User: {} });
        const req = { user: { userId: 'same' } };
        await expect(
            setRootOperatorAccessSuspended(req, { userId: 'same', accessSuspended: true })
        ).rejects.toMatchObject({ statusCode: 400 });
    });
});
