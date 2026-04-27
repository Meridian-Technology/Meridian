const express = require('express');
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');
const {
    requireOrgOwner,
    requireRoleManagement,
    requireMemberManagement,
    requireOrgPermission,
    requireAnyOrgPermission
} = require('../middlewares/orgPermissions');
const { governanceUpload } = require('../services/imageUploadService');
const {
    getEffectivePolicyFromConfig,
    assertLifecycleTransition,
    governanceRequirementsForOrg,
    labelForGovernanceKey
} = require('../services/atlasPolicyService');
const { recordMemberJoined, recordMemberRemoved } = require('../services/orgMembershipService');

const router = express.Router();

const SYSTEM_ROLE_NAMES = new Set(['owner', 'member']);

function normalizeRoleShape(role, previousRole = null) {
    const permissions = Array.isArray(role.permissions) ? [...new Set(role.permissions)] : (previousRole?.permissions || []);
    return {
        ...role,
        permissions,
        canManageMembers: permissions.includes('manage_members'),
        canManageRoles: permissions.includes('manage_roles'),
        canManageEvents: permissions.includes('manage_events'),
        canViewAnalytics: permissions.includes('view_analytics')
    };
}

async function ensureOwnerMembership(OrgMember, orgId, ownerUserId) {
    const ownerMembership = await OrgMember.findOne({ org_id: orgId, user_id: ownerUserId });
    if (!ownerMembership) {
        const createdOwnerMembership = new OrgMember({
            org_id: orgId,
            user_id: ownerUserId,
            role: 'owner',
            roles: ['owner'],
            status: 'active',
            assignedBy: ownerUserId
        });
        await createdOwnerMembership.save();
        return createdOwnerMembership;
    }
    if (ownerMembership.role !== 'owner' || !ownerMembership.roles?.includes('owner')) {
        ownerMembership.role = 'owner';
        ownerMembership.roles = ['owner', ...(ownerMembership.roles || []).filter((r) => r !== 'owner')];
        ownerMembership.status = 'active';
        await ownerMembership.save();
    }
    return ownerMembership;
}

async function renameAssignedRoleAcrossRecords({ OrgMember, OrgInvite, orgId, oldName, newName }) {
    if (!oldName || !newName || oldName === newName) {
        return;
    }

    const memberUpdatePipeline = [
        {
            $set: {
                role: {
                    $cond: [{ $eq: ['$role', oldName] }, newName, '$role']
                },
                roles: {
                    $let: {
                        vars: {
                            safeRoles: {
                                $cond: [{ $isArray: '$roles' }, '$roles', []]
                            }
                        },
                        in: {
                            $setUnion: [
                                {
                                    $map: {
                                        input: '$$safeRoles',
                                        as: 'roleName',
                                        in: {
                                            $cond: [
                                                { $eq: ['$$roleName', oldName] },
                                                newName,
                                                '$$roleName'
                                            ]
                                        }
                                    }
                                },
                                []
                            ]
                        }
                    }
                }
            }
        }
    ];

    await OrgMember.updateMany(
        {
            org_id: orgId,
            $or: [{ role: oldName }, { roles: oldName }]
        },
        memberUpdatePipeline
    );

    if (!OrgInvite) {
        return;
    }

    const inviteUpdatePipeline = [
        {
            $set: {
                role: {
                    $cond: [{ $eq: ['$role', oldName] }, newName, '$role']
                },
                roles: {
                    $let: {
                        vars: {
                            safeRoles: {
                                $cond: [{ $isArray: '$roles' }, '$roles', []]
                            }
                        },
                        in: {
                            $setUnion: [
                                {
                                    $map: {
                                        input: '$$safeRoles',
                                        as: 'roleName',
                                        in: {
                                            $cond: [
                                                { $eq: ['$$roleName', oldName] },
                                                newName,
                                                '$$roleName'
                                            ]
                                        }
                                    }
                                },
                                []
                            ]
                        }
                    }
                }
            }
        }
    ];

    await OrgInvite.updateMany(
        {
            org_id: orgId,
            $or: [{ role: oldName }, { roles: oldName }]
        },
        inviteUpdatePipeline
    );
}

