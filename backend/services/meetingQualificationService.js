const getModels = require('./getModelService');

/**
 * Compute whether a member meets qualification rules based on meeting attendance.
 * @param {Object} req - Request object
 * @param {string} orgId - Organization ID
 * @param {string} userId - User ID
 * @param {Object} qualificationRules - { minAttendance: Number, meetingTypes: [String] }
 * @returns {Promise<{ qualified: boolean, attendedCount: number, requiredCount: number }>}
 */
async function computeMemberQualificationStatus(req, orgId, userId, qualificationRules = {}) {
    const { Event, MeetingConfig } = getModels(req, 'Event', 'MeetingConfig');

    const requiredCount = qualificationRules.minAttendance || 0;
    const meetingTypes = (qualificationRules.meetingTypes && qualificationRules.meetingTypes.length)
        ? qualificationRules.meetingTypes
        : ['gbm', 'officer', 'one-time'];

    const configs = await MeetingConfig.find({
        meetingType: { $in: meetingTypes }
    }).select('eventId').lean();
    const eventIds = configs.map((c) => c.eventId);

    const attendedCount = await Event.countDocuments({
        _id: { $in: eventIds },
        hostingId: orgId,
        hostingType: 'Org',
        isDeleted: false,
        'attendees.userId': userId,
        'attendees.attendanceStatus': 'present'
    });

    return {
        qualified: attendedCount >= requiredCount,
        attendedCount,
        requiredCount
    };
}

/**
 * Compute qualification status for multiple members.
 * @param {Object} req - Request object
 * @param {string} orgId - Organization ID
 * @param {string[]} userIds - User IDs
 * @param {Object} qualificationRules - { minAttendance, meetingTypes }
 * @returns {Promise<Object>} Map of userId -> { qualified, attendedCount, requiredCount }
 */
async function computeBulkQualificationStatus(req, orgId, userIds, qualificationRules = {}) {
    const results = {};
    for (const userId of userIds) {
        results[userId] = await computeMemberQualificationStatus(req, orgId, userId, qualificationRules);
    }
    return results;
}

module.exports = {
    computeMemberQualificationStatus,
    computeBulkQualificationStatus
};
