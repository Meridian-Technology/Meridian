const express = require('express');
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');
const { 
    requireOrgOwner, 
    requireRoleManagement, 
    requireMemberManagement,
    requireOrgPermission 
} = require('../middlewares/orgPermissions');

const router = express.Router();

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
    const { name, displayName, permissions, canManageMembers, canManageRoles, canManageEvents, canViewAnalytics } = req.body;

    try {
        const org = await Org.findById(orgId);
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

        // Create new role
        const newRole = {
            name,
            displayName,
            permissions: permissions || [],
            canManageMembers: canManageMembers || false,
            canManageRoles: canManageRoles || false,
            canManageEvents: canManageEvents || false,
            canViewAnalytics: canViewAnalytics || false,
            isDefault: false
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
    const { Org } = getModels(req, 'Org');
    const { orgId } = req.params;
    const { positions } = req.body;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Validate that owner role is preserved
        const hasOwnerRole = positions.some(role => role.name === 'owner');
        if (!hasOwnerRole) {
            return res.status(400).json({
                success: false,
                message: 'Owner role must be preserved'
            });
        }

        // Update all roles
        org.positions = positions;
        await org.save();

        res.status(200).json({
            success: true,
            message: 'Roles updated successfully',
            roles: positions
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
    const { Org } = getModels(req, 'Org');
    const { orgId, roleName } = req.params;
    const updates = req.body;

    try {
        const org = await Org.findById(orgId);
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

        // Update role
        await org.updateRole(roleName, updates);

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
    const { Org, OrgMember } = getModels(req, 'Org');
    const { orgId, roleName } = req.params;

    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if any members have this role
        const membersWithRole = await OrgMember.find({ org_id: orgId, role: roleName });
        if (membersWithRole.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete role: ${membersWithRole.length} member(s) currently have this role`
            });
        }

        // Delete role
        await org.removeRole(roleName);

        res.status(200).json({
            success: true,
            message: 'Role deleted successfully'
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
router.get('/:orgId/roles/:roleName/members', verifyToken   , async (req, res) => {
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
router.post('/:orgId/members/:userId/role', verifyToken, async (req, res) => {
    const { Org, OrgMember, User } = getModels(req, 'Org', 'OrgMember', 'User');
    const { orgId, userId } = req.params;
    const { role, reason } = req.body;

    try {
        // Verify organization exists
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Verify role exists
        const roleExists = org.getRoleByName(role);
        if (!roleExists) {
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

        // Find or create member record
        let member = await OrgMember.findOne({ org_id: orgId, user_id: userId });
        
        if (!member) {
            // Create new member record
            member = new OrgMember({
                org_id: orgId,
                user_id: userId,
                role: role,
                assignedBy: req.user.userId
            });
        } else {
            // Update existing member's role
            await member.changeRole(role, req.user.userId, reason);
        }

        await member.save();   

        //for testing
        if(!user.clubAssociations.find(club => club.toString() === orgId)){
            console.log('adding org to user', orgId);
            console.log(user.clubAssociations);
            user.clubAssociations.push(orgId);
        }

        await user.save();

        console.log('POST /org-roles/members/:userId/role', orgId, userId, role, reason);

        res.status(200).json({
            success: true,
            message: 'Role assigned successfully',
            member: {
                userId: member.user_id,
                role: member.role,
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
router.get('/:orgId/members', verifyToken, async (req, res) => {
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
    const { role = 'member', reason = '' } = req.body;
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

        // Create new member
        const newMember = new OrgMember({
            org_id: orgId,
            user_id: application.user_id._id,
            role: role,
            status: 'active',
            assignedBy: userId,
            assignedAt: new Date()
        });

        await newMember.save();

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

module.exports = router; 