/**
 * Check if user can edit/delete a role. Users cannot edit roles more privileged than their own.
 * Organization owners (record owner or membership role "owner") may edit/delete any non-system role.
 * Lower order = higher privilege. Same order may be deleted (e.g. owner removing a top custom role they use).
 * @returns {boolean}
 */
function canEditRole(userId, org, orgMember, roleName) {
    const ownerId = org.owner != null ? (org.owner._id ?? org.owner) : null;
    if (ownerId != null && String(ownerId) === String(userId)) {
        return true;
    }
    if (orgMember?.role === 'owner') {
        return true;
    }
    const userRole = org.positions.find((p) => p.name === orgMember?.role);
    const targetRole = org.positions.find((p) => p.name === roleName);
    if (!userRole || !targetRole) return false;
    return targetRole.order >= userRole.order;
}

// Check if current user can manage roles (for frontend permission display)
router.get('/:orgId/can-manage-roles', verifyToken, requireRoleManagement(), async (req, res) => {
    res.status(200).json({ success: true, canManageRoles: true });
});

router.get('/:orgId/me/permissions', verifyToken, requireOrgPermission('view_events'), async (req, res) => {
    try {
        const member = req.orgMember;
        const org = req.org;
        const assignedRoles = member?.roles?.length ? member.roles : [member?.role || 'member'];
        const effectivePermissions = new Set();
        for (const roleName of assignedRoles) {
            const role = org.getRoleByName(roleName);
            if (!role) continue;
            (role.permissions || []).forEach((permission) => effectivePermissions.add(permission));
        }
        if (effectivePermissions.has('manage_finances')) {
            effectivePermissions.add('view_finances');
        }
        res.status(200).json({
            success: true,
            role: member?.role || 'member',
            roles: assignedRoles,
            permissions: Array.from(effectivePermissions)
        });
    } catch (error) {
        console.error('Error getting effective org permissions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching permissions'
        });
    }
});

// Get all roles for an organization
router.get('/:orgId/roles', verifyToken, requireOrgPermission('view_roles'), async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId } = req.params;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Sort roles by order
        const sortedRoles = org.positions.sort((a, b) => a.order - b.order);

        res.status(200).json({
            success: true,
            roles: sortedRoles,
            roleManagement: org.roleManagement
        });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching organization roles'
        });
    }
});

// Create a new custom role
router.post('/:orgId/roles', verifyToken, requireRoleManagement(), async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId } = req.params;
    const { name, displayName, permissions, canManageMembers, canManageRoles, canManageEvents, canViewAnalytics, color, order } = req.body;

    try {
        const org = req.org || await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Validate role name
        if (!name || !displayName) {
            return res.status(400).json({
                success: false,
                message: 'Role name and display name are required'
            });
        }

        // Check if role name already exists
        const existingRole = org.getRoleByName(name);
        if (existingRole) {
            return res.status(400).json({
                success: false,
                message: 'Role with this name already exists'
            });
        }

        // Validate color format if provided
        if (color && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid color format. Must be a valid hex color code (e.g., #3b82f6)'
            });
        }

        const newOrder = order !== undefined ? order : org.positions.length;
        const userRole = org.positions.find((p) => p.name === req.orgMember?.role);
        const ownerId = org.owner != null ? (org.owner._id ?? org.owner) : null;
        const isRecordOwner = ownerId != null && String(ownerId) === String(req.user.userId);
        if (userRole && !isRecordOwner && req.orgMember?.role !== 'owner' && newOrder <= userRole.order) {
            return res.status(403).json({
                success: false,
                message: 'You cannot create roles at or above your own level'
            });
        }

        // Create new role
        const newRole = {
            name,
            displayName,
            permissions: permissions || [],
            canManageMembers: canManageMembers || false,
            canManageRoles: canManageRoles || false,
            canManageEvents: canManageEvents || false,
            canViewAnalytics: canViewAnalytics || false,
            isDefault: false,
            color: color || null,
            order: newOrder
        };

        await org.addCustomRole(newRole);

        res.status(201).json({
            success: true,
            message: 'Role created successfully',
            role: newRole
        });
    } catch (error) {
        console.error('Error creating role:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating role'
        });
    }
});

