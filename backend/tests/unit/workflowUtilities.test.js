jest.mock('../../events/backendRoot', () => ({
    require: jest.fn(() => jest.fn())
}));

const {
    getDomainSpaceGovernance,
    scopeMatchesEventContext
} = require('../../events/utilities/workflowUtilities');

describe('workflowUtilities governance helpers', () => {
    test('getDomainSpaceGovernance returns defaults', () => {
        const governance = getDomainSpaceGovernance({});
        expect(governance.governingScope.kind).toBe('all_spaces');
        expect(governance.concernScope.kind).toBe('campus_wide');
        expect(governance.scopeMode).toBe('inclusive');
    });

    test('scopeMatchesEventContext supports all_spaces and campus_wide', () => {
        const eventSpaceContext = { resourceId: '', building: '', isCampusWide: true };
        expect(scopeMatchesEventContext({ kind: 'all_spaces' }, eventSpaceContext)).toBe(true);
        expect(scopeMatchesEventContext({ kind: 'campus_wide' }, eventSpaceContext)).toBe(true);
    });

    test('scopeMatchesEventContext matches scoped building and space', () => {
        const ctx = {
            resourceId: '507f1f77bcf86cd799439011',
            building: 'Union',
            isCampusWide: false
        };
        expect(
            scopeMatchesEventContext(
                { kind: 'scoped', buildingIds: ['union'], spaceIds: [], spaceGroupIds: [] },
                ctx
            )
        ).toBe(true);
        expect(
            scopeMatchesEventContext(
                { kind: 'scoped', buildingIds: [], spaceIds: ['507f1f77bcf86cd799439011'], spaceGroupIds: [] },
                ctx
            )
        ).toBe(true);
    });

    test('scopeMatchesEventContext matches scoped building by building ObjectId', () => {
        const bid = '507f1f77bcf86cd799439011';
        const ctx = {
            resourceId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            building: 'Some Hall',
            buildingId: bid,
            isCampusWide: false
        };
        expect(
            scopeMatchesEventContext(
                { kind: 'scoped', buildingIds: [bid], spaceIds: [], spaceGroupIds: [] },
                ctx
            )
        ).toBe(true);
        expect(
            scopeMatchesEventContext(
                { kind: 'scoped', buildingIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'], spaceIds: [], spaceGroupIds: [] },
                ctx
            )
        ).toBe(false);
    });

    test('scopeMatchesEventContext respects exclusive mode', () => {
        const ctx = {
            resourceId: '507f1f77bcf86cd799439011',
            building: 'Union',
            isCampusWide: false
        };
        expect(
            scopeMatchesEventContext(
                { kind: 'scoped', buildingIds: ['union'], spaceIds: ['507f1f77bcf86cd799439011'], spaceGroupIds: [] },
                ctx,
                'exclusive'
            )
        ).toBe(true);
        expect(
            scopeMatchesEventContext(
                { kind: 'scoped', buildingIds: ['library'], spaceIds: ['507f1f77bcf86cd799439011'], spaceGroupIds: [] },
                ctx,
                'exclusive'
            )
        ).toBe(false);
    });
});
