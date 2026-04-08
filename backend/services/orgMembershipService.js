const getModels = require('./getModelService');

/**
 * @param {import('mongoose').Document} member
 * @param {object} partial
 */
function pushMemberHistory(member, partial) {
    if (!member.membershipHistory) {
        member.membershipHistory = [];
    }
    member.membershipHistory.push({
        at: new Date(),
        ...partial
    });
}

async function recordMemberJoined(member, actorUserId, reason = '') {
    pushMemberHistory(member, {
        action: 'joined',
        toStatus: member.status,
        role: member.role,
        actorUserId,
        reason
    });
    await member.save();
}

async function recordMemberRemoved(req, { org_id, user_id, actorUserId, reason = '' }) {
    const { OrgMembershipAudit } = getModels(req, 'OrgMembershipAudit');
    await OrgMembershipAudit.create({
        org_id,
        user_id,
        action: 'removed',
        actorUserId,
        reason,
        at: new Date()
    });
}

async function recordStatusChange(member, { fromStatus, toStatus, actorUserId, reason = '' }) {
    pushMemberHistory(member, {
        action: 'status_change',
        fromStatus,
        toStatus,
        actorUserId,
        reason
    });
    await member.save();
}

module.exports = {
    pushMemberHistory,
    recordMemberJoined,
    recordMemberRemoved,
    recordStatusChange
};