// Update all roles for an organization
router.put('/:orgId/roles', verifyToken, requireRoleManagement(), async (req, res) => {
    const { Org, OrgMember, OrgInvite } = getModels(req, 'Org', 'OrgMember', 'OrgInvite');
    const { orgId } = req.params;
    const { positions } = req.body;

    try {
        const org = req.org || await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Validate that owner and member system roles are preserved
        const hasOwnerRole = positions.some(role => role.name === 'owner');
        const hasMemberRole = positions.some(role => role.name === 'member');
        if (!hasOwnerRole || !hasMemberRole) {
            return res.status(400).json({
                success: false,
                message: 'Owner and member roles must be preserved'
            });
        }

        const oldPositions = org.positions;

        // Users cannot edit their own role or roles above them (unless owner)
        for (const oldRole of oldPositions) {
            if (oldRole.name === 'owner' || oldRole.name === 'member') continue;
            const inNew = positions.some(
                (p) => (p._id || p.id) && oldRole._id && String(p._id || p.id) === String(oldRole._id)
            );
            if (!inNew) {
                if (!canEditRole(req.user.userId, org, req.orgMember, oldRole.name)) {
                    return res.status(403).json({
                        success: false,
                        message: 'You cannot delete roles at or above your own level'
                    });
                }
            }
        }
        for (const newRole of positions) {
            if (newRole.name === 'owner' || newRole.name === 'member') continue;
            const roleId = newRole._id || newRole.id;
            if (!roleId) continue;
            const oldRole = oldPositions.find(
                (p) => (p._id || p.id) && String(p._id || p.id) === String(roleId)
            );
            if (oldRole && !canEditRole(req.user.userId, org, req.orgMember, oldRole.name)) {
                return res.status(403).json({
                    success: false,
                    message: 'You cannot edit roles at or above your own level'
                });
            }
        }

        // Before replacing positions: detect role renames (by _id) and update OrgMember documents
        // so members keep their role when only the role name changes
        const roleNameUpdates = [];

        for (const newRole of positions) {
            const roleId = newRole._id || newRole.id;
            if (!roleId) continue;

            const oldRole = oldPositions.find((p) => {
                const pid = p._id || p.id;
                return pid && String(pid) === String(roleId);
            });
            if (oldRole && oldRole.name !== newRole.name) {
                roleNameUpdates.push({ oldName: oldRole.name, newName: newRole.name });
            }
        }

        for (const { oldName, newName } of roleNameUpdates) {
            await renameAssignedRoleAcrossRecords({
                OrgMember,
                OrgInvite,
                orgId,
                oldName,
                newName
            });
        }

        const previousByName = new Map(oldPositions.map((role) => [role.name, role]));
        const normalizedPositions = positions.map((role) => {
            if (SYSTEM_ROLE_NAMES.has(role.name)) {
                const previousRole = previousByName.get(role.name);
                return previousRole || role;
            }
            const previousRole = previousByName.get(role.name);
            return normalizeRoleShape(role, previousRole);
        });

        // Update all roles
        org.positions = normalizedPositions;
        await org.save();

        res.status(200).json({
            success: true,
            message: 'Roles updated successfully',
            roles: normalizedPositions
        });
    } catch (error) {
        console.error('Error updating roles:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating roles'
        });
    }
});

