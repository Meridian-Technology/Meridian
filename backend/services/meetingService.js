const getModels = require('./getModelService');
const { ORG_PERMISSIONS } = require('../constants/permissions');

/**
 * Resolve required attendees for a meeting based on requiredRoles.
 * @param {Object} req - Request object (for getModels)
 * @param {string} orgId - Organization ID
 * @param {string[]} requiredRoles - ['members', 'officers'] or custom org role/position IDs
 * @returns {Promise<Array<{userId: ObjectId}>>} List of user IDs who are required attendees
 */
async function resolveRequiredAttendees(req, orgId, requiredRoles = []) {
    const { OrgMember, Org } = getModels(req, 'OrgMember', 'Org');

    if (!requiredRoles || requiredRoles.length === 0) {
        return [];
    }

    const org = await Org.findById(orgId).lean();
    if (!org) return [];

    const activeMembers = await OrgMember.find({
        org_id: orgId,
        status: 'active'
    }).populate('user_id', '_id').lean();

    const userIdSet = new Set();
    const wantsMembers = requiredRoles.includes('members');
    const wantsOfficers = requiredRoles.includes('officers');

    for (const member of activeMembers) {
        const userId = member.user_id?._id || member.user_id;
        if (!userId) continue;

        const roleName = member.role;
        const position = org.positions?.find((p) => p.name === roleName || p._id?.toString() === roleName);
        const isOfficer = position?.canManageEvents || member.customPermissions?.includes(ORG_PERMISSIONS.MANAGE_EVENTS);

        if (wantsMembers) {
            userIdSet.add(userId.toString());
        }
        if (wantsOfficers && isOfficer) {
            userIdSet.add(userId.toString());
        }
        for (const reqRole of requiredRoles) {
            if (reqRole === 'members' || reqRole === 'officers') continue;
            if (reqRole === roleName || (position && position._id?.toString() === reqRole)) {
                userIdSet.add(userId.toString());
                break;
            }
        }
    }

    return Array.from(userIdSet).map((id) => ({ userId: id }));
}

/**
 * Check if an event is a meeting (has MeetingConfig or type === 'meeting').
 * @param {Object} event - Event document
 * @param {Object} meetingConfig - Optional pre-fetched MeetingConfig
 * @returns {boolean}
 */
function isMeetingEvent(event, meetingConfig = null) {
    if (meetingConfig) return true;
    return event?.type === 'meeting' || event?.customFields?.isMeeting === true;
}

module.exports = {
    resolveRequiredAttendees,
    isMeetingEvent
};
