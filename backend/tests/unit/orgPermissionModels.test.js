const mongoose = require('mongoose');
const orgSchema = require('../../schemas/org');
const orgMemberSchema = require('../../schemas/orgMember');

describe('org permission model invariants', () => {
    const Org = mongoose.models.TestOrg || mongoose.model('TestOrg', orgSchema);
    const OrgMember = mongoose.models.TestOrgMember || mongoose.model('TestOrgMember', orgMemberSchema);

    test('org member evaluates permissions as union of assigned roles', async () => {
        const org = new Org({
            org_name: 'Test Org',
            org_profile_image: '/Logo.svg',
            org_description: 'desc',
            owner: new mongoose.Types.ObjectId(),
            positions: [
                { name: 'owner', displayName: 'Owner', permissions: ['all'], order: 0 },
                { name: 'member', displayName: 'Member', permissions: ['view_events'], order: 1 },
                { name: 'treasurer', displayName: 'Treasurer', permissions: ['view_finances'], order: 2 }
            ]
        });
        const member = new OrgMember({
            org_id: new mongoose.Types.ObjectId(),
            user_id: new mongoose.Types.ObjectId(),
            role: 'member',
            roles: ['member', 'treasurer'],
            status: 'active'
        });

        await expect(member.hasPermissionWithOrg('view_finances', org)).resolves.toBe(true);
        await expect(member.hasPermissionWithOrg('manage_roles', org)).resolves.toBe(false);
    });

    test('org pre-save normalizes boolean fields from permissions', async () => {
        const org = new Org({
            org_name: 'Normalizer Org',
            org_profile_image: '/Logo.svg',
            org_description: 'desc',
            owner: new mongoose.Types.ObjectId(),
            positions: [
                { name: 'owner', displayName: 'Owner', permissions: ['all'], order: 0 },
                { name: 'member', displayName: 'Member', permissions: ['view_events'], order: 1 },
                {
                    name: 'manager',
                    displayName: 'Manager',
                    permissions: ['manage_members'],
                    canManageMembers: false,
                    canManageRoles: true,
                    order: 2
                }
            ]
        });

        await org.validate();
        // Trigger pre-save logic without touching database connection.
        await new Promise((resolve, reject) => org.schema.s.hooks.execPre('save', org, (err) => (err ? reject(err) : resolve())));

        const managerRole = org.positions.find((role) => role.name === 'manager');
        expect(managerRole.canManageMembers).toBe(true);
        expect(managerRole.canManageRoles).toBe(false);
    });
});