// Update an existing role
router.put('/:orgId/roles/:roleName', verifyToken, requireRoleManagement(), async (req, res) => {
    const { Org, OrgMember, OrgInvite } = getModels(req, 'Org', 'OrgMember', 'OrgInvite');
    const { orgId, roleName } = req.params;
    const updates = req.body;

    try {
        const org = req.org || await Org.findById(orgId);
        if (!org) {
            console.log('PUT /org-roles org not found');
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if role exists
        const existingRole = org.getRoleByName(roleName);
        if (!existingRole) {
            console.log('PUT /org-roles role not found')
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        if (roleName !== 'owner' && roleName !== 'member' && !canEditRole(req.user.userId, org, req.orgMember, roleName)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot edit roles at or above your own level'
            });
        }

        if (SYSTEM_ROLE_NAMES.has(roleName)) {
            return res.status(400).json({
                success: false,
                message: `${roleName} is an immutable system role`
            });
        }

        // Validate color format if provided
        if (updates.color && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(updates.color)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid color format. Must be a valid hex color code (e.g., #3b82f6)'
            });
        }

        // If role name is changing, update OrgMember documents first so members keep their role
        const newName = updates.name;
        if (newName && newName !== roleName) {
            await renameAssignedRoleAcrossRecords({
                OrgMember,
                OrgInvite,
                orgId,
                oldName: roleName,
                newName
            });
        }

        // Update role
        await org.updateRole(roleName, normalizeRoleShape(updates, existingRole));

        console.log('PUT /org-roles/', orgId, roleName, updates);
        res.status(200).json({
            success: true,
            message: 'Role updated successfully'
        });
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating role'
        });
    }
});

// Delete a custom role
router.delete('/:orgId/roles/:roleName', verifyToken, requireRoleManagement(), async (req, res) => {
    const { Org, OrgMember } = getModels(req, 'Org', 'OrgMember');
    const { orgId, roleName } = req.params;

    try {
        const org = req.org || await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        if (roleName !== 'owner' && roleName !== 'member' && !canEditRole(req.user.userId, org, req.orgMember, roleName)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot delete roles at or above your own level'
            });
        }

        // Check if any members have this role
        const membersWithRole = await OrgMember.find({ org_id: orgId, role: roleName });
        
        // Reassign all members with this role to 'member' role
        if (membersWithRole.length > 0) {
            for (const member of membersWithRole) {
                await member.changeRole('member', req.user.userId, `Role "${roleName}" was deleted`);
            }
        }

        // Delete role
        await org.removeRole(roleName);

        res.status(200).json({
            success: true,
            message: `Role deleted successfully. ${membersWithRole.length} member(s) have been reassigned to the member role.`,
            reassignedCount: membersWithRole.length
        });
    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error deleting role'
        });
    }
});

// Get members by role
router.get('/:orgId/roles/:roleName/members', verifyToken, requireMemberManagement(), async (req, res) => {
    const { OrgMember } = getModels(req, 'OrgMember');
    const { orgId, roleName } = req.params;

    try {
        const members = await OrgMember.getMembersByRole(orgId, roleName);

        res.status(200).json({
            success: true,
            members,
            count: members.length
        });
        
    } catch (error) {
        console.error('Error fetching members by role:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching members'
        });
    }
});

