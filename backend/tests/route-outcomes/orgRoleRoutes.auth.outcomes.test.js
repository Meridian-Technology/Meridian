const fs = require('fs');
const path = require('path');

const routeFile = fs.readFileSync(
    path.join(__dirname, '../../routes/orgRoleRoutes.js'),
    'utf8'
);

describe('orgRoleRoutes authorization coverage', () => {
    test('member listing route includes member-management guard', () => {
        expect(routeFile).toMatch(/router\.get\('\/:orgId\/members',\s*verifyToken,\s*requireMemberManagement\(\)/);
    });

    test('member role assignment route includes member-management guard', () => {
        expect(routeFile).toMatch(/router\.post\('\/:orgId\/members\/:userId\/role',\s*verifyToken,\s*requireMemberManagement\(\)/);
    });

    test('members-by-role route includes member-management guard', () => {
        expect(routeFile).toMatch(/router\.get\('\/:orgId\/roles\/:roleName\/members',\s*verifyToken,\s*requireMemberManagement\(\)/);
    });
});
