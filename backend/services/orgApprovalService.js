/**
 * Service for Atlas org approval logic.
 * Handles auto-approve when member count reaches threshold.
 * Caller must pass req (or object with db) for getModels.
 */

/**
 * Check if org qualifies for auto-approval and apply it.
 * Call after adding a new member to an org.
 * @param {object} req - Express request (for getModels)
 * @param {string} orgId - Org ID to check
 * @returns {Promise<boolean>} - true if org was auto-approved, false otherwise
 */
async function checkAndAutoApproveOrg(req, orgId) {
    const getModels = require('./getModelService');
    const { Org, OrgMember, OrgManagementConfig } = getModels(req, 'Org', 'OrgMember', 'OrgManagementConfig');

    const org = await Org.findById(orgId);
    if (!org || org.approvalStatus !== 'pending') {
        return false;
    }

    const config = await OrgManagementConfig.findOne();
    const mode = config?.orgApproval?.mode || 'none';
    if (mode !== 'auto' && mode !== 'both') {
        return false;
    }

    const threshold = config?.orgApproval?.autoApproveMemberThreshold ?? 5;
    const memberCount = await OrgMember.countDocuments({ org_id: orgId, status: 'active' });

    if (memberCount >= threshold) {
        org.approvalStatus = 'approved';
        org.approvedAt = new Date();
        org.approvedBy = null; // Auto-approved, not by a user
        await org.save();
        return true;
    }

    return false;
}

module.exports = {
    checkAndAutoApproveOrg
};