// Assign role to a member
router.post('/:orgId/members/:userId/role', verifyToken, requireMemberManagement(), async (req, res) => {
    const { Org, OrgMember, User } = getModels(req, 'Org', 'OrgMember', 'User');
    const { orgId, userId } = req.params;
    const { role, roles, reason } = req.body;

    try {
        // Verify organization exists
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const requestedRoles = Array.isArray(roles) && roles.length > 0 ? roles : [role];
        const normalizedRoles = [...new Set(requestedRoles.filter(Boolean))];
        if (normalizedRoles.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one role is required'
            });
        }
        const includesOwnerRole = normalizedRoles.includes('owner');
        if (includesOwnerRole && String(org.owner) !== String(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Owner role can only be assigned through ownership transfer'
            });
        }

        // Verify roles exist
        const hasMissingRole = normalizedRoles.some((roleName) => !org.getRoleByName(roleName));
        if (hasMissingRole) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const actorMember = req.orgMember;
        const actorRole = org.getRoleByName(actorMember?.role);
        const actorIsRecordOwner = String(org.owner) === String(req.user.userId);
        const actorMaxPrivilege = actorIsRecordOwner ? -1 : (actorRole?.order ?? Number.MAX_SAFE_INTEGER);
        const rolesOutOfReach = normalizedRoles.some((roleName) => {
            const targetRole = org.getRoleByName(roleName);
            return (targetRole?.order ?? Number.MAX_SAFE_INTEGER) < actorMaxPrivilege;
        });
        if (rolesOutOfReach) {
            return res.status(403).json({
                success: false,
                message: 'You cannot assign roles above your own level'
            });
        }

        // Find or create member record
        let member = await OrgMember.findOne({ org_id: orgId, user_id: userId });
        
        if (!member) {
            member = new OrgMember({
                org_id: orgId,
                user_id: userId,
                role: normalizedRoles[0],
                roles: normalizedRoles,
                assignedBy: req.user.userId,
                status: 'active'
            });
            await member.save();
            await recordMemberJoined(member, req.user.userId, reason || 'role_assigned');
        } else {
            await member.setRoles(normalizedRoles, req.user.userId, reason, {
                termStart: req.body.roleTermStart ? new Date(req.body.roleTermStart) : undefined,
                termEnd: req.body.roleTermEnd ? new Date(req.body.roleTermEnd) : undefined
            });
        }

        // Check auto-approve for org (Atlas: when member count reaches threshold)
        const { checkAndAutoApproveOrg } = require('../services/orgApprovalService');
        await checkAndAutoApproveOrg(req, orgId);

        //for testing
        if(!user.clubAssociations.find(club => club.toString() === orgId)){
            console.log('adding org to user', orgId);
            console.log(user.clubAssociations);
            user.clubAssociations.push(orgId);
        }

        await user.save();

        console.log('POST /org-roles/members/:userId/role', orgId, userId, normalizedRoles, reason);

        res.status(200).json({
            success: true,
            message: 'Role assigned successfully',
            member: {
                userId: member.user_id,
                role: member.role,
                roles: member.roles,
                assignedAt: member.assignedAt
            }
        });
    } catch (error) {
        console.error('Error assigning role:', error);
        res.status(500).json({
            success: false,
            message: 'Error assigning role'
        });
    }
});

// Get all members of an organization
router.get('/:orgId/members', verifyToken, requireMemberManagement(), async (req, res) => {
    const { OrgMember, OrgMemberApplication } = getModels(req, 'OrgMember', 'OrgMemberApplication');
    const { orgId } = req.params;

    try {
        const members = await OrgMember.getActiveMembers(orgId);
        const applications = await OrgMemberApplication.find({ org_id: orgId, status: 'pending' }).populate('user_id formResponse');
        console.log('GET /org-roles/members', orgId, members);
        res.status(200).json({
            success: true,
            members,
            applications,
            count: members.length + applications.length
        });
    } catch (error) {
        console.error('Error fetching members:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching members'
        });
    }
});

router.post('/:orgId/transfer-ownership/:newOwnerUserId', verifyToken, requireOrgOwner(), async (req, res) => {
    const { Org, OrgMember } = getModels(req, 'Org', 'OrgMember');
    const { orgId, newOwnerUserId } = req.params;

    try {
        const org = req.org || await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        if (String(org.owner) === String(newOwnerUserId)) {
            return res.status(400).json({ success: false, message: 'User is already the organization owner' });
        }

        const newOwnerMembership = await ensureOwnerMembership(OrgMember, orgId, newOwnerUserId);
        const previousOwnerUserId = org.owner;
        org.owner = newOwnerUserId;
        await org.save();

        const previousOwnerMembership = await OrgMember.findOne({
            org_id: orgId,
            user_id: previousOwnerUserId,
            status: 'active'
        });
        if (previousOwnerMembership) {
            previousOwnerMembership.roles = (previousOwnerMembership.roles || [])
                .filter((roleName) => roleName !== 'owner');
            if (previousOwnerMembership.roles.length === 0) {
                previousOwnerMembership.roles = ['member'];
            }
            previousOwnerMembership.role = previousOwnerMembership.roles[0];
            await previousOwnerMembership.save();
        }

        await ensureOwnerMembership(OrgMember, orgId, newOwnerUserId);

        return res.status(200).json({
            success: true,
            message: 'Organization ownership transferred successfully',
            newOwnerMembership: {
                userId: newOwnerMembership.user_id,
                role: newOwnerMembership.role,
                roles: newOwnerMembership.roles
            }
        });
    } catch (error) {
        console.error('Error transferring organization ownership:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to transfer ownership'
        });
    }
});

// Remove member from organization
router.delete('/:orgId/members/:userId', verifyToken, requireMemberManagement(), async (req, res) => {
    const { OrgMember, User } = getModels(req, 'OrgMember', 'User');
    const { orgId, userId } = req.params;

    try {
        const member = await OrgMember.findOne({ org_id: orgId, user_id: userId });
        
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        // Check if trying to remove owner
        const { Org } = getModels(req, 'Org');
        const org = await Org.findById(orgId);
        if (org.owner.toString() === userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot remove organization owner'
            });
        }

        // Soft delete by setting status to inactive
        // member.status = 'inactive';
        // await member.save();
        await recordMemberRemoved(req, {
            org_id: orgId,
            user_id: userId,
            actorUserId: req.user.userId,
            reason: 'removed_by_org_manager'
        });
        await OrgMember.deleteOne({ _id: member._id });

        res.status(200).json({
            success: true,
            message: 'Member removed successfully'
        });
    } catch (error) {
        console.error('Error removing member:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing member'
        });
    }
});

// Get role permissions
router.get('/:orgId/roles/:roleName/permissions', verifyToken, requireOrgPermission('view_roles'), async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId, roleName } = req.params;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        const role = org.getRoleByName(roleName);
        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        res.status(200).json({
            success: true,
            role: {
                name: role.name,
                displayName: role.displayName,
                permissions: role.permissions,
                canManageMembers: role.canManageMembers,
                canManageRoles: role.canManageRoles,
                canManageEvents: role.canManageEvents,
                canViewAnalytics: role.canViewAnalytics
            }
        });
    } catch (error) {
        console.error('Error fetching role permissions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching role permissions'
        });
    }
});

