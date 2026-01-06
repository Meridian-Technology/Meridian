const getModels = require('../services/getModelService');
const mongoose = require('mongoose');

/**
 * Middleware to check if user has a specific permission in an organization
 * @param {string} permission - The permission to check
 * @param {string} orgParam - The parameter name containing the org ID (default: 'orgId')
 */
function requireOrgPermission(permission, orgParam = 'orgId') {
    return async (req, res, next) => {
        try {
            const { OrgMember, Org } = getModels(req, 'OrgMember', 'Org');
            
            const orgId = req.params[orgParam] || req.body[orgParam] || req.query[orgParam];
            if (!orgId) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization ID is required'
                });
            }

            const member = await OrgMember.findOne({
                org_id: orgId,
                user_id: req.user.userId,
                status: 'active'
            });

            if (!member) {
                console.log('Denied, You are not a member of this organization');
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this organization'
                });
            }

            // Get the organization to check permissions
            const org = await Org.findById(orgId);
            if (!org) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            const hasPermission = await member.hasPermissionWithOrg(permission, org);
            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: `You don't have permission to ${permission} in this organization`
                });
            }

            // Add member info to request for use in route handlers
            req.orgMember = member;
            req.org = org;
            next();
        } catch (error) {
            console.error('Permission check error:', error);
            res.status(500).json({
                success: false,
                message: 'Error checking permissions'
            });
        }
    };
}

/**
 * Middleware to check if user has any of the specified permissions
 * @param {string[]} permissions - Array of permissions to check
 * @param {string} orgParam - The parameter name containing the org ID
 */
function requireAnyOrgPermission(permissions, orgParam = 'orgId') {
    return async (req, res, next) => {
        try {
            const { OrgMember, Org } = getModels(req, 'OrgMember', 'Org');
            
            const orgId = req.params[orgParam] || req.body[orgParam] || req.query[orgParam];
            if (!orgId) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization ID is required'
                });
            }

            const member = await OrgMember.findOne({
                org_id: orgId,
                user_id: req.user.userId,
                status: 'active'
            });

            if (!member) {
                console.log('Denied, You are not a member of this organization');
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this organization'
                });
            }

            // Get the organization to check permissions
            const org = await Org.findById(orgId);
            if (!org) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            // Check if user has any of the required permissions
            for (const permission of permissions) {
                const hasPermission = await member.hasPermissionWithOrg(permission, org);
                if (hasPermission) {
                    req.orgMember = member;
                    req.org = org;
                    return next();
                }
            }

            console.log('Denied, You don\'t have the required permissions for this action');
            return res.status(403).json({
                success: false,
                message: `You don't have the required permissions for this action`
            });
        } catch (error) {
            console.error('Permission check error:', error);
            res.status(500).json({
                success: false,
                message: 'Error checking permissions'
            });
        }
    };
}

/**
 * Middleware to check if user is the owner of the organization
 * @param {string} orgParam - The parameter name containing the org ID
 */
function requireOrgOwner(orgParam = 'orgId') {
    return async (req, res, next) => {
        try {
            const { Org } = getModels(req, 'Org');
            
            const orgId = req.params[orgParam] || req.body[orgParam] || req.query[orgParam];
            if (!orgId) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization ID is required'
                });
            }

            const org = await Org.findById(orgId);
            if (!org) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            if (org.owner.toString() !== req.user.userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Only the organization owner can perform this action'
                });
            }

            req.org = org;
            next();
        } catch (error) {
            console.error('Owner check error:', error);
            res.status(500).json({
                success: false,
                message: 'Error checking ownership'
            });
        }
    };
}

/**
 * Middleware to check if user can manage roles in the organization
 * @param {string} orgParam - The parameter name containing the org ID
 */
function requireRoleManagement(orgParam = 'orgId') {
    return requireOrgPermission('manage_roles', orgParam);
}

/**
 * Middleware to check if user can manage members in the organization
 * @param {string} orgParam - The parameter name containing the org ID
 */
function requireMemberManagement(orgParam = 'orgId') {
    return requireOrgPermission('manage_members', orgParam);
}

/**
 * Middleware to check if user can manage events in the organization
 * @param {string} orgParam - The parameter name containing the org ID
 */
function requireEventManagement(orgParam = 'orgId') {
    return requireOrgPermission('manage_events', orgParam);
}

/**
 * Middleware to check if user can view analytics in the organization
 * @param {string} orgParam - The parameter name containing the org ID
 */
function requireAnalyticsAccess(orgParam = 'orgId') {
    return requireOrgPermission('view_analytics', orgParam);
}

module.exports = {
    requireOrgPermission,
    requireAnyOrgPermission,
    requireOrgOwner,
    requireRoleManagement,
    requireMemberManagement,
    requireEventManagement,
    requireAnalyticsAccess
}; 