// Approve a member application
router.post('/:orgId/applications/:applicationId/approve', verifyToken, requireMemberManagement(), async (req, res) => {
    const { OrgMember, OrgMemberApplication, User } = getModels(req, 'OrgMember', 'OrgMemberApplication', 'User');
    const { orgId, applicationId } = req.params;
    const { role = 'member', roles = [], reason = '' } = req.body;
    const userId = req.user.userId;

    try {
        // Find the application
        const application = await OrgMemberApplication.findById(applicationId)
            .populate('user_id')
            .populate('formResponse');
        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Verify the application belongs to this org
        if (application.org_id.toString() !== orgId) {
            return res.status(400).json({
                success: false,
                message: 'Application does not belong to this organization'
            });
        }

        // Check if application is still pending
        if (application.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Application has already been processed'
            });
        }

        // Check if user is already a member
        const existingMember = await OrgMember.findOne({
            org_id: orgId,
            user_id: application.user_id._id,
            status: 'active'
        });

        if (existingMember) {
            return res.status(400).json({
                success: false,
                message: 'User is already a member of this organization'
            });
        }

        const requestedRoles = Array.isArray(roles) && roles.length > 0 ? roles : [role];
        const normalizedRoles = [...new Set(requestedRoles.filter(Boolean))];
        const safeRoles = normalizedRoles.length > 0 ? normalizedRoles : ['member'];

        // Create new member
        const newMember = new OrgMember({
            org_id: orgId,
            user_id: application.user_id._id,
            role: safeRoles[0],
            roles: safeRoles,
            status: 'active',
            assignedBy: userId,
            assignedAt: new Date()
        });

        await newMember.save();
        await recordMemberJoined(newMember, userId, 'application_approved');

        // Check auto-approve for org (Atlas: when member count reaches threshold)
        const { checkAndAutoApproveOrg } = require('../services/orgApprovalService');
        await checkAndAutoApproveOrg(req, orgId);

        // Update application status
        application.status = 'approved';
        application.approvedBy = userId;
        application.approvedAt = new Date();
        application.reason = reason;
        await application.save();

        console.log(`POST /org-roles/${orgId}/applications/${applicationId}/approve successful`);
        res.status(200).json({
            success: true,
            message: 'Application approved successfully',
            member: newMember
        });

    } catch (error) {
        console.error('Error approving application:', error);
        res.status(500).json({
            success: false,
            message: 'Error approving application'
        });
    }
});

// Reject a member application
router.post('/:orgId/applications/:applicationId/reject', verifyToken, requireMemberManagement(), async (req, res) => {
    const { OrgMemberApplication } = getModels(req, 'OrgMemberApplication');
    const { orgId, applicationId } = req.params;
    const { reason = '' } = req.body;
    const userId = req.user.userId;

    try {
        // Find the application
        const application = await OrgMemberApplication.findById(applicationId)
            .populate('user_id')
            .populate('formResponse');
        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Verify the application belongs to this org
        if (application.org_id.toString() !== orgId) {
            return res.status(400).json({
                success: false,
                message: 'Application does not belong to this organization'
            });
        }

        // Check if application is still pending
        if (application.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Application has already been processed'
            });
        }

        // Update application status
        application.status = 'rejected';
        application.approvedBy = userId;
        application.approvedAt = new Date();
        application.reason = reason;
        await application.save();

        console.log(`POST /org-roles/${orgId}/applications/${applicationId}/reject successful`);
        res.status(200).json({
            success: true,
            message: 'Application rejected successfully'
        });

    } catch (error) {
        console.error('Error rejecting application:', error);
        res.status(500).json({
            success: false,
            message: 'Error rejecting application'
        });
    }
});

// Get all applications for an organization (including approved/rejected)
router.get('/:orgId/applications', verifyToken, requireMemberManagement(), async (req, res) => {
    const { OrgMemberApplication } = getModels(req, 'OrgMemberApplication');
    const { orgId } = req.params;
    const { status } = req.query;

    try {
        let query = { org_id: orgId };
        
        // Filter by status if provided
        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            query.status = status;
        }

        const applications = await OrgMemberApplication.find(query)
            .populate('user_id', 'username name email picture')
            .populate('formResponse')
            .populate('approvedBy', 'username name')
            .sort({ createdAt: -1 });

        console.log(`GET /org-roles/${orgId}/applications successful`);
        res.status(200).json({
            success: true,
            applications
        });

    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching applications'
        });
    }
});

// --- Atlas CMS Phase 1: lifecycle, governance, membership history ---

router.patch('/:orgId/lifecycle', verifyToken, requireAnyOrgPermission(['manage_roles', 'manage_settings']), async (req, res) => {
    const { Org, OrgManagementConfig } = getModels(req, 'Org', 'OrgManagementConfig');
    const { orgId } = req.params;
    const { lifecycleStatus: nextStatus } = req.body;

    try {
        if (!nextStatus) {
            return res.status(400).json({ success: false, message: 'lifecycleStatus is required' });
        }
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }
        const config = await OrgManagementConfig.findOne();
        const policy = getEffectivePolicyFromConfig(config);
        assertLifecycleTransition(policy, org, nextStatus, { isPlatformAdmin: false, isOfficer: true });
        org.lifecycleStatus = nextStatus;
        org.lifecycleChangedAt = new Date();
        org.lifecycleChangedBy = req.user.userId;
        await org.save();
        res.status(200).json({ success: true, message: 'Lifecycle updated', data: org });
    } catch (error) {
        const code = error.statusCode || 500;
        console.error('PATCH lifecycle error:', error);
        res.status(code).json({
            success: false,
            message: error.message || 'Error updating lifecycle'
        });
    }
});

router.get('/:orgId/governance', verifyToken, requireOrgPermission('view_events'), async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId } = req.params;
    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }
        res.status(200).json({
            success: true,
            documents: org.governanceDocuments || []
        });
    } catch (error) {
        console.error('GET governance error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:orgId/governance/requirements', verifyToken, requireOrgPermission('view_events'), async (req, res) => {
    const { Org, OrgManagementConfig } = getModels(req, 'Org', 'OrgManagementConfig');
    const { orgId } = req.params;
    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }
        const config = await OrgManagementConfig.findOne();
        const policy = getEffectivePolicyFromConfig(config);
        const requiredKeys = governanceRequirementsForOrg(policy, org);
        const labels = {};
        for (const k of requiredKeys) {
            labels[k] = labelForGovernanceKey(policy, k);
        }
        res.status(200).json({
            success: true,
            requiredKeys,
            labels,
            terminology: policy.terminology || {}
        });
    } catch (error) {
        console.error('GET governance requirements error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/:orgId/governance/:docKey/upload', verifyToken, requireOrgPermission('manage_governance'), governanceUpload.single('file'), async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { uploadDocumentToS3 } = require('../services/imageUploadService');
    const { orgId, docKey } = req.params;

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'PDF file is required (field name: file)' });
        }
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }
        const safeKey = String(docKey).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        if (!safeKey) {
            return res.status(400).json({ success: false, message: 'Invalid document key' });
        }
        const fileName = `governance-${orgId}-${safeKey}`;
        const storageUrl = await uploadDocumentToS3(req.file, 'orgs/governance', fileName);
        const effectiveFrom = req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined;
        org.addGovernanceVersion(safeKey, {
            storageUrl,
            originalFilename: req.file.originalname,
            mimeType: req.file.mimetype,
            uploadedBy: req.user.userId,
            uploadedAt: new Date(),
            effectiveFrom,
            status: 'draft'
        });
        await org.save();
        res.status(201).json({
            success: true,
            message: 'Governance document version uploaded',
            documents: org.governanceDocuments
        });
    } catch (error) {
        console.error('POST governance upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Upload failed'
        });
    }
});

router.get('/:orgId/members/:userId/history', verifyToken, requireMemberManagement(), async (req, res) => {
    const { OrgMember, OrgMembershipAudit } = getModels(req, 'OrgMember', 'OrgMembershipAudit');
    const { orgId, userId } = req.params;

    try {
        const member = await OrgMember.findOne({ org_id: orgId, user_id: userId }).lean();
        const audits = await OrgMembershipAudit.find({ org_id: orgId, user_id: userId })
            .sort({ at: -1 })
            .limit(100)
            .lean();
        res.status(200).json({
            success: true,
            membershipHistory: member?.membershipHistory || [],
            roleHistory: member?.roleHistory || [],
            roleTermStart: member?.roleTermStart,
            roleTermEnd: member?.roleTermEnd,
            removedAudits: audits
        });
    } catch (error) {
        console.error('GET member history error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router